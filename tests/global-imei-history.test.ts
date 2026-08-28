import { describe, expect, it } from 'vitest';
import { extractLabeledImei, normalizeClickableImei } from '../src/utils/imeiHistory';

describe('global IMEI history targeting', () => {
  it('normalizes project IMEIs while preserving the supported 5-15 digit range', () => {
    expect(normalizeClickableImei(' 12-345 ')).toBe('12345');
    expect(normalizeClickableImei('356789012345678')).toBe('356789012345678');
    expect(normalizeClickableImei('1234')).toBe('');
    expect(normalizeClickableImei('1234567890123456')).toBe('');
  });

  it('detects full IMEIs only when the visible text labels the identifier', () => {
    expect(extractLabeledImei('IMEI: 356789012345678 · iPhone 15 Pro Max')).toBe('356789012345678');
    expect(extractLabeledImei('IMEI / Serial #12345 · máy thử')).toBe('12345');
    expect(extractLabeledImei('Mã phiếu HD-12345')).toBe('');
    expect(extractLabeledImei('Điện thoại khách: 0905000000')).toBe('');
  });

  it('does not mistake a masked IMEI for a complete identifier', () => {
    expect(extractLabeledImei('IMEI: ...456789')).toBe('');
    expect(extractLabeledImei('IMEI: ••••••••5678')).toBe('');
  });
});
