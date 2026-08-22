import { describe, expect, it } from 'vitest';
import { executeAtomicInvoiceRefund } from '../server/services/checkoutService';

type Ref = { kind: 'ref'; col: string; id: string };
type Query = { kind: 'query'; col: string; field: string; value: unknown; max?: number };

function createDb(seed: Record<string, Record<string, any>>) {
  const data = new Map<string, any>();
  Object.entries(seed).forEach(([collection, docs]) => Object.entries(docs).forEach(([id, value]) => data.set(`${collection}/${id}`, { ...value })));
  let autoId = 0;
  const ref = (col: string, id?: string): Ref => ({ kind: 'ref', col, id: id || `AUTO_${++autoId}` });
  const snap = (target: Ref) => ({ id: target.id, ref: target, exists: data.has(`${target.col}/${target.id}`), data: () => data.get(`${target.col}/${target.id}`) });
  const querySnap = (target: Query) => {
    const docs = [...data.entries()]
      .filter(([key, value]) => key.startsWith(`${target.col}/`) && value?.[target.field] === target.value)
      .slice(0, target.max || Number.MAX_SAFE_INTEGER)
      .map(([key]) => snap(ref(target.col, key.slice(target.col.length + 1))));
    return { docs, empty: docs.length === 0 };
  };
  const db: any = {
    collection: (col: string) => ({
      doc: (id?: string) => ref(col, id),
      where: (field: string, _operator: string, value: unknown) => {
        const query: any = { kind: 'query', col, field, value };
        query.limit = (max: number) => ({ ...query, max });
        return query;
      }
    }),
    runTransaction: async (callback: any) => callback({
      get: async (target: Ref | Query) => target.kind === 'query' ? querySnap(target) : snap(target),
      set: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...value }),
      update: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...data.get(`${target.col}/${target.id}`), ...value })
    })
  };
  return { db, data };
}

const actor = { uid: 'ADMIN_01', role: 'ADMIN', name: 'Admin', branchId: 'CN01' };

describe('Invoice cancellation debt reversal', () => {
  it('cancels an unpaid customer-debt invoice and reverses customer debt without cash movement', async () => {
    const { db, data } = createDb({
      invoices: { INV_01: { id: 'INV_01', invoiceCode: 'HD-01', branchId: 'CN01', status: 'completed', customerId: 'CUS_01', finalAmount: 10_000_000, paidAmount: 0, debtAmount: 10_000_000 } },
      partners: { CUS_01: { id: 'CUS_01', branchId: 'CN01', outstandingDebt: 10_000_000, totalSpent: 10_000_000, debtTransactions: [{ referenceId: 'INV_01', amount: 10_000_000 }] } },
      devices: { DEV_01: { id: 'DEV_01', soldInvoiceId: 'INV_01', status: 'sold' } }
    });
    const result = await executeAtomicInvoiceRefund(db, {
      invoiceId: 'INV_01', branchId: 'CN01', reason: 'Khách hủy', idempotencyKey: 'REFUND-DEBT-INV-01'
    }, actor);
    expect(result.refundTransaction).toBeNull();
    expect(data.get('invoices/INV_01')).toMatchObject({ status: 'cancelled', debtAmount: 0 });
    expect(data.get('partners/CUS_01')).toMatchObject({ outstandingDebt: 0, totalSpent: 0, debtTransactions: [] });
    expect(data.get('devices/DEV_01').status).toBe('in_stock');
  });

  it('refunds the down payment and reverses pending finance-company receivable', async () => {
    const { db, data } = createDb({
      invoices: { INV_02: {
        id: 'INV_02', invoiceCode: 'HD-02', branchId: 'CN01', status: 'completed', customerId: 'CUS_01',
        finalAmount: 10_000_000, paidAmount: 2_000_000, debtAmount: 0, paymentFundId: 'BANK_01',
        installmentDisbursementStatus: 'PENDING', installmentExpectedAmount: 8_000_000, installmentFinancePartnerId: 'FIN_01'
      } },
      partners: {
        CUS_01: { id: 'CUS_01', branchId: 'CN01', outstandingDebt: 0, totalSpent: 10_000_000, debtTransactions: [] },
        FIN_01: { id: 'FIN_01', branchId: 'CN01', outstandingDebt: 8_000_000, debtTransactions: [{ referenceId: 'INV_02', amount: 8_000_000 }] }
      },
      funds: { BANK_01: { id: 'BANK_01', branchId: 'CN01', type: 'BANK', name: 'VCB', currentBalance: 5_000_000, totalExpense: 0, isActive: true } },
      devices: { DEV_02: { id: 'DEV_02', soldInvoiceId: 'INV_02', status: 'sold' } }
    });
    const result = await executeAtomicInvoiceRefund(db, {
      invoiceId: 'INV_02', branchId: 'CN01', fundId: 'BANK_01', reason: 'Hồ sơ trả góp bị từ chối', idempotencyKey: 'REFUND-INSTALLMENT-02'
    }, actor);
    expect(result.refundTransaction).toMatchObject({ amount: 2_000_000, fundId: 'BANK_01' });
    expect(data.get('funds/BANK_01')).toMatchObject({ currentBalance: 3_000_000, totalExpense: 2_000_000 });
    expect(data.get('partners/FIN_01')).toMatchObject({ outstandingDebt: 0, debtTransactions: [] });
    expect(data.get('partners/CUS_01').totalSpent).toBe(0);
    expect(data.get('invoices/INV_02')).toMatchObject({ status: 'cancelled', installmentDisbursementStatus: 'CANCELLED' });
  });

  it('requires a dedicated reversal after a finance disbursement was posted', async () => {
    const { db } = createDb({
      invoices: { INV_03: { id: 'INV_03', branchId: 'CN01', status: 'completed', installmentDisbursementStatus: 'DISBURSED' } }
    });
    await expect(executeAtomicInvoiceRefund(db, {
      invoiceId: 'INV_03', branchId: 'CN01', reason: 'Hủy sau giải ngân', idempotencyKey: 'REFUND-DISBURSED-03'
    }, actor)).rejects.toThrow('INVOICE_REFUND_REQUIRES_INSTALLMENT_REVERSAL');
  });
});
