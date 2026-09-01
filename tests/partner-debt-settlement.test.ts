import { describe, expect, it } from 'vitest';
import { processPartnerDebtSettlement, validatePartnerDebtSettlementInput } from '../server/services/partnerDebtService';
import { debtOpenItemId, newDebtOpenItemRecord, resolvePartyIdentity } from '../server/services/branchPartyService';

type Ref = { kind: 'ref'; col: string; id: string };
type Query = {
  kind: 'query'; col: string; filters: Array<{ field: string; operator: string; value: unknown }>;
  max?: number; limit: (max: number) => Query; where: (field: string, operator: string, value: unknown) => Query;
};

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
      .filter(([key, value]) => key.startsWith(`${target.col}/`) && target.filters.every(filter =>
        filter.operator === '>' ? Number(value?.[filter.field]) > Number(filter.value) : value?.[filter.field] === filter.value
      ))
      .slice(0, target.max || Number.MAX_SAFE_INTEGER)
      .map(([key]) => snap(ref(target.col, key.slice(target.col.length + 1))));
    return { docs, empty: docs.length === 0 };
  };
  const db: any = {
    collection: (col: string) => ({
      doc: (id: string) => ref(col, id),
      where: (field: string, operator: string, value: unknown) => {
        const build = (filters: Query['filters']): Query => {
          const query: Query = {
            kind: 'query', col, filters,
            limit: (max: number) => ({ ...query, max }),
            where: (nextField: string, nextOperator: string, nextValue: unknown) => build([
              ...filters, { field: nextField, operator: nextOperator, value: nextValue }
            ])
          };
          return query;
        };
        return build([{ field, operator, value }]);
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

const actor = { uid: 'ACC_01', name: 'Kế toán', role: 'ACCOUNTANT', branchId: 'CN01', assignedBranchIds: ['CN01'] };

describe('Atomic partner debt settlement', () => {
  it('validates whole-VND amounts and an idempotency key', () => {
    expect(() => validatePartnerDebtSettlementInput({ partnerId: 'SUP', fundId: 'FUND', direction: 'PAYMENT', amount: 10.5, idempotencyKey: 'REQUEST-01' })).toThrow('PARTNER_DEBT_AMOUNT_INVALID');
    expect(() => validatePartnerDebtSettlementInput({ partnerId: 'SUP', fundId: 'FUND', direction: 'PAYMENT', amount: 10, idempotencyKey: 'short' })).toThrow('PARTNER_DEBT_IDEMPOTENCY_REQUIRED');
  });

  it('pays a supplier, allocates oldest purchase orders and writes every ledger once', async () => {
    const { db, data } = createDb({
      partners: { SUP_01: { id: 'SUP_01', branchId: 'CN01', type: 'SUPPLIER', name: 'NCC A', phone: '0905000001', outstandingDebt: 15_000_000, debtTransactions: [] } },
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
    expect([...data.values()].find(value => value?.id === `DLE_${result.settlementId}`)).toMatchObject({
      branchId: 'CN01', direction: 'PAYABLE', creditDecrease: 12_000_000
    });

    const replay = await processPartnerDebtSettlement(db, input, actor);
    expect(replay.idempotentReplay).toBe(true);
    expect(data.get('partners/SUP_01').outstandingDebt).toBe(3_000_000);
    expect(data.get('funds/FUND_01').currentBalance).toBe(38_000_000);
    await expect(processPartnerDebtSettlement(db, input, { ...actor, uid: 'ACC_02' }))
      .rejects.toThrow('PARTNER_DEBT_IDEMPOTENCY_CONFLICT');
    expect([...data.values()].filter(value => value?.sourceType === 'PURCHASE_ORDER' && value?.sourceId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'PO_01', status: 'SETTLED', openAmount: 0 }),
      expect.objectContaining({ sourceId: 'PO_02', status: 'PARTIAL', openAmount: 3_000_000 })
    ]));
  });

  it('collects customer debt and updates the linked invoice atomically', async () => {
    const { db, data } = createDb({
      partners: { CUS_01: { id: 'CUS_01', branchId: 'CN01', type: 'CUSTOMER', name: 'Khách A', phone: '0905000002', outstandingDebt: 8_000_000, debtTransactions: [] } },
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

  it('uses directional canonical balances for BOTH partners and preserves the opposite side', async () => {
    const partner = {
      id: 'BOTH_01', branchId: 'CN01', type: 'BOTH', name: 'Đối tác hai chiều',
      phone: '0905000099', outstandingDebt: 999_999_999, debtTransactions: []
    };
    const identity = resolvePartyIdentity(partner, 'CN01');
    const { db, data } = createDb({
      partners: { BOTH_01: partner },
      partyMasters: {},
      branchPartyAccounts: {
        [identity.branchPartyAccountId]: {
          id: identity.branchPartyAccountId, branchId: 'CN01', partyMasterId: identity.partyMasterId,
          legacyPartnerId: 'BOTH_01', type: 'BOTH', status: 'ACTIVE',
          payableBalance: 10_000_000, receivableBalance: 7_000_000
        }
      },
      funds: { FUND_01: { id: 'FUND_01', branchId: 'CN01', type: 'BANK', name: 'VCB', currentBalance: 50_000_000, totalExpense: 0, totalIncome: 0, isActive: true } },
      purchaseOrders: { PO_01: { id: 'PO_01', code: 'PN-01', supplierId: 'BOTH_01', branchId: 'CN01', orderDate: '2026-01-01', paidAmount: 0, debtAmount: 10_000_000, status: 'COMPLETED' } },
      invoices: { INV_01: { id: 'INV_01', invoiceCode: 'HD-01', customerId: 'BOTH_01', branchId: 'CN01', createdAt: '2026-01-01', paidAmount: 0, debtAmount: 7_000_000, status: 'completed' } }
    });

    const result = await processPartnerDebtSettlement(db, {
      partnerId: 'BOTH_01', fundId: 'FUND_01', direction: 'PAYMENT', amount: 4_000_000,
      idempotencyKey: 'BOTH-PAYMENT-REQUEST-01'
    }, actor);
    expect(result.allocations).toHaveLength(1);
    expect(data.get(`branchPartyAccounts/${identity.branchPartyAccountId}`)).toMatchObject({
      payableBalance: 6_000_000,
      receivableBalance: 7_000_000
    });
    expect(data.get('partners/BOTH_01')).toMatchObject({
      // Legacy projection is gross exposure for BOTH, not a directional source
      // that can accidentally erase the receivable side.
      outstandingDebt: 13_000_000,
      payableOutstandingDebt: 6_000_000,
      receivableOutstandingDebt: 7_000_000
    });

    const keysBeforeReplay = [...data.keys()].sort();
    const replay = await processPartnerDebtSettlement(db, {
      partnerId: 'BOTH_01', fundId: 'FUND_01', direction: 'PAYMENT', amount: 4_000_000,
      idempotencyKey: 'BOTH-PAYMENT-REQUEST-01'
    }, actor);
    expect(replay.idempotentReplay).toBe(true);
    expect([...data.keys()].sort()).toEqual(keysBeforeReplay);
    expect(data.get(`branchPartyAccounts/${identity.branchPartyAccountId}`)).toMatchObject({ payableBalance: 6_000_000, receivableBalance: 7_000_000 });
  });

  it('settles the receivable side of BOTH without touching payable balance', async () => {
    const partner = { id: 'BOTH_02', branchId: 'CN01', type: 'BOTH', name: 'Đối tác thu/chi', phone: '0905000010', outstandingDebt: 1, debtTransactions: [] };
    const identity = resolvePartyIdentity(partner, 'CN01');
    const { db, data } = createDb({
      partners: { BOTH_02: partner },
      branchPartyAccounts: { [identity.branchPartyAccountId]: { id: identity.branchPartyAccountId, branchId: 'CN01', partyMasterId: identity.partyMasterId, legacyPartnerId: 'BOTH_02', type: 'BOTH', status: 'ACTIVE', payableBalance: 9_000_000, receivableBalance: 6_000_000 } },
      funds: { FUND_01: { id: 'FUND_01', branchId: 'CN01', type: 'CASH', name: 'Két', currentBalance: 0, totalExpense: 0, totalIncome: 0, isActive: true } },
      invoices: { INV_02: { id: 'INV_02', invoiceCode: 'HD-02', customerId: 'BOTH_02', branchId: 'CN01', createdAt: '2026-01-01', paidAmount: 0, debtAmount: 6_000_000, status: 'completed' } },
      purchaseOrders: { PO_02: { id: 'PO_02', code: 'PN-02', supplierId: 'BOTH_02', branchId: 'CN01', orderDate: '2026-01-01', paidAmount: 0, debtAmount: 9_000_000, status: 'COMPLETED' } }
    });
    await processPartnerDebtSettlement(db, {
      partnerId: 'BOTH_02', fundId: 'FUND_01', direction: 'RECEIPT', amount: 2_000_000,
      idempotencyKey: 'BOTH-RECEIPT-REQUEST-01'
    }, actor);
    expect(data.get(`branchPartyAccounts/${identity.branchPartyAccountId}`)).toMatchObject({ payableBalance: 9_000_000, receivableBalance: 4_000_000 });
  });

  it('fails closed when a BOTH partner has no canonical directional account', async () => {
    const partner = { id: 'BOTH_LEGACY', branchId: 'CN01', type: 'BOTH', name: 'Đối tác legacy', phone: '0905000013', outstandingDebt: 123, debtTransactions: [] };
    const identity = resolvePartyIdentity(partner, 'CN01');
    const { db, data } = createDb({
      partners: { BOTH_LEGACY: partner },
      funds: { FUND_01: { id: 'FUND_01', branchId: 'CN01', type: 'BANK', currentBalance: 20_000_000, totalIncome: 0, totalExpense: 0, isActive: true } },
      purchaseOrders: { PO_LEGACY: { id: 'PO_LEGACY', supplierId: 'BOTH_LEGACY', branchId: 'CN01', debtAmount: 5_000_000, paidAmount: 0, status: 'COMPLETED' } },
      invoices: { INV_LEGACY: { id: 'INV_LEGACY', customerId: 'BOTH_LEGACY', branchId: 'CN01', debtAmount: 3_000_000, paidAmount: 0, status: 'COMPLETED' } }
    });
    await expect(processPartnerDebtSettlement(db, {
      partnerId: 'BOTH_LEGACY', fundId: 'FUND_01', direction: 'PAYMENT', amount: 2_000_000,
      idempotencyKey: 'BOTH-LEGACY-BACKFILL-01'
    }, actor)).rejects.toThrow('PARTNER_DEBT_ACCOUNT_REQUIRED_FOR_BOTH');
    expect(data.has(`branchPartyAccounts/${identity.branchPartyAccountId}`)).toBe(false);
    expect(data.get('partners/BOTH_LEGACY').outstandingDebt).toBe(123);
  });

  it('blocks a canonical directional balance lower than its open source debt before posting', async () => {
    const partner = { id: 'BOTH_03', branchId: 'CN01', type: 'BOTH', name: 'Sai số', phone: '0905000011', outstandingDebt: 6_000_000 };
    const identity = resolvePartyIdentity(partner, 'CN01');
    const { db, data } = createDb({
      partners: { BOTH_03: partner },
      branchPartyAccounts: { [identity.branchPartyAccountId]: { id: identity.branchPartyAccountId, branchId: 'CN01', partyMasterId: identity.partyMasterId, legacyPartnerId: 'BOTH_03', type: 'BOTH', status: 'ACTIVE', payableBalance: 5_000_000, receivableBalance: 2_000_000 } },
      funds: { FUND_01: { id: 'FUND_01', branchId: 'CN01', type: 'BANK', name: 'VCB', currentBalance: 20_000_000, isActive: true } },
      purchaseOrders: { PO_03: { id: 'PO_03', code: 'PN-03', supplierId: 'BOTH_03', branchId: 'CN01', orderDate: '2026-01-01', paidAmount: 0, debtAmount: 6_000_000, status: 'COMPLETED' } },
      invoices: { INV_03: { id: 'INV_03', invoiceCode: 'HD-03', customerId: 'BOTH_03', branchId: 'CN01', createdAt: '2026-01-01', paidAmount: 0, debtAmount: 2_000_000, status: 'completed' } }
    });
    await expect(processPartnerDebtSettlement(db, {
      partnerId: 'BOTH_03', fundId: 'FUND_01', direction: 'PAYMENT', amount: 1_000_000,
      idempotencyKey: 'BOTH-MISMATCH-REQUEST-01'
    }, actor)).rejects.toThrow('PARTNER_DEBT_ACCOUNT_BALANCE_MISMATCH');
    expect(data.get(`branchPartyAccounts/${identity.branchPartyAccountId}`)).toMatchObject({ payableBalance: 5_000_000, receivableBalance: 2_000_000 });
    expect([...data.keys()].some(key => key.startsWith('partnerDebtSettlements/'))).toBe(false);
  });

  it('allows canonical debt that includes other source types while allocating an invoice safely', async () => {
    const partner = { id: 'CUS_MIXED', branchId: 'CN01', type: 'CUSTOMER', name: 'Khách nhiều nguồn', phone: '0905000012', outstandingDebt: 9_000_000 };
    const identity = resolvePartyIdentity(partner, 'CN01');
    const { db, data } = createDb({
      partners: { CUS_MIXED: partner },
      branchPartyAccounts: { [identity.branchPartyAccountId]: { id: identity.branchPartyAccountId, branchId: 'CN01', partyMasterId: identity.partyMasterId, legacyPartnerId: 'CUS_MIXED', type: 'CUSTOMER', status: 'ACTIVE', payableBalance: 0, receivableBalance: 9_000_000 } },
      funds: { FUND_01: { id: 'FUND_01', branchId: 'CN01', type: 'CASH', currentBalance: 0, totalIncome: 0, totalExpense: 0, isActive: true } },
      invoices: { INV_MIXED: { id: 'INV_MIXED', invoiceCode: 'HD-MIXED', customerId: 'CUS_MIXED', branchId: 'CN01', createdAt: '2026-01-01', paidAmount: 0, debtAmount: 5_000_000, status: 'completed' } },
      technicalWorkOrders: { WO_MIXED: { id: 'WO_MIXED', code: 'WO-MIXED', customerId: 'CUS_MIXED', branchId: 'CN01', deliveredAt: '2026-02-01', paidAmount: 0, balanceDue: 4_000_000, status: 'DELIVERED_TO_CUSTOMER' } }
    });
    // The remaining 4m can belong to technical/ledger debt and must not make
    // an invoice settlement fail merely because it has no invoice document.
    await processPartnerDebtSettlement(db, {
      partnerId: 'CUS_MIXED', fundId: 'FUND_01', direction: 'RECEIPT', amount: 6_000_000,
      idempotencyKey: 'MIXED-SOURCE-REQUEST-01'
    }, actor);
    expect(data.get(`branchPartyAccounts/${identity.branchPartyAccountId}`).receivableBalance).toBe(3_000_000);
    expect(data.get('invoices/INV_MIXED')).toMatchObject({ debtAmount: 0, paidAmount: 5_000_000, paymentStatus: 'PAID' });
    expect(data.get('technicalWorkOrders/WO_MIXED')).toMatchObject({ balanceDue: 3_000_000, paidAmount: 1_000_000, paymentStatus: 'PARTIAL' });
    expect([...data.values()].find(value => value?.sourceType === 'TECHNICAL_WORK_ORDER' && value?.sourceId === 'WO_MIXED')).toMatchObject({
      originalAmount: 4_000_000, settledAmount: 1_000_000, openAmount: 3_000_000, status: 'PARTIAL'
    });
    expect([...data.values()].find(value => value?.workOrderId === 'WO_MIXED' && value?.partnerDebtSettlementId)).toMatchObject({
      amount: 1_000_000, customerId: 'CUS_MIXED', status: 'PAID'
    });
  });

  it('settles mixed canonical and legacy sources without double-counting the canonical source', async () => {
    const partner = { id: 'CUS_ROLLOUT', branchId: 'CN01', type: 'CUSTOMER', name: 'Khách chuyển đổi', phone: '0905000015', outstandingDebt: 9_000_000 };
    const identity = resolvePartyIdentity(partner, 'CN01');
    const canonicalItem = newDebtOpenItemRecord({
      branchId: 'CN01',
      partyAccountId: identity.branchPartyAccountId,
      partyMasterId: identity.partyMasterId,
      legacyPartnerId: 'CUS_ROLLOUT',
      direction: 'RECEIVABLE',
      sourceType: 'INVOICE',
      sourceDocumentId: 'INV_CANONICAL',
      sourceDocumentCode: 'HD-CANONICAL',
      originalAmount: 5_000_000,
      actorUid: 'SYSTEM',
      occurredAt: '2026-01-01T00:00:00.000Z'
    });
    const { db, data } = createDb({
      partners: { CUS_ROLLOUT: partner },
      branchPartyAccounts: { [identity.branchPartyAccountId]: {
        id: identity.branchPartyAccountId, branchId: 'CN01', partyMasterId: identity.partyMasterId,
        legacyPartnerId: 'CUS_ROLLOUT', type: 'CUSTOMER', status: 'ACTIVE', payableBalance: 0, receivableBalance: 9_000_000
      } },
      funds: { FUND_01: { id: 'FUND_01', branchId: 'CN01', type: 'CASH', currentBalance: 0, totalIncome: 0, totalExpense: 0, isActive: true } },
      invoices: {
        INV_CANONICAL: { id: 'INV_CANONICAL', invoiceCode: 'HD-CANONICAL', customerId: 'CUS_ROLLOUT', branchId: 'CN01', createdAt: '2026-01-01', paidAmount: 0, debtAmount: 5_000_000, status: 'completed' },
        INV_LEGACY: { id: 'INV_LEGACY', invoiceCode: 'HD-LEGACY', customerId: 'CUS_ROLLOUT', branchId: 'CN01', createdAt: '2026-02-01', paidAmount: 0, debtAmount: 4_000_000, status: 'completed' }
      },
      debtOpenItems: { [canonicalItem.id]: canonicalItem }
    });

    const result = await processPartnerDebtSettlement(db, {
      partnerId: 'CUS_ROLLOUT', fundId: 'FUND_01', direction: 'RECEIPT', amount: 6_000_000,
      idempotencyKey: 'MIXED-ROLLOUT-REQUEST-01'
    }, actor);

    expect(result.allocations.map(item => [item.sourceId, item.amount])).toEqual([
      ['INV_CANONICAL', 5_000_000],
      ['INV_LEGACY', 1_000_000]
    ]);
    expect(result.allocations.reduce((sum, item) => sum + item.amount, 0)).toBe(6_000_000);
    expect(data.get(`branchPartyAccounts/${identity.branchPartyAccountId}`).receivableBalance).toBe(3_000_000);
    expect(data.get('invoices/INV_CANONICAL')).toMatchObject({ debtAmount: 0, paymentStatus: 'PAID' });
    expect(data.get('invoices/INV_LEGACY')).toMatchObject({ debtAmount: 3_000_000, paymentStatus: 'PARTIAL' });
    expect([...data.values()].filter(value => value?.sourceType === 'INVOICE' && ['INV_CANONICAL', 'INV_LEGACY'].includes(value?.sourceId))).toHaveLength(2);
  });

  it('fails closed when an open source still uses a non-deterministic legacy open-item ID', async () => {
    const partner = { id: 'CUS_LEGACY_ITEM', branchId: 'CN01', type: 'CUSTOMER', name: 'Khách legacy item', phone: '0905000016', outstandingDebt: 5_000_000 };
    const identity = resolvePartyIdentity(partner, 'CN01');
    const canonicalItem = newDebtOpenItemRecord({
      branchId: 'CN01',
      partyAccountId: identity.branchPartyAccountId,
      partyMasterId: identity.partyMasterId,
      legacyPartnerId: partner.id,
      direction: 'RECEIVABLE',
      sourceType: 'INVOICE',
      sourceDocumentId: 'INV_LEGACY_ITEM',
      originalAmount: 5_000_000,
      actorUid: 'SYSTEM',
      occurredAt: '2026-01-01T00:00:00.000Z'
    });
    const { db, data } = createDb({
      partners: { [partner.id]: partner },
      branchPartyAccounts: { [identity.branchPartyAccountId]: {
        id: identity.branchPartyAccountId, branchId: 'CN01', partyMasterId: identity.partyMasterId,
        legacyPartnerId: partner.id, type: 'CUSTOMER', status: 'ACTIVE', payableBalance: 0, receivableBalance: 5_000_000
      } },
      funds: { FUND_01: { id: 'FUND_01', branchId: 'CN01', type: 'CASH', currentBalance: 0, totalIncome: 0, totalExpense: 0, isActive: true } },
      invoices: { INV_LEGACY_ITEM: { id: 'INV_LEGACY_ITEM', invoiceCode: 'HD-LEGACY-ITEM', customerId: partner.id, branchId: 'CN01', createdAt: '2026-01-01', paidAmount: 0, debtAmount: 5_000_000, status: 'completed' } },
      debtOpenItems: { LEGACY_OPEN_ITEM_01: canonicalItem }
    });

    await expect(processPartnerDebtSettlement(db, {
      partnerId: partner.id, fundId: 'FUND_01', direction: 'RECEIPT', amount: 1_000_000,
      idempotencyKey: 'LEGACY-OPEN-ITEM-REQUEST-01'
    }, actor)).rejects.toThrow('PARTNER_DEBT_OPEN_ITEM_MIGRATION_REQUIRED');

    expect(data.get('funds/FUND_01').currentBalance).toBe(0);
    expect(data.get(`branchPartyAccounts/${identity.branchPartyAccountId}`).receivableBalance).toBe(5_000_000);
    expect(data.get('invoices/INV_LEGACY_ITEM')).toMatchObject({ paidAmount: 0, debtAmount: 5_000_000 });
    expect(data.has(`debtOpenItems/${debtOpenItemId('INVOICE', 'INV_LEGACY_ITEM', 'RECEIVABLE')}`)).toBe(false);
    expect([...data.keys()].some(key => key.startsWith('partnerDebtSettlements/'))).toBe(false);
  });

  it('does not reopen a terminal legacy open-item that no longer has an allocation key', async () => {
    const partner = { id: 'CUS_TERMINAL_LEGACY', branchId: 'CN01', type: 'CUSTOMER', name: 'Khách terminal legacy', phone: '0905000018', outstandingDebt: 5_000_000 };
    const identity = resolvePartyIdentity(partner, 'CN01');
    const openItem = newDebtOpenItemRecord({
      branchId: 'CN01',
      partyAccountId: identity.branchPartyAccountId,
      partyMasterId: identity.partyMasterId,
      legacyPartnerId: partner.id,
      direction: 'RECEIVABLE',
      sourceType: 'INVOICE',
      sourceDocumentId: 'INV_TERMINAL_LEGACY',
      originalAmount: 5_000_000,
      actorUid: 'SYSTEM',
      occurredAt: '2026-01-01T00:00:00.000Z'
    });
    const terminalLegacyItem = {
      ...openItem,
      id: 'LEGACY_SETTLED_ITEM_01',
      settledAmount: 5_000_000,
      openAmount: 0,
      status: 'SETTLED',
      isOpen: false,
      allocationKey: null
    };
    const { db, data } = createDb({
      partners: { [partner.id]: partner },
      branchPartyAccounts: { [identity.branchPartyAccountId]: {
        id: identity.branchPartyAccountId, branchId: 'CN01', partyMasterId: identity.partyMasterId,
        legacyPartnerId: partner.id, type: 'CUSTOMER', status: 'ACTIVE', payableBalance: 0, receivableBalance: 5_000_000
      } },
      funds: { FUND_01: { id: 'FUND_01', branchId: 'CN01', type: 'CASH', currentBalance: 0, totalIncome: 0, totalExpense: 0, isActive: true } },
      invoices: { INV_TERMINAL_LEGACY: {
        id: 'INV_TERMINAL_LEGACY', invoiceCode: 'HD-TERMINAL-LEGACY', customerId: partner.id,
        branchId: 'CN01', createdAt: '2026-01-01', paidAmount: 0, debtAmount: 5_000_000, status: 'completed'
      } },
      debtOpenItems: { LEGACY_SETTLED_ITEM_01: terminalLegacyItem }
    });

    await expect(processPartnerDebtSettlement(db, {
      partnerId: partner.id, fundId: 'FUND_01', direction: 'RECEIPT', amount: 1_000_000,
      idempotencyKey: 'TERMINAL-LEGACY-REQUEST-01'
    }, actor)).rejects.toThrow('PARTNER_DEBT_OPEN_ITEM_MIGRATION_REQUIRED');

    expect(data.get('funds/FUND_01').currentBalance).toBe(0);
    expect(data.get(`branchPartyAccounts/${identity.branchPartyAccountId}`).receivableBalance).toBe(5_000_000);
    expect(data.get('invoices/INV_TERMINAL_LEGACY')).toMatchObject({ paidAmount: 0, debtAmount: 5_000_000 });
    expect(data.get('debtOpenItems/LEGACY_SETTLED_ITEM_01')).toEqual(terminalLegacyItem);
    expect(data.has(`debtOpenItems/${debtOpenItemId('INVOICE', 'INV_TERMINAL_LEGACY', 'RECEIVABLE')}`)).toBe(false);
    expect([...data.keys()].some(key => key.startsWith('partnerDebtSettlements/'))).toBe(false);
  });

  it('rejects duplicate open-items for one source before mutating debt or funds', async () => {
    const partner = { id: 'CUS_DUP_ITEM', branchId: 'CN01', type: 'CUSTOMER', name: 'Khách trùng item', phone: '0905000017', outstandingDebt: 5_000_000 };
    const identity = resolvePartyIdentity(partner, 'CN01');
    const canonicalItem = newDebtOpenItemRecord({
      branchId: 'CN01',
      partyAccountId: identity.branchPartyAccountId,
      partyMasterId: identity.partyMasterId,
      legacyPartnerId: partner.id,
      direction: 'RECEIVABLE',
      sourceType: 'INVOICE',
      sourceDocumentId: 'INV_DUP_ITEM',
      originalAmount: 5_000_000,
      actorUid: 'SYSTEM',
      occurredAt: '2026-01-01T00:00:00.000Z'
    });
    const { db, data } = createDb({
      partners: { [partner.id]: partner },
      branchPartyAccounts: { [identity.branchPartyAccountId]: {
        id: identity.branchPartyAccountId, branchId: 'CN01', partyMasterId: identity.partyMasterId,
        legacyPartnerId: partner.id, type: 'CUSTOMER', status: 'ACTIVE', payableBalance: 0, receivableBalance: 5_000_000
      } },
      funds: { FUND_01: { id: 'FUND_01', branchId: 'CN01', type: 'CASH', currentBalance: 0, totalIncome: 0, totalExpense: 0, isActive: true } },
      invoices: { INV_DUP_ITEM: { id: 'INV_DUP_ITEM', invoiceCode: 'HD-DUP-ITEM', customerId: partner.id, branchId: 'CN01', createdAt: '2026-01-01', paidAmount: 0, debtAmount: 5_000_000, status: 'completed' } },
      debtOpenItems: {
        [canonicalItem.id]: canonicalItem,
        LEGACY_DUPLICATE_ITEM: canonicalItem
      }
    });

    await expect(processPartnerDebtSettlement(db, {
      partnerId: partner.id, fundId: 'FUND_01', direction: 'RECEIPT', amount: 1_000_000,
      idempotencyKey: 'DUPLICATE-OPEN-ITEM-REQUEST-01'
    }, actor)).rejects.toThrow('PARTNER_DEBT_OPEN_ITEM_DUPLICATE');

    expect(data.get('funds/FUND_01').currentBalance).toBe(0);
    expect(data.get(`branchPartyAccounts/${identity.branchPartyAccountId}`).receivableBalance).toBe(5_000_000);
    expect(data.get('invoices/INV_DUP_ITEM')).toMatchObject({ paidAmount: 0, debtAmount: 5_000_000 });
    expect([...data.keys()].some(key => key.startsWith('partnerDebtSettlements/'))).toBe(false);
  });

  it('fails closed when the canonical balance contains a source that has not been migrated to open items', async () => {
    const partner = { id: 'CUS_INCOMPLETE', branchId: 'CN01', type: 'CUSTOMER', name: 'Khách legacy', phone: '0905000014', outstandingDebt: 9_000_000 };
    const identity = resolvePartyIdentity(partner, 'CN01');
    const { db, data } = createDb({
      partners: { CUS_INCOMPLETE: partner },
      branchPartyAccounts: { [identity.branchPartyAccountId]: { id: identity.branchPartyAccountId, branchId: 'CN01', partyMasterId: identity.partyMasterId, legacyPartnerId: 'CUS_INCOMPLETE', type: 'CUSTOMER', status: 'ACTIVE', payableBalance: 0, receivableBalance: 9_000_000 } },
      funds: { FUND_01: { id: 'FUND_01', branchId: 'CN01', type: 'CASH', currentBalance: 0, totalIncome: 0, totalExpense: 0, isActive: true } },
      invoices: { INV_ONLY: { id: 'INV_ONLY', invoiceCode: 'HD-ONLY', customerId: 'CUS_INCOMPLETE', branchId: 'CN01', createdAt: '2026-01-01', paidAmount: 0, debtAmount: 5_000_000, status: 'completed' } }
    });
    await expect(processPartnerDebtSettlement(db, {
      partnerId: 'CUS_INCOMPLETE', fundId: 'FUND_01', direction: 'RECEIPT', amount: 1_000_000,
      idempotencyKey: 'INCOMPLETE-MIGRATION-01'
    }, actor)).rejects.toThrow('PARTNER_DEBT_OPEN_ITEMS_INCOMPLETE');
    expect(data.get(`branchPartyAccounts/${identity.branchPartyAccountId}`).receivableBalance).toBe(9_000_000);
    expect(data.get('funds/FUND_01').currentBalance).toBe(0);
  });
});
