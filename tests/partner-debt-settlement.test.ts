import { describe, expect, it } from 'vitest';
import { processPartnerDebtSettlement, validatePartnerDebtSettlementInput } from '../server/services/partnerDebtService';

type Ref = { kind: 'ref'; col: string; id: string };
type Query = { kind: 'query'; col: string; field: string; value: unknown };

function createDb(seed: Record<string, Record<string, any>>) {
  const data = new Map<string, any>();
  Object.entries(seed).forEach(([collection, docs]) => {
    Object.entries(docs).forEach(([id, value]) => data.set(`${collection}/${id}`, { ...value }));
  });
  const ref = (col: string, id: string): Ref => ({ kind: 'ref', col, id });
  const snap = (target: Ref) => ({
    id: target.id,
    ref: target,
    exists: data.has(`${target.col}/${target.id}`),
    data: () => data.get(`${target.col}/${target.id}`)
  });
  const querySnap = (target: Query) => {
    const docs = [...data.entries()]
      .filter(([key, value]) => key.startsWith(`${target.col}/`) && value?.[target.field] === target.value)
      .map(([key]) => snap(ref(target.col, key.slice(target.col.length + 1))));
    return { docs, empty: docs.length === 0 };
  };
  const db: any = {
    collection: (col: string) => ({
      doc: (id: string) => ref(col, id),
      where: (field: string, _operator: string, value: unknown) => ({ kind: 'query', col, field, value } as Query)
    }),
    runTransaction: async (callback: any) => callback({
      get: async (target: Ref | Query) => target.kind === 'query' ? querySnap(target) : snap(target),
      set: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...value }),
      update: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...data.get(`${target.col}/${target.id}`), ...value })
    })
  };
  return { db, data };
}

const actor = { uid: 'ACC_01', name: 'Kế toán', role: 'ACCOUNTANT', branchId: 'CN01', assignedBranchIds: ['CN01'] };

