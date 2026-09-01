import type { Firestore } from 'firebase-admin/firestore';
import { resolveAttendanceWorkday } from '../../shared/attendancePolicy';
import { resolveDepartment } from './shiftSchedulingService';
import { resolveCompensationForPeriod } from './compensationService';
import { assertFinanceIdempotencyRecord, financePayloadHash, parseVnd, requireFinanceIdempotencyKey } from '../utils/financeIntegrity';
import { payrollPeriodLockId } from './payrollPeriodLockService';
import { resolvePayrollHomeBranch } from './payrollStaffIdentity';

export interface PayrollActor {
  uid: string;
  role: string;
  branchId?: string;
  assignedBranchIds?: string[];
  name?: string;
}

export interface PayrollRecordSnapshot {
  staffUid: string;
  staffId: string;
  userDocumentId: string;
  staffName: string;
  role: string;
  branchId: string;
  payrollBranchId: string;
  operationalBranchId: string;
  branchName: string;
  baseSalary: number;
  proratedBaseSalary: number;
  workDays: number;
  standardWorkDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  posCommission: number;
  techCommission: number;
  allowances: number;
  advances: number;
  adjustmentEarnings: number;
  adjustmentDeductions: number;
  rawNetSalary: number;
  negativeCarry: number;
  netSalary: number;
  compensationId: string | null;
  compensationVersion: number | null;
  compensationEffectiveFrom: string | null;
  compensationSource: 'CANONICAL' | 'LEGACY_USER';
  attendanceRecordIds: string[];
  leaveRequestIds: string[];
  commissionEntryIds: string[];
  commissionEntryAmounts: Record<string, number>;
  commissionEntrySnapshots: Record<string, {
    amount: number;
    sourceBranchId: string;
    payrollBranchId: string;
    commissionCategory: string;
  }>;
  commissionSourceBranchIds: string[];
  adjustmentEntryIds: string[];
  adjustmentEntryAmounts: Record<string, number>;
  blockingIssues: string[];
  warnings: string[];
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

function safeMoney(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function safeSignedMoney(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && Number.isSafeInteger(parsed) && Math.abs(parsed) <= 100_000_000_000 ? parsed : 0;
}

function isCommissionInPayrollScope(
  entry: Record<string, any>,
  staffUids: Set<string>,
  period: string,
  payrollBranchId: string
) {
  const staffUid = String(entry.staffUid || '');
  const sourceBranchId = String(entry.sourceBranchId || entry.branchId || '').trim();
  return Boolean(staffUid)
    && staffUids.has(staffUid)
    && entry.status === 'ELIGIBLE'
    && !entry.payrollPostingId
    && Boolean(sourceBranchId)
    && String(entry.payrollBranchId || '').trim() === payrollBranchId
    && String(entry.payrollPeriod || '') === period;
}

function isAdjustmentInPayrollScope(
  entry: Record<string, any>,
  staffUids: Set<string>,
  period: string,
  branchId: string
) {
  const staffUid = String(entry.staffUid || '');
  return Boolean(staffUid)
    && staffUids.has(staffUid)
    && entry.status === 'APPROVED'
    && !entry.payrollPostingId
    && String(entry.branchId || '') === branchId
    && String(entry.period || '') === period;
}

function assertPostedPayrollEntriesInScope(
  commissionEntries: Array<{ data(): Record<string, any> }>,
  adjustmentEntries: Array<{ data(): Record<string, any> }>,
  staffUids: Set<string>,
  period: string,
  branchId: string
) {
  // A posting query is keyed by payrollPostingId, but that key alone is not a
  // sufficient accounting boundary. Older/hand-edited documents can carry a
  // stale posting id, so refuse to pay rather than mutate a cross-branch or
  // cross-period ledger. Missing canonical scope fields are intentionally
  // fail-closed and must be repaired by a migration/reconciliation job.
  const commissionOutOfScope = commissionEntries.some(({ data }) => {
    const entry = data();
    return entry.status !== 'ELIGIBLE'
      || !staffUids.has(String(entry.staffUid || ''))
      || !String(entry.sourceBranchId || entry.branchId || '').trim()
      || String(entry.payrollBranchId || '').trim() !== branchId
      || String(entry.payrollPeriod || '') !== period;
  });
  const adjustmentOutOfScope = adjustmentEntries.some(({ data }) => {
    const entry = data();
    return entry.status !== 'APPROVED'
      || !staffUids.has(String(entry.staffUid || ''))
      || String(entry.branchId || '') !== branchId
      || String(entry.period || '') !== period;
  });
  if (commissionOutOfScope || adjustmentOutOfScope) {
    throw new Error('PAYROLL_POSTING_SCOPE_MISMATCH: Ledger đã gắn vào kỳ lương nhưng khác chi nhánh hoặc kỳ; cần đối soát trước khi chi.');
  }
}

function canonicalPayrollRunItemUid(
  item: { id: string; data(): Record<string, any> },
  runId: string
): string {
  const data = item.data();
  const staffUid = String(data.staffUid || '').trim();
  if (!staffUid
    || String(data.staffId || '') !== staffUid
    || String(data.runId || '') !== runId
    || item.id !== `${runId}_${staffUid}`) {
    throw new Error('PAYROLL_RUN_ITEM_IDENTITY_MISMATCH: Phiếu lương chưa dùng Firebase UID chuẩn; cần tính lại kỳ lương trước khi duyệt hoặc chi.');
  }
  return staffUid;
}

function assertCanonicalPayrollSlip(
  item: { id: string; data(): Record<string, any> },
  runId: string,
  staffUid: string
) {
  if (canonicalPayrollRunItemUid(item, runId) !== staffUid) {
    throw new Error('PAYROLL_SLIP_IDENTITY_MISMATCH: Phiếu lương không thuộc tài khoản Firebase hiện tại.');
  }
}

function sortedUniqueIds(values: unknown): string[] {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))].sort();
}

