import { describe, expect, it } from 'vitest';
import { approvePayrollRun, getMyPayrollSlip, payPayrollRun } from '../server/services/payrollService';

function createStore(seed: Record<string, Record<string, any>>) {
  const data = new Map<string, any>();
  Object.entries(seed).forEach(([collection, docs]) => Object.entries(docs).forEach(([id, value]) => data.set(`${collection}/${id}`, { ...value })));
  let generated = 0;
  const snapshot = (ref: any) => ({ id: ref.id, ref, exists: data.has(ref.path), data: () => data.get(ref.path) });
  const collection = (name: string) => {
    const makeQuery = (filters: Array<[string, string, any]> = [], cap = Number.POSITIVE_INFINITY): any => ({
      __query: true,
      where(field: string, operator: string, value: any) { return makeQuery([...filters, [field, operator, value]], cap); },
      limit(value: number) { return makeQuery(filters, value); },
      async get() {
        const docs = [...data.entries()]
          .filter(([path]) => path.startsWith(`${name}/`) && !path.slice(name.length + 1).includes('/'))
          .map(([path]) => ({ path, id: path.slice(name.length + 1) }))
          .filter(({ path }) => filters.every(([field, operator, value]) => operator === '==' && data.get(path)?.[field] === value))
          .slice(0, cap)
          .map(({ id }) => snapshot({ id, path: `${name}/${id}` }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      }
    });
    return {
      ...makeQuery(),
      doc(id?: string) {
        const resolved = id || `AUTO_${++generated}`;
        const ref: any = { id: resolved, path: `${name}/${resolved}` };
        ref.get = async () => snapshot(ref);
        return ref;
      }
    };
  };
  const db: any = {
    collection,
    async runTransaction(handler: any) {
      return handler({
        get: async (target: any) => target.__query ? target.get() : snapshot(target),
        set: (ref: any, value: any) => data.set(ref.path, { ...value }),
        update: (ref: any, value: any) => {
          if (!data.has(ref.path)) throw new Error(`missing ${ref.path}`);
          data.set(ref.path, { ...data.get(ref.path), ...value });
        }
      });
    }
  };
  return {
    db,
    get: (name: string, id: string) => data.get(`${name}/${id}`),
    set: (name: string, id: string, value: Record<string, any>) => data.set(`${name}/${id}`, { ...value })
  };
}

describe('Payroll approval and payment integrity', () => {
  it('loads an approved payroll slip strictly by canonical Firebase auth UID', async () => {
    const store = createStore({
      payrollRuns: {
        PAYROLL_2026_08_CN01: { id: 'PAYROLL_2026_08_CN01', period: '2026-08', branchId: 'CN01', status: 'APPROVED' }
      },
      payrollRunItems: {
        PAYROLL_2026_08_CN01_AUTH_01: { runId: 'PAYROLL_2026_08_CN01', staffUid: 'AUTH_01', staffId: 'AUTH_01', staffName: 'KTV chính' }
      },
      payrollStaffLocks: {
        '2026-08_AUTH_01': { period: '2026-08', staffUid: 'AUTH_01', staffId: 'AUTH_01', runId: 'PAYROLL_2026_08_CN01' }
      }
    });
    const slip = await getMyPayrollSlip(store.db, { uid: 'AUTH_01', role: 'TECHNICIAN', branchId: 'CN02' }, '2026-08');
    expect(slip).toMatchObject({ id: 'PAYROLL_2026_08_CN01_AUTH_01', staffUid: 'AUTH_01', staffId: 'AUTH_01', runStatus: 'APPROVED' });
  });

  it('locks one staff member to one approved run for the period', async () => {
    const store = createStore({
      payrollRuns: {
        PAYROLL_2026_08_CN01: { id: 'PAYROLL_2026_08_CN01', period: '2026-08', branchId: 'CN01', status: 'DRAFT', calculatedBy: 'MAKER', blockingIssueCount: 0, staffCount: 1, totalPayroll: 1_000_000, totalCommission: 0 },
        PAYROLL_2026_08_CN02: { id: 'PAYROLL_2026_08_CN02', period: '2026-08', branchId: 'CN02', status: 'DRAFT', calculatedBy: 'MAKER_2', blockingIssueCount: 0, staffCount: 1, totalPayroll: 1_000_000, totalCommission: 0 }
      },
      payrollRunItems: {
        PAYROLL_2026_08_CN01_STAFF_01: { runId: 'PAYROLL_2026_08_CN01', staffUid: 'STAFF_01', staffId: 'STAFF_01', payrollBranchId: 'CN01', status: 'DRAFT', proratedBaseSalary: 700_000, netSalary: 1_000_000, posCommission: 0, techCommission: 0, adjustmentEarnings: 300_000, adjustmentDeductions: 0, advances: 0, commissionEntryIds: ['COMM_1'], commissionEntryAmounts: { COMM_1: 0 }, commissionEntrySnapshots: { COMM_1: { amount: 0, sourceBranchId: 'CN01', payrollBranchId: 'CN01', commissionCategory: '' } }, adjustmentEntryIds: ['ADJ_1'], adjustmentEntryAmounts: { ADJ_1: 300_000 } },
        PAYROLL_2026_08_CN02_STAFF_01: { runId: 'PAYROLL_2026_08_CN02', staffUid: 'STAFF_01', staffId: 'STAFF_01', payrollBranchId: 'CN02', status: 'DRAFT', proratedBaseSalary: 1_000_000, netSalary: 1_000_000, posCommission: 0, techCommission: 0, commissionEntryIds: [], commissionEntryAmounts: {}, commissionEntrySnapshots: {}, adjustmentEntryIds: [], adjustmentEntryAmounts: {} }
      },
      users: { STAFF_01: { authUid: 'STAFF_01', active: true, branchId: 'CN01', payrollBranchId: 'CN01', assignedBranchIds: ['CN01', 'CN02'] } },
      commissionLedger: {
        COMM_1: { payrollPeriod: '2026-08', payrollBranchId: 'CN01', branchId: 'CN01', staffUid: 'STAFF_01', status: 'ELIGIBLE' }
      },
      payrollAdjustments: {
        ADJ_1: { period: '2026-08', branchId: 'CN01', staffUid: 'STAFF_01', status: 'APPROVED', type: 'EARNING', amount: 300_000 }
      }
    });
    await approvePayrollRun(store.db, { uid: 'CHECKER', role: 'MANAGER', branchId: 'CN01' }, 'PAYROLL_2026_08_CN01');
    expect(store.get('payrollStaffLocks', '2026-08_STAFF_01')).toMatchObject({ runId: 'PAYROLL_2026_08_CN01', staffUid: 'STAFF_01' });
    expect(store.get('payrollAdjustments', 'ADJ_1')).toMatchObject({ payrollPostingId: 'PAYROLL_2026_08_CN01' });
    store.set('users', 'STAFF_01', { authUid: 'STAFF_01', active: true, branchId: 'CN02', payrollBranchId: 'CN02', assignedBranchIds: ['CN01', 'CN02'] });
    await expect(approvePayrollRun(store.db, { uid: 'ADMIN_CHECKER', role: 'ADMIN' }, 'PAYROLL_2026_08_CN02'))
      .rejects.toThrow('PAYROLL_STAFF_ALREADY_LOCKED');
  });

  it('posts eligible canonical commission from every source branch into the staff home payroll run', async () => {
    const store = createStore({
      payrollRuns: {
        PAYROLL_2026_08_CN01: { id: 'PAYROLL_2026_08_CN01', period: '2026-08', branchId: 'CN01', status: 'DRAFT', calculatedBy: 'MAKER', blockingIssueCount: 0, staffCount: 1, totalPayroll: 1_000_000, totalCommission: 0 }
      },
      payrollRunItems: {
        PAYROLL_2026_08_CN01_STAFF_01: { runId: 'PAYROLL_2026_08_CN01', staffUid: 'STAFF_01', staffId: 'STAFF_01', payrollBranchId: 'CN01', status: 'DRAFT', proratedBaseSalary: 900_000, netSalary: 1_000_000, posCommission: 0, techCommission: 0, adjustmentEarnings: 100_000, adjustmentDeductions: 0, advances: 0, commissionEntryIds: ['COMM_INCLUDED', 'COMM_OTHER_BRANCH'], commissionEntryAmounts: { COMM_INCLUDED: 0, COMM_OTHER_BRANCH: 0 }, commissionEntrySnapshots: { COMM_INCLUDED: { amount: 0, sourceBranchId: 'CN01', payrollBranchId: 'CN01', commissionCategory: 'SALES' }, COMM_OTHER_BRANCH: { amount: 0, sourceBranchId: 'CN02', payrollBranchId: 'CN01', commissionCategory: 'TECHNICAL' } }, adjustmentEntryIds: ['ADJ_INCLUDED'], adjustmentEntryAmounts: { ADJ_INCLUDED: 100_000 } }
      },
      users: { STAFF_01: { authUid: 'STAFF_01', active: true, branchId: 'CN01', payrollBranchId: 'CN01', assignedBranchIds: ['CN01', 'CN02'] } },
      commissionLedger: {
        COMM_INCLUDED: { payrollPeriod: '2026-08', payrollBranchId: 'CN01', branchId: 'CN01', staffUid: 'STAFF_01', status: 'ELIGIBLE', commissionCategory: 'SALES' },
        COMM_OTHER_BRANCH: { payrollPeriod: '2026-08', payrollBranchId: 'CN01', branchId: 'CN02', staffUid: 'STAFF_01', status: 'ELIGIBLE', commissionCategory: 'TECHNICAL' },
        COMM_OTHER_PERIOD: { payrollPeriod: '2026-09', branchId: 'CN01', staffUid: 'STAFF_01', status: 'ELIGIBLE' },
        COMM_OTHER_STAFF: { payrollPeriod: '2026-08', branchId: 'CN01', staffUid: 'STAFF_02', status: 'ELIGIBLE' },
        COMM_PENDING: { payrollPeriod: '2026-08', branchId: 'CN01', staffUid: 'STAFF_01', status: 'PENDING' },
        COMM_LEGACY_STAFF_ID: { payrollPeriod: '2026-08', branchId: 'CN01', staffId: 'STAFF_01', status: 'ELIGIBLE' },
        COMM_LEGACY_NO_BRANCH: { payrollPeriod: '2026-08', staffUid: 'STAFF_01', status: 'ELIGIBLE' }
      },
      payrollAdjustments: {
        ADJ_INCLUDED: { period: '2026-08', branchId: 'CN01', staffUid: 'STAFF_01', status: 'APPROVED', type: 'EARNING', amount: 100_000 },
        ADJ_OTHER_BRANCH: { period: '2026-08', branchId: 'CN02', staffUid: 'STAFF_01', status: 'APPROVED', type: 'EARNING', amount: 900_000 },
        ADJ_OTHER_PERIOD: { period: '2026-09', branchId: 'CN01', staffUid: 'STAFF_01', status: 'APPROVED', type: 'EARNING', amount: 800_000 }
      }
    });

    await approvePayrollRun(store.db, { uid: 'CHECKER', role: 'MANAGER', branchId: 'CN01' }, 'PAYROLL_2026_08_CN01');

    expect(store.get('commissionLedger', 'COMM_INCLUDED')).toMatchObject({ payrollPostingId: 'PAYROLL_2026_08_CN01' });
    expect(store.get('commissionLedger', 'COMM_OTHER_BRANCH')).toMatchObject({ payrollPostingId: 'PAYROLL_2026_08_CN01', branchId: 'CN02' });
    ['COMM_OTHER_PERIOD', 'COMM_OTHER_STAFF', 'COMM_PENDING', 'COMM_LEGACY_STAFF_ID', 'COMM_LEGACY_NO_BRANCH']
      .forEach((id) => expect(store.get('commissionLedger', id)).not.toHaveProperty('payrollPostingId'));
    expect(store.get('payrollAdjustments', 'ADJ_INCLUDED')).toMatchObject({ payrollPostingId: 'PAYROLL_2026_08_CN01' });
    expect(store.get('payrollAdjustments', 'ADJ_OTHER_BRANCH')).not.toHaveProperty('payrollPostingId');
    expect(store.get('payrollAdjustments', 'ADJ_OTHER_PERIOD')).not.toHaveProperty('payrollPostingId');
  });

  it('requires recalculation when a source is added or the payroll home branch changes after draft calculation', async () => {
    const baseSeed = {
      payrollRuns: {
        PAYROLL_2026_08_CN01: { id: 'PAYROLL_2026_08_CN01', period: '2026-08', branchId: 'CN01', status: 'DRAFT', calculatedBy: 'MAKER', blockingIssueCount: 0, staffCount: 1, totalPayroll: 1_000_000, totalCommission: 100_000 }
      },
      payrollRunItems: {
        PAYROLL_2026_08_CN01_STAFF_01: { runId: 'PAYROLL_2026_08_CN01', staffUid: 'STAFF_01', staffId: 'STAFF_01', payrollBranchId: 'CN01', status: 'DRAFT', proratedBaseSalary: 900_000, netSalary: 1_000_000, posCommission: 0, techCommission: 100_000, commissionEntryIds: ['COMM_ORIGINAL'], commissionEntryAmounts: { COMM_ORIGINAL: 100_000 }, commissionEntrySnapshots: { COMM_ORIGINAL: { amount: 100_000, sourceBranchId: 'CN01', payrollBranchId: 'CN01', commissionCategory: '' } }, adjustmentEntryIds: [], adjustmentEntryAmounts: {} }
      },
      users: { STAFF_01: { authUid: 'STAFF_01', active: true, branchId: 'CN01', payrollBranchId: 'CN01', assignedBranchIds: ['CN01', 'CN02'] } },
      commissionLedger: {
        COMM_ORIGINAL: { payrollPeriod: '2026-08', payrollBranchId: 'CN01', branchId: 'CN01', staffUid: 'STAFF_01', status: 'ELIGIBLE', commissionPayable: 100_000 },
        COMM_ADDED: { payrollPeriod: '2026-08', payrollBranchId: 'CN01', branchId: 'CN02', staffUid: 'STAFF_01', status: 'ELIGIBLE', commissionPayable: 50_000 }
      }
    };
    const changedSources = createStore(baseSeed);
    await expect(approvePayrollRun(changedSources.db, { uid: 'CHECKER', role: 'MANAGER', branchId: 'CN01' }, 'PAYROLL_2026_08_CN01'))
      .rejects.toThrow('PAYROLL_SOURCES_CHANGED_RECALCULATE');

    const changedHome = createStore({ ...baseSeed, commissionLedger: { COMM_ORIGINAL: baseSeed.commissionLedger.COMM_ORIGINAL } });
    changedHome.set('users', 'STAFF_01', { authUid: 'STAFF_01', active: true, branchId: 'CN02', payrollBranchId: 'CN02', assignedBranchIds: ['CN01', 'CN02'] });
    await expect(approvePayrollRun(changedHome.db, { uid: 'CHECKER', role: 'MANAGER', branchId: 'CN01' }, 'PAYROLL_2026_08_CN01'))
      .rejects.toThrow('PAYROLL_HOME_BRANCH_CHANGED_RECALCULATE');
  });

  it('requires recalculation when commission source branch or category changes after draft calculation', async () => {
    const seedFor = (ledger: Record<string, any>) => ({
      payrollRuns: {
        PAYROLL_2026_08_CN01: { id: 'PAYROLL_2026_08_CN01', period: '2026-08', branchId: 'CN01', status: 'DRAFT', calculatedBy: 'MAKER', blockingIssueCount: 0, staffCount: 1, totalPayroll: 1_100_000, totalCommission: 100_000 }
      },
      payrollRunItems: {
        PAYROLL_2026_08_CN01_STAFF_01: { runId: 'PAYROLL_2026_08_CN01', staffUid: 'STAFF_01', staffId: 'STAFF_01', payrollBranchId: 'CN01', status: 'DRAFT', proratedBaseSalary: 1_000_000, netSalary: 1_100_000, posCommission: 100_000, techCommission: 0, commissionEntryIds: ['COMM_1'], commissionEntryAmounts: { COMM_1: 100_000 }, commissionEntrySnapshots: { COMM_1: { amount: 100_000, sourceBranchId: 'CN01', payrollBranchId: 'CN01', commissionCategory: 'SALES' } }, adjustmentEntryIds: [], adjustmentEntryAmounts: {} }
      },
      users: { STAFF_01: { authUid: 'STAFF_01', active: true, branchId: 'CN01', payrollBranchId: 'CN01' } },
      commissionLedger: { COMM_1: ledger }
    });
    const actor = { uid: 'CHECKER', role: 'MANAGER', branchId: 'CN01' };

    const changedBranch = createStore(seedFor({ payrollPeriod: '2026-08', payrollBranchId: 'CN01', branchId: 'CN02', staffUid: 'STAFF_01', status: 'ELIGIBLE', commissionPayable: 100_000, commissionCategory: 'SALES' }));
    await expect(approvePayrollRun(changedBranch.db, actor, 'PAYROLL_2026_08_CN01'))
      .rejects.toThrow('PAYROLL_SOURCE_METADATA_CHANGED_RECALCULATE');

    const changedCategory = createStore(seedFor({ payrollPeriod: '2026-08', payrollBranchId: 'CN01', branchId: 'CN01', staffUid: 'STAFF_01', status: 'ELIGIBLE', commissionPayable: 100_000, commissionCategory: 'TECHNICAL' }));
    await expect(approvePayrollRun(changedCategory.db, actor, 'PAYROLL_2026_08_CN01'))
      .rejects.toThrow('PAYROLL_SOURCE_METADATA_CHANGED_RECALCULATE');
  });

  it('refuses approval and leaves reversal ledgers unposted when raw net salary is negative', async () => {
    const store = createStore({
      payrollRuns: {
        PAYROLL_2026_08_CN01: { id: 'PAYROLL_2026_08_CN01', period: '2026-08', branchId: 'CN01', status: 'DRAFT', calculatedBy: 'MAKER', blockingIssueCount: 0, staffCount: 1, totalPayroll: 0, totalCommission: -5_000_000 }
      },
      payrollRunItems: {
        PAYROLL_2026_08_CN01_SALE_01: {
          runId: 'PAYROLL_2026_08_CN01', staffUid: 'SALE_01', staffId: 'SALE_01', payrollBranchId: 'CN01', status: 'DRAFT',
          proratedBaseSalary: 3_000_000, allowances: 0, adjustmentEarnings: 0, advances: 0,
          posCommission: -5_000_000, techCommission: 0, rawNetSalary: -2_000_000, negativeCarry: 2_000_000, netSalary: 0,
          commissionEntryIds: ['REV_5M'], commissionEntryAmounts: { REV_5M: -5_000_000 },
          commissionEntrySnapshots: { REV_5M: { amount: -5_000_000, sourceBranchId: 'CN01', payrollBranchId: 'CN01', commissionCategory: 'SALES' } },
          adjustmentEntryIds: [], adjustmentEntryAmounts: {}
        }
      },
      users: { SALE_01: { authUid: 'SALE_01', active: true, branchId: 'CN01', payrollBranchId: 'CN01' } },
      commissionLedger: {
        REV_5M: { payrollPeriod: '2026-08', payrollBranchId: 'CN01', branchId: 'CN01', staffUid: 'SALE_01', status: 'ELIGIBLE', commissionCategory: 'SALES', commissionPayable: -5_000_000 }
      }
    });
    await expect(approvePayrollRun(store.db, { uid: 'CHECKER', role: 'MANAGER', branchId: 'CN01' }, 'PAYROLL_2026_08_CN01'))
      .rejects.toThrow('PAYROLL_NEGATIVE_NET_REQUIRES_RECOVERY_ADJUSTMENT');
    expect(store.get('payrollRuns', 'PAYROLL_2026_08_CN01')).toMatchObject({ status: 'DRAFT' });
    expect(store.get('commissionLedger', 'REV_5M')).not.toHaveProperty('payrollPostingId');
  });

  it('posts an approved payroll to its branch fund exactly once', async () => {
    const store = createStore({
      payrollRuns: {
        PAYROLL_2026_08_CN01: { id: 'PAYROLL_2026_08_CN01', period: '2026-08', branchId: 'CN01', status: 'APPROVED', approvedBy: 'APPROVER', staffCount: 1, totalPayroll: 8_000_000, totalCommission: 0 }
      },
      payrollRunItems: {
        PAYROLL_2026_08_CN01_STAFF_01: { runId: 'PAYROLL_2026_08_CN01', staffUid: 'STAFF_01', staffId: 'STAFF_01', status: 'APPROVED', proratedBaseSalary: 7_700_000, netSalary: 8_000_000, posCommission: 0, techCommission: 0, adjustmentEarnings: 300_000, adjustmentDeductions: 0, advances: 0, commissionEntryIds: ['COMM_1'], commissionEntryAmounts: { COMM_1: 0 }, commissionEntrySnapshots: { COMM_1: { amount: 0, sourceBranchId: 'CN02', payrollBranchId: 'CN01', commissionCategory: '' } }, adjustmentEntryIds: ['ADJ_1'], adjustmentEntryAmounts: { ADJ_1: 300_000 } }
      },
      commissionLedger: {
        COMM_1: { payrollPostingId: 'PAYROLL_2026_08_CN01', payrollPeriod: '2026-08', payrollBranchId: 'CN01', sourceBranchId: 'CN02', branchId: 'CN02', staffUid: 'STAFF_01', status: 'ELIGIBLE' }
      },
      payrollAdjustments: {
        ADJ_1: { payrollPostingId: 'PAYROLL_2026_08_CN01', period: '2026-08', branchId: 'CN01', staffUid: 'STAFF_01', status: 'APPROVED', type: 'EARNING', amount: 300_000 }
      },
      funds: {
        FUND_1: { id: 'FUND_1', branchId: 'CN01', name: 'Ngân hàng CN01', type: 'BANK', isActive: true, currentBalance: 20_000_000, totalExpense: 1_000_000 }
      }
    });
    const actor = { uid: 'ACCOUNTANT', role: 'ACCOUNTANT', branchId: 'CN01', name: 'Kế toán' };
    const input = { fundId: 'FUND_1', idempotencyKey: 'PAYROLL-PAY-2026-08-CN01', note: 'Chi lương' };
    const first = await payPayrollRun(store.db, actor, 'PAYROLL_2026_08_CN01', input);
    const replay = await payPayrollRun(store.db, actor, 'PAYROLL_2026_08_CN01', input);
    expect(first.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(store.get('funds', 'FUND_1')).toMatchObject({ currentBalance: 12_000_000, totalExpense: 9_000_000 });
    expect(store.get('payrollRuns', 'PAYROLL_2026_08_CN01')).toMatchObject({ status: 'PAID', fundId: 'FUND_1' });
    expect(store.get('commissionLedger', 'COMM_1')).toMatchObject({ status: 'PAID', payrollBatchId: 'PAYMENT_PAYROLL_2026_08_CN01' });
    expect(store.get('payrollAdjustments', 'ADJ_1')).toMatchObject({ status: 'PAID', payrollBatchId: 'PAYMENT_PAYROLL_2026_08_CN01' });
  });

  it('fails closed when a posted ledger is missing authoritative source-branch attribution', async () => {
    const store = createStore({
      payrollRuns: {
        PAYROLL_2026_08_CN01: { id: 'PAYROLL_2026_08_CN01', period: '2026-08', branchId: 'CN01', status: 'APPROVED', approvedBy: 'APPROVER', staffCount: 1, totalPayroll: 1_000_000, totalCommission: 0 }
      },
      payrollRunItems: {
        PAYROLL_2026_08_CN01_STAFF_01: { runId: 'PAYROLL_2026_08_CN01', staffUid: 'STAFF_01', staffId: 'STAFF_01', status: 'APPROVED', proratedBaseSalary: 1_000_000, netSalary: 1_000_000, posCommission: 0, techCommission: 0, commissionEntryIds: ['COMM_MISSING_SOURCE_BRANCH'], commissionEntryAmounts: { COMM_MISSING_SOURCE_BRANCH: 0 }, commissionEntrySnapshots: { COMM_MISSING_SOURCE_BRANCH: { amount: 0, sourceBranchId: '', commissionCategory: '' } }, adjustmentEntryIds: [], adjustmentEntryAmounts: {} }
      },
      commissionLedger: {
        COMM_MISSING_SOURCE_BRANCH: { payrollPostingId: 'PAYROLL_2026_08_CN01', payrollPeriod: '2026-08', staffUid: 'STAFF_01', status: 'ELIGIBLE' }
      },
      funds: {
        FUND_1: { id: 'FUND_1', branchId: 'CN01', name: 'Quỹ CN01', type: 'BANK', isActive: true, currentBalance: 5_000_000, totalExpense: 0 }
      }
    });
    const actor = { uid: 'ACCOUNTANT', role: 'ACCOUNTANT', branchId: 'CN01', name: 'Kế toán' };
    await expect(payPayrollRun(store.db, actor, 'PAYROLL_2026_08_CN01', {
      fundId: 'FUND_1', idempotencyKey: 'PAYROLL-PAY-SCOPE-MISMATCH'
    })).rejects.toThrow('PAYROLL_POSTING_SCOPE_MISMATCH');
    expect(store.get('payrollRuns', 'PAYROLL_2026_08_CN01')).toMatchObject({ status: 'APPROVED' });
    expect(store.get('funds', 'FUND_1')).toMatchObject({ currentBalance: 5_000_000 });
  });
});
