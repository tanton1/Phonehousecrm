import crypto from 'crypto';
import { FieldPath, FieldValue, Firestore } from 'firebase-admin/firestore';
import { parseVnd } from '../utils/financeIntegrity';

export interface InventoryActor {
  uid: string;
  name?: string;
  role?: string;
  branchId?: string;
  assignedBranchIds?: string[];
}

export interface InventoryDeviceDraft {
  id?: string;
  imei: string;
  serialNo?: string;
  model: string;
  storage?: string;
  color?: string;
  region?: string;
  batteryHealth?: number;
  condition?: string;
  buyPrice: number;
  sellPrice?: number;
  supplier?: string;
  supplierId?: string;
  receivedDate?: string;
  warrantyPeriodMonths?: number;
  icloudStatus?: string;
  screenStatus?: string;
  notes?: string;
  images?: string[];
  imageUrl?: string;
  batchCode?: string;
}

export interface ImportInventoryDevicesInput {
  branchId: string;
  locationId: string;
  sourceType: 'PURCHASE_ORDER' | 'TRADE_IN' | 'MANUAL_IMPORT' | 'POS_TRADE_IN' | 'DATA_MIGRATION';
  sourceId: string;
  idempotencyKey: string;
  devices: InventoryDeviceDraft[];
}

const TERMINAL_TRANSFER_STATES = new Set(['COMPLETED', 'CANCELLED', 'RETURNED_TO_MAIN_WAREHOUSE']);
const TERMINAL_WORK_ORDER_STATES = new Set(['RETURNED_TO_STOCK', 'DELIVERED_TO_CUSTOMER', 'CANCELLED']);

export function normalizeImei(value: unknown): string {
  return String(value || '').replace(/[\s.-]/g, '').toUpperCase();
}

export function imeiRegistryId(imei: string): string {
  return crypto.createHash('sha256').update(normalizeImei(imei)).digest('hex');
}

function canAccessBranch(actor: InventoryActor, branchId: string): boolean {
  const role = String(actor.role || '').toUpperCase();
  return role === 'ADMIN' || role === 'REGIONAL_MANAGER' || actor.branchId === branchId || (actor.assignedBranchIds || []).includes(branchId);
}

function assertImportInput(input: ImportInventoryDevicesInput, actor: InventoryActor) {
  if (!input.branchId || !input.locationId) throw new Error('INVENTORY_DESTINATION_REQUIRED');
  if (!canAccessBranch(actor, input.branchId)) throw new Error('INVENTORY_BRANCH_FORBIDDEN');
  if (!input.sourceId || !input.sourceType) throw new Error('INVENTORY_SOURCE_REQUIRED');
  const actorRole = String(actor.role || '').toUpperCase();
  if (!['MANUAL_IMPORT', 'DATA_MIGRATION'].includes(String(input.sourceType || ''))) {
    throw new Error('INVENTORY_IMPORT_SOURCE_FORBIDDEN: Phiếu mua hàng và thu cũ phải đi qua luồng chứng từ chuẩn.');
  }
  if (input.sourceType === 'DATA_MIGRATION' && actorRole !== 'ADMIN') {
    throw new Error('INVENTORY_DATA_MIGRATION_ADMIN_REQUIRED');
  }
  if (!['ADMIN', 'INVENTORY_MANAGER'].includes(actorRole)) {
    throw new Error('INVENTORY_MANUAL_IMPORT_ROLE_FORBIDDEN');
  }
  if (!input.idempotencyKey || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 160) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  if (!Array.isArray(input.devices) || input.devices.length === 0 || input.devices.length > 100) throw new Error('INVENTORY_DEVICE_COUNT_INVALID');
  const normalizedImeis = input.devices.map(device => normalizeImei(device.imei));
  if (normalizedImeis.some(imei => !/^\d{5,15}$/.test(imei))) throw new Error('IMEI_INVALID: Mã IMEI/Serial phải gồm từ 5 đến 15 chữ số.');
  if (new Set(normalizedImeis).size !== normalizedImeis.length) throw new Error('DUPLICATE_IMEI_IN_REQUEST');
  input.devices.forEach(device => {
    if (!device.model?.trim()) throw new Error(`DEVICE_MODEL_REQUIRED: ${device.imei}`);
    try {
      parseVnd(device.buyPrice, { allowZero: true, field: 'DEVICE_COST' });
      parseVnd(device.sellPrice ?? device.buyPrice, { allowZero: true, field: 'DEVICE_SELL_PRICE' });
    } catch {
      throw new Error(`DEVICE_COST_INVALID: ${device.imei}`);
    }
  });
}