function sameIds(left: unknown, right: string[]): boolean {
  return JSON.stringify(sortedUniqueIds(left)) === JSON.stringify([...new Set(right)].sort());
}

function commissionEntrySnapshot(entry: Record<string, any>) {
  return {
    amount: safeSignedMoney(entry.commissionPayable ?? entry.amount),
    sourceBranchId: String(entry.sourceBranchId || entry.branchId || '').trim(),
    payrollBranchId: String(entry.payrollBranchId || '').trim(),
    commissionCategory: String(entry.commissionCategory || entry.category || '').trim().toUpperCase()
  };
}

function assertLedgerSnapshotMatches(
  itemData: Record<string, any>,
  commissionEntries: Array<{ id: string; data(): Record<string, any> }>,
  adjustmentEntries: Array<{ id: string; data(): Record<string, any> }>
) {
  const commissionIds = commissionEntries.map((entry) => entry.id);
  const adjustmentIds = adjustmentEntries.map((entry) => entry.id);
  if (!sameIds(itemData.commissionEntryIds, commissionIds) || !sameIds(itemData.adjustmentEntryIds, adjustmentIds)) {
    throw new Error('PAYROLL_SOURCES_CHANGED_RECALCULATE: Nguồn hoa hồng hoặc điều chỉnh đã thay đổi; cần tính lại kỳ lương.');
  }
  const commissionAmounts = itemData.commissionEntryAmounts || {};
  const commissionSnapshots = itemData.commissionEntrySnapshots || {};
  const adjustmentAmounts = itemData.adjustmentEntryAmounts || {};
  const commissionChanged = commissionEntries.some((entry) => (
    !Object.prototype.hasOwnProperty.call(commissionAmounts, entry.id)
    || Number(commissionAmounts[entry.id]) !== safeSignedMoney(entry.data().commissionPayable ?? entry.data().amount)
  ));
  const adjustmentChanged = adjustmentEntries.some((entry) => (
    !Object.prototype.hasOwnProperty.call(adjustmentAmounts, entry.id)
    || Number(adjustmentAmounts[entry.id]) !== safeMoney(entry.data().amount)
  ));
  if (commissionChanged || adjustmentChanged) {
    throw new Error('PAYROLL_SOURCE_AMOUNT_CHANGED_RECALCULATE: Số tiền nguồn đã thay đổi; cần tính lại kỳ lương.');
  }
  const commissionMetadataChanged = commissionEntries.some((entry) => {
    const expected = commissionSnapshots[entry.id];
    const actual = commissionEntrySnapshot(entry.data());
    return !expected
      || Number(expected.amount) !== actual.amount
      || String(expected.sourceBranchId || '').trim() !== actual.sourceBranchId
      || String(expected.payrollBranchId || '').trim() !== actual.payrollBranchId
      || String(expected.commissionCategory || '').trim().toUpperCase() !== actual.commissionCategory;
  });
  if (commissionMetadataChanged) {
    throw new Error('PAYROLL_SOURCE_METADATA_CHANGED_RECALCULATE: Chi nhánh nguồn hoặc loại hoa hồng đã thay đổi; cần tính lại kỳ lương.');
  }
  if (commissionEntries.length > 0) {
    const sourceCommission = commissionEntries.reduce((sum, entry) => sum + safeSignedMoney(entry.data().commissionPayable ?? entry.data().amount), 0);
    if (sourceCommission !== safeSignedMoney(itemData.posCommission) + safeSignedMoney(itemData.techCommission)) {
      throw new Error('PAYROLL_COMMISSION_TOTAL_MISMATCH_RECALCULATE');
    }
  }
  const sourceEarnings = adjustmentEntries
    .filter((entry) => String(entry.data().type || '') === 'EARNING')
    .reduce((sum, entry) => sum + safeMoney(entry.data().amount), 0);
  const sourceDeductions = adjustmentEntries
    .filter((entry) => String(entry.data().type || '') === 'DEDUCTION')
    .reduce((sum, entry) => sum + safeMoney(entry.data().amount), 0);
  if (sourceEarnings !== safeMoney(itemData.adjustmentEarnings)
    || sourceDeductions !== safeMoney(itemData.adjustmentDeductions)) {
    throw new Error('PAYROLL_ADJUSTMENT_TOTAL_MISMATCH_RECALCULATE');
  }
  const rawNetSalary =
    safeMoney(itemData.proratedBaseSalary)
    + safeSignedMoney(itemData.posCommission)
    + safeSignedMoney(itemData.techCommission)
    + safeMoney(itemData.allowances)
    + safeMoney(itemData.adjustmentEarnings)
    - safeMoney(itemData.advances);
  const expectedNetSalary = Math.max(0, rawNetSalary);
  if (expectedNetSalary !== safeMoney(itemData.netSalary)) {
    throw new Error('PAYROLL_ITEM_TOTAL_MISMATCH_RECALCULATE');
  }
  if (rawNetSalary < 0 || Number(itemData.rawNetSalary ?? rawNetSalary) < 0 || safeMoney(itemData.negativeCarry) > 0) {
    throw new Error('PAYROLL_NEGATIVE_NET_REQUIRES_RECOVERY_ADJUSTMENT: Lương thực nhận âm phải được chuyển thành phiếu thu hồi/điều chỉnh kỳ sau trước khi duyệt.');
  }
}

function assertRunTotals(run: Record<string, any>, items: Array<{ data(): Record<string, any> }>) {
  const totalPayroll = items.reduce((sum, item) => sum + safeMoney(item.data().netSalary), 0);
  const totalCommission = items.reduce((sum, item) => sum + safeSignedMoney(item.data().posCommission) + safeSignedMoney(item.data().techCommission), 0);
  if (Number(run.staffCount) !== items.length
    || Number(run.totalPayroll) !== totalPayroll
    || Number(run.totalCommission) !== totalCommission) {
    throw new Error('PAYROLL_RUN_TOTAL_MISMATCH_RECALCULATE: Tổng kỳ lương không khớp chi tiết; cần tính lại.');
  }
}

