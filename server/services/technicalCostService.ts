import crypto from 'crypto';
import { FieldValue, Firestore } from 'firebase-admin/firestore';

export interface TechnicalCostActor {
  uid: string;
  name?: string;
  role?: string;
  branchId?: string;
  assignedBranchIds?: string[];
}

export type TechnicalPartIssueStatus =
  | 'ISSUED'
  | 'PARTIALLY_SETTLED'
  | 'CONSUMED'
  | 'RETURNED'
  | 'SETTLED'
  | 'CANCELLED';

export type TechnicalPartReservationStatus =
  | 'RESERVED'
  | 'PARTIALLY_ISSUED'
  | 'FULFILLED'
  | 'CANCELLED';

export interface TechnicalCostBreakdown {
  openingDeviceCost: number;
  partsCost: number;
  laborCost: number;
  externalCost: number;
  otherCost: number;
  recoveryAmount: number;
  totalActualCost: number;
  closingDeviceCost: number;
}

const ACTIVE_PART_WORK_ORDER_STATUSES = new Set([
  'ACCEPTED',
  'DIAGNOSING',
  'IN_PROGRESS',
  'QC_FAILED_REWORK'
]);

const ACTIVE_PART_LINE_STATUSES = new Set([
  'ACCEPTED',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'REWORK_REQUIRED'
]);
const ACTIVE_COST_WORK_ORDER_STATUSES = new Set([
  ...ACTIVE_PART_WORK_ORDER_STATUSES,
  'TECH_COMPLETED',
  'QC_PENDING'
]);

const INTERNAL_ASSET_TYPES = new Set([
  'INBOUND_PREP',
  'TRADE_IN_REFURB',
  'SHOP_RETURN_REWORK'
]);

function numberOrZero(value: unknown): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) throw new Error('TECHNICAL_COST_NUMBER_INVALID');
  return numeric;
}

function positiveInteger(value: unknown, code = 'INVALID_QUANTITY'): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) throw new Error(code);
  return numeric;
}

function normalizedRole(actor: TechnicalCostActor): string {
  return String(actor.role || '').toUpperCase();
}

function isElevated(actor: TechnicalCostActor): boolean {
  return ['ADMIN', 'MANAGER', 'TECH_LEAD', 'INVENTORY_MANAGER'].includes(normalizedRole(actor));
}

function canViewTechnicalCost(actor: TechnicalCostActor): boolean {
  return ['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(normalizedRole(actor));
}

function canAccessBranch(actor: TechnicalCostActor, branchId: string): boolean {
  const role = normalizedRole(actor);
  return role === 'ADMIN' || role === 'REGIONAL_MANAGER' || actor.branchId === branchId || (actor.assignedBranchIds || []).includes(branchId);
}

function assertIdempotencyKey(value: unknown): string {
  const key = String(value || '').trim();
  if (key.length < 8 || key.length > 160) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  return key;
}

function idempotencyId(scope: string, key: string): string {
  return crypto.createHash('sha256').update(`${scope}:${key}`).digest('hex');
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function deterministicId(prefix: string, value: string, length = 24): string {
  return `${prefix}_${crypto.createHash('sha256').update(value).digest('hex').slice(0, length).toUpperCase()}`;
}

function warehouseBranchId(warehouse: any): string {
  return String(warehouse?.branchId || warehouse?.owningBranchId || '');
}

function publicIssue(issue: any): any {
  return JSON.parse(JSON.stringify(issue));
}

function visiblePartIssue(issue: any, actor: TechnicalCostActor): any {
  const visible = publicIssue(issue);
  if (canViewTechnicalCost(actor)) return visible;
  delete visible.unitCostSnapshot;
  delete visible.totalConsumedCost;
  delete visible.costMethod;
  delete visible.costVersion;
  delete visible.quantityScrappedCapitalized;
  delete visible.capitalizeScrapToDevice;
  return visible;
}

function deriveIssueStatus(issue: {
  quantityIssued: number;
  quantityConsumed: number;
  quantityReturned: number;
  quantityScrapped?: number;
}): TechnicalPartIssueStatus {
  const settled = issue.quantityConsumed + issue.quantityReturned + Number(issue.quantityScrapped || 0);
  if (settled === 0) return 'ISSUED';
  if (settled < issue.quantityIssued) return 'PARTIALLY_SETTLED';
  if (issue.quantityConsumed === issue.quantityIssued) return 'CONSUMED';
  if (issue.quantityReturned === issue.quantityIssued) return 'RETURNED';
  return 'SETTLED';
}

export function calculateTechnicalCostBreakdown(input: {
  openingDeviceCost: number;
  partIssues?: any[];
  taskLines?: any[];
  externalCosts?: any[];
  recoveries?: any[];
}): TechnicalCostBreakdown {
  const openingDeviceCost = numberOrZero(input.openingDeviceCost);
  if (openingDeviceCost < 0) throw new Error('OPENING_DEVICE_COST_INVALID');

  const partsCost = (input.partIssues || []).reduce((sum, issue) => {
    if (issue.status === 'CANCELLED') return sum;
    const quantityConsumed = numberOrZero(issue.quantityConsumed);
    const quantityScrapped = issue.quantityScrappedCapitalized == null
      ? (issue.capitalizeScrapToDevice === true ? numberOrZero(issue.quantityScrapped) : 0)
      : numberOrZero(issue.quantityScrappedCapitalized);
    return sum + (quantityConsumed + quantityScrapped) * numberOrZero(issue.unitCostSnapshot);
  }, 0);
  const laborCost = (input.taskLines || []).reduce((sum, line) => {
    if (line.status !== 'VERIFIED' || line.capitalizeLaborCost === false) return sum;
    return sum + numberOrZero(line.laborCostToDevice);
  }, 0);
  const externalCost = (input.externalCosts || []).reduce((sum, cost) => {
    if (cost.approvalStatus !== 'APPROVED' || cost.capitalizeToDevice === false || cost.category === 'OTHER') return sum;
    return sum + numberOrZero(cost.amount);
  }, 0);
  const otherCost = (input.externalCosts || []).reduce((sum, cost) => {
    if (cost.approvalStatus !== 'APPROVED' || cost.capitalizeToDevice === false || cost.category !== 'OTHER') return sum;
    return sum + numberOrZero(cost.amount);
  }, 0);
  const recoveryAmount = (input.recoveries || []).reduce((sum, recovery) => {
    if (recovery.approvalStatus !== 'APPROVED') return sum;
    return sum + numberOrZero(recovery.amount);
  }, 0);
  const totalActualCost = partsCost + laborCost + externalCost + otherCost - recoveryAmount;
  const closingDeviceCost = openingDeviceCost + totalActualCost;
  if (closingDeviceCost < 0) throw new Error('CLOSING_DEVICE_COST_NEGATIVE');

  return {
    openingDeviceCost,
    partsCost,
    laborCost,
    externalCost,
    otherCost,
    recoveryAmount,
    totalActualCost,
    closingDeviceCost
  };
}

export async function processReceiveTechnicalSparePart(
  db: Firestore,
  input: {
    partId?: string;
    sku: string;
    name: string;
    category?: string;
    branchId: string;
    warehouseId: string;
    lotId?: string;
    lotCode?: string;
    quantity: number;
    unitCost: number;
    supplierId?: string;
    sourceType: 'PART_PURCHASE' | 'OPENING_BALANCE' | 'MANUAL_ADJUSTMENT';
    sourceId: string;
    sourceCode?: string;
    note?: string;
    compatibleModels?: string[];
    idempotencyKey: string;
  },
  actor: TechnicalCostActor
): Promise<{ part: any; lot: any; receiptId: string; idempotentReplay?: boolean }> {
  if (!isElevated(actor)) throw new Error('SPARE_PART_RECEIPT_FORBIDDEN');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const sku = String(input.sku || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const branchId = String(input.branchId || '').trim();
  const warehouseId = String(input.warehouseId || '').trim();
  const sourceId = String(input.sourceId || '').trim();
  const quantity = positiveInteger(input.quantity);
  const unitCost = Number(input.unitCost);
  if (!sku || !name || !branchId || !warehouseId || !sourceId) throw new Error('SPARE_PART_RECEIPT_FIELDS_REQUIRED');
  if (!['PART_PURCHASE', 'OPENING_BALANCE', 'MANUAL_ADJUSTMENT'].includes(String(input.sourceType || ''))) throw new Error('SPARE_PART_RECEIPT_SOURCE_INVALID');
  if (!Number.isSafeInteger(unitCost) || unitCost < 0) throw new Error('SPARE_PART_COST_INVALID');
  if (!canAccessBranch(actor, branchId)) throw new Error('BRANCH_FORBIDDEN');
  if (input.sourceType === 'MANUAL_ADJUSTMENT' && String(input.note || '').trim().length < 5) throw new Error('SPARE_PART_ADJUSTMENT_NOTE_REQUIRED');
  const partId = String(input.partId || '').trim() || deterministicId('SP', `${branchId}:${warehouseId}:${sku}`);
  const lotCode = String(input.lotCode || '').trim() || `AUTO-${sourceId}`;
  const lotId = String(input.lotId || '').trim() || deterministicId('SPL', `${partId}:${lotCode}`);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId('SPARE_PART_RECEIPT', key));
  const partRef = db.collection('spareParts').doc(partId);
  const lotRef = db.collection('sparePartLots').doc(lotId);
  const warehouseRef = db.collection('warehouses').doc(warehouseId);

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const [partReplay, lotReplay] = await Promise.all([
        transaction.get(partRef),
        transaction.get(lotRef)
      ]);
      if (!partReplay.exists || !lotReplay.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      const partData = { id: partReplay.id, ...partReplay.data() } as any;
      if (!canViewTechnicalCost(actor)) {
        delete partData.currentAverageCost;
        delete partData.costPrice;
      }
      const lotData = { id: lotReplay.id, ...lotReplay.data() } as any;
      if (!canViewTechnicalCost(actor)) delete lotData.unitCost;
      return { part: partData, lot: lotData, receiptId: String(idemSnap.data()?.receiptId || ''), idempotentReplay: true };
    }
    const [warehouseSnap, partSnap, lotSnap] = await Promise.all([
      transaction.get(warehouseRef),
      transaction.get(partRef),
      transaction.get(lotRef)
    ]);
    if (!warehouseSnap.exists) throw new Error('PART_WAREHOUSE_NOT_FOUND');
    const warehouse = warehouseSnap.data()!;
    if (warehouse.isActive === false || warehouse.isArchived === true || warehouseBranchId(warehouse) !== branchId) throw new Error('PART_WAREHOUSE_BRANCH_MISMATCH');
    const existingPart = partSnap.exists ? partSnap.data()! : null;
    if (existingPart && (
      String(existingPart.branchId || '') !== branchId
      || String(existingPart.warehouseId || '') !== warehouseId
      || String(existingPart.sku || '').toUpperCase() !== sku
    )) throw new Error('SPARE_PART_IDENTITY_MISMATCH');
    const existingLot = lotSnap.exists ? lotSnap.data()! : null;
    if (existingLot && (existingLot.partId !== partId || existingLot.warehouseId !== warehouseId || existingLot.branchId !== branchId)) {
      throw new Error('SPARE_PART_LOT_MISMATCH');
    }
    const currentStock = numberOrZero(existingPart?.stockQuantity);
    const currentValue = currentStock * numberOrZero(existingPart?.currentAverageCost ?? existingPart?.costPrice);
    const nextStock = currentStock + quantity;
    const nextAverageCost = nextStock > 0 ? Math.round((currentValue + quantity * unitCost) / nextStock) : unitCost;
    const currentLotStock = numberOrZero(existingLot?.stockQuantity);
    const nextLotStock = currentLotStock + quantity;
    const nextLotCost = nextLotStock > 0
      ? Math.round((currentLotStock * numberOrZero(existingLot?.unitCost) + quantity * unitCost) / nextLotStock)
      : unitCost;
    const now = new Date().toISOString();
    const receiptId = randomId('SPR');
    const movementId = randomId('SPM');
    const costVersion = `PART_RECEIPT_${now}`;
    const part = {
      ...(existingPart || {}),
      id: partId,
      sku,
      name,
      category: String(input.category || existingPart?.category || 'KHAC'),
      branchId,
      warehouseId,
      stockQuantity: nextStock,
      reservedQuantity: numberOrZero(existingPart?.reservedQuantity),
      currentAverageCost: nextAverageCost,
      costPrice: nextAverageCost,
      costVersion,
      compatibleModels: [...new Set([...(Array.isArray(existingPart?.compatibleModels) ? existingPart.compatibleModels : []), ...(Array.isArray(input.compatibleModels) ? input.compatibleModels.map(String) : [])])],
      isActive: existingPart?.isActive !== false,
      createdAt: existingPart?.createdAt || now,
      updatedAt: now
    };
    const lot = {
      ...(existingLot || {}),
      id: lotId,
      lotCode,
      partId,
      sku,
      branchId,
      warehouseId,
      supplierId: input.supplierId || existingLot?.supplierId || null,
      sourceType: input.sourceType,
      sourceId,
      sourceCode: input.sourceCode || null,
      stockQuantity: nextLotStock,
      reservedQuantity: numberOrZero(existingLot?.reservedQuantity),
      unitCost: nextLotCost,
      costVersion,
      receivedAt: now,
      createdAt: existingLot?.createdAt || now,
      updatedAt: now
    };
    const receipt = {
      id: receiptId,
      partId,
      lotId,
      sku,
      partName: name,
      branchId,
      warehouseId,
      quantity,
      unitCostSnapshot: unitCost,
      totalCost: quantity * unitCost,
      supplierId: input.supplierId || null,
      sourceType: input.sourceType,
      sourceId,
      sourceCode: input.sourceCode || null,
      note: String(input.note || ''),
      receivedByUid: actor.uid,
      receivedAt: now,
      createdAt: now
    };
    transaction.set(partRef, part);
    transaction.set(lotRef, lot);
    transaction.set(db.collection('sparePartReceipts').doc(receiptId), receipt);
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId,
      movementType: 'RECEIPT',
      partId,
      lotId,
      warehouseId,
      branchId,
      quantity,
      unitCostSnapshot: unitCost,
      sourceType: input.sourceType,
      sourceId,
      receiptId,
      actorUid: actor.uid,
      note: String(input.note || ''),
      occurredAt: now,
      createdAt: now
    });
    transaction.set(idemRef, { scope: 'SPARE_PART_RECEIPT', partId, lotId, receiptId, createdAt: now });
    const visiblePart = publicIssue(part);
    const visibleLot = publicIssue(lot);
    if (!canViewTechnicalCost(actor)) {
      delete visiblePart.currentAverageCost;
      delete visiblePart.costPrice;
      delete visibleLot.unitCost;
    }
    return { part: visiblePart, lot: visibleLot, receiptId };
  });
}

