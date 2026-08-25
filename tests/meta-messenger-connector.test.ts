import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  metaConversationDocumentId,
  metaMessageDocumentId,
  normalizeMetaFeedComments,
  normalizeMetaWebhookMessages,
  processMetaMessengerWebhook,
  verifyMetaWebhookSignature,
  verifyMetaWebhookToken
} from '../server/services/metaMessengerService';
import { metaConnectionDocumentId } from '../server/services/channelConnectionService';

function webhookDb(seed: Record<string, Record<string, any>>) {
  const store = Object.fromEntries(
    Object.entries(seed).map(([name, values]) => [name, { ...values }])
  ) as Record<string, Record<string, any>>;
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
      store[collectionName][id] = options?.merge
        ? { ...(store[collectionName][id] || {}), ...value }
        : value;
    }
  });
  const db: any = {
    collection(collectionName: string) {
      store[collectionName] ||= {};
      return { doc(id: string) { return ref(collectionName, id); } };
    },
    async runTransaction(handler: (transaction: any) => Promise<any>) {
      return handler({
        async get(documentRef: any) {
          return snapshot(documentRef.collectionName, documentRef.id);
        },
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

describe('Meta Messenger direct connector', () => {
  it('verifies the callback token without accepting a partial value', () => {
    expect(verifyMetaWebhookToken('verify-token-123', 'verify-token-123')).toBe(true);
    expect(verifyMetaWebhookToken('verify-token', 'verify-token-123')).toBe(false);
  });

  it('validates X-Hub-Signature-256 against the exact raw request bytes', () => {
    const rawBody = Buffer.from('{"object":"page","entry":[]}');
    const secret = 'meta-app-secret-123';
    const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    expect(verifyMetaWebhookSignature(rawBody, signature, secret)).toBe(true);
    expect(verifyMetaWebhookSignature(Buffer.from('{}'), signature, secret)).toBe(false);
  });

  it('normalizes an inbound text message using the customer PSID as the conversation key', () => {
    const messages = normalizeMetaWebhookMessages({
      object: 'page',
      entry: [{
        id: '332799593244601',
        messaging: [{
          sender: { id: 'CUSTOMER_PSID_1' },
          recipient: { id: '332799593244601' },
          timestamp: 1_787_640_000_000,
          message: { mid: 'm_in_1', text: 'Shop còn iPhone 15 Pro không?' }
        }]
      }]
    }, '332799593244601');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      customerPsid: 'CUSTOMER_PSID_1',
      externalConversationId: 'CUSTOMER_PSID_1',
      externalMessageId: 'm_in_1',
      sender: 'CUSTOMER',
      content: 'Shop còn iPhone 15 Pro không?'
    });
  });

  it('normalizes Page echoes as staff messages and keeps attachments visible', () => {
    const [message] = normalizeMetaWebhookMessages({
      object: 'page',
      entry: [{
        id: '332799593244601',
        messaging: [{
          sender: { id: '332799593244601' },
          recipient: { id: 'CUSTOMER_PSID_2' },
          timestamp: 1_787_640_100_000,
          message: {
            mid: 'm_echo_1',
            is_echo: true,
            attachments: [{ type: 'image', payload: { url: 'https://example.com/image.jpg' } }]
          }
        }]
      }]
    }, '332799593244601');
    expect(message).toMatchObject({
      customerPsid: 'CUSTOMER_PSID_2',
      sender: 'STAFF',
      content: 'Đã gửi hình ảnh',
      attachments: ['https://example.com/image.jpg']
    });
  });

  it('marks standby messages as controlled by another application', () => {
    const [message] = normalizeMetaWebhookMessages({
      object: 'page',
      entry: [{
        id: 'PAGE_STANDBY',
        standby: [{
          sender: { id: 'CUSTOMER_STANDBY' },
          recipient: { id: 'PAGE_STANDBY' },
          timestamp: 1_787_640_150_000,
          message: { mid: 'm_standby_1', text: 'Pancake đang giữ hội thoại này' }
        }]
      }]
    }, 'PAGE_STANDBY');
    expect(message).toMatchObject({
      sender: 'CUSTOMER',
      threadControlStatus: 'OTHER_APP',
      content: 'Pancake đang giữ hội thoại này'
    });
  });

  it('uses deterministic Page-scoped document identifiers', () => {
    expect(metaConversationDocumentId('PAGE', 'PSID')).toBe(metaConversationDocumentId('PAGE', 'PSID'));
    expect(metaMessageDocumentId('PAGE', 'MID_1')).not.toBe(metaMessageDocumentId('PAGE', 'MID_2'));
  });

  it('turns Page feed comment changes into linked comment conversations', () => {
    const [comment] = normalizeMetaFeedComments({
      object: 'page',
      entry: [{
        id: '332799593244601',
        time: 1_787_640_200,
        changes: [{
          field: 'feed',
          value: {
            item: 'comment',
            verb: 'add',
            post_id: '332799593244601_987',
            comment_id: 'comment_123',
            parent_id: '332799593244601_987',
            created_time: 1_787_640_200,
            message: 'Máy này còn hàng không?',
            from: { id: 'FACEBOOK_USER_1', name: 'Tấn Phong' }
          }
        }]
      }]
    }, '332799593244601');
    expect(comment).toMatchObject({
      externalConversationId: 'COMMENT:332799593244601_987:FACEBOOK_USER_1',
      externalMessageId: 'comment_123',
      conversationType: 'COMMENT',
      messageKind: 'COMMENT',
      customerName: 'Tấn Phong',
      postId: '332799593244601_987',
      parentCommentId: '332799593244601_987',
      content: 'Máy này còn hàng không?'
    });
  });

  it('persists an inbound event once and does not increase unread count on Meta retries', async () => {
    const previousPageId = process.env.META_PAGE_ID;
    const previousBranchId = process.env.META_BRANCH_ID;
    process.env.META_PAGE_ID = '332799593244601';
    process.env.META_BRANCH_ID = 'BR-PH';
    const { db, store } = webhookDb({
      branches: { 'BR-PH': { name: 'Phonehouse', isActive: true } }
    });
    const payload = {
      object: 'page',
      entry: [{
        id: '332799593244601',
        messaging: [{
          sender: { id: 'CUSTOMER_PSID_RETRY' },
          recipient: { id: '332799593244601' },
          timestamp: 1_787_640_300_000,
          message: { mid: 'm_retry_1', text: 'Tin nhắn chỉ được tính một lần' }
        }]
      }]
    };

    try {
      const first = await processMetaMessengerWebhook(db, payload);
      const replay = await processMetaMessengerWebhook(db, payload);
      const conversationId = metaConversationDocumentId('332799593244601', 'CUSTOMER_PSID_RETRY');
      const messageId = metaMessageDocumentId('332799593244601', 'm_retry_1');

      expect(first).toMatchObject({ processed: 1, duplicates: 0 });
      expect(replay).toMatchObject({ processed: 0, duplicates: 1 });
      expect(store.chatConversations[conversationId]).toMatchObject({
        provider: 'META_MESSENGER',
        branchId: 'BR-PH',
        unreadCount: 1,
        lastMessageSnippet: 'Tin nhắn chỉ được tính một lần'
      });
      expect(store.chatMessages[messageId]).toMatchObject({
        conversationId,
        sender: 'CUSTOMER',
        content: 'Tin nhắn chỉ được tính một lần'
      });
    } finally {
      if (previousPageId === undefined) delete process.env.META_PAGE_ID;
      else process.env.META_PAGE_ID = previousPageId;
      if (previousBranchId === undefined) delete process.env.META_BRANCH_ID;
      else process.env.META_BRANCH_ID = previousBranchId;
    }
  });

  it('routes one webhook payload from multiple Pages into their configured branches', async () => {
    const pageOne = 'PAGE_MULTI_1';
    const pageTwo = 'PAGE_MULTI_2';
    const { db, store } = webhookDb({
      branches: {
        'BR-PH': { name: 'PhoneHouse', isActive: true },
        'BR-XS': { name: 'XStore', isActive: true }
      },
      channelConnections: {
        [metaConnectionDocumentId(pageOne)]: {
          provider: 'META_MESSENGER', externalAccountId: pageOne, displayName: 'PhoneHouse Page',
          branchId: 'BR-PH', branchName: 'PhoneHouse', active: true
        },
        [metaConnectionDocumentId(pageTwo)]: {
          provider: 'META_MESSENGER', externalAccountId: pageTwo, displayName: 'XStore Page',
          branchId: 'BR-XS', branchName: 'XStore', active: true
        }
      }
    });
    const result = await processMetaMessengerWebhook(db, {
      object: 'page',
      entry: [
        { id: pageOne, messaging: [{ sender: { id: 'CUSTOMER_PH' }, recipient: { id: pageOne }, timestamp: 1_787_641_000_000, message: { mid: 'multi_ph', text: 'Tin PhoneHouse' } }] },
        { id: pageTwo, messaging: [{ sender: { id: 'CUSTOMER_XS' }, recipient: { id: pageTwo }, timestamp: 1_787_641_000_100, message: { mid: 'multi_xs', text: 'Tin XStore' } }] }
      ]
    });
    expect(result).toMatchObject({ processed: 2, duplicates: 0, ignoredPages: [] });
    expect(store.chatConversations[metaConversationDocumentId(pageOne, 'CUSTOMER_PH')].branchId).toBe('BR-PH');
    expect(store.chatConversations[metaConversationDocumentId(pageTwo, 'CUSTOMER_XS')].branchId).toBe('BR-XS');
    expect(store.channelConnections[metaConnectionDocumentId(pageOne)].webhookStatus).toBe('RECEIVING');
    expect(store.channelConnections[metaConnectionDocumentId(pageTwo)].webhookStatus).toBe('RECEIVING');
  });
});
