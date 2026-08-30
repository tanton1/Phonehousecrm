import { describe, expect, it } from 'vitest';
import { attendanceDurationMinutes, processAttendanceCorrection, vietnamLocalDateTimeToIso } from '../server/services/attendanceService';
import { monthKeysBetween } from '../server/services/payrollPeriodLockService';

function createAttendanceDb(seed: Record<string, Record<string, any>>) {
  const store = new Map<string, any>();
  Object.entries(seed).forEach(([collection, docs]) => Object.entries(docs).forEach(([id, value]) => store.set(`${collection}/${id}`, { ...value })));
  let generated = 0;
  const snapshot = (ref: any) => ({ id: ref.id, ref, exists: store.has(ref.path), data: () => store.get(ref.path) });
  const db: any = {
    collection(name: string) {
      return {
        doc(id?: string) {
          const resolved = id || `AUTO_${++generated}`;
          return { id: resolved, path: `${name}/${resolved}` };
        }
      };
    },
    async runTransaction(handler: any) {
      return handler({
        get: async (ref: any) => snapshot(ref),
        update: (ref: any, fields: any) => store.set(ref.path, { ...store.get(ref.path), ...fields }),
        set: (ref: any, fields: any) => store.set(ref.path, { ...fields })
      });
    }
  };
  return { db, get: (collection: string, id: string) => store.get(`${collection}/${id}`), values: (collection: string) => [...store.entries()].filter(([key]) => key.startsWith(`${collection}/`)).map(([, value]) => value) };
}

describe('attendance payroll lock and timestamp correction', () => {
  it('calculates an overnight shift from authoritative timestamps', () => {
    const start = vietnamLocalDateTimeToIso('2026-08-29', '22:00:00');
    const end = vietnamLocalDateTimeToIso('2026-08-30', '06:00:00');
    expect(attendanceDurationMinutes(start, end)).toBe(480);
    expect(monthKeysBetween('2026-08-31', '2026-09-02')).toEqual(['2026-08', '2026-09']);
  });

  it('rejects an attendance duration longer than the operational maximum', () => {
    expect(() => attendanceDurationMinutes('2026-08-29T00:00:00.000Z', '2026-08-30T00:01:00.000Z'))
      .toThrow('ATTENDANCE_SHIFT_TOO_LONG');
  });

  it('blocks manager correction after the payroll period is approved', async () => {
    const fixture = createAttendanceDb({
      attendance: { ATT_01: { staffId: 'STAFF_01', branchId: 'CN01', date: '2026-08-29', checkInTime: '08:00:00', attendanceStatus: 'CHECKED_IN', verificationStatus: 'VERIFIED', verification: { gpsVerified: true } } },
      payrollPeriods: { '2026-08_CN01': { period: '2026-08', branchId: 'CN01', status: 'APPROVED' } }
    });
    await expect(processAttendanceCorrection(fixture.db, {
      attendanceId: 'ATT_01', correctedCheckOutTime: '17:00:00', reason: 'Bổ sung giờ ra ca',
      actorUid: 'MANAGER_01', actorName: 'Quản lý', actorRole: 'MANAGER', actorBranchId: 'CN01'
    })).rejects.toThrow('PAYROLL_PERIOD_LOCKED');
  });

  it('corrects a missing overnight checkout and writes before/after audit', async () => {
    const fixture = createAttendanceDb({
      attendance: { ATT_01: {
        staffId: 'STAFF_01', staffName: 'KTV', branchId: 'CN01', date: '2026-08-29',
        checkInTime: '22:00:00', attendanceStatus: 'CHECKED_IN', verificationStatus: 'VERIFIED',
        scheduledStart: '22:00', scheduledEnd: '06:00', scheduledBreakMinutes: 60,
        verification: { gpsVerified: true }, checkOutVerification: { gpsVerified: true }
      } }
    });
    const result = await processAttendanceCorrection(fixture.db, {
      attendanceId: 'ATT_01', correctedCheckOutDate: '2026-08-30', correctedCheckOutTime: '06:00:00', reason: 'Nhân viên quên xác nhận ra ca',
      actorUid: 'MANAGER_01', actorName: 'Quản lý', actorRole: 'MANAGER', actorBranchId: 'CN01'
    });
    expect(result).toMatchObject({ attendanceStatus: 'COMPLETED', workDurationMinutes: 480, netWorkMinutes: 420 });
    expect(fixture.get('attendance', 'ATT_01')).toMatchObject({ checkOutDate: '2026-08-30', workDurationMinutes: 480 });
    expect(fixture.values('attendanceAuditLogs')[0]).toMatchObject({ action: 'ATTENDANCE_CORRECTED', before: { checkOutTime: null }, after: { checkOutTime: '06:00:00', workDurationMinutes: 480 } });
  });
});
