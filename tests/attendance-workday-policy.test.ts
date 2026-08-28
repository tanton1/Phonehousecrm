import { describe, expect, it } from 'vitest';
import { resolveAttendanceWorkday } from '../shared/attendancePolicy';
import { processServerCheckOut } from '../server/services/attendanceService';

const completed = (netWorkMinutes: number, extra: Record<string, any> = {}) => ({
  checkInTime: '08:00:00',
  checkOutTime: '17:00:00',
  attendanceStatus: 'COMPLETED',
  scheduledStart: '08:00',
  scheduledEnd: '17:00',
  scheduledBreakMinutes: 60,
  netWorkMinutes,
  verificationStatus: 'VERIFIED',
  verification: { gpsVerified: true },
  checkOutVerification: { gpsVerified: true },
  ...extra
});

describe('attendance workday policy', () => {
  it('uses the scheduled net duration instead of forcing every shift to eight hours', () => {
    expect(resolveAttendanceWorkday(completed(432))).toMatchObject({ credit: 1, status: 'FULL_DAY', scheduledNetMinutes: 480 });
    expect(resolveAttendanceWorkday(completed(431))).toMatchObject({ credit: 0.5, status: 'HALF_DAY' });
    expect(resolveAttendanceWorkday(completed(240))).toMatchObject({ credit: 0.5, status: 'HALF_DAY' });
    expect(resolveAttendanceWorkday(completed(239))).toMatchObject({ credit: 0, status: 'INSUFFICIENT' });

    const shortShift = completed(270, { scheduledStart: '17:00', scheduledEnd: '22:00', scheduledBreakMinutes: 0 });
    expect(resolveAttendanceWorkday(shortShift)).toMatchObject({ credit: 1, scheduledNetMinutes: 300, requiredFullDayMinutes: 270 });
  });

  it('does not credit open, rejected or GPS-pending attendance', () => {
    expect(resolveAttendanceWorkday({ ...completed(480), checkOutTime: undefined, attendanceStatus: 'CHECKED_IN' })).toMatchObject({ credit: 0, status: 'MISSING_CHECKOUT' });
    expect(resolveAttendanceWorkday(completed(480, { verificationStatus: 'REJECTED' }))).toMatchObject({ credit: 0, status: 'REJECTED' });
    expect(resolveAttendanceWorkday(completed(480, { verificationStatus: 'PENDING_REVIEW', checkOutVerification: { gpsVerified: false } }))).toMatchObject({ credit: 0, status: 'PENDING_REVIEW' });
  });

  it('credits an outside-GPS checkout only after a manager approval', () => {
    const pending = completed(480, { verificationStatus: 'PENDING_REVIEW', checkOutVerification: { gpsVerified: false } });
    expect(resolveAttendanceWorkday(pending).credit).toBe(0);
    expect(resolveAttendanceWorkday({ ...pending, verificationStatus: 'VERIFIED', reviewData: { decision: 'APPROVE' } })).toMatchObject({ credit: 1, status: 'FULL_DAY' });
  });

  it('requires a fresh checkout GPS coordinate in production mode', async () => {
    await expect(processServerCheckOut({} as any, { staffId: 'STAFF_01', branchId: 'CN01' }))
      .rejects.toThrow('CHECKOUT_GPS_REQUIRED');
  });
});
