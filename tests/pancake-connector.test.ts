import { describe, expect, it } from 'vitest';
import {
  getPancakePageConfigs,
  identifyPancakeWebhookPageId,
  normalizePancakeConversation,
  normalizePancakeMessage,
  normalizePancakeWebhook,
  pancakeConversationDocumentId,
  pancakeMessageDocumentId,
  verifyPancakeWebhookSecret
} from '../server/services/pancakeService';

describe('Pancake connector', () => {
  it('loads the configured PhoneHouse page without exposing a client token', () => {
    const configs = getPancakePageConfigs({
      PANCAKE_PAGE_ID: '332799593244601',
      PANCAKE_PAGE_NAME: 'phonehousech109',
      PANCAKE_BRANCH_NAME: 'Phonehouse',
      PANCAKE_HISTORY_DAYS: '30',
      PANCAKE_INCLUDE_COMMENTS: 'true',
      PANCAKE_PAGE_ACCESS_TOKEN: 'page-secret'
    } as NodeJS.ProcessEnv);

    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({
      pageId: '332799593244601',
      pageName: 'phonehousech109',
      branchName: 'Phonehouse',
      historyDays: 30,
      includeComments: true,
      pageAccessToken: 'page-secret'
    });
  });

  it('normalizes a Pancake conversation and preserves comment classification', () => {
    const conversation = normalizePancakeConversation({
      id: 'conv-01',
      page_id: '332799593244601',
      page_type: 'Facebook',
      type: 'COMMENT',
      page_customer: { name: 'Anh Tân', phone_number: '0905 000 001' },
      last_message: { id: 'comment-01', text: 'Máy này còn không shop?', created_at: 1_787_563_000 },
      unread_count: 2
    }, { pageId: '332799593244601', pageName: 'phonehousech109' });

    expect(conversation).toMatchObject({
      externalConversationId: 'conv-01',
      channel: 'FACEBOOK',
      conversationType: 'COMMENT',
      customerName: 'Anh Tân',
      customerPhone: '0905000001',
      unreadCount: 2,
      lastMessageSnippet: 'Máy này còn không shop?'
    });
  });

  it('distinguishes customer and page messages', () => {
    const customer = normalizePancakeMessage({
      id: 'msg-customer',
      text: 'Shop tư vấn giúp em',
      from: { id: 'customer-1', name: 'Khách' },
      created_at: '2026-08-24T08:00:00.000Z'
    }, '332799593244601');
    const staff = normalizePancakeMessage({
      id: 'msg-page',
      text: 'Dạ PhoneHouse xin chào',
      from: { id: '332799593244601', name: 'PhoneHouse' },
      created_at: '2026-08-24T08:01:00.000Z'
    }, '332799593244601');

    expect(customer?.sender).toBe('CUSTOMER');
    expect(staff?.sender).toBe('STAFF');
  });

  it('normalizes webhook payloads and creates deterministic Firestore ids', () => {
    const config = getPancakePageConfigs({
      PANCAKE_PAGE_ID: '332799593244601',
      PANCAKE_PAGE_ACCESS_TOKEN: 'token'
    } as NodeJS.ProcessEnv)[0];
    const payload = {
      event: 'message_created',
      page_id: '332799593244601',
      conversation_id: 'conv-100',
      channel: 'facebook',
      customer: { id: 'customer-100', name: 'Chị Mai', phone: '0912.345.678' },
      message: {
        id: 'msg-100',
        text: 'Cho chị xin giá iPhone 15 Pro Max',
        from: { id: 'customer-100', name: 'Chị Mai' },
        created_at: '2026-08-24T09:00:00.000Z'
      }
    };
    const normalized = normalizePancakeWebhook(payload, config);

    expect(identifyPancakeWebhookPageId(payload)).toBe('332799593244601');
    expect(normalized?.conversation.externalConversationId).toBe('conv-100');
    expect(normalized?.message.externalMessageId).toBe('msg-100');
    expect(normalized?.message.sender).toBe('CUSTOMER');
    expect(pancakeConversationDocumentId(config.pageId, 'conv-100')).toBe(pancakeConversationDocumentId(config.pageId, 'conv-100'));
    expect(pancakeMessageDocumentId(config.pageId, 'conv-100', 'msg-100')).not.toBe(pancakeMessageDocumentId(config.pageId, 'conv-100', 'msg-101'));
  });

  it('validates webhook secrets without accepting empty or partial values', () => {
    expect(verifyPancakeWebhookSecret('secret-123', 'secret-123')).toBe(true);
    expect(verifyPancakeWebhookSecret('secret', 'secret-123')).toBe(false);
    expect(verifyPancakeWebhookSecret('', '')).toBe(false);
  });
});