export async function processReserveTechnicalPart(
  db: Firestore,
  workOrderId: string,
  input: {
    lineId: string;
    partId: string;
    warehouseId: string;
    lotId?: string;
    quantity: number;
    idempotencyKey: string;
  },
  actor: TechnicalCostActor
): Promise<{ reservation: any; availableQuantity: number; idempotentReplay?: boolean }> {
  const quantity = positiveInteger(input.quantity);
  const key = assertIdempotencyKey(input.idempotencyKey);
  if (!input.lineId || !input.partId || !input.warehouseId) throw new Error('PART_RESERVATION_FIELDS_REQUIRED');
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_RESERVE:${workOrderId}`, key));
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const lineRef = db.collection('technicalWorkOrderLines').doc(input.lineId);
  const partRef = db.collection('spareParts').doc(input.partId);
  const warehouseRef = db.collection('warehouses').doc(input.warehouseId);
  const lotRef = input.lotId ? db.collection('sparePartLots').doc(input.lotId) : null;
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const reservationSnap = await transaction.get(db.collection('technicalPartReservations').doc(String(idemSnap.data()?.reservationId || '')));
      if (!reservationSnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { reservation: publicIssue(reservationSnap.data()), availableQuantity: Number(idemSnap.data()?.availableQuantity || 0), idempotentReplay: true };
    }
    const [woSnap, lineSnap, partSnap, warehouseSnap, lotSnap] = await Promise.all([
      transaction.get(woRef),
      transaction.get(lineRef),
      transaction.get(partRef),
      transaction.get(warehouseRef),
      lotRef ? transaction.get(lotRef) : Promise.resolve(null)
    ]);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!lineSnap.exists) throw new Error('LINE_NOT_FOUND');
    if (!partSnap.exists) throw new Error('SPARE_PART_NOT_FOUND');
    if (!warehouseSnap.exists) throw new Error('PART_WAREHOUSE_NOT_FOUND');
    if (lotRef && !lotSnap?.exists) throw new Error('SPARE_PART_LOT_NOT_FOUND');
    const workOrder = woSnap.data()!;
    const line = lineSnap.data()!;
    const part = partSnap.data()!;
    const warehouse = warehouseSnap.data()!;
    const lot = lotSnap?.data();
    if (workOrder.activeHandoffId) throw new Error('TECH_HANDOFF_PENDING');
    if (line.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(workOrder.branchId || line.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!isElevated(actor) && line.assigneeUid !== actor.uid) throw new Error('TECHNICIAN_NOT_ASSIGNED');
    if (!ACTIVE_PART_WORK_ORDER_STATUSES.has(String(workOrder.status))) throw new Error('WORK_ORDER_NOT_OPEN_FOR_PARTS');
    if (!ACTIVE_PART_LINE_STATUSES.has(String(line.status))) throw new Error('TASK_NOT_OPEN_FOR_PARTS');
    if (warehouse.isActive === false || warehouseBranchId(warehouse) !== String(workOrder.branchId)) throw new Error('PART_WAREHOUSE_BRANCH_MISMATCH');
    if (part.branchId && part.branchId !== workOrder.branchId) throw new Error('SPARE_PART_BRANCH_MISMATCH');
    if (part.warehouseId && part.warehouseId !== input.warehouseId) throw new Error('SPARE_PART_WAREHOUSE_MISMATCH');
    if (lot && (lot.partId !== input.partId || lot.warehouseId !== input.warehouseId)) throw new Error('SPARE_PART_LOT_MISMATCH');
    const stockQuantity = numberOrZero(lot?.stockQuantity ?? part.stockQuantity);
    const reservedQuantity = numberOrZero(lot?.reservedQuantity ?? part.reservedQuantity);
    const aggregateStock = numberOrZero(part.stockQuantity);
    const aggregateReserved = numberOrZero(part.reservedQuantity);
    if (!Number.isInteger(stockQuantity) || stockQuantity - reservedQuantity < quantity) throw new Error('INSUFFICIENT_AVAILABLE_PARTS_STOCK');
    if (lotRef && (!Number.isInteger(aggregateStock) || aggregateStock - aggregateReserved < quantity)) throw new Error('INSUFFICIENT_AVAILABLE_PARTS_STOCK');
    const now = new Date().toISOString();
    const reservationId = randomId('TPR');
    const movementId = randomId('SPM');
    const reservation = {
      id: reservationId,
      workOrderId,
      workOrderLineId: input.lineId,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      warehouseId: input.warehouseId,
      partId: input.partId,
      sku: part.sku || input.partId,
      partName: part.name || input.partId,
      lotId: input.lotId || null,
      quantityReserved: quantity,
      quantityIssued: 0,
      quantityCancelled: 0,
      reservedForUid: line.assigneeUid,
      reservedByUid: actor.uid,
      reservedAt: now,
      status: 'RESERVED' as TechnicalPartReservationStatus,
      createdAt: now,
      updatedAt: now
    };
    if (lotRef) {
      transaction.update(lotRef, { reservedQuantity: reservedQuantity + quantity, updatedAt: now });
      transaction.update(partRef, { reservedQuantity: aggregateReserved + quantity, updatedAt: now });
    } else {
      transaction.update(partRef, { reservedQuantity: reservedQuantity + quantity, updatedAt: now });
    }
    transaction.set(db.collection('technicalPartReservations').doc(reservationId), reservation);
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId,
      movementType: 'RESERVE',
      partId: input.partId,
      lotId: input.lotId || null,
      warehouseId: input.warehouseId,
      branchId: workOrder.branchId,
      quantity,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      reservationId,
      workOrderLineId: input.lineId,
      actorUid: actor.uid,
      occurredAt: now,
      createdAt: now
    });
    const availableQuantity = stockQuantity - reservedQuantity - quantity;
    transaction.set(idemRef, { scope: 'PART_RESERVE', workOrderId, reservationId, availableQuantity, createdAt: now });
    return { reservation, availableQuantity };
  });
}

export async function processCancelTechnicalPartReservation(
  db: Firestore,
  workOrderId: string,
  reservationId: string,
  input: { reason: string; idempotencyKey: string },
  actor: TechnicalCostActor
): Promise<{ reservation: any; releasedQuantity: number; idempotentReplay?: boolean }> {
  const reason = String(input.reason || '').trim();
  if (reason.length < 5) throw new Error('PART_RESERVATION_CANCELLATION_REASON_REQUIRED');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const reservationRef = db.collection('technicalPartReservations').doc(reservationId);
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_RESERVATION_CANCEL:${reservationId}`, key));
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const replay = await transaction.get(reservationRef);
      if (!replay.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { reservation: publicIssue(replay.data()), releasedQuantity: Number(idemSnap.data()?.releasedQuantity || 0), idempotentReplay: true };
    }
    const [reservationSnap, woSnap] = await Promise.all([
      transaction.get(reservationRef),
      transaction.get(woRef)
    ]);
    if (!reservationSnap.exists) throw new Error('PART_RESERVATION_NOT_FOUND');
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const reservation = reservationSnap.data()!;
    if (reservation.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(reservation.branchId || woSnap.data()?.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!isElevated(actor) && reservation.reservedForUid !== actor.uid && reservation.reservedByUid !== actor.uid) throw new Error('TECHNICIAN_NOT_ASSIGNED');
    const releasedQuantity = numberOrZero(reservation.quantityReserved)
      - numberOrZero(reservation.quantityIssued)
      - numberOrZero(reservation.quantityCancelled);
    if (releasedQuantity <= 0 || ['FULFILLED', 'CANCELLED'].includes(String(reservation.status || ''))) {
      return { reservation: publicIssue(reservation), releasedQuantity: 0, idempotentReplay: true };
    }
    const partRef = db.collection('spareParts').doc(String(reservation.partId));
    const lotRef = reservation.lotId ? db.collection('sparePartLots').doc(String(reservation.lotId)) : null;
    const [partSnap, lotSnap] = await Promise.all([
      transaction.get(partRef),
      lotRef ? transaction.get(lotRef) : Promise.resolve(null)
    ]);
    if (!partSnap.exists || (lotRef && !lotSnap?.exists)) throw new Error('SPARE_PART_STOCK_RECORD_NOT_FOUND');
    const part = partSnap.data()!;
    const lot = lotSnap?.data();
    const partReserved = numberOrZero(part.reservedQuantity);
    const lotReserved = numberOrZero(lot?.reservedQuantity);
    if (partReserved < releasedQuantity || (lotRef && lotReserved < releasedQuantity)) throw new Error('SPARE_PART_RESERVED_BALANCE_MISMATCH');
    const now = new Date().toISOString();
    const movementId = randomId('SPM');
    if (lotRef) {
      transaction.update(lotRef, { reservedQuantity: lotReserved - releasedQuantity, updatedAt: now });
    }
    transaction.update(partRef, { reservedQuantity: partReserved - releasedQuantity, updatedAt: now });
    const updatedReservation = {
      ...reservation,
      quantityCancelled: numberOrZero(reservation.quantityCancelled) + releasedQuantity,
      status: 'CANCELLED' as TechnicalPartReservationStatus,
      cancellationReason: reason,
      cancelledByUid: actor.uid,
      cancelledAt: now,
      updatedAt: now
    };
    transaction.update(reservationRef, {
      quantityCancelled: updatedReservation.quantityCancelled,
      status: updatedReservation.status,
      cancellationReason: reason,
      cancelledByUid: actor.uid,
      cancelledAt: now,
      updatedAt: now
    });
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId,
      movementType: 'RELEASE_RESERVATION',
      partId: reservation.partId,
      lotId: reservation.lotId || null,
      warehouseId: reservation.warehouseId,
      branchId: reservation.branchId,
      quantity: releasedQuantity,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      reservationId,
      actorUid: actor.uid,
      reason,
      occurredAt: now,
      createdAt: now
    });
    transaction.set(idemRef, { scope: 'PART_RESERVATION_CANCEL', workOrderId, reservationId, releasedQuantity, createdAt: now });
    return { reservation: updatedReservation, releasedQuantity };
  });
}

