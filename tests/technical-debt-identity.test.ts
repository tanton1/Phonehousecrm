import { describe, expect, it } from 'vitest';
import {
  processCollectTechnicalDebtPayment,
  processDeliverToCustomer
} from '../server/services/technicalService';
import { debtOpenItemId, resolvePartyIdentity } from '../server/services/branchPartyService';

type Ref = { kind: 'ref'; col: string; id: string; docId: string };

function createTechnicalDebtDb(seed: Record<string, Record<string, any>>) {
  const data = new Map<string, any>();
  Object.entries(seed).forEach(([collection, docs]) => {
    Object.entries(docs).forEach(([id, value]) => data.set(`${collection}/${id}`, { ...value }));
  });

  const ref = (col: string, id: string): Ref => ({ kind: 'ref', col, id, docId: id });
  const snapshot = (target: Ref) => ({
    id: target.id,
    ref: target,
    exists: data.has(`${target.col}/${target.id}`),
    data: () => data.get(`${target.col}/${target.id}`)
  });
  const write = (target: Ref, value: any, merge = false) => {
    const key = `${target.col}/${target.id}`;
    data.set(key, merge ? { ...data.get(key), ...value } : { ...value });
  };

  const db: any = {
    collection: (col: string) => ({ doc: (id: string) => ref(col, id) }),
    runTransaction: async (callback: any) => callback({
      get: async (target: Ref) => snapshot(target),
      create: (target: Ref, value: any) => {
        const key = `${target.col}/${target.id}`;
        if (data.has(key)) throw new Error(`ALREADY_EXISTS:${key}`);
        write(target, value);
      },
      set: (target: Ref, value: any, options?: { merge?: boolean }) => write(target, value, options?.merge === true),
      update: (target: Ref, value: any) => {
        const key = `${target.col}/${target.id}`;
        if (!data.has(key)) throw new Error(`NOT_FOUND:${key}`);
        write(target, value, true);
      }
    })
  };

  return { db, data };
}

function createDeliveryScenario() {
  return createTechnicalDebtDb({
    technicalWorkOrders: {
      WO_DEBT_01: {
        id: 'WO_DEBT_01',
        code: 'WO-2026-0001',
        assetOwnership: 'CUSTOMER',
        workOrderType: 'CUSTOMER_SERVICE',
        status: 'QC_PASSED',
        quoteStatus: 'APPROVED',
        approvedFinalAmount: 1_500_000,
        customerName: 'Khách sửa chữa',
        customerPhone: '0905 111 222',
        branchId: 'CN01',
        taskLineIds: []
      }
    },
    funds: {
      FUND_CASH_01: {
        id: 'FUND_CASH_01', branchId: 'CN01', type: 'CASH', name: 'Két CN01',
        currentBalance: 0, totalIncome: 0, isActive: true
      }
    }
  });
}

function createDeliveryScenarioWithCustomerProjection(overrides: {
  customer?: Record<string, unknown>;
  account?: Record<string, unknown>;
}) {
  const customerId = 'CUS_TECH_PROJECTION_01';
  const customer = {
    id: customerId,
    branchId: 'CN01',
    type: 'CUSTOMER',
    name: 'Khách projection',
    phone: '0905 222 333'
  };
  const identity = resolvePartyIdentity(customer, 'CN01');
  return createTechnicalDebtDb({
    technicalWorkOrders: {
      WO_DEBT_01: {
        id: 'WO_DEBT_01', code: 'WO-2026-0001', assetOwnership: 'CUSTOMER',
        workOrderType: 'CUSTOMER_SERVICE', status: 'QC_PASSED', quoteStatus: 'APPROVED',
        approvedFinalAmount: 1_500_000, customerId, customerName: customer.name,
        customerPhone: customer.phone, branchId: 'CN01', taskLineIds: []
      }
    },
    funds: {
      FUND_CASH_01: {
        id: 'FUND_CASH_01', branchId: 'CN01', type: 'CASH', name: 'Két CN01',
        currentBalance: 0, totalIncome: 0, isActive: true
      }
    },
    partners: {
      [customerId]: {
        ...customer,
        partyMasterId: identity.partyMasterId,
        branchPartyAccountId: identity.branchPartyAccountId,
        outstandingDebt: 0,
        totalSpent: 0,
        ...overrides.customer
      }
    },
    partyMasters: {
      [identity.partyMasterId]: { id: identity.partyMasterId, displayName: customer.name, status: 'ACTIVE' }
    },
    branchPartyAccounts: {
      [identity.branchPartyAccountId]: {
        id: identity.branchPartyAccountId, branchId: 'CN01', partyMasterId: identity.partyMasterId,
        legacyPartnerId: customerId, type: 'CUSTOMER', status: 'ACTIVE',
        payableBalance: 0, receivableBalance: 0, totalSales: 0,
        ...overrides.account
      }
    }
  });
}

