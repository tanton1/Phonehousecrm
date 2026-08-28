export type AttendanceWorkdayStatus =
  | 'FULL_DAY'
  | 'HALF_DAY'
  | 'INSUFFICIENT'
  | 'MISSING_CHECKOUT'
  | 'PENDING_REVIEW'
  | 'REJECTED'
  | 'SCHEDULE_MISSING';

export interface AttendanceWorkdayResult {
  credit: 0 | 0.5 | 1;
  status: AttendanceWorkdayStatus;
  scheduledNetMinutes: number;
  requiredFullDayMinutes: number;
  requiredHalfDayMinutes: number;
  actualNetMinutes: number;
  policyVersion: 'ATTENDANCE_WORKDAY_V1';
}

type AttendanceLike = Record<string, any>;

function finiteNonNegative(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseClockMinutes(value: unknown): number | null {
  const text = String(value || '').trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function minutesBetween(start: number, end: number): number {
  return end >= start ? end - start : (1440 - start) + end;
}

export function resolveScheduledNetMinutes(record: AttendanceLike): number {
  const explicit = finiteNonNegative(record.scheduledNetMinutes);
  if (explicit > 0) return Math.round(explicit);
  const start = parseClockMinutes(record.scheduledStart);
  const end = parseClockMinutes(record.scheduledEnd);
  if (start === null || end === null) return 0;
  const gross = minutesBetween(start, end);
  const breakMinutes = finiteNonNegative(record.scheduledBreakMinutes ?? record.breakDurationMinutes);
  return Math.max(0, Math.round(gross - Math.min(gross, breakMinutes)));
}

function resolveActualNetMinutes(record: AttendanceLike): number {
  const explicit = finiteNonNegative(record.netWorkMinutes);
  if (explicit > 0) return Math.round(explicit);
  const gross = finiteNonNegative(record.workDurationMinutes);
  const breakMinutes = finiteNonNegative(record.scheduledBreakMinutes ?? record.breakDurationMinutes);
  return Math.max(0, Math.round(gross - Math.min(gross, breakMinutes)));
}

export function resolveAttendanceWorkday(record: AttendanceLike): AttendanceWorkdayResult {
  const scheduledNetMinutes = resolveScheduledNetMinutes(record);
  const requiredFullDayMinutes = Math.ceil(scheduledNetMinutes * 0.9);
  const requiredHalfDayMinutes = Math.ceil(scheduledNetMinutes * 0.5);
  const actualNetMinutes = resolveActualNetMinutes(record);
  const base = {
    scheduledNetMinutes,
    requiredFullDayMinutes,
    requiredHalfDayMinutes,
    actualNetMinutes,
    policyVersion: 'ATTENDANCE_WORKDAY_V1' as const
  };

  if (record.verificationStatus === 'REJECTED' || record.status === 'REJECTED') {
    return { ...base, credit: 0, status: 'REJECTED' };
  }
  if (!record.checkInTime) return { ...base, credit: 0, status: 'INSUFFICIENT' };
  if (!record.checkOutTime && record.attendanceStatus !== 'COMPLETED') {
    return { ...base, credit: 0, status: 'MISSING_CHECKOUT' };
  }

  const managerApproved = record.reviewData?.decision === 'APPROVE';
  const checkInGpsRejected = record.verification?.gpsVerified === false;
  const checkOutGpsRejected = record.checkOutVerification?.gpsVerified === false;
  if (!managerApproved && (
    record.verificationStatus === 'PENDING_REVIEW'
    || checkInGpsRejected
    || checkOutGpsRejected
  )) {
    return { ...base, credit: 0, status: 'PENDING_REVIEW' };
  }
  if (scheduledNetMinutes <= 0) return { ...base, credit: 0, status: 'SCHEDULE_MISSING' };
  if (actualNetMinutes >= requiredFullDayMinutes) return { ...base, credit: 1, status: 'FULL_DAY' };
  if (actualNetMinutes >= requiredHalfDayMinutes) return { ...base, credit: 0.5, status: 'HALF_DAY' };
  return { ...base, credit: 0, status: 'INSUFFICIENT' };
}

export function attendanceWorkdayFields(record: AttendanceLike) {
  const result = resolveAttendanceWorkday(record);
  return {
    creditedWorkDay: result.credit,
    workdayStatus: result.status,
    scheduledNetMinutes: result.scheduledNetMinutes,
    requiredFullDayMinutes: result.requiredFullDayMinutes,
    requiredHalfDayMinutes: result.requiredHalfDayMinutes,
    workdayPolicyVersion: result.policyVersion
  };
}

export function sumAttendanceWorkdays(records: AttendanceLike[]): number {
  return Math.round(records.reduce((sum, record) => sum + resolveAttendanceWorkday(record).credit, 0) * 2) / 2;
}
