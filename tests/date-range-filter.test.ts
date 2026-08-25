import { describe, expect, it } from 'vitest';
import { matchesDateFilter } from '../src/utils/dateRangeFilter';

const now = new Date(2026, 7, 25, 12, 0, 0);

describe('document date range filters', () => {
  it('lọc đúng hôm nay, tuần này, tháng này và tháng trước', () => {
    expect(matchesDateFilter('2026-08-25 08:00:00', { preset: 'today', from: '', to: '' }, now)).toBe(true);
    expect(matchesDateFilter('2026-08-24 23:59:59', { preset: 'today', from: '', to: '' }, now)).toBe(false);

    expect(matchesDateFilter('2026-08-24', { preset: 'this_week', from: '', to: '' }, now)).toBe(true);
    expect(matchesDateFilter('2026-08-23', { preset: 'this_week', from: '', to: '' }, now)).toBe(false);

    expect(matchesDateFilter('2026-08-01', { preset: 'this_month', from: '', to: '' }, now)).toBe(true);
    expect(matchesDateFilter('2026-07-31', { preset: 'this_month', from: '', to: '' }, now)).toBe(false);

    expect(matchesDateFilter('2026-07-01', { preset: 'last_month', from: '', to: '' }, now)).toBe(true);
    expect(matchesDateFilter('2026-08-01', { preset: 'last_month', from: '', to: '' }, now)).toBe(false);
  });

  it('tính khoảng tùy chỉnh gồm cả ngày kết thúc', () => {
    const filter = { preset: 'custom' as const, from: '2026-08-10', to: '2026-08-12' };
    expect(matchesDateFilter('2026-08-10T00:00:00+07:00', filter, now)).toBe(true);
    expect(matchesDateFilter('2026-08-12T23:59:59+07:00', filter, now)).toBe(true);
    expect(matchesDateFilter('2026-08-13T00:00:00+07:00', filter, now)).toBe(false);
  });
});
