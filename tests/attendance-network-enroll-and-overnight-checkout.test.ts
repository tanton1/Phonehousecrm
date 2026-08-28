import { describe, it, expect } from 'vitest';
import { processServerCheckIn, processServerCheckOut } from '../server/services/attendanceService';
import crypto from 'node:crypto';

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const verificationInput = {
  faceSessionId: 'AVS_TEST',
  verificationNonce: 'nonce-test',
  deviceId: 'device-test-001',
  photoEvidenceId: 'EVD_CHECKIN_TEST'
};
const todayVietnam = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const attendanceId = () => `ATT_STAFF_001_${todayVietnam().replace(/-/g, '')}`;
const photoEvidence = () => ({
  status: 'ACTIVE',
  resourceType: 'ATTENDANCE',
  resourceId: attendanceId(),
  branchId: 'CN01',
  createdByUid: 'STAFF_001'
});

const openSession = (staffId: string, branchId: string, clientIp: string) => ({
  uid: staffId,
  branchId,
  action: 'CHECK_IN',
  status: 'OPEN',
  expiresAtMs: Date.now() + 60_000,
  deviceIdHash: digest(verificationInput.deviceId),
  clientIpHash: digest(clientIp),
  nonceHash: digest(verificationInput.verificationNonce)
});

describe('Attendance GPS/photo schema normalization & overnight checkout suite', () => {

  const mockShift = {
    shiftId: 'SHIFT_MORNING',
    shiftName: 'Ca Sáng',
    startTime: '08:00',
    endTime: '17:00',
    breakMinutes: 60,
    graceMinutes: 5
  };

  describe('1. Branch GPS radius and photo evidence', () => {
    it('accepts check-in with a custom attendanceRadius and linked photo', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({
            col,
            docId,
            id: docId,
            get: async () => {
              if (col === 'branches') {
                return {
                  exists: true,
                  data: () => ({
                    id: 'CN01',
                    name: 'PhoneHouse Hải Châu',
                    gpsLatitude: 16.0612,
                    gpsLongitude: 108.2170,
                    attendanceRadius: 80,
                    allowedPublicIps: ['113.161.45.99', '2405:4803:c625:6d50::1']
                  })
                };
              }
              if (col === 'weeklyShiftSchedules') {
                const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
                return {
                  exists: true,
                  data: () => ({
                    days: {
                      [today]: mockShift
                    }
                  })
                };
              }
              if (col === 'staffFaceProfiles') {
                return { exists: false };
              }
              return { exists: false, data: () => null };
            }
          }),
          where: () => ({
            where: () => ({
              where: () => ({
                limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
              }),
              limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
            }),
            limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
          })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => ref.col === 'attendanceVerificationSessions'
              ? ({ exists: true, data: () => openSession('STAFF_001', 'CN01', '113.161.45.99') })
              : ref.col === 'evidenceRecords'
                ? ({ exists: true, data: photoEvidence })
                : ({ exists: false }),
            set: () => {},
            update: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      const result = await processServerCheckIn(mockDb, {
        staffId: 'STAFF_001',
        branchId: 'CN01',
        userCoords: { latitude: 16.06121, longitude: 108.21701 },
        clientIp: '113.161.45.99'
        ,...verificationInput
      });

      expect(result.attendanceStatus).toBe('CHECKED_IN');
      expect(result.verification.networkVerified).toBe(false);
      expect(result.verification.gpsVerified).toBe(true);
      expect(result.verification.photoEvidenceId).toBe('EVD_CHECKIN_TEST');
    });

    it('preserves the legacy allowedGpsRadiusMeters fallback without requiring an IP allowlist', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({
            col,
            docId,
            id: docId,
            get: async () => {
              if (col === 'branches') {
                return {
                  exists: true,
                  data: () => ({
                    id: 'CN01',
                    name: 'PhoneHouse Legacy',
                    gpsLatitude: 16.0612,
                    gpsLongitude: 108.2170,
                    allowedGpsRadiusMeters: 60,
                    storePublicIp: '113.161.45.88, 14.232.208.10'
                  })
                };
              }
              if (col === 'weeklyShiftSchedules') {
                const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
                return {
                  exists: true,
                  data: () => ({
                    days: {
                      [today]: mockShift
                    }
                  })
                };
              }
              if (col === 'staffFaceProfiles') {
                return { exists: false };
              }
              return { exists: false, data: () => null };
            }
          }),
          where: () => ({
            where: () => ({
              where: () => ({
                limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
              }),
              limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
            }),
            limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
          })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => ref.col === 'attendanceVerificationSessions'
              ? ({ exists: true, data: () => openSession('STAFF_001', 'CN01', '14.232.208.10') })
              : ref.col === 'evidenceRecords'
                ? ({ exists: true, data: photoEvidence })
                : ({ exists: false }),
            set: () => {},
            update: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      const result = await processServerCheckIn(mockDb, {
        staffId: 'STAFF_001',
        branchId: 'CN01',
        userCoords: { latitude: 16.06121, longitude: 108.21701 },
        clientIp: '14.232.208.10'
        ,...verificationInput
      });

      expect(result.verification.networkVerified).toBe(false);
      expect(result.verification.photoCaptured).toBe(true);
    });
  });

  describe('2. Overnight Shift Checkout Support', () => {
    it('successfully checks out overnight shift by finding open check-in document', async () => {
      let updatedStatus = '';
      let updatedAttendanceStatus = '';

      const openAttendanceQuery: any = {
        where: () => openAttendanceQuery,
        orderBy: () => openAttendanceQuery,
        limit: () => ({
          get: async () => ({
            empty: false,
            docs: [{
              ref: { col: 'attendance', docId: 'ATT_STAFF_001_20260820', id: 'ATT_STAFF_001_20260820' },
              data: () => ({
                id: 'ATT_STAFF_001_20260820',
                staffId: 'STAFF_001',
                branchId: 'CN01',
                checkInTime: '22:00:00',
                attendanceStatus: 'CHECKED_IN',
                scheduledStart: '22:00',
                scheduledEnd: '06:00',
                scheduledBreakMinutes: 60
              })
            }]
          })
        })
      };

      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId }),
          where: openAttendanceQuery.where
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => ref.col === 'attendanceVerificationSessions' ? ({
              exists: true,
              data: () => ({ ...openSession('STAFF_001', 'CN01', '113.161.45.99'), action: 'CHECK_OUT' })
            }) : ({
              exists: true,
              data: () => ({
                id: 'ATT_STAFF_001_20260820',
                staffId: 'STAFF_001',
                branchId: 'CN01',
                checkInTime: '22:00:00',
                attendanceStatus: 'CHECKED_IN',
                scheduledStart: '22:00',
                scheduledEnd: '06:00',
                scheduledBreakMinutes: 60
              })
            }),
            update: (ref: any, fields: any) => {
              if (ref.col !== 'attendance') return;
              updatedStatus = fields.status;
              updatedAttendanceStatus = fields.attendanceStatus;
            }
          };
          return await cb(mockTransaction);
        }
      };

      const result = await processServerCheckOut(mockDb, {
        staffId: 'STAFF_001',
        branchId: 'CN01',
        clientIp: '113.161.45.99',
        ...verificationInput
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('ATT_STAFF_001_20260820');
      expect(updatedStatus).toBe('COMPLETED');
      expect(updatedAttendanceStatus).toBe('COMPLETED');
    });
  });
});
