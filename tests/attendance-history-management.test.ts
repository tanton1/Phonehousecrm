import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildAttendanceHistorySummary,
  normalizeAttendanceHistoryMonth,
  resolveAttendanceHistoryScope
} from '../server/services/attendanceHistoryService';

describe('attendance history management', () => {
  it('keeps employees restricted to their own attendance identity', () => {
    expect(() => resolveAttendanceHistoryScope(
      { uid: 'STAFF_A', role: 'TECHNICIAN', branchId: 'CN_A' },
      { staffUid: 'STAFF_B', branchId: 'CN_A', month: '2026-08' }
    )).toThrow('ATTENDANCE_HISTORY_STAFF_FORBIDDEN');

    const own = resolveAttendanceHistoryScope(
      { uid: 'STAFF_A', role: 'TECHNICIAN', branchId: 'CN_A' },
      { staffUid: 'STAFF_A', branchId: 'CN_A', month: '2026-08' }
    );
    expect(own.staffUid).toBe('STAFF_A');
    expect(own.mayViewTeam).toBe(false);
  });

  it('allows managers to select staff only inside an assigned branch scope', () => {
    const scope = resolveAttendanceHistoryScope(
      { uid: 'MANAGER_A', role: 'STORE_MANAGER', branchId: 'CN_A', assignedBranchIds: ['CN_B'] },
      { staffUid: 'STAFF_B', branchId: 'CN_B', month: '2026-08' }
    );
    expect(scope.staffUid).toBe('STAFF_B');
    expect(scope.branchId).toBe('CN_B');
    expect(scope.mayViewTeam).toBe(true);

    expect(() => resolveAttendanceHistoryScope(
      { uid: 'MANAGER_A', role: 'STORE_MANAGER', branchId: 'CN_A' },
      { staffUid: 'STAFF_C', branchId: 'CN_C', month: '2026-08' }
    )).toThrow('ATTENDANCE_HISTORY_BRANCH_FORBIDDEN');
  });

  it('validates month keys and builds payroll-friendly totals', () => {
    expect(normalizeAttendanceHistoryMonth('2026-08')).toBe('2026-08');
    expect(() => normalizeAttendanceHistoryMonth('08/2026')).toThrow('ATTENDANCE_HISTORY_MONTH_INVALID');
    expect(buildAttendanceHistorySummary([
      { checkInTime: '08:05:00', checkOutTime: '17:00:00', lateMinutes: 5, otMinutes: 10 },
      { checkInTime: '08:00:00', lateMinutes: 0, verificationStatus: 'PENDING_REVIEW' }
    ])).toEqual({
      workDays: 2,
      completedDays: 1,
      lateMinutes: 5,
      earlyMinutes: 0,
      overtimeMinutes: 10,
      missingCheckoutDays: 1,
      pendingReviewDays: 1
    });
  });

  it('uses authenticated server endpoints for history and inline photo previews', () => {
    const attendanceRoute = readFileSync('server/routes/attendance.ts', 'utf8');
    const evidenceRoute = readFileSync('server/routes/evidence.ts', 'utf8');
    const drawer = readFileSync('src/components/AttendanceHistoryDrawer.tsx', 'utf8');
    expect(attendanceRoute).toContain("router.get('/history', authenticateFirebase");
    expect(evidenceRoute).toContain("router.get('/:id/content'");
    expect(evidenceRoute).toContain("record.storageMode === 'INLINE_FIRESTORE'");
    expect(drawer).toContain('Xem ảnh vào ca');
    expect(drawer).toContain('GPS phù hợp cửa hàng');
    expect(drawer).toContain('Duyệt bản ghi');
  });
});
