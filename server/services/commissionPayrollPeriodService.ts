import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { payrollPeriodLockId } from './payrollPeriodLockService';
import { resolvePayrollHomeBranch } from './payrollStaffIdentity';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const LOCKED_PERIOD_STATUSES = new Set(['APPROVED', 'PAID', 'LOCKED']);
const MAX_CARRY_FORWARD_MONTHS = 24;

function addMonths(period: string, count: number) {
  if (!PERIOD_RE.test(period)) throw new Error('COMMISSION_PAYROLL_PERIOD_INVALID');
  const [year, month] = period.split('-').map(Number);
  const value = year * 12 + month - 1 + count;
  return `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, '0')}`;
}

export interface CommissionPayrollPeriodResolution {
  assignedPeriod: string;
  originalPayrollPeriod: string;
  payrollPeriod: string;
  payrollBranchId: string;
  carriedFromPeriod: string | null;
  carryForwardReason: string | null;
}

/**
 * Resolves the immutable payroll destination before a commission becomes
 * ELIGIBLE. An approved/paid staff period is never reopened: the entry moves
 * to the first later open Vietnam month and carries an explicit audit trail.
 */
export async function resolveCommissionPayrollPeriod(
  transaction: Transaction,
  db: Firestore,
  input: {
    staffUid: string;
    sourceBranchId: string;
    requestedPeriod: string;
    assignedPeriod?: string | null;
  }
): Promise<CommissionPayrollPeriodResolution> {
  const staffUid = String(input.staffUid || '').trim();
  const sourceBranchId = String(input.sourceBranchId || '').trim();
  const requestedPeriod = String(input.requestedPeriod || '').trim();
  const assignedPeriod = String(input.assignedPeriod || requestedPeriod).trim();
  if (!staffUid || !sourceBranchId) throw new Error('COMMISSION_PAYROLL_SCOPE_REQUIRED');
  if (!PERIOD_RE.test(requestedPeriod) || !PERIOD_RE.test(assignedPeriod)) {
    throw new Error('COMMISSION_PAYROLL_PERIOD_INVALID');
  }

  const userSnapshot = await transaction.get(db.collection('users').doc(staffUid));
  if (!userSnapshot.exists) {
    throw new Error(`COMMISSION_PAYROLL_STAFF_NOT_FOUND: Không tìm thấy hồ sơ users/${staffUid}.`);
  }
  const user = userSnapshot.data() || {};
  const explicitUid = String(user.authUid || user.uid || '').trim();
  if (explicitUid && explicitUid !== staffUid) {
    throw new Error(`COMMISSION_PAYROLL_STAFF_IDENTITY_MISMATCH: Hồ sơ users/${staffUid} đang liên kết Firebase UID khác.`);
  }
  if (user.active === false || String(user.status || '').toUpperCase() === 'INACTIVE') {
    throw new Error(`COMMISSION_PAYROLL_STAFF_INACTIVE: Nhân viên ${staffUid} đã ngừng hoạt động.`);
  }
  const payrollHome = resolvePayrollHomeBranch(user);
  if (payrollHome.blockingIssue || !payrollHome.branchId) {
    throw new Error(`COMMISSION_PAYROLL_HOME_REQUIRED: Nhân viên ${staffUid} chưa có chi nhánh trả lương hợp lệ.`);
  }
  const payrollBranchId = payrollHome.branchId;

  let firstLockReason = '';
  for (let offset = 0; offset <= MAX_CARRY_FORWARD_MONTHS; offset += 1) {
    const candidatePeriod = addMonths(requestedPeriod, offset);
    const [periodSnapshot, staffLockSnapshot] = await Promise.all([
      transaction.get(db.collection('payrollPeriods').doc(payrollPeriodLockId(candidatePeriod, payrollBranchId))),
      transaction.get(db.collection('payrollStaffLocks').doc(`${candidatePeriod}_${staffUid}`))
    ]);
    const periodData = periodSnapshot.exists && typeof periodSnapshot.data === 'function' ? periodSnapshot.data() : {};
    const staffLockData = staffLockSnapshot.exists && typeof staffLockSnapshot.data === 'function' ? staffLockSnapshot.data() : {};
    const periodStatus = String(periodData?.status || 'OPEN').toUpperCase();
    const periodLocked = periodSnapshot.exists && LOCKED_PERIOD_STATUSES.has(periodStatus);
    const staffLocked = staffLockSnapshot.exists;
    if (!periodLocked && !staffLocked) {
      return {
        assignedPeriod,
        originalPayrollPeriod: requestedPeriod,
        payrollPeriod: candidatePeriod,
        payrollBranchId,
        carriedFromPeriod: offset > 0 ? requestedPeriod : null,
        carryForwardReason: offset > 0 ? firstLockReason || 'PAYROLL_PERIOD_LOCKED' : null
      };
    }
    if (!firstLockReason) {
      firstLockReason = staffLocked
        ? `PAYROLL_STAFF_PERIOD_LOCKED${staffLockData?.runId ? `:${staffLockData.runId}` : ''}`
        : `PAYROLL_PERIOD_${periodStatus}`;
    }
  }
  throw new Error('COMMISSION_PAYROLL_NO_OPEN_PERIOD: Không tìm thấy kỳ lương mở trong 24 tháng tiếp theo.');
}
