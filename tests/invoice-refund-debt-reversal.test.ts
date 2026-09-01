import { describe, expect, it } from 'vitest';
import { executeAtomicInvoiceRefund } from '../server/services/checkoutService';
import { debtOpenItemId, newDebtOpenItemRecord } from '../server/services/branchPartyService';

type Ref = { kind: 'ref'; col: string; id: string };
type Query = { kind: 'query'; col: string; field: string; value: unknown; max?: number };

function createDb(seed: Record<string, Record<string, any>>, queryResultLimit?: (query: Query) => number | undefined) {
  const data = new Map<string, any>();
  Object.entries(seed).forEach(([collection, docs]) => Object.entries(docs).forEach(([id, value]) => data.set(`${collection}/${id}`, { ...value })));
  let autoId = 0;
  const ref = (col: string, id?: string): Ref => ({ kind: 'ref', col, id: id || `AUTO_${++autoId}` });
  const snap = (target: Ref) => ({ id: target.id, ref: target, exists: data.has(`${target.col}/${target.id}`), data: () => data.get(`${target.col}/${target.id}`) });
  const querySnap = (target: Query) => {
    const docs = [...data.entries()]
      .filter(([key, value]) => key.startsWith(`${target.col}/`) && value?.[target.field] === target.value)
      .slice(0, queryResultLimit?.(target) ?? target.max ?? Number.MAX_SAFE_INTEGER)
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
    const openItemId = debtOpenItemId('INVOICE', 'INV_01', 'RECEIVABLE');
    const { db, data } = createDb({
      invoices: { INV_01: { id: 'INV_01', invoiceCode: 'HD-01', branchId: 'CN01', status: 'completed', customerId: 'CUS_01', finalAmount: 10_000_000, paidAmount: 0, debtAmount: 10_000_000, deviceIds: ['DEV_01'] } },
      partners: { CUS_01: { id: 'CUS_01', branchId: 'CN01', type: 'CUSTOMER', name: 'Khách A', phone: '0905000001', partyMasterId: 'PTY_CUS_01', branchPartyAccountId: 'BPA_CUS_01', outstandingDebt: 10_000_000, totalSpent: 10_000_000, debtTransactions: [{ referenceId: 'INV_01', amount: 10_000_000 }] } },
      partyMasters: { PTY_CUS_01: { id: 'PTY_CUS_01', type: 'CUSTOMER', name: 'Khách A' } },
      branchPartyAccounts: { BPA_CUS_01: { id: 'BPA_CUS_01', branchId: 'CN01', partyMasterId: 'PTY_CUS_01', legacyPartnerId: 'CUS_01', receivableBalance: 10_000_000, payableBalance: 0, totalSales: 10_000_000 } },
      debtOpenItems: { [openItemId]: newDebtOpenItemRecord({
        branchId: 'CN01', partyAccountId: 'BPA_CUS_01', partyMasterId: 'PTY_CUS_01', legacyPartnerId: 'CUS_01',
        direction: 'RECEIVABLE', sourceType: 'INVOICE', sourceDocumentId: 'INV_01', sourceDocumentCode: 'HD-01',
        originalAmount: 10_000_000, actorUid: 'ADMIN_01', occurredAt: '2026-08-01T00:00:00.000Z'
      }) },
      devices: { DEV_01: { id: 'DEV_01', soldInvoiceId: 'INV_01', status: 'sold' } }
    });
    const result = await executeAtomicInvoiceRefund(db, {
      invoiceId: 'INV_01', branchId: 'CN01', reason: 'Khách hủy', idempotencyKey: 'REFUND-DEBT-INV-01'
    }, actor);
    expect(result.refundTransaction).toBeNull();
    expect(data.get('invoices/INV_01')).toMatchObject({ status: 'cancelled', debtAmount: 0 });
    expect(data.get('partners/CUS_01')).toMatchObject({ outstandingDebt: 0, totalSpent: 0, debtTransactions: [] });
    expect(data.get('devices/DEV_01').status).toBe('in_stock');
    expect(data.get(`debtOpenItems/${openItemId}`)).toMatchObject({
      sourceType: 'INVOICE', sourceId: 'INV_01', originalAmount: 10_000_000,
      settledAmount: 0, reversedAmount: 10_000_000, openAmount: 0, status: 'REVERSED', isOpen: false
    });
  });

  it('refunds the down payment and reverses pending finance-company receivable', async () => {
    const { db, data } = createDb({
      invoices: { INV_02: {
        id: 'INV_02', invoiceCode: 'HD-02', branchId: 'CN01', status: 'completed', customerId: 'CUS_01',
        finalAmount: 10_000_000, paidAmount: 2_000_000, debtAmount: 0, paymentFundId: 'BANK_01',
        installmentDisbursementStatus: 'PENDING', installmentExpectedAmount: 8_000_000, installmentFinancePartnerId: 'FIN_01', deviceIds: ['DEV_02']
      } },
      partners: {
        CUS_01: { id: 'CUS_01', branchId: 'CN01', type: 'CUSTOMER', name: 'Khách A', phone: '0905000001', outstandingDebt: 0, totalSpent: 10_000_000, debtTransactions: [] },
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

  it('fails closed before cancelling when a debt invoice no longer has its customer', async () => {
    const { db, data } = createDb({
      invoices: { INV_ORPHAN: { id: 'INV_ORPHAN', branchId: 'CN01', status: 'completed', customerId: 'CUS_MISSING', finalAmount: 100, paidAmount: 0, debtAmount: 100 } }
    });
    await expect(executeAtomicInvoiceRefund(db, {
      invoiceId: 'INV_ORPHAN', branchId: 'CN01', reason: 'Hủy phiếu lỗi', idempotencyKey: 'REFUND-ORPHAN-01'
    }, actor)).rejects.toThrow('REFUND_CUSTOMER_REQUIRED_FOR_DEBT_REVERSAL');
    expect(data.get('invoices/INV_ORPHAN')).toMatchObject({ status: 'completed', debtAmount: 100 });
  });

  it('requires the canonical debt open item before reversing a debt invoice', async () => {
    const { db, data } = createDb({
      invoices: { INV_NO_OPEN: { id: 'INV_NO_OPEN', branchId: 'CN01', status: 'completed', customerId: 'CUS_01', finalAmount: 100, paidAmount: 0, debtAmount: 100 } },
      partners: { CUS_01: { id: 'CUS_01', branchId: 'CN01', type: 'CUSTOMER', phone: '0905000001', partyMasterId: 'PTY_CUS_01', branchPartyAccountId: 'BPA_CUS_01', outstandingDebt: 100, totalSpent: 100 } },
      partyMasters: { PTY_CUS_01: { id: 'PTY_CUS_01', type: 'CUSTOMER' } },
      branchPartyAccounts: { BPA_CUS_01: { id: 'BPA_CUS_01', branchId: 'CN01', partyMasterId: 'PTY_CUS_01', legacyPartnerId: 'CUS_01', receivableBalance: 100 } }
    });
    await expect(executeAtomicInvoiceRefund(db, {
      invoiceId: 'INV_NO_OPEN', branchId: 'CN01', reason: 'Hủy phiếu lỗi', idempotencyKey: 'REFUND-NO-OPEN-01'
    }, actor)).rejects.toThrow('REFUND_CUSTOMER_DEBT_OPEN_ITEM_REQUIRED');
    expect(data.get('invoices/INV_NO_OPEN')).toMatchObject({ status: 'completed', debtAmount: 100 });
  });

  it('does not tolerate a one-dong shortage in the canonical customer account', async () => {
    const openItemId = debtOpenItemId('INVOICE', 'INV_ONE_DONG', 'RECEIVABLE');
    const { db } = createDb({
      invoices: { INV_ONE_DONG: { id: 'INV_ONE_DONG', branchId: 'CN01', status: 'completed', customerId: 'CUS_01', finalAmount: 100, paidAmount: 0, debtAmount: 100 } },
      partners: { CUS_01: { id: 'CUS_01', branchId: 'CN01', type: 'CUSTOMER', phone: '0905000001', partyMasterId: 'PTY_CUS_01', branchPartyAccountId: 'BPA_CUS_01', outstandingDebt: 100, totalSpent: 100 } },
      partyMasters: { PTY_CUS_01: { id: 'PTY_CUS_01', type: 'CUSTOMER' } },
      branchPartyAccounts: { BPA_CUS_01: { id: 'BPA_CUS_01', branchId: 'CN01', partyMasterId: 'PTY_CUS_01', legacyPartnerId: 'CUS_01', receivableBalance: 99 } },
      debtOpenItems: { [openItemId]: newDebtOpenItemRecord({
        branchId: 'CN01', partyAccountId: 'BPA_CUS_01', partyMasterId: 'PTY_CUS_01', legacyPartnerId: 'CUS_01',
        direction: 'RECEIVABLE', sourceType: 'INVOICE', sourceDocumentId: 'INV_ONE_DONG',
        originalAmount: 100, actorUid: 'ADMIN_01', occurredAt: '2026-08-01T00:00:00.000Z'
      }) }
    });
    await expect(executeAtomicInvoiceRefund(db, {
      invoiceId: 'INV_ONE_DONG', branchId: 'CN01', reason: 'Hủy phiếu lỗi', idempotencyKey: 'REFUND-ONE-DONG-01'
    }, actor)).rejects.toThrow('REFUND_CUSTOMER_ACCOUNT_DEBT_MISMATCH');
  });

  it('rejects reuse of a refund idempotency key with another payload', async () => {
    const { db } = createDb({
      invoices: {
        INV_A: { id: 'INV_A', branchId: 'CN01', status: 'completed', finalAmount: 0, paidAmount: 0, debtAmount: 0 },
        INV_B: { id: 'INV_B', branchId: 'CN01', status: 'completed', finalAmount: 0, paidAmount: 0, debtAmount: 0 }
      }
    });
    await executeAtomicInvoiceRefund(db, {
      invoiceId: 'INV_A', branchId: 'CN01', reason: 'Hủy phiếu A', idempotencyKey: 'REFUND-CONFLICT-001'
    }, actor);
    await expect(executeAtomicInvoiceRefund(db, {
      invoiceId: 'INV_B', branchId: 'CN01', reason: 'Hủy phiếu B', idempotencyKey: 'REFUND-CONFLICT-001'
    }, actor)).rejects.toThrow('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('fails before writes when invoice device coverage is only partial', async () => {
    const { db, data } = createDb({
      invoices: {
        INV_PARTIAL: { id: 'INV_PARTIAL', branchId: 'CN01', status: 'completed', finalAmount: 0, paidAmount: 0, debtAmount: 0, deviceIds: ['DEV_A', 'DEV_B'] }
      },
      devices: {
        DEV_A: { id: 'DEV_A', imei: '111111111111111', soldInvoiceId: 'INV_PARTIAL', status: 'sold' },
        DEV_B: { id: 'DEV_B', imei: '222222222222222', soldInvoiceId: 'INV_PARTIAL', status: 'sold' }
      }
    }, (query) => query.col === 'devices' && query.field === 'soldInvoiceId' ? 1 : undefined);
    await expect(executeAtomicInvoiceRefund(db, {
      invoiceId: 'INV_PARTIAL', branchId: 'CN01', reason: 'Đối soát thiếu máy', idempotencyKey: 'REFUND-PARTIAL-COVERAGE'
    }, actor)).rejects.toThrow('REFUND_DEVICE_COVERAGE_MISMATCH');
    expect(data.get('invoices/INV_PARTIAL')).toMatchObject({ status: 'completed' });
    expect(data.get('devices/DEV_A')).toMatchObject({ status: 'sold', soldInvoiceId: 'INV_PARTIAL' });
  });

  it('never reclaims an IMEI that has already been resold on another invoice', async () => {
    const { db, data } = createDb({
      invoices: {
        INV_OLD: { id: 'INV_OLD', branchId: 'CN01', status: 'completed', finalAmount: 0, paidAmount: 0, debtAmount: 0, imeiList: ['356789012345678'] }
      },
      devices: {
        DEV_RESALE: { id: 'DEV_RESALE', imei: '356789012345678', soldInvoiceId: 'INV_NEW', status: 'sold' }
      }
    });
    await expect(executeAtomicInvoiceRefund(db, {
      invoiceId: 'INV_OLD', branchId: 'CN01', reason: 'Hủy hóa đơn cũ', idempotencyKey: 'REFUND-RESOLD-IMEI'
    }, actor)).rejects.toThrow('REFUND_DEVICE_OWNERSHIP_MISMATCH');
    expect(data.get('invoices/INV_OLD')).toMatchObject({ status: 'completed' });
    expect(data.get('devices/DEV_RESALE')).toMatchObject({ status: 'sold', soldInvoiceId: 'INV_NEW' });
  });
});
