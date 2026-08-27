import crypto from 'crypto';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { getVietnamMonthString } from '../../shared/vietnamTime';

export type TechnicalPriority = 'NORMAL' | 'PRIORITY' | 'URGENT';
export type ReceiptResult = 'RECEIVED' | 'MISSING' | 'WRONG_DEVICE' | 'DAMAGED';

export interface TransferActor {
  uid: string;
  name?: string;
  role?: string;
  branchId?: string;
  assignedBranchIds?: string[];
}

export interface TechnicalTaskTypeRecord {
  id: string;
  taskType: string;
  name: string;
  taskCode: string;
  baseCommission: number;
  laborCostToDevice?: number;
  capitalizeLaborCost?: boolean;
  reworkCommissionPolicy?: 'NO_EXTRA_COMMISSION' | 'REPEAT_COMMISSION' | 'MANAGER_APPROVAL';
  quoteGate?: 'DIAGNOSIS_ALLOWED' | 'APPROVAL_REQUIRED' | 'NOT_APPLICABLE';
  requiredEvidenceTypes?: string[];
  requiredPartTemplates?: Array<{
    partId?: string;
    sku?: string;
    category?: string;
    quantity: number;
    maxQuantity?: number;
    allowSubstitution?: boolean;
  }>;
  intakeIssueTypes?: string[];
  qcChecklistTemplateId?: string;
  qcChecklistSteps?: Array<{ key: string; label: string; required?: boolean }>;
  normalSlaHours: number;
  prioritySlaHours: number;
  urgentSlaHours: number;
  priorityMultiplier: Record<TechnicalPriority, number>;
  requiresQc: boolean;
  isActive: boolean;
  version: string;
}

export interface CreateTechnicalTransferInput {
  sourceBranchId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  items: Array<{
    deviceId: string;
    tasks: Array<{ taskType: string; priority: TechnicalPriority }>;
  }>;
  notes?: string;
  handoverImageUrls?: string[];
  idempotencyKey: string;
}

export interface CreateInterBranchTransferInput {
  sourceBranchId: string;
  destinationBranchId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  deviceIds: string[];
  expectedDeliveryAt?: string;
  transporter?: string;
  notes?: string;
  idempotencyKey: string;
}

export interface InterBranchReceiptInput {
  results: Array<{
    imei: string;
    result: ReceiptResult;
    scannedImei?: string;
    notes?: string;
  }>;
  idempotencyKey: string;
}

export interface InterBranchSettlementInput {
  amount: number;
  payerFundId: string;
  receiverFundId: string;
  note?: string;
  idempotencyKey: string;
}

export type InterBranchFinancialStatus = 'PROVISIONAL' | 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'VOID' | 'REVERSED';

function safeMoney(value: unknown): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
}

function normalizeDateString(value: any): string {
  if (!value) return '';
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Number.isFinite(value?._seconds)) return new Date(Number(value._seconds) * 1000).toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export function deriveInterBranchFinancialStatus(
  postedAmount: number,
  settledAmount: number,
  postingStatus?: string
): InterBranchFinancialStatus {
  if (postingStatus === 'VOID') return 'VOID';
  if (postingStatus === 'REVERSED') return 'REVERSED';
  if (postedAmount <= 0) return 'PROVISIONAL';
  if (settledAmount <= 0) return 'OPEN';
  if (settledAmount < postedAmount) return 'PARTIALLY_SETTLED';
  return 'SETTLED';
}

export function normalizeInterBranchDebtRecord(record: any, transfer?: any) {
  const postedAmount = safeMoney(record?.postedAmount ?? transfer?.postedLedgerAmount);
  const settledAmount = Math.min(postedAmount, safeMoney(record?.settledAmount ?? transfer?.settledLedgerAmount));
  const postingStatus = String(record?.status || (postedAmount > 0 ? 'POSTED' : 'PROVISIONAL')).toUpperCase();
  const sourceBranchId = String(record?.sourceBranchId || transfer?.sourceBranchId || '');
  const destinationBranchId = String(record?.destinationBranchId || transfer?.destinationBranchId || '');
  const rawItems = Array.isArray(record?.imeis) && record.imeis.length ? record.imeis : (transfer?.items || []);
  const imeis = rawItems.map((item: any) => ({
    imei: String(item?.imei || ''),
    ...(item?.deviceId || item?.id ? { deviceId: String(item.deviceId || item.id) } : {}),
    ...(item?.name ? { name: String(item.name) } : {}),
    amount: safeMoney(item?.amount ?? item?.costAtTransfer ?? item?.costPrice),
    ...(item?.receiptStatus ? { receiptStatus: String(item.receiptStatus) } : {})
  })).filter((item: any) => item.imei);
  return {
    ...record,
    id: String(record?.id || transfer?.interBranchLedgerEntryId || `IBL_${transfer?.id || ''}`),
    transferId: String(record?.transferId || transfer?.id || ''),
    transferCode: String(record?.transferCode || transfer?.code || ''),
    sourceBranchId,
    sourceBranchName: String(record?.sourceBranchName || transfer?.sourceBranchName || sourceBranchId),
    destinationBranchId,
    destinationBranchName: String(record?.destinationBranchName || transfer?.destinationBranchName || destinationBranchId),
    currency: 'VND',
    provisionalAmount: safeMoney(record?.provisionalAmount ?? transfer?.provisionalLedgerAmount ?? transfer?.totalValue),
    postedAmount,
    settledAmount,
    outstandingAmount: Math.max(0, postedAmount - settledAmount),
    financialStatus: deriveInterBranchFinancialStatus(postedAmount, settledAmount, postingStatus),
    status: postingStatus,
    imeis,
    settlements: Array.isArray(record?.settlements) ? record.settlements : [],
    createdAt: normalizeDateString(record?.createdAt || transfer?.createdAt || transfer?.createdDate),
    updatedAt: normalizeDateString(record?.updatedAt || transfer?.updatedAt || transfer?.createdAt)
  };
}

export function getCanonicalDeviceLocation(device: any): string {
  return device?.currentLocationId || device?.warehouseId || device?.warehouse || '';
}

export function getDeviceCostSnapshot(device: any, now: string): { costAtTransfer: number; costVersion: string; costCalculatedAt: string } {
  const currentCost = Number(device?.currentCost ?? device?.buyPrice);
  if (!Number.isFinite(currentCost) || currentCost < 0) {
    throw new Error(`DEVICE_COST_INVALID: IMEI ${device?.imei || device?.id || ''} chưa có giá vốn hợp lệ.`);
  }
  return {
    costAtTransfer: currentCost,
    costVersion: String(device?.costVersion || 'LEGACY_CURRENT_COST_V1'),
    costCalculatedAt: String(device?.costCalculatedAt || now)
  };
}

export function calculateTechnicalTaskQuote(config: TechnicalTaskTypeRecord, priority: TechnicalPriority, dispatchedAt: string) {
  if (!config.isActive) {
    throw new Error(`TASK_TYPE_INACTIVE: Hạng mục "${config.name}" đã ngừng áp dụng.`);
  }
  const multiplier = Number(config.priorityMultiplier?.[priority]);
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error(`PRIORITY_CONFIG_INVALID: Hạng mục "${config.name}" chưa cấu hình hệ số ${priority}.`);
  }
  const slaHours = priority === 'URGENT'
    ? config.urgentSlaHours
    : priority === 'PRIORITY'
      ? config.prioritySlaHours
      : config.normalSlaHours;
  const deadlineAt = new Date(new Date(dispatchedAt).getTime() + slaHours * 60 * 60 * 1000).toISOString();
  return {
    commissionAmount: Math.round(config.baseCommission * multiplier),
    laborCostToDevice: config.capitalizeLaborCost === false
      ? 0
      : Math.round(Number(config.laborCostToDevice ?? config.baseCommission) * multiplier),
    capitalizeLaborCost: config.capitalizeLaborCost !== false,
    slaHours,
    deadlineAt
  };
}

function canAccessBranch(actor: TransferActor, branchId: string): boolean {
  const role = String(actor.role || '').toUpperCase();
  return role === 'ADMIN' || role === 'REGIONAL_MANAGER' || actor.branchId === branchId || (actor.assignedBranchIds || []).includes(branchId);
}

function assertCanDispatch(actor: TransferActor, branchId: string) {
  if (!canAccessBranch(actor, branchId)) {
    throw new Error(`SOURCE_BRANCH_FORBIDDEN: Bạn không có quyền xuất hàng tại chi nhánh "${branchId}".`);
  }
}