function datesInRange(startDate: string, endDate: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) return [];
  const dates: string[] = [];
  let cursor = new Date(`${startDate}T12:00:00.000Z`);
  const end = new Date(`${endDate}T12:00:00.000Z`);
  while (cursor <= end && dates.length <= 370) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return dates;
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
  compensations?: Array<Record<string, any>>;
  leaves?: Array<Record<string, any>>;
  adjustments?: Array<Record<string, any>>;
  branches: Array<{ id: string; data: Record<string, any> }>;
  period: string;
  branchId: string;
}) {
  const branchNames = new Map(input.branches.map((branch) => [branch.id, String(branch.data.name || branch.id)]));
  const duplicatePrincipalUids = new Set<string>();
  const legacyMigrationPrincipalUids = new Set<string>();
  const groupedUsers = new Map<string, Array<{ id: string; data: Record<string, any> }>>();
  const emailToPrincipalUid = new Map<string, string>();
  const legacyCandidates: Array<{ id: string; data: Record<string, any> }> = [];
  input.users.forEach((candidate) => {
    const email = String(candidate.data.email || '').trim().toLowerCase();
    const explicitUid = String(candidate.data.authUid || candidate.data.uid || '').trim();
    const principalUid = explicitUid || (candidate.id.toLowerCase() !== email ? candidate.id : '');
    if (!principalUid) {
      legacyCandidates.push(candidate);
      return;
    }
    groupedUsers.set(principalUid, [...(groupedUsers.get(principalUid) || []), candidate]);
    if (email) emailToPrincipalUid.set(email, principalUid);
  });
  legacyCandidates.forEach((candidate) => {
    const email = String(candidate.data.email || candidate.id || '').trim().toLowerCase();
    const principalUid = emailToPrincipalUid.get(email) || candidate.id;
    groupedUsers.set(principalUid, [...(groupedUsers.get(principalUid) || []), candidate]);
  });
  const usersByPrincipalUid = new Map<string, { id: string; data: Record<string, any> }>();
  groupedUsers.forEach((candidates, groupedPrincipalUid) => {
    const canonicalCandidates = candidates.filter((candidate) => {
      const explicitUid = String(candidate.data.authUid || candidate.data.uid || '').trim();
      const email = String(candidate.data.email || '').trim().toLowerCase();
      return Boolean(explicitUid) || candidate.id.toLowerCase() !== email;
    });
    const selected = canonicalCandidates.find((candidate) => candidate.id === groupedPrincipalUid)
      || canonicalCandidates[0]
      || candidates[0];
    const principalUid = String(selected.data.authUid || selected.data.uid || groupedPrincipalUid || selected.id).trim();
    if (!principalUid) return;
    if (candidates.length > 1) duplicatePrincipalUids.add(principalUid);
    if (selected.id !== principalUid
      || canonicalCandidates.length === 0
      || candidates.some((candidate) => candidate !== selected && !candidate.data.authUid && !candidate.data.uid)) {
      legacyMigrationPrincipalUids.add(principalUid);
    }
    // Active filtering happens after identity resolution. Therefore an inactive
    // canonical profile suppresses an older active email-keyed duplicate.
    usersByPrincipalUid.set(principalUid, selected);
  });
  const scopedUsers = [...usersByPrincipalUid.values()]
    .filter(({ data }) => data.active !== false)
    .map((candidate) => ({ ...candidate, payrollHome: resolvePayrollHomeBranch(candidate.data) }))
    .filter(({ payrollHome }) => input.branchId === 'ALL' || payrollHome.branchId === input.branchId);

  return scopedUsers.map(({ id, data, payrollHome }) => {
    const principalUid = String(data.authUid || data.uid || id).trim();
    const authIds = new Set([id, data.id, data.uid, data.authUid].filter(Boolean).map(String));
    // Financial ledgers must resolve through canonical UID fields. Legacy staffId/data.id
    // aliases remain supported for attendance history only and require migration before payroll.
    const payrollStaffUids = new Set([principalUid]);
    const staffAttendance = input.attendance.filter((record) => authIds.has(String(record.staffId || '')) && String(record.date || '').startsWith(input.period));
    const workdayCredits = new Map<string, number>();
    staffAttendance.forEach((record) => {
      const date = String(record.date || '');
      if (!date) return;
      workdayCredits.set(date, Math.max(workdayCredits.get(date) || 0, resolveAttendanceWorkday(record).credit));
    });
    const scheduledDates = new Set<string>();
    const payrollBranchId = payrollHome.branchId;
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
    const publishedAssignments = new Map<string, { assigned: boolean; off: boolean }>();
    input.schedules
      .filter((schedule) => authIds.has(String(schedule.staffId || '')) && schedule.status === 'PUBLISHED')
      .filter((schedule) => !schedule.branchId || payrollHome.assignedBranchIds.includes(String(schedule.branchId)))
      .forEach((schedule) => Object.entries(schedule.days || {}).forEach(([date, assignment]: [string, any]) => {
        if (!date.startsWith(input.period)) return;
        const current = publishedAssignments.get(date) || { assigned: false, off: false };
        if (assignment?.shiftId === 'OFF' || assignment?.isOff === true) current.off = true;
        else if (assignment?.shiftId) current.assigned = true;
        publishedAssignments.set(date, current);
      }));
    publishedAssignments.forEach((assignment, date) => {
      if (assignment.assigned) scheduledDates.add(date);
      else if (assignment.off) scheduledDates.delete(date);
    });

    const payrollDates = periodDates(input.period);
    const periodStartDate = payrollDates[0];
    const periodEndDate = payrollDates[payrollDates.length - 1];
    const staffLeaves = (input.leaves || []).filter((leave) => (
      authIds.has(String(leave.staffId || ''))
      && leave.status === 'APPROVED'
      && String(leave.startDate || '') <= periodEndDate
      && String(leave.endDate || '') >= periodStartDate
    ));
    const paidLeaveDates = new Set<string>();
    const unpaidLeaveDates = new Set<string>();
    staffLeaves.forEach((leave) => {
      datesInRange(String(leave.startDate || ''), String(leave.endDate || '')).forEach((date) => {
        if (!date.startsWith(input.period) || !scheduledDates.has(date)) return;
        if (leave.type === 'ANNUAL_LEAVE' || leave.type === 'SICK_LEAVE') paidLeaveDates.add(date);
        if (leave.type === 'HALF_DAY') workdayCredits.set(date, Math.max(workdayCredits.get(date) || 0, 0.5));
        if (leave.type === 'UNPAID') unpaidLeaveDates.add(date);
      });
    });
    paidLeaveDates.forEach((date) => workdayCredits.set(date, Math.max(workdayCredits.get(date) || 0, 1)));
    unpaidLeaveDates.forEach((date) => {
      if (!staffAttendance.some((record) => record.date === date && resolveAttendanceWorkday(record).credit > 0)) workdayCredits.set(date, 0);
    });

    const standardWorkDays = scheduledDates.size;
    const workDays = Math.round([...workdayCredits.values()].reduce((sum, credit) => sum + credit, 0) * 2) / 2;
    const compensation = resolveCompensationForPeriod(input.compensations || [], principalUid, input.period);
    const baseSalary = safeMoney(compensation?.baseSalary ?? data.baseSalary);
    const allowances = safeMoney(compensation?.allowance ?? data.allowance);
    const proratedBase = standardWorkDays > 0 ? Math.round(baseSalary / standardWorkDays * Math.min(workDays, standardWorkDays)) : 0;
    const technicalEntries = input.commissions.filter((entry) => (
      isCommissionInPayrollScope(entry, payrollStaffUids, input.period, payrollBranchId)
    ));
    const salesEntries = technicalEntries.filter((entry) => String(entry.commissionCategory || entry.category || '').toUpperCase() === 'SALES');
    const technicianEntries = technicalEntries.filter((entry) => !salesEntries.includes(entry));
    const techCommission = technicianEntries.reduce((sum, entry) => sum + safeSignedMoney(entry.commissionPayable ?? entry.amount), 0);
    const posCommission = salesEntries.length > 0
      ? salesEntries.reduce((sum, entry) => sum + safeSignedMoney(entry.commissionPayable ?? entry.amount), 0)
      : safeMoney(data.salesCommission) + safeMoney(data.kpiSalesBonus);
    const adjustmentEntries = (input.adjustments || []).filter((entry) => (
      isAdjustmentInPayrollScope(entry, payrollStaffUids, input.period, payrollBranchId)
    ));
    const adjustmentEarnings = adjustmentEntries
      .filter((entry) => String(entry.type || '') === 'EARNING')
      .reduce((sum, entry) => sum + safeMoney(entry.amount), 0);
    const adjustmentDeductions = adjustmentEntries
      .filter((entry) => String(entry.type || '') === 'DEDUCTION')
      .reduce((sum, entry) => sum + safeMoney(entry.amount), 0);
    const advances = adjustmentDeductions > 0 ? adjustmentDeductions : safeMoney(data.advanceSalaryDeductions);
    const staffBranchId = String(data.branchId || '');
    const blockingIssues: string[] = [];
    const warnings: string[] = [];
    const unresolvedCommissionScope = input.commissions.some((entry) => (
      authIds.has(String(entry.staffUid || entry.staffId || ''))
      && entry.status === 'ELIGIBLE'
      && !entry.payrollPostingId
      && String(entry.payrollPeriod || '') === input.period
      && (String(entry.staffUid || '') !== principalUid
        || !String(entry.sourceBranchId || entry.branchId || '').trim()
        || String(entry.payrollBranchId || '').trim() !== payrollBranchId)
    ));
    const unresolvedAdjustmentScope = (input.adjustments || []).some((entry) => (
      authIds.has(String(entry.staffUid || entry.staffId || ''))
      && entry.status === 'APPROVED'
      && !entry.payrollPostingId
      && String(entry.period || '') === input.period
      && (String(entry.staffUid || '') !== principalUid || !String(entry.branchId || '').trim())
    ));
    if (baseSalary <= 0) blockingIssues.push('BASE_SALARY_MISSING');
    if (standardWorkDays <= 0) blockingIssues.push('SCHEDULE_MISSING');
    if (payrollHome.blockingIssue) blockingIssues.push(payrollHome.blockingIssue);
    if (duplicatePrincipalUids.has(principalUid)) blockingIssues.push('DUPLICATE_USER_PROFILE');
    if (legacyMigrationPrincipalUids.has(principalUid)) blockingIssues.push('LEGACY_USER_UID_MIGRATION_REQUIRED');
    if (unresolvedCommissionScope) blockingIssues.push('COMMISSION_LEDGER_MIGRATION_REQUIRED');
    if (unresolvedAdjustmentScope) blockingIssues.push('PAYROLL_ADJUSTMENT_MIGRATION_REQUIRED');
    if (!compensation) warnings.push('LEGACY_COMPENSATION_SOURCE');
    if (salesEntries.length === 0 && (safeMoney(data.salesCommission) > 0 || safeMoney(data.kpiSalesBonus) > 0)) warnings.push('LEGACY_SALES_COMMISSION_SOURCE');

    const rawNetSalary = proratedBase + posCommission + techCommission + allowances + adjustmentEarnings - advances;
    const negativeCarry = Math.max(0, -rawNetSalary);
    if (rawNetSalary < 0) blockingIssues.push('NEGATIVE_NET_REQUIRES_RECOVERY_ADJUSTMENT');

    return {
      staffUid: principalUid,
      staffId: principalUid,
      userDocumentId: id,
      staffName: String(data.displayName || data.name || id),
      role: String(data.role || 'STAFF'),
      branchId: payrollBranchId,
      payrollBranchId,
      operationalBranchId: staffBranchId,
      branchName: branchNames.get(payrollBranchId) || 'Chưa phân chi nhánh trả lương',
      baseSalary,
      proratedBaseSalary: proratedBase,
      workDays,
      standardWorkDays,
      paidLeaveDays: paidLeaveDates.size,
      unpaidLeaveDays: unpaidLeaveDates.size,
      posCommission,
      techCommission,
      allowances,
      advances,
      adjustmentEarnings,
      adjustmentDeductions,
      rawNetSalary,
      negativeCarry,
      netSalary: Math.max(0, rawNetSalary),
      compensationId: compensation?.id || null,
      compensationVersion: compensation ? Number(compensation.version || 1) : null,
      compensationEffectiveFrom: compensation?.effectiveFrom || null,
      compensationSource: compensation ? 'CANONICAL' : 'LEGACY_USER',
      attendanceRecordIds: staffAttendance.map((record) => String(record.id || '')).filter(Boolean),
      leaveRequestIds: staffLeaves.map((leave) => String(leave.id || '')).filter(Boolean),
      commissionEntryIds: technicalEntries.map((entry) => String(entry.id || '')).filter(Boolean),
      commissionEntryAmounts: Object.fromEntries(technicalEntries
        .map((entry) => [String(entry.id || '').trim(), safeSignedMoney(entry.commissionPayable ?? entry.amount)] as const)
        .filter(([id]) => Boolean(id))),
      commissionEntrySnapshots: Object.fromEntries(technicalEntries
        .map((entry) => [String(entry.id || '').trim(), commissionEntrySnapshot(entry)] as const)
        .filter(([id]) => Boolean(id))),
      commissionSourceBranchIds: [...new Set(technicalEntries
        .map((entry) => String(entry.sourceBranchId || entry.branchId || '').trim())
        .filter(Boolean))],
      adjustmentEntryIds: adjustmentEntries.map((entry) => String(entry.id || '')).filter(Boolean),
      adjustmentEntryAmounts: Object.fromEntries(adjustmentEntries
        .map((entry) => [String(entry.id || '').trim(), safeMoney(entry.amount)] as const)
        .filter(([id]) => Boolean(id))),
      blockingIssues,
      warnings
    } satisfies PayrollRecordSnapshot;
  });
}

