import { describe, it, expect } from 'vitest';
import { 
  resolveShiftAssignment, 
  diffMinutes, 
  getVietnamWeekStart, 
  STANDARD_SHIFTS,
  processServerCheckIn,
  processServerCheckOut
} from '../server/services/attendanceService';

describe('Sprint P0: Shift Engine Fail-Closed & Attendance Domain Suite', () => {

  describe('1. WeekStart and Time Difference Utilities', () => {
    it('calculates Vietnam Monday week start date accurately', () => {
      // 2026-08-20 is Thursday -> Monday is 2026-08-17
      expect(getVietnamWeekStart('2026-08-20')).toBe('2026-08-17');
      // 2026-08-17 is Monday -> Monday is 2026-08-17
      expect(getVietnamWeekStart('2026-08-17')).toBe('2026-08-17');
      // 2026-08-23 is Sunday -> Monday is 2026-08-17
      expect(getVietnamWeekStart('2026-08-23')).toBe('2026-08-17');
    });

    it('calculates daytime duration correctly', () => {
      const inMins = 8 * 60; // 08:00
      const outMins = 17 * 60; // 17:00
      expect(diffMinutes(inMins, outMins)).toBe(540); // 9 hours
    });

    it('calculates overnight shift duration correctly without negative minutes', () => {
      const inMins = 22 * 60; // 22:00 (1320)
      const outMins = 6 * 60;  // 06:00 (360)
      expect(diffMinutes(inMins, outMins)).toBe(480); // 8 hours across midnight
    });
  });

  describe('2. Shift Resolution Fail-Closed Policies', () => {
    it('throws OFF_DAY error when day is scheduled as day off', async () => {
      await expect(
        resolveShiftAssignment(null, {
          staffId: 'STAFF_01',
          branchId: 'CN01',
          workDate: '2026-08-20',
          testShiftMock: STANDARD_SHIFTS.OFF
        })
      ).rejects.toThrow('OFF_DAY');
    });

    it('resolves standard morning shift with 60m break', async () => {
      const shift = await resolveShiftAssignment(null, {
        staffId: 'STAFF_01',
        branchId: 'CN01',
        workDate: '2026-08-20',
        testShiftMock: STANDARD_SHIFTS.SHIFT_MORNING
      });

      expect(shift.shiftId).toBe('SHIFT_MORNING');
      expect(shift.startTime).toBe('08:00');
      expect(shift.endTime).toBe('17:00');
      expect(shift.breakMinutes).toBe(60);
    });

    it('resolves afternoon shift with 45m break', async () => {
      const shift = await resolveShiftAssignment(null, {
        staffId: 'STAFF_02',
        branchId: 'CN01',
        workDate: '2026-08-20',
        testShiftMock: STANDARD_SHIFTS.SHIFT_AFTERNOON
      });

      expect(shift.shiftId).toBe('SHIFT_AFTERNOON');
      expect(shift.startTime).toBe('14:00');
      expect(shift.endTime).toBe('22:00');
      expect(shift.breakMinutes).toBe(45);
    });
  });

  describe('3. Check-In & Check-Out Domain Fields and Break Deduction', () => {
    it('sets 3 domain status fields on check-in', async () => {
      const result = await processServerCheckIn(null, {
        staffId: 'STAFF_SALES_01',
        staffName: 'Trần Bán Hàng',
        branchId: 'CN01',
        userCoords: { latitude: 16.0678, longitude: 108.2208 },
        faceCaptureBase64: 'VALID_CAPTURE_MOCK_123456789012345678901234567890',
        clientIp: '127.0.0.1',
        testShiftMock: STANDARD_SHIFTS.SHIFT_MORNING
      });

      expect(result.attendanceStatus).toBe('CHECKED_IN');
      expect(result.punctualityStatus).toBeDefined();
      expect(result.verificationStatus).toBe('VERIFIED');
      expect(result.scheduledBreakMinutes).toBe(60);
    });

    it('deducts break minutes properly on checkout', async () => {
      const result = await processServerCheckOut(null, {
        staffId: 'STAFF_TEST_01',
        branchId: 'CN01'
      });

      expect(result.attendanceStatus).toBe('COMPLETED');
      expect(result.status).toBe('COMPLETED');
      expect(result.workDurationMinutes).toBeGreaterThan(result.netWorkMinutes || 0);
      expect(result.breakDurationMinutes).toBe(60);
    });
  });
});
