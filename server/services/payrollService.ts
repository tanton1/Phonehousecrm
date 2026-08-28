import type { Firestore } from 'firebase-admin/firestore';
import { resolveAttendanceWorkday } from '../../shared/attendancePolicy';
import { resolveDepartment } from './shiftSchedulingService';

export interface PayrollActor {
  uid: string;
  role: string;
  branchId?: string;
  assignedBranchIds?: string[];
  name?: string;
}

export interface PayrollRecordSnapshot {
  staffId: string;
  staffName: string;
  role: string;
  branchId: string;
  branchName: string;
  baseSalary: number;
  workDays: number;
  standardWorkDays: number;
  posCommission: number;
  techCommission: number;
  allowances: number;
  advances: number;
  netSalary: number;
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ALLOWED_ROLES = new Set(['ADMIN', 'MANAGER', 'STORE_MANAGER', 'ACCOUNTANT']);

function assertAccess(actor: PayrollActor, branchId: string) {
  const role = String(actor.role || '').toUpperCase();
  if (!ALLOWED_ROLES.has(role)) throw new Error('PAYROLL_FORBIDDEN: Bạn không có quyền xem hoặc lập bảng lương.');
  if (!branchId) throw new Error('PAYROLL_BRANCH_REQUIRED: Vui lòng chọn phạm vi chi nhánh.');
  if (role === 'ADMIN' || role === 'ACCOUNTANT') return;
  const allowed = new Set([actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean));
  if (branchId === 'ALL' || !allowed.has(branchId)) throw new Error('PAYROLL_BRANCH_FORBIDDEN: Bạn không có quyền lập lương cho phạm vi này.');
}

function assertPeriod(period: string) {
  if (!PERIOD_RE.test(period)) throw new Error('PAYROLL_PERIOD_INVALID: Kỳ lương phải có dạng YYYY-MM.');
}

function nextPeriodStart(period: string) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function periodDates(period: string): string[] {
  const [year, month] = period.split('-').map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => `${period}-${String(index + 1).padStart(2, '0')}`);
}

function mondayBasedDayIndex(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return (new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay() + 6) % 7;
}

export function buildPayrollRecords(input: {
  users: Array<{ id: string; data: Record<string, any> }>;
  attendance: Array<Record<string, any>>;
  schedules: Array<Record<string, any>>;
  departmentPolicies?: Array<Record<string, any>>;
  commissions: Array<Record<string, any>>;
  branches: Array<{ id: string; data: Record<string, any> }>;
  period: string;
  branchId: string;
}) {
  const branchNames = new Map(input.branches.map((branch) => [branch.id, String(branch.data.name || branch.id)]));
  const scopedUsers = input.users.filter(({ data }) => data.active !== false)
    .filter(({ data }) => input.branchId === 'ALL' || data.branchId === input.branchId || (data.assignedBranchIds || []).includes(input.branchId));

  return scopedUsers.map(({ id, data }) => {
    const authIds = new Set([id, data.id, data.uid, data.authUid].filter(Boolean).map(String));
    const staffAttendance = input.attendance.filter((record) => authIds.has(String(record.staffId || '')) && String(record.date || '').startsWith(input.period));
    const workdayCredits = new Map<string, number>();
    staffAttendance.forEach((record) => {
      const date = String(record.date || '');
      if (!date) return;
      workdayCredits.set(date, Math.max(workdayCredits.get(date) || 0, resolveAttendanceWorkday(record).credit));
    });
    const scheduledDates = new Set<string>();
    const payrollBranchId = input.branchId === 'ALL' ? String(data.branchId || '') : input.branchId;
    const department = resolveDepartment(data);
    const fixedPolicy = (input.departmentPolicies || []).find((policy) => (
      policy.active !== false
      && policy.mode === 'FIXED'
      && String(policy.branchId || '') === payrollBranchId
      && String(policy.departmentId || '').toUpperCase() === department.departmentId.toUpperCase()
    ));
    if (fixedPolicy) {
      const workDayIndexes = new Set((fixedPolicy.workDayIndexes || []).map(Number));
      periodDates(input.period).forEach((date) => {
        if (workDayIndexes.has(mondayBasedDayIndex(date))) scheduledDates.add(date);
      });
    }
    input.schedules
      .filter((schedule) => authIds.has(String(schedule.staffId || '')) && schedule.status === 'PUBLISHED')
      .filter((schedule) => !schedule.branchId || schedule.branchId === payrollBranchId)
      .forEach((schedule) => Object.entries(schedule.days || {}).forEach(([date, assignment]: [string, any]) => {
        if (!date.startsWith(input.period)) return;
        if (assignment?.shiftId === 'OFF' || assignment?.isOff === true) scheduledDates.delete(date);
        else if (assignment?.shiftId) scheduledDates.add(date);
      }));

    const standardWorkDays = scheduledDates.size;
    const workDays = Math.round([...workdayCredits.values()].reduce((sum, credit) => sum + credit, 0) * 2) / 2;
    const baseSalary = numberValue(data.baseSalary);
    const proratedBase = standardWorkDays > 0 ? Math.round(baseSalary / standardWorkDays * Math.min(workDays, standardWorkDays)) : 0;
    const technicalEntries = input.commissions.filter((entry) => authIds.has(String(entry.staffUid || entry.staffId || '')) && entry.status === 'ELIGIBLE' && !entry.payrollPostingId);
    const techCommission = technicalEntries.reduce((sum, entry) => sum + numberValue(entry.commissionPayable ?? entry.amount), 0);
    const posCommission = numberValue(data.salesCommission) + numberValue(data.kpiSalesBonus);
    const allowances = numberValue(data.allowance);
    const advances = numberValue(data.advanceSalaryDeductions);
    const staffBranchId = String(data.branchId || '');

    return {
      staffId: id,
      staffName: String(data.displayName || data.name || id),
      role: String(data.role || 'STAFF'),
      branchId: staffBranchId,
      branchName: branchNames.get(staffBranchId) || 'Chưa phân chi nhánh',
      baseSalary,
      workDays,
      standardWorkDays,
      posCommission,
      techCommission,
      allowances,
      advances,
      netSalary: proratedBase + posCommission + techCommission + allowances - advances
    } satisfies PayrollRecordSnapshot;
  });
}

