import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../server/services/telegramService', () => ({ loadTelegramConfig: vi.fn() }));
import { loadTelegramConfig } from '../server/services/telegramService';
import { answerStorefrontQuestion } from '../server/services/storefrontAssistantService';
import { storefrontMemoryDb } from './helpers/storefrontMemoryDb';

describe('grounded storefront AI', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('uses the shared server config, and returns catalogue truth instead of AI-authored prices', async () => {
    vi.mocked(loadTelegramConfig).mockResolvedValue({ geminiApiKey: 'sk-dummy-test-key', geminiBaseUrl: 'https://example.test/v1', aiModel: 'test-model' } as any);
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ intent: 'PRODUCT', kind: 'DEVICE', search: 'iPhone 13', maxPrice: 10000000, condition: 'used', reply: 'Free!', price: 1 }) } }] }) });
    vi.stubGlobal('fetch', request);
    const store = storefrontMemoryDb({
      catalogItems: { A: { name: 'iPhone 13 128GB', category: 'DEVICE', status: 'active', defaultRetailPrice: 8_000_000, condition: '99%', defaultImportPrice: 4_000_000 }, B: { name: 'iPhone 13 128GB', category: 'DEVICE', status: 'active', defaultRetailPrice: 9_000_000, condition: 'new' } },
      branches: { CN: { isActive: true } }
    });
    const result = await answerStorefrontQuestion(store.db, { message: 'ip13 cũ dưới 10 củ', branchId: 'CN' });
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({ id: 'A', price: 8_000_000, inStock: false });
    expect(result.reply).not.toContain('Free');
    expect(JSON.stringify(result)).not.toContain('defaultImportPrice');
    expect(request).toHaveBeenCalledWith('https://example.test/v1/chat/completions', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sk-dummy-test-key' }) }));
  });
  it('fails clearly when the shared key is absent and makes no provider call', async () => {
    vi.mocked(loadTelegramConfig).mockResolvedValue({} as any); vi.stubEnv('GEMINI_API_KEY', '');
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(answerStorefrontQuestion(storefrontMemoryDb({}).db, { message: 'tìm máy' })).rejects.toThrow('STOREFRONT_AI_UNAVAILABLE');
    expect(request).not.toHaveBeenCalled();
  });
});
