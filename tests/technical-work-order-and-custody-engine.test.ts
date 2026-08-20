import { describe, it, expect } from 'vitest';
import {
  processCreateWorkOrder,
  processAcceptCustody,
  processStartTaskLine,
  processCompleteTaskLine,
  processQCInspection,
  processReturnToStock,
  processIssueSparePart
} from '../server/services/technicalService';
import { REQUIRED_QC_CHECKLIST_STEPS } from '../server/services/technicalStateMachine';

describe('Technical Work Order, Custody Movement & Independent QC Engine Suite', () => {

  const fullPassingChecklist: Record<string, boolean> = {};
  REQUIRED_QC_CHECKLIST_STEPS.forEach(step => {
    fullPassingChecklist[step] = true;
  });

  describe('1. Multi-Task per IMEI Work Order Creation', () => {
    it('creates work order and distinct task lines for different technicians', async () => {
      const savedDocs: Record<string, any> = {};

      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId?: string) => ({
            col,
            docId: docId || `auto_${Date.now()}`,
            id: docId || `auto_${Date.now()}`
          }),
          where: () => ({
            where: () => ({
              limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
            }),
            limit: () => ({ get: async () => ({ empty: true, docs: [] }) })
          })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (queryOrRef: any) => {
              if (queryOrRef.col === 'devices') {
                return { exists: true, data: () => ({ id: 'DEV-001', imei: '356789012345678', model: 'iPhone 15 Pro' }) };
              }
              return { empty: true, docs: [] };
            },
            set: (ref: any, data: any) => {
              savedDocs[`${ref.col}/${ref.id || ref.docId}`] = data;
            },
            update: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      const result = await processCreateWorkOrder(mockDb, {
        deviceId: 'DEV-001',
        imei: '356789012345678',
        model: 'iPhone 15 Pro',
        workOrderType: 'INBOUND_PREP',
        branchId: 'CN01',
        lines: [
          { taskCode: 'LV', taskName: 'Lên vỏ Titan Tự Nhiên', assigneeUid: 'UID_KTV_NAM', assigneeName: 'KTV Nam', commissionAmount: 150000 },
          { taskCode: 'EK', taskName: 'Ép kính màn hình', assigneeUid: 'UID_KTV_TRONG', assigneeName: 'KTV Trọng', commissionAmount: 200000 }
        ]
      }, { uid: 'UID_LEAD_TECH', name: 'Trưởng Kỹ Thuật', branchId: 'CN01' });

      expect(result.workOrderId).toBeDefined();
      expect(result.lineIds.length).toBe(2);
      expect(savedDocs[`technicalWorkOrders/${result.workOrderId}`].totalCommissionAmount).toBe(350000);
    });
  });

  describe('2. Physical IMEI Custody Acceptance', () => {
    it('transfers custody and records immutable inventory movement upon KTV acceptance', async () => {
      let updatedCustodianUid = '';
      let recordedMovement: any = null;

      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId }),
          where: () => ({ get: async () => ({ docs: [{ ref: { col: 'lines' }, data: () => ({ assigneeUid: 'UID_KTV_NAM', status: 'ASSIGNED' }) }] }) })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (refOrQuery: any) => {
              if (refOrQuery.col === 'technicalWorkOrders') {
                return {
                  exists: true,
                  data: () => ({
                    id: 'WO_TEST_01',
                    imei: '356789012345678',
                    deviceId: 'DEV-001',
                    status: 'ASSIGNED',
                    branchId: 'CN01',
                    currentCustodianUid: 'UID_WAREHOUSE'
                  })
                };
              }
              return { docs: [{ ref: { col: 'lines' }, data: () => ({ assigneeUid: 'UID_KTV_NAM', status: 'ASSIGNED' }) }] };
            },
            update: (ref: any, fields: any) => {
              if (ref.col === 'technicalWorkOrders') {
                updatedCustodianUid = fields.currentCustodianUid;
              }
            },
            set: (ref: any, data: any) => {
              if (ref.col === 'inventoryMovements') {
                recordedMovement = data;
              }
            }
          };
          return await cb(mockTransaction);
        }
      };

      const result = await processAcceptCustody(mockDb, 'WO_TEST_01', '356789012345678', {
        uid: 'UID_KTV_NAM',
        name: 'KTV Nam',
        role: 'TECHNICIAN',
        branchId: 'CN01'
      });

      expect(result.success).toBe(true);
      expect(updatedCustodianUid).toBe('UID_KTV_NAM');
      expect(recordedMovement).not.toBeNull();
      expect(recordedMovement.movementType).toBe('TECH_ACCEPT');
      expect(recordedMovement.toCustodianUid).toBe('UID_KTV_NAM');
    });
  });

  describe('3. Spare Parts Stock Issuance', () => {
    it('fails closed when requested spare part stock is insufficient', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (ref: any) => {
              if (ref.col === 'technicalWorkOrderLines') {
                return {
                  exists: true,
                  data: () => ({
                    id: 'WOL_01',
                    workOrderId: 'WO_01',
                    branchId: 'CN01',
                    status: 'IN_PROGRESS',
                    assigneeUid: 'UID_KTV_NAM'
                  })
                };
              }
              return {
                exists: true,
                data: () => ({ id: 'PART-PIN-15P', name: 'Pin iPhone 15 Pro Dung Lượng Chuẩn', stockQuantity: 0 })
              };
            },
            update: () => {},
            set: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      await expect(
        processIssueSparePart(mockDb, 'WO_01', 'WOL_01', 'PART-PIN-15P', 1, { uid: 'UID_KTV_NAM', branchId: 'CN01' })
      ).rejects.toThrow('INSUFFICIENT_PARTS_STOCK');
    });
  });

  describe('4. Independent QC Inspection Invariant', () => {
    it('forbids technician from QC-approving their own work order', async () => {
      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId }),
          where: () => ({
            get: async () => ({
              docs: [
                { data: () => ({ assigneeUid: 'UID_KTV_NAM', status: 'COMPLETED', taskName: 'Lên vỏ' }) }
              ]
            })
          })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (refOrQuery: any) => {
              if (refOrQuery.col === 'technicalWorkOrders') {
                return {
                  exists: true,
                  data: () => ({ id: 'WO_01', status: 'TECH_COMPLETED', imei: '356789012345678', branchId: 'CN01', reworkCount: 0 })
                };
              }
              return { docs: [{ data: () => ({ assigneeUid: 'UID_KTV_NAM', status: 'COMPLETED', taskName: 'Lên vỏ' }) }] };
            },
            set: () => {},
            update: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      await expect(
        processQCInspection(mockDb, 'WO_01', {
          checklistResults: fullPassingChecklist,
          overallResult: 'PASS'
        }, { uid: 'UID_KTV_NAM', role: 'TECHNICIAN', branchId: 'CN01' })
      ).rejects.toThrow('QC_SELF_INSPECTION_FORBIDDEN');
    });

    it('activates commission to ELIGIBLE when independent QC passes', async () => {
      let commissionStatus = '';

      const mockDb: any = {
        collection: (col: string) => ({
          doc: (docId: string) => ({ col, docId, id: docId }),
          where: () => ({
            get: async () => ({
              docs: [
                { id: 'WOL_01', ref: { col: 'lines' }, data: () => ({ assigneeUid: 'UID_KTV_NAM', status: 'COMPLETED', taskName: 'Lên vỏ' }) }
              ]
            })
          })
        }),
        runTransaction: async (cb: any) => {
          const mockTransaction = {
            get: async (refOrQuery: any) => {
              if (refOrQuery.col === 'technicalWorkOrders') {
                return {
                  exists: true,
                  data: () => ({ id: 'WO_01', status: 'TECH_COMPLETED', imei: '356789012345678', branchId: 'CN01', reworkCount: 0 })
                };
              }
              return { docs: [{ id: 'WOL_01', ref: { col: 'lines' }, data: () => ({ assigneeUid: 'UID_KTV_NAM', status: 'COMPLETED', taskName: 'Lên vỏ' }) }] };
            },
            set: () => {},
            update: (ref: any, fields: any) => {
              if (ref.col === 'commissionLedger') {
                commissionStatus = fields.status;
              }
            }
          };
          return await cb(mockTransaction);
        }
      };

      const result = await processQCInspection(mockDb, 'WO_01', {
        checklistResults: fullPassingChecklist,
        overallResult: 'PASS'
      }, { uid: 'UID_QC_INSPECTOR', role: 'TECH_LEAD', name: 'QC Lead', branchId: 'CN01' });

      expect(result.success).toBe(true);
      expect(result.result).toBe('PASS');
      expect(commissionStatus).toBe('ELIGIBLE');
    });
  });

  describe('5. Return to Stock after QC Pass', () => {
    it('allows returning device to in_stock only when status is QC_PASSED', async () => {
      let updatedDeviceStatus = '';

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
                workOrderType: 'INBOUND_PREP',
                status: 'QC_PASSED',
                deviceId: 'DEV-01',
                imei: '356789012345678',
                branchId: 'CN01'
              })
            }),
            update: (ref: any, fields: any) => {
              if (ref.col === 'devices') {
                updatedDeviceStatus = fields.status;
              }
            },
            set: () => {}
          };
          return await cb(mockTransaction);
        }
      };

      const result = await processReturnToStock(mockDb, 'WO_01', 'KHO_TONG', { uid: 'UID_WAREHOUSE_01', name: 'Thủ Kho', branchId: 'CN01' });
      expect(result.success).toBe(true);
      expect(updatedDeviceStatus).toBe('in_stock');
    });
  });
});