export async function processIssueTechnicalPart(
  db: Firestore,
  workOrderId: string,
  input: {
    lineId: string;
    partId: string;
    warehouseId: string;
    lotId?: string;
    reservationId?: string;
    quantity: number;
    idempotencyKey: string;
  },
  actor: TechnicalCostActor
): Promise<{ issue: any; remainingStock: number; idempotentReplay?: boolean }> {
  const quantity = positiveInteger(input.quantity);
  const key = assertIdempotencyKey(input.idempotencyKey);
  if (!input.lineId || !input.partId || !input.warehouseId) throw new Error('PART_ISSUE_FIELDS_REQUIRED');

  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_ISSUE:${workOrderId}`, key));
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const lineRef = db.collection('technicalWorkOrderLines').doc(input.lineId);
  const partRef = db.collection('spareParts').doc(input.partId);
  const warehouseRef = db.collection('warehouses').doc(input.warehouseId);
  const lotRef = input.lotId ? db.collection('sparePartLots').doc(input.lotId) : null;
  const reservationRef = input.reservationId ? db.collection('technicalPartReservations').doc(input.reservationId) : null;

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const idem = idemSnap.data()!;
      const issueSnap = await transaction.get(db.collection('technicalPartIssues').doc(idem.issueId));
      if (!issueSnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { issue: visiblePartIssue(issueSnap.data(), actor), remainingStock: Number(idem.remainingStock), idempotentReplay: true };
    }

    const woSnap = await transaction.get(woRef);
    const lineSnap = await transaction.get(lineRef);
    const partSnap = await transaction.get(partRef);
    const warehouseSnap = await transaction.get(warehouseRef);
    const lotSnap = lotRef ? await transaction.get(lotRef) : null;
    const reservationSnap = reservationRef ? await transaction.get(reservationRef) : null;
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!lineSnap.exists) throw new Error('LINE_NOT_FOUND');
    if (!partSnap.exists) throw new Error('SPARE_PART_NOT_FOUND');
    if (!warehouseSnap.exists) throw new Error('PART_WAREHOUSE_NOT_FOUND');
    if (lotRef && !lotSnap?.exists) throw new Error('SPARE_PART_LOT_NOT_FOUND');
    if (reservationRef && !reservationSnap?.exists) throw new Error('PART_RESERVATION_NOT_FOUND');

    const workOrder = woSnap.data()!;
    const line = lineSnap.data()!;
    const part = partSnap.data()!;
    const warehouse = warehouseSnap.data()!;
    const lot = lotSnap?.data();
    const reservation = reservationSnap?.data();
    if (workOrder.activeHandoffId) throw new Error('TECH_HANDOFF_PENDING');
    if (line.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(workOrder.branchId || line.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!isElevated(actor) && line.assigneeUid !== actor.uid) throw new Error('TECHNICIAN_NOT_ASSIGNED');
    if (!ACTIVE_PART_WORK_ORDER_STATUSES.has(String(workOrder.status))) throw new Error('WORK_ORDER_NOT_OPEN_FOR_PARTS');
    if (!ACTIVE_PART_LINE_STATUSES.has(String(line.status))) throw new Error('TASK_NOT_OPEN_FOR_PARTS');
    if (warehouse.isActive === false || warehouseBranchId(warehouse) !== String(workOrder.branchId)) throw new Error('PART_WAREHOUSE_BRANCH_MISMATCH');
    if (part.branchId && part.branchId !== workOrder.branchId) throw new Error('SPARE_PART_BRANCH_MISMATCH');
    if (part.warehouseId && part.warehouseId !== input.warehouseId) throw new Error('SPARE_PART_WAREHOUSE_MISMATCH');
    if (lot && (lot.partId !== input.partId || (lot.warehouseId && lot.warehouseId !== input.warehouseId))) throw new Error('SPARE_PART_LOT_MISMATCH');
    if (reservation && (
      reservation.workOrderId !== workOrderId
      || reservation.workOrderLineId !== input.lineId
      || reservation.partId !== input.partId
      || reservation.warehouseId !== input.warehouseId
      || String(reservation.lotId || '') !== String(input.lotId || '')
      || !['RESERVED', 'PARTIALLY_ISSUED'].includes(String(reservation.status || ''))
    )) throw new Error('PART_RESERVATION_MISMATCH');

    const stockQuantity = numberOrZero(lot?.stockQuantity ?? part.stockQuantity);
    const reservedQuantity = numberOrZero(lot?.reservedQuantity ?? part.reservedQuantity);
    const aggregateStockQuantity = numberOrZero(part.stockQuantity);
    const aggregateReservedQuantity = numberOrZero(part.reservedQuantity);
    const reservationOutstanding = reservation
      ? numberOrZero(reservation.quantityReserved) - numberOrZero(reservation.quantityIssued) - numberOrZero(reservation.quantityCancelled)
      : 0;
    if (reservation && reservationOutstanding < quantity) throw new Error('PART_ISSUE_EXCEEDS_RESERVATION');
    if (reservation && (reservedQuantity < quantity || (lotRef && aggregateReservedQuantity < quantity))) {
      throw new Error('SPARE_PART_RESERVED_BALANCE_MISMATCH');
    }
    const stockAvailable = reservation ? stockQuantity : stockQuantity - reservedQuantity;
    const aggregateAvailable = reservation ? aggregateStockQuantity : aggregateStockQuantity - aggregateReservedQuantity;
    if (!Number.isInteger(stockQuantity) || stockAvailable < quantity || (lotRef && (!Number.isInteger(aggregateStockQuantity) || aggregateAvailable < quantity))) throw new Error('INSUFFICIENT_PARTS_STOCK');
    const unitCostSnapshot = numberOrZero(lot?.unitCost ?? lot?.costPrice ?? part.currentAverageCost ?? part.costPrice);
    if (unitCostSnapshot < 0) throw new Error('SPARE_PART_COST_INVALID');
    const remainingStock = stockQuantity - quantity;
    const now = new Date().toISOString();
    const issueId = randomId('TPI');
    const movementId = randomId('SPM');
    const issue = {
      id: issueId,
      workOrderId,
      workOrderLineId: input.lineId,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      warehouseId: input.warehouseId,
      partId: input.partId,
      sku: part.sku || input.partId,
      partName: part.name || input.partId,
      lotId: input.lotId || null,
      reservationId: input.reservationId || null,
      quantityIssued: quantity,
      quantityConsumed: 0,
      quantityReturned: 0,
      quantityScrapped: 0,
      quantityScrappedCapitalized: 0,
      unitCostSnapshot,
      totalConsumedCost: 0,
      costMethod: input.lotId ? 'FIFO' : 'MOVING_AVERAGE',
      costVersion: String(lot?.costVersion || part.costVersion || 'PART_COST_V2'),
      issuedToUid: line.assigneeUid,
      issuedByUid: actor.uid,
      issuedAt: now,
      status: 'ISSUED' as TechnicalPartIssueStatus,
      createdAt: now,
      updatedAt: now
    };

    if (lotRef) {
      transaction.update(lotRef, {
        stockQuantity: remainingStock,
        ...(reservation ? { reservedQuantity: reservedQuantity - quantity } : {}),
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.update(partRef, {
        stockQuantity: aggregateStockQuantity - quantity,
        ...(reservation ? { reservedQuantity: aggregateReservedQuantity - quantity } : {}),
        updatedAt: FieldValue.serverTimestamp()
      });
    } else {
      transaction.update(partRef, {
        stockQuantity: remainingStock,
        ...(reservation ? { reservedQuantity: reservedQuantity - quantity } : {}),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    if (reservationRef && reservation) {
      const quantityIssued = numberOrZero(reservation.quantityIssued) + quantity;
      const quantityCancelled = numberOrZero(reservation.quantityCancelled);
      const status: TechnicalPartReservationStatus = quantityIssued + quantityCancelled >= numberOrZero(reservation.quantityReserved)
        ? 'FULFILLED'
        : 'PARTIALLY_ISSUED';
      transaction.update(reservationRef, { quantityIssued, status, updatedAt: now });
    }
    transaction.set(db.collection('technicalPartIssues').doc(issueId), issue);
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId,
      movementType: 'ISSUE',
      partId: input.partId,
      lotId: input.lotId || null,
      warehouseId: input.warehouseId,
      branchId: workOrder.branchId,
      quantity,
      unitCostSnapshot,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      issueId,
      reservationId: input.reservationId || null,
      workOrderLineId: input.lineId,
      actorUid: actor.uid,
      occurredAt: now,
      createdAt: now
    });
    transaction.set(idemRef, { scope: 'PART_ISSUE', workOrderId, issueId, remainingStock, createdAt: now });
    return { issue: visiblePartIssue(issue, actor), remainingStock };
  });
}

async function settleTechnicalPart(
  db: Firestore,
  workOrderId: string,
  issueId: string,
  quantityInput: number,
  idempotencyKeyInput: string,
  action: 'CONSUME' | 'RETURN',
  actor: TechnicalCostActor,
  note?: string
): Promise<{ issue: any; idempotentReplay?: boolean }> {
  const quantity = positiveInteger(quantityInput);
  const key = assertIdempotencyKey(idempotencyKeyInput);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_${action}:${issueId}`, key));
  const issueRef = db.collection('technicalPartIssues').doc(issueId);
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const replayIssue = await transaction.get(issueRef);
      if (!replayIssue.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { issue: visiblePartIssue(replayIssue.data(), actor), idempotentReplay: true };
    }
    const issueSnap = await transaction.get(issueRef);
    const woSnap = await transaction.get(woRef);
    if (!issueSnap.exists) throw new Error('PART_ISSUE_NOT_FOUND');
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const issue = issueSnap.data()!;
    const workOrder = woSnap.data()!;
    if (issue.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(issue.branchId || workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!isElevated(actor) && issue.issuedToUid !== actor.uid) throw new Error('TECHNICIAN_NOT_ASSIGNED');
    if (!ACTIVE_PART_WORK_ORDER_STATUSES.has(String(workOrder.status))) throw new Error('WORK_ORDER_NOT_OPEN_FOR_PARTS');

    const issued = numberOrZero(issue.quantityIssued);
    const consumed = numberOrZero(issue.quantityConsumed);
    const returned = numberOrZero(issue.quantityReturned);
    const scrapped = numberOrZero(issue.quantityScrapped);
    const outstanding = issued - consumed - returned - scrapped;
    if (quantity > outstanding) throw new Error('PART_SETTLEMENT_EXCEEDS_OUTSTANDING');

    const next = {
      ...issue,
      quantityIssued: issued,
      quantityScrapped: scrapped,
      quantityConsumed: consumed + (action === 'CONSUME' ? quantity : 0),
      quantityReturned: returned + (action === 'RETURN' ? quantity : 0)
    };
    const status = deriveIssueStatus(next);
    const now = new Date().toISOString();
    const movementId = randomId('SPM');
    const partRef = db.collection('spareParts').doc(issue.partId);
    const lotRef = issue.lotId ? db.collection('sparePartLots').doc(issue.lotId) : null;
    const stockSnap = action === 'RETURN' ? await transaction.get(lotRef || partRef) : null;
    const aggregatePartSnap = action === 'RETURN' && lotRef ? await transaction.get(partRef) : null;
    if (action === 'RETURN' && (!stockSnap?.exists || (lotRef && !aggregatePartSnap?.exists))) throw new Error('SPARE_PART_STOCK_RECORD_NOT_FOUND');

    if (action === 'RETURN') {
      const currentStock = numberOrZero(stockSnap!.data()?.stockQuantity);
      transaction.update(lotRef || partRef, { stockQuantity: currentStock + quantity, updatedAt: FieldValue.serverTimestamp() });
      if (lotRef) {
        transaction.update(partRef, { stockQuantity: numberOrZero(aggregatePartSnap!.data()?.stockQuantity) + quantity, updatedAt: FieldValue.serverTimestamp() });
      }
    }
    transaction.update(issueRef, {
      quantityConsumed: next.quantityConsumed,
      quantityReturned: next.quantityReturned,
      totalConsumedCost: next.quantityConsumed * numberOrZero(issue.unitCostSnapshot),
      status,
      updatedAt: now
    });
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId,
      movementType: action,
      partId: issue.partId,
      lotId: issue.lotId || null,
      warehouseId: issue.warehouseId,
      branchId: issue.branchId,
      quantity,
      unitCostSnapshot: issue.unitCostSnapshot,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      issueId,
      workOrderLineId: issue.workOrderLineId,
      actorUid: actor.uid,
      note: String(note || ''),
      occurredAt: now,
      createdAt: now
    });
    transaction.set(idemRef, { scope: `PART_${action}`, workOrderId, issueId, createdAt: now });
    return { issue: visiblePartIssue({ ...next, status, totalConsumedCost: next.quantityConsumed * numberOrZero(issue.unitCostSnapshot), updatedAt: now }, actor) };
  });
}