function assertIdempotencyKey(key?: string) {
  if (!key || key.trim().length < 8 || key.length > 160) {
    throw new Error('IDEMPOTENCY_KEY_REQUIRED: Mỗi lần xác nhận phải có idempotencyKey hợp lệ.');
  }
}

function idempotencyDocId(scope: string, key: string): string {
  return crypto.createHash('sha256').update(`${scope}:${key}`).digest('hex');
}

function randomSuffix(bytes = 3): string {
  return crypto.randomBytes(bytes).toString('hex').toUpperCase();
}

function assertUnique(values: string[], errorCode: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${errorCode}: Danh sách có thiết bị/IMEI bị trùng.`);
  }
}

function assertDeviceUnlocked(device: any) {
  if (device.activeTransferId || device.transferLockId) {
    throw new Error(`DEVICE_ALREADY_IN_TRANSFER: IMEI ${device.imei} đang nằm trong phiếu ${device.activeTransferId || device.transferLockId}.`);
  }
  if (device.activeWorkOrderId || device.technicianAssigned) {
    throw new Error(`DEVICE_ALREADY_ASSIGNED_TO_TECH: IMEI ${device.imei} đang có task kỹ thuật chưa đóng.`);
  }
  if (device.reservedForLeadId || device.reservedUntil || device.soldInvoiceId) {
    throw new Error(`DEVICE_COMMERCIALLY_LOCKED: IMEI ${device.imei} đang bán, giữ chỗ hoặc đặt cọc.`);
  }
}

function locationBranchId(location: any): string {
  return String(location?.branchId || '');
}

function publicTransferRecord(data: any): any {
  return JSON.parse(JSON.stringify(data));
}

export async function listTechnicalTaskTypes(db: Firestore): Promise<TechnicalTaskTypeRecord[]> {
  const snap = await db.collection('technicalTaskTypes').get();
  return snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as TechnicalTaskTypeRecord))
    .sort((left, right) => left.name.localeCompare(right.name, 'vi'));
}

export async function processCreateTechnicalTransfer(
  db: Firestore,
  input: CreateTechnicalTransferInput,
  actor: TransferActor
): Promise<{ transferId: string; code: string; transfer: any; idempotentReplay?: boolean }> {
  assertIdempotencyKey(input.idempotencyKey);
  assertCanDispatch(actor, input.sourceBranchId);
  if (!input.sourceBranchId || !input.sourceLocationId || !input.destinationLocationId) {
    throw new Error('TRANSFER_LOCATIONS_REQUIRED: Thiếu branchId/locationId giao hoặc nhận.');
  }
  if (input.sourceLocationId === input.destinationLocationId) {
    throw new Error('SAME_LOCATION_FORBIDDEN: Kho giao và kho KTV không được trùng nhau.');
  }
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 50) {
    throw new Error('TRANSFER_ITEMS_INVALID: Phiếu kỹ thuật cần từ 1 đến 50 máy.');
  }
  assertUnique(input.items.map(item => item.deviceId), 'DUPLICATE_DEVICE');
  input.items.forEach(item => {
    if (!item.tasks?.length) throw new Error(`TASK_REQUIRED: Thiết bị ${item.deviceId} chưa có hạng mục kỹ thuật.`);
    assertUnique(item.tasks.map(task => task.taskType), 'DUPLICATE_TASK');
  });

  const now = new Date().toISOString();
  const transferId = `TTR_${Date.now()}_${randomSuffix()}`;
  const code = `KT-${now.slice(0, 10).replace(/-/g, '')}-${randomSuffix(2)}`;
  const idemRef = db.collection('inventoryTransferIdempotency').doc(idempotencyDocId('CREATE_TECHNICAL', input.idempotencyKey));

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const idem = idemSnap.data()!;
      const existingSnap = await transaction.get(db.collection('transfers').doc(idem.transferId));
      if (!existingSnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      const transfer = existingSnap.data()!;
      return { transferId: idem.transferId, code: transfer.code, transfer: publicTransferRecord(transfer), idempotentReplay: true };
    }

    const sourceLocationRef = db.collection('warehouses').doc(input.sourceLocationId);
    const destinationLocationRef = db.collection('warehouses').doc(input.destinationLocationId);
    const sourceLocationSnap = await transaction.get(sourceLocationRef);
    const destinationLocationSnap = await transaction.get(destinationLocationRef);
    if (!sourceLocationSnap.exists) throw new Error(`SOURCE_LOCATION_NOT_FOUND: Không tìm thấy kho giao "${input.sourceLocationId}".`);
    if (!destinationLocationSnap.exists) throw new Error(`TECH_LOCATION_NOT_FOUND: Không tìm thấy kho KTV "${input.destinationLocationId}".`);
    const sourceLocation = sourceLocationSnap.data()!;
    const destinationLocation = destinationLocationSnap.data()!;
    if (locationBranchId(sourceLocation) !== input.sourceBranchId) {
      throw new Error('SOURCE_LOCATION_BRANCH_MISMATCH');
    }
    if (sourceLocation.isActive === false || sourceLocation.isMain !== true) {
      throw new Error('SOURCE_LOCATION_MUST_BE_ACTIVE_MAIN_WAREHOUSE');
    }
    if (destinationLocation.type !== 'TECHNICIAN_SUB' || destinationLocation.isActive === false) {
      throw new Error('INVALID_TECH_LOCATION: Kho nhận phải là kho KTV đang hoạt động.');
    }
    if (locationBranchId(destinationLocation) !== input.sourceBranchId) {
      throw new Error('TECH_LOCATION_BRANCH_MISMATCH: Kho KTV phải thuộc cùng Chi nhánh Tổng.');
    }
    if (destinationLocation.parentWarehouseId !== input.sourceLocationId) {
      throw new Error('TECH_LOCATION_PARENT_MISMATCH');
    }
    const technicianUid = String(destinationLocation.custodianUid || destinationLocation.technicianUid || destinationLocation.technicianId || '');
    if (!technicianUid) throw new Error('TECH_LOCATION_ASSIGNEE_REQUIRED: Kho KTV chưa gắn với tài khoản kỹ thuật viên.');
    const technicianName = String(destinationLocation.technicianName || destinationLocation.manager || 'Kỹ thuật viên');

    const requestedTaskTypes = [...new Set(input.items.flatMap(item => item.tasks.map(task => task.taskType)))];
    const taskConfigMap = new Map<string, TechnicalTaskTypeRecord>();
    for (const taskType of requestedTaskTypes) {
      const configSnap = await transaction.get(db.collection('technicalTaskTypes').doc(taskType));
      if (!configSnap.exists) throw new Error(`TASK_TYPE_NOT_CONFIGURED: Hạng mục "${taskType}" chưa được thiết lập trong Cài đặt.`);
      const taskConfig = { id: configSnap.id, ...configSnap.data() } as TechnicalTaskTypeRecord;
      if (taskConfig.isActive === false) throw new Error(`TASK_TYPE_INACTIVE: Hạng mục "${taskConfig.name || taskType}" đã ngừng áp dụng.`);
      taskConfigMap.set(taskType, taskConfig);
    }

    const deviceSnapshots: Array<{ ref: any; data: any }> = [];
    for (const requestedItem of input.items) {
      const ref = db.collection('devices').doc(requestedItem.deviceId);
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error(`DEVICE_NOT_FOUND: Không tìm thấy thiết bị "${requestedItem.deviceId}".`);
      deviceSnapshots.push({ ref, data: snap.data()! });
    }

    const transferItems: any[] = [];
    let totalEstimatedCommission = 0;
    let totalTasks = 0;
    let nearestDeadlineAt = '';

    for (let itemIndex = 0; itemIndex < input.items.length; itemIndex++) {
      const requestedItem = input.items[itemIndex];
      const { ref: deviceRef, data: device } = deviceSnapshots[itemIndex];
      assertDeviceUnlocked(device);
      const deviceBranchId = String(device.branchId || input.sourceBranchId);
      if (deviceBranchId !== input.sourceBranchId) throw new Error(`DEVICE_BRANCH_MISMATCH: IMEI ${device.imei} không thuộc chi nhánh giao.`);
      if (getCanonicalDeviceLocation(device) !== input.sourceLocationId) throw new Error(`DEVICE_LOCATION_MISMATCH: IMEI ${device.imei} không thực tế ở kho giao.`);
      if (!['in_stock', 'awaiting_technical'].includes(device.status)) throw new Error(`DEVICE_NOT_AVAILABLE: IMEI ${device.imei} đang ở trạng thái ${device.status}.`);

      const workOrderId = `WO_${Date.now()}_${itemIndex + 1}_${randomSuffix(2)}`;
      const taskSnapshots: any[] = [];
      const lineIds: string[] = [];
      let itemCommission = 0;

      for (let taskIndex = 0; taskIndex < requestedItem.tasks.length; taskIndex++) {
        const taskRequest = requestedItem.tasks[taskIndex];
        const config = taskConfigMap.get(taskRequest.taskType);
        if (!config) throw new Error(`TASK_TYPE_NOT_FOUND: Không tìm thấy cấu hình "${taskRequest.taskType}".`);
        const quote = calculateTechnicalTaskQuote(config, taskRequest.priority, now);
        const lineId = `WOL_${workOrderId}_${taskIndex + 1}`;
        const commissionLedgerId = `COMM_${lineId}`;
        lineIds.push(lineId);
        itemCommission += quote.commissionAmount;
        totalEstimatedCommission += quote.commissionAmount;
        totalTasks += 1;
        if (!nearestDeadlineAt || quote.deadlineAt < nearestDeadlineAt) nearestDeadlineAt = quote.deadlineAt;

        const taskSnapshot = {
          taskType: config.taskType,
          taskCode: config.taskCode,
          taskName: config.name,
          priority: taskRequest.priority,
          commissionAmount: quote.commissionAmount,
          laborCostToDevice: quote.laborCostToDevice,
          capitalizeLaborCost: quote.capitalizeLaborCost,
          reworkCommissionPolicy: config.reworkCommissionPolicy || 'NO_EXTRA_COMMISSION',
          quoteGate: config.quoteGate || 'NOT_APPLICABLE',
          requiredEvidenceTypes: config.requiredEvidenceTypes || [],
          requiredPartTemplates: config.requiredPartTemplates || [],
          intakeIssueTypes: config.intakeIssueTypes || [],
          qcChecklistTemplateId: config.qcChecklistTemplateId || null,
          qcChecklistSnapshot: {
            templateId: config.qcChecklistTemplateId || 'QC_STANDARD_12_STEPS_V2',
            version: config.version,
            taskSpecificSteps: config.qcChecklistSteps || []
          },
          slaHours: quote.slaHours,
          deadlineAt: quote.deadlineAt,
          requiresQc: config.requiresQc,
          configVersion: config.version,
          lineId,
          commissionLedgerId
        };
        taskSnapshots.push(taskSnapshot);

        transaction.set(db.collection('technicalWorkOrderLines').doc(lineId), {
          id: lineId,
          workOrderId,
          transferId,
          deviceId: device.id || requestedItem.deviceId,
          imei: device.imei,
          model: device.model,
          branchId: input.sourceBranchId,
          ...taskSnapshot,
          assigneeUid: technicianUid,
          assigneeName: technicianName,
          ratePolicyId: config.id,
          ratePolicyVersion: config.version,
          status: 'ASSIGNED',
          assignedAt: now,
          createdAt: now,
          updatedAt: now
        });
        transaction.set(db.collection('commissionLedger').doc(commissionLedgerId), {
          id: commissionLedgerId,
          staffUid: technicianUid,
          staffName: technicianName,
          workOrderId,
          workOrderLineId: lineId,
          workOrderType: 'INBOUND_PREP',
          transferId,
          branchId: input.sourceBranchId,
          imei: device.imei,
          taskCode: config.taskCode,
          taskName: config.name,
          amount: quote.commissionAmount,
          commissionPayable: quote.commissionAmount,
          laborCostToDevice: quote.laborCostToDevice,
          capitalizeToDevice: quote.capitalizeLaborCost,
          policyId: config.id,
          policyVersion: config.version,
          reworkCycle: 0,
          status: 'PENDING',
          eligibilityRequiresStockReturn: true,
          assignedAt: now,
          assignedPeriod: getVietnamMonthString(now),
          payrollPeriod: null,
          eligibleAt: null,
          eligibilityReason: null,
          createdAt: now
        });
      }

      transaction.set(db.collection('technicalWorkOrders').doc(workOrderId), {
        id: workOrderId,
        code: `SC-${now.slice(0, 10).replace(/-/g, '')}-${randomSuffix(2)}`,
        transferId,
        deviceId: device.id || requestedItem.deviceId,
        imei: device.imei,
        model: device.model,
        workOrderType: 'INBOUND_PREP',
        assetOwnership: 'COMPANY',
        branchId: input.sourceBranchId,
        sourceWarehouseId: input.sourceLocationId,
        destinationLocationId: input.destinationLocationId,
        status: 'ASSIGNED',
        currentCustodianUid: actor.uid,
        currentCustodianName: actor.name || 'Thủ kho',
        currentLocationId: input.sourceLocationId,
        assignedTechnicianUid: technicianUid,
        assignedTechnicianName: technicianName,
        taskLineIds: lineIds,
        totalCommissionAmount: itemCommission,
        openingDeviceCost: getDeviceCostSnapshot(device, now).costAtTransfer,
        openingCostVersion: getDeviceCostSnapshot(device, now).costVersion,
        costPostingStatus: 'NOT_READY',
        eligibilityRequiresStockReturn: true,
        reworkCount: 0,
        createdByUid: actor.uid,
        createdByName: actor.name || 'Quản lý kho',
        createdAt: now,
        updatedAt: now
      });

      transaction.update(deviceRef, {
        branchId: input.sourceBranchId,
        currentLocationId: input.sourceLocationId,
        warehouseId: input.sourceLocationId,
        warehouse: input.sourceLocationId,
        status: 'reserved',
        activeTransferId: transferId,
        activeWorkOrderId: workOrderId,
        transferState: 'WAITING_KTV_ACCEPT',
        technicianAssigned: technicianName,
        updatedAt: now
      });

      const movementId = `MOV_${Date.now()}_${itemIndex + 1}_${randomSuffix(2)}`;
      transaction.set(db.collection('inventoryMovements').doc(movementId), {
        id: movementId,
        transferId,
        workOrderId,
        deviceId: device.id || requestedItem.deviceId,
        imei: device.imei,
        branchId: input.sourceBranchId,
        movementType: 'TECH_HANDOVER_CREATED',
        fromLocationId: input.sourceLocationId,
        toLocationId: input.destinationLocationId,
        custodyAccepted: false,
        performedByUid: actor.uid,
        occurredAt: now,
        createdAt: now
      });

      transferItems.push({
        type: 'device',
        id: device.id || requestedItem.deviceId,
        deviceId: device.id || requestedItem.deviceId,
        imei: device.imei,
        name: `${device.model || ''} ${device.storage || ''} ${device.color || ''}`.trim(),
        model: device.model,
        storage: device.storage,
        color: device.color,
        condition: device.condition,
        quantity: 1,
        costPrice: Number(device.currentCost ?? device.buyPrice ?? 0),
        sourceBranchId: input.sourceBranchId,
        sourceLocationId: input.sourceLocationId,
        destinationLocationId: input.destinationLocationId,
        workOrderId,
        itemStatus: 'WAITING_KTV_ACCEPT',
        tasks: taskSnapshots
      });
    }

    const transfer = {
      id: transferId,
      code,
      transferType: 'TECHNICAL',
      branchId: input.sourceBranchId,
      sourceBranchId: input.sourceBranchId,
      sourceBranchName: input.sourceBranchId,
      destinationBranchId: input.sourceBranchId,
      destinationBranchName: input.sourceBranchId,
      sourceLocationId: input.sourceLocationId,
      destinationLocationId: input.destinationLocationId,
      fromWarehouse: input.sourceLocationId,
      fromWarehouseName: sourceLocation.name || sourceLocation.shortName || input.sourceLocationId,
      toWarehouse: input.destinationLocationId,
      toWarehouseName: destinationLocation.name || destinationLocation.shortName || input.destinationLocationId,
      technicianUid,
      technicianName,
      createdDate: now,
      createdAt: now,
      updatedAt: now,
      creator: actor.name || actor.uid,
      createdByUid: actor.uid,
      status: 'WAITING_KTV_ACCEPT',
      items: transferItems,
      totalQuantity: transferItems.length,
      totalValue: transferItems.reduce((sum, item) => sum + item.costPrice, 0),
      totalTasks,
      totalEstimatedCommission,
      nearestDeadlineAt,
      notes: input.notes || '',
      handoverImageUrls: input.handoverImageUrls || [],
      idempotencyKey: input.idempotencyKey
    };

    transaction.set(db.collection('transfers').doc(transferId), transfer);
    transaction.set(idemRef, { scope: 'CREATE_TECHNICAL', key: input.idempotencyKey, transferId, createdAt: now });
    return { transferId, code, transfer: publicTransferRecord(transfer) };
  });
}

export async function processAcceptTechnicalTransfer(
  db: Firestore,
  transferId: string,
  scannedImeis: string[],
  idempotencyKey: string,
  actor: TransferActor,
  options?: {
    preRepairInspection?: {
      appearance: 'GOOD' | 'SCRATCHED' | 'DENTED';
      screen: 'OK' | 'DEFECTIVE' | 'NOT_TESTABLE';
      power: 'OK' | 'NO_POWER';
      biometrics: 'OK' | 'DEFECTIVE' | 'NOT_TESTABLE';
      technicianNotes?: string;
    };
  }
): Promise<{ transferId: string; transfer: any; acceptedCount: number; idempotentReplay?: boolean }> {
  assertIdempotencyKey(idempotencyKey);
  if (!scannedImeis?.length) throw new Error('SCANNED_IMEI_REQUIRED: KTV phải quét ít nhất một IMEI.');
  assertUnique(scannedImeis, 'DUPLICATE_SCANNED_IMEI');
  const idemRef = db.collection('inventoryTransferIdempotency').doc(idempotencyDocId(`ACCEPT_TECHNICAL_${transferId}`, idempotencyKey));

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    const transferRef = db.collection('transfers').doc(transferId);
    const transferSnap = await transaction.get(transferRef);
    if (!transferSnap.exists) throw new Error('TRANSFER_NOT_FOUND');
    const transfer = transferSnap.data()!;
    if (idemSnap.exists) return { transferId, transfer: publicTransferRecord(transfer), acceptedCount: Number(idemSnap.data()?.acceptedCount || 0), idempotentReplay: true };
    if (transfer.transferType !== 'TECHNICAL') throw new Error('TRANSFER_TYPE_MISMATCH');
    if (!['WAITING_KTV_ACCEPT', 'IN_PROGRESS'].includes(transfer.status)) throw new Error(`INVALID_TRANSFER_STATUS: ${transfer.status}`);
    if (!canAccessBranch(actor, transfer.sourceBranchId)) throw new Error('BRANCH_FORBIDDEN');

    const destinationSnap = await transaction.get(db.collection('warehouses').doc(transfer.destinationLocationId));
    if (!destinationSnap.exists || destinationSnap.data()?.isActive === false) throw new Error('TECH_LOCATION_INACTIVE');
    const destination = destinationSnap.data()!;
    const actorRole = String(actor.role || '').toUpperCase();
    const destinationCustodianUid = String(destination.custodianUid || destination.technicianUid || destination.technicianId || '');
    if (destinationCustodianUid && destinationCustodianUid !== actor.uid && !['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(actorRole)) {
      throw new Error('TECHNICIAN_NOT_ASSIGNED');
    }

    const itemByImei = new Map((transfer.items || []).map((item: any) => [String(item.imei), item]));
    const targetItems = scannedImeis.map(imei => {
      const item: any = itemByImei.get(String(imei));
      if (!item) throw new Error(`IMEI_NOT_IN_TRANSFER: ${imei}`);
      return item;
    });
    const deviceSnaps: any[] = [];
    const workOrderSnaps: any[] = [];
    const lineSnapsByWorkOrder = new Map<string, any[]>();
    for (const item of targetItems) {
      deviceSnaps.push(await transaction.get(db.collection('devices').doc(item.deviceId || item.id)));
      workOrderSnaps.push(await transaction.get(db.collection('technicalWorkOrders').doc(item.workOrderId)));
      const lineSnaps: any[] = [];
      for (const task of item.tasks || []) lineSnaps.push(await transaction.get(db.collection('technicalWorkOrderLines').doc(task.lineId)));
      lineSnapsByWorkOrder.set(item.workOrderId, lineSnaps);
    }

    const now = new Date().toISOString();
    const nextItems = (transfer.items || []).map((item: any) => ({ ...item }));
    let acceptedCount = 0;
    for (let index = 0; index < targetItems.length; index++) {
      const item = targetItems[index];
      if (item.itemStatus !== 'WAITING_KTV_ACCEPT') continue;
      const deviceSnap = deviceSnaps[index];
      const workOrderSnap = workOrderSnaps[index];
      if (!deviceSnap.exists || !workOrderSnap.exists) throw new Error(`TRANSFER_DATA_INCOMPLETE: ${item.imei}`);
      const device = deviceSnap.data()!;
      if (device.activeTransferId !== transferId) throw new Error(`DEVICE_LOCK_MISMATCH: ${item.imei}`);
      transaction.update(deviceSnap.ref, {
        status: 'in_repair',
        currentLocationId: transfer.destinationLocationId,
        warehouseId: transfer.destinationLocationId,
        warehouse: transfer.destinationLocationId,
        currentCustodianUid: actor.uid,
        currentCustodian: actor.name || transfer.technicianName || 'Kỹ thuật viên',
        transferState: 'IN_PROGRESS',
        acceptedAt: now,
        updatedAt: now
      });
      transaction.update(workOrderSnap.ref, {
        status: 'ACCEPTED',
        currentLocationId: transfer.destinationLocationId,
        currentCustodianUid: actor.uid,
        currentCustodianName: actor.name || transfer.technicianName || 'Kỹ thuật viên',
        ...(options?.preRepairInspection ? {
          preRepairInspection: {
            ...options.preRepairInspection,
            inspectedAt: now,
            technicianId: actor.uid
          }
        } : {}),
        acceptedAt: now,
        updatedAt: now
      });
      for (const lineSnap of lineSnapsByWorkOrder.get(item.workOrderId) || []) {
        if (lineSnap.exists && lineSnap.data()?.status === 'ASSIGNED') transaction.update(lineSnap.ref, { status: 'ACCEPTED', acceptedAt: now, updatedAt: now });
      }
      const movementId = `MOV_${Date.now()}_${index + 1}_${randomSuffix(2)}`;
      transaction.set(db.collection('inventoryMovements').doc(movementId), {
        id: movementId,
        transferId,
        workOrderId: item.workOrderId,
        deviceId: item.deviceId || item.id,
        imei: item.imei,
        branchId: transfer.sourceBranchId,
        movementType: 'TECH_ACCEPT',
        fromLocationId: transfer.sourceLocationId,
        toLocationId: transfer.destinationLocationId,
        toCustodianUid: actor.uid,
        performedByUid: actor.uid,
        confirmedByUid: actor.uid,
        occurredAt: now,
        createdAt: now
      });
      const nextItem = nextItems.find((candidate: any) => candidate.imei === item.imei);
      nextItem.itemStatus = 'IN_PROGRESS';
      nextItem.acceptedAt = now;
      acceptedCount += 1;
    }
    const allAccepted = nextItems.every((item: any) => item.itemStatus !== 'WAITING_KTV_ACCEPT');
    const nextTransfer = { ...transfer, items: nextItems, status: allAccepted ? 'IN_PROGRESS' : 'WAITING_KTV_ACCEPT', updatedAt: now };
    transaction.update(transferRef, { items: nextItems, status: nextTransfer.status, updatedAt: now });
    transaction.set(idemRef, { scope: 'ACCEPT_TECHNICAL', transferId, acceptedCount, createdAt: now });
    return { transferId, transfer: publicTransferRecord(nextTransfer), acceptedCount };
  });
}

export async function processCancelTechnicalTransfer(db: Firestore, transferId: string, reason: string, actor: TransferActor) {
  return db.runTransaction(async transaction => {
    const transferRef = db.collection('transfers').doc(transferId);
    const snap = await transaction.get(transferRef);
    if (!snap.exists) throw new Error('TRANSFER_NOT_FOUND');
    const transfer = snap.data()!;
    if (transfer.transferType !== 'TECHNICAL') throw new Error('TRANSFER_TYPE_MISMATCH');
    if (!canAccessBranch(actor, transfer.sourceBranchId)) throw new Error('BRANCH_FORBIDDEN');
    if (transfer.status !== 'WAITING_KTV_ACCEPT' || (transfer.items || []).some((item: any) => item.itemStatus !== 'WAITING_KTV_ACCEPT')) {
      throw new Error('TECH_TRANSFER_CANNOT_CANCEL_AFTER_ACCEPT: Máy đã được KTV nhận phải làm nghiệp vụ trả máy.');
    }
    const deviceSnaps: any[] = [];
    for (const item of transfer.items || []) deviceSnaps.push(await transaction.get(db.collection('devices').doc(item.deviceId || item.id)));
    const now = new Date().toISOString();
    for (let index = 0; index < (transfer.items || []).length; index++) {
      const item = transfer.items[index];
      const deviceSnap = deviceSnaps[index];
      if (deviceSnap.exists && deviceSnap.data()?.activeTransferId === transferId) {
        transaction.update(deviceSnap.ref, {
          status: 'in_stock',
          activeTransferId: FieldValue.delete(),
          activeWorkOrderId: FieldValue.delete(),
          transferState: FieldValue.delete(),
          technicianAssigned: FieldValue.delete(),
          updatedAt: now
        });
      }
      transaction.update(db.collection('technicalWorkOrders').doc(item.workOrderId), { status: 'CANCELLED', cancelledAt: now, cancelledByUid: actor.uid, updatedAt: now });
      for (const task of item.tasks || []) {
        transaction.update(db.collection('technicalWorkOrderLines').doc(task.lineId), { status: 'CANCELLED', updatedAt: now });
        transaction.update(db.collection('commissionLedger').doc(task.commissionLedgerId), { status: 'CANCELLED', updatedAt: now });
      }
    }
    const items = (transfer.items || []).map((item: any) => ({ ...item, itemStatus: 'CANCELLED' }));
    const nextTransfer = { ...transfer, items, status: 'CANCELLED', cancelledAt: now, cancelledByUid: actor.uid, cancellationReason: reason || '', updatedAt: now };
    transaction.update(transferRef, { items, status: 'CANCELLED', cancelledAt: now, cancelledByUid: actor.uid, cancellationReason: reason || '', updatedAt: now });
    return { transferId, transfer: publicTransferRecord(nextTransfer) };
  });
}

export async function processCreateInterBranchTransfer(
  db: Firestore,
  input: CreateInterBranchTransferInput,
  actor: TransferActor
): Promise<{ transferId: string; code: string; transfer: any; idempotentReplay?: boolean }> {
  assertIdempotencyKey(input.idempotencyKey);
  assertCanDispatch(actor, input.sourceBranchId);
  if (!input.sourceBranchId || !input.destinationBranchId || input.sourceBranchId === input.destinationBranchId) {
    throw new Error('BRANCH_PAIR_INVALID: Chi nhánh chuyển và nhận phải khác nhau.');
  }
  if (!input.sourceLocationId || !input.destinationLocationId) throw new Error('TRANSFER_LOCATIONS_REQUIRED');
  if (!input.deviceIds?.length || input.deviceIds.length > 100) throw new Error('TRANSFER_ITEMS_INVALID: Phiếu cần từ 1 đến 100 máy.');
  assertUnique(input.deviceIds, 'DUPLICATE_DEVICE');

  const now = new Date().toISOString();
  const transferId = `IBT_${Date.now()}_${randomSuffix()}`;
  const code = `DC-${now.slice(0, 10).replace(/-/g, '')}-${randomSuffix(2)}`;
  const stockIssueId = `ISSUE_${transferId}`;
  const stockReceiptId = `RECEIPT_${transferId}`;
  const ledgerId = `IBL_${transferId}`;
  const idemRef = db.collection('inventoryTransferIdempotency').doc(idempotencyDocId('CREATE_INTER_BRANCH', input.idempotencyKey));

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const existing = await transaction.get(db.collection('transfers').doc(idemSnap.data()!.transferId));
      if (!existing.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      const transfer = existing.data()!;
      return { transferId: transfer.id, code: transfer.code, transfer: publicTransferRecord(transfer), idempotentReplay: true };
    }

    const sourceBranchSnap = await transaction.get(db.collection('branches').doc(input.sourceBranchId));
    const destinationBranchSnap = await transaction.get(db.collection('branches').doc(input.destinationBranchId));
    const sourceLocationSnap = await transaction.get(db.collection('warehouses').doc(input.sourceLocationId));
    const destinationLocationSnap = await transaction.get(db.collection('warehouses').doc(input.destinationLocationId));
    if (!sourceBranchSnap.exists || sourceBranchSnap.data()?.isActive === false) throw new Error('SOURCE_BRANCH_NOT_ACTIVE');
    if (!destinationBranchSnap.exists || destinationBranchSnap.data()?.isActive === false) throw new Error('DESTINATION_BRANCH_NOT_ACTIVE');
    if (!sourceLocationSnap.exists || !destinationLocationSnap.exists) throw new Error('LOCATION_NOT_FOUND');
    const sourceLocation = sourceLocationSnap.data()!;
    const destinationLocation = destinationLocationSnap.data()!;
    if (locationBranchId(sourceLocation) !== input.sourceBranchId) throw new Error('SOURCE_LOCATION_BRANCH_MISMATCH');
    if (locationBranchId(destinationLocation) !== input.destinationBranchId) throw new Error('DESTINATION_LOCATION_BRANCH_MISMATCH');
    if (sourceLocation.isActive === false || destinationLocation.isActive === false) throw new Error('LOCATION_INACTIVE');

    const deviceSnapshots: any[] = [];
    for (const deviceId of input.deviceIds) {
      const snap = await transaction.get(db.collection('devices').doc(deviceId));
      if (!snap.exists) throw new Error(`DEVICE_NOT_FOUND: ${deviceId}`);
      deviceSnapshots.push(snap);
    }
    const items: any[] = [];
    for (const deviceSnap of deviceSnapshots) {
      const device = deviceSnap.data()!;
      assertDeviceUnlocked(device);
      if (String(device.branchId || '') !== input.sourceBranchId) throw new Error(`DEVICE_BRANCH_MISMATCH: IMEI ${device.imei} không thuộc chi nhánh chuyển.`);
      if (getCanonicalDeviceLocation(device) !== input.sourceLocationId) throw new Error(`DEVICE_LOCATION_MISMATCH: IMEI ${device.imei} không nằm trong kho xuất.`);
      if (device.status !== 'in_stock') throw new Error(`DEVICE_NOT_EXPORTABLE: IMEI ${device.imei} đang ở trạng thái ${device.status}.`);
      const cost = getDeviceCostSnapshot(device, now);
      items.push({
        type: 'device',
        id: device.id || deviceSnap.id,
        deviceId: device.id || deviceSnap.id,
        imei: device.imei,
        name: `${device.model || ''} ${device.storage || ''} ${device.color || ''}`.trim(),
        model: device.model,
        storage: device.storage,
        color: device.color,
        condition: device.condition,
        quantity: 1,
        costPrice: cost.costAtTransfer,
        ...cost,
        sourceBranchId: input.sourceBranchId,
        destinationBranchId: input.destinationBranchId,
        sourceLocationId: input.sourceLocationId,
        destinationLocationId: input.destinationLocationId,
        receiptStatus: 'PENDING'
      });
    }
    const totalValue = items.reduce((sum, item) => sum + item.costAtTransfer, 0);
    const sourceBranchName = sourceBranchSnap.exists ? sourceBranchSnap.data()!.name || input.sourceBranchId : input.sourceBranchId;
    const destinationBranchName = destinationBranchSnap.exists ? destinationBranchSnap.data()!.name || input.destinationBranchId : input.destinationBranchId;
    const transfer = {
      id: transferId,
      code,
      transferType: 'INTER_BRANCH',
      branchId: input.sourceBranchId,
      sourceBranchId: input.sourceBranchId,
      sourceBranchName,
      destinationBranchId: input.destinationBranchId,
      destinationBranchName,
      sourceLocationId: input.sourceLocationId,
      destinationLocationId: input.destinationLocationId,
      fromWarehouse: input.sourceLocationId,
      fromWarehouseName: sourceLocation.name || sourceLocation.shortName || input.sourceLocationId,
      toWarehouse: input.destinationLocationId,
      toWarehouseName: destinationLocation.name || destinationLocation.shortName || input.destinationLocationId,
      createdDate: now,
      createdAt: now,
      updatedAt: now,
      creator: actor.name || actor.uid,
      createdByUid: actor.uid,
      approvedBy: actor.name || actor.uid,
      approvedByUid: actor.uid,
      approvedAt: now,
      status: 'IN_TRANSIT',
      items,
      totalQuantity: items.length,
      totalValue,
      provisionalLedgerAmount: totalValue,
      postedLedgerAmount: 0,
      settledLedgerAmount: 0,
      outstandingLedgerAmount: 0,
      financialStatus: 'PROVISIONAL',
      expectedDeliveryAt: input.expectedDeliveryAt || null,
      transporter: input.transporter || '',
      notes: input.notes || '',
      stockIssueId,
      stockReceiptId,
      interBranchLedgerEntryId: ledgerId,
      idempotencyKey: input.idempotencyKey
    };

    transaction.set(db.collection('stockIssues').doc(stockIssueId), {
      id: stockIssueId, transferId, code: `PX-${code}`, branchId: input.sourceBranchId, locationId: input.sourceLocationId,
      status: 'POSTED', items, totalValue, createdByUid: actor.uid, postedAt: now, createdAt: now
    });
    transaction.set(db.collection('stockReceipts').doc(stockReceiptId), {
      id: stockReceiptId, transferId, code: `PN-${code}`, branchId: input.destinationBranchId, locationId: input.destinationLocationId,
      sourceBranchId: input.sourceBranchId, status: 'PENDING_RECEIPT', items, totalValue, createdAt: now, updatedAt: now
    });
    transaction.set(db.collection('interBranchLedger').doc(ledgerId), {
      id: ledgerId, transferId, sourceBranchId: input.sourceBranchId, destinationBranchId: input.destinationBranchId,
      transferCode: code, sourceBranchName, destinationBranchName,
      currency: 'VND', provisionalAmount: totalValue, postedAmount: 0, status: 'PROVISIONAL',
      settledAmount: 0, outstandingAmount: 0, financialStatus: 'PROVISIONAL', settlements: [],
      imeis: items.map(item => ({
        imei: item.imei,
        deviceId: item.deviceId,
        name: item.name,
        amount: item.costAtTransfer,
        receiptStatus: item.receiptStatus
      })),
      sourceView: { account: 'INTER_BRANCH_RECEIVABLE', provisionalAmount: totalValue, amount: 0, settledAmount: 0, outstandingAmount: 0 },
      destinationView: { account: 'INTER_BRANCH_PAYABLE', provisionalAmount: totalValue, amount: 0, settledAmount: 0, outstandingAmount: 0 },
      createdAt: now, updatedAt: now
    });
    transaction.set(db.collection('transfers').doc(transferId), transfer);

    for (let index = 0; index < deviceSnapshots.length; index++) {
      const deviceSnap = deviceSnapshots[index];
      const item = items[index];
      transaction.update(deviceSnap.ref, {
        status: 'in_transit',
        currentLocationId: 'IN_TRANSIT',
        warehouseId: 'IN_TRANSIT',
        warehouse: 'IN_TRANSIT',
        activeTransferId: transferId,
        transferState: 'IN_TRANSIT',
        updatedAt: now
      });
      const movementId = `MOV_${Date.now()}_${index + 1}_${randomSuffix(2)}`;
      transaction.set(db.collection('inventoryMovements').doc(movementId), {
        id: movementId, transferId, deviceId: item.deviceId, imei: item.imei, movementType: 'INTER_BRANCH_DISPATCH',
        branchId: input.sourceBranchId, sourceBranchId: input.sourceBranchId, destinationBranchId: input.destinationBranchId,
        fromLocationId: input.sourceLocationId, toLocationId: 'IN_TRANSIT', performedByUid: actor.uid,
        costAtTransfer: item.costAtTransfer, costVersion: item.costVersion, occurredAt: now, createdAt: now
      });
    }
    transaction.set(idemRef, { scope: 'CREATE_INTER_BRANCH', key: input.idempotencyKey, transferId, createdAt: now });
    return { transferId, code, transfer: publicTransferRecord(transfer) };
  });
}

export function deriveInterBranchStatus(items: any[]): 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'DISPUTED' | 'IN_TRANSIT' {
  const statuses = items.map(item => item.receiptStatus || 'PENDING');
  const receivedCount = statuses.filter(status => status === 'RECEIVED' || status === 'DAMAGED').length;
  const hasDispute = statuses.some(status => ['MISSING', 'WRONG_DEVICE', 'DAMAGED'].includes(status));
  if (hasDispute) return 'DISPUTED';
  if (receivedCount === statuses.length && statuses.length > 0) return 'RECEIVED';
  if (receivedCount > 0) return 'PARTIALLY_RECEIVED';
  return 'IN_TRANSIT';
}

export async function processReceiveInterBranchTransfer(
  db: Firestore,
  transferId: string,
  input: InterBranchReceiptInput,
  actor: TransferActor
): Promise<{ transferId: string; transfer: any; postedAmount: number; idempotentReplay?: boolean }> {
  assertIdempotencyKey(input.idempotencyKey);
  if (!input.results?.length) throw new Error('RECEIPT_RESULTS_REQUIRED');
  assertUnique(input.results.map(result => result.imei), 'DUPLICATE_RECEIPT_IMEI');
  const idemRef = db.collection('inventoryTransferIdempotency').doc(idempotencyDocId(`RECEIVE_INTER_BRANCH_${transferId}`, input.idempotencyKey));

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    const transferRef = db.collection('transfers').doc(transferId);
    const transferSnap = await transaction.get(transferRef);
    if (!transferSnap.exists) throw new Error('TRANSFER_NOT_FOUND');
    const transfer = transferSnap.data()!;
    if (idemSnap.exists) return { transferId, transfer: publicTransferRecord(transfer), postedAmount: Number(transfer.postedLedgerAmount || 0), idempotentReplay: true };
    if (transfer.transferType !== 'INTER_BRANCH') throw new Error('TRANSFER_TYPE_MISMATCH');
    if (!['IN_TRANSIT', 'PARTIALLY_RECEIVED', 'DISPUTED'].includes(transfer.status)) throw new Error(`INVALID_TRANSFER_STATUS: ${transfer.status}`);
    if (!canAccessBranch(actor, transfer.destinationBranchId)) throw new Error('DESTINATION_BRANCH_FORBIDDEN');
    const itemMap = new Map((transfer.items || []).map((item: any) => [String(item.imei), item]));
    input.results.forEach(result => {
      const item: any = itemMap.get(String(result.imei));
      if (!item) throw new Error(`IMEI_NOT_IN_TRANSFER: ${result.imei}`);
      if (['RECEIVED', 'DAMAGED'].includes(item.receiptStatus)) throw new Error(`IMEI_ALREADY_RECEIVED: ${result.imei}`);
      if (['RECEIVED', 'DAMAGED'].includes(result.result) && String(result.scannedImei || '') !== String(result.imei)) throw new Error(`SCANNED_IMEI_MISMATCH: ${result.imei}`);
      if (result.result === 'WRONG_DEVICE' && (!result.scannedImei || result.scannedImei === result.imei)) throw new Error(`WRONG_DEVICE_SCAN_REQUIRED: ${result.imei}`);
    });

    const ledgerRef = db.collection('interBranchLedger').doc(transfer.interBranchLedgerEntryId);
    const receiptRef = db.collection('stockReceipts').doc(transfer.stockReceiptId);
    const ledgerSnap = await transaction.get(ledgerRef);
    const receiptSnap = await transaction.get(receiptRef);
    if (!ledgerSnap.exists || !receiptSnap.exists) throw new Error('TRANSFER_ACCOUNTING_DOCUMENTS_MISSING');
    const deviceSnaps: any[] = [];
    for (const result of input.results) {
      const item: any = itemMap.get(String(result.imei));
      deviceSnaps.push(await transaction.get(db.collection('devices').doc(item.deviceId || item.id)));
    }

    const now = new Date().toISOString();
    const resultMap = new Map(input.results.map(result => [result.imei, result]));
    const nextItems = (transfer.items || []).map((item: any) => {
      const result = resultMap.get(item.imei);
      return result ? {
        ...item,
        receiptStatus: result.result,
        scannedImei: result.scannedImei || '',
        receiptNotes: result.notes || '',
        ...(['RECEIVED', 'DAMAGED'].includes(result.result) ? { receivedAt: now } : {})
      } : { ...item };
    });
    for (let index = 0; index < input.results.length; index++) {
      const result = input.results[index];
      if (!['RECEIVED', 'DAMAGED'].includes(result.result)) continue;
      const item: any = itemMap.get(result.imei);
      const deviceSnap = deviceSnaps[index];
      if (!deviceSnap.exists || deviceSnap.data()?.activeTransferId !== transferId) throw new Error(`DEVICE_LOCK_MISMATCH: ${result.imei}`);
      transaction.update(deviceSnap.ref, {
        branchId: transfer.destinationBranchId,
        currentLocationId: transfer.destinationLocationId,
        warehouseId: transfer.destinationLocationId,
        warehouse: transfer.destinationLocationId,
        status: result.result === 'DAMAGED' ? 'repairing' : 'in_stock',
        activeTransferId: FieldValue.delete(),
        transferState: result.result === 'DAMAGED' ? 'TRANSPORT_DAMAGED' : FieldValue.delete(),
        receivedTransferId: transferId,
        receivedAt: now,
        updatedAt: now
      });
      const movementId = `MOV_${Date.now()}_${index + 1}_${randomSuffix(2)}`;
      transaction.set(db.collection('inventoryMovements').doc(movementId), {
        id: movementId, transferId, deviceId: item.deviceId || item.id, imei: item.imei,
        movementType: result.result === 'DAMAGED' ? 'INTER_BRANCH_RECEIPT_DAMAGED' : 'INTER_BRANCH_RECEIPT',
        sourceBranchId: transfer.sourceBranchId, destinationBranchId: transfer.destinationBranchId,
        branchId: transfer.destinationBranchId, fromLocationId: 'IN_TRANSIT', toLocationId: transfer.destinationLocationId,
        performedByUid: actor.uid, confirmedByUid: actor.uid, costAtTransfer: item.costAtTransfer,
        occurredAt: now, createdAt: now
      });
    }

    const postedAmount = nextItems
      .filter((item: any) => ['RECEIVED', 'DAMAGED'].includes(item.receiptStatus))
      .reduce((sum: number, item: any) => sum + Number(item.costAtTransfer || 0), 0);
    const existingLedger = ledgerSnap.data()!;
    const settledAmount = safeMoney(existingLedger.settledAmount ?? transfer.settledLedgerAmount);
    if (settledAmount > postedAmount) throw new Error('INTER_BRANCH_LEDGER_SETTLEMENT_EXCEEDS_POSTED');
    const outstandingAmount = Math.max(0, postedAmount - settledAmount);
    const nextStatus = deriveInterBranchStatus(nextItems);
    const ledgerStatus = postedAmount > 0 ? 'POSTED' : nextItems.every((item: any) => item.receiptStatus !== 'PENDING') ? 'VOID' : 'PROVISIONAL';
    const financialStatus = deriveInterBranchFinancialStatus(postedAmount, settledAmount, ledgerStatus);
    const nextTransfer = { ...transfer, items: nextItems, status: nextStatus, postedLedgerAmount: postedAmount, settledLedgerAmount: settledAmount, outstandingLedgerAmount: outstandingAmount, financialStatus, receivedDate: now, receiver: actor.name || actor.uid, updatedAt: now };
    transaction.update(transferRef, { items: nextItems, status: nextStatus, postedLedgerAmount: postedAmount, settledLedgerAmount: settledAmount, outstandingLedgerAmount: outstandingAmount, financialStatus, receivedDate: now, receiver: actor.name || actor.uid, updatedAt: now });
    transaction.update(receiptRef, { items: nextItems, status: nextStatus === 'RECEIVED' ? 'RECEIVED' : nextStatus, receivedByUid: actor.uid, receivedAt: now, updatedAt: now });
    transaction.update(ledgerRef, {
      status: ledgerStatus,
      postedAmount,
      settledAmount,
      outstandingAmount,
      financialStatus,
      transferCode: String(existingLedger.transferCode || transfer.code || ''),
      sourceBranchName: String(existingLedger.sourceBranchName || transfer.sourceBranchName || transfer.sourceBranchId),
      destinationBranchName: String(existingLedger.destinationBranchName || transfer.destinationBranchName || transfer.destinationBranchId),
      imeis: nextItems.map((item: any) => ({
        imei: String(item.imei || ''),
        deviceId: String(item.deviceId || item.id || ''),
        name: String(item.name || ''),
        amount: safeMoney(item.costAtTransfer || item.costPrice),
        receiptStatus: String(item.receiptStatus || 'PENDING')
      })),
      sourceView: { account: 'INTER_BRANCH_RECEIVABLE', amount: postedAmount, settledAmount, outstandingAmount },
      destinationView: { account: 'INTER_BRANCH_PAYABLE', amount: postedAmount, settledAmount, outstandingAmount },
      postedAt: postedAmount > 0 ? now : null,
      updatedAt: now
    });
    transaction.set(idemRef, { scope: 'RECEIVE_INTER_BRANCH', transferId, postedAmount, createdAt: now });
    return { transferId, transfer: publicTransferRecord(nextTransfer), postedAmount };
  });
}

export async function processCompleteInterBranchTransfer(db: Firestore, transferId: string, actor: TransferActor) {
  return db.runTransaction(async transaction => {
    const transferRef = db.collection('transfers').doc(transferId);
    const transferSnap = await transaction.get(transferRef);
    if (!transferSnap.exists) throw new Error('TRANSFER_NOT_FOUND');
    const transfer = transferSnap.data()!;
    if (!canAccessBranch(actor, transfer.destinationBranchId)) throw new Error('DESTINATION_BRANCH_FORBIDDEN');
    if (transfer.status !== 'RECEIVED' || !(transfer.items || []).every((item: any) => item.receiptStatus === 'RECEIVED')) {
      throw new Error('TRANSFER_NOT_READY_TO_COMPLETE: Chỉ hoàn tất khi toàn bộ IMEI đã nhận đúng và không có tranh chấp.');
    }
    const ledgerRef = db.collection('interBranchLedger').doc(transfer.interBranchLedgerEntryId);
    const ledgerSnap = await transaction.get(ledgerRef);
    if (!ledgerSnap.exists || ledgerSnap.data()?.status !== 'POSTED' || Number(ledgerSnap.data()?.postedAmount) !== Number(transfer.totalValue)) {
      throw new Error('LEDGER_NOT_BALANCED');
    }
    const now = new Date().toISOString();
    const nextTransfer = { ...transfer, status: 'COMPLETED', completedAt: now, completedByUid: actor.uid, updatedAt: now };
    transaction.update(transferRef, { status: 'COMPLETED', completedAt: now, completedByUid: actor.uid, updatedAt: now });
    return { transferId, transfer: publicTransferRecord(nextTransfer) };
  });
}

export async function listInterBranchDebts(
  db: Firestore,
  actor: TransferActor,
  filters: { branchId?: string; financialStatus?: string } = {}
) {
  const requestedBranchId = String(filters.branchId || '').trim();
  if (requestedBranchId && requestedBranchId !== 'ALL' && !canAccessBranch(actor, requestedBranchId)) {
    throw new Error('BRANCH_FORBIDDEN');
  }
  const ledgerSnap = await db.collection('interBranchLedger').limit(250).get();
  const rawLedgers = ledgerSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const missingTransferIds = rawLedgers
    .filter((ledger: any) => !ledger.transferCode || !Array.isArray(ledger.imeis))
    .map((ledger: any) => String(ledger.transferId || ''))
    .filter(Boolean);
  const transferSnaps = await Promise.all(missingTransferIds.map(id => db.collection('transfers').doc(id).get()));
  const transferById = new Map(transferSnaps.filter(snap => snap.exists).map(snap => [snap.id, snap.data()]));
  const requestedStatus = String(filters.financialStatus || '').trim().toUpperCase();
  const debts = rawLedgers
    .map((ledger: any) => normalizeInterBranchDebtRecord(ledger, transferById.get(String(ledger.transferId || ''))))
    .filter((ledger: any) => canAccessBranch(actor, ledger.sourceBranchId) || canAccessBranch(actor, ledger.destinationBranchId))
    .filter((ledger: any) => !requestedBranchId || requestedBranchId === 'ALL' || ledger.sourceBranchId === requestedBranchId || ledger.destinationBranchId === requestedBranchId)
    .filter((ledger: any) => !requestedStatus || requestedStatus === 'ALL' || ledger.financialStatus === requestedStatus)
    .sort((left: any, right: any) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')));
  return { debts, total: debts.length };
}

export async function processSettleInterBranchDebt(
  db: Firestore,
  transferId: string,
  input: InterBranchSettlementInput,
  actor: TransferActor
) {
  assertIdempotencyKey(input.idempotencyKey);
  const amount = Number(input.amount);
  const payerFundId = String(input.payerFundId || '').trim();
  const receiverFundId = String(input.receiverFundId || '').trim();
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('INTER_BRANCH_SETTLEMENT_AMOUNT_INVALID');
  if (!payerFundId || !receiverFundId || payerFundId === receiverFundId) throw new Error('INTER_BRANCH_SETTLEMENT_FUNDS_INVALID');

  const now = new Date().toISOString();
  const settlementId = `IBS_${Date.now()}_${randomSuffix()}`;
  const paymentTransactionId = `IBPAY_${settlementId}`;
  const receiptTransactionId = `IBREC_${settlementId}`;
  const idemRef = db.collection('interBranchSettlementIdempotency').doc(idempotencyDocId(`SETTLE_INTER_BRANCH_${transferId}`, input.idempotencyKey));

  return db.runTransaction(async transaction => {
    // Firestore transactions require every read to finish before the first write.
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) return { ...idemSnap.data()!.result, idempotentReplay: true };

    const transferRef = db.collection('transfers').doc(transferId);
    const transferSnap = await transaction.get(transferRef);
    if (!transferSnap.exists) throw new Error('TRANSFER_NOT_FOUND');
    const transfer = transferSnap.data()!;
    if (transfer.transferType !== 'INTER_BRANCH') throw new Error('TRANSFER_TYPE_MISMATCH');
    const ledgerId = String(transfer.interBranchLedgerEntryId || `IBL_${transferId}`);
    const ledgerRef = db.collection('interBranchLedger').doc(ledgerId);
    const ledgerSnap = await transaction.get(ledgerRef);
    if (!ledgerSnap.exists) throw new Error('INTER_BRANCH_LEDGER_NOT_FOUND');
    const payerFundRef = db.collection('funds').doc(payerFundId);
    const receiverFundRef = db.collection('funds').doc(receiverFundId);
    const payerFundSnap = await transaction.get(payerFundRef);
    const receiverFundSnap = await transaction.get(receiverFundRef);

    const ledger = normalizeInterBranchDebtRecord({ id: ledgerSnap.id, ...ledgerSnap.data() }, transfer);
    const settlementRole = String(actor.role || '').toUpperCase();
    const canSettle = settlementRole === 'ADMIN' || (
      settlementRole === 'ACCOUNTANT' && (canAccessBranch(actor, ledger.sourceBranchId) || canAccessBranch(actor, ledger.destinationBranchId))
    );
    if (!canSettle) {
      throw new Error('INTER_BRANCH_SETTLEMENT_BRANCH_FORBIDDEN');
    }
    if (ledger.status !== 'POSTED' || ledger.postedAmount <= 0) throw new Error('INTER_BRANCH_DEBT_NOT_POSTED');
    if (amount > ledger.outstandingAmount) throw new Error('INTER_BRANCH_SETTLEMENT_EXCEEDS_OUTSTANDING');
    if (!payerFundSnap.exists || !receiverFundSnap.exists) throw new Error('INTER_BRANCH_SETTLEMENT_FUND_NOT_FOUND');
    const payerFund = payerFundSnap.data()!;
    const receiverFund = receiverFundSnap.data()!;
    if (payerFund.isActive === false || payerFund.active === false || payerFund.isArchived === true) throw new Error('INTER_BRANCH_PAYER_FUND_INACTIVE');
    if (receiverFund.isActive === false || receiverFund.active === false || receiverFund.isArchived === true) throw new Error('INTER_BRANCH_RECEIVER_FUND_INACTIVE');
    if (String(payerFund.branchId || '') !== ledger.destinationBranchId) throw new Error('INTER_BRANCH_PAYER_FUND_BRANCH_MISMATCH');
    if (String(receiverFund.branchId || '') !== ledger.sourceBranchId) throw new Error('INTER_BRANCH_RECEIVER_FUND_BRANCH_MISMATCH');
    const payerBalance = Number(payerFund.currentBalance || 0);
    if (!Number.isSafeInteger(payerBalance) || payerBalance < amount) throw new Error('INTER_BRANCH_PAYER_INSUFFICIENT_FUNDS');
    const receiverBalance = Number(receiverFund.currentBalance || 0);
    if (!Number.isSafeInteger(receiverBalance) || receiverBalance < 0) throw new Error('INTER_BRANCH_RECEIVER_BALANCE_INVALID');

    const nextSettledAmount = ledger.settledAmount + amount;
    const outstandingAmount = Math.max(0, ledger.postedAmount - nextSettledAmount);
    const financialStatus = deriveInterBranchFinancialStatus(ledger.postedAmount, nextSettledAmount, ledger.status);
    const actorName = String(actor.name || actor.uid);
    const note = String(input.note || '').trim();
    const settlementSummary = {
      id: settlementId,
      amount,
      payerFundId,
      payerFundName: String(payerFund.name || payerFundId),
      receiverFundId,
      receiverFundName: String(receiverFund.name || receiverFundId),
      paymentTransactionId,
      receiptTransactionId,
      createdAt: now,
      createdByUid: actor.uid,
      createdByName: actorName,
      ...(note ? { note } : {})
    };
    const settlement = {
      ...settlementSummary,
      transferId,
      transferCode: ledger.transferCode,
      ledgerId,
      payerBranchId: ledger.destinationBranchId,
      payerBranchName: ledger.destinationBranchName,
      receiverBranchId: ledger.sourceBranchId,
      receiverBranchName: ledger.sourceBranchName,
      currency: 'VND',
      status: 'COMPLETED'
    };
    const paymentTransaction = {
      id: paymentTransactionId,
      code: `PC-${ledger.transferCode || transferId}-${settlementId.slice(-6)}`,
      branchId: ledger.destinationBranchId,
      fundId: payerFundId,
      fundName: String(payerFund.name || payerFundId),
      fundType: String(payerFund.type || 'CASH'),
      type: 'PAYMENT',
      category: 'INTER_BRANCH_PAYMENT',
      categoryName: 'Thanh toán công nợ chi nhánh',
      amount,
      date: now,
      referenceId: transferId,
      referenceCode: ledger.transferCode || transfer.code || transferId,
      referenceType: 'INTER_BRANCH_TRANSFER',
      transferId,
      transferGroupId: settlementId,
      interBranchSettlementId: settlementId,
      counterpartyBranchId: ledger.sourceBranchId,
      partnerId: ledger.sourceBranchId,
      partnerName: ledger.sourceBranchName,
      creator: actorName,
      creatorUid: actor.uid,
      notes: note || `Thanh toán công nợ ${ledger.transferCode || transferId} cho ${ledger.sourceBranchName}`,
      status: 'COMPLETED',
      isPLAccounted: false,
      createdAt: now
    };
    const receiptTransaction = {
      id: receiptTransactionId,
      code: `PT-${ledger.transferCode || transferId}-${settlementId.slice(-6)}`,
      branchId: ledger.sourceBranchId,
      fundId: receiverFundId,
      fundName: String(receiverFund.name || receiverFundId),
      fundType: String(receiverFund.type || 'CASH'),
      type: 'RECEIPT',
      category: 'INTER_BRANCH_RECEIPT',
      categoryName: 'Thu công nợ từ chi nhánh',
      amount,
      date: now,
      referenceId: transferId,
      referenceCode: ledger.transferCode || transfer.code || transferId,
      referenceType: 'INTER_BRANCH_TRANSFER',
      transferId,
      transferGroupId: settlementId,
      interBranchSettlementId: settlementId,
      counterpartyBranchId: ledger.destinationBranchId,
      partnerId: ledger.destinationBranchId,
      partnerName: ledger.destinationBranchName,
      creator: actorName,
      creatorUid: actor.uid,
      notes: note || `Thu công nợ ${ledger.transferCode || transferId} từ ${ledger.destinationBranchName}`,
      status: 'COMPLETED',
      isPLAccounted: false,
      createdAt: now
    };
    const nextDebt = normalizeInterBranchDebtRecord({
      ...ledger,
      settledAmount: nextSettledAmount,
      outstandingAmount,
      financialStatus,
      settlements: [...(ledger.settlements || []), settlementSummary].slice(-100),
      updatedAt: now
    }, transfer);
    const result = { transferId, debt: nextDebt, settlement, cashTransactions: [paymentTransaction, receiptTransaction] };

    transaction.update(payerFundRef, {
      currentBalance: payerBalance - amount,
      totalExpense: Number(payerFund.totalExpense || 0) + amount,
      updatedAt: now
    });
    transaction.update(receiverFundRef, {
      currentBalance: receiverBalance + amount,
      totalIncome: Number(receiverFund.totalIncome || 0) + amount,
      updatedAt: now
    });
    transaction.set(db.collection('cashTransactions').doc(paymentTransactionId), paymentTransaction);
    transaction.set(db.collection('cashTransactions').doc(receiptTransactionId), receiptTransaction);
    transaction.set(db.collection('interBranchSettlements').doc(settlementId), settlement);
    transaction.update(ledgerRef, {
      settledAmount: nextSettledAmount,
      outstandingAmount,
      financialStatus,
      sourceView: { account: 'INTER_BRANCH_RECEIVABLE', amount: ledger.postedAmount, settledAmount: nextSettledAmount, outstandingAmount },
      destinationView: { account: 'INTER_BRANCH_PAYABLE', amount: ledger.postedAmount, settledAmount: nextSettledAmount, outstandingAmount },
      settlements: nextDebt.settlements,
      updatedAt: now
    });
    transaction.update(transferRef, {
      settledLedgerAmount: nextSettledAmount,
      outstandingLedgerAmount: outstandingAmount,
      financialStatus,
      updatedAt: now
    });
    transaction.set(idemRef, { scope: 'SETTLE_INTER_BRANCH', transferId, settlementId, result, createdAt: now });
    return result;
  });
}
