import { createHash } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getStoredZaloOaConnection,
  saveManualZaloConnection,
  zaloConnectionDocumentId
} from '../server/services/channelConnectionService';
import {
  ensureZaloAccessToken,
  normalizeZaloWebhookMessage,
  processZaloOaWebhook,
  verifyZaloWebhookSignature,
  zaloConversationDocumentId,
  zaloMessageDocumentId
} from '../server/services/zaloOaService';

function zaloDb(seed: Record<string, Record<string, any>>) {
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

describe('Zalo OA direct connector', () => {
  it('validates X-ZEvent-Signature against the exact webhook bytes', () => {
    const payload = { app_id: 'APP_1', timestamp: '1787640000000', event_name: 'user_send_text' };
    const raw = Buffer.from(JSON.stringify(payload));
    const secret = 'OA_SECRET';
    const mac = createHash('sha256').update(`${payload.app_id}${raw.toString('utf8')}${payload.timestamp}${secret}`).digest('hex');
    expect(verifyZaloWebhookSignature(raw, payload, `mac=${mac}`, secret)).toBe(true);
    expect(verifyZaloWebhookSignature(Buffer.from('{}'), payload, `mac=${mac}`, secret)).toBe(false);
  });

  it('normalizes inbound and outbound Zalo text using one customer conversation', () => {
    const inbound = normalizeZaloWebhookMessage({
      app_id: 'APP_1', event_name: 'user_send_text', timestamp: '1787640000000',
      sender: { id: 'USER_1', display_name: 'Tấn' }, recipient: { id: 'OA_1' },
      message: { msg_id: 'MSG_IN', text: 'Shop còn máy không?' }
    });
    const outbound = normalizeZaloWebhookMessage({
      app_id: 'APP_1', event_name: 'oa_send_text', timestamp: '1787640001000',
      sender: { id: 'OA_1' }, recipient: { id: 'USER_1' },
      message: { msg_id: 'MSG_OUT', text: 'Dạ còn ạ.' }
    });
    expect(inbound).toMatchObject({ oaId: 'OA_1', customerId: 'USER_1', sender: 'CUSTOMER', content: 'Shop còn máy không?' });
    expect(outbound).toMatchObject({ oaId: 'OA_1', customerId: 'USER_1', sender: 'STAFF', content: 'Dạ còn ạ.' });
  });

  it('encrypts OA credentials and only counts a retried webhook once', async () => {
    process.env.CHANNEL_TOKEN_ENCRYPTION_KEY = 'phonehouse-zalo-encryption-key-2026';
    const { db, store } = zaloDb({ branches: { BR_PH: { name: 'PhoneHouse', isActive: true } } });
    await saveManualZaloConnection(db, {
      oaId: '388613280879808645', oaName: 'PhoneHouse Zalo', accessToken: 'ACCESS_SECRET',
      refreshToken: 'REFRESH_SECRET', appId: 'APP_1', appSecret: 'APP_SECRET', webhookSecret: 'OA_SECRET',
      branchId: 'BR_PH'
    }, { uid: 'ADMIN_1', role: 'ADMIN', name: 'Admin' });

    const stored = store.channelConnections[zaloConnectionDocumentId('388613280879808645')];
    expect(stored).toMatchObject({ provider: 'ZALO_OA', branchId: 'BR_PH', hasToken: true, hasRefreshToken: true });
    expect(JSON.stringify(stored)).not.toContain('ACCESS_SECRET');
    expect(JSON.stringify(stored)).not.toContain('REFRESH_SECRET');
    expect(JSON.stringify(stored)).not.toContain('OA_SECRET');
    expect(await getStoredZaloOaConnection(db, '388613280879808645')).toMatchObject({ accessToken: 'ACCESS_SECRET', refreshToken: 'REFRESH_SECRET', webhookSecret: 'OA_SECRET' });

    const payload = {
      app_id: 'APP_1', event_name: 'user_send_text', timestamp: '1787640000000',
      sender: { id: 'USER_RETRY' }, recipient: { id: '388613280879808645' },
      message: { msg_id: 'MSG_RETRY', text: 'Chỉ tính một lần' }
    };
    expect(await processZaloOaWebhook(db, payload)).toMatchObject({ processed: 1, duplicates: 0 });
    expect(await processZaloOaWebhook(db, payload)).toMatchObject({ processed: 0, duplicates: 1 });
    const conversationId = zaloConversationDocumentId('388613280879808645', 'USER_RETRY');
    expect(store.chatConversations[conversationId]).toMatchObject({ provider: 'ZALO_OA', channel: 'ZALO', branchId: 'BR_PH', unreadCount: 1 });
    expect(store.chatMessages[zaloMessageDocumentId('388613280879808645', 'MSG_RETRY')]).toMatchObject({ conversationId, sender: 'CUSTOMER' });
  });

  it('rotates a one-time refresh token and stores both replacements atomically', async () => {
    process.env.CHANNEL_TOKEN_ENCRYPTION_KEY = 'phonehouse-zalo-encryption-key-2026';
    const { db, store } = zaloDb({ branches: { BR_PH: { name: 'PhoneHouse', isActive: true } } });
    await saveManualZaloConnection(db, {
      oaId: '388613280879808646', accessToken: 'OLD_ACCESS', refreshToken: 'OLD_REFRESH',
      appId: 'APP_1', appSecret: 'APP_SECRET', webhookSecret: 'OA_SECRET', branchId: 'BR_PH'
    }, { uid: 'ADMIN_1', role: 'ADMIN' });
    store.channelConnections[zaloConnectionDocumentId('388613280879808646')].accessTokenExpiresAt = Timestamp.fromMillis(1);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      access_token: 'NEW_ACCESS', refresh_token: 'NEW_REFRESH', expires_in: '90000'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    expect(await ensureZaloAccessToken(db, '388613280879808646')).toBe('NEW_ACCESS');
    const resolved = await getStoredZaloOaConnection(db, '388613280879808646');
    expect(resolved).toMatchObject({ accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH' });
    expect(JSON.stringify(store.channelConnections[zaloConnectionDocumentId('388613280879808646')])).not.toContain('NEW_ACCESS');
  });
});