async function loadPayrollSources(db: Firestore, period: string) {
  const periodEnd = nextPeriodStart(period);
  const [users, attendance, schedules, departmentPolicies, commissions, compensations, leaves, adjustments, branches] = await Promise.all([
    db.collection('users').limit(1001).get(),
    db.collection('attendance').where('date', '>=', `${period}-01`).where('date', '<', periodEnd).limit(10001).get(),
    db.collection('weeklyShiftSchedules').limit(3001).get(),
    db.collection('shiftDepartmentPolicies').limit(501).get(),
    db.collection('commissionLedger').where('payrollPeriod', '==', period).limit(5001).get(),
    db.collection('employmentCompensations').limit(3001).get(),
    db.collection('leaveRequests').where('status', '==', 'APPROVED').limit(5001).get(),
    db.collection('payrollAdjustments').where('period', '==', period).where('status', '==', 'APPROVED').limit(5001).get(),
    db.collection('branches').limit(501).get()
  ]);
  const limits = [
    ['PAYROLL_USERS_LIMIT', users.size, 1000],
    ['PAYROLL_ATTENDANCE_LIMIT', attendance.size, 10000],
    ['PAYROLL_SCHEDULE_LIMIT', schedules.size, 3000],
    ['PAYROLL_POLICY_LIMIT', departmentPolicies.size, 500],
    ['PAYROLL_COMMISSION_LIMIT', commissions.size, 5000],
    ['PAYROLL_COMPENSATION_LIMIT', compensations.size, 3000],
    ['PAYROLL_LEAVE_LIMIT', leaves.size, 5000],
    ['PAYROLL_ADJUSTMENT_LIMIT', adjustments.size, 5000],
    ['PAYROLL_BRANCH_LIMIT', branches.size, 500]
  ] as const;
  const exceeded = limits.find(([, size, limit]) => size > limit);
  if (exceeded) throw new Error(`${exceeded[0]}: Nguồn dữ liệu vượt giới hạn an toàn; không thể chốt bảng lương thiếu dữ liệu.`);
  return {
    users: users.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
    attendance: attendance.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    schedules: schedules.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    departmentPolicies: departmentPolicies.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    commissions: commissions.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    compensations: compensations.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    leaves: leaves.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    adjustments: adjustments.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
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
  const staffLock = await db.collection('payrollStaffLocks').doc(`${period}_${actor.uid}`).get();
  if (staffLock.exists && staffLock.data()?.runId) {
    const lockedRunId = String(staffLock.data()!.runId);
    const [runSnapshot, itemSnapshot] = await Promise.all([
      db.collection('payrollRuns').doc(lockedRunId).get(),
      db.collection('payrollRunItems').doc(`${lockedRunId}_${actor.uid}`).get()
    ]);
    if (runSnapshot.exists && itemSnapshot.exists && ['APPROVED', 'PAID'].includes(String(runSnapshot.data()?.status || ''))) {
      if (String(staffLock.data()?.staffUid || '') !== actor.uid) {
        throw new Error('PAYROLL_STAFF_LOCK_IDENTITY_MISMATCH: Khóa kỳ lương chưa dùng Firebase UID chuẩn.');
      }
      assertCanonicalPayrollSlip(itemSnapshot as any, lockedRunId, actor.uid);
      return { id: itemSnapshot.id, ...itemSnapshot.data(), runStatus: runSnapshot.data()?.status, approvedAt: runSnapshot.data()?.approvedAt, paidAt: runSnapshot.data()?.paidAt };
    }
  }
  const profileSnapshot = await db.collection('users').doc(actor.uid).get();
  const payrollHome = profileSnapshot.exists ? resolvePayrollHomeBranch(profileSnapshot.data() || {}) : null;
  const candidateBranches = [...new Set([payrollHome?.branchId, actor.branchId, 'ALL'].filter(Boolean))] as string[];
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
      assertCanonicalPayrollSlip(itemSnapshot as any, candidates[index].runId, actor.uid);
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
  const blockingIssueCount = records.reduce((sum, record) => sum + record.blockingIssues.length, 0);
  const warningCount = records.reduce((sum, record) => sum + record.warnings.length, 0);
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
    blockingIssueCount,
    warningCount,
    calculationVersion: 'PAYROLL_V2',
    createdAt: existingRun.data()?.createdAt || now,
    createdBy: existingRun.data()?.createdBy || actor.uid,
    updatedAt: now,
    updatedBy: actor.uid,
    calculatedAt: now,
    calculatedBy: actor.uid
  };
  batch.set(runRef, run, { merge: false });
  batch.set(db.collection('payrollPeriods').doc(payrollPeriodLockId(input.period, input.branchId)), {
    id: payrollPeriodLockId(input.period, input.branchId),
    period: input.period,
    branchId: input.branchId,
    status: 'DRAFT',
    runId,
    updatedAt: now,
    updatedByUid: actor.uid
  }, { merge: true });
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
    if (String(run.branchId || '') === 'ALL') throw new Error('PAYROLL_ALL_APPROVAL_NOT_ALLOWED: Bảng tổng hợp chỉ để xem; cần chốt và chi lương theo từng chi nhánh.');
    if (Number(run.blockingIssueCount || 0) > 0) throw new Error('PAYROLL_BLOCKING_ISSUES: Kỳ lương còn nhân viên thiếu lương hoặc lịch ca.');
    if (String(run.calculatedBy || run.updatedBy || '') === actor.uid && run.status !== 'APPROVED') {
      throw new Error('PAYROLL_MAKER_CHECKER_REQUIRED: Người tính lương không được tự duyệt cùng kỳ.');
    }

    const itemSnapshot = await transaction.get(db.collection('payrollRunItems').where('runId', '==', runId).limit(1000));
    const commissionSnapshot = await transaction.get(db.collection('commissionLedger').where('payrollPeriod', '==', run.period).limit(5001));
    const adjustmentSnapshot = await transaction.get(db.collection('payrollAdjustments').where('period', '==', run.period).where('status', '==', 'APPROVED').limit(5001));
    if (commissionSnapshot.size > 5000 || adjustmentSnapshot.size > 5000) throw new Error('PAYROLL_SOURCE_LIMIT');
    const itemStaffUids = itemSnapshot.docs.map((doc) => canonicalPayrollRunItemUid(doc as any, runId));
    if (new Set(itemStaffUids).size !== itemStaffUids.length) throw new Error('PAYROLL_RUN_DUPLICATE_STAFF_UID');
    const itemStaffIds = new Set(itemStaffUids);
    if (run.status !== 'APPROVED') {
      if (itemSnapshot.docs.some((doc) => String(doc.data().status || '') !== 'DRAFT')) {
        throw new Error('PAYROLL_RUN_ITEM_STATUS_MISMATCH_RECALCULATE');
      }
      assertRunTotals(run, itemSnapshot.docs);
    }
    const currentUserSnapshots = await Promise.all(itemStaffUids.map((staffUid) => transaction.get(db.collection('users').doc(staffUid))));
    currentUserSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists || snapshot.data()?.active === false) throw new Error('PAYROLL_STAFF_INACTIVE_RECALCULATE');
      const home = resolvePayrollHomeBranch(snapshot.data() || {});
      if (home.blockingIssue || home.branchId !== String(run.branchId || '')) {
        throw new Error('PAYROLL_HOME_BRANCH_CHANGED_RECALCULATE: Chi nhánh trả lương của nhân viên đã thay đổi; cần tính lại kỳ.');
      }
      const item = itemSnapshot.docs[index].data();
      if (String(item.payrollBranchId || item.branchId || '') !== home.branchId) {
        throw new Error('PAYROLL_HOME_BRANCH_CHANGED_RECALCULATE: Bản nháp không còn đúng chi nhánh trả lương hiện tại.');
      }
    });
    const lockRefs = itemStaffUids.map((staffUid) => db.collection('payrollStaffLocks').doc(`${run.period}_${staffUid}`));
    const lockSnapshots = await Promise.all(lockRefs.map((ref) => transaction.get(ref)));
    lockSnapshots.forEach((snapshot) => {
      if (snapshot.exists && snapshot.data()?.runId !== runId) {
        throw new Error(`PAYROLL_STAFF_ALREADY_LOCKED: Nhân viên ${snapshot.data()?.staffId || snapshot.id} đã thuộc kỳ lương ${snapshot.data()?.runId}.`);
      }
    });
    const now = new Date().toISOString();
    const commissionDocsToPost = commissionSnapshot.docs.filter((doc) => (
      isCommissionInPayrollScope(doc.data(), itemStaffIds, String(run.period), String(run.branchId))
    ));
    const adjustmentDocsToPost = adjustmentSnapshot.docs.filter((doc) => (
      isAdjustmentInPayrollScope(doc.data(), itemStaffIds, String(run.period), String(run.branchId))
    ));
    if (run.status !== 'APPROVED') {
      itemSnapshot.docs.forEach((itemDoc) => {
        const staffUid = String(itemDoc.data().staffUid || '');
        assertLedgerSnapshotMatches(
          itemDoc.data(),
          commissionDocsToPost.filter((entry) => String(entry.data().staffUid || '') === staffUid),
          adjustmentDocsToPost.filter((entry) => String(entry.data().staffUid || '') === staffUid)
        );
      });
    }
    const commissionWrites = commissionDocsToPost.length;
    const adjustmentWrites = adjustmentDocsToPost.length;
    if (itemSnapshot.size + lockRefs.length + commissionWrites + adjustmentWrites + 3 > 490) {
      throw new Error('PAYROLL_TRANSACTION_TOO_LARGE: Hãy chốt bảng lương theo phạm vi nhỏ hơn.');
    }
    lockRefs.forEach((ref, index) => transaction.set(ref, {
      id: ref.id,
      period: run.period,
      staffUid: itemStaffUids[index],
      staffId: itemStaffUids[index],
      runId,
      branchId: run.branchId,
      lockedAt: lockSnapshots[index].data()?.lockedAt || now,
      lockedByUid: lockSnapshots[index].data()?.lockedByUid || actor.uid
    }, { merge: false }));
    if (run.status === 'APPROVED') return { id: runId, ...run, idempotentReplay: true };
    transaction.update(runRef, { status: 'APPROVED', approvedAt: now, approvedBy: actor.uid, updatedAt: now, updatedBy: actor.uid });
    transaction.set(db.collection('payrollPeriods').doc(payrollPeriodLockId(String(run.period), String(run.branchId))), {
      id: payrollPeriodLockId(String(run.period), String(run.branchId)),
      period: run.period,
      branchId: run.branchId,
      status: 'APPROVED',
      runId,
      approvedAt: now,
      approvedByUid: actor.uid,
      updatedAt: now
    }, { merge: true });
    itemSnapshot.docs.forEach((doc) => transaction.update(doc.ref, { status: 'APPROVED', updatedAt: now }));
    commissionDocsToPost.forEach((doc) => {
      transaction.update(doc.ref, { payrollPostingId: runId, payrollPostedAt: now, updatedAt: now });
    });
    adjustmentDocsToPost.forEach((doc) => {
      transaction.update(doc.ref, { payrollPostingId: runId, payrollPostedAt: now, updatedAt: now });
    });
    transaction.set(db.collection('payrollAuditLogs').doc(), { runId, action: 'APPROVED', actorUid: actor.uid, actorName: actor.name || actor.uid, occurredAt: now });
    return { id: runId, ...run, status: 'APPROVED', approvedAt: now, approvedBy: actor.uid, idempotentReplay: false };
  });
}

