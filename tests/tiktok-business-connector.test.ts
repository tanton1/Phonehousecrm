import { createHmac } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getStoredTikTokBusinessConnection,
  saveManualTikTokConnection,
  tiktokConnectionDocumentId
} from '../server/services/channelConnectionService';
import {
  normalizeTikTokWebhookMessage,
  ensureTikTokAccessToken,
  processTikTokBusinessWebhook,
  tiktokConversationDocumentId,
  tiktokMessageDocumentId,
  verifyTikTokWebhookSignature
} from '../server/services/tiktokBusinessService';

function tiktokDb(seed: Record<string, Record<string, any>>) {
  const store = Object.fromEntries(Object.entries(seed).map(([name, value]) => [name, { ...value }])) as Record<string, Record<string, any>>;
  let counter = 0;
  const snapshot = (collectionName: string, id: string) => ({
    id,
    exists: Boolean(store[collectionName]?.[id]),
    data: () => store[collectionName]?.[id]
  });
  const ref = (collectionName: string, id: string) => ({
    id,
    collectionName,
    async get() { return snapshot(collectionName, id); },
    async set(value: Record<string, any>, options?: { merge?: boolean }) {
      store[collectionName] ||= {};
      store[collectionName][id] = options?.merge ? { ...(store[collectionName][id] || {}), ...value } : value;
    }
  });
  const db: any = {
    collection(collectionName: string) {
      store[collectionName] ||= {};
      return { doc(id?: string) { return ref(collectionName, id || `AUTO_${++counter}`); } };
    },
    batch() {
      const writes: Array<() => void> = [];
      return {
        set(documentRef: any, value: Record<string, any>, options?: { merge?: boolean }) {
          writes.push(() => {
            store[documentRef.collectionName] ||= {};
            store[documentRef.collectionName][documentRef.id] = options?.merge
              ? { ...(store[documentRef.collectionName][documentRef.id] || {}), ...value }
              : value;
          });
        },
        async commit() { writes.forEach(write => write()); }
      };
    },
    async runTransaction(handler: (transaction: any) => Promise<any>) {
      return handler({
        async get(documentRef: any) { return snapshot(documentRef.collectionName, documentRef.id); },
        set(documentRef: any, value: Record<string, any>, options?: { merge?: boolean }) {
          store[documentRef.collectionName] ||= {};
          store[documentRef.collectionName][documentRef.id] = options?.merge
            ? { ...(store[documentRef.collectionName][documentRef.id] || {}), ...value }
            : value;
        },
        create(documentRef: any, value: Record<string, any>) {
          store[documentRef.collectionName] ||= {};
          if (store[documentRef.collectionName][documentRef.id]) throw new Error('ALREADY_EXISTS');
          store[documentRef.collectionName][documentRef.id] = value;
        }
      });
    }
  };
  return { db, store };
}

const originalEncryptionKey = process.env.CHANNEL_TOKEN_ENCRYPTION_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalEncryptionKey === undefined) delete process.env.CHANNEL_TOKEN_ENCRYPTION_KEY;
  else process.env.CHANNEL_TOKEN_ENCRYPTION_KEY = originalEncryptionKey;
});

