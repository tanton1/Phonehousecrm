import { describe, expect, it } from 'vitest';
import { approvePayrollRun, payPayrollRun } from '../server/services/payrollService';

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
  return { db, get: (name: string, id: string) => data.get(`${name}/${id}`) };
}

describe('Payroll approval and payment integrity', () => {
  it('locks one staff member to one approved run for the period', async () => {
    const store = createStore({
      payrollRuns: {
        PAYROLL_2026_08_CN01: { id: 'PAYROLL_2026_08_CN01', period: '2026-08', branchId: 'CN01', status: 'DRAFT', calculatedBy: 'MAKER', blockingIssueCount: 0 },
        PAYROLL_2026_08_CN02: { id: 'PAYROLL_2026_08_CN02', period: '2026-08', branchId: 'CN02', status: 'DRAFT', calculatedBy: 'MAKER_2', blockingIssueCount: 0 }
      },
      payrollRunItems: {
        ITEM_1: { runId: 'PAYROLL_2026_08_CN01', staffId: 'STAFF_01' },
        ITEM_2: { runId: 'PAYROLL_2026_08_CN02', staffId: 'STAFF_01' }
      },
      commissionLedger: {
        COMM_1: { payrollPeriod: '2026-08', staffUid: 'STAFF_01', status: 'ELIGIBLE' }
      },
      payrollAdjustments: {
        ADJ_1: { period: '2026-08', branchId: 'CN01', staffUid: 'STAFF_01', status: 'APPROVED', type: 'EARNING', amount: 300_000 }
      }
    });
    await approvePayrollRun(store.db, { uid: 'CHECKER', role: 'MANAGER', branchId: 'CN01' }, 'PAYROLL_2026_08_CN01');
    expect(store.get('payrollStaffLocks', '2026-08_STAFF_01')).toMatchObject({ runId: 'PAYROLL_2026_08_CN01' });
    expect(store.get('payrollAdjustments', 'ADJ_1')).toMatchObject({ payrollPostingId: 'PAYROLL_2026_08_CN01' });
    await expect(approvePayrollRun(store.db, { uid: 'ADMIN_CHECKER', role: 'ADMIN' }, 'PAYROLL_2026_08_CN02'))
      .rejects.toThrow('PAYROLL_STAFF_ALREADY_LOCKED');
  });

  it('posts an approved payroll to its branch fund exactly once', async () => {
    const store = createStore({
      payrollRuns: {
        PAYROLL_2026_08_CN01: { id: 'PAYROLL_2026_08_CN01', period: '2026-08', branchId: 'CN01', status: 'APPROVED', approvedBy: 'APPROVER', totalPayroll: 8_000_000 }
      },
      payrollRunItems: {
        ITEM_1: { runId: 'PAYROLL_2026_08_CN01', staffId: 'STAFF_01', status: 'APPROVED' }
      },
      commissionLedger: {
        COMM_1: { payrollPostingId: 'PAYROLL_2026_08_CN01', staffUid: 'STAFF_01', status: 'ELIGIBLE' }
      },
      payrollAdjustments: {
        ADJ_1: { payrollPostingId: 'PAYROLL_2026_08_CN01', branchId: 'CN01', staffUid: 'STAFF_01', status: 'APPROVED', amount: 300_000 }
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
});
