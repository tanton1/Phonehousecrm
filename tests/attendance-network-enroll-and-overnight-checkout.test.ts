import { describe, it, expect } from 'vitest';
import { processServerCheckIn, processServerCheckOut } from '../server/services/attendanceService';

describe('Attendance Network IP Enrollment, Schema Normalization & Overnight Checkout Suite', () => {

  const mockShift = {
    shiftId: 'SHIFT_MORNING',
    shiftName: 'Ca Sáng',
    startTime: '08:00',
    endTime: '17:00',
    breakMinutes: 60,
    graceMinutes: 5
  };

  describe('1. Branch Network IP & Radius Schema Normalization', () => {
    it('accepts check-in with array allowedPublicIps and custom attendanceRadius', async () => {
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
            get: async () => ({ exists: false }),
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
      });

      expect(result.attendanceStatus).toBe('CHECKED_IN');
      expect(result.verification.networkVerified).toBe(true);
      expect(result.verification.gpsVerified).toBe(true);
    });

    it('backward compatibility: parses legacy comma-separated storePublicIp and allowedGpsRadiusMeters', async () => {
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
            get: async () => ({ exists: false }),
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
      });

      expect(result.verification.networkVerified).toBe(true);
    });
  });

  describe('2. Overnight Shift Checkout Support', () => {
    it('successfully checks out overnight shift by finding open check-in document', async () => {
      let updatedStatus = '';
      let updatedAttendanceStatus = '';

      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId }),
          where: () => ({
            where: () => ({
              limit: () => ({
                get: async () => ({
                  empty: false,
                  docs: [{
                    ref: { col: 'attendance', docId: 'ATT_STAFF_001_20260820' },
                    data: () => ({
                      id: 'ATT_STAFF_001_20260820',
                      staffId: 'STAFF_001',
                      checkInTime: '22:00:00',
                      attendanceStatus: 'CHECKED_IN',
                      scheduledStart: '22:00',
                      scheduledEnd: '06:00',
                      scheduledBreakMinutes: 60
                    })
                  }]
                })
              })
            })
          })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async () => ({
              exists: true,
              data: () => ({
                id: 'ATT_STAFF_001_20260820',
                staffId: 'STAFF_001',
                checkInTime: '22:00:00',
                attendanceStatus: 'CHECKED_IN',
                scheduledStart: '22:00',
                scheduledEnd: '06:00',
                scheduledBreakMinutes: 60
              })
            }),
            update: (_ref: any, fields: any) => {
              updatedStatus = fields.status;
              updatedAttendanceStatus = fields.attendanceStatus;
            }
          };
          return await cb(mockTransaction);
        }
      };

      const result = await processServerCheckOut(mockDb, {
        staffId: 'STAFF_001',
        branchId: 'CN01'
      });

      expect(result).toBeDefined();
      expect(updatedStatus).toBe('COMPLETED');
      expect(updatedAttendanceStatus).toBe('COMPLETED');
    });
  });
});
