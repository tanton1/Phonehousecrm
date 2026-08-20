import { describe, it, expect } from 'vitest';
import {
  processCreateWorkOrder,
  processAcceptCustody,
  processStartTaskLine,
  processQCInspection,
  processReturnToStock,
  processDeliverToCustomer,
  processIssueSparePart
} from '../server/services/technicalService';
import { REQUIRED_QC_CHECKLIST_STEPS } from '../server/services/technicalStateMachine';

describe('Technical P0 Invariants, Customer Device Protection & Lifecycle Suite', () => {

  describe('1. Customer Service & Warranty Protection Invariant (P0-02)', () => {
    it('blocks customer service/warranty device from returning to stock as saleable inventory', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async () => ({
              exists: true,
              data: () => ({
                id: 'WO_CUST_01',
                workOrderType: 'CUSTOMER_SERVICE',
                status: 'QC_PASSED',
                customerName: 'Nguyễn Văn A',
                imei: '356789012345678',
                branchId: 'CN01'
              })
            }),
            update: () => {},
            set: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      await expect(
        processReturnToStock(mockDb, 'WO_CUST_01', 'KHO_TONG', { uid: 'UID_STAFF_01', branchId: 'CN01' })
      ).rejects.toThrow('CANNOT_RETURN_CUSTOMER_DEVICE_TO_STOCK');
    });

    it('allows delivering customer service/warranty device to customer after QC PASS', async () => {
      let updatedStatus = '';

      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async () => ({
              exists: true,
              data: () => ({
                id: 'WO_CUST_01',
                workOrderType: 'CUSTOMER_SERVICE',
                status: 'QC_PASSED',
                customerName: 'Nguyễn Văn A',
                deviceId: 'DEV-CUST-01',
                imei: '356789012345678',
                branchId: 'CN01'
              })
            }),
            update: (ref: any, fields: any) => {
              if (ref.col === 'technicalWorkOrders') {
                updatedStatus = fields.status;
              }
            },
            set: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      const result = await processDeliverToCustomer(mockDb, 'WO_CUST_01', 'Đã trả máy cho khách', { uid: 'UID_STAFF_01', branchId: 'CN01' });
      expect(result.success).toBe(true);
      expect(updatedStatus).toBe('DELIVERED_TO_CUSTOMER');
    });
  });

  describe('2. Physical IMEI & Assignee Verification on Accept (P0-03)', () => {
    it('rejects acceptance when scanned IMEI does not match work order IMEI', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async () => ({
              exists: true,
              data: () => ({
                id: 'WO_01',
                imei: '356789012345678',
                status: 'ASSIGNED',
                branchId: 'CN01'
              })
            }),
            update: () => {},
            set: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      await expect(
        processAcceptCustody(mockDb, 'WO_01', '359999999999999', { uid: 'UID_KTV_NAM', branchId: 'CN01' })
      ).rejects.toThrow('IMEI_MISMATCH');
    });

    it('rejects acceptance when technician is not among assigned task line technicians', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId }),
          where: () => ({
            get: async () => ({
              docs: [{ data: () => ({ assigneeUid: 'UID_KTV_NAM' }) }]
            })
          })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (refOrQuery: any) => {
              if (refOrQuery.col === 'technicalWorkOrders') {
                return {
                  exists: true,
                  data: () => ({
                    id: 'WO_01',
                    imei: '356789012345678',
                    status: 'ASSIGNED',
                    branchId: 'CN01'
                  })
                };
              }
              return { docs: [{ data: () => ({ assigneeUid: 'UID_KTV_NAM' }) }] };
            },
            update: () => {},
            set: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      await expect(
        processAcceptCustody(mockDb, 'WO_01', '356789012345678', { uid: 'UID_KTV_UNASSIGNED', role: 'TECH', branchId: 'CN01' })
      ).rejects.toThrow('TECHNICIAN_NOT_ASSIGNED');
    });
  });

  describe('3. Strict QC Inspection Gates (P0-04 & P0-05)', () => {
    it('rejects QC inspection when work order is still IN_PROGRESS', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async () => ({
              exists: true,
              data: () => ({
                id: 'WO_01',
                status: 'IN_PROGRESS',
                imei: '356789012345678',
                branchId: 'CN01'
              })
            }),
            update: () => {},
            set: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      await expect(
        processQCInspection(mockDb, 'WO_01', {
          checklistResults: {},
          overallResult: 'PASS'
        }, { uid: 'UID_INSPECTOR_01', role: 'TECH_LEAD', branchId: 'CN01' })
      ).rejects.toThrow('INVALID_QC_STATE');
    });

    it('rejects QC PASS when checklist has missing or unverified steps', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId }),
          where: () => ({
            get: async () => ({
              docs: [{ data: () => ({ assigneeUid: 'UID_KTV_NAM', status: 'COMPLETED' }) }]
            })
          })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (refOrQuery: any) => {
              if (refOrQuery.col === 'technicalWorkOrders') {
                return {
                  exists: true,
                  data: () => ({
                    id: 'WO_01',
                    status: 'TECH_COMPLETED',
                    imei: '356789012345678',
                    branchId: 'CN01'
                  })
                };
              }
              return { docs: [{ data: () => ({ assigneeUid: 'UID_KTV_NAM', status: 'COMPLETED' }) }] };
            },
            update: () => {},
            set: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      // Missing some required checklist steps
      const incompleteChecklist = {
        appearance: true,
        screen_touch: true
      };

      await expect(
        processQCInspection(mockDb, 'WO_01', {
          checklistResults: incompleteChecklist,
          overallResult: 'PASS'
        }, { uid: 'UID_INSPECTOR_01', role: 'TECH_LEAD', branchId: 'CN01' })
      ).rejects.toThrow('INCOMPLETE_CHECKLIST');
    });
  });

  describe('4. Task Line State Machine & Parent-Child URL Verification (P0-06 & P0-07)', () => {
    it('rejects starting task line when lineId does not belong to workOrderId', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async () => ({
              exists: true,
              data: () => ({
                id: 'WOL_01',
                workOrderId: 'WO_ORIGINAL_99', // Different parent!
                status: 'ACCEPTED',
                assigneeUid: 'UID_KTV_NAM'
              })
            }),
            update: () => {},
            set: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      await expect(
        processStartTaskLine(mockDb, 'WO_DIFFERENT_01', 'WOL_01', { uid: 'UID_KTV_NAM', branchId: 'CN01' })
      ).rejects.toThrow('WORK_ORDER_MISMATCH');
    });

    it('rejects issuing spare parts if line does not belong to work order', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async () => ({
              exists: true,
              data: () => ({
                id: 'WOL_01',
                workOrderId: 'WO_ORIGINAL_99', // Different parent!
                status: 'IN_PROGRESS',
                assigneeUid: 'UID_KTV_NAM',
                branchId: 'CN01'
              })
            }),
            update: () => {},
            set: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      await expect(
        processIssueSparePart(mockDb, 'WO_DIFFERENT_01', 'WOL_01', 'PART-01', 1, { uid: 'UID_KTV_NAM', branchId: 'CN01' })
      ).rejects.toThrow('WORK_ORDER_MISMATCH');
    });
  });
});
