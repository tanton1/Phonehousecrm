import { describe, expect, it } from 'vitest';
import { createPayrollAdjustment, reviewPayrollAdjustment } from '../server/services/payrollAdjustmentService';

function createDb(seed: Record<string, Record<string, any>>) {
  const store = new Map<string, any>();
  Object.entries(seed).forEach(([collection, docs]) => Object.entries(docs).forEach(([id, value]) => store.set(`${collection}/${id}`, { ...value })));
  let generated = 0;
  const snapshot = (ref: any) => ({ id: ref.id, ref, exists: store.has(ref.path), data: () => store.get(ref.path) });
  const db: any = {
    collection(name: string) {
      return { doc(id?: string) { const resolved = id || `AUTO_${++generated}`; return { id: resolved, path: `${name}/${resolved}` }; } };
    },
    async runTransaction(handler: any) {
      return handler({
        get: async (ref: any) => snapshot(ref),
        create: (ref: any, value: any) => { if (store.has(ref.path)) throw new Error('ALREADY_EXISTS'); store.set(ref.path, { ...value }); },
        set: (ref: any, value: any) => store.set(ref.path, { ...value }),
        update: (ref: any, value: any) => store.set(ref.path, { ...store.get(ref.path), ...value })
      });
    }
  };
  return { db, values: (collection: string) => [...store.entries()].filter(([key]) => key.startsWith(`${collection}/`)).map(([, value]) => value) };
}

describe('payroll adjustment ledger', () => {
  it('enforces maker-checker and approves an open-period earning', async () => {
    const fixture = createDb({ users: { STAFF_01: { displayName: 'Sale A', branchId: 'CN01', active: true } } });
    const maker = { uid: 'MANAGER_01', role: 'MANAGER', branchId: 'CN01', name: 'Quản lý' };
    const created: any = await createPayrollAdjustment(fixture.db, maker, {
      staffUid: 'STAFF_01', period: '2026-09', type: 'EARNING', category: 'OVERTIME', amount: 300_000, reason: 'Tăng ca cuối tuần'
    });
    expect(created).toMatchObject({ status: 'PENDING', amount: 300_000, branchId: 'CN01' });
    await expect(reviewPayrollAdjustment(fixture.db, { ...maker, role: 'ADMIN' }, created.id, { decision: 'APPROVE' }))
      .rejects.toThrow('PAYROLL_ADJUSTMENT_MAKER_CHECKER_REQUIRED');
    const approved = await reviewPayrollAdjustment(fixture.db, { uid: 'ACCOUNTANT_01', role: 'ACCOUNTANT', branchId: 'CN01', name: 'Kế toán' }, created.id, { decision: 'APPROVE' });
    expect(approved).toMatchObject({ status: 'APPROVED', approvedByUid: 'ACCOUNTANT_01' });
    expect(fixture.values('payrollAdjustmentAuditLogs')).toHaveLength(2);
  });

  it('rejects new deductions in an approved payroll period', async () => {
    const fixture = createDb({
      users: { STAFF_01: { displayName: 'Sale A', branchId: 'CN01', active: true } },
      payrollPeriods: { '2026-08_CN01': { status: 'APPROVED', period: '2026-08', branchId: 'CN01' } }
    });
    await expect(createPayrollAdjustment(fixture.db, { uid: 'ACCOUNTANT_01', role: 'ACCOUNTANT', branchId: 'CN01' }, {
      staffUid: 'STAFF_01', period: '2026-08', type: 'DEDUCTION', category: 'ADVANCE', amount: 500_000, reason: 'Tạm ứng trong tháng'
    })).rejects.toThrow('PAYROLL_PERIOD_LOCKED');
  });

  it('rejects a backdated adjustment when the staff period is already locked by another home-branch run', async () => {
    const fixture = createDb({
      users: { STAFF_01: { authUid: 'STAFF_01', displayName: 'Sale A', branchId: 'CN02', payrollBranchId: 'CN02', assignedBranchIds: ['CN01', 'CN02'], active: true } },
      payrollStaffLocks: { '2026-08_STAFF_01': { staffUid: 'STAFF_01', period: '2026-08', runId: 'PAYROLL_2026_08_CN01' } }
    });
    await expect(createPayrollAdjustment(fixture.db, { uid: 'ACCOUNTANT_01', role: 'ACCOUNTANT', branchId: 'CN02' }, {
      staffUid: 'STAFF_01', period: '2026-08', type: 'EARNING', category: 'MANUAL', amount: 100_000, reason: 'Điều chỉnh sau chuyển chi nhánh'
    })).rejects.toThrow('PAYROLL_STAFF_ALREADY_LOCKED');
  });
});