async function loadPayrollSources(db: Firestore, period: string) {
  const periodEnd = nextPeriodStart(period);
  const [users, attendance, schedules, departmentPolicies, commissions, branches] = await Promise.all([
    db.collection('users').limit(1000).get(),
    db.collection('attendance').where('date', '>=', `${period}-01`).where('date', '<', periodEnd).limit(10000).get(),
    db.collection('weeklyShiftSchedules').limit(3000).get(),
    db.collection('shiftDepartmentPolicies').limit(500).get(),
    db.collection('commissionLedger').where('payrollPeriod', '==', period).limit(5000).get(),
    db.collection('branches').limit(500).get()
  ]);
  return {
    users: users.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
    attendance: attendance.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    schedules: schedules.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    departmentPolicies: departmentPolicies.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    commissions: commissions.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    branches: branches.docs.map((doc) => ({ id: doc.id, data: doc.data() }))
  };
}

export async function getPayrollRun(db: Firestore | null, actor: PayrollActor, input: { period: string; branchId: string }) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  assertPeriod(input.period);
  assertAccess(actor, input.branchId);
  const runId = `PAYROLL_${input.period}_${input.branchId}`;
  const [runSnapshot, itemSnapshot] = await Promise.all([
    db.collection('payrollRuns').doc(runId).get(),
    db.collection('payrollRunItems').where('runId', '==', runId).limit(1000).get()
  ]);
  if (!runSnapshot.exists) return null;
  return {
    id: runSnapshot.id,
    ...runSnapshot.data(),
    records: itemSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  };
}

export async function getMyPayrollSlip(db: Firestore | null, actor: PayrollActor, period: string) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  assertPeriod(period);
  const candidateBranches = [...new Set([actor.branchId, 'ALL'].filter(Boolean))] as string[];
  const candidates = candidateBranches.map((branchId) => {
    const runId = `PAYROLL_${period}_${branchId}`;
    return {
      runId,
      runRef: db.collection('payrollRuns').doc(runId),
      itemRef: db.collection('payrollRunItems').doc(`${runId}_${actor.uid}`)
    };
  });
  const snapshots = await Promise.all(candidates.flatMap((candidate) => [candidate.runRef.get(), candidate.itemRef.get()]));
  for (let index = 0; index < candidates.length; index += 1) {
    const runSnapshot = snapshots[index * 2];
    const itemSnapshot = snapshots[index * 2 + 1];
    if (runSnapshot.exists && itemSnapshot.exists && ['APPROVED', 'PAID'].includes(String(runSnapshot.data()?.status || ''))) {
      return { id: itemSnapshot.id, ...itemSnapshot.data(), runStatus: runSnapshot.data()?.status, approvedAt: runSnapshot.data()?.approvedAt };
    }
  }
  return null;
}

