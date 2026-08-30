import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  normalizeConversationExtraction,
  normalizePurchaseReceiptExtraction,
  normalizeRepairIntakeExtraction,
  normalizeSalesSlipExtraction,
  parseAiCaptureJson,
  selectCaptureAiConfig
} from '../server/routes/aiCapture';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

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

  it('normalizes supplier receipt fields and keeps uncertain purchase lines reviewable', () => {
    const extraction = normalizePurchaseReceiptExtraction({
      confidence: 78,
      supplier: { name: '  Công ty A  ', phone: '0909.123.456', taxCode: '0400123456' },
      documentCode: ' HD-001 ',
      totalAmount: '31.500.000 đ',
      items: [{ name: 'iPhone 15 Pro', sku: ' IP15P ', imei: 'IMEI 123456789012345', quantity: '1', unitPrice: '31.500.000' }]
    });
    expect(extraction.sourceType).toBe('PURCHASE_RECEIPT');
    expect(extraction.supplier).toEqual({ name: 'Công ty A', phone: '0909.123.456', taxCode: '0400123456' });
    expect(extraction.documentCode).toBe('HD-001');
    expect(extraction.totalAmount).toBe(31_500_000);
    expect(extraction.items[0]).toMatchObject({ sku: 'IP15P', imei: '123456789012345', unitPrice: 31_500_000 });
  });

  it('normalizes repair intake from either an image or audio extraction', () => {
    const extraction = normalizeRepairIntakeExtraction({
      confidence: 0.71,
      transcript: 'Khách báo máy không lên nguồn',
      customer: { name: ' Anh Bình ', phone: '0908-111-222' },
      imei: 'IMEI: 353456789012345',
      model: ' iPhone 14 Pro ',
      issueType: 'Nguồn / Mất Nguồn',
      estimatedCost: '2.500.000 đ'
    });
    expect(extraction).toMatchObject({
      sourceType: 'REPAIR_INTAKE',
      customer: { name: 'Anh Bình', phone: '0908-111-222' },
      imei: '353456789012345',
      model: 'iPhone 14 Pro',
      issueType: 'Nguồn / Mất Nguồn',
      estimatedCost: 2_500_000
    });
  });

  it('prefers the encrypted shared configuration and falls back to the environment without exposing the key', () => {
    const shared = selectCaptureAiConfig({
      source: 'DATABASE',
      geminiApiKey: 'shared-test-key',
      geminiBaseUrl: '',
      aiModel: 'gemini-shared-model'
    }, {});
    expect(shared).toMatchObject({ source: 'SHARED_DATABASE', provider: 'GOOGLE_GEMINI', model: 'gemini-shared-model' });
    expect(shared.apiKey).toBe('shared-test-key');

    const environment = selectCaptureAiConfig(null, {
      GEMINI_API_KEY: 'sk-environment-test',
      GEMINI_BASE_URL: 'https://example.invalid/v1',
      GEMINI_MODEL: 'compatible-model'
    });
    expect(environment).toMatchObject({ source: 'ENVIRONMENT', provider: 'OPENAI_COMPATIBLE', model: 'compatible-model' });
  });

  it('connects all four reviewed AI drafts to their destination modules without automatic posting', () => {
    const modal = source('src/components/AiCaptureModal.tsx');
    const app = source('src/App.tsx');
    const purchase = source('src/components/UniformEntryForm.tsx');
    const repair = source('src/features/warranty/components/RepairIntakeModal.tsx');
    expect(modal).toContain("type: 'PURCHASE_RECEIPT'");
    expect(modal).toContain("type: 'REPAIR_INTAKE'");
    expect(app).toContain('onOpenPurchase={(extraction, draftId) =>');
    expect(app).toContain('onOpenRepair={(extraction, draftId) =>');
    expect(purchase).toContain('AI chưa tạo phiếu và chưa tăng tồn');
    expect(repair).toContain('AI chưa tạo phiếu sửa chữa');
  });
});