const deliveryActor = { uid: 'SALE_01', name: 'Nhân viên giao máy', role: 'SALES', branchId: 'CN01' };
const collector = { uid: 'ACC_01', name: 'Kế toán CN01', role: 'ACCOUNTANT', branchId: 'CN01' };

describe('Technical repair debt customer identity', () => {
  it('replays customer delivery only for the same payload, actor and authoritative branch', async () => {
    const { db, data } = createDeliveryScenario();
    const input = {
      idempotencyKey: 'deliver-idempotency-scope-0001',
      paidAmount: 500_000,
      paymentMethod: 'CASH' as const,
      fundId: 'FUND_CASH_01',
      note: 'Thu tiền tại quầy'
    };

    await processDeliverToCustomer(db, 'WO_DEBT_01', 'Đã giao đúng máy cho khách', deliveryActor, input);
    const fundAfterFirstDelivery = { ...data.get('funds/FUND_CASH_01') };
    const customerId = data.get('technicalWorkOrders/WO_DEBT_01').customerId;
    const customerAfterFirstDelivery = { ...data.get(`partners/${customerId}`) };
    const idempotencyRecord = [...data.entries()]
      .find(([key]) => key.startsWith('technicalOperationIdempotency/'))?.[1];

    expect(idempotencyRecord).toMatchObject({
      scope: 'DELIVER_CUSTOMER',
      workOrderId: 'WO_DEBT_01',
      actorUid: deliveryActor.uid,
      branchId: 'CN01'
    });
    expect(idempotencyRecord.payloadHash).toMatch(/^[a-f0-9]{64}$/);

    const replay = await processDeliverToCustomer(db, 'WO_DEBT_01', 'Đã giao đúng máy cho khách', deliveryActor, input);
    expect(replay).toEqual({ success: true, workOrderId: 'WO_DEBT_01' });
    expect(data.get('funds/FUND_CASH_01')).toEqual(fundAfterFirstDelivery);
    expect(data.get(`partners/${customerId}`)).toEqual(customerAfterFirstDelivery);

    await expect(processDeliverToCustomer(db, 'WO_DEBT_01', 'Giao máy với ghi chú đã đổi', deliveryActor, input))
      .rejects.toThrow('TECHNICAL_DELIVERY_IDEMPOTENCY_CONFLICT');
    await expect(processDeliverToCustomer(db, 'WO_DEBT_01', 'Đã giao đúng máy cho khách', deliveryActor, {
      ...input,
      paidAmount: 400_000
    })).rejects.toThrow('TECHNICAL_DELIVERY_IDEMPOTENCY_CONFLICT');
    await expect(processDeliverToCustomer(db, 'WO_DEBT_01', 'Đã giao đúng máy cho khách', {
      ...deliveryActor,
      uid: 'SALE_02'
    }, input)).rejects.toThrow('TECHNICAL_DELIVERY_IDEMPOTENCY_CONFLICT');

    await expect(processDeliverToCustomer(db, 'WO_DEBT_01', 'Đã giao đúng máy cho khách', {
      ...deliveryActor,
      branchId: 'CN02'
    }, input)).rejects.toThrow('BRANCH_FORBIDDEN');

    data.set('technicalWorkOrders/WO_DEBT_01', {
      ...data.get('technicalWorkOrders/WO_DEBT_01'),
      branchId: 'CN02'
    });
    await expect(processDeliverToCustomer(db, 'WO_DEBT_01', 'Đã giao đúng máy cho khách', {
      ...deliveryActor,
      branchId: 'CN02'
    }, input)).rejects.toThrow('TECHNICAL_DELIVERY_IDEMPOTENCY_CONFLICT');

    data.delete('technicalWorkOrders/WO_DEBT_01');
    await expect(processDeliverToCustomer(db, 'WO_DEBT_01', 'Đã giao đúng máy cho khách', deliveryActor, input))
      .rejects.toThrow('WORK_ORDER_NOT_FOUND');
  });

  it('persists the phone-derived customer identity at delivery and reuses it for a later debt collection', async () => {
    const { db, data } = createDeliveryScenario();

    await processDeliverToCustomer(db, 'WO_DEBT_01', 'Đã giao đúng máy cho khách', deliveryActor, {
      idempotencyKey: 'deliver-technical-debt-0001',
      paidAmount: 500_000,
      paymentMethod: 'CASH',
      fundId: 'FUND_CASH_01'
    });

    const deliveredWorkOrder = data.get('technicalWorkOrders/WO_DEBT_01');
    expect(deliveredWorkOrder.customerId).toMatch(/^TECHCUS_/);
    expect(deliveredWorkOrder.partyMasterId).toMatch(/^PTY_/);
    expect(deliveredWorkOrder.branchPartyAccountId).toMatch(/^BPA_/);
    expect(deliveredWorkOrder).toMatchObject({
      status: 'DELIVERED_TO_CUSTOMER', paidAmount: 500_000, balanceDue: 1_000_000, paymentStatus: 'PARTIAL'
    });
    expect(data.get('cashTransactions/TECH_REPAIR_RECEIPT_WO_DEBT_01')).toMatchObject({
      partnerId: deliveredWorkOrder.customerId,
      branchId: 'CN01',
      amount: 500_000
    });
    expect(data.get(`partners/${deliveredWorkOrder.customerId}`)).toMatchObject({
      id: deliveredWorkOrder.customerId,
      branchId: 'CN01',
      partyMasterId: deliveredWorkOrder.partyMasterId,
      branchPartyAccountId: deliveredWorkOrder.branchPartyAccountId,
      outstandingDebt: 1_000_000
    });
    const openItemId = debtOpenItemId('TECHNICAL_WORK_ORDER', 'WO_DEBT_01', 'RECEIVABLE');
    expect(data.get(`debtOpenItems/${openItemId}`)).toMatchObject({
      sourceType: 'TECHNICAL_WORK_ORDER', sourceId: 'WO_DEBT_01', originalAmount: 1_500_000,
      settledAmount: 500_000, openAmount: 1_000_000, status: 'PARTIAL', isOpen: true
    });

    const result = await processCollectTechnicalDebtPayment(db, 'WO_DEBT_01', {
      amount: 1_000_000,
      paymentMethod: 'CASH',
      fundId: 'FUND_CASH_01',
      idempotencyKey: 'collect-technical-debt-0001'
    }, collector);

    expect(result.balanceDue).toBe(0);
    expect(data.get('technicalWorkOrders/WO_DEBT_01')).toMatchObject({ paidAmount: 1_500_000, balanceDue: 0, paymentStatus: 'PAID' });
    expect(data.get(`partners/${deliveredWorkOrder.customerId}`).outstandingDebt).toBe(0);
    expect(data.get(`branchPartyAccounts/${deliveredWorkOrder.branchPartyAccountId}`).receivableBalance).toBe(0);
    expect(data.get(`debtOpenItems/${openItemId}`)).toMatchObject({
      settledAmount: 1_500_000, openAmount: 0, status: 'SETTLED', isOpen: false,
      lastSettlementId: result.paymentId
    });
    expect(data.get('funds/FUND_CASH_01')).toMatchObject({ currentBalance: 1_500_000, totalIncome: 1_500_000 });
    expect(data.get(`cashTransactions/TECH_DEBT_RECEIPT_${result.paymentId}`)).toMatchObject({
      partnerId: deliveredWorkOrder.customerId,
      branchId: 'CN01',
      amount: 1_000_000,
      isPLAccounted: false
    });
    await expect(processCollectTechnicalDebtPayment(db, 'WO_DEBT_01', {
      amount: 500_000,
      paymentMethod: 'CASH',
      fundId: 'FUND_CASH_01',
      idempotencyKey: 'collect-technical-debt-0001'
    }, collector)).rejects.toThrow('TECHNICAL_PAYMENT_IDEMPOTENCY_CONFLICT');
  });

  it('replays the original collection result after later payments change the work-order balance', async () => {
    const { db, data } = createDeliveryScenario();
    await processDeliverToCustomer(db, 'WO_DEBT_01', 'Đã giao đúng máy cho khách', deliveryActor, {
      idempotencyKey: 'deliver-technical-debt-replay-0001',
      paidAmount: 500_000,
      paymentMethod: 'CASH',
      fundId: 'FUND_CASH_01'
    });
    const firstInput = {
      amount: 400_000,
      paymentMethod: 'CASH' as const,
      fundId: 'FUND_CASH_01',
      idempotencyKey: 'collect-technical-debt-replay-a-0001'
    };
    const first = await processCollectTechnicalDebtPayment(db, 'WO_DEBT_01', firstInput, collector);
    expect(first.balanceDue).toBe(600_000);
    const second = await processCollectTechnicalDebtPayment(db, 'WO_DEBT_01', {
      amount: 600_000,
      paymentMethod: 'CASH',
      fundId: 'FUND_CASH_01',
      idempotencyKey: 'collect-technical-debt-replay-b-0001'
    }, collector);
    expect(second.balanceDue).toBe(0);
    const fundAfterBothPayments = { ...data.get('funds/FUND_CASH_01') };
    const paymentCount = [...data.keys()].filter(key => key.startsWith('repairPayments/')).length;

    const replay = await processCollectTechnicalDebtPayment(db, 'WO_DEBT_01', firstInput, collector);
    expect(replay).toEqual({ success: true, balanceDue: 600_000, paymentId: first.paymentId });
    expect(data.get('funds/FUND_CASH_01')).toEqual(fundAfterBothPayments);
    expect([...data.keys()].filter(key => key.startsWith('repairPayments/'))).toHaveLength(paymentCount);

    const legacyIdempotencyEntry = [...data.entries()].find(([, value]) =>
      value?.scope === 'TECH_DEBT_PAYMENT' && value?.paymentId === first.paymentId
    );
    expect(legacyIdempotencyEntry).toBeDefined();
    const [legacyIdempotencyKey, legacyIdempotencyRecord] = legacyIdempotencyEntry!;
    const { resultBalanceDue: _removedResult, ...legacyWithoutResult } = legacyIdempotencyRecord;
    data.set(legacyIdempotencyKey, legacyWithoutResult);
    await expect(processCollectTechnicalDebtPayment(db, 'WO_DEBT_01', firstInput, collector))
      .rejects.toThrow('TECHNICAL_PAYMENT_IDEMPOTENCY_RESULT_MISSING');
    expect(data.get('funds/FUND_CASH_01')).toEqual(fundAfterBothPayments);
    expect([...data.keys()].filter(key => key.startsWith('repairPayments/'))).toHaveLength(paymentCount);
  });

  it.each([
    { label: 'Infinity', paidAmount: Number.POSITIVE_INFINITY },
    { label: 'decimal', paidAmount: 500_000.5 },
    { label: 'overflow on addition', paidAmount: Number.MAX_SAFE_INTEGER - 100_000 }
  ])('rejects persisted paidAmount $label before collecting technical debt', async ({ label, paidAmount }) => {
    const { db, data } = createDeliveryScenario();
    await processDeliverToCustomer(db, 'WO_DEBT_01', 'Đã giao đúng máy cho khách', deliveryActor, {
      idempotencyKey: 'deliver-invalid-paid-projection-0001',
      paidAmount: 500_000,
      paymentMethod: 'CASH',
      fundId: 'FUND_CASH_01'
    });
    data.set('technicalWorkOrders/WO_DEBT_01', {
      ...data.get('technicalWorkOrders/WO_DEBT_01'),
      paidAmount
    });
    const fundBefore = { ...data.get('funds/FUND_CASH_01') };
    const paymentCount = [...data.keys()].filter(key => key.startsWith('repairPayments/')).length;

    await expect(processCollectTechnicalDebtPayment(db, 'WO_DEBT_01', {
      amount: 500_000,
      paymentMethod: 'CASH',
      fundId: 'FUND_CASH_01',
      idempotencyKey: `collect-invalid-paid-${String(label).replace(/\s+/g, '-').toLowerCase()}-0001`
    }, collector)).rejects.toThrow('REPAIR_PAYMENT_PAID_AMOUNT_INVALID');

    expect(data.get('funds/FUND_CASH_01')).toEqual(fundBefore);
    expect([...data.keys()].filter(key => key.startsWith('repairPayments/'))).toHaveLength(paymentCount);
    expect([...data.keys()].some(key => key.startsWith('cashTransactions/TECH_DEBT_RECEIPT_'))).toBe(false);
  });

  it.each([
    {
      label: 'account receivable Infinity',
      overrides: { account: { receivableBalance: Number.POSITIVE_INFINITY } },
      error: 'CUSTOMER_ACCOUNT_RECEIVABLE_BALANCE_INVALID'
    },
    {
      label: 'customer outstanding debt decimal',
      overrides: { customer: { outstandingDebt: 1.5 } },
      error: 'CUSTOMER_OUTSTANDING_DEBT_INVALID'
    },
    {
      label: 'account receivable overflow',
      overrides: { account: { receivableBalance: Number.MAX_SAFE_INTEGER - 500_000 } },
      error: 'CUSTOMER_ACCOUNT_RECEIVABLE_BALANCE_INVALID'
    }
  ])('rejects invalid persisted money projection before delivery writes: $label', async ({ overrides, error }) => {
    const { db, data } = createDeliveryScenarioWithCustomerProjection(overrides);
    const fundBefore = { ...data.get('funds/FUND_CASH_01') };
    const workOrderBefore = { ...data.get('technicalWorkOrders/WO_DEBT_01') };
    const customerBefore = { ...data.get('partners/CUS_TECH_PROJECTION_01') };

    await expect(processDeliverToCustomer(db, 'WO_DEBT_01', 'Đã giao đúng máy cho khách', deliveryActor, {
      idempotencyKey: `delivery-invalid-projection-${String(error).toLowerCase()}`,
      paidAmount: 500_000,
      paymentMethod: 'CASH',
      fundId: 'FUND_CASH_01'
    })).rejects.toThrow(error);

    expect(data.get('funds/FUND_CASH_01')).toEqual(fundBefore);
    expect(data.get('technicalWorkOrders/WO_DEBT_01')).toEqual(workOrderBefore);
    expect(data.get('partners/CUS_TECH_PROJECTION_01')).toEqual(customerBefore);
    expect([...data.keys()].some(key => key.startsWith('cashTransactions/'))).toBe(false);
    expect([...data.keys()].some(key => key.startsWith('repairPayments/'))).toBe(false);
    expect([...data.keys()].some(key => key.startsWith('technicalOperationIdempotency/'))).toBe(false);
  });

  it('fails closed before collection when the persisted account belongs to another branch', async () => {
    const { db, data } = createDeliveryScenario();
    await processDeliverToCustomer(db, 'WO_DEBT_01', 'Đã giao đúng máy cho khách', deliveryActor, {
      idempotencyKey: 'deliver-technical-debt-0002',
      paidAmount: 0,
      paymentMethod: 'DEBT'
    });

    const workOrder = data.get('technicalWorkOrders/WO_DEBT_01');
    const accountKey = `branchPartyAccounts/${workOrder.branchPartyAccountId}`;
    data.set(accountKey, { ...data.get(accountKey), branchId: 'CN02' });

    await expect(processCollectTechnicalDebtPayment(db, 'WO_DEBT_01', {
      amount: 500_000,
      paymentMethod: 'CASH',
      fundId: 'FUND_CASH_01',
      idempotencyKey: 'collect-technical-debt-0002'
    }, collector)).rejects.toThrow('CUSTOMER_DEBT_ACCOUNT_BRANCH_MISMATCH');

    expect(data.get('funds/FUND_CASH_01')).toMatchObject({ currentBalance: 0, totalIncome: 0 });
    expect(data.get('technicalWorkOrders/WO_DEBT_01')).toMatchObject({ paidAmount: 0, balanceDue: 1_500_000 });
    expect([...data.keys()].some(key => key.startsWith('cashTransactions/TECH_DEBT_RECEIPT_'))).toBe(false);
  });
});