export function processConsumeTechnicalPart(
  db: Firestore,
  workOrderId: string,
  issueId: string,
  input: { quantity: number; idempotencyKey: string; note?: string },
  actor: TechnicalCostActor
) {
  return settleTechnicalPart(db, workOrderId, issueId, input.quantity, input.idempotencyKey, 'CONSUME', actor, input.note);
}

export function processReturnTechnicalPart(
  db: Firestore,
  workOrderId: string,
  issueId: string,
  input: { quantity: number; idempotencyKey: string; note?: string },
  actor: TechnicalCostActor
) {
  return settleTechnicalPart(db, workOrderId, issueId, input.quantity, input.idempotencyKey, 'RETURN', actor, input.note);
}

export async function processScrapTechnicalPart(
  db: Firestore,
  workOrderId: string,
  issueId: string,
  input: { quantity: number; reason: string; capitalizeToDevice?: boolean; idempotencyKey: string },
  actor: TechnicalCostActor
): Promise<{ issue: any; idempotentReplay?: boolean }> {
  if (!isElevated(actor)) throw new Error('PART_SCRAP_APPROVAL_FORBIDDEN');
  const quantity = positiveInteger(input.quantity);
  if (!input.reason?.trim()) throw new Error('PART_SCRAP_REASON_REQUIRED');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_SCRAP:${issueId}`, key));
  const issueRef = db.collection('technicalPartIssues').doc(issueId);
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const replay = await transaction.get(issueRef);
      if (!replay.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { issue: publicIssue(replay.data()), idempotentReplay: true };
    }
    const issueSnap = await transaction.get(issueRef);
    const woSnap = await transaction.get(woRef);
    if (!issueSnap.exists) throw new Error('PART_ISSUE_NOT_FOUND');
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const issue = issueSnap.data()!;
    const workOrder = woSnap.data()!;
    if (issue.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(issue.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!ACTIVE_PART_WORK_ORDER_STATUSES.has(String(workOrder.status))) throw new Error('WORK_ORDER_NOT_OPEN_FOR_PARTS');
    const outstanding = numberOrZero(issue.quantityIssued) - numberOrZero(issue.quantityConsumed) - numberOrZero(issue.quantityReturned) - numberOrZero(issue.quantityScrapped);
    if (quantity > outstanding) throw new Error('PART_SETTLEMENT_EXCEEDS_OUTSTANDING');
    const quantityScrapped = numberOrZero(issue.quantityScrapped) + quantity;
    const previouslyCapitalizedScrap = issue.quantityScrappedCapitalized == null && issue.capitalizeScrapToDevice === true
      ? numberOrZero(issue.quantityScrapped)
      : numberOrZero(issue.quantityScrappedCapitalized);
    const quantityScrappedCapitalized = previouslyCapitalizedScrap + (input.capitalizeToDevice === true ? quantity : 0);
    const next = {
      ...issue,
      quantityIssued: numberOrZero(issue.quantityIssued),
      quantityConsumed: numberOrZero(issue.quantityConsumed),
      quantityReturned: numberOrZero(issue.quantityReturned),
      quantityScrapped
    };
    const status = deriveIssueStatus(next);
    const now = new Date().toISOString();
    const movementId = randomId('SPM');
    transaction.update(issueRef, { quantityScrapped, quantityScrappedCapitalized, scrapReason: input.reason.trim(), status, updatedAt: now });
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId, movementType: 'SCRAP', partId: issue.partId, lotId: issue.lotId || null,
      warehouseId: issue.warehouseId, branchId: issue.branchId, quantity, unitCostSnapshot: issue.unitCostSnapshot,
      sourceType: 'WORK_ORDER', sourceId: workOrderId, issueId, actorUid: actor.uid,
      capitalizeToDevice: input.capitalizeToDevice === true, reason: input.reason.trim(), occurredAt: now, createdAt: now
    });
    transaction.set(idemRef, { scope: 'PART_SCRAP', workOrderId, issueId, createdAt: now });
    return { issue: visiblePartIssue({ ...next, quantityScrappedCapitalized, status, scrapReason: input.reason.trim(), updatedAt: now }, actor) };
  });
}

export async function processCancelTechnicalPartIssue(
  db: Firestore,
  workOrderId: string,
  issueId: string,
  input: { reason: string; idempotencyKey: string },
  actor: TechnicalCostActor
): Promise<{ issueId: string; status: 'CANCELLED'; idempotentReplay?: boolean }> {
  if (!isElevated(actor)) throw new Error('PART_ISSUE_CANCELLATION_FORBIDDEN');
  if (!input.reason?.trim()) throw new Error('PART_CANCELLATION_REASON_REQUIRED');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`PART_CANCEL:${issueId}`, key));
  const issueRef = db.collection('technicalPartIssues').doc(issueId);
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) return { issueId, status: 'CANCELLED', idempotentReplay: true };
    const issueSnap = await transaction.get(issueRef);
    const woSnap = await transaction.get(woRef);
    if (!issueSnap.exists) throw new Error('PART_ISSUE_NOT_FOUND');
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const issue = issueSnap.data()!;
    if (issue.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(issue.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (numberOrZero(issue.quantityConsumed) > 0 || numberOrZero(issue.quantityReturned) > 0 || numberOrZero(issue.quantityScrapped) > 0) throw new Error('PART_ISSUE_ALREADY_SETTLED');
    if (issue.status === 'CANCELLED') return { issueId, status: 'CANCELLED', idempotentReplay: true };
    const partRef = db.collection('spareParts').doc(issue.partId);
    const lotRef = issue.lotId ? db.collection('sparePartLots').doc(issue.lotId) : null;
    const stockSnap = await transaction.get(lotRef || partRef);
    const aggregatePartSnap = lotRef ? await transaction.get(partRef) : null;
    if (!stockSnap.exists || (lotRef && !aggregatePartSnap?.exists)) throw new Error('SPARE_PART_STOCK_RECORD_NOT_FOUND');
    const quantity = numberOrZero(issue.quantityIssued);
    const now = new Date().toISOString();
    const movementId = randomId('SPM');
    transaction.update(lotRef || partRef, { stockQuantity: numberOrZero(stockSnap.data()?.stockQuantity) + quantity, updatedAt: FieldValue.serverTimestamp() });
    if (lotRef) {
      transaction.update(partRef, { stockQuantity: numberOrZero(aggregatePartSnap!.data()?.stockQuantity) + quantity, updatedAt: FieldValue.serverTimestamp() });
    }
    transaction.update(issueRef, { status: 'CANCELLED', cancellationReason: input.reason.trim(), cancelledByUid: actor.uid, cancelledAt: now, updatedAt: now });
    transaction.set(db.collection('sparePartMovements').doc(movementId), {
      id: movementId, movementType: 'REVERSAL', reversesMovementType: 'ISSUE', partId: issue.partId,
      lotId: issue.lotId || null, warehouseId: issue.warehouseId, branchId: issue.branchId, quantity,
      unitCostSnapshot: issue.unitCostSnapshot, sourceType: 'WORK_ORDER', sourceId: workOrderId, issueId,
      actorUid: actor.uid, reason: input.reason.trim(), occurredAt: now, createdAt: now
    });
    transaction.set(idemRef, { scope: 'PART_CANCEL', workOrderId, issueId, createdAt: now });
    return { issueId, status: 'CANCELLED' };
  });
}

export async function processAddTechnicalExternalCost(
  db: Firestore,
  workOrderId: string,
  input: {
    category: 'OUTSOURCED_REPAIR' | 'TRANSPORT' | 'MATERIAL' | 'OTHER';
    supplierId?: string;
    amount: number;
    invoiceUrl?: string;
    note: string;
    capitalizeToDevice?: boolean;
    idempotencyKey: string;
  },
  actor: TechnicalCostActor
): Promise<{ cost: any; idempotentReplay?: boolean }> {
  const amount = numberOrZero(input.amount);
  if (amount <= 0 || !input.note?.trim() || !['OUTSOURCED_REPAIR', 'TRANSPORT', 'MATERIAL', 'OTHER'].includes(input.category)) throw new Error('EXTERNAL_COST_DATA_INVALID');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`EXTERNAL_COST:${workOrderId}`, key));
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const costSnap = await transaction.get(db.collection('technicalExternalCosts').doc(idemSnap.data()!.costId));
      if (!costSnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { cost: publicIssue(costSnap.data()), idempotentReplay: true };
    }
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const workOrder = woSnap.data()!;
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!isElevated(actor) && !canViewTechnicalCost(actor) && workOrder.currentCustodianUid !== actor.uid && workOrder.assignedTechnicianUid !== actor.uid) {
      throw new Error('TECHNICIAN_NOT_ASSIGNED');
    }
    if (!ACTIVE_COST_WORK_ORDER_STATUSES.has(String(workOrder.status))) throw new Error('WORK_ORDER_NOT_OPEN_FOR_COSTS');
    const now = new Date().toISOString();
    const costId = randomId('TEC');
    const cost = {
      id: costId,
      workOrderId,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      category: input.category,
      supplierId: input.supplierId || null,
      amount,
      invoiceUrl: input.invoiceUrl || null,
      note: input.note.trim(),
      capitalizeToDevice: input.capitalizeToDevice !== false,
      approvalStatus: isElevated(actor) ? 'APPROVED' : 'PENDING',
      requestedByUid: actor.uid,
      approvedByUid: isElevated(actor) ? actor.uid : null,
      createdAt: now,
      updatedAt: now
    };
    transaction.set(db.collection('technicalExternalCosts').doc(costId), cost);
    transaction.set(idemRef, { scope: 'EXTERNAL_COST', workOrderId, costId, createdAt: now });
    return { cost: publicIssue(cost) };
  });
}

export async function processApproveTechnicalExternalCost(
  db: Firestore,
  workOrderId: string,
  costId: string,
  decision: 'APPROVED' | 'REJECTED',
  actor: TechnicalCostActor
): Promise<{ costId: string; approvalStatus: string }> {
  if (!canViewTechnicalCost(actor)) throw new Error('EXTERNAL_COST_APPROVAL_FORBIDDEN');
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new Error('EXTERNAL_COST_DECISION_INVALID');
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const costRef = db.collection('technicalExternalCosts').doc(costId);
  return db.runTransaction(async transaction => {
    const woSnap = await transaction.get(woRef);
    const costSnap = await transaction.get(costRef);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!costSnap.exists) throw new Error('EXTERNAL_COST_NOT_FOUND');
    const workOrder = woSnap.data()!;
    const cost = costSnap.data()!;
    if (cost.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (cost.approvalStatus !== 'PENDING') throw new Error('EXTERNAL_COST_ALREADY_DECIDED');
    transaction.update(costRef, { approvalStatus: decision, approvedByUid: actor.uid, approvedAt: new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() });
    return { costId, approvalStatus: decision };
  });
}

export async function processAddTechnicalRecovery(
  db: Firestore,
  workOrderId: string,
  input: {
    category: 'SUPPLIER_RECOVERY' | 'WARRANTY_COMPENSATION' | 'OTHER';
    supplierId?: string;
    amount: number;
    note: string;
    evidenceUrl?: string;
    idempotencyKey: string;
  },
  actor: TechnicalCostActor
): Promise<{ recovery: any; idempotentReplay?: boolean }> {
  const amount = numberOrZero(input.amount);
  if (amount <= 0 || !input.note?.trim() || !['SUPPLIER_RECOVERY', 'WARRANTY_COMPENSATION', 'OTHER'].includes(input.category)) throw new Error('RECOVERY_DATA_INVALID');
  const key = assertIdempotencyKey(input.idempotencyKey);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`RECOVERY:${workOrderId}`, key));
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const recoverySnap = await transaction.get(db.collection('technicalRecoveries').doc(idemSnap.data()!.recoveryId));
      if (!recoverySnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { recovery: publicIssue(recoverySnap.data()), idempotentReplay: true };
    }
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const workOrder = woSnap.data()!;
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!isElevated(actor) && !canViewTechnicalCost(actor) && workOrder.currentCustodianUid !== actor.uid && workOrder.assignedTechnicianUid !== actor.uid) {
      throw new Error('TECHNICIAN_NOT_ASSIGNED');
    }
    if (!ACTIVE_COST_WORK_ORDER_STATUSES.has(String(workOrder.status))) throw new Error('WORK_ORDER_NOT_OPEN_FOR_RECOVERY');
    const now = new Date().toISOString();
    const recoveryId = randomId('TRC');
    const mayApprove = canViewTechnicalCost(actor);
    const recovery = {
      id: recoveryId,
      workOrderId,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      category: input.category,
      supplierId: input.supplierId || null,
      amount,
      note: input.note.trim(),
      evidenceUrl: input.evidenceUrl || null,
      approvalStatus: mayApprove ? 'APPROVED' : 'PENDING',
      requestedByUid: actor.uid,
      approvedByUid: mayApprove ? actor.uid : null,
      createdAt: now,
      updatedAt: now
    };
    transaction.set(db.collection('technicalRecoveries').doc(recoveryId), recovery);
    transaction.set(idemRef, { scope: 'RECOVERY', workOrderId, recoveryId, createdAt: now });
    return { recovery: publicIssue(recovery) };
  });
}

export async function processApproveTechnicalRecovery(
  db: Firestore,
  workOrderId: string,
  recoveryId: string,
  decision: 'APPROVED' | 'REJECTED',
  actor: TechnicalCostActor
): Promise<{ recoveryId: string; approvalStatus: string }> {
  if (!canViewTechnicalCost(actor)) throw new Error('RECOVERY_APPROVAL_FORBIDDEN');
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new Error('RECOVERY_DECISION_INVALID');
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const recoveryRef = db.collection('technicalRecoveries').doc(recoveryId);
  return db.runTransaction(async transaction => {
    const woSnap = await transaction.get(woRef);
    const recoverySnap = await transaction.get(recoveryRef);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!recoverySnap.exists) throw new Error('RECOVERY_NOT_FOUND');
    const workOrder = woSnap.data()!;
    const recovery = recoverySnap.data()!;
    if (recovery.workOrderId !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (recovery.approvalStatus !== 'PENDING') throw new Error('RECOVERY_ALREADY_DECIDED');
    transaction.update(recoveryRef, { approvalStatus: decision, approvedByUid: actor.uid, approvedAt: new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() });
    return { recoveryId, approvalStatus: decision };
  });
}

export async function processFinalizeTechnicalCost(
  db: Firestore,
  workOrderId: string,
  idempotencyKeyInput: string,
  actor: TechnicalCostActor
): Promise<{ postingId: string; breakdown: TechnicalCostBreakdown; idempotentReplay?: boolean }> {
  const key = assertIdempotencyKey(idempotencyKeyInput);
  if (!canViewTechnicalCost(actor)) throw new Error('COST_POSTING_FORBIDDEN');
  const postingRef = db.collection('technicalCostPostings').doc(workOrderId);
  const idemRef = db.collection('technicalOperationIdempotency').doc(idempotencyId(`FINALIZE_COST:${workOrderId}`, key));
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    const existingPosting = await transaction.get(postingRef);
    if (idemSnap.exists || existingPosting.exists) {
      if (!existingPosting.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      const data = existingPosting.data()!;
      return { postingId: existingPosting.id, breakdown: data.breakdown, idempotentReplay: true };
    }
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const workOrder = woSnap.data()!;
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    const companyOwned = workOrder.assetOwnership === 'COMPANY' || INTERNAL_ASSET_TYPES.has(String(workOrder.workOrderType));
    if (!companyOwned) throw new Error('CUSTOMER_DEVICE_COST_POSTING_FORBIDDEN');
    if (workOrder.status !== 'QC_PASSED') throw new Error('QC_PASS_REQUIRED_FOR_COST_POSTING');
    if (!workOrder.deviceId) throw new Error('WORK_ORDER_DEVICE_REQUIRED');

    const deviceRef = db.collection('devices').doc(workOrder.deviceId);
    const financialRef = db.collection('deviceFinancials').doc(workOrder.deviceId);
    const deviceSnap = await transaction.get(deviceRef);
    const financialSnap = await transaction.get(financialRef);
    const linesSnap = await transaction.get(db.collection('technicalWorkOrderLines').where('workOrderId', '==', workOrderId));
    const issuesSnap = await transaction.get(db.collection('technicalPartIssues').where('workOrderId', '==', workOrderId));
    const reservationsSnap = await transaction.get(db.collection('technicalPartReservations').where('workOrderId', '==', workOrderId));
    const externalSnap = await transaction.get(db.collection('technicalExternalCosts').where('workOrderId', '==', workOrderId));
    const recoverySnap = await transaction.get(db.collection('technicalRecoveries').where('workOrderId', '==', workOrderId));
    if (!deviceSnap.exists) throw new Error('DEVICE_NOT_FOUND');

    const device = deviceSnap.data()!;
    const financial = financialSnap.exists ? financialSnap.data()! : null;
    const lines: any[] = linesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    const issues: any[] = issuesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    const reservations: any[] = reservationsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    const externalCosts: any[] = externalSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    const recoveries: any[] = recoverySnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    if (lines.some(line => line.status !== 'VERIFIED')) throw new Error('ALL_TASKS_MUST_BE_VERIFIED');
    if (issues.some(issue => issue.status !== 'CANCELLED' && numberOrZero(issue.quantityIssued) !== numberOrZero(issue.quantityConsumed) + numberOrZero(issue.quantityReturned) + numberOrZero(issue.quantityScrapped))) {
      throw new Error('PART_ISSUES_NOT_SETTLED');
    }
    if (reservations.some(reservation => numberOrZero(reservation.quantityReserved) !== numberOrZero(reservation.quantityIssued) + numberOrZero(reservation.quantityCancelled))) {
      throw new Error('PART_RESERVATIONS_NOT_SETTLED');
    }
    if (externalCosts.some(cost => cost.approvalStatus === 'PENDING')) throw new Error('EXTERNAL_COSTS_PENDING_APPROVAL');
    if (recoveries.some(recovery => recovery.approvalStatus === 'PENDING')) throw new Error('RECOVERIES_PENDING_APPROVAL');

    const currentCost = numberOrZero(financial?.currentCost ?? device.currentCost ?? device.buyPrice);
    const currentVersion = String(financial?.costVersion || device.costVersion || 'LEGACY_CURRENT_COST_V1');
    const expectedOpeningCost = workOrder.openingDeviceCost == null ? currentCost : numberOrZero(workOrder.openingDeviceCost);
    const expectedVersion = String(workOrder.openingCostVersion || currentVersion);
    if (Math.abs(currentCost - expectedOpeningCost) > 0.5 || currentVersion !== expectedVersion) throw new Error('DEVICE_COST_VERSION_CONFLICT');

    const breakdown = calculateTechnicalCostBreakdown({
      openingDeviceCost: expectedOpeningCost,
      partIssues: issues,
      taskLines: lines,
      externalCosts,
      recoveries
    });
    const now = new Date().toISOString();
    const calculationHash = crypto.createHash('sha256').update(JSON.stringify({ workOrderId, currentVersion, breakdown, issueIds: issues.map(item => item.id), lineIds: lines.map(item => item.id), externalIds: externalCosts.map(item => item.id), recoveryIds: recoveries.map(item => item.id) })).digest('hex');
    const costVersion = `TECH_COST_V2:${workOrderId}:${calculationHash.slice(0, 12)}`;
    const eventId = randomId('DCE');
    const posting = {
      id: workOrderId,
      workOrderId,
      deviceId: workOrder.deviceId,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      openingCostVersion: currentVersion,
      closingCostVersion: costVersion,
      calculationHash,
      breakdown,
      status: 'POSTED',
      postedByUid: actor.uid,
      postedAt: now,
      createdAt: now
    };

    transaction.set(postingRef, posting);
    transaction.set(db.collection('deviceCostEvents').doc(eventId), {
      id: eventId,
      deviceId: workOrder.deviceId,
      imei: workOrder.imei,
      eventType: 'WORK_ORDER_COST_POSTED',
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      costBefore: breakdown.openingDeviceCost,
      amount: breakdown.totalActualCost,
      costAfter: breakdown.closingDeviceCost,
      breakdown,
      costVersion,
      createdByUid: actor.uid,
      createdAt: now
    });
    transaction.set(financialRef, {
      deviceId: workOrder.deviceId,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      acquisitionCost: numberOrZero(financial?.acquisitionCost ?? device.buyPrice ?? breakdown.openingDeviceCost),
      technicalAddedCost: numberOrZero(financial?.technicalAddedCost) + breakdown.totalActualCost,
      currentCost: breakdown.closingDeviceCost,
      costVersion,
      calculatedAt: now,
      updatedAt: now
    }, { merge: true });
    // Compatibility projection until every inventory/report reader consumes deviceFinancials.
    transaction.update(deviceRef, { currentCost: breakdown.closingDeviceCost, costVersion, costCalculatedAt: now, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(woRef, {
      ...breakdown,
      costPostingStatus: 'POSTED',
      costPostingId: workOrderId,
      costCalculationHash: calculationHash,
      costPostedAt: now,
      costPostedByUid: actor.uid,
      updatedAt: FieldValue.serverTimestamp()
    });
    transaction.set(idemRef, { scope: 'FINALIZE_COST', workOrderId, postingId: workOrderId, createdAt: now });
    return { postingId: workOrderId, breakdown };
  });
}

export async function getTechnicalCostBreakdown(db: Firestore, workOrderId: string, actor: TechnicalCostActor): Promise<any> {
  const woSnap = await db.collection('technicalWorkOrders').doc(workOrderId).get();
  if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
  const workOrder = woSnap.data()!;
  if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
  const [linesSnap, issuesSnap, reservationsSnap, externalSnap, recoverySnap, postingSnap, qcSnap, movementBySourceSnap, movementByWorkOrderSnap, costEventsSnap] = await Promise.all([
    db.collection('technicalWorkOrderLines').where('workOrderId', '==', workOrderId).get(),
    db.collection('technicalPartIssues').where('workOrderId', '==', workOrderId).get(),
    db.collection('technicalPartReservations').where('workOrderId', '==', workOrderId).get(),
    db.collection('technicalExternalCosts').where('workOrderId', '==', workOrderId).get(),
    db.collection('technicalRecoveries').where('workOrderId', '==', workOrderId).get(),
    db.collection('technicalCostPostings').doc(workOrderId).get(),
    db.collection('qcInspections').where('workOrderId', '==', workOrderId).get(),
    db.collection('inventoryMovements').where('sourceId', '==', workOrderId).get(),
    db.collection('inventoryMovements').where('workOrderId', '==', workOrderId).get(),
    db.collection('deviceCostEvents').where('sourceId', '==', workOrderId).get()
  ]);
  const taskLines: any[] = linesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const partIssues: any[] = issuesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const partReservations: any[] = reservationsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const externalCosts: any[] = externalSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const recoveries: any[] = recoverySnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const openingDeviceCost = numberOrZero(workOrder.openingDeviceCost ?? postingSnap.data()?.breakdown?.openingDeviceCost);
  const mayViewCost = canViewTechnicalCost(actor);
  const role = normalizedRole(actor);
  const mayReviewAnyWorkOrder = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECH_LEAD', 'INVENTORY_MANAGER'].includes(role);
  const isAssigned = taskLines.some(line => line.assigneeUid === actor.uid) || workOrder.currentCustodianUid === actor.uid;
  if (!mayReviewAnyWorkOrder && !isAssigned) throw new Error('WORK_ORDER_ACCESS_FORBIDDEN');
  const preview = postingSnap.exists ? postingSnap.data()!.breakdown : calculateTechnicalCostBreakdown({ openingDeviceCost, partIssues, taskLines, externalCosts, recoveries });
  const qcInspections: any[] = qcSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const movementMap = new Map<string, any>();
  [...movementBySourceSnap.docs, ...movementByWorkOrderSnap.docs].forEach(doc => movementMap.set(doc.id, { id: doc.id, ...doc.data() }));
  const costEvents: any[] = costEventsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
  const eventTime = (value: any): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    return '';
  };
  const timeline = [
    { id: `WO_CREATED_${workOrderId}`, type: 'WORK_ORDER_CREATED', title: 'Tạo phiếu kỹ thuật', occurredAt: eventTime(workOrder.createdAt), actorName: workOrder.createdByName || null },
    ...[...movementMap.values()].map(movement => ({ id: movement.id, type: movement.movementType, title: `Di chuyển: ${movement.movementType}`, occurredAt: eventTime(movement.occurredAt || movement.createdAt), actorUid: movement.performedByUid || null, fromLocationId: movement.fromLocationId || null, toLocationId: movement.toLocationId || null })),
    ...taskLines.flatMap(line => [
      line.startedAt ? { id: `${line.id}_STARTED`, type: 'TASK_STARTED', title: `Bắt đầu: ${line.taskName}`, occurredAt: eventTime(line.startedAt), actorUid: line.assigneeUid, actorName: line.assigneeName } : null,
      line.completedAt ? { id: `${line.id}_COMPLETED`, type: 'TASK_COMPLETED', title: `Hoàn thành: ${line.taskName}`, occurredAt: eventTime(line.completedAt), actorUid: line.assigneeUid, actorName: line.assigneeName } : null,
      line.qcVerifiedAt ? { id: `${line.id}_VERIFIED`, type: 'TASK_VERIFIED', title: `KCS xác nhận: ${line.taskName}`, occurredAt: eventTime(line.qcVerifiedAt) } : null
    ]),
    ...partIssues.map(issue => ({ id: issue.id, type: 'PART_ISSUE', title: `Linh kiện: ${issue.partName}`, occurredAt: eventTime(issue.issuedAt || issue.createdAt), actorUid: issue.issuedByUid || null, status: issue.status })),
    ...partReservations.map(reservation => ({ id: reservation.id, type: 'PART_RESERVATION', title: `Giữ linh kiện: ${reservation.partName}`, occurredAt: eventTime(reservation.reservedAt || reservation.createdAt), actorUid: reservation.reservedByUid || null, status: reservation.status })),
    ...qcInspections.map(inspection => ({ id: inspection.id, type: 'QC_INSPECTION', title: `KCS ${inspection.overallResult}`, occurredAt: eventTime(inspection.inspectedAt || inspection.createdAt), actorUid: inspection.inspectorUid || null, actorName: inspection.inspectorName || null, status: inspection.overallResult })),
    ...(mayViewCost ? costEvents.map(event => ({ id: event.id, type: event.eventType, title: 'Kết chuyển giá vốn', occurredAt: eventTime(event.createdAt), actorUid: event.createdByUid || null, amount: event.amount, costAfter: event.costAfter })) : [])
  ].filter((event): event is any => !!event && !!event.occurredAt)
    .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)));
  const visibleIssues = partIssues.map(issue => mayViewCost ? issue : ({
    id: issue.id, workOrderId: issue.workOrderId, workOrderLineId: issue.workOrderLineId,
    partId: issue.partId, sku: issue.sku, partName: issue.partName, warehouseId: issue.warehouseId,
    quantityIssued: issue.quantityIssued, quantityConsumed: issue.quantityConsumed,
    quantityReturned: issue.quantityReturned, quantityScrapped: issue.quantityScrapped,
    status: issue.status, issuedAt: issue.issuedAt
  }));
  const visibleWorkOrder = mayViewCost ? workOrder : (() => {
    const {
      openingDeviceCost: _openingDeviceCost,
      openingCostVersion: _openingCostVersion,
      totalEstimatedCost: _totalEstimatedCost,
      totalActualCost: _totalActualCost,
      totalCommissionAmount: _totalCommissionAmount,
      partsCost: _partsCost,
      laborCost: _laborCost,
      externalCost: _externalCost,
      otherCost: _otherCost,
      recoveryAmount: _recoveryAmount,
      closingDeviceCost: _closingDeviceCost,
      costCalculationHash: _costCalculationHash,
      ...operational
    } = workOrder;
    return operational;
  })();
  const visibleTaskLines = taskLines.map(line => {
    if (mayViewCost) return line;
    const {
      laborCostToDevice: _laborCostToDevice,
      capitalizeLaborCost: _capitalizeLaborCost,
      commissionAmount: hiddenCommissionAmount,
      ...operational
    } = line;
    return line.assigneeUid === actor.uid ? { ...operational, commissionAmount: hiddenCommissionAmount } : operational;
  });
  return {
    workOrder: publicIssue(visibleWorkOrder),
    taskLines: publicIssue(visibleTaskLines),
    partIssues: publicIssue(visibleIssues),
    partReservations: publicIssue(partReservations),
    externalCosts: mayViewCost ? publicIssue(externalCosts) : [],
    recoveries: mayViewCost ? publicIssue(recoveries) : [],
    qcInspections: publicIssue(qcInspections),
    timeline: publicIssue(timeline),
    breakdown: mayViewCost ? preview : null,
    canViewCost: mayViewCost,
    costPostingStatus: workOrder.costPostingStatus || 'NOT_READY'
  };
}

export async function listTechnicalSpareParts(db: Firestore, actor: TechnicalCostActor, warehouseId?: string): Promise<any[]> {
  let docs: any[] = [];
  let lotDocs: any[] = [];
  const role = normalizedRole(actor);
  if (role === 'ADMIN' || role === 'REGIONAL_MANAGER') {
    const [partSnap, lotSnap] = await Promise.all([
      db.collection('spareParts').limit(500).get(),
      warehouseId
        ? db.collection('sparePartLots').where('warehouseId', '==', warehouseId).limit(1000).get()
        : db.collection('sparePartLots').limit(1500).get()
    ]);
    docs = partSnap.docs;
    lotDocs = lotSnap.docs;
  } else {
    const branchIds = [...new Set([actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean))] as string[];
    const [snapshots, lotSnapshots] = await Promise.all([
      Promise.all(branchIds.map(branchId => db.collection('spareParts').where('branchId', '==', branchId).limit(300).get())),
      Promise.all(branchIds.map(branchId => db.collection('sparePartLots').where('branchId', '==', branchId).limit(600).get()))
    ]);
    const byId = new Map<string, any>();
    snapshots.forEach(snapshot => snapshot.docs.forEach(doc => byId.set(doc.id, doc)));
    docs = [...byId.values()];
    const lotsById = new Map<string, any>();
    lotSnapshots.forEach(snapshot => snapshot.docs.forEach(doc => lotsById.set(doc.id, doc)));
    lotDocs = [...lotsById.values()];
  }
  const mayViewCost = canViewTechnicalCost(actor);
  const lotsByPartId = new Map<string, any[]>();
  lotDocs
    .map(doc => ({ id: doc.id, ...doc.data() } as any))
    .filter(lot => !warehouseId || lot.warehouseId === warehouseId)
    .forEach(lot => {
      const visibleLot: any = {
        id: lot.id,
        lotCode: lot.lotCode || lot.id,
        partId: lot.partId,
        branchId: lot.branchId || null,
        warehouseId: lot.warehouseId || null,
        stockQuantity: Number(lot.stockQuantity || 0),
        reservedQuantity: Number(lot.reservedQuantity || 0),
        availableQuantity: Math.max(0, Number(lot.stockQuantity || 0) - Number(lot.reservedQuantity || 0)),
        supplierId: lot.supplierId || null,
        receivedAt: lot.receivedAt || null
      };
      if (mayViewCost) visibleLot.unitCost = Number(lot.unitCost || 0);
      lotsByPartId.set(String(lot.partId || ''), [...(lotsByPartId.get(String(lot.partId || '')) || []), visibleLot]);
    });
  return docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(part => !warehouseId || part.warehouseId === warehouseId)
    .map(part => {
      const visible: any = {
        id: part.id,
        sku: part.sku || part.id,
        name: part.name || part.id,
        category: part.category || 'KHAC',
        branchId: part.branchId || null,
        warehouseId: part.warehouseId || null,
        stockQuantity: Number(part.stockQuantity || 0),
        reservedQuantity: Number(part.reservedQuantity || 0),
        availableQuantity: Math.max(0, Number(part.stockQuantity || 0) - Number(part.reservedQuantity || 0)),
        compatibleModels: Array.isArray(part.compatibleModels) ? part.compatibleModels : [],
        lots: (lotsByPartId.get(part.id) || []).sort((left, right) => String(left.receivedAt || '').localeCompare(String(right.receivedAt || '')))
      };
      if (mayViewCost) visible.currentCost = Number(part.currentAverageCost ?? part.costPrice ?? 0);
      return visible;
    });
}
