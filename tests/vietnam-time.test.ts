import { describe, expect, it } from 'vitest';
import {
  getVietnamDateString,
  getVietnamDayUtcRange,
  getVietnamMonthString,
  getVietnamMonthUtcRange
} from '../shared/vietnamTime';

describe('Vietnam business time', () => {
  it('assigns early UTC hours to the correct Vietnam business day and month', () => {
    expect(getVietnamDateString('2026-09-30T18:30:00.000Z')).toBe('2026-10-01');
    expect(getVietnamMonthString('2026-09-30T18:30:00.000Z')).toBe('2026-10');
  });

  it('creates exact UTC boundaries for one Vietnam day', () => {
    expect(getVietnamDayUtcRange('2026-08-27')).toEqual({
      startUtc: '2026-08-26T17:00:00.000Z',
      endUtc: '2026-08-27T16:59:59.999Z'
    });
  });

  it('creates exact month boundaries including the December rollover', () => {
    expect(getVietnamMonthUtcRange('2026-12')).toEqual({
      startUtc: '2026-11-30T17:00:00.000Z',
      endUtc: '2026-12-31T16:59:59.999Z'
    });
  });
});