export async function payPayrollRun(
  db: Firestore | null,
  actor: PayrollActor,
  runIdRaw: string,
  input: { fundId: string; idempotencyKey: string; note?: string }
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const role = String(actor.role || '').toUpperCase();
  if (!['ADMIN', 'ACCOUNTANT'].includes(role)) throw new Error('PAYROLL_PAYMENT_FORBIDDEN: Chỉ quản trị viên hoặc kế toán được chi lương.');
  const runId = String(runIdRaw || '').trim();
  const fundId = String(input.fundId || '').trim();
  const idempotencyKey = requireFinanceIdempotencyKey(input.idempotencyKey, '');
  if (!runId || !fundId) throw new Error('PAYROLL_PAYMENT_REQUIRED_FIELDS');
  const payloadHash = financePayloadHash('PAYROLL_PAYMENT', { runId, fundId, note: String(input.note || '').trim() });
  const runRef = db.collection('payrollRuns').doc(runId);
  const fundRef = db.collection('funds').doc(fundId);
  const requestRef = db.collection('payrollPaymentRequests').doc(idempotencyKey);

  return db.runTransaction(async (transaction) => {
    const [requestSnapshot, runSnapshot, fundSnapshot, itemSnapshot, commissionSnapshot, adjustmentSnapshot] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(runRef),
      transaction.get(fundRef),
      transaction.get(db.collection('payrollRunItems').where('runId', '==', runId).limit(1001)),
      transaction.get(db.collection('commissionLedger').where('payrollPostingId', '==', runId).limit(5001)),
      transaction.get(db.collection('payrollAdjustments').where('payrollPostingId', '==', runId).limit(5001))
    ]);
    if (requestSnapshot.exists) {
      const existing = requestSnapshot.data()!;
      assertFinanceIdempotencyRecord(existing, { operationType: 'PAYROLL_PAYMENT', payloadHash, actorUid: actor.uid });
      if (existing.status !== 'COMPLETED') throw new Error('IDEMPOTENCY_REQUEST_IN_PROGRESS');
      return { ...existing.result, idempotentReplay: true };
    }
    if (!runSnapshot.exists) throw new Error('PAYROLL_RUN_NOT_FOUND');
    if (!fundSnapshot.exists) throw new Error('PAYROLL_FUND_NOT_FOUND');
    if (itemSnapshot.size > 1000 || commissionSnapshot.size > 5000 || adjustmentSnapshot.size > 5000) throw new Error('PAYROLL_PAYMENT_SOURCE_LIMIT');
    if (itemSnapshot.size + commissionSnapshot.size + adjustmentSnapshot.size + 8 > 490) throw new Error('PAYROLL_PAYMENT_TRANSACTION_TOO_LARGE');
    const run = runSnapshot.data()!;
    const fund = fundSnapshot.data()!;
    assertPeriod(String(run.period || ''));
    assertAccess(actor, String(run.branchId || ''));
    if (run.status === 'PAID') throw new Error('PAYROLL_RUN_PAID');
    if (run.status !== 'APPROVED') throw new Error('PAYROLL_RUN_NOT_APPROVED');
    if (String(run.approvedBy || '') === actor.uid) throw new Error('PAYROLL_PAYMENT_CHECKER_REQUIRED: Người duyệt không được tự xác nhận chi lương.');
    if (String(run.branchId || '') === 'ALL') throw new Error('PAYROLL_ALL_PAYMENT_NOT_ALLOWED: Cần chi lương theo từng chi nhánh/quỹ.');
    if (String(fund.branchId || '') !== String(run.branchId || '')) throw new Error('PAYROLL_FUND_BRANCH_MISMATCH');
    if (fund.isActive === false || fund.active === false || fund.isArchived === true) throw new Error('PAYROLL_FUND_NOT_ACTIVE');
    const canonicalItemUids = itemSnapshot.docs.map((doc) => canonicalPayrollRunItemUid(doc as any, runId));
    if (new Set(canonicalItemUids).size !== canonicalItemUids.length) throw new Error('PAYROLL_RUN_DUPLICATE_STAFF_UID');
    const itemStaffUids = new Set(canonicalItemUids);
    if (itemSnapshot.docs.some((doc) => String(doc.data().status || '') !== 'APPROVED')) {
      throw new Error('PAYROLL_RUN_ITEM_STATUS_MISMATCH');
    }
    assertRunTotals(run, itemSnapshot.docs);
    assertPostedPayrollEntriesInScope(
      commissionSnapshot.docs,
      adjustmentSnapshot.docs,
      itemStaffUids,
      String(run.period),
      String(run.branchId)
    );
    itemSnapshot.docs.forEach((itemDoc) => {
      const staffUid = String(itemDoc.data().staffUid || '');
      assertLedgerSnapshotMatches(
        itemDoc.data(),
        commissionSnapshot.docs.filter((entry) => String(entry.data().staffUid || '') === staffUid),
        adjustmentSnapshot.docs.filter((entry) => String(entry.data().staffUid || '') === staffUid)
      );
    });
    const amount = parseVnd(run.totalPayroll, { field: 'PAYROLL_TOTAL' });
    const currentBalance = parseVnd(fund.currentBalance ?? 0, { allowZero: true, field: 'FUND_BALANCE' });
    const totalExpense = parseVnd(fund.totalExpense ?? 0, { allowZero: true, field: 'FUND_TOTAL_EXPENSE' });
    if (currentBalance < amount) throw new Error('PAYROLL_FUND_INSUFFICIENT_BALANCE');
    const nextBalance = currentBalance - amount;
    const nextTotalExpense = totalExpense + amount;
    parseVnd(nextBalance, { allowZero: true, field: 'FUND_BALANCE' });
    parseVnd(nextTotalExpense, { allowZero: true, field: 'FUND_TOTAL_EXPENSE' });
    const now = new Date().toISOString();
    const paymentBatchId = `PAYMENT_${runId}`;
    const cashTransactionId = `PAYROLL_CASH_${runId}`;
    const result = {
      id: paymentBatchId,
      runId,
      period: run.period,
      branchId: run.branchId,
      fundId,
      fundName: String(fund.name || fundId),
      amount,
      staffCount: itemSnapshot.size,
      status: 'PAID',
      paidAt: now,
      paidByUid: actor.uid,
      paidByName: actor.name || actor.uid,
      cashTransactionId
    };

    transaction.update(fundRef, { currentBalance: nextBalance, totalExpense: nextTotalExpense, updatedAt: now });
    transaction.set(db.collection('cashTransactions').doc(cashTransactionId), {
      id: cashTransactionId,
      code: `CL-${String(run.period).replace('-', '')}-${String(run.branchId).slice(-6)}`,
      type: 'PAYMENT',
      category: 'SALARY_BONUS',
      categoryName: `Chi lương kỳ ${run.period}`,
      amount,
      fundId,
      fundName: fund.name || fundId,
      fundType: fund.type || 'BANK',
      branchId: run.branchId,
      sourceType: 'PAYROLL_RUN',
      sourceId: runId,
      referenceCode: runId,
      creatorUid: actor.uid,
      creatorName: actor.name || actor.uid,
      creator: actor.name || actor.uid,
      notes: String(input.note || '').trim() || `Chi lương ${run.period}`,
      isPLAccounted: true,
      status: 'COMPLETED',
      date: now,
      createdAt: now
    });
    transaction.set(db.collection('payrollPaymentBatches').doc(paymentBatchId), result, { merge: false });
    transaction.update(runRef, { status: 'PAID', paymentBatchId, fundId, paidAt: now, paidBy: actor.uid, updatedAt: now, updatedBy: actor.uid });
    transaction.set(db.collection('payrollPeriods').doc(payrollPeriodLockId(String(run.period), String(run.branchId))), {
      id: payrollPeriodLockId(String(run.period), String(run.branchId)),
      period: run.period,
      branchId: run.branchId,
      status: 'PAID',
      runId,
      paymentBatchId,
      paidAt: now,
      paidByUid: actor.uid,
      updatedAt: now
    }, { merge: true });
    itemSnapshot.docs.forEach((doc) => transaction.update(doc.ref, { status: 'PAID', paymentBatchId, paidAt: now, updatedAt: now }));
    commissionSnapshot.docs.forEach((doc) => transaction.update(doc.ref, { status: 'PAID', paidAt: now, payrollBatchId: paymentBatchId, updatedAt: now }));
    adjustmentSnapshot.docs.forEach((doc) => transaction.update(doc.ref, { status: 'PAID', paidAt: now, payrollBatchId: paymentBatchId, updatedAt: now }));
    transaction.set(db.collection('payrollAuditLogs').doc(), { runId, action: 'PAID', paymentBatchId, fundId, amount, actorUid: actor.uid, actorName: actor.name || actor.uid, occurredAt: now });
    transaction.set(requestRef, {
      id: idempotencyKey,
      type: 'PAYROLL_PAYMENT',
      status: 'COMPLETED',
      payloadHash,
      creatorUid: actor.uid,
      branchId: run.branchId,
      result,
      createdAt: now
    });
    return { ...result, idempotentReplay: false };
  });
}
