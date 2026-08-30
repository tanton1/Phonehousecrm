import { describe, expect, it } from 'vitest';
import { normalizeConversationExtraction, normalizeSalesSlipExtraction, parseAiCaptureJson } from '../server/routes/aiCapture';

describe('AI capture normalization', () => {
  it('parses fenced JSON and normalizes a sales slip without trusting unsafe values', () => {
    const parsed = parseAiCaptureJson('```json\n{"confidence":92,"customer":{"name":"  Chị An ","phone":"0901-22-33-44"},"items":[{"name":"iPhone 15","imei":"IMEI: 012345678901234","quantity":"2","unitPrice":"25.000.000 đ"}]}\n```', {});
    const extraction = normalizeSalesSlipExtraction(parsed);
    expect(extraction.sourceType).toBe('SALES_SLIP');
    expect(extraction.confidence).toBe(0.92);
    expect(extraction.customer).toEqual({ name: 'Chị An', phone: '0901-22-33-44' });
    expect(extraction.items[0]).toMatchObject({ name: 'iPhone 15', imei: '012345678901234', quantity: 2, unitPrice: 25_000_000 });
  });

  it('caps conversation transcript and keeps missing values reviewable', () => {
    const extraction = normalizeConversationExtraction({
      confidence: 0.4,
      transcript: 'x'.repeat(30_000),
      customer: { phone: 'abc0909123456' },
      nextActions: ['  Gọi lại khách  ', '', 'x'.repeat(500)]
    });
    expect(extraction.transcript).toHaveLength(20_000);
    expect(extraction.customer.phone).toBe('0909123456');
    expect(extraction.nextActions).toEqual(['Gọi lại khách', 'x'.repeat(300)]);
  });

  it('uses safe empty fallback when provider returns malformed JSON', () => {
    const fallback = { sourceType: 'SALES_SLIP', confidence: 0 };
    expect(parseAiCaptureJson('{broken', fallback)).toBe(fallback);
  });
});

