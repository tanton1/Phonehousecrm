import { describe, expect, it } from 'vitest';
import {
  getPancakePageConfigs,
  getPancakeChatSummary,
  identifyPancakeWebhookPageId,
  normalizePancakeConversation,
  normalizePancakeMessage,
  normalizePancakeWebhook,
  pancakeConversationDocumentId,
  pancakeMessageDocumentId,
  resolvePancakeBranch,
  setPancakeBranchMapping,
  verifyPancakeWebhookSecret
} from '../server/services/pancakeService';

function branchDb(
  branches: Record<string, any>,
  warehouses: Record<string, any> = {},
  mappings: Record<string, any> = {}
) {
  const docs = (values: Record<string, any>) => Object.entries(values).map(([id, value]) => ({
    id,
    data: () => value
  }));
  return {
    collection(name: string) {
      const values = name === 'branches' ? branches : name === 'warehouses' ? warehouses : name === 'pancakePageMappings' ? mappings : {};
      return {
        doc(id: string) {
          return {
            async get() {
              return { id, exists: Boolean(values[id]), data: () => values[id] };
            },
            async set(value: Record<string, any>, options?: { merge?: boolean }) {
              values[id] = options?.merge ? { ...(values[id] || {}), ...value } : value;
            }
          };
        },
        limit() {
          return { async get() { return { docs: docs(values) }; } };
        }
      };
    }
  } as any;
}

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

  it('matches Phonehouse with a branch name containing a space', async () => {
    const config = getPancakePageConfigs({
      PANCAKE_BRANCH_NAME: 'Phonehouse',
      PANCAKE_PAGE_ACCESS_TOKEN: 'token'
    } as NodeJS.ProcessEnv)[0];
    const branch = await resolvePancakeBranch(branchDb({
      'BR-PHONE-HOUSE': { name: 'Phone House', code: 'CN-02', isActive: true }
    }), config);

    expect(branch).toEqual({ id: 'BR-PHONE-HOUSE', name: 'Phone House' });
  });

  it('resolves a legacy address-named branch through its PhoneHouse warehouse', async () => {
    const config = getPancakePageConfigs({
      PANCAKE_BRANCH_NAME: 'Phonehouse',
      PANCAKE_PAGE_ACCESS_TOKEN: 'token'
    } as NodeJS.ProcessEnv)[0];
    const branch = await resolvePancakeBranch(branchDb({
      'BR-HAI-CHAU': { name: 'Cửa hàng Hải Châu', code: 'CN-02', isActive: true }
    }, {
      'KHO-PHONEHOUSE': { name: 'Kho bán lẻ', systemType: 'PHONEHOUSE', branchId: 'BR-HAI-CHAU', isActive: true }
    }), config);

    expect(branch).toEqual({ id: 'BR-HAI-CHAU', name: 'Cửa hàng Hải Châu' });
  });

  it('does not guess when multiple PhoneHouse branches match', async () => {
    const config = getPancakePageConfigs({
      PANCAKE_BRANCH_NAME: 'Phonehouse',
      PANCAKE_PAGE_ACCESS_TOKEN: 'token'
    } as NodeJS.ProcessEnv)[0];

    await expect(resolvePancakeBranch(branchDb({
      BR_01: { name: 'Phone House Hải Châu', isActive: true },
      BR_02: { name: 'PhoneHouse Huế', isActive: true }
    }), config)).rejects.toThrow('PANCAKE_BRANCH_AMBIGUOUS');
  });

  it('stores and reuses the selected CRM branch id for the Pancake page', async () => {
    const mappings: Record<string, any> = {};
    const db = branchDb({
      'BR-PHONEHOUSE': { name: 'Cửa hàng 109', code: 'CN-109', isActive: true }
    }, {}, mappings);

    const linked = await setPancakeBranchMapping(db, {
      pageId: '332799593244601',
      branchId: 'BR-PHONEHOUSE'
    }, {
      uid: 'ADMIN-01',
      role: 'ADMIN',
      name: 'Quản trị viên'
    });

    expect(linked).toMatchObject({
      pageId: '332799593244601',
      branchId: 'BR-PHONEHOUSE',
      branchName: 'Cửa hàng 109'
    });
    expect(mappings['332799593244601']).toMatchObject({
      branchId: 'BR-PHONEHOUSE',
      branchName: 'Cửa hàng 109',
      branchCode: 'CN-109',
      isActive: true
    });

    const config = getPancakePageConfigs({
      PANCAKE_BRANCH_NAME: 'Tên không còn dùng để dò',
      PANCAKE_PAGE_ACCESS_TOKEN: 'token'
    } as NodeJS.ProcessEnv)[0];
    await expect(resolvePancakeBranch(db, config)).resolves.toEqual({
      id: 'BR-PHONEHOUSE',
      name: 'Cửa hàng 109'
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

  it('reads Pancake text stored directly in the message field', () => {
    const message = normalizePancakeMessage({
      id: 'msg-string-body',
      message: 'Dạ em cần tư vấn iPhone 15 Pro Max',
      from: { id: 'customer-15', name: 'Chị An' },
      created_time: '2026-08-24T15:30:00.000Z'
    }, '332799593244601');

    expect(message).toMatchObject({
      externalMessageId: 'msg-string-body',
      content: 'Dạ em cần tư vấn iPhone 15 Pro Max',
      sender: 'CUSTOMER',
      senderName: 'Chị An',
      timestamp: '2026-08-24T15:30:00.000Z'
    });
  });

  it('reads nested data messages and attachment-only messages', () => {
    const nested = normalizePancakeMessage({
      id: 'msg-nested-data',
      data: {
        message: 'Cho em xin địa chỉ shop',
        sender: { id: 'customer-16', name: 'Anh Bình' },
        created_time: 1_787_589_600
      }
    }, '332799593244601');
    const attachmentOnly = normalizePancakeMessage({
      id: 'msg-photo',
      from: { id: 'customer-17', name: 'Chị Hà' },
      attachments: [{ payload: { image: { full_url: 'https://cdn.example.com/photo.jpg' } } }],
      created_time: '2026-08-24T16:00:00.000Z'
    }, '332799593244601');

    expect(nested?.content).toBe('Cho em xin địa chỉ shop');
    expect(nested?.senderName).toBe('Anh Bình');
    expect(attachmentOnly?.content).toBe('Đã gửi tệp đính kèm');
    expect(attachmentOnly?.attachments).toEqual(['https://cdn.example.com/photo.jpg']);
  });

  it('does not create empty bubbles for unsupported Pancake events', () => {
    expect(normalizePancakeMessage({
      id: 'read-receipt-01',
      type: 'read_receipt',
      created_time: '2026-08-24T16:05:00.000Z'
    }, '332799593244601')).toBeNull();
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

  it('normalizes the official Pancake messaging webhook payload', () => {
    const config = getPancakePageConfigs({
      PANCAKE_PAGE_ID: '332799593244601',
      PANCAKE_PAGE_ACCESS_TOKEN: 'token'
    } as NodeJS.ProcessEnv)[0];
    const normalized = normalizePancakeWebhook({
      page_id: '332799593244601',
      event_type: 'messaging',
      data: {
        conversation: {
          id: 'official-conv-01',
          from: { id: 'customer-official', name: 'Anh Nam' },
          snippet: 'Shop còn máy không?',
          type: 'INBOX',
          seen: false
        },
        message: {
          id: 'official-msg-01',
          conversation_id: 'official-conv-01',
          page_id: '332799593244601',
          message: 'Shop còn máy không?',
          original_message: 'Shop còn máy không?',
          type: 'INBOX',
          inserted_at: '2026-08-24T16:30:00.000Z',
          from: { id: 'customer-official', name: 'Anh Nam' },
          attachments: []
        }
      }
    }, config);

    expect(normalized?.conversation).toMatchObject({
      externalConversationId: 'official-conv-01',
      conversationType: 'INBOX',
      customerName: 'Anh Nam'
    });
    expect(normalized?.message).toMatchObject({
      externalMessageId: 'official-msg-01',
      content: 'Shop còn máy không?',
      sender: 'CUSTOMER',
      timestamp: '2026-08-24T16:30:00.000Z'
    });
  });

  it('validates webhook secrets without accepting empty or partial values', () => {
    expect(verifyPancakeWebhookSecret('secret-123', 'secret-123')).toBe(true);
    expect(verifyPancakeWebhookSecret('secret', 'secret-123')).toBe(false);
    expect(verifyPancakeWebhookSecret('', '')).toBe(false);
  });

  it('summarizes assignment, SLA and conversion without counting closed chats as pending', async () => {
    const now = Date.now();
    const conversations = [
      {
        branchId: 'BR-PH',
        updatedAt: new Date(now - 60_000).toISOString(),
        workflowStatus: 'OPEN',
        awaitingStaffReply: true,
        firstResponseDueAt: new Date(now - 5 * 60_000).toISOString()
      },
      {
        branchId: 'BR-PH',
        updatedAt: new Date(now - 120_000).toISOString(),
        workflowStatus: 'WON',
        assignedStaffId: 'STAFF-1',
        assignedStaffName: 'CSKH Mai',
        firstResponseAt: new Date(now - 100_000).toISOString(),
        firstResponseSeconds: 120,
        slaMet: true
      },
      {
        branchId: 'BR-PH',
        updatedAt: new Date(now - 180_000).toISOString(),
        workflowStatus: 'LOST',
        assignedStaffId: 'STAFF-1',
        assignedStaffName: 'CSKH Mai',
        firstResponseAt: new Date(now - 150_000).toISOString(),
        firstResponseSeconds: 300,
        slaMet: false
      }
    ];
    const docs = conversations.map((data, index) => ({ id: `CONV-${index + 1}`, data: () => data }));
    const query: any = {
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      get: async () => ({ docs, size: docs.length })
    };
    const db = { collection: () => query } as any;

    const summary = await getPancakeChatSummary(db, 'BR-PH', { uid: 'ADMIN-1', role: 'ADMIN' }, 30);

    expect(summary).toMatchObject({
      total: 3,
      unassigned: 1,
      awaitingReply: 1,
      overdue: 2,
      won: 1,
      lost: 1,
      conversionRate: 50,
      slaMeasured: 2,
      slaMet: 1,
      slaRate: 50,
      averageFirstResponseSeconds: 210
    });
    expect(summary.byStaff[0]).toMatchObject({ staffId: 'STAFF-1', total: 2, won: 1, overdue: 1 });
  });
});