function idempotencyId(input: ImportInventoryDevicesInput): string {
  return crypto.createHash('sha256').update(`IMPORT_DEVICES:${input.idempotencyKey}`).digest('hex');
}

function importPayloadHash(input: ImportInventoryDevicesInput): string {
  return crypto.createHash('sha256').update(JSON.stringify({
    branchId: input.branchId,
    locationId: input.locationId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    devices: input.devices.map(device => ({
      id: device.id || null,
      imei: normalizeImei(device.imei),
      model: device.model?.trim(),
      buyPrice: Number(device.buyPrice),
      sellPrice: Number(device.sellPrice ?? device.buyPrice)
    }))
  })).digest('hex');
}

export async function processImportInventoryDevices(
  db: Firestore,
  input: ImportInventoryDevicesInput,
  actor: InventoryActor
): Promise<{ devices: any[]; importedCount: number; idempotentReplay?: boolean }> {
  assertImportInput(input, actor);
  const normalizedImeis = input.devices.map(device => normalizeImei(device.imei));
  const idemRef = db.collection('inventoryDeviceIdempotency').doc(idempotencyId(input));
  const payloadHash = importPayloadHash(input);

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      if (idemSnap.data()?.payloadHash && idemSnap.data()?.payloadHash !== payloadHash) throw new Error('IDEMPOTENCY_PAYLOAD_MISMATCH');
      const ids: string[] = idemSnap.data()?.deviceIds || [];
      const snapshots = [];
      for (const id of ids) snapshots.push(await transaction.get(db.collection('devices').doc(id)));
      return { devices: snapshots.filter(snapshot => snapshot.exists).map(snapshot => ({ id: snapshot.id, ...snapshot.data() })), importedCount: ids.length, idempotentReplay: true };
    }

    const locationRef = db.collection('warehouses').doc(input.locationId);
    const locationSnap = await transaction.get(locationRef);
    if (!locationSnap.exists || locationSnap.data()?.isActive === false) throw new Error('INVENTORY_LOCATION_NOT_FOUND_OR_INACTIVE');
    const location = locationSnap.data()!;
    if (String(location.branchId || '') !== input.branchId) throw new Error('INVENTORY_LOCATION_BRANCH_MISMATCH');

    const registrySnapshots = [];
    const deviceIdSnapshots = [];
    const normalizedQueries = [];
    const legacyQueries = [];
    for (let index = 0; index < normalizedImeis.length; index++) {
      const generatedId = `DEV_${imeiRegistryId(normalizedImeis[index]).slice(0, 20).toUpperCase()}`;
      deviceIdSnapshots.push(await transaction.get(db.collection('devices').doc(String(input.devices[index].id || generatedId))));
      registrySnapshots.push(await transaction.get(db.collection('imeiRegistry').doc(imeiRegistryId(normalizedImeis[index]))));
      normalizedQueries.push(await transaction.get(db.collection('devices').where('imeiNormalized', '==', normalizedImeis[index]).limit(1)));
      legacyQueries.push(await transaction.get(db.collection('devices').where('imei', '==', input.devices[index].imei).limit(1)));
    }

    for (let index = 0; index < normalizedImeis.length; index++) {
      if (deviceIdSnapshots[index].exists) throw new Error(`DEVICE_ID_ALREADY_EXISTS: ${deviceIdSnapshots[index].id}`);
      if (registrySnapshots[index].exists || !normalizedQueries[index].empty || !legacyQueries[index].empty) {
        throw new Error(`IMEI_ALREADY_EXISTS: ${normalizedImeis[index]}`);
      }
    }

    const now = new Date().toISOString();
    const createdDevices: any[] = [];
    const deviceIds: string[] = [];
    for (let index = 0; index < input.devices.length; index++) {
      const draft = input.devices[index];
      const normalizedImei = normalizedImeis[index];
      const generatedId = `DEV_${imeiRegistryId(normalizedImei).slice(0, 20).toUpperCase()}`;
      const deviceId = String(draft.id || generatedId);
      const deviceRef = db.collection('devices').doc(deviceId);
      const registryRef = db.collection('imeiRegistry').doc(imeiRegistryId(normalizedImei));
      const currentCost = Number(draft.buyPrice);
      const device = {
        id: deviceId,
        imei: normalizedImei,
        imeiNormalized: normalizedImei,
        serialNo: draft.serialNo || normalizedImei,
        model: draft.model.trim(),
        storage: draft.storage || '',
        color: draft.color || '',
        region: draft.region || '',
        batteryHealth: Number(draft.batteryHealth ?? 100),
        condition: draft.condition || 'Like New 99%',
        buyPrice: currentCost,
        currentCost,
        costVersion: `${input.sourceType}_V1`,
        costCalculatedAt: now,
        sellPrice: Number(draft.sellPrice ?? currentCost),
        status: 'in_stock',
        branchId: input.branchId,
        currentLocationId: input.locationId,
        warehouseId: input.locationId,
        warehouse: input.locationId,
        supplier: draft.supplier || '',
        supplierId: draft.supplierId || null,
        receivedDate: draft.receivedDate || now.slice(0, 10),
        warrantyPeriodMonths: Number(draft.warrantyPeriodMonths ?? 12),
        icloudStatus: draft.icloudStatus || 'Chưa Check',
        screenStatus: draft.screenStatus || 'Trầy Phẩy',
        notes: draft.notes || '',
        images: draft.images || [],
        imageUrl: draft.imageUrl || null,
        batchCode: draft.batchCode || null,
        inventorySourceType: input.sourceType,
        inventorySourceId: input.sourceId,
        stateVersion: 1,
        createdAt: now,
        updatedAt: now
      };
      transaction.set(deviceRef, device);
      transaction.set(db.collection('deviceFinancials').doc(deviceId), {
        deviceId,
        imei: normalizedImei,
        branchId: input.branchId,
        acquisitionCost: currentCost,
        technicalAddedCost: 0,
        currentCost,
        costVersion: `${input.sourceType}_V1`,
        calculatedAt: now,
        createdAt: now,
        updatedAt: now
      });
      transaction.set(db.collection('deviceCostEvents').doc(`DCE_ACQ_${deviceId}`), {
        id: `DCE_ACQ_${deviceId}`,
        deviceId,
        imei: normalizedImei,
        branchId: input.branchId,
        eventType: 'ACQUISITION',
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        costBefore: 0,
        amount: currentCost,
        costAfter: currentCost,
        costVersion: `${input.sourceType}_V1`,
        createdByUid: actor.uid,
        createdAt: now
      });
      transaction.set(registryRef, { imei: normalizedImei, deviceId, branchId: input.branchId, createdAt: now, createdByUid: actor.uid });
      const movementId = `MOV_STOCK_IN_${Date.now()}_${index + 1}_${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      transaction.set(db.collection('inventoryMovements').doc(movementId), {
        id: movementId,
        deviceId,
        imei: normalizedImei,
        branchId: input.branchId,
        movementType: 'STOCK_RECEIPT',
        fromLocationId: null,
        toLocationId: input.locationId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        performedByUid: actor.uid,
        occurredAt: now,
        createdAt: FieldValue.serverTimestamp()
      });
      createdDevices.push(device);
      deviceIds.push(deviceId);
    }
    transaction.set(idemRef, { key: input.idempotencyKey, payloadHash, sourceType: input.sourceType, sourceId: input.sourceId, deviceIds, createdAt: now });
    return { devices: createdDevices, importedCount: createdDevices.length };
  });
}

export async function processUpdateInventoryDeviceMetadata(
  db: Firestore,
  deviceId: string,
  input: Record<string, any>,
  actor: InventoryActor
): Promise<any> {
  if (!deviceId) throw new Error('DEVICE_ID_REQUIRED');
  const deviceRef = db.collection('devices').doc(deviceId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(deviceRef);
    if (!snapshot.exists) throw new Error('DEVICE_NOT_FOUND');
    const current = snapshot.data()!;
    if (!canAccessBranch(actor, String(current.branchId || ''))) throw new Error('INVENTORY_BRANCH_FORBIDDEN');
    const numberOrCurrent = (value: unknown, fallback: number, min: number, max: number) => {
      if (value === '' || value == null) return fallback;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error('DEVICE_METADATA_NUMBER_INVALID');
      return parsed;
    };
    const text = (value: unknown, fallback: string, max = 500) => value == null ? fallback : String(value).trim().slice(0, max);
    const patch = {
      model: text(input.model, current.model, 160),
      storage: text(input.storage, current.storage, 80),
      color: text(input.color, current.color, 100),
      region: text(input.region, current.region, 80),
      batteryHealth: numberOrCurrent(input.batteryHealth, Number(current.batteryHealth || 0), 0, 100),
      condition: text(input.condition, current.condition, 160),
      sellPrice: numberOrCurrent(input.sellPrice, Number(current.sellPrice || 0), 0, 10_000_000_000),
      warrantyPeriodMonths: numberOrCurrent(input.warrantyPeriodMonths, Number(current.warrantyPeriodMonths || 0), 0, 120),
      icloudStatus: text(input.icloudStatus, current.icloudStatus, 100),
      screenStatus: text(input.screenStatus, current.screenStatus, 160),
      notes: text(input.notes, current.notes, 2000),
      images: Array.isArray(input.images) ? input.images.map((value: unknown) => String(value).slice(0, 1000)).slice(0, 20) : (current.images || []),
      imageUrl: text(input.imageUrl, current.imageUrl, 1000),
      updatedByUid: actor.uid,
      updatedAt: FieldValue.serverTimestamp()
    };
    if (!patch.model) throw new Error('DEVICE_MODEL_REQUIRED');
    const changedFields = Object.keys(patch).filter(key => !['updatedByUid', 'updatedAt'].includes(key) && JSON.stringify((patch as any)[key]) !== JSON.stringify(current[key]));
    transaction.update(deviceRef, patch);
    transaction.create(db.collection('inventoryAuditEvents').doc(), {
      eventType: 'DEVICE_METADATA_UPDATED', deviceId, imei: current.imei,
      branchId: current.branchId, actorUid: actor.uid, changedFields,
      createdAt: FieldValue.serverTimestamp()
    });
    return { ...current, ...patch, updatedAt: new Date().toISOString() };
  });
}

export interface InventoryDeviceListOptions {
  limit?: number;
  cursor?: string;
  branchId?: string;
  locationId?: string;
  status?: string;
  search?: string;
  includeSummary?: boolean;
}

export interface InventoryDeviceListResult {
  devices: any[];
  nextCursor: string | null;
  hasMore: boolean;
  snapshotAt: string;
  summary?: {
    totalCount: number;
    availableCount: number;
    reservedCount: number;
    technicalCount: number;
    inTransitCount: number;
    soldCount: number;
  };
}

export function encodeInventoryCursor(documentId: string): string {
  return Buffer.from(JSON.stringify({ v: 1, id: documentId }), 'utf8').toString('base64url');
}

export function decodeInventoryCursor(cursor: string): string {
  try {
    if (!cursor || cursor.length > 500) throw new Error('INVALID_CURSOR');
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const id = String(parsed?.id || '');
    if (parsed?.v !== 1 || !id || id.length > 500 || /[\r\n]/.test(id)) throw new Error('INVALID_CURSOR');
    return id;
  } catch {
    throw new Error('INVENTORY_CURSOR_INVALID');
  }
}

function redactInventoryDevice(documentId: string, data: any, mayViewCost: boolean): any {
  const device = { id: documentId, ...data } as any;
  if (mayViewCost) return device;
  const {
    buyPrice: _buyPrice,
    supplierUnitPrice: _supplierUnitPrice,
    acquisitionCost: _acquisitionCost,
    allocatedDiscountAmount: _allocatedDiscountAmount,
    allocatedShippingFee: _allocatedShippingFee,
    allocatedVatAmount: _allocatedVatAmount,
    allocatedOtherFees: _allocatedOtherFees,
    currentCost: _currentCost,
    costVersion: _costVersion,
    costCalculatedAt: _costCalculatedAt,
    supplier: _supplier,
    supplierId: _supplierId,
    ...visibleDevice
  } = device;
  return { ...visibleDevice, costRestricted: true };
}

export async function listInventoryDevicesForActor(
  db: Firestore,
  actor: InventoryActor,
  options: InventoryDeviceListOptions = {}
): Promise<InventoryDeviceListResult> {
  const role = String(actor.role || '').toUpperCase();
  const mayViewCost = ['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(role);
  const pageLimit = Math.min(500, Math.max(1, Number.isFinite(Number(options.limit)) ? Math.floor(Number(options.limit)) : 100));
  const requestedBranchId = String(options.branchId || '').trim();
  const requestedLocationId = String(options.locationId || '').trim();
  const requestedStatus = String(options.status || '').trim();
  const search = normalizeImei(options.search || '');
  if (requestedBranchId && !canAccessBranch(actor, requestedBranchId)) throw new Error('INVENTORY_BRANCH_FORBIDDEN');
  if (search && !/^\d{5,15}$/.test(search)) throw new Error('INVENTORY_SEARCH_REQUIRES_EXACT_IMEI');
  const actorBranchIds = [...new Set([actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean))] as string[];
  if (role !== 'ADMIN' && role !== 'REGIONAL_MANAGER' && !requestedBranchId && actorBranchIds.length === 0) {
    return {
      devices: [], nextCursor: null, hasMore: false, snapshotAt: new Date().toISOString(),
      ...(options.includeSummary === false ? {} : { summary: { totalCount: 0, availableCount: 0, reservedCount: 0, technicalCount: 0, inTransitCount: 0, soldCount: 0 } })
    };
  }

  const buildScopeQuery = (): any => {
    let query: any = db.collection('devices');
    if (requestedBranchId) query = query.where('branchId', '==', requestedBranchId);
    else if (role !== 'ADMIN' && role !== 'REGIONAL_MANAGER') {
      if (actorBranchIds.length === 1) query = query.where('branchId', '==', actorBranchIds[0]);
      else if (actorBranchIds.length <= 30) query = query.where('branchId', 'in', actorBranchIds);
      else throw new Error('INVENTORY_BRANCH_SCOPE_TOO_LARGE');
    }
    if (requestedLocationId) query = query.where('currentLocationId', '==', requestedLocationId);
    if (search) query = query.where('imeiNormalized', '==', search);
    return query;
  };
  let listQuery = buildScopeQuery();
  if (requestedStatus) listQuery = listQuery.where('status', '==', requestedStatus);
  listQuery = listQuery.orderBy(FieldPath.documentId());
  if (options.cursor) listQuery = listQuery.startAfter(decodeInventoryCursor(options.cursor));
  const pageSnapshot = await listQuery.limit(pageLimit + 1).get();
  const hasMore = pageSnapshot.docs.length > pageLimit;
  const docs = pageSnapshot.docs.slice(0, pageLimit);
  const lastDocumentId = docs.length > 0 ? docs[docs.length - 1].id : null;
  const result: InventoryDeviceListResult = {
    devices: docs.map(doc => redactInventoryDevice(doc.id, doc.data(), mayViewCost)),
    nextCursor: hasMore && lastDocumentId ? encodeInventoryCursor(lastDocumentId) : null,
    hasMore,
    snapshotAt: new Date().toISOString()
  };
  if (options.includeSummary !== false) {
    const countForStatus = async (status?: string): Promise<number> => {
      let query = buildScopeQuery();
      if (status) query = query.where('status', '==', status);
      const snapshot = await query.count().get();
      return Number(snapshot.data().count || 0);
    };
    const [totalCount, availableCount, reservedCount, awaitingTechnicalCount, inRepairCount, legacyRepairingCount, warrantyCount, inTransitCount, soldCount] = await Promise.all([
      countForStatus(),
      countForStatus('in_stock'),
      countForStatus('reserved'),
      countForStatus('awaiting_technical'),
      countForStatus('in_repair'),
      countForStatus('repairing'),
      countForStatus('warranty'),
      countForStatus('in_transit'),
      countForStatus('sold')
    ]);
    result.summary = {
      totalCount,
      availableCount,
      reservedCount,
      technicalCount: awaitingTechnicalCount + inRepairCount + legacyRepairingCount + warrantyCount,
      inTransitCount,
      soldCount
    };
  }
  return result;
}

export async function buildInventoryAuditReport(db: Firestore) {
  const [warehouseSnap, deviceSnap, transferSnap, workOrderSnap, registrySnap] = await Promise.all([
    db.collection('warehouses').get(),
    db.collection('devices').limit(5000).get(),
    db.collection('transfers').limit(2500).get(),
    db.collection('technicalWorkOrders').limit(5000).get(),
    db.collection('imeiRegistry').limit(5000).get()
  ]);
  const warehouses = new Map<string, any>(warehouseSnap.docs.map(doc => [doc.id, doc.data()]));
  const transfers = new Map<string, any>(transferSnap.docs.map(doc => [doc.id, doc.data()]));
  const workOrders = new Map<string, any>(workOrderSnap.docs.map(doc => [doc.id, doc.data()]));
  const devices = new Map<string, any>(deviceSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
  const registries = new Map<string, any>(registrySnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
  const issues: Array<{ code: string; deviceId?: string; imei?: string; transferId?: string; details?: Record<string, any> }> = [];
  const imeiGroups = new Map<string, string[]>();

  for (const [deviceId, device] of devices) {
    const imei = normalizeImei(device.imei);
    if (imei) imeiGroups.set(imei, [...(imeiGroups.get(imei) || []), deviceId]);
    if (!/^\d{5,15}$/.test(imei)) issues.push({ code: 'DEVICE_IMEI_INVALID', deviceId, imei });
    if (/^\d{5,15}$/.test(imei)) {
      const registry = registries.get(imeiRegistryId(imei));
      if (!registry) issues.push({ code: 'IMEI_REGISTRY_MISSING', deviceId, imei });
      else if (registry.deviceId !== deviceId) issues.push({ code: 'IMEI_REGISTRY_DEVICE_MISMATCH', deviceId, imei, details: { registryDeviceId: registry.deviceId } });
    }
    const locationId = String(device.currentLocationId || device.warehouseId || device.warehouse || '');
    if (!device.branchId) issues.push({ code: 'DEVICE_BRANCH_MISSING', deviceId, imei });
    if (!locationId) issues.push({ code: 'DEVICE_LOCATION_MISSING', deviceId, imei });
    if (locationId && locationId !== 'IN_TRANSIT' && !warehouses.has(locationId)) issues.push({ code: 'DEVICE_LOCATION_UNKNOWN', deviceId, imei, details: { locationId } });
    if (device.currentLocationId && ((device.warehouseId && device.warehouseId !== device.currentLocationId) || (device.warehouse && device.warehouse !== device.currentLocationId))) {
      issues.push({ code: 'DEVICE_LEGACY_LOCATION_DRIFT', deviceId, imei, details: { currentLocationId: device.currentLocationId, warehouseId: device.warehouseId, warehouse: device.warehouse } });
    }
    const location = warehouses.get(locationId);
    if (location?.branchId && device.branchId && location.branchId !== device.branchId) issues.push({ code: 'DEVICE_LOCATION_BRANCH_MISMATCH', deviceId, imei, details: { branchId: device.branchId, locationBranchId: location.branchId, locationId } });
    if (device.activeTransferId) {
      const transfer = transfers.get(device.activeTransferId);
      if (!transfer) issues.push({ code: 'DEVICE_TRANSFER_MISSING', deviceId, imei, transferId: device.activeTransferId });
      else if (TERMINAL_TRANSFER_STATES.has(transfer.status)) issues.push({ code: 'DEVICE_STALE_TRANSFER_LOCK', deviceId, imei, transferId: device.activeTransferId, details: { transferStatus: transfer.status } });
    }
    if (device.activeWorkOrderId) {
      const workOrder = workOrders.get(device.activeWorkOrderId);
      if (!workOrder) issues.push({ code: 'DEVICE_WORK_ORDER_MISSING', deviceId, imei, details: { workOrderId: device.activeWorkOrderId } });
      else if (TERMINAL_WORK_ORDER_STATES.has(workOrder.status)) issues.push({ code: 'DEVICE_STALE_WORK_ORDER_LOCK', deviceId, imei, details: { workOrderId: device.activeWorkOrderId, workOrderStatus: workOrder.status } });
    }
  }

  for (const [imei, ids] of imeiGroups) if (ids.length > 1) issues.push({ code: 'DUPLICATE_IMEI', imei, details: { deviceIds: ids } });
  for (const registry of registries.values()) {
    if (String(registry.status || '').toUpperCase() === 'VOIDED') continue;
    if (!devices.has(registry.deviceId)) issues.push({ code: 'IMEI_REGISTRY_DEVICE_MISSING', deviceId: registry.deviceId, imei: normalizeImei(registry.imei), details: { registryId: registry.id } });
  }
  for (const [transferId, transfer] of transfers) {
    for (const item of transfer.items || []) {
      const device = devices.get(item.deviceId || item.id);
      if (!device) {
        issues.push({ code: 'TRANSFER_DEVICE_MISSING', imei: normalizeImei(item.imei), transferId, details: { deviceId: item.deviceId || item.id } });
        continue;
      }
      if (!TERMINAL_TRANSFER_STATES.has(transfer.status) && device.activeTransferId !== transferId && !['RECEIVED', 'DAMAGED'].includes(item.receiptStatus)) {
        issues.push({ code: 'TRANSFER_DEVICE_LOCK_MISMATCH', deviceId: device.id, imei: normalizeImei(item.imei), transferId, details: { activeTransferId: device.activeTransferId, transferStatus: transfer.status, itemStatus: item.itemStatus || item.receiptStatus } });
      }
      if (transfer.transferType === 'TECHNICAL' && item.workOrderId) {
        const workOrder = workOrders.get(item.workOrderId);
        if (['ACCEPTED', 'IN_PROGRESS'].includes(workOrder?.status) && item.itemStatus === 'WAITING_KTV_ACCEPT') issues.push({ code: 'TECH_ACCEPT_TRANSFER_DRIFT', deviceId: device.id, imei: normalizeImei(item.imei), transferId, details: { workOrderId: item.workOrderId } });
      }
    }
  }

  const counts = issues.reduce<Record<string, number>>((accumulator, issue) => {
    accumulator[issue.code] = (accumulator[issue.code] || 0) + 1;
    return accumulator;
  }, {});
  return {
    dryRun: true,
    generatedAt: new Date().toISOString(),
    scanned: { devices: devices.size, warehouses: warehouses.size, transfers: transfers.size, workOrders: workOrders.size, imeiRegistries: registries.size },
    issueCount: issues.length,
    counts,
    issues
  };
}
