import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserDraftKey, readBrowserDraft, removeBrowserDraft, writeBrowserDraft } from '../src/utils/browserDraft';

function installLocalStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); }
    }
  });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('browser operational drafts', () => {
  it('lưu và khôi phục đúng nháp theo luồng, người dùng và chi nhánh', () => {
    installLocalStorage();
    const key = browserDraftKey('pos', 'staff 01', 'CN/Phonehouse');
    writeBrowserDraft(key, { customerPhone: '0905000001', itemIds: ['IMEI-1'] });

    expect(key).toBe('phonehouse:draft:v1:pos:staff_01:CN_Phonehouse');
    expect(readBrowserDraft(key)).toEqual({ customerPhone: '0905000001', itemIds: ['IMEI-1'] });
  });

  it('xóa nháp chủ động và loại bỏ nháp hết hạn', () => {
    const values = installLocalStorage();
    const key = browserDraftKey('purchase-imei', 'admin', 'CN01');
    writeBrowserDraft(key, { imeis: ['12345'] });
    removeBrowserDraft(key);
    expect(readBrowserDraft(key)).toBeNull();

    values.set(key, JSON.stringify({ version: 1, savedAt: Date.now() - 2_000, value: { imeis: ['old'] } }));
    expect(readBrowserDraft(key, 1_000)).toBeNull();
    expect(values.has(key)).toBe(false);
  });
});
