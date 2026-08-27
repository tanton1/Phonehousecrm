import { describe, expect, it } from 'vitest';
import {
  calculateTechnicalCostBreakdown,
  processCancelTechnicalPartReservation,
  processConsumeTechnicalPart,
  processCreateTechnicalPartException,
  processCreateTechnicalPartStockRequest,
  processDecideTechnicalPartException,
  processDecideTechnicalPartStockRequest,
  processFinalizeTechnicalCost,
  processIssueTechnicalPart,
  processReceiveTechnicalSparePart,
  processReserveTechnicalPart,
  processReturnTechnicalPart
} from '../server/services/technicalCostService';
import {
  processAcceptTechnicalHandoff,
  processCompleteTaskLine,
  processCreateTechnicalTaskAdditionRequest,
  processDecideTechnicalTaskAdditionRequest,
  processRequestTechnicalHandoff
} from '../server/services/technicalService';

type Ref = { col: string; id: string };
type Query = { col: string; field: string; value: unknown; query: true };

function createTechnicalCostDb(seed: Record<string, Record<string, any>>) {
  const data = new Map<string, any>();
  Object.entries(seed).forEach(([collection, docs]) => Object.entries(docs).forEach(([id, value]) => {
    const normalized = collection === 'technicalWorkOrders' && ['ACCEPTED', 'IN_PROGRESS', 'QC_FAILED_REWORK'].includes(String(value.status || ''))
      ? { currentCustodianUid: 'TECH_01', ...value }
      : value;
    data.set(`${collection}/${id}`, { ...normalized });
  }));
  const ref = (col: string, id: string): Ref => ({ col, id });
  const snap = (target: Ref) => ({ id: target.id, ref: target, exists: data.has(`${target.col}/${target.id}`), data: () => data.get(`${target.col}/${target.id}`) });
  const querySnap = (target: Query) => {
    const docs = [...data.entries()]
      .filter(([key, value]) => key.startsWith(`${target.col}/`) && value?.[target.field] === target.value)
      .map(([key]) => snap(ref(target.col, key.slice(target.col.length + 1))));
    return { empty: docs.length === 0, docs };
  };
  const db: any = {
    collection: (col: string) => ({
      doc: (id: string) => ref(col, id),
      where: (field: string, _operator: string, value: unknown) => ({ col, field, value, query: true } as Query)
    }),
    runTransaction: async (callback: any) => callback({
      get: async (target: Ref | Query) => (target as Query).query ? querySnap(target as Query) : snap(target as Ref),
      set: (target: Ref, value: any, options?: { merge?: boolean }) => data.set(`${target.col}/${target.id}`, options?.merge ? { ...(data.get(`${target.col}/${target.id}`) || {}), ...value } : { ...value }),
      create: (target: Ref, value: any) => {
        if (data.has(`${target.col}/${target.id}`)) throw new Error('ALREADY_EXISTS');
        data.set(`${target.col}/${target.id}`, { ...value });
      },
      update: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...(data.get(`${target.col}/${target.id}`) || {}), ...value })
    })
  };
  return {
    db,
    get: (collection: string, id: string) => data.get(`${collection}/${id}`),
    values: (collection: string) => [...data.entries()].filter(([key]) => key.startsWith(`${collection}/`)).map(([, value]) => value)
  };
}

const tech = { uid: 'TECH_01', name: 'KTV Nam', role: 'TECHNICIAN', branchId: 'CN01' };
const manager = { uid: 'MGR_01', name: 'Quản lý', role: 'MANAGER', branchId: 'CN01' };

