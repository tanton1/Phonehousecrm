import { describe, it, expect } from 'vitest';
import { 
  cosineSimilarity, 
  verifyFaceBiometric 
} from '../server/services/biometricService';
import { 
  normalizeRelativeMinutes, 
  diffMinutes,
  processAttendanceReview,
  resolveShiftAssignment,
  STANDARD_SHIFTS 
} from '../server/services/attendanceService';

describe('Attendance V2: Biometric Authority, Review Engine & Overnight Relative Timeline', () => {

  describe('1. Vector Biometric Cosine Similarity Engine', () => {
    it('calculates 1.0 for identical face embedding vectors', () => {
      const vec = [0.12, -0.45, 0.88, 0.03, -0.15];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
    });

    it('calculates 0.0 for orthogonal vectors', () => {
      const vecA = [1, 0, 0];
      const vecB = [0, 1, 0];
      expect(cosineSimilarity(vecA, vecB)).toBe(0);
    });

    it('approves verification when cosine similarity meets 85% threshold', async () => {
      const liveVec = [0.10, 0.20, 0.30, 0.40, 0.50];
      const res = await verifyFaceBiometric(null, {
        staffUid: 'STAFF-01',
        liveEmbedding: liveVec,
        threshold: 0.85
      });

      expect(res.verified).toBe(true);
      expect(res.score).toBeGreaterThanOrEqual(85);
    });
  });

  describe('2. Overnight Shift Relative Timeline Calculations', () => {
    const shiftStart = '22:00';
    const shiftEnd = '06:00';
    const scheduledDuration = diffMinutes(22 * 60, 6 * 60); // 480 mins

    it('calculates scheduled overnight duration correctly as 480 minutes', () => {
      expect(scheduledDuration).toBe(480);
    });

    it('calculates 15 minutes early leave when checking out at 05:45', () => {
      const relativeCheckout = normalizeRelativeMinutes('05:45', shiftStart);
      expect(relativeCheckout).toBe(465); // 465 mins after 22:00

      const earlyMinutes = scheduledDuration - relativeCheckout;
      expect(earlyMinutes).toBe(15);
    });

    it('calculates 30 minutes overtime when checking out at 06:30', () => {
      const relativeCheckout = normalizeRelativeMinutes('06:30', shiftStart);
      expect(relativeCheckout).toBe(510); // 510 mins after 22:00

      const otMinutes = relativeCheckout - scheduledDuration;
      expect(otMinutes).toBe(30);
    });
  });

  describe('3. Authoritative Attendance Review Process', () => {
    it('approves pending attendance with manager authority and records reviewData', async () => {
      const result = await processAttendanceReview(null, {
        attendanceId: 'ATT-TEST-01',
        decision: 'APPROVE',
        reviewerUid: 'MGR-01',
        reviewerName: 'Trưởng Cửa Hàng A',
        reviewerRole: 'MANAGER',
        reviewerBranchId: 'CN01',
        reason: 'Xác nhận nhân viên có mặt đúng giờ, camera bị mờ'
      });

      expect(result.verificationStatus).toBe('VERIFIED');
      expect(result.status).toBe('ON_TIME');
      expect(result.reviewData?.decision).toBe('APPROVE');
      expect(result.reviewData?.reviewedByUid).toBe('MGR-01');
      expect(result.reviewData?.reason).toContain('Xác nhận');
    });

    it('rejects attendance review attempt by non-manager staff', async () => {
      await expect(
        processAttendanceReview(null, {
          attendanceId: 'ATT-TEST-02',
          decision: 'APPROVE',
          reviewerUid: 'STAFF-01',
          reviewerName: 'Sale Staff',
          reviewerRole: 'STAFF',
          reviewerBranchId: 'CN01'
        })
      ).rejects.toThrow('PERMISSION_DENIED');
    });
  });

  describe('4. Firestore Mock Adapter Shift Fail-Closed Invariants', () => {
    it('throws SHIFT_NOT_ASSIGNED when schedule document does not exist in db', async () => {
      // Mock Firestore returning non-existent schedule doc
      const mockDb: any = {
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: false })
          }),
          where: () => ({
            where: () => ({
              where: () => ({
                limit: () => ({
                  get: async () => ({ empty: true, docs: [] })
                })
              })
            })
          })
        })
      };

      await expect(
        resolveShiftAssignment(mockDb, {
          staffId: 'STAFF-UNASSIGNED',
          branchId: 'CN01',
          workDate: '2026-08-20'
        })
      ).rejects.toThrow('SHIFT_NOT_ASSIGNED');
    });

    it('throws SHIFT_NOT_ASSIGNED when schedule exists but today is unassigned', async () => {
      const mockDb: any = {
        collection: () => ({
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => ({
                days: {
                  '2026-08-19': { shiftName: 'Ca sáng', startTime: '08:00', endTime: '17:00' }
                  // 2026-08-20 is missing
                }
              })
            })
          }),
          where: () => ({
            where: () => ({
              where: () => ({
                limit: () => ({
                  get: async () => ({ empty: true, docs: [] })
                })
              })
            })
          })
        })
      };

      await expect(
        resolveShiftAssignment(mockDb, {
          staffId: 'STAFF-01',
          branchId: 'CN01',
          workDate: '2026-08-20'
        })
      ).rejects.toThrow('SHIFT_NOT_ASSIGNED');
    });
  });
});