describe('TikTok Business Messaging connector', () => {
  it('verifies HMAC-SHA256 signature and rejects a stale delivery', () => {
    const now = 1_787_640_000_000;
    const timestamp = String(Math.floor(now / 1000));
    const raw = Buffer.from(JSON.stringify({ event: 'im_receive_msg', user_openid: 'BUSINESS_1' }));
    const secret = 'TIKTOK_APP_SECRET';
    const signature = createHmac('sha256', secret).update(`${timestamp}.${raw.toString('utf8')}`).digest('hex');
    expect(verifyTikTokWebhookSignature(raw, `t=${timestamp},s=${signature}`, secret, now)).toBe(true);
    expect(verifyTikTokWebhookSignature(raw, `t=${timestamp},s=${signature}`, secret, now + 10 * 60 * 1000)).toBe(false);
    expect(verifyTikTokWebhookSignature(Buffer.from('{}'), `t=${timestamp},s=${signature}`, secret, now)).toBe(false);
  });

  it('normalizes inbound and outbound text to the same TikTok customer', () => {
    const inbound = normalizeTikTokWebhookMessage({
      event: 'im_receive_msg', user_openid: 'BUSINESS_1', create_time: 1_787_640_000,
      content: JSON.stringify({
        conversation_id: 'CONV_1', message_id: 'MSG_IN', timestamp: 1_787_640_000,
        from_user: { id: 'CUSTOMER_1', display_name: 'Tấn' },
        to_user: { id: 'BUSINESS_1' }, text: { body: 'Shop còn máy không?' }, type: 'TEXT'
      })
    });
    const outbound = normalizeTikTokWebhookMessage({
      event: 'im_send_msg', user_openid: 'BUSINESS_1', create_time: 1_787_640_001,
      content: JSON.stringify({
        conversation_id: 'CONV_1', message_id: 'MSG_OUT', timestamp: 1_787_640_001,
        from_user: { id: 'BUSINESS_1' }, to_user: { id: 'CUSTOMER_1', display_name: 'Tấn' },
        text: { body: 'Dạ còn ạ.' }, type: 'TEXT'
      })
    });
    expect(inbound).toMatchObject({ businessId: 'BUSINESS_1', customerId: 'CUSTOMER_1', externalConversationId: 'CONV_1', sender: 'CUSTOMER', content: 'Shop còn máy không?' });
    expect(outbound).toMatchObject({ businessId: 'BUSINESS_1', customerId: 'CUSTOMER_1', externalConversationId: 'CONV_1', sender: 'STAFF', content: 'Dạ còn ạ.' });
  });

  it('encrypts credentials and persists a retried realtime message once', async () => {
    process.env.CHANNEL_TOKEN_ENCRYPTION_KEY = 'phonehouse-tiktok-encryption-key-2026';
    const { db, store } = tiktokDb({ branches: { BR_PH: { name: 'PhoneHouse', isActive: true } } });
    await saveManualTikTokConnection(db, {
      businessId: 'BUSINESS_12345', displayName: 'PhoneHouse TikTok', accessToken: 'ACCESS_SECRET',
      refreshToken: 'REFRESH_SECRET', appId: 'APP_1', appSecret: 'APP_SECRET', branchId: 'BR_PH'
    }, { uid: 'ADMIN_1', role: 'ADMIN', name: 'Admin' });

    const stored = store.channelConnections[tiktokConnectionDocumentId('BUSINESS_12345')];
    expect(stored).toMatchObject({ provider: 'TIKTOK_BUSINESS', branchId: 'BR_PH', hasToken: true, hasRefreshToken: true });
    expect(JSON.stringify(stored)).not.toContain('ACCESS_SECRET');
    expect(JSON.stringify(stored)).not.toContain('REFRESH_SECRET');
    expect(JSON.stringify(stored)).not.toContain('APP_SECRET');
    expect(await getStoredTikTokBusinessConnection(db, 'BUSINESS_12345')).toMatchObject({
      accessToken: 'ACCESS_SECRET', refreshToken: 'REFRESH_SECRET', appSecret: 'APP_SECRET'
    });

    const payload = {
      event: 'im_receive_msg', user_openid: 'BUSINESS_12345', create_time: 1_787_640_000,
      content: JSON.stringify({
        conversation_id: 'CONV_RETRY', message_id: 'MSG_RETRY', timestamp: 1_787_640_000,
        from_user: { id: 'CUSTOMER_RETRY', display_name: 'Khách TikTok' },
        to_user: { id: 'BUSINESS_12345' }, text: { body: 'Chỉ tính một lần' }, type: 'TEXT'
      })
    };
    expect(await processTikTokBusinessWebhook(db, payload)).toMatchObject({ processed: 1, duplicates: 0 });
    expect(await processTikTokBusinessWebhook(db, payload)).toMatchObject({ processed: 0, duplicates: 1 });
    const conversationId = tiktokConversationDocumentId('BUSINESS_12345', 'CUSTOMER_RETRY');
    expect(store.chatConversations[conversationId]).toMatchObject({ provider: 'TIKTOK_BUSINESS', channel: 'TIKTOK', branchId: 'BR_PH', unreadCount: 1 });
    expect(store.chatMessages[tiktokMessageDocumentId('BUSINESS_12345', 'MSG_RETRY')]).toMatchObject({ conversationId, sender: 'CUSTOMER' });
  });

  it('refreshes the one-day access token and stores the replacement encrypted', async () => {
    process.env.CHANNEL_TOKEN_ENCRYPTION_KEY = 'phonehouse-tiktok-encryption-key-2026';
    const { db, store } = tiktokDb({ branches: { BR_PH: { name: 'PhoneHouse', isActive: true } } });
    await saveManualTikTokConnection(db, {
      businessId: 'BUSINESS_REFRESH', accessToken: 'OLD_ACCESS', refreshToken: 'OLD_REFRESH',
      appId: 'APP_1', appSecret: 'APP_SECRET', branchId: 'BR_PH'
    }, { uid: 'ADMIN_1', role: 'ADMIN' });
    store.channelConnections[tiktokConnectionDocumentId('BUSINESS_REFRESH')].accessTokenExpiresAt = Timestamp.fromMillis(1);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      message: 'OK',
      data: {
        access_token: 'NEW_ACCESS', refresh_token: 'NEW_REFRESH', expires_in: 86400,
        refresh_token_expires_in: 31536000, open_id: 'BUSINESS_REFRESH'
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    expect(await ensureTikTokAccessToken(db, 'BUSINESS_REFRESH')).toBe('NEW_ACCESS');
    expect(await getStoredTikTokBusinessConnection(db, 'BUSINESS_REFRESH')).toMatchObject({
      accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH'
    });
    expect(JSON.stringify(store.channelConnections[tiktokConnectionDocumentId('BUSINESS_REFRESH')])).not.toContain('NEW_ACCESS');
  });
});
