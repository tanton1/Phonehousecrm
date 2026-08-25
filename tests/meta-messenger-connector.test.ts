import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  metaConversationDocumentId,
  metaMessageDocumentId,
  normalizeMetaWebhookMessages,
  verifyMetaWebhookSignature,
  verifyMetaWebhookToken
} from '../server/services/metaMessengerService';

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

  it('uses deterministic Page-scoped document identifiers', () => {
    expect(metaConversationDocumentId('PAGE', 'PSID')).toBe(metaConversationDocumentId('PAGE', 'PSID'));
    expect(metaMessageDocumentId('PAGE', 'MID_1')).not.toBe(metaMessageDocumentId('PAGE', 'MID_2'));
  });
});
