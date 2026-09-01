import { describe, expect, it } from 'vitest';
import { resolveCommissionPayrollPeriod } from '../server/services/commissionPayrollPeriodService';
import { prepareEligibleSalesCommissionLedgerEntries } from '../server/services/checkoutService';

function policyStore(seed: Record<string, Record<string, any>>) {
  const values = new Map<string, any>();
  Object.entries(seed).forEach(([collection, docs]) => {
    Object.entries(docs).forEach(([id, data]) => values.set(`${collection}/${id}`, { ...data }));
  });
  const db: any = {
    collection(name: string) {
      return {
        doc(id: string) {
          return { id, path: `${name}/${id}` };
        }
      };
    }
  };
  const transaction: any = {
    async get(ref: any) {
      return {
        id: ref.id,
        exists: values.has(ref.path),
        data: () => values.get(ref.path)
      };
    }
  };
  return { db, transaction };
}

describe('Commission payroll-period carry-forward policy', () => {
  it('fails closed when the canonical Firebase user document is missing', async () => {
    const store = policyStore({ users: {} });
    await expect(resolveCommissionPayrollPeriod(store.transaction, store.db, {
      staffUid: 'MISSING_UID', sourceBranchId: 'CN01', requestedPeriod: '2026-08'
    })).rejects.toThrow('COMMISSION_PAYROLL_STAFF_NOT_FOUND');
  });

  it('fails closed when a canonical user document points at another Firebase UID', async () => {
    const store = policyStore({
      users: { AUTH_01: { authUid: 'AUTH_OTHER', branchId: 'CN01', payrollBranchId: 'CN01', active: true } }
    });
    await expect(resolveCommissionPayrollPeriod(store.transaction, store.db, {
      staffUid: 'AUTH_01', sourceBranchId: 'CN01', requestedPeriod: '2026-08'
    })).rejects.toThrow('COMMISSION_PAYROLL_STAFF_IDENTITY_MISMATCH');
  });

  it('fails closed for inactive staff instead of carrying commission into a source branch', async () => {
    const store = policyStore({
      users: { AUTH_01: { authUid: 'AUTH_01', branchId: 'CN01', payrollBranchId: 'CN01', active: false } }
    });
    await expect(resolveCommissionPayrollPeriod(store.transaction, store.db, {
      staffUid: 'AUTH_01', sourceBranchId: 'CN01', requestedPeriod: '2026-08'
    })).rejects.toThrow('COMMISSION_PAYROLL_STAFF_INACTIVE');
  });

  it('keeps an eligible commission in the requested Vietnam month while the payroll period is DRAFT', async () => {
    const store = policyStore({
      users: { TECH_01: { authUid: 'TECH_01', branchId: 'CN01', payrollBranchId: 'CN01', active: true } },
      payrollPeriods: { '2026-08_CN01': { period: '2026-08', branchId: 'CN01', status: 'DRAFT' } }
    });
    await expect(resolveCommissionPayrollPeriod(store.transaction, store.db, {
      staffUid: 'TECH_01', sourceBranchId: 'CN02', requestedPeriod: '2026-08', assignedPeriod: '2026-07'
    })).resolves.toEqual({
      assignedPeriod: '2026-07',
      originalPayrollPeriod: '2026-08',
      payrollPeriod: '2026-08',
      payrollBranchId: 'CN01',
      carriedFromPeriod: null,
      carryForwardReason: null
    });
  });

  it('carries a late commission forward from an APPROVED period without reopening the locked slip', async () => {
    const store = policyStore({
      users: { TECH_01: { authUid: 'TECH_01', branchId: 'CN01', payrollBranchId: 'CN01', active: true } },
      payrollPeriods: {
        '2026-08_CN01': { period: '2026-08', branchId: 'CN01', status: 'APPROVED' },
        '2026-09_CN01': { period: '2026-09', branchId: 'CN01', status: 'DRAFT' }
      }
    });
    await expect(resolveCommissionPayrollPeriod(store.transaction, store.db, {
      staffUid: 'TECH_01', sourceBranchId: 'CN02', requestedPeriod: '2026-08', assignedPeriod: '2026-07'
    })).resolves.toMatchObject({
      assignedPeriod: '2026-07',
      originalPayrollPeriod: '2026-08',
      payrollPeriod: '2026-09',
      payrollBranchId: 'CN01',
      carriedFromPeriod: '2026-08',
      carryForwardReason: 'PAYROLL_PERIOD_APPROVED'
    });
  });

  it('skips consecutive PAID/staff-locked periods and uses the next open month', async () => {
    const store = policyStore({
      users: { SALE_01: { authUid: 'SALE_01', branchId: 'CN01', payrollBranchId: 'CN01', active: true } },
      payrollPeriods: {
        '2026-08_CN01': { period: '2026-08', branchId: 'CN01', status: 'PAID' },
        '2026-09_CN01': { period: '2026-09', branchId: 'CN01', status: 'DRAFT' }
      },
      payrollStaffLocks: {
        '2026-09_SALE_01': { period: '2026-09', staffUid: 'SALE_01', runId: 'PAYROLL_2026_09_CN01' }
      }
    });
    await expect(resolveCommissionPayrollPeriod(store.transaction, store.db, {
      staffUid: 'SALE_01', sourceBranchId: 'CN01', requestedPeriod: '2026-08'
    })).resolves.toMatchObject({
      assignedPeriod: '2026-08',
      originalPayrollPeriod: '2026-08',
      payrollPeriod: '2026-10',
      carriedFromPeriod: '2026-08',
      carryForwardReason: 'PAYROLL_PERIOD_PAID'
    });
  });

  it('applies carry-forward to POS commission before checkout writes the ELIGIBLE ledger', async () => {
    const store = policyStore({
      users: { SALE_01: { authUid: 'SALE_01', branchId: 'CN01', payrollBranchId: 'CN01', active: true } },
      payrollPeriods: { '2026-08_CN01': { period: '2026-08', branchId: 'CN01', status: 'APPROVED' } }
    });
    const entries = await prepareEligibleSalesCommissionLedgerEntries(store.transaction, store.db, {
      invoiceId: 'INV_01', invoiceCode: 'HD-01', branchId: 'CN01', staffUid: 'SALE_01', staffName: 'Sale 01',
      occurredAt: '2026-08-31T16:00:00.000Z',
      items: [{
        id: 'DEV_01', itemType: 'DEVICE', name: 'iPhone', quantity: 1, lineAmount: 20_000_000,
        commissionTags: [{ id: 'TAG_01', policyId: 'POLICY_01', policyVersion: '1', calculationType: 'FLAT', value: 200_000 }]
      }]
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      status: 'ELIGIBLE', assignedPeriod: '2026-08', originalPayrollPeriod: '2026-08', payrollPeriod: '2026-09',
      carriedFromPeriod: '2026-08', carryForwardReason: 'PAYROLL_PERIOD_APPROVED'
    });
  });
});