describe('Technical per-IMEI cost engine', () => {
  it('capitalizes only consumed parts and configured direct labor', () => {
    const result = calculateTechnicalCostBreakdown({
      openingDeviceCost: 12_000_000,
      partIssues: [{ quantityIssued: 2, quantityConsumed: 1, quantityReturned: 1, unitCostSnapshot: 500_000 }],
      taskLines: [
        { status: 'VERIFIED', laborCostToDevice: 150_000, capitalizeLaborCost: true },
        { status: 'VERIFIED', laborCostToDevice: 30_000, capitalizeLaborCost: false }
      ],
      externalCosts: [{ approvalStatus: 'APPROVED', category: 'OUTSOURCED_REPAIR', amount: 100_000, capitalizeToDevice: true }]
    });
    expect(result).toMatchObject({ partsCost: 500_000, laborCost: 150_000, externalCost: 100_000, totalActualCost: 750_000, closingDeviceCost: 12_750_000 });
  });

  it('issues, consumes and returns parts without double-counting returned quantity', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', deviceId: 'DEV_01', imei: '12345' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', assigneeUid: 'TECH_01', requiredParts: [{ category: 'PIN', quantity: 4 }] } },
      spareParts: { PART_01: { id: 'PART_01', sku: 'PIN-15', name: 'Pin iPhone 15', category: 'PIN', branchId: 'CN01', warehouseId: 'PARTS_CN01', stockQuantity: 2, costPrice: 500_000 } },
      warehouses: { PARTS_CN01: { id: 'PARTS_CN01', branchId: 'CN01', type: 'TECHNICIAN_SUB', custodianUid: 'TECH_01', isActive: true } }
    });
    const issued = await processIssueTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'PART_01', warehouseId: 'PARTS_CN01', quantity: 2, idempotencyKey: 'issue-parts-test-0001'
    }, tech);
    expect(issued.issue).not.toHaveProperty('unitCostSnapshot');
    expect(store.get('spareParts', 'PART_01').stockQuantity).toBe(0);
    await processConsumeTechnicalPart(store.db, 'WO_01', issued.issue.id, { quantity: 1, idempotencyKey: 'consume-part-test-0001' }, tech);
    const returned = await processReturnTechnicalPart(store.db, 'WO_01', issued.issue.id, { quantity: 1, idempotencyKey: 'return-part-test-0001' }, tech);
    expect(returned.issue).toMatchObject({ quantityConsumed: 1, quantityReturned: 1, status: 'SETTLED' });
    expect(returned.issue).not.toHaveProperty('totalConsumedCost');
    expect(store.get('technicalPartIssues', issued.issue.id).totalConsumedCost).toBe(500_000);
    expect(store.get('spareParts', 'PART_01').stockQuantity).toBe(1);
    expect(store.values('sparePartMovements').map(item => item.movementType).sort()).toEqual(['CONSUME', 'ISSUE', 'RETURN']);
  });

  it('receives canonical spare-part lots and updates moving-average cost idempotently', async () => {
    const store = createTechnicalCostDb({
      warehouses: { PARTS_CN01: { id: 'PARTS_CN01', branchId: 'CN01', type: 'CENTRAL', isActive: true } },
      catalogItems: {
        CAT_PIN_15: {
          id: 'CAT_PIN_15', category: 'PART', sku: 'PIN-15', name: 'Pin iPhone 15',
          lifecycleStatus: 'ACTIVE', catalogGroupCode: 'PIN', compatibleModels: ['iPhone 15']
        }
      }
    });
    const first = await processReceiveTechnicalSparePart(store.db, {
      productMasterId: 'CAT_PIN_15', sku: 'PIN-15', name: 'Pin iPhone 15', category: 'PIN', branchId: 'CN01', warehouseId: 'PARTS_CN01',
      lotCode: 'LOT-A', quantity: 2, unitCost: 100_000, sourceType: 'PART_PURCHASE', sourceId: 'SRC_01',
      idempotencyKey: 'part-receipt-test-0001'
    }, manager);
    const secondInput = {
      productMasterId: 'CAT_PIN_15', sku: 'PIN-15', name: 'Pin iPhone 15', category: 'PIN', branchId: 'CN01', warehouseId: 'PARTS_CN01',
      lotCode: 'LOT-A', quantity: 1, unitCost: 200_000, sourceType: 'PART_PURCHASE' as const, sourceId: 'SRC_02',
      idempotencyKey: 'part-receipt-test-0002'
    };
    const second = await processReceiveTechnicalSparePart(store.db, secondInput, manager);
    expect(first.part.stockQuantity).toBe(2);
    expect(second.part).toMatchObject({ stockQuantity: 3, currentAverageCost: 133_333 });
    expect(second.lot).toMatchObject({ stockQuantity: 3, unitCost: 133_333 });
    const replay = await processReceiveTechnicalSparePart(store.db, secondInput, manager);
    expect(replay.idempotentReplay).toBe(true);
    expect(store.get('spareParts', second.part.id).stockQuantity).toBe(3);
    expect(store.values('sparePartReceipts')).toHaveLength(2);
    expect(store.get('spareParts', second.part.id).productMasterId).toBe('CAT_PIN_15');
  });

  it('does not allow a typed SKU to create a new technical stock balance', async () => {
    const store = createTechnicalCostDb({
      warehouses: { PARTS_CN01: { id: 'PARTS_CN01', branchId: 'CN01', type: 'CENTRAL', isActive: true } }
    });
    await expect(processReceiveTechnicalSparePart(store.db, {
      sku: 'RAW-PIN', name: 'Pin nhập tay', branchId: 'CN01', warehouseId: 'PARTS_CN01',
      quantity: 1, unitCost: 100_000, sourceType: 'PART_PURCHASE', sourceId: 'SRC_RAW',
      idempotencyKey: 'part-receipt-raw-block-001'
    }, manager)).rejects.toThrow('SPARE_PART_CATALOG_REQUIRED');
  });

  it('reserves stock before issue and prevents another task from consuming the reserved balance', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', deviceId: 'DEV_01', imei: '12345' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', assigneeUid: 'TECH_01', requiredParts: [{ category: 'PIN', quantity: 4 }] } },
      spareParts: { PART_01: { id: 'PART_01', sku: 'PIN-15', name: 'Pin iPhone 15', category: 'PIN', branchId: 'CN01', warehouseId: 'PARTS_CN01', stockQuantity: 3, reservedQuantity: 0, costPrice: 500_000 } },
      warehouses: { PARTS_CN01: { id: 'PARTS_CN01', branchId: 'CN01', type: 'TECHNICIAN_SUB', custodianUid: 'TECH_01', isActive: true } }
    });
    const reserved = await processReserveTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'PART_01', warehouseId: 'PARTS_CN01', quantity: 2, idempotencyKey: 'part-reserve-test-0001'
    }, tech);
    expect(store.get('spareParts', 'PART_01')).toMatchObject({ stockQuantity: 3, reservedQuantity: 2 });
    expect(reserved.availableQuantity).toBe(1);
    await expect(processIssueTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'PART_01', warehouseId: 'PARTS_CN01', quantity: 2, idempotencyKey: 'part-direct-issue-test-0001'
    }, tech)).rejects.toThrow('INSUFFICIENT_PARTS_STOCK');
    const issued = await processIssueTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'PART_01', warehouseId: 'PARTS_CN01', reservationId: reserved.reservation.id,
      quantity: 2, idempotencyKey: 'part-reserved-issue-test-0001'
    }, tech);
    expect(store.get('spareParts', 'PART_01')).toMatchObject({ stockQuantity: 1, reservedQuantity: 0 });
    expect(store.get('technicalPartReservations', reserved.reservation.id)).toMatchObject({ quantityIssued: 2, status: 'FULFILLED' });
    expect(store.get('technicalPartIssues', issued.issue.id).reservationId).toBe(reserved.reservation.id);
  });

  it('releases an unused part reservation without changing physical stock', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', deviceId: 'DEV_01', imei: '12345' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', assigneeUid: 'TECH_01', requiredParts: [{ category: 'PIN', quantity: 1 }] } },
      spareParts: { PART_01: { id: 'PART_01', name: 'Pin', category: 'PIN', branchId: 'CN01', warehouseId: 'PARTS_CN01', stockQuantity: 2, reservedQuantity: 0, costPrice: 100_000 } },
      warehouses: { PARTS_CN01: { id: 'PARTS_CN01', branchId: 'CN01', type: 'TECHNICIAN_SUB', custodianUid: 'TECH_01', isActive: true } }
    });
    const reserved = await processReserveTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'PART_01', warehouseId: 'PARTS_CN01', quantity: 1, idempotencyKey: 'part-reserve-cancel-0001'
    }, tech);
    const cancelled = await processCancelTechnicalPartReservation(store.db, 'WO_01', reserved.reservation.id, {
      reason: 'Không còn cần thay linh kiện', idempotencyKey: 'part-reserve-cancel-0002'
    }, tech);
    expect(cancelled.releasedQuantity).toBe(1);
    expect(store.get('spareParts', 'PART_01')).toMatchObject({ stockQuantity: 2, reservedQuantity: 0 });
    expect(cancelled.reservation.status).toBe('CANCELLED');
  });

  it('keeps old KTV responsible until the target scans and accepts a custody handoff', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'ACCEPTED', branchId: 'CN01', deviceId: 'DEV_01', imei: '12345', currentCustodianUid: 'TECH_01', currentCustodianName: 'KTV Nam', currentLocationId: 'KHO_KTV_NAM' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'ACCEPTED', branchId: 'CN01', assigneeUid: 'TECH_01', assigneeName: 'KTV Nam' } },
      technicalPartIssues: {},
      technicalPartReservations: {},
      warehouses: { KHO_KTV_TRONG: { id: 'KHO_KTV_TRONG', branchId: 'CN01', type: 'TECHNICIAN_SUB', isActive: true, custodianUid: 'TECH_02', custodianName: 'KTV Trọng' } },
      devices: { DEV_01: { id: 'DEV_01', imei: '12345', branchId: 'CN01', currentCustodianUid: 'TECH_01', currentLocationId: 'KHO_KTV_NAM' } },
      commissionLedger: { COMM_01: { id: 'COMM_01', workOrderId: 'WO_01', workOrderLineId: 'LINE_01', staffUid: 'TECH_01', status: 'PENDING' } }
    });
    const requested = await processRequestTechnicalHandoff(store.db, 'WO_01', {
      targetWarehouseId: 'KHO_KTV_TRONG', targetTechnicianUid: 'TECH_02', targetTechnicianName: 'KTV Trọng',
      scannedImei: '12345', reason: 'Chuyển đúng chuyên môn sửa main',
      handoverPhotoUrls: ['https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/technical-evidence%2FWO_01%2Fhandoff-request%2Fbefore.jpg?alt=media'],
      idempotencyKey: 'tech-handoff-request-0001'
    }, tech);
    expect(store.get('technicalWorkOrders', 'WO_01')).toMatchObject({ currentCustodianUid: 'TECH_01', activeHandoffId: requested.handoff.id });
    const accepted = await processAcceptTechnicalHandoff(store.db, requested.handoff.id, {
      scannedImei: '12345', notes: 'Đã nhận đúng máy và ngoại hình',
      handoverPhotoUrls: ['https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/technical-evidence%2FWO_01%2Fhandoff-accept%2Freceived.jpg?alt=media'],
      idempotencyKey: 'tech-handoff-accept-0001'
    }, { uid: 'TECH_02', name: 'KTV Trọng', role: 'TECHNICIAN', branchId: 'CN01' });
    expect(accepted.reassignedLineIds).toEqual(['LINE_01']);
    expect(store.get('technicalWorkOrders', 'WO_01')).toMatchObject({ currentCustodianUid: 'TECH_02', currentLocationId: 'KHO_KTV_TRONG' });
    expect(store.get('technicalWorkOrderLines', 'LINE_01')).toMatchObject({ assigneeUid: 'TECH_02', assigneeName: 'KTV Trọng' });
    expect(store.get('commissionLedger', 'COMM_01')).toMatchObject({ staffUid: 'TECH_02', custodyHandoffId: requested.handoff.id });
    expect(store.get('devices', 'DEV_01')).toMatchObject({ currentCustodianUid: 'TECH_02', currentLocationId: 'KHO_KTV_TRONG' });
    expect(store.values('inventoryMovements').some(item => item.movementType === 'TECH_CUSTODY_HANDOFF')).toBe(true);
  });

  it('capitalizes only the scrapped quantity explicitly approved for the device', () => {
    const result = calculateTechnicalCostBreakdown({
      openingDeviceCost: 1_000_000,
      partIssues: [{ quantityConsumed: 0, quantityScrapped: 2, quantityScrappedCapitalized: 1, unitCostSnapshot: 100_000 }]
    });
    expect(result.partsCost).toBe(100_000);
    expect(result.closingDeviceCost).toBe(1_100_000);
  });

  it('rejects a technician issuing parts for another assignee', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', assigneeUid: 'TECH_OTHER' } },
      spareParts: { PART_01: { id: 'PART_01', branchId: 'CN01', stockQuantity: 1, costPrice: 100_000 } },
      warehouses: { PARTS_CN01: { id: 'PARTS_CN01', branchId: 'CN01', isActive: true } }
    });
    await expect(processIssueTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'PART_01', warehouseId: 'PARTS_CN01', quantity: 1, idempotencyKey: 'issue-forbidden-test-01'
    }, tech)).rejects.toThrow('TECHNICIAN_NOT_ASSIGNED');
  });

  it('keeps lot stock and aggregate spare-part stock synchronized', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', deviceId: 'DEV_01', imei: '12345' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', assigneeUid: 'TECH_01', requiredParts: [{ category: 'PIN', quantity: 2 }] } },
      spareParts: { PART_01: { id: 'PART_01', sku: 'PIN-15', name: 'Pin iPhone 15', category: 'PIN', branchId: 'CN01', warehouseId: 'PARTS_CN01', stockQuantity: 2, currentAverageCost: 500_000 } },
      sparePartLots: { LOT_01: { id: 'LOT_01', partId: 'PART_01', warehouseId: 'PARTS_CN01', stockQuantity: 2, unitCost: 450_000, costVersion: 'LOT_V1' } },
      warehouses: { PARTS_CN01: { id: 'PARTS_CN01', branchId: 'CN01', type: 'TECHNICIAN_SUB', custodianUid: 'TECH_01', isActive: true } }
    });
    const issued = await processIssueTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'PART_01', warehouseId: 'PARTS_CN01', lotId: 'LOT_01', quantity: 2, idempotencyKey: 'issue-lot-test-0001'
    }, tech);
    expect(store.get('spareParts', 'PART_01').stockQuantity).toBe(0);
    expect(store.get('sparePartLots', 'LOT_01').stockQuantity).toBe(0);
    await processReturnTechnicalPart(store.db, 'WO_01', issued.issue.id, { quantity: 1, idempotencyKey: 'return-lot-test-0001' }, tech);
    expect(store.get('spareParts', 'PART_01').stockQuantity).toBe(1);
    expect(store.get('sparePartLots', 'LOT_01').stockQuantity).toBe(1);
  });

  it('blocks a screen for a battery task before any reservation or stock mutation', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', deviceId: 'DEV_01', imei: '12345', model: 'IPHONE 15' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', assigneeUid: 'TECH_01', requiredParts: [{ category: 'PIN', quantity: 1 }] } },
      spareParts: { SCREEN_01: { id: 'SCREEN_01', sku: 'SCREEN-15', name: 'Màn iPhone 15', category: 'MAN_HINH', branchId: 'CN01', warehouseId: 'KHO_KTV_NAM', stockQuantity: 1, reservedQuantity: 0, costPrice: 900_000 } },
      warehouses: { KHO_KTV_NAM: { id: 'KHO_KTV_NAM', branchId: 'CN01', type: 'TECHNICIAN_SUB', custodianUid: 'TECH_01', isActive: true } }
    });
    await expect(processReserveTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'SCREEN_01', warehouseId: 'KHO_KTV_NAM', quantity: 1, idempotencyKey: 'reserve-screen-wrong-task-01'
    }, tech)).rejects.toThrow('TASK_PART_NOT_ALLOWED');
    await expect(processIssueTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'SCREEN_01', warehouseId: 'KHO_KTV_NAM', quantity: 1, idempotencyKey: 'issue-screen-wrong-task-01'
    }, tech)).rejects.toThrow('TASK_PART_EXCEPTION_APPROVAL_REQUIRED');
    expect(store.get('spareParts', 'SCREEN_01')).toMatchObject({ stockQuantity: 1, reservedQuantity: 0 });
    expect(store.values('sparePartMovements')).toHaveLength(0);
  });

  it('accepts the short screen group code MH for a MAN_HINH task rule', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', deviceId: 'DEV_01', imei: '12345', model: 'iPhone 12 Pro Max' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', assigneeUid: 'TECH_01', requiredParts: [{ category: 'MAN_HINH', quantity: 1 }] } },
      spareParts: { SCREEN_01: { id: 'SCREEN_01', sku: 'MH-IP12PM-ZIN', name: 'Màn hình iPhone 12 Pro Max', category: 'MH', branchId: 'CN01', warehouseId: 'KHO_KTV_NAM', stockQuantity: 1, reservedQuantity: 0, costPrice: 900_000 } },
      warehouses: { KHO_KTV_NAM: { id: 'KHO_KTV_NAM', branchId: 'CN01', type: 'TECHNICIAN_SUB', custodianUid: 'TECH_01', isActive: true } }
    });
    const reserved = await processReserveTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'SCREEN_01', warehouseId: 'KHO_KTV_NAM', quantity: 1, idempotencyKey: 'reserve-screen-short-code-01'
    }, tech);
    expect(reserved.reservation).toMatchObject({ partId: 'SCREEN_01', quantityReserved: 1 });
    expect(store.get('spareParts', 'SCREEN_01').reservedQuantity).toBe(1);
  });

  it('does not let a KTV consume matching stock directly from the central warehouse', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', deviceId: 'DEV_01', imei: '12345' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', assigneeUid: 'TECH_01', requiredParts: [{ category: 'PIN', quantity: 1 }] } },
      spareParts: { PIN_MAIN: { id: 'PIN_MAIN', sku: 'PIN-15', name: 'Pin iPhone 15', category: 'PIN', branchId: 'CN01', warehouseId: 'KHO_TONG', stockQuantity: 2, reservedQuantity: 0, costPrice: 500_000 } },
      warehouses: { KHO_TONG: { id: 'KHO_TONG', branchId: 'CN01', type: 'CENTRAL', isActive: true } }
    });
    await expect(processIssueTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'PIN_MAIN', warehouseId: 'KHO_TONG', quantity: 1, idempotencyKey: 'central-issue-tech-forbidden-01'
    }, tech)).rejects.toThrow('TECHNICIAN_PERSONAL_WAREHOUSE_REQUIRED');
    expect(store.get('spareParts', 'PIN_MAIN').stockQuantity).toBe(2);
  });

  it('moves approved central stock and its cost snapshot into the KTV child warehouse before issue', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', deviceId: 'DEV_01', imei: '12345' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', assigneeUid: 'TECH_01', requiredParts: [{ category: 'PIN', quantity: 2 }] } },
      spareParts: { PIN_MAIN: { id: 'PIN_MAIN', sku: 'PIN-15', name: 'Pin iPhone 15', category: 'PIN', branchId: 'CN01', warehouseId: 'KHO_TONG', stockQuantity: 5, reservedQuantity: 0, currentAverageCost: 450_000 } },
      warehouses: {
        KHO_TONG: { id: 'KHO_TONG', branchId: 'CN01', type: 'CENTRAL', isActive: true },
        KHO_KTV_NAM: { id: 'KHO_KTV_NAM', branchId: 'CN01', type: 'TECHNICIAN_SUB', parentWarehouseId: 'KHO_TONG', custodianUid: 'TECH_01', isActive: true }
      }
    });
    const request = await processCreateTechnicalPartStockRequest(store.db, {
      sourceWarehouseId: 'KHO_TONG', targetWarehouseId: 'KHO_KTV_NAM', partId: 'PIN_MAIN', quantity: 2,
      reason: 'Cần tồn pin để xử lý các máy đã nhận.', workOrderId: 'WO_01', workOrderLineId: 'LINE_01', idempotencyKey: 'stock-request-pin-ktv-0001'
    }, tech);
    expect(store.get('spareParts', 'PIN_MAIN').stockQuantity).toBe(5);
    const fulfilled = await processDecideTechnicalPartStockRequest(store.db, request.request.id, {
      decision: 'APPROVED', quantityApproved: 2, note: 'Đủ tồn, cấp cho kho KTV Nam.', idempotencyKey: 'stock-request-decision-0001'
    }, { uid: 'ACC_01', name: 'Kế toán', role: 'ACCOUNTANT', branchId: 'CN01' });
    expect(fulfilled.request).toMatchObject({ status: 'FULFILLED', quantityApproved: 2, imei: '12345', deviceId: 'DEV_01' });
    expect(store.get('spareParts', 'PIN_MAIN').stockQuantity).toBe(3);
    const personalPart = store.values('spareParts').find(item => item.warehouseId === 'KHO_KTV_NAM');
    expect(personalPart).toMatchObject({ sku: 'PIN-15', stockQuantity: 2, currentAverageCost: 450_000 });
    expect(store.values('sparePartMovements').map(item => item.movementType).sort()).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);
    expect(store.values('sparePartMovements').every(item => item.imei === '12345')).toBe(true);
    await processIssueTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: personalPart.id, warehouseId: 'KHO_KTV_NAM', quantity: 1, idempotencyKey: 'issue-after-approved-transfer-01'
    }, tech);
    expect(store.get('spareParts', personalPart.id).stockQuantity).toBe(1);
  });

  it('requires a server-approved, quantity-limited exception before using a part outside the task policy', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', deviceId: 'DEV_01', imei: '12345' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', assigneeUid: 'TECH_01', requiredParts: [{ category: 'PIN', quantity: 1 }] } },
      spareParts: { SCREEN_01: { id: 'SCREEN_01', sku: 'SCREEN-15', name: 'Màn iPhone 15', category: 'MAN_HINH', branchId: 'CN01', warehouseId: 'KHO_KTV_NAM', stockQuantity: 2, reservedQuantity: 0, costPrice: 900_000 } },
      warehouses: { KHO_KTV_NAM: { id: 'KHO_KTV_NAM', branchId: 'CN01', type: 'TECHNICIAN_SUB', custodianUid: 'TECH_01', isActive: true } }
    });
    const requested = await processCreateTechnicalPartException(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'SCREEN_01', warehouseId: 'KHO_KTV_NAM', quantity: 1,
      reason: 'Máy phát hiện màn hình chớp, cần thay ngoài phương án ban đầu.', idempotencyKey: 'screen-exception-request-0001'
    }, tech);
    await expect(processIssueTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'SCREEN_01', warehouseId: 'KHO_KTV_NAM', quantity: 1, exceptionApprovalId: requested.exception.id, idempotencyKey: 'screen-before-approval-0001'
    }, tech)).rejects.toThrow('TASK_PART_EXCEPTION_NOT_APPROVED');
    const approved = await processDecideTechnicalPartException(store.db, 'WO_01', requested.exception.id, {
      decision: 'APPROVED', quantityApproved: 1, note: 'Đã đối chiếu lỗi thực tế.', idempotencyKey: 'screen-exception-decision-0001'
    }, manager);
    expect(approved.exception.status).toBe('APPROVED');
    await processIssueTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'SCREEN_01', warehouseId: 'KHO_KTV_NAM', quantity: 1, exceptionApprovalId: requested.exception.id, idempotencyKey: 'screen-after-approval-0001'
    }, tech);
    await expect(processIssueTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'SCREEN_01', warehouseId: 'KHO_KTV_NAM', quantity: 1, exceptionApprovalId: requested.exception.id, idempotencyKey: 'screen-exception-overuse-0001'
    }, tech)).rejects.toThrow('TASK_PART_EXCEPTION_NOT_APPROVED');
  });

  it('posts one authoritative cost version to device financials', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'QC_PASSED', costPostingStatus: 'NOT_READY', workOrderType: 'INBOUND_PREP', assetOwnership: 'COMPANY', branchId: 'CN01', deviceId: 'DEV_01', imei: '12345', openingDeviceCost: 12_000_000, openingCostVersion: 'COST_V1' } },
      devices: { DEV_01: { id: 'DEV_01', imei: '12345', branchId: 'CN01', buyPrice: 12_000_000, currentCost: 12_000_000, costVersion: 'COST_V1' } },
      deviceFinancials: { DEV_01: { deviceId: 'DEV_01', acquisitionCost: 12_000_000, technicalAddedCost: 0, currentCost: 12_000_000, costVersion: 'COST_V1' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'VERIFIED', laborCostToDevice: 150_000, capitalizeLaborCost: true } },
      technicalPartIssues: { ISSUE_01: { id: 'ISSUE_01', workOrderId: 'WO_01', quantityIssued: 2, quantityConsumed: 1, quantityReturned: 1, quantityScrapped: 0, unitCostSnapshot: 500_000 } },
      technicalExternalCosts: { EXT_01: { id: 'EXT_01', workOrderId: 'WO_01', approvalStatus: 'APPROVED', category: 'OUTSOURCED_REPAIR', amount: 100_000, capitalizeToDevice: true } },
      technicalRecoveries: {}
    });
    const posted = await processFinalizeTechnicalCost(store.db, 'WO_01', 'finalize-cost-test-0001', manager);
    expect(posted.breakdown.closingDeviceCost).toBe(12_750_000);
    expect(store.get('deviceFinancials', 'DEV_01').currentCost).toBe(12_750_000);
    expect(store.get('devices', 'DEV_01').currentCost).toBe(12_750_000);
    expect(store.get('technicalWorkOrders', 'WO_01')).toMatchObject({ costPostingStatus: 'POSTED', closingDeviceCost: 12_750_000 });
    expect(store.values('deviceCostEvents')).toHaveLength(1);
  });

  it('blocks cost posting while any issued part is unsettled', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'QC_PASSED', workOrderType: 'INBOUND_PREP', branchId: 'CN01', deviceId: 'DEV_01', imei: '12345', openingDeviceCost: 1_000_000, openingCostVersion: 'V1' } },
      devices: { DEV_01: { id: 'DEV_01', currentCost: 1_000_000, costVersion: 'V1' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'VERIFIED', laborCostToDevice: 0 } },
      technicalPartIssues: { ISSUE_01: { id: 'ISSUE_01', workOrderId: 'WO_01', quantityIssued: 2, quantityConsumed: 1, quantityReturned: 0, quantityScrapped: 0, unitCostSnapshot: 100_000 } }
    });
    await expect(processFinalizeTechnicalCost(store.db, 'WO_01', 'finalize-unsettled-0001', manager)).rejects.toThrow('PART_ISSUES_NOT_SETTLED');
  });

  it('blocks task completion until every issued part is settled', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', assigneeUid: 'TECH_01', requiredEvidenceTypes: ['AFTER_PHOTO'] } },
      technicalPartIssues: { ISSUE_01: { id: 'ISSUE_01', workOrderId: 'WO_01', workOrderLineId: 'LINE_01', partName: 'Pin', quantityIssued: 1, quantityConsumed: 0, quantityReturned: 0 } }
    });
    await expect(processCompleteTaskLine(
      store.db,
      'WO_01',
      'LINE_01',
      ['https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/technical-evidence%2FWO_01%2FLINE_01%2Fafter.jpg?alt=media'],
      'Đã thay pin và kiểm tra nguồn ổn định.',
      tech
    )).rejects.toThrow('PART_ISSUE_NOT_SETTLED');
  });

  it('allows completing a task without a photo only when the policy does not require one', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', assigneeUid: 'TECH_01', requiredEvidenceTypes: [] } }
    });
    const result = await processCompleteTaskLine(
      store.db,
      'WO_01',
      'LINE_01',
      [],
      'Đã hoàn thành đầy đủ kiểm tra sau sửa.',
      tech
    );
    expect(result).toMatchObject({ success: true, allLinesCompleted: true });
    expect(store.get('technicalWorkOrderLines', 'LINE_01')).toMatchObject({ status: 'COMPLETED', evidencePhotoUrls: [] });
  });

  it('rejects an external HTTPS URL that is not evidence for the same work order', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', currentCustodianUid: 'TECH_01' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', assigneeUid: 'TECH_01', requiredEvidenceTypes: ['AFTER_PHOTO'] } }
    });
    await expect(processCompleteTaskLine(
      store.db,
      'WO_01',
      'LINE_01',
      ['https://example.com/reused-image.jpg'],
      'Đã hoàn thành đầy đủ kiểm tra sau sửa.',
      tech
    )).rejects.toThrow('INVALID_EVIDENCE');
  });

  it('accepts iPhone aliases such as 12 prm and iPhone 12 Pro Max as one compatible model', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', model: '12 prm' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', assigneeUid: 'TECH_01', requiredParts: [{ category: 'MAN_HINH', quantity: 1 }] } },
      spareParts: { SCREEN_01: { id: 'SCREEN_01', sku: 'MH-IP12PM-ZIN', name: 'Màn iPhone 12 Pro Max', category: 'MH', branchId: 'CN01', warehouseId: 'KHO_KTV_NAM', stockQuantity: 1, reservedQuantity: 0, compatibleModels: ['iPhone 12 Pro Max'] } },
      warehouses: { KHO_KTV_NAM: { id: 'KHO_KTV_NAM', branchId: 'CN01', type: 'TECHNICIAN_SUB', custodianUid: 'TECH_01', isActive: true } }
    });
    const result = await processReserveTechnicalPart(store.db, 'WO_01', {
      lineId: 'LINE_01', partId: 'SCREEN_01', warehouseId: 'KHO_KTV_NAM', quantity: 1, idempotencyKey: 'iphone-model-alias-reserve-0001'
    }, tech);
    expect(result.reservation.partId).toBe('SCREEN_01');
  });

  it('lets KTV request stock immediately after assignment and marks only that task waiting for parts', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'ASSIGNED', branchId: 'CN01', model: 'iPhone 15 Pro' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'ASSIGNED', branchId: 'CN01', assigneeUid: 'TECH_01', requiredParts: [{ category: 'PIN', quantity: 1 }] } },
      spareParts: { PIN_MAIN: { id: 'PIN_MAIN', sku: 'PIN-IP15P', name: 'Pin 15 Pro', category: 'PIN', branchId: 'CN01', warehouseId: 'KHO_TONG', stockQuantity: 3, reservedQuantity: 0, compatibleModels: ['IP15P'] } },
      warehouses: {
        KHO_TONG: { id: 'KHO_TONG', branchId: 'CN01', type: 'CENTRAL', isActive: true },
        KHO_KTV_NAM: { id: 'KHO_KTV_NAM', branchId: 'CN01', type: 'TECHNICIAN_SUB', parentWarehouseId: 'KHO_TONG', custodianUid: 'TECH_01', isActive: true }
      }
    });
    const result = await processCreateTechnicalPartStockRequest(store.db, {
      sourceWarehouseId: 'KHO_TONG', targetWarehouseId: 'KHO_KTV_NAM', partId: 'PIN_MAIN', quantity: 1,
      reason: 'Kho cá nhân hết pin đúng model để thực hiện task.', workOrderId: 'WO_01', workOrderLineId: 'LINE_01', idempotencyKey: 'waiting-parts-request-0001'
    }, tech);
    expect(result.request.status).toBe('PENDING');
    expect(store.get('technicalWorkOrderLines', 'LINE_01')).toMatchObject({ status: 'WAITING_PARTS' });
    expect(store.get('technicalWorkOrders', 'WO_01')).toMatchObject({ status: 'IN_PROGRESS' });
  });

  it('creates an approved additional task only after customer approval is confirmed', async () => {
    const store = createTechnicalCostDb({
      technicalWorkOrders: { WO_01: { id: 'WO_01', status: 'IN_PROGRESS', branchId: 'CN01', workOrderType: 'CUSTOMER_SERVICE', imei: '12345', model: 'iPhone 15', currentCustodianUid: 'TECH_01', taskLineIds: ['LINE_01'], customerApprovedQuote: 100_000, totalCommissionAmount: 0, costPostingStatus: 'NOT_APPLICABLE' } },
      technicalWorkOrderLines: { LINE_01: { id: 'LINE_01', workOrderId: 'WO_01', status: 'IN_PROGRESS', assigneeUid: 'TECH_01', assigneeName: 'KTV Nam' } },
      technicalTaskTypes: { THAY_CAM: { id: 'THAY_CAM', taskCode: 'CAM', name: 'Thay camera', baseCommission: 80_000, laborCostToDevice: 80_000, normalSlaHours: 4, prioritySlaHours: 2, urgentSlaHours: 1, priorityMultiplier: { NORMAL: 1, PRIORITY: 1.2, URGENT: 1.5 }, requiresQc: true, isActive: true, version: 'V1', requiredPartTemplates: [{ category: 'CAMERA', quantity: 1 }] } }
    });
    const created = await processCreateTechnicalTaskAdditionRequest(store.db, 'WO_01', {
      taskType: 'THAY_CAM', reason: 'Phát hiện thêm camera sau không lấy nét được khi kiểm tra.', additionalCustomerQuote: 350_000, idempotencyKey: 'task-addition-create-0001'
    }, tech);
    await expect(processDecideTechnicalTaskAdditionRequest(store.db, 'WO_01', created.request.id, {
      decision: 'APPROVED', idempotencyKey: 'task-addition-decision-denied-0001'
    }, manager)).rejects.toThrow('CUSTOMER_APPROVAL_REQUIRED_FOR_ADDITIONAL_TASK');
    const approved = await processDecideTechnicalTaskAdditionRequest(store.db, 'WO_01', created.request.id, {
      decision: 'APPROVED', customerApprovalConfirmed: true, additionalCustomerQuote: 350_000, idempotencyKey: 'task-addition-decision-approved-0001'
    }, manager);
    expect(approved.lineId).toBeTruthy();
    expect(store.get('technicalTaskAdditionRequests', created.request.id)).toMatchObject({ status: 'APPROVED', lineId: approved.lineId });
    expect(store.get('technicalWorkOrders', 'WO_01')).toMatchObject({ proposedQuoteAmount: 450_000, quoteStatus: 'PENDING_APPROVAL' });
    expect(store.get('technicalWorkOrderLines', approved.lineId!)).toMatchObject({ taskType: 'THAY_CAM', status: 'ASSIGNED', additionRequestId: created.request.id });
  });
});
