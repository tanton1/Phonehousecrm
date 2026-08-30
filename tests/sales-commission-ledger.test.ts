import { describe, expect, it } from 'vitest';
import { buildSalesCommissionLedgerEntries } from '../server/services/checkoutService';

describe('Canonical POS sales commission ledger', () => {
  it('calculates flat and percentage tags from authoritative line totals', () => {
    const entries = buildSalesCommissionLedgerEntries({
      invoiceId: 'INV_01',
      invoiceCode: 'HD-001',
      branchId: 'CN01',
      staffUid: 'SALE_01',
      staffName: 'Sale Mai',
      occurredAt: '2026-08-31T17:30:00.000Z',
      items: [
        { id: 'DEVICE_01', itemType: 'DEVICE', name: 'iPhone 15', quantity: 1, lineAmount: 20_000_000, commissionTags: [{ id: 'P1', name: '1%', calculationType: 'PERCENT', value: 1, policyId: 'sales', policyVersion: '2' }] },
        { id: 'CASE_01', itemType: 'ACCESSORY', name: 'Ốp lưng', quantity: 2, lineAmount: 1_000_000, commissionTags: [{ id: 'F1', name: '50k/sp', calculationType: 'FLAT', value: 50_000, policyId: 'sales', policyVersion: '2' }] }
      ]
    });
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.commissionPayable)).toEqual([200_000, 100_000]);
    expect(entries.every((entry) => entry.payrollPeriod === '2026-09')).toBe(true);
    expect(entries.every((entry) => entry.status === 'ELIGIBLE' && entry.commissionCategory === 'SALES')).toBe(true);
  });

  it('uses deterministic IDs so checkout retries cannot duplicate commission', () => {
    const input = {
      invoiceId: 'INV_01', invoiceCode: 'HD-001', branchId: 'CN01', staffUid: 'SALE_01', staffName: 'Sale Mai', occurredAt: '2026-08-01T00:00:00.000Z',
      items: [{ id: 'DEVICE_01', itemType: 'DEVICE' as const, name: 'iPhone', quantity: 1, lineAmount: 10_000_000, commissionTags: [{ id: 'TAG_01', calculationType: 'FLAT', value: 100_000 }] }]
    };
    expect(buildSalesCommissionLedgerEntries(input)[0].id).toBe(buildSalesCommissionLedgerEntries(input)[0].id);
  });
});
