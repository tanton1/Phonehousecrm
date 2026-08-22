import { describe, expect, it } from 'vitest';
import { processInstallmentDisbursement } from '../server/services/installmentDisbursementService';

type Ref = { col: string; id: string };

function createDb(seed: Record<string, Record<string, any>>) {
  const data = new Map<string, any>();
  Object.entries(seed).forEach(([collection, docs]) => Object.entries(docs).forEach(([id, value]) => data.set(`${collection}/${id}`, { ...value })));
  const ref = (col: string, id: string): Ref => ({ col, id });
  const snap = (target: Ref) => ({ id: target.id, ref: target, exists: data.has(`${target.col}/${target.id}`), data: () => data.get(`${target.col}/${target.id}`) });
  const db: any = {
    collection: (col: string) => ({ doc: (id: string) => ref(col, id) }),
    runTransaction: async (callback: any) => callback({
      get: async (target: Ref) => snap(target),
      set: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...value }),
      update: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...data.get(`${target.col}/${target.id}`), ...value })
    })
  };
  return { db, data };
}

const actor = { uid: 'ACC_01', name: 'Kế toán', role: 'ACCOUNTANT', branchId: 'CN01', assignedBranchIds: ['CN01'] };

describe('Atomic installment disbursement', () => {
  it('posts net bank cash, finance fee, invoice and finance-partner debt once', async () => {
    const { db, data } = createDb({
      invoices: { INV_01: {
        id: 'INV_01', invoiceCode: 'HD-01', branchId: 'CN01', finalAmount: 10_000_000,
        paidAmount: 1_000_000, installmentExpectedAmount: 9_000_000,
        installmentFinancePartnerId: 'FIN_01', installmentDisbursementStatus: 'PENDING'
      } },
      funds: { BANK_01: {
        id: 'BANK_01', branchId: 'CN01', type: 'BANK', name: 'VCB CN01', isActive: true,
        currentBalance: 10_000_000, totalIncome: 0, totalExpense: 0
      } },
      partners: { FIN_01: {
        id: 'FIN_01', branchId: 'CN01', type: 'SUPPLIER', supplierCategory: 'FINANCE_PARTNER',
        name: 'HD Saison', outstandingDebt: 9_000_000, debtTransactions: []
      } }
    });
    const input = {
      invoiceId: 'INV_01', fundId: 'BANK_01', receivedAmount: 8_500_000, feeAmount: 500_000,
      note: 'Đối soát HD-01', idempotencyKey: 'INSTALLMENT-REQUEST-01'
    };
    const result = await processInstallmentDisbursement(db, input, actor);
    expect(result.invoice).toMatchObject({ installmentDisbursementStatus: 'DISBURSED', paidAmount: 10_000_000, paymentStatus: 'PAID' });
    expect(data.get('funds/BANK_01')).toMatchObject({ currentBalance: 18_500_000, totalIncome: 9_000_000, totalExpense: 500_000 });
    expect(data.get('partners/FIN_01').outstandingDebt).toBe(0);
    expect(result.cashTransactions).toHaveLength(2);
    expect(result.cashTransactions[0]).toMatchObject({ type: 'RECEIPT', amount: 9_000_000, isPLAccounted: false });
    expect(result.cashTransactions[1]).toMatchObject({ type: 'PAYMENT', amount: 500_000, isPLAccounted: true });

    const replay = await processInstallmentDisbursement(db, input, actor);
    expect(replay.idempotentReplay).toBe(true);
    expect(data.get('funds/BANK_01').currentBalance).toBe(18_500_000);
    expect(data.get('partners/FIN_01').outstandingDebt).toBe(0);
  });

  it('rejects reconciliation when received cash plus fee differs from expected finance debt', async () => {
    const { db, data } = createDb({
      invoices: { INV_01: { id: 'INV_01', branchId: 'CN01', installmentExpectedAmount: 9_000_000, installmentFinancePartnerId: 'FIN_01', installmentDisbursementStatus: 'PENDING' } },
      funds: { BANK_01: { id: 'BANK_01', branchId: 'CN01', type: 'BANK', isActive: true, currentBalance: 0 } },
      partners: { FIN_01: { id: 'FIN_01', branchId: 'CN01', type: 'SUPPLIER', outstandingDebt: 9_000_000 } }
    });
    await expect(processInstallmentDisbursement(db, {
      invoiceId: 'INV_01', fundId: 'BANK_01', receivedAmount: 8_000_000, feeAmount: 500_000,
      idempotencyKey: 'INSTALLMENT-MISMATCH-01'
    }, actor)).rejects.toThrow('INSTALLMENT_RECONCILIATION_MISMATCH');
    expect(data.get('funds/BANK_01').currentBalance).toBe(0);
    expect(data.get('partners/FIN_01').outstandingDebt).toBe(9_000_000);
  });
});
