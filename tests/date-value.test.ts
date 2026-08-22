import { describe, expect, it } from 'vitest';
import { invoiceDateTime, toIsoDateTime } from '../src/utils/dateValue';

describe('Firestore date normalization', () => {
  it('converts Firestore Timestamp-like values to ISO text', () => {
    expect(toIsoDateTime({ seconds: 1787377380, nanoseconds: 0 })).toBe('2026-08-22T05:43:00.000Z');
    expect(toIsoDateTime({ toDate: () => new Date('2026-08-22T05:43:00.000Z') })).toBe('2026-08-22T05:43:00.000Z');
  });

  it('keeps existing date text and safely handles missing timestamps', () => {
    expect(invoiceDateTime('2026-08-22T13:04:00.000Z')).toBe('2026-08-22T13:04:00.000Z');
    expect(invoiceDateTime(undefined, '2026-08-22')).toBe('2026-08-22');
  });
});