export async function calculateAndSavePayrollRun(db: Firestore | null, actor: PayrollActor, input: { period: string; branchId: string }) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  assertPeriod(input.period);
  assertAccess(actor, input.branchId);
  const runId = `PAYROLL_${input.period}_${input.branchId}`;
  const runRef = db.collection('payrollRuns').doc(runId);

  // Every read finishes before the write batch begins.
  const [existingRun, existingItems, sources] = await Promise.all([
    runRef.get(),
    db.collection('payrollRunItems').where('runId', '==', runId).limit(1000).get(),
    loadPayrollSources(db, input.period)
  ]);
  if (existingRun.exists && ['APPROVED', 'PAID'].includes(String(existingRun.data()?.status || ''))) {
    throw new Error('PAYROLL_RUN_LOCKED: Kỳ lương đã duyệt nên không thể tính lại.');
  }

  const records = buildPayrollRecords({ ...sources, period: input.period, branchId: input.branchId });
  if (records.length > 240) throw new Error('PAYROLL_STAFF_LIMIT: Mỗi kỳ lương hỗ trợ tối đa 240 nhân viên trong một lần chốt.');
  const now = new Date().toISOString();
  const totalPayroll = records.reduce((sum, record) => sum + record.netSalary, 0);
  const totalCommission = records.reduce((sum, record) => sum + record.posCommission + record.techCommission, 0);
  const batch = db.batch();
  const nextItemIds = new Set(records.map((record) => `${runId}_${record.staffId}`));
  existingItems.docs.filter((doc) => !nextItemIds.has(doc.id)).forEach((doc) => batch.delete(doc.ref));
  records.forEach((record) => {
    const itemRef = db.collection('payrollRunItems').doc(`${runId}_${record.staffId}`);
    batch.set(itemRef, { id: itemRef.id, runId, period: input.period, status: 'DRAFT', ...record, createdAt: now, updatedAt: now });
  });
  const run = {
    id: runId,
    period: input.period,
    branchId: input.branchId,
    status: 'DRAFT',
    staffCount: records.length,
    totalPayroll,
    totalCommission,
    calculationVersion: 'PAYROLL_V1',
    createdAt: existingRun.data()?.createdAt || now,
    createdBy: existingRun.data()?.createdBy || actor.uid,
    updatedAt: now,
    updatedBy: actor.uid
  };
  batch.set(runRef, run, { merge: false });
  batch.set(db.collection('payrollAuditLogs').doc(), { runId, action: 'CALCULATED', actorUid: actor.uid, actorName: actor.name || actor.uid, occurredAt: now });
  await batch.commit();
  return { ...run, records };
}

export async function approvePayrollRun(db: Firestore | null, actor: PayrollActor, runId: string) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const runRef = db.collection('payrollRuns').doc(runId);
  return db.runTransaction(async (transaction) => {
    const runSnapshot = await transaction.get(runRef);
    if (!runSnapshot.exists) throw new Error('PAYROLL_RUN_NOT_FOUND: Không tìm thấy kỳ lương.');
    const run = runSnapshot.data()!;
    assertPeriod(String(run.period || ''));
    assertAccess(actor, String(run.branchId || ''));
    if (run.status === 'PAID') throw new Error('PAYROLL_RUN_PAID: Kỳ lương đã chi trả.');
    if (run.status === 'APPROVED') return { id: runId, ...run, idempotentReplay: true };

    const itemSnapshot = await transaction.get(db.collection('payrollRunItems').where('runId', '==', runId).limit(1000));
    const commissionSnapshot = await transaction.get(db.collection('commissionLedger').where('payrollPeriod', '==', run.period).limit(5000));
    const itemStaffIds = new Set(itemSnapshot.docs.map((doc) => String(doc.data().staffId || '')));
    const now = new Date().toISOString();
    transaction.update(runRef, { status: 'APPROVED', approvedAt: now, approvedBy: actor.uid, updatedAt: now, updatedBy: actor.uid });
    itemSnapshot.docs.forEach((doc) => transaction.update(doc.ref, { status: 'APPROVED', updatedAt: now }));
    commissionSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.status === 'ELIGIBLE' && !data.payrollPostingId && itemStaffIds.has(String(data.staffUid || data.staffId || ''))) {
        transaction.update(doc.ref, { payrollPostingId: runId, payrollPostedAt: now, updatedAt: now });
      }
    });
    transaction.set(db.collection('payrollAuditLogs').doc(), { runId, action: 'APPROVED', actorUid: actor.uid, actorName: actor.name || actor.uid, occurredAt: now });
    return { id: runId, ...run, status: 'APPROVED', approvedAt: now, approvedBy: actor.uid, idempotentReplay: false };
  });
}
