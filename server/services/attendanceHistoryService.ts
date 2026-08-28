import { Firestore } from 'firebase-admin/firestore';
import { normalizeRole } from '../../shared/permissions';
import { resolveAttendanceWorkday } from '../../shared/attendancePolicy';

export interface AttendanceHistoryActor {
  uid: string;
  role?: string;
  branchId?: string;
  assignedBranchIds?: string[];
}

export interface AttendanceHistoryQuery {
  staffUid?: unknown;
  branchId?: unknown;
  month?: unknown;
}

export interface AttendanceHistorySummary {
  workDays: number;
  completedDays: number;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeMinutes: number;
  missingCheckoutDays: number;
  pendingReviewDays: number;
}

const HISTORY_MANAGER_ROLES = new Set(['ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'STORE_MANAGER']);

function currentVietnamMonth() {
  return new Date().toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit'
  }).slice(0, 7);
}

export function normalizeAttendanceHistoryMonth(value: unknown) {
  const month = String(value || '').trim();
  if (!month) return currentVietnamMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('ATTENDANCE_HISTORY_MONTH_INVALID');
  return month;
}

export function resolveAttendanceHistoryScope(actor: AttendanceHistoryActor, input: AttendanceHistoryQuery) {
  const role = normalizeRole(actor.role);
  const mayViewTeam = HISTORY_MANAGER_ROLES.has(role);
  const requestedStaffUid = String(input.staffUid || '').trim();
  const staffUid = mayViewTeam ? requestedStaffUid : actor.uid;
  if (!staffUid) throw new Error('ATTENDANCE_HISTORY_STAFF_REQUIRED');
  if (!mayViewTeam && requestedStaffUid && requestedStaffUid !== actor.uid) {
    throw new Error('ATTENDANCE_HISTORY_STAFF_FORBIDDEN');
  }

  const requestedBranchId = String(input.branchId || '').trim();
  const allowedBranches = new Set([actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean));
  const mayViewAllBranches = role === 'ADMIN' || role === 'REGIONAL_MANAGER';
  if (requestedBranchId && requestedBranchId !== 'ALL' && !mayViewAllBranches && !allowedBranches.has(requestedBranchId)) {
    throw new Error('ATTENDANCE_HISTORY_BRANCH_FORBIDDEN');
  }

  return {
    role,
    mayViewTeam,
    staffUid,
    month: normalizeAttendanceHistoryMonth(input.month),
    branchId: requestedBranchId || (mayViewAllBranches ? 'ALL' : String(actor.branchId || '')),
    allowedBranches,
    mayViewAllBranches
  };
}

export function buildAttendanceHistorySummary(records: Array<Record<string, any>>): AttendanceHistorySummary {
  return records.reduce<AttendanceHistorySummary>((summary, record) => {
    summary.workDays += resolveAttendanceWorkday(record).credit;
    if (record.checkOutTime) summary.completedDays += 1;
    summary.lateMinutes += Math.max(0, Number(record.lateMinutes || 0));
    summary.earlyMinutes += Math.max(0, Number(record.earlyMinutes || 0));
    summary.overtimeMinutes += Math.max(0, Number(record.otMinutes || 0));
    if (record.checkInTime && !record.checkOutTime) summary.missingCheckoutDays += 1;
    if (record.verificationStatus === 'PENDING_REVIEW') summary.pendingReviewDays += 1;
    return summary;
  }, {
    workDays: 0,
    completedDays: 0,
    lateMinutes: 0,
    earlyMinutes: 0,
    overtimeMinutes: 0,
    missingCheckoutDays: 0,
    pendingReviewDays: 0
  });
}

function publicAttendanceRecord(id: string, data: Record<string, any>) {
  const verification = data.verification || {};
  return {
    id,
    staffId: String(data.staffId || ''),
    staffName: String(data.staffName || ''),
    role: data.role,
    branchId: String(data.branchId || ''),
    branchName: String(data.branchName || ''),
    date: String(data.date || ''),
    shiftId: data.shiftId,
    shiftName: String(data.shiftName || ''),
    scheduledStart: String(data.scheduledStart || ''),
    scheduledEnd: String(data.scheduledEnd || ''),
    scheduledBreakMinutes: Number(data.scheduledBreakMinutes || 0),
    graceMinutes: Number(data.graceMinutes || 0),
    checkInTime: data.checkInTime,
    checkOutTime: data.checkOutTime,
    workDurationMinutes: Number(data.workDurationMinutes || 0),
    breakDurationMinutes: Number(data.breakDurationMinutes || 0),
    netWorkMinutes: Number(data.netWorkMinutes || 0),
    scheduledNetMinutes: Number(data.scheduledNetMinutes || 0),
    requiredFullDayMinutes: Number(data.requiredFullDayMinutes || 0),
    requiredHalfDayMinutes: Number(data.requiredHalfDayMinutes || 0),
    creditedWorkDay: resolveAttendanceWorkday(data).credit,
    workdayStatus: resolveAttendanceWorkday(data).status,
    workdayPolicyVersion: data.workdayPolicyVersion,
    status: data.status,
    attendanceStatus: data.attendanceStatus,
    punctualityStatus: data.punctualityStatus,
    verificationStatus: data.verificationStatus,
    lateMinutes: Number(data.lateMinutes || 0),
    earlyMinutes: Number(data.earlyMinutes || 0),
    otMinutes: Number(data.otMinutes || 0),
    verification: {
      gpsVerified: verification.gpsVerified === true,
      distanceMeters: Number(verification.distanceMeters ?? verification.gpsDistanceMeters ?? 0),
      gpsDistanceMeters: Number(verification.gpsDistanceMeters ?? verification.distanceMeters ?? 0),
      userCoords: verification.userCoords,
      photoCaptured: verification.photoCaptured === true || Boolean(verification.photoEvidenceId),
      photoEvidenceId: verification.photoEvidenceId,
      photoCapturedAt: verification.photoCapturedAt,
      serverTimeIso: verification.serverTimeIso
    },
    checkOutVerification: data.checkOutVerification ? {
      gpsVerified: data.checkOutVerification.gpsVerified === true,
      distanceMeters: Number(data.checkOutVerification.distanceMeters || 0),
      userCoords: data.checkOutVerification.userCoords,
      serverTimeIso: data.checkOutVerification.serverTimeIso
    } : undefined,
    reviewData: data.reviewData
  };
}

export async function listAttendanceHistory(
  db: Firestore | null,
  actor: AttendanceHistoryActor,
  input: AttendanceHistoryQuery
) {
  if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const scope = resolveAttendanceHistoryScope(actor, input);
  const startDate = `${scope.month}-01`;
  const endDate = `${scope.month}-31`;
  const snapshot = await db.collection('attendance')
    .where('staffId', '==', scope.staffUid)
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date', 'desc')
    .limit(62)
    .get();

  const records = snapshot.docs
    .map(doc => publicAttendanceRecord(doc.id, doc.data() || {}))
    .filter(record => {
      if (scope.branchId !== 'ALL' && record.branchId !== scope.branchId) return false;
      return scope.mayViewAllBranches || scope.allowedBranches.has(record.branchId);
    });

  return {
    staffUid: scope.staffUid,
    month: scope.month,
    records,
    summary: buildAttendanceHistorySummary(records),
    complete: snapshot.size < 62
  };
}