describe('Atomic partner debt settlement', () => {
  it('validates whole-VND amounts and an idempotency key', () => {
    expect(() => validatePartnerDebtSettlementInput({ partnerId: 'SUP', fundId: 'FUND', direction: 'PAYMENT', amount: 10.5, idempotencyKey: 'REQUEST-01' })).toThrow('PARTNER_DEBT_AMOUNT_INVALID');
    expect(() => validatePartnerDebtSettlementInput({ partnerId: 'SUP', fundId: 'FUND', direction: 'PAYMENT', amount: 10, idempotencyKey: 'short' })).toThrow('PARTNER_DEBT_IDEMPOTENCY_REQUIRED');
  });

  it('pays a supplier, allocates oldest purchase orders and writes every ledger once', async () => {
    const { db, data } = createDb({
      partners: { SUP_01: { id: 'SUP_01', branchId: 'CN01', type: 'SUPPLIER', name: 'NCC A', outstandingDebt: 15_000_000, debtTransactions: [] } },
      funds: { FUND_01: { id: 'FUND_01', branchId: 'CN01', type: 'BANK', name: 'VCB CN01', currentBalance: 50_000_000, totalExpense: 0, totalIncome: 0, isActive: true } },
      purchaseOrders: {
        PO_02: { id: 'PO_02', code: 'PN-02', supplierId: 'SUP_01', branchId: 'CN01', orderDate: '2026-02-01', paidAmount: 0, debtAmount: 5_000_000, status: 'COMPLETED' },
        PO_01: { id: 'PO_01', code: 'PN-01', supplierId: 'SUP_01', branchId: 'CN01', orderDate: '2026-01-01', paidAmount: 0, debtAmount: 10_000_000, status: 'COMPLETED' }
      }
    });
    const input = { partnerId: 'SUP_01', fundId: 'FUND_01', direction: 'PAYMENT' as const, amount: 12_000_000, note: 'Thanh toán đợt 1', idempotencyKey: 'SUP-PAYMENT-REQUEST-01' };

    const result = await processPartnerDebtSettlement(db, input, actor);
    expect(result.allocations.map(item => [item.sourceId, item.amount])).toEqual([['PO_01', 10_000_000], ['PO_02', 2_000_000]]);
    expect(data.get('partners/SUP_01').outstandingDebt).toBe(3_000_000);
    expect(data.get('funds/FUND_01')).toMatchObject({ currentBalance: 38_000_000, totalExpense: 12_000_000, totalIncome: 0 });
    expect(data.get('purchaseOrders/PO_01')).toMatchObject({ paidAmount: 10_000_000, debtAmount: 0, paymentStatus: 'PAID' });
    expect(data.get('purchaseOrders/PO_02')).toMatchObject({ paidAmount: 2_000_000, debtAmount: 3_000_000, paymentStatus: 'PARTIAL' });
    expect(data.get(`cashTransactions/${result.cashTransaction.id}`)).toMatchObject({ category: 'SUPPLIER_DEBT_PAY', status: 'COMPLETED', isPLAccounted: false });
    expect(data.get(`partnerDebtSettlements/${result.settlementId}`)).toMatchObject({ amount: 12_000_000, status: 'COMPLETED' });

    const replay = await processPartnerDebtSettlement(db, input, actor);
    expect(replay.idempotentReplay).toBe(true);
    expect(data.get('partners/SUP_01').outstandingDebt).toBe(3_000_000);
    expect(data.get('funds/FUND_01').currentBalance).toBe(38_000_000);
  });

  it('collects customer debt and updates the linked invoice atomically', async () => {
    const { db, data } = createDb({
      partners: { CUS_01: { id: 'CUS_01', branchId: 'CN01', type: 'CUSTOMER', name: 'Khách A', outstandingDebt: 8_000_000, debtTransactions: [] } },
      funds: { FUND_01: { id: 'FUND_01', branchId: 'CN01', type: 'CASH', name: 'Két CN01', currentBalance: 1_000_000, totalExpense: 0, totalIncome: 0, isActive: true } },
      invoices: { INV_01: { id: 'INV_01', invoiceCode: 'HD-01', customerId: 'CUS_01', branchId: 'CN01', createdAt: '2026-01-01', paidAmount: 2_000_000, debtAmount: 8_000_000, status: 'completed' } }
    });

    const result = await processPartnerDebtSettlement(db, {
      partnerId: 'CUS_01', fundId: 'FUND_01', direction: 'RECEIPT', amount: 8_000_000,
      note: 'Khách trả đủ', idempotencyKey: 'CUSTOMER-RECEIPT-01'
    }, actor);
    expect(result.unallocatedAmount).toBe(0);
    expect(data.get('partners/CUS_01').outstandingDebt).toBe(0);
    expect(data.get('funds/FUND_01')).toMatchObject({ currentBalance: 9_000_000, totalIncome: 8_000_000, totalExpense: 0 });
    expect(data.get('invoices/INV_01')).toMatchObject({ paidAmount: 10_000_000, debtAmount: 0, paymentStatus: 'PAID' });
    expect(result.cashTransaction.category).toBe('CUSTOMER_DEBT_COLLECT');
  });

  it('rejects cross-branch funds and insufficient supplier cash before any write', async () => {
    const { db, data } = createDb({
      partners: { SUP_01: { id: 'SUP_01', branchId: 'CN01', type: 'SUPPLIER', outstandingDebt: 5_000_000 } },
      funds: { FUND_02: { id: 'FUND_02', branchId: 'CN02', type: 'CASH', currentBalance: 1_000_000, isActive: true } }
    });
    await expect(processPartnerDebtSettlement(db, {
      partnerId: 'SUP_01', fundId: 'FUND_02', direction: 'PAYMENT', amount: 2_000_000,
      idempotencyKey: 'CROSS-BRANCH-REQUEST-01'
    }, { ...actor, role: 'ADMIN' })).rejects.toThrow('PARTNER_DEBT_BRANCH_MISMATCH');
    expect(data.get('partners/SUP_01').outstandingDebt).toBe(5_000_000);
    expect(data.get('funds/FUND_02').currentBalance).toBe(1_000_000);
    expect([...data.keys()].some(key => key.startsWith('cashTransactions/'))).toBe(false);
  });
});
