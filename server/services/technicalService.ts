import { Firestore, FieldValue, DocumentReference } from 'firebase-admin/firestore';
import crypto from 'crypto';
import {
  canTransitionTaskLine,
  canTransitionWorkOrder,
  REQUIRED_QC_CHECKLIST_STEPS,
  TaskLineStatus,
  WorkOrderStatus
} from './technicalStateMachine';
import { calculateTechnicalTaskQuote, TechnicalPriority, TechnicalTaskTypeRecord } from './inventoryTransferService';
import {
  assertDebtOpenItemScope,
  debtOpenItemId,
  debtLedgerEntry,
  newBranchPartyAccountRecord,
  newDebtOpenItemRecord,
  newPartyMasterRecord,
  resolveLegacyDirectionalBalances,
  resolvePartyIdentity,
  settleDebtOpenItemRecord
} from './branchPartyService';
import { getVietnamMonthString } from '../../shared/vietnamTime';
import { parseVnd } from '../utils/financeIntegrity';
import { resolveCommissionPayrollPeriod } from './commissionPayrollPeriodService';

export interface CreateWorkOrderLineInput {
  taskType: string;
  priority?: TechnicalPriority;
  assigneeUid: string;
  assigneeName: string;
}

export interface TechnicalTaskAdditionInput {
  taskType: string;
  priority?: TechnicalPriority;
  reason: string;
  evidencePhotoUrls?: string[];
  /** For customer repairs, this is the extra amount NVBH has quoted. */
  additionalCustomerQuote?: number;
  idempotencyKey: string;
}

export interface CreateWorkOrderInput {
  deviceId?: string;
  imei: string;
  model: string;
  workOrderType: 'INBOUND_PREP' | 'CUSTOMER_SERVICE' | 'WARRANTY' | 'TRADE_IN_REFURB' | 'SHOP_RETURN_REWORK';
  branchId: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  assetOwnership?: 'COMPANY' | 'CUSTOMER';
  customerName?: string;
  customerPhone?: string;
  customerApprovedQuote?: number;
  totalEstimatedCost?: number;
  intakeDetails?: {
    issueType?: string;
    faultDescription?: string;
    deviceAppearance?: string;
    accessoriesIncluded?: string;
    expectedReturnDate?: string;
    icloudStatus?: string;
    unlockNote?: string;
  };
  notes?: string;
  lines: CreateWorkOrderLineInput[];
}

export interface QCInspectionInput {
  checklistVersion?: string;
  checklistResults: Record<string, boolean>;
  overallResult: 'PASS' | 'FAIL';
  failedReason?: string;
  photoEvidenceUrls?: string[];
  failures?: Array<{
    checklistKey: string;
    affectedLineIds: string[];
    reason: string;
    severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
  }>;
}

export interface CustomerDeliveryPaymentInput {
  paidAmount?: number;
  paymentMethod?: 'CASH' | 'BANK' | 'DEBT';
  fundId?: string;
  note?: string;
  idempotencyKey?: string;
}

export interface TechnicalQuoteAdjustmentInput {
  requestedAmount: number;
  reason: string;
  customerApprovalEvidenceId?: string;
  idempotencyKey: string;
}

type TechnicalActor = { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] };

function commissionPayrollResolutionKey(staffUid: string, assignedPeriod: string): string {
  return `${staffUid}|${assignedPeriod}`;
}

function canAccessBranch(user: any, targetBranchId?: string): boolean {
  if (!targetBranchId) return true;
  if (user?.role === 'ADMIN') return true;
  const userBranchId = user?.branchId;
  const assigned = user?.assignedBranchIds || [];
  return userBranchId === targetBranchId || assigned.includes(targetBranchId);
}

function isTechnicalSupervisor(user: { role?: string }): boolean {
  return ['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(String(user.role || '').toUpperCase());
}

function isClosedWorkOrder(status: unknown): boolean {
  return ['DELIVERED_TO_CUSTOMER', 'RETURNED_TO_STOCK', 'RETURNED_TO_BRANCH', 'CANCELLED'].includes(String(status || ''));
}

function assertTaskCustodyAuthority(workOrder: any, line: any, actor: TechnicalActor): void {
  const branchId = String(workOrder?.branchId || line?.branchId || '').trim();
  if (!branchId || !canAccessBranch(actor, branchId)) throw new Error('BRANCH_FORBIDDEN');
  if (!['ACCEPTED', 'IN_PROGRESS', 'QC_FAILED_REWORK'].includes(String(workOrder?.status || ''))) {
    throw new Error('CUSTODY_ACCEPTANCE_REQUIRED: Phải quét IMEI nhận máy trước khi thao tác task.');
  }
  if (String(workOrder?.currentCustodianUid || '') !== actor.uid) {
    throw new Error('CURRENT_CUSTODIAN_REQUIRED: Chỉ KTV đang giữ máy mới được thao tác.');
  }
  if (String(line?.assigneeUid || '') !== actor.uid) throw new Error('TECHNICIAN_NOT_ASSIGNED');
  if (workOrder?.activeHandoffId) throw new Error('TECH_HANDOFF_PENDING');
  if (isClosedWorkOrder(workOrder?.status)) throw new Error('WORK_ORDER_CLOSED');
  if (
    String(workOrder?.workOrderType || '') === 'CUSTOMER_SERVICE'
    && String(line?.quoteGate || 'APPROVAL_REQUIRED') === 'APPROVAL_REQUIRED'
    && String(workOrder?.quoteStatus || '') !== 'APPROVED'
  ) {
    throw new Error('QUOTE_APPROVAL_REQUIRED: Khách phải duyệt báo giá trước khi bắt đầu task sửa chữa.');
  }
}

export function deriveTechnicalBoardStage(workOrder: any, lines: any[]): string {
  const status = String(workOrder?.status || 'ASSIGNED');
  const openStatuses = (lines || []).map(line => String(line?.status || 'ASSIGNED')).filter(value => !['COMPLETED', 'VERIFIED', 'CANCELLED'].includes(value));
  if (status === 'DELIVERED_TO_CUSTOMER' || status === 'RETURNED_TO_STOCK' || status === 'RETURNED_TO_BRANCH') return 'COMPLETED';
  if (['QC_PASSED', 'CUSTOMER_READY'].includes(status)) return 'WAITING_DELIVERY';
  if (['TECH_COMPLETED', 'QC_PENDING'].includes(status)) return 'WAITING_QC';
  if (status === 'QC_FAILED_REWORK' || openStatuses.includes('REWORK_REQUIRED')) return 'REWORK';
  if (openStatuses.length > 0 && openStatuses.every(value => value === 'WAITING_PARTS')) return 'WAITING_PARTS';
  if (status === 'ASSIGNED' || (openStatuses.length > 0 && openStatuses.every(value => value === 'ASSIGNED'))) return 'WAITING_ACCEPTANCE';
  return 'IN_PROGRESS';
}

export function deriveTechnicalAllowedActions(workOrder: any, lines: any[], actor: TechnicalActor): string[] {
  const role = String(actor.role || '').toUpperCase();
  const currentCustodian = String(workOrder?.currentCustodianUid || '');
  const assigned = lines.some(line => String(line.assigneeUid || '') === actor.uid);
  const actions: string[] = [];
  if (['ASSIGNED', 'DRAFT'].includes(String(workOrder?.status || '')) && assigned) actions.push('ACCEPT_CUSTODY');
  if (currentCustodian === actor.uid && !workOrder?.activeHandoffId) {
    if (lines.some(line => ['ACCEPTED', 'REWORK_REQUIRED'].includes(String(line.status || '')))) actions.push('START_TASK');
    if (lines.some(line => ['IN_PROGRESS', 'WAITING_PARTS'].includes(String(line.status || '')))) actions.push('UPDATE_TASK', 'REQUEST_PART', 'REQUEST_ADDITIONAL_TASK');
  }
  if (['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(role) && ['TECH_COMPLETED', 'QC_PENDING'].includes(String(workOrder?.status || ''))) actions.push('QC');
  if (['ADMIN', 'MANAGER', 'SALES', 'SALE', 'CASHIER'].includes(role) && String(workOrder?.status || '') === 'QC_PASSED' && workOrder?.assetOwnership === 'CUSTOMER') actions.push('DELIVER_CUSTOMER');
  if (['ADMIN', 'MANAGER', 'INVENTORY_MANAGER'].includes(role) && String(workOrder?.status || '') === 'QC_PASSED' && workOrder?.assetOwnership !== 'CUSTOMER') actions.push('RETURN_TO_STOCK');
  return [...new Set(actions)];
}

function technicalIdempotencyId(scope: string, key: string): string {
  return crypto.createHash('sha256').update(`${scope}:${key}`).digest('hex');
}

function requireTechnicalIdempotencyKey(value: unknown): string {
  const key = String(value || '').trim();
  if (key.length < 8 || key.length > 160) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  return key;
}

export function isTechnicalEvidenceUrlForWorkOrder(value: unknown, workOrderId: string): boolean {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'https:') return false;
    const safeWorkOrderId = String(workOrderId || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100);
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      return decodedPath.includes(`/o/technical-evidence/${safeWorkOrderId}/`);
    }
    if (parsed.hostname === 'storage.googleapis.com') {
      return decodedPath.includes(`/technical-evidence/${safeWorkOrderId}/`);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 1. Create Technical Work Order with Multi-Task Lines
 */
export async function processCreateWorkOrder(
  db: Firestore,
  input: CreateWorkOrderInput,
  creatorUser: { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] }
): Promise<{ workOrderId: string; code: string; lineIds: string[] }> {
  if (!['INBOUND_PREP', 'CUSTOMER_SERVICE', 'WARRANTY', 'TRADE_IN_REFURB', 'SHOP_RETURN_REWORK'].includes(String(input.workOrderType || ''))) {
    throw new Error('WORK_ORDER_TYPE_INVALID');
  }
  if (!String(input.model || '').trim()) throw new Error('DEVICE_MODEL_REQUIRED');
  if (!/^\d{5,15}$/.test(String(input.imei || '').trim())) {
    throw new Error('IMEI_INVALID: IMEI/Serial phải gồm từ 5 đến 15 chữ số.');
  }

  if (!input.lines || input.lines.length === 0) {
    throw new Error('WORK_ORDER_LINES_REQUIRED: Phiếu kỹ thuật phải có ít nhất 1 hạng mục công việc.');
  }

  const now = new Date().toISOString();
  const workOrderId = `WO_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const code = `SC-${now.slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const branchId = String(input.branchId || '').trim();
  const initialLocation = String(input.sourceWarehouseId || '').trim();
  const destinationLocation = String(input.destinationWarehouseId || '').trim();
  if (!branchId || !initialLocation || !destinationLocation) throw new Error('BRANCH_SOURCE_AND_DESTINATION_WAREHOUSE_REQUIRED');
  if (new Set(input.lines.map(line => String(line.taskType || '').trim())).size !== input.lines.length || input.lines.some(line => !line.taskType || !line.assigneeUid)) {
    throw new Error('WORK_ORDER_LINES_INVALID');
  }
  if (new Set(input.lines.map(line => String(line.assigneeUid || '').trim())).size !== 1) {
    throw new Error('MULTIPLE_ASSIGNEES_REQUIRE_CUSTODY_HANDOFF: Một IMEI chỉ được có một KTV chịu trách nhiệm tại một thời điểm. Hãy tạo bàn giao KTV trước khi đổi người thực hiện.');
  }
  const estimatedCost = Number(input.totalEstimatedCost || 0);
  const approvedQuote = Number(input.customerApprovedQuote || 0);
  if (![estimatedCost, approvedQuote].every(value => Number.isFinite(value) && value >= 0)) throw new Error('WORK_ORDER_COST_ESTIMATE_INVALID');

  if (!canAccessBranch(creatorUser, branchId)) {
    throw new Error(`BRANCH_FORBIDDEN: Bạn không có quyền khởi tạo phiếu kỹ thuật tại chi nhánh "${branchId}".`);
  }

  return await db.runTransaction(async (transaction) => {
    // 1. Invariant: Only ONE active work order per IMEI (including REWORK)
    const existingActiveOrders = await transaction.get(
      db.collection('technicalWorkOrders')
        .where('imei', '==', input.imei.trim())
        .where('status', 'in', ['DRAFT', 'ASSIGNED', 'ACCEPTED', 'DIAGNOSING', 'IN_PROGRESS', 'TECH_COMPLETED', 'QC_PENDING', 'QC_FAILED_REWORK', 'QC_PASSED'])
        .limit(1)
    );

    const hasActive = existingActiveOrders && !existingActiveOrders.empty && Array.isArray(existingActiveOrders.docs) && existingActiveOrders.docs.length > 0;

    if (hasActive) {
      const activeDoc = existingActiveOrders.docs[0];
      throw new Error(`ACTIVE_WORK_ORDER_EXISTS: IMEI ${input.imei} đang có phiếu kỹ thuật active (${activeDoc.data().code || activeDoc.id}).`);
    }

    // 2. Read or verify device
    let resolvedDeviceId = String(input.deviceId || '').trim();
    let devRef: DocumentReference | null = null;
    let devData: any = null;
    if (resolvedDeviceId) {
      devRef = db.collection('devices').doc(resolvedDeviceId);
      const devSnap = await transaction.get(devRef);
      if (devSnap.exists) {
        devData = devSnap.data();
      }
    } else {
      const normalizedDeviceQuery = await transaction.get(db.collection('devices').where('imeiNormalized', '==', input.imei.trim()).limit(1));
      const legacyDeviceQuery = normalizedDeviceQuery.empty
        ? await transaction.get(db.collection('devices').where('imei', '==', input.imei.trim()).limit(1))
        : null;
      const matchedDevice = !normalizedDeviceQuery.empty ? normalizedDeviceQuery.docs[0] : legacyDeviceQuery?.docs?.[0];
      if (matchedDevice) {
        resolvedDeviceId = matchedDevice.id;
        devRef = matchedDevice.ref;
        devData = matchedDevice.data();
      }
    }

    const warehouseSnap = await transaction.get(db.collection('warehouses').doc(initialLocation));
    if (!warehouseSnap.exists) throw new Error('SOURCE_WAREHOUSE_NOT_FOUND');
    const warehouse = warehouseSnap.data()!;
    if (warehouse.isActive === false || String(warehouse.branchId || warehouse.owningBranchId || '') !== branchId) throw new Error('SOURCE_WAREHOUSE_BRANCH_MISMATCH');

    const destinationWarehouseSnap = await transaction.get(db.collection('warehouses').doc(destinationLocation));
    if (!destinationWarehouseSnap.exists) throw new Error('DESTINATION_TECH_WAREHOUSE_NOT_FOUND');
    const destinationWarehouse = destinationWarehouseSnap.data()!;
    const destinationType = String(destinationWarehouse.type || '');
    if (destinationWarehouse.isActive === false || String(destinationWarehouse.branchId || destinationWarehouse.owningBranchId || '') !== branchId || !['TECHNICIAN_SUB', 'REPAIR_WARRANTY'].includes(destinationType)) {
      throw new Error('DESTINATION_TECH_WAREHOUSE_INVALID');
    }
    const destinationCustodianUid = String(destinationWarehouse.custodianUid || destinationWarehouse.technicianUid || destinationWarehouse.technicianId || '');
    if (destinationType === 'TECHNICIAN_SUB' && (!destinationCustodianUid || destinationCustodianUid !== input.lines[0].assigneeUid)) {
      throw new Error('DESTINATION_TECH_WAREHOUSE_CUSTODIAN_MISMATCH');
    }

    if (devData) {
      const linkedDeviceImei = String(devData.imeiNormalized || devData.imei || '').trim();
      if (linkedDeviceImei !== input.imei.trim()) throw new Error('LINKED_DEVICE_IMEI_MISMATCH');
      if (devData.branchId && !canAccessBranch(creatorUser, String(devData.branchId))) throw new Error('LINKED_DEVICE_BRANCH_FORBIDDEN');
      if (devData.activeWorkOrderId) throw new Error('ACTIVE_WORK_ORDER_EXISTS');
    }
    const deviceIsCompanyInventory = !!devData && !['sold', 'warranty'].includes(String(devData.status || ''));
    const isInternalAsset = deviceIsCompanyInventory || input.assetOwnership === 'COMPANY' || ['INBOUND_PREP', 'TRADE_IN_REFURB', 'SHOP_RETURN_REWORK'].includes(input.workOrderType);
    if (isInternalAsset && (!resolvedDeviceId || !devData)) throw new Error('COMPANY_DEVICE_NOT_FOUND');
    if (!isInternalAsset && (!String(input.customerName || '').trim() || !String(input.customerPhone || '').trim())) {
      throw new Error('CUSTOMER_CONTACT_REQUIRED');
    }
    if (isInternalAsset) {
      const deviceImei = String(devData?.imeiNormalized || devData?.imei || '').trim();
      const deviceBranchId = String(devData?.branchId || '').trim();
      const deviceLocationId = String(devData?.currentLocationId || devData?.warehouseId || devData?.warehouse || '').trim();
      if (deviceImei !== input.imei.trim()) throw new Error('COMPANY_DEVICE_IMEI_MISMATCH');
      if (deviceBranchId !== branchId) throw new Error('COMPANY_DEVICE_BRANCH_MISMATCH');
      if (deviceLocationId !== initialLocation) throw new Error('COMPANY_DEVICE_LOCATION_MISMATCH');
      if (!['in_stock', 'awaiting_technical'].includes(String(devData?.status || '')) || devData?.activeTransferId || devData?.activeWorkOrderId) {
        throw new Error('COMPANY_DEVICE_NOT_AVAILABLE');
      }
      if (!['CENTRAL', 'RETAIL_STORE'].includes(String(warehouse.type || ''))) throw new Error('COMPANY_DEVICE_SOURCE_WAREHOUSE_INVALID');
    }
    const taskConfigs = new Map<string, TechnicalTaskTypeRecord>();
    for (const line of input.lines) {
      const taskType = String(line.taskType).trim();
      const configSnap = await transaction.get(db.collection('technicalTaskTypes').doc(taskType));
      if (!configSnap.exists) throw new Error(`TASK_TYPE_NOT_CONFIGURED: Hạng mục "${taskType}" chưa được thiết lập.`);
      const config = { id: configSnap.id, ...configSnap.data() } as TechnicalTaskTypeRecord;
      if (config.isActive === false) throw new Error(`TASK_TYPE_INACTIVE: Hạng mục "${config.name || taskType}" đã ngừng áp dụng.`);
      taskConfigs.set(taskType, config);
    }

    // 3. Create Task Lines
    const lineIds: string[] = [];
    let totalCommission = 0;

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      const taskType = String(line.taskType).trim();
      const config = taskConfigs.get(taskType)!;
      const priority = line.priority || 'NORMAL';
      const quote = calculateTechnicalTaskQuote(config, priority, now);
      const lineId = `WOL_${workOrderId}_${i + 1}`;
      lineIds.push(lineId);
      totalCommission += quote.commissionAmount;

      const lineDocRef = db.collection('technicalWorkOrderLines').doc(lineId);
      transaction.set(lineDocRef, {
        id: lineId,
        workOrderId,
        deviceId: resolvedDeviceId || null,
        imei: input.imei.trim(),
        model: input.model,
        branchId,
        taskType,
        taskCode: config.taskCode,
        taskName: config.name,
        priority,
        assigneeUid: line.assigneeUid,
        assigneeName: line.assigneeName,
        ratePolicyId: config.id,
        ratePolicyVersion: config.version,
        commissionAmount: quote.commissionAmount,
        laborCostToDevice: quote.laborCostToDevice,
        capitalizeLaborCost: quote.capitalizeLaborCost,
        reworkCommissionPolicy: config.reworkCommissionPolicy || 'NO_EXTRA_COMMISSION',
        quoteGate: config.quoteGate || (input.workOrderType === 'CUSTOMER_SERVICE' ? 'APPROVAL_REQUIRED' : 'NOT_APPLICABLE'),
        status: 'ASSIGNED',
        requiredParts: config.requiredPartTemplates || [],
        intakeIssueTypes: config.intakeIssueTypes || [],
        requiredEvidenceTypes: config.requiredEvidenceTypes || [],
        qcChecklistTemplateId: config.qcChecklistTemplateId || null,
        qcChecklistSnapshot: {
          templateId: config.qcChecklistTemplateId || 'QC_STANDARD_12_STEPS_V2',
          version: config.version,
          taskSpecificSteps: config.qcChecklistSteps || []
        },
        slaHours: quote.slaHours,
        deadlineAt: quote.deadlineAt,
        slaPolicyId: config.id,
        slaPolicyVersion: config.version,
        priorityMultiplierSnapshot: Number(config.priorityMultiplier?.[priority] || 1),
        evidencePhotoUrls: [],
        assignedAt: now,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      // Initialize pending commission ledger record
      const commId = `COMM_${lineId}`;
      transaction.set(db.collection('commissionLedger').doc(commId), {
        id: commId,
        staffUid: line.assigneeUid,
        staffName: line.assigneeName,
        workOrderId,
        workOrderLineId: lineId,
        workOrderType: input.workOrderType,
        branchId,
        imei: input.imei.trim(),
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
        eligibilityRequiresStockReturn: isInternalAsset,
        eligibilityRequiresCustomerDelivery: !isInternalAsset,
        assignedAt: now,
        assignedPeriod: getVietnamMonthString(now),
        payrollPeriod: null,
        eligibleAt: null,
        eligibilityReason: null,
        createdAt: FieldValue.serverTimestamp()
      });
    }

    // 4. Create Header Technical Work Order
    const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const woRecord = {
      id: workOrderId,
      code,
      deviceId: resolvedDeviceId || null,
      imei: input.imei.trim(),
      model: input.model,
      workOrderType: input.workOrderType,
      assetOwnership: isInternalAsset ? 'COMPANY' : 'CUSTOMER',
      branchId,
      sourceWarehouseId: initialLocation,
      destinationLocationId: destinationLocation,
      status: 'ASSIGNED',
      currentCustodianUid: isInternalAsset ? (devData?.currentCustodianUid || null) : creatorUser.uid,
      currentCustodianName: isInternalAsset ? (devData?.currentCustodian || null) : (creatorUser.name || 'Nhân viên tiếp nhận'),
      currentLocationId: initialLocation,
      taskLineIds: lineIds,
      reworkCount: 0,
      customerName: input.customerName || null,
      customerPhone: input.customerPhone || null,
      customerApprovedQuote: approvedQuote,
      proposedQuoteAmount: input.workOrderType === 'CUSTOMER_SERVICE' ? Math.max(approvedQuote, estimatedCost) : 0,
      quoteStatus: input.workOrderType === 'WARRANTY' ? 'NOT_REQUIRED' : input.workOrderType === 'CUSTOMER_SERVICE' ? 'PENDING_APPROVAL' : 'NOT_REQUIRED',
      approvedFinalAmount: input.workOrderType === 'WARRANTY' ? 0 : null,
      quoteVersion: 0,
      customerPromisedAt: input.intakeDetails?.expectedReturnDate || null,
      intakeDetails: input.intakeDetails || null,
      // Phiếu tiếp nhận không lưu mật mã mở máy. Chỉ lưu trạng thái/ghi chú hỗ trợ mở máy trong intakeDetails.
      hasPasscode: false,
      totalEstimatedCost: estimatedCost,
      totalActualCost: 0,
      openingDeviceCost: isInternalAsset ? Number(devData?.currentCost ?? devData?.buyPrice ?? 0) : 0,
      openingCostVersion: isInternalAsset ? String(devData?.costVersion || 'LEGACY_CURRENT_COST_V1') : null,
      costPostingStatus: isInternalAsset ? 'NOT_READY' : 'NOT_APPLICABLE',
      eligibilityRequiresStockReturn: isInternalAsset,
      eligibilityRequiresCustomerDelivery: !isInternalAsset,
      totalCommissionAmount: totalCommission,
      notes: input.notes || '',
      createdByUid: creatorUser.uid,
      createdByName: creatorUser.name || 'Quản lý',
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp()
    };
    transaction.set(woRef, woRecord);
    // 5. Update Device operational status (Keep commercial status safe for warranty/customer service!)
    if (devRef && devData) {
      transaction.update(devRef, {
        status: isInternalAsset ? 'awaiting_technical' : devData.status || 'sold',
        serviceStatus: 'WAITING_TECH_ACCEPTANCE',
        technicianAssigned: input.lines[0]?.assigneeName || 'Bộ phận Kỹ thuật',
        activeWorkOrderId: workOrderId,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    // 6. Record Initial Inventory Movement
    const movId = `MOV_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    transaction.set(db.collection('inventoryMovements').doc(movId), {
      id: movId,
      deviceId: resolvedDeviceId || null,
      imei: input.imei.trim(),
      branchId,
      movementType: 'TECH_INTAKE_REGISTERED',
      fromLocationId: initialLocation,
      toLocationId: initialLocation,
      fromCustodianUid: isInternalAsset ? (devData?.currentCustodianUid || null) : creatorUser.uid,
      toCustodianUid: isInternalAsset ? (devData?.currentCustodianUid || null) : creatorUser.uid,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      workOrderId,
      performedByUid: creatorUser.uid,
      occurredAt: now,
      createdAt: FieldValue.serverTimestamp()
    });

    return { workOrderId, code, lineIds };
  });
}

/**
 * The browser uploads intake photos after a work-order id exists.  URLs are
 * accepted only when they live under this work order's Storage path; clients
 * cannot attach an arbitrary photo from another repair record.
 */
export async function processAttachIntakeEvidence(
  db: Firestore,
  workOrderIdRaw: string,
  intakePhotoUrls: unknown,
  actor: { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] }
): Promise<{ workOrderId: string; intakePhotoUrls: string[] }> {
  const workOrderId = String(workOrderIdRaw || '').trim();
  const urls = Array.isArray(intakePhotoUrls) ? intakePhotoUrls.map(value => String(value || '').trim()).filter(Boolean) : [];
  if (!workOrderId) throw new Error('WORK_ORDER_ID_REQUIRED');
  if (urls.length > 6 || urls.some(url => !isTechnicalEvidenceUrlForWorkOrder(url, workOrderId))) {
    throw new Error('INTAKE_EVIDENCE_INVALID: Ảnh tiếp nhận phải thuộc đúng phiếu và tối đa 6 ảnh.');
  }
  return db.runTransaction(async transaction => {
    const workOrderRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const workOrderSnap = await transaction.get(workOrderRef);
    if (!workOrderSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const workOrder = workOrderSnap.data()!;
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    const intakeDetails = {
      ...(workOrder.intakeDetails && typeof workOrder.intakeDetails === 'object' ? workOrder.intakeDetails : {}),
      intakePhotoUrls: urls,
      intakePhotoCount: urls.length,
      intakePhotosAttachedAt: new Date().toISOString(),
      intakePhotosAttachedByUid: actor.uid
    };
    transaction.update(workOrderRef, { intakeDetails, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(db.collection('technicalWorkOrderEvents').doc(), {
      workOrderId,
      branchId: workOrder.branchId,
      eventType: 'INTAKE_PHOTOS_ATTACHED',
      photoCount: urls.length,
      actorUid: actor.uid,
      actorName: actor.name || actor.uid,
      occurredAt: new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp()
    });
    return { workOrderId, intakePhotoUrls: urls };
  });
}

/**
 * 2. KTV scans physical IMEI to accept custody & begin responsibility
 */
export async function processAcceptCustody(
  db: Firestore,
  workOrderId: string,
  scannedImei: string,
  technicianUser: { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] },
  preRepairInspection?: {
    appearance: 'GOOD' | 'SCRATCHED' | 'DENTED';
    screen: 'OK' | 'DEFECTIVE' | 'NOT_TESTABLE';
    power: 'OK' | 'NO_POWER';
    biometrics: 'OK' | 'DEFECTIVE' | 'NOT_TESTABLE';
    technicianNotes?: string;
    handoverPhotoUrls?: string[];
  }
): Promise<{ success: boolean; workOrderId: string }> {
  if (!scannedImei || scannedImei.trim().length === 0) {
    throw new Error('SCANNED_IMEI_REQUIRED: Bắt buộc quét mã IMEI thực tế của máy để nhận bàn giao.');
  }
  const handoverPhotoUrls = Array.isArray(preRepairInspection?.handoverPhotoUrls) ? preRepairInspection.handoverPhotoUrls : [];
  if (!preRepairInspection || handoverPhotoUrls.length > 6 || handoverPhotoUrls.some(url => !isTechnicalEvidenceUrlForWorkOrder(url, workOrderId))) {
    throw new Error('PRE_REPAIR_INSPECTION_INVALID: Checklist nhận máy không hợp lệ. Ảnh là tùy chọn, tối đa 6 ảnh.');
  }
  
  return await db.runTransaction(async (transaction) => {
    const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) {
      throw new Error(`WORK_ORDER_NOT_FOUND: Không tìm thấy phiếu kỹ thuật "${workOrderId}".`);
    }

    const woData = woSnap.data()!;

    // A. Physical IMEI Verification
    if (scannedImei.trim() !== (woData.imei || '').trim()) {
      throw new Error(`IMEI_MISMATCH: Mã IMEI quét (${scannedImei}) không khớp với IMEI của phiếu kỹ thuật (${woData.imei}).`);
    }

    // B. Branch Isolation Check
    if (!canAccessBranch(technicianUser, woData.branchId)) {
      throw new Error(`BRANCH_FORBIDDEN: Bạn không có quyền thao tác trên phiếu kỹ thuật thuộc chi nhánh "${woData.branchId}".`);
    }

    // C. Read all lines to check assignee permissions
    const linesSnap = await transaction.get(
      db.collection('technicalWorkOrderLines').where('workOrderId', '==', workOrderId)
    );

    const isAssignedTech = linesSnap.docs.some(d => d.data().assigneeUid === technicianUser.uid);
    // Nhận máy là mốc chịu trách nhiệm vật lý. Quản lý có thể theo dõi nhưng
    // không được nhận thay KTV, vì điều đó sẽ làm phiếu ACCEPTED trong khi
    // các task vẫn thuộc một KTV khác.
    if (!isAssignedTech) {
      throw new Error('TECHNICIAN_NOT_ASSIGNED: Chỉ KTV được giao task mới có thể xác nhận nhận máy.');
    }

    const currentStatus = woData.status as WorkOrderStatus;
    const staleAcceptanceRecovery = currentStatus === 'ACCEPTED'
      && String(woData.currentCustodianUid || '') !== technicianUser.uid
      && linesSnap.docs.length > 0
      && linesSnap.docs.every(doc => ['ASSIGNED', 'REWORK_REQUIRED'].includes(String(doc.data()?.status || 'ASSIGNED')));
    if (currentStatus !== 'ASSIGNED' && currentStatus !== 'DRAFT' && currentStatus !== 'QC_FAILED_REWORK' && !staleAcceptanceRecovery) {
      throw new Error(`INVALID_STATUS: Phiếu kỹ thuật đang ở trạng thái "${woData.status}", không thể xác nhận nhận máy.`);
    }

    const techLocationId = String(woData.destinationLocationId || '').trim();
    if (!techLocationId) throw new Error('DESTINATION_TECH_WAREHOUSE_REQUIRED');
    const techWarehouseSnap = await transaction.get(db.collection('warehouses').doc(techLocationId));
    if (!techWarehouseSnap.exists) throw new Error('DESTINATION_TECH_WAREHOUSE_NOT_FOUND');
    const techWarehouse = techWarehouseSnap.data()!;
    const techWarehouseBranchId = String(techWarehouse.branchId || techWarehouse.owningBranchId || '');
    const destinationCustodianUid = String(techWarehouse.custodianUid || techWarehouse.technicianUid || techWarehouse.technicianId || '');
    if (techWarehouse.isActive === false || techWarehouseBranchId !== String(woData.branchId || '') || !['TECHNICIAN_SUB', 'REPAIR_WARRANTY'].includes(String(techWarehouse.type || ''))) {
      throw new Error('DESTINATION_TECH_WAREHOUSE_INVALID');
    }
    if (String(techWarehouse.type || '') === 'TECHNICIAN_SUB' && destinationCustodianUid !== technicianUser.uid && !['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(String(technicianUser.role || '').toUpperCase())) {
      throw new Error('TECHNICIAN_WAREHOUSE_CUSTODIAN_MISMATCH');
    }

    const now = new Date().toISOString();

    // Update Work Order
    transaction.update(woRef, {
      status: 'ACCEPTED',
      currentCustodianUid: technicianUser.uid,
      currentCustodianName: technicianUser.name || 'Kỹ thuật viên',
      currentLocationId: techLocationId,
      acceptedAt: now,
      preRepairInspection: preRepairInspection ? {
        ...preRepairInspection,
        inspectedAt: now,
        technicianId: technicianUser.uid
      } : {
        recorded: false,
        technicianId: technicianUser.uid,
        acceptedAt: now
      },
      updatedAt: FieldValue.serverTimestamp()
    });

    // Update task lines assigned to this technician
    for (const doc of linesSnap.docs) {
      const lData = doc.data();
      if (lData.assigneeUid === technicianUser.uid && (lData.status === 'ASSIGNED' || lData.status === 'REWORK_REQUIRED')) {
        transaction.update(doc.ref, {
          status: 'ACCEPTED',
          acceptedAt: now,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    // Update Device Document
    if (woData.deviceId) {
      const devRef = db.collection('devices').doc(woData.deviceId);
      transaction.update(devRef, {
        ...(woData.assetOwnership === 'COMPANY' ? { status: 'in_repair' } : {}),
        serviceStatus: 'IN_REPAIR',
        currentCustodian: technicianUser.name || 'Kỹ thuật viên',
        currentCustodianUid: technicianUser.uid,
        technicianAssigned: technicianUser.name || 'Kỹ thuật viên',
        currentLocationId: techLocationId,
        warehouseId: techLocationId,
        warehouse: techLocationId,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    // Record Immutable Inventory Movement
    const movId = `MOV_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    transaction.set(db.collection('inventoryMovements').doc(movId), {
      id: movId,
      deviceId: woData.deviceId,
      imei: woData.imei,
      branchId: woData.branchId,
      movementType: staleAcceptanceRecovery ? 'TECH_ACCEPT_CORRECTION' : 'TECH_ACCEPT',
      fromLocationId: staleAcceptanceRecovery
        ? (woData.sourceWarehouseId || woData.currentLocationId || null)
        : (woData.currentLocationId || woData.sourceWarehouseId || null),
      toLocationId: techLocationId,
      fromCustodianUid: woData.currentCustodianUid,
      toCustodianUid: technicianUser.uid,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      workOrderId,
      performedByUid: technicianUser.uid,
      confirmedByUid: technicianUser.uid,
      correctionReason: staleAcceptanceRecovery ? 'Khôi phục nhận máy: phiếu từng được xác nhận bởi tài khoản không được giao task.' : null,
      occurredAt: now,
      createdAt: FieldValue.serverTimestamp()
    });

    return { success: true, workOrderId };
  });
}

export async function processRequestTechnicalHandoff(
  db: Firestore,
  workOrderId: string,
  input: {
    targetWarehouseId: string;
    targetTechnicianUid: string;
    targetTechnicianName?: string;
    scannedImei: string;
    reason: string;
    handoverPhotoUrls?: string[];
    idempotencyKey: string;
  },
  actor: { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] }
): Promise<{ handoff: any; idempotentReplay?: boolean }> {
  const reason = String(input.reason || '').trim();
  const targetWarehouseId = String(input.targetWarehouseId || '').trim();
  const targetTechnicianUid = String(input.targetTechnicianUid || '').trim();
  const key = String(input.idempotencyKey || '').trim();
  if (!targetWarehouseId || !targetTechnicianUid || reason.length < 5) throw new Error('TECH_HANDOFF_FIELDS_REQUIRED');
  if (key.length < 8 || key.length > 160) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  const handoverPhotoUrls = Array.isArray(input.handoverPhotoUrls) ? input.handoverPhotoUrls : [];
  if (handoverPhotoUrls.length > 6 || handoverPhotoUrls.some(url => !isTechnicalEvidenceUrlForWorkOrder(url, workOrderId))) {
    throw new Error('TECH_HANDOFF_EVIDENCE_INVALID');
  }
  const idemId = crypto.createHash('sha256').update(`TECH_HANDOFF_REQUEST:${workOrderId}:${key}`).digest('hex');
  const idemRef = db.collection('technicalOperationIdempotency').doc(idemId);
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const targetWarehouseRef = db.collection('warehouses').doc(targetWarehouseId);
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists) {
      const replay = await transaction.get(db.collection('technicalCustodyHandovers').doc(String(idemSnap.data()?.handoffId || '')));
      if (!replay.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { handoff: { id: replay.id, ...replay.data() }, idempotentReplay: true };
    }
    const [woSnap, targetWarehouseSnap, linesSnap, issuesSnap, reservationsSnap] = await Promise.all([
      transaction.get(woRef),
      transaction.get(targetWarehouseRef),
      transaction.get(db.collection('technicalWorkOrderLines').where('workOrderId', '==', workOrderId)),
      transaction.get(db.collection('technicalPartIssues').where('workOrderId', '==', workOrderId)),
      transaction.get(db.collection('technicalPartReservations').where('workOrderId', '==', workOrderId))
    ]);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!targetWarehouseSnap.exists) throw new Error('TARGET_TECH_WAREHOUSE_NOT_FOUND');
    const workOrder = woSnap.data()!;
    const targetWarehouse = targetWarehouseSnap.data()!;
    if (String(input.scannedImei || '').trim() !== String(workOrder.imei || '').trim()) throw new Error('IMEI_MISMATCH');
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    const role = String(actor.role || '').toUpperCase();
    const mayRequest = workOrder.currentCustodianUid === actor.uid || ['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(role);
    if (!mayRequest) throw new Error('TECH_HANDOFF_REQUEST_FORBIDDEN');
    if (workOrder.activeHandoffId) throw new Error('TECH_HANDOFF_ALREADY_PENDING');
    if (!['ACCEPTED', 'DIAGNOSING', 'IN_PROGRESS', 'QC_FAILED_REWORK'].includes(String(workOrder.status || ''))) throw new Error('WORK_ORDER_NOT_OPEN_FOR_HANDOFF');
    const targetWarehouseBranchId = String(targetWarehouse.branchId || targetWarehouse.owningBranchId || '');
    const targetCustodianUid = String(targetWarehouse.custodianUid || targetWarehouse.technicianUid || targetWarehouse.technicianId || '');
    if (targetWarehouse.isActive === false || targetWarehouse.isArchived === true || targetWarehouseBranchId !== String(workOrder.branchId || '') || String(targetWarehouse.type || '') !== 'TECHNICIAN_SUB') {
      throw new Error('TARGET_TECH_WAREHOUSE_INVALID');
    }
    if (!targetCustodianUid || targetCustodianUid !== targetTechnicianUid) throw new Error('TARGET_TECHNICIAN_WAREHOUSE_MISMATCH');
    if (targetTechnicianUid === workOrder.currentCustodianUid || targetWarehouseId === workOrder.currentLocationId) throw new Error('TECH_HANDOFF_TARGET_SAME_AS_CURRENT');
    const openLines = linesSnap.docs.filter(doc => !['COMPLETED', 'VERIFIED', 'CANCELLED'].includes(String(doc.data().status || '')));
    if (openLines.length === 0) throw new Error('TECH_HANDOFF_NO_OPEN_TASKS');
    if (openLines.some(doc => String(doc.data().status || '') === 'IN_PROGRESS')) throw new Error('TECH_HANDOFF_PAUSE_ACTIVE_TASK_REQUIRED');
    if (issuesSnap.docs.some(doc => {
      const issue = doc.data();
      return issue.status !== 'CANCELLED' && Number(issue.quantityIssued || 0) !== Number(issue.quantityConsumed || 0) + Number(issue.quantityReturned || 0) + Number(issue.quantityScrapped || 0);
    })) throw new Error('TECH_HANDOFF_PART_ISSUES_NOT_SETTLED');
    if (reservationsSnap.docs.some(doc => {
      const reservation = doc.data();
      return Number(reservation.quantityReserved || 0) !== Number(reservation.quantityIssued || 0) + Number(reservation.quantityCancelled || 0);
    })) throw new Error('TECH_HANDOFF_PART_RESERVATIONS_NOT_SETTLED');
    const now = new Date().toISOString();
    const handoffId = `TCH_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const handoff = {
      id: handoffId,
      workOrderId,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      fromWarehouseId: workOrder.currentLocationId || workOrder.destinationLocationId || null,
      fromTechnicianUid: workOrder.currentCustodianUid || null,
      fromTechnicianName: workOrder.currentCustodianName || null,
      targetWarehouseId,
      targetTechnicianUid,
      targetTechnicianName: String(input.targetTechnicianName || targetWarehouse.custodianName || targetWarehouse.technicianName || '').trim(),
      reason,
      requestPhotoUrls: handoverPhotoUrls,
      requestedByUid: actor.uid,
      requestedByName: actor.name || null,
      requestedAt: now,
      status: 'PENDING_ACCEPTANCE',
      createdAt: now,
      updatedAt: now
    };
    transaction.set(db.collection('technicalCustodyHandovers').doc(handoffId), handoff);
    transaction.update(woRef, { activeHandoffId: handoffId, custodyHandoffStatus: 'PENDING_ACCEPTANCE', updatedAt: FieldValue.serverTimestamp() });
    transaction.set(idemRef, { scope: 'TECH_HANDOFF_REQUEST', workOrderId, handoffId, createdAt: now });
    return { handoff };
  });
}

export async function processAcceptTechnicalHandoff(
  db: Firestore,
  handoffId: string,
  input: { scannedImei: string; handoverPhotoUrls?: string[]; notes?: string; idempotencyKey: string },
  actor: { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] }
): Promise<{ handoff: any; reassignedLineIds: string[]; idempotentReplay?: boolean }> {
  const key = String(input.idempotencyKey || '').trim();
  if (key.length < 8 || key.length > 160) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  const handoffRef = db.collection('technicalCustodyHandovers').doc(handoffId);
  const idemRef = db.collection('technicalOperationIdempotency').doc(crypto.createHash('sha256').update(`TECH_HANDOFF_ACCEPT:${handoffId}:${key}`).digest('hex'));
  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    const handoffSnap = await transaction.get(handoffRef);
    if (!handoffSnap.exists) throw new Error('TECH_HANDOFF_NOT_FOUND');
    if (idemSnap.exists) return { handoff: { id: handoffSnap.id, ...handoffSnap.data() }, reassignedLineIds: idemSnap.data()?.reassignedLineIds || [], idempotentReplay: true };
    const handoff = handoffSnap.data()!;
    if (handoff.status !== 'PENDING_ACCEPTANCE') throw new Error('TECH_HANDOFF_NOT_PENDING');
    if (handoff.targetTechnicianUid !== actor.uid) throw new Error('TECH_HANDOFF_TARGET_ONLY');
    const handoverPhotoUrls = Array.isArray(input.handoverPhotoUrls) ? input.handoverPhotoUrls : [];
    if (handoverPhotoUrls.length > 6 || handoverPhotoUrls.some(url => !isTechnicalEvidenceUrlForWorkOrder(url, String(handoff.workOrderId || '')))) {
      throw new Error('TECH_HANDOFF_EVIDENCE_INVALID');
    }
    if (String(input.scannedImei || '').trim() !== String(handoff.imei || '').trim()) throw new Error('IMEI_MISMATCH');
    const woRef = db.collection('technicalWorkOrders').doc(String(handoff.workOrderId));
    const targetWarehouseRef = db.collection('warehouses').doc(String(handoff.targetWarehouseId));
    const [woSnap, targetWarehouseSnap, linesSnap, commissionsSnap] = await Promise.all([
      transaction.get(woRef),
      transaction.get(targetWarehouseRef),
      transaction.get(db.collection('technicalWorkOrderLines').where('workOrderId', '==', handoff.workOrderId)),
      transaction.get(db.collection('commissionLedger').where('workOrderId', '==', handoff.workOrderId))
    ]);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!targetWarehouseSnap.exists) throw new Error('TARGET_TECH_WAREHOUSE_NOT_FOUND');
    const workOrder = woSnap.data()!;
    const targetWarehouse = targetWarehouseSnap.data()!;
    if (workOrder.activeHandoffId !== handoffId) throw new Error('TECH_HANDOFF_WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    const targetCustodianUid = String(targetWarehouse.custodianUid || targetWarehouse.technicianUid || targetWarehouse.technicianId || '');
    if (targetWarehouse.isActive === false || targetWarehouse.isArchived === true || String(targetWarehouse.type || '') !== 'TECHNICIAN_SUB' || targetCustodianUid !== actor.uid) {
      throw new Error('TARGET_TECH_WAREHOUSE_INVALID');
    }
    const now = new Date().toISOString();
    const reassignedLineIds: string[] = [];
    for (const lineDoc of linesSnap.docs) {
      const line = lineDoc.data();
      if (['COMPLETED', 'VERIFIED', 'CANCELLED'].includes(String(line.status || ''))) continue;
      if (line.assigneeUid !== handoff.fromTechnicianUid) continue;
      reassignedLineIds.push(lineDoc.id);
      transaction.update(lineDoc.ref, {
        assigneeUid: actor.uid,
        assigneeName: actor.name || handoff.targetTechnicianName || 'Kỹ thuật viên',
        reassignmentHistory: [
          ...(Array.isArray(line.reassignmentHistory) ? line.reassignmentHistory : []),
          { handoffId, fromUid: handoff.fromTechnicianUid || null, toUid: actor.uid, acceptedAt: now }
        ],
        handoffAcceptedAt: now,
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    if (reassignedLineIds.length === 0) throw new Error('TECH_HANDOFF_NO_REASSIGNABLE_TASKS');
    for (const commissionDoc of commissionsSnap.docs) {
      const commission = commissionDoc.data();
      if (commission.status !== 'PENDING' || !reassignedLineIds.includes(String(commission.workOrderLineId || ''))) continue;
      transaction.update(commissionDoc.ref, {
        staffUid: actor.uid,
        staffName: actor.name || handoff.targetTechnicianName || 'Kỹ thuật viên',
        custodyHandoffId: handoffId,
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    transaction.update(woRef, {
      currentCustodianUid: actor.uid,
      currentCustodianName: actor.name || handoff.targetTechnicianName || 'Kỹ thuật viên',
      currentLocationId: handoff.targetWarehouseId,
      destinationLocationId: handoff.targetWarehouseId,
      activeHandoffId: FieldValue.delete(),
      custodyHandoffStatus: 'ACCEPTED',
      lastCustodyHandoffId: handoffId,
      updatedAt: FieldValue.serverTimestamp()
    });
    if (workOrder.deviceId) {
      transaction.update(db.collection('devices').doc(String(workOrder.deviceId)), {
        currentCustodianUid: actor.uid,
        currentCustodian: actor.name || handoff.targetTechnicianName || 'Kỹ thuật viên',
        technicianAssigned: actor.name || handoff.targetTechnicianName || 'Kỹ thuật viên',
        currentLocationId: handoff.targetWarehouseId,
        warehouseId: handoff.targetWarehouseId,
        warehouse: handoff.targetWarehouseId,
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    const movementId = `MOV_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    transaction.set(db.collection('inventoryMovements').doc(movementId), {
      id: movementId,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei,
      branchId: workOrder.branchId,
      movementType: 'TECH_CUSTODY_HANDOFF',
      fromLocationId: handoff.fromWarehouseId || null,
      toLocationId: handoff.targetWarehouseId,
      fromCustodianUid: handoff.fromTechnicianUid || null,
      toCustodianUid: actor.uid,
      sourceType: 'WORK_ORDER',
      sourceId: handoff.workOrderId,
      workOrderId: handoff.workOrderId,
      handoffId,
      performedByUid: actor.uid,
      confirmedByUid: actor.uid,
      occurredAt: now,
      createdAt: FieldValue.serverTimestamp()
    });
    const acceptedHandoff = {
      ...handoff,
      status: 'ACCEPTED',
      acceptancePhotoUrls: handoverPhotoUrls,
      acceptanceNotes: String(input.notes || ''),
      acceptedByUid: actor.uid,
      acceptedByName: actor.name || handoff.targetTechnicianName || null,
      acceptedAt: now,
      reassignedLineIds,
      updatedAt: now
    };
    transaction.update(handoffRef, {
      status: acceptedHandoff.status,
      acceptancePhotoUrls: acceptedHandoff.acceptancePhotoUrls,
      acceptanceNotes: acceptedHandoff.acceptanceNotes,
      acceptedByUid: acceptedHandoff.acceptedByUid,
      acceptedByName: acceptedHandoff.acceptedByName,
      acceptedAt: now,
      reassignedLineIds,
      updatedAt: now
    });
    transaction.set(idemRef, { scope: 'TECH_HANDOFF_ACCEPT', workOrderId: handoff.workOrderId, handoffId, reassignedLineIds, createdAt: now });
    return { handoff: acceptedHandoff, reassignedLineIds };
  });
}

/**
 * 3. Start a specific work order line with strict State Machine & URL verification
 */
export async function processStartTaskLine(
  db: Firestore,
  workOrderId: string,
  lineId: string,
  technicianUser: { uid: string; role?: string; branchId?: string; assignedBranchIds?: string[] }
): Promise<{ success: boolean; lineId: string }> {
  return await db.runTransaction(async (transaction) => {
    const lineRef = db.collection('technicalWorkOrderLines').doc(lineId);
    const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const [lineSnap, woSnap] = await Promise.all([transaction.get(lineRef), transaction.get(woRef)]);
    if (!lineSnap.exists) {
      throw new Error(`LINE_NOT_FOUND: Không tìm thấy hạng mục công việc "${lineId}".`);
    }
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const lineData = lineSnap.data()!;
    const workOrder = woSnap.data()!;

    // Parent-Child URL Verification
    if (lineData.workOrderId !== workOrderId) {
      throw new Error(`WORK_ORDER_MISMATCH: Hạng mục "${lineId}" không thuộc phiếu kỹ thuật "${workOrderId}".`);
    }
    assertTaskCustodyAuthority(workOrder, lineData, technicianUser);

    const activeSessionsQuery = db.collection('technicalTaskSessions').where('lineId', '==', lineId).where('status', '==', 'ACTIVE').limit(1);
    const activeSessionsSnap = await transaction.get(activeSessionsQuery);

    // State Machine Validation
    const transition = canTransitionTaskLine(lineData.status as TaskLineStatus, 'IN_PROGRESS');
    if (!transition.allowed) {
      throw new Error(transition.reason);
    }

    const now = new Date().toISOString();
    if (!activeSessionsSnap.empty) throw new Error('TASK_SESSION_ALREADY_ACTIVE');
    const sessionId = `TTS_${lineId}_${Date.now()}`;
    transaction.update(lineRef, {
      status: 'IN_PROGRESS',
      ...(!lineData.firstStartedAt && !lineData.startedAt ? { firstStartedAt: now, startedAt: now } : {}),
      lastStartedAt: now,
      activeSessionId: sessionId,
      updatedAt: FieldValue.serverTimestamp()
    });
    transaction.create(db.collection('technicalTaskSessions').doc(sessionId), {
      id: sessionId, workOrderId, lineId, technicianUid: technicianUser.uid,
      branchId: workOrder.branchId,
      startedAt: now, endedAt: null, endReason: null, durationMinutes: 0,
      status: 'ACTIVE', createdAt: FieldValue.serverTimestamp()
    });

    // Update parent work order status to IN_PROGRESS
    transaction.update(woRef, {
      status: 'IN_PROGRESS',
      updatedAt: FieldValue.serverTimestamp()
    });

    return { success: true, lineId };
  });
}

/**
 * A technician can explicitly pause only the affected task while waiting for
 * stock, a supplier confirmation, or a replacement part.  This keeps the
 * Kanban truthful without stopping other tasks on the same device.
 */
export async function processMarkTaskWaitingForParts(
  db: Firestore,
  workOrderId: string,
  lineId: string,
  reasonInput: string,
  actor: { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] },
  idempotencyKeyInput: string
): Promise<{ success: boolean; lineId: string; status: 'WAITING_PARTS'; idempotentReplay?: boolean }> {
  const reason = String(reasonInput || '').trim();
  if (reason.length < 5) throw new Error('PARTS_WAITING_REASON_REQUIRED');
  const key = requireTechnicalIdempotencyKey(idempotencyKeyInput);
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const lineRef = db.collection('technicalWorkOrderLines').doc(lineId);
  const idemRef = db.collection('technicalOperationIdempotency').doc(technicalIdempotencyId(`TASK_WAITING_PARTS:${workOrderId}:${lineId}`, key));
  return db.runTransaction(async transaction => {
    const [idemSnap, woSnap, lineSnap] = await Promise.all([
      transaction.get(idemRef),
      transaction.get(woRef),
      transaction.get(lineRef)
    ]);
    if (idemSnap.exists) return { success: true, lineId, status: 'WAITING_PARTS' as const, idempotentReplay: true };
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!lineSnap.exists) throw new Error('LINE_NOT_FOUND');
    const workOrder = woSnap.data()!;
    const line = lineSnap.data()!;
    const activeSessionRef = line.activeSessionId ? db.collection('technicalTaskSessions').doc(String(line.activeSessionId)) : null;
    const activeSessionSnap = activeSessionRef ? await transaction.get(activeSessionRef) : null;
    if (String(line.workOrderId || '') !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    assertTaskCustodyAuthority(workOrder, line, actor);
    const transition = canTransitionTaskLine(line.status as TaskLineStatus, 'WAITING_PARTS');
    if (!transition.allowed) throw new Error(transition.reason || 'TASK_WAITING_PARTS_TRANSITION_INVALID');
    const now = new Date().toISOString();
    const sessionDurationMinutes = activeSessionSnap?.exists
      ? Math.max(0, Math.round((Date.parse(now) - Date.parse(String(activeSessionSnap.data()?.startedAt || now))) / 60_000))
      : 0;
    transaction.update(lineRef, {
      status: 'WAITING_PARTS',
      partsWaitingAt: now,
      partsWaitingReason: reason,
      activeSessionId: null,
      activeWorkMinutes: Number(line.activeWorkMinutes || 0) + sessionDurationMinutes,
      updatedAt: FieldValue.serverTimestamp()
    });
    if (activeSessionRef && activeSessionSnap?.exists) transaction.update(activeSessionRef, {
      status: 'CLOSED', endedAt: now, endReason: 'WAITING_PARTS', durationMinutes: sessionDurationMinutes, updatedAt: FieldValue.serverTimestamp()
    });
    transaction.update(woRef, { status: 'IN_PROGRESS', updatedAt: FieldValue.serverTimestamp() });
    transaction.set(db.collection('technicalWorkOrderEvents').doc(`EVT_PARTS_WAIT_${lineId}_${Date.now()}`), {
      workOrderId,
      branchId: workOrder.branchId,
      lineId,
      eventType: 'TASK_WAITING_PARTS',
      reason,
      actorUid: actor.uid,
      actorName: actor.name || actor.uid,
      occurredAt: now,
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.set(idemRef, { scope: 'TASK_WAITING_PARTS', workOrderId, lineId, createdAt: now });
    return { success: true, lineId, status: 'WAITING_PARTS' as const };
  });
}

/**
 * KTV reports a newly discovered fault.  It deliberately creates a pending
 * request first: no hidden task, commission, cost or customer charge appears
 * until a supervisor approves it.
 */
export async function processCreateTechnicalTaskAdditionRequest(
  db: Firestore,
  workOrderId: string,
  input: TechnicalTaskAdditionInput,
  actor: { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] }
): Promise<{ request: any; idempotentReplay?: boolean }> {
  const taskType = String(input.taskType || '').trim();
  const reason = String(input.reason || '').trim();
  const key = requireTechnicalIdempotencyKey(input.idempotencyKey);
  const evidencePhotoUrls = Array.isArray(input.evidencePhotoUrls)
    ? input.evidencePhotoUrls.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  const additionalCustomerQuote = Number(input.additionalCustomerQuote || 0);
  if (!taskType || reason.length < 10) throw new Error('TASK_ADDITION_FIELDS_REQUIRED');
  if (!Number.isFinite(additionalCustomerQuote) || additionalCustomerQuote < 0) throw new Error('TASK_ADDITION_QUOTE_INVALID');
  if (evidencePhotoUrls.length > 6 || evidencePhotoUrls.some(url => !isTechnicalEvidenceUrlForWorkOrder(url, workOrderId))) {
    throw new Error('TASK_ADDITION_EVIDENCE_INVALID');
  }
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const configRef = db.collection('technicalTaskTypes').doc(taskType);
  const linesQuery = db.collection('technicalWorkOrderLines').where('workOrderId', '==', workOrderId);
  const idemRef = db.collection('technicalOperationIdempotency').doc(technicalIdempotencyId(`TASK_ADDITION_CREATE:${workOrderId}`, key));
  return db.runTransaction(async transaction => {
    const [idemSnap, woSnap, configSnap, linesSnap] = await Promise.all([
      transaction.get(idemRef),
      transaction.get(woRef),
      transaction.get(configRef),
      transaction.get(linesQuery)
    ]);
    if (idemSnap.exists) {
      const requestRef = db.collection('technicalTaskAdditionRequests').doc(String(idemSnap.data()?.requestId || ''));
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { request: requestSnap.data(), idempotentReplay: true };
    }
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!configSnap.exists) throw new Error('TASK_TYPE_NOT_CONFIGURED');
    const workOrder = woSnap.data()!;
    const config = { id: configSnap.id, ...configSnap.data() } as TechnicalTaskTypeRecord;
    const lines = linesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    if (isClosedWorkOrder(workOrder.status)) throw new Error('WORK_ORDER_CLOSED_CREATE_NEW_WORK_ORDER');
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (config.isActive === false) throw new Error('TASK_TYPE_INACTIVE');
    const assignedLine = lines.find(line => String(line.assigneeUid || '') === actor.uid)
      || lines.find(line => String(line.assigneeUid || '') === String(workOrder.currentCustodianUid || ''))
      || lines[0];
    if (!assignedLine || (!isTechnicalSupervisor(actor) && String(assignedLine.assigneeUid || '') !== actor.uid)) {
      throw new Error('TECHNICIAN_NOT_ASSIGNED');
    }
    if (!isTechnicalSupervisor(actor)) {
      if (!['ACCEPTED', 'IN_PROGRESS', 'QC_FAILED_REWORK'].includes(String(workOrder.status || ''))) throw new Error('CUSTODY_ACCEPTANCE_REQUIRED');
      if (String(workOrder.currentCustodianUid || '') !== actor.uid || workOrder.activeHandoffId) throw new Error('CURRENT_CUSTODIAN_REQUIRED');
    }
    const now = new Date().toISOString();
    const requestId = `TAR_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const request = {
      id: requestId,
      status: 'PENDING',
      workOrderId,
      branchId: workOrder.branchId,
      taskType,
      taskCode: config.taskCode || taskType,
      taskName: config.name || taskType,
      priority: input.priority || 'NORMAL',
      reason,
      evidencePhotoUrls,
      additionalCustomerQuote,
      assigneeUid: assignedLine.assigneeUid,
      assigneeName: assignedLine.assigneeName || workOrder.currentCustodianName || null,
      requestedByUid: actor.uid,
      requestedByName: actor.name || actor.uid,
      requestedAt: now,
      createdAt: now,
      updatedAt: now
    };
    transaction.set(db.collection('technicalTaskAdditionRequests').doc(requestId), request);
    transaction.set(db.collection('technicalWorkOrderEvents').doc(`EVT_TASK_ADD_REQUEST_${requestId}`), {
      workOrderId,
      branchId: workOrder.branchId,
      eventType: 'TASK_ADDITION_REQUESTED',
      requestId,
      taskType,
      taskName: request.taskName,
      reason,
      actorUid: actor.uid,
      actorName: actor.name || actor.uid,
      occurredAt: now,
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.set(idemRef, { scope: 'TASK_ADDITION_CREATE', workOrderId, requestId, createdAt: now });
    return { request };
  });
}

export async function processDecideTechnicalTaskAdditionRequest(
  db: Firestore,
  workOrderId: string,
  requestId: string,
  input: {
    decision: 'APPROVED' | 'REJECTED';
    note?: string;
    customerApprovalConfirmed?: boolean;
    additionalCustomerQuote?: number;
    idempotencyKey: string;
  },
  actor: { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] }
): Promise<{ request: any; lineId?: string; idempotentReplay?: boolean }> {
  if (!isTechnicalSupervisor(actor)) throw new Error('TASK_ADDITION_APPROVAL_FORBIDDEN');
  const decision = String(input.decision || '').toUpperCase() as 'APPROVED' | 'REJECTED';
  const key = requireTechnicalIdempotencyKey(input.idempotencyKey);
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new Error('TASK_ADDITION_DECISION_INVALID');
  const note = String(input.note || '').trim();
  const additionalCustomerQuote = Number(input.additionalCustomerQuote || 0);
  if (!Number.isFinite(additionalCustomerQuote) || additionalCustomerQuote < 0) throw new Error('TASK_ADDITION_QUOTE_INVALID');
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const requestRef = db.collection('technicalTaskAdditionRequests').doc(requestId);
  const idemRef = db.collection('technicalOperationIdempotency').doc(technicalIdempotencyId(`TASK_ADDITION_DECISION:${requestId}`, key));
  return db.runTransaction(async transaction => {
    const [idemSnap, woSnap, requestSnap] = await Promise.all([
      transaction.get(idemRef),
      transaction.get(woRef),
      transaction.get(requestRef)
    ]);
    if (idemSnap.exists) {
      if (!requestSnap.exists) throw new Error('IDEMPOTENCY_RECORD_CORRUPTED');
      return { request: requestSnap.data(), lineId: String(idemSnap.data()?.lineId || '') || undefined, idempotentReplay: true };
    }
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!requestSnap.exists) throw new Error('TASK_ADDITION_REQUEST_NOT_FOUND');
    const workOrder = woSnap.data()!;
    const request = requestSnap.data()!;
    if (String(request.workOrderId || '') !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(workOrder.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (String(request.status || '') !== 'PENDING') throw new Error('TASK_ADDITION_ALREADY_DECIDED');
    if (isClosedWorkOrder(workOrder.status)) throw new Error('WORK_ORDER_CLOSED_CREATE_NEW_WORK_ORDER');
    if (String(workOrder.costPostingStatus || '') === 'POSTED') throw new Error('COST_ALREADY_POSTED_CREATE_NEW_WORK_ORDER_OR_REVERSAL');
    const configRef = db.collection('technicalTaskTypes').doc(String(request.taskType || ''));
    const linesQuery = db.collection('technicalWorkOrderLines').where('workOrderId', '==', workOrderId);
    // Transaction reads must all happen before the first write.
    const [configSnap, linesSnap] = await Promise.all([transaction.get(configRef), transaction.get(linesQuery)]);
    if (!configSnap.exists) throw new Error('TASK_TYPE_NOT_CONFIGURED');
    const config = { id: configSnap.id, ...configSnap.data() } as TechnicalTaskTypeRecord;
    if (config.isActive === false) throw new Error('TASK_TYPE_INACTIVE');
    const existingLines = linesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    if (decision === 'REJECTED') {
      const rejected = { ...request, status: 'REJECTED', decisionNote: note, decidedByUid: actor.uid, decidedByName: actor.name || actor.uid, decidedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      transaction.update(requestRef, rejected);
      transaction.set(idemRef, { scope: 'TASK_ADDITION_DECISION', requestId, createdAt: new Date().toISOString() });
      return { request: rejected };
    }
    if (String(workOrder.workOrderType || '') === 'CUSTOMER_SERVICE' && input.customerApprovalConfirmed !== true) {
      throw new Error('CUSTOMER_APPROVAL_REQUIRED_FOR_ADDITIONAL_TASK');
    }
    const priority = (request.priority || 'NORMAL') as TechnicalPriority;
    const quote = calculateTechnicalTaskQuote(config, priority, new Date().toISOString());
    const now = new Date().toISOString();
    const lineId = `WOL_${workOrderId}_ADD_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const assignedLine = existingLines.find(line => String(line.assigneeUid || '') === String(request.assigneeUid || '')) || existingLines[0];
    if (!assignedLine) throw new Error('WORK_ORDER_LINES_REQUIRED');
    const shouldReopen = ['TECH_COMPLETED', 'QC_PENDING', 'QC_PASSED', 'CUSTOMER_READY', 'QC_FAILED_REWORK'].includes(String(workOrder.status || ''));
    const addedLine = {
      id: lineId,
      workOrderId,
      deviceId: workOrder.deviceId || null,
      imei: workOrder.imei,
      model: workOrder.model,
      modelCode: workOrder.modelCode || null,
      catalogModelCode: workOrder.catalogModelCode || null,
      branchId: workOrder.branchId,
      taskType: String(request.taskType),
      taskCode: config.taskCode,
      taskName: config.name,
      priority,
      assigneeUid: request.assigneeUid || assignedLine.assigneeUid,
      assigneeName: request.assigneeName || assignedLine.assigneeName,
      ratePolicyId: config.id,
      ratePolicyVersion: config.version,
      commissionAmount: quote.commissionAmount,
      laborCostToDevice: quote.laborCostToDevice,
      capitalizeLaborCost: quote.capitalizeLaborCost,
      reworkCommissionPolicy: config.reworkCommissionPolicy || 'NO_EXTRA_COMMISSION',
      quoteGate: config.quoteGate || (String(workOrder.workOrderType || '') === 'CUSTOMER_SERVICE' ? 'APPROVAL_REQUIRED' : 'NOT_APPLICABLE'),
      status: 'ASSIGNED',
      requiredParts: config.requiredPartTemplates || [],
      intakeIssueTypes: config.intakeIssueTypes || [],
      requiredEvidenceTypes: config.requiredEvidenceTypes || [],
      qcChecklistTemplateId: config.qcChecklistTemplateId || null,
      qcChecklistSnapshot: {
        templateId: config.qcChecklistTemplateId || 'QC_STANDARD_12_STEPS_V2',
        version: config.version,
        taskSpecificSteps: config.qcChecklistSteps || []
      },
      slaHours: quote.slaHours,
      deadlineAt: quote.deadlineAt,
      slaPolicyId: config.id,
      slaPolicyVersion: config.version,
      priorityMultiplierSnapshot: Number(config.priorityMultiplier?.[priority] || 1),
      evidencePhotoUrls: [],
      addedAfterDiagnosis: true,
      additionRequestId: requestId,
      additionReason: request.reason,
      assignedAt: now,
      createdAt: now,
      updatedAt: now
    };
    const approved = {
      ...request,
      status: 'APPROVED',
      decisionNote: note,
      customerApprovalConfirmed: String(workOrder.workOrderType || '') === 'CUSTOMER_SERVICE' ? true : null,
      additionalCustomerQuote,
      lineId,
      decidedByUid: actor.uid,
      decidedByName: actor.name || actor.uid,
      decidedAt: now,
      updatedAt: now
    };
    transaction.set(db.collection('technicalWorkOrderLines').doc(lineId), addedLine);
    transaction.set(db.collection('commissionLedger').doc(`COMM_${lineId}`), {
      id: `COMM_${lineId}`,
      staffUid: addedLine.assigneeUid,
      staffName: addedLine.assigneeName,
      workOrderId,
      workOrderLineId: lineId,
      workOrderType: workOrder.workOrderType,
      branchId: workOrder.branchId,
      imei: workOrder.imei,
      taskCode: config.taskCode,
      taskName: config.name,
      amount: quote.commissionAmount,
      commissionPayable: quote.commissionAmount,
      laborCostToDevice: quote.laborCostToDevice,
      capitalizeToDevice: quote.capitalizeLaborCost,
      policyId: config.id,
      policyVersion: config.version,
      reworkCycle: Number(workOrder.reworkCount || 0),
      status: 'PENDING',
      eligibilityRequiresStockReturn: workOrder.eligibilityRequiresStockReturn === true,
      eligibilityRequiresCustomerDelivery: workOrder.eligibilityRequiresCustomerDelivery === true,
      assignedAt: now,
      assignedPeriod: getVietnamMonthString(now),
      payrollPeriod: null,
      eligibleAt: null,
      eligibilityReason: null,
      additionRequestId: requestId,
      createdAt: now
    });
    transaction.update(requestRef, approved);
    transaction.update(woRef, {
      taskLineIds: [...new Set([...(Array.isArray(workOrder.taskLineIds) ? workOrder.taskLineIds : existingLines.map(line => line.id)), lineId])],
      totalCommissionAmount: Number(workOrder.totalCommissionAmount || 0) + quote.commissionAmount,
      ...(String(workOrder.workOrderType || '') === 'CUSTOMER_SERVICE' ? {
        proposedQuoteAmount: Number(workOrder.proposedQuoteAmount ?? workOrder.customerApprovedQuote ?? workOrder.totalEstimatedCost ?? 0) + additionalCustomerQuote,
        additionalCustomerQuote: Number(workOrder.additionalCustomerQuote || 0) + additionalCustomerQuote,
        quoteStatus: 'PENDING_APPROVAL'
      } : {}),
      ...(shouldReopen ? {
        status: 'IN_PROGRESS',
        qcStatus: 'REOPENED_FOR_ADDITIONAL_TASK',
        reopenedAt: now,
        reopenedByUid: actor.uid,
        reopenedReason: request.reason
      } : {}),
      updatedAt: now
    });
    transaction.set(db.collection('technicalWorkOrderEvents').doc(`EVT_TASK_ADD_APPROVED_${requestId}`), {
      workOrderId,
      branchId: workOrder.branchId,
      eventType: shouldReopen ? 'WORK_ORDER_REOPENED_FOR_ADDITIONAL_TASK' : 'TASK_ADDITION_APPROVED',
      requestId,
      lineId,
      taskType: request.taskType,
      taskName: config.name,
      reason: request.reason,
      actorUid: actor.uid,
      actorName: actor.name || actor.uid,
      occurredAt: now,
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.set(idemRef, { scope: 'TASK_ADDITION_DECISION', requestId, lineId, createdAt: now });
    return { request: approved, lineId };
  });
}

/**
 * 4. Complete a work order line with evidence photos
 */
export async function processCompleteTaskLine(
  db: Firestore,
  workOrderId: string,
  lineId: string,
  evidencePhotoUrls: string[],
  notes: string,
  technicianUser: TechnicalActor,
  completionMetadata: {
    replacementSerials?: string[];
    postRepairMetrics?: Record<string, string | number | boolean | null>;
  } = {}
): Promise<{ success: boolean; lineId: string; workOrderId: string; allLinesCompleted: boolean }> {
  return await db.runTransaction(async (transaction) => {
    const lineRef = db.collection('technicalWorkOrderLines').doc(lineId);
    const lineSnap = await transaction.get(lineRef);
    if (!lineSnap.exists) {
      throw new Error(`LINE_NOT_FOUND: Không tìm thấy hạng mục công việc "${lineId}".`);
    }

    const lineData = lineSnap.data()!;

    // Parent-Child URL Verification
    if (lineData.workOrderId !== workOrderId) {
      throw new Error(`WORK_ORDER_MISMATCH: Hạng mục "${lineId}" không thuộc phiếu kỹ thuật "${workOrderId}".`);
    }

    const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const woData = woSnap.data()!;
    assertTaskCustodyAuthority(woData, lineData, technicianUser);

    // State Machine Validation
    const transition = canTransitionTaskLine(lineData.status as TaskLineStatus, 'COMPLETED');
    if (!transition.allowed) {
      throw new Error(transition.reason);
    }

    const normalizedNotes = String(notes || '').trim();
    if (normalizedNotes.length < 10) {
      throw new Error('COMPLETION_NOTES_REQUIRED: Ghi chú kết quả phải có ít nhất 10 ký tự.');
    }

    if (!Array.isArray(evidencePhotoUrls) || evidencePhotoUrls.length > 8 || evidencePhotoUrls.some(url => !isTechnicalEvidenceUrlForWorkOrder(url, workOrderId))) {
      throw new Error('INVALID_EVIDENCE: Ảnh bằng chứng phải là tối đa 8 URL HTTPS hợp lệ.');
    }

    const requiredEvidenceTypes = Array.isArray(lineData.requiredEvidenceTypes)
      ? lineData.requiredEvidenceTypes.map((value: unknown) => String(value).toUpperCase())
      : [];

    const replacementSerials = Array.isArray(completionMetadata.replacementSerials)
      ? completionMetadata.replacementSerials.map(value => String(value).trim()).filter(Boolean)
      : [];
    if (requiredEvidenceTypes.includes('REPLACEMENT_SERIAL') && replacementSerials.length === 0) {
      throw new Error('REPLACEMENT_SERIAL_REQUIRED: Hạng mục này bắt buộc ghi serial linh kiện thay thế.');
    }
    const photoRequired = requiredEvidenceTypes.some(type => ['BEFORE_PHOTO', 'AFTER_PHOTO', 'WATER_SEAL_PHOTO', 'MIC_TEST_VIDEO'].includes(type));
    if (photoRequired && evidencePhotoUrls.length === 0) {
      throw new Error('TECHNICAL_EVIDENCE_INCOMPLETE: Hạng mục này bắt buộc có ảnh hoặc video bằng chứng.');
    }
    const metrics = completionMetadata.postRepairMetrics || {};
    if (requiredEvidenceTypes.includes('BATTERY_HEALTH_AFTER') && !Number.isFinite(Number(metrics.batteryHealth))) {
      throw new Error('TECHNICAL_EVIDENCE_INCOMPLETE: Thiếu chỉ số pin sau sửa.');
    }
    if (requiredEvidenceTypes.includes('TRUE_TONE_RESULT') && typeof metrics.trueTone !== 'boolean') {
      throw new Error('TECHNICAL_EVIDENCE_INCOMPLETE: Thiếu kết quả kiểm tra True Tone.');
    }

    // Read every dependent record before the first write (Firestore transaction invariant).
    const allLinesSnap = await transaction.get(
      db.collection('technicalWorkOrderLines').where('workOrderId', '==', workOrderId)
    );
    const partIssuesSnap = await transaction.get(
      db.collection('technicalPartIssues').where('workOrderLineId', '==', lineId)
    );
    const partReservationsSnap = await transaction.get(
      db.collection('technicalPartReservations').where('workOrderLineId', '==', lineId)
    );
    const activeSessionRef = lineData.activeSessionId ? db.collection('technicalTaskSessions').doc(String(lineData.activeSessionId)) : null;
    const activeSessionSnap = activeSessionRef ? await transaction.get(activeSessionRef) : null;
    const linkedTransferRef = woData.transferId ? db.collection('transfers').doc(woData.transferId) : null;
    const linkedTransferSnap = linkedTransferRef ? await transaction.get(linkedTransferRef) : null;

    for (const issueDoc of partIssuesSnap.docs) {
      const issue = issueDoc.data();
      if (issue.status === 'CANCELLED') continue;
      const issued = Number(issue.quantityIssued || 0);
      const settled = Number(issue.quantityConsumed || 0)
        + Number(issue.quantityReturned || 0)
        + Number(issue.quantityScrapped || 0);
      if (issued !== settled) {
        throw new Error(`PART_ISSUE_NOT_SETTLED: Linh kiện "${issue.partName || issueDoc.id}" còn ${issued - settled} đơn vị chưa xác nhận dùng, trả hoặc hỏng.`);
      }
    }
    for (const reservationDoc of partReservationsSnap.docs) {
      const reservation = reservationDoc.data();
      const reserved = Number(reservation.quantityReserved || 0);
      const settled = Number(reservation.quantityIssued || 0) + Number(reservation.quantityCancelled || 0);
      if (reserved !== settled) {
        throw new Error(`PART_RESERVATION_NOT_SETTLED: Linh kiện "${reservation.partName || reservationDoc.id}" còn ${reserved - settled} đơn vị đang giữ trước.`);
      }
    }

    let allCompleted = true;
    for (const doc of allLinesSnap.docs) {
      if (doc.id === lineId) continue;
      const status = doc.data().status;
      if (status !== 'COMPLETED' && status !== 'VERIFIED') {
        allCompleted = false;
        break;
      }
    }

    const now = new Date().toISOString();
    const sessionDurationMinutes = activeSessionSnap?.exists
      ? Math.max(0, Math.round((Date.parse(now) - Date.parse(String(activeSessionSnap.data()?.startedAt || now))) / 60_000))
      : 0;
    transaction.update(lineRef, {
      status: 'COMPLETED',
      completedAt: now,
      evidencePhotoUrls,
      completionNotes: normalizedNotes,
      completionMetadata: {
        replacementSerials,
        postRepairMetrics: completionMetadata.postRepairMetrics || {}
      },
      activeSessionId: null,
      activeWorkMinutes: Number(lineData.activeWorkMinutes || 0) + sessionDurationMinutes,
      updatedAt: FieldValue.serverTimestamp()
    });
    if (activeSessionRef && activeSessionSnap?.exists) transaction.update(activeSessionRef, {
      status: 'CLOSED', endedAt: now, endReason: 'COMPLETED', durationMinutes: sessionDurationMinutes, updatedAt: FieldValue.serverTimestamp()
    });

    if (allCompleted) {
      transaction.update(woRef, {
        status: 'TECH_COMPLETED',
        techCompletedAt: now,
        updatedAt: FieldValue.serverTimestamp()
      });
      if (linkedTransferRef && linkedTransferSnap?.exists) {
        const transfer = linkedTransferSnap.data()!;
        const items = (transfer.items || []).map((item: any) =>
          item.workOrderId === workOrderId ? { ...item, itemStatus: 'WAITING_QC', techCompletedAt: now } : item
        );
        const allReadyForQc = items.every((item: any) => ['WAITING_QC', 'QC_FAILED', 'QC_PASSED', 'RETURNED_TO_MAIN_WAREHOUSE'].includes(item.itemStatus));
        transaction.update(linkedTransferRef, { items, status: allReadyForQc ? 'WAITING_QC' : 'IN_PROGRESS', updatedAt: now });
      }
    }

    return { success: true, lineId, workOrderId, allLinesCompleted: allCompleted };
  });
}

/**
 * 5. Independent QC Inspection (Strict Gate: TECH_COMPLETED only, non-empty verified checklist, independent inspector)
 */
export async function processQCInspection(
  db: Firestore,
  workOrderId: string,
  inspection: QCInspectionInput,
  inspectorUser: { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] }
): Promise<{ success: boolean; result: 'PASS' | 'FAIL'; inspectionId: string }> {
  return await db.runTransaction(async (transaction) => {
    const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) {
      throw new Error(`WORK_ORDER_NOT_FOUND: Không tìm thấy phiếu kỹ thuật "${workOrderId}".`);
    }

    const woData = woSnap.data()!;

    // A. Branch Access Check
    if (!canAccessBranch(inspectorUser, woData.branchId)) {
      throw new Error(`BRANCH_FORBIDDEN: Bạn không có quyền nghiệm thu phiếu kỹ thuật thuộc chi nhánh "${woData.branchId}".`);
    }

    // B. Strict QC State Gate: Only allow when TECH_COMPLETED
    if (woData.status !== 'TECH_COMPLETED' && woData.status !== 'QC_PENDING') {
      throw new Error(`INVALID_QC_STATE: Phiếu kỹ thuật đang ở trạng thái "${woData.status}". Nghiệm thu KCS chỉ được thực hiện sau khi KTV đã hoàn thành toàn bộ các hạng mục (TECH_COMPLETED).`);
    }

    // C. Verify 100% of Task Lines are COMPLETED
    const allLinesSnap = await transaction.get(
      db.collection('technicalWorkOrderLines').where('workOrderId', '==', workOrderId)
    );
    const partIssuesSnap = await transaction.get(
      db.collection('technicalPartIssues').where('workOrderId', '==', workOrderId)
    );
    const externalCostsSnap = await transaction.get(
      db.collection('technicalExternalCosts').where('workOrderId', '==', workOrderId)
    );
    const recoveriesSnap = await transaction.get(
      db.collection('technicalRecoveries').where('workOrderId', '==', workOrderId)
    );
    const linkedTransferRef = woData.transferId ? db.collection('transfers').doc(woData.transferId) : null;
    const linkedTransferSnap = linkedTransferRef ? await transaction.get(linkedTransferRef) : null;

    for (const doc of allLinesSnap.docs) {
      const lStatus = doc.data().status;
      if (lStatus !== 'COMPLETED' && lStatus !== 'VERIFIED') {
        throw new Error(`INCOMPLETE_TASK_LINES: Hạng mục "${doc.data().taskName}" chưa hoàn thành (Trạng thái: ${lStatus}).`);
      }
    }
    for (const issueDoc of partIssuesSnap.docs) {
      const issue = issueDoc.data();
      if (issue.status === 'CANCELLED') continue;
      const unsettled = Number(issue.quantityIssued || 0)
        - Number(issue.quantityConsumed || 0)
        - Number(issue.quantityReturned || 0)
        - Number(issue.quantityScrapped || 0);
      if (unsettled !== 0) throw new Error(`PART_ISSUES_NOT_SETTLED: Linh kiện "${issue.partName || issueDoc.id}" chưa được quyết toán.`);
    }
    if (externalCostsSnap.docs.some(doc => doc.data().approvalStatus === 'PENDING')) {
      throw new Error('EXTERNAL_COSTS_PENDING_APPROVAL: Còn chi phí kỹ thuật chưa được duyệt.');
    }
    if (recoveriesSnap.docs.some(doc => doc.data().approvalStatus === 'PENDING')) {
      throw new Error('RECOVERIES_PENDING_APPROVAL: Còn khoản bồi hoàn/thu hồi chưa được duyệt.');
    }

    // D. Strict Independence: Inspector CANNOT be the technician who repaired
    const technicianUids = allLinesSnap.docs.map(d => d.data().assigneeUid);
    if (technicianUids.includes(inspectorUser.uid)) {
      throw new Error('QC_SELF_INSPECTION_FORBIDDEN: Người sửa chữa không được tự nghiệm thu KCS cho công việc của mình.');
    }

    const taskSpecificSteps = allLinesSnap.docs.flatMap(doc => {
      const snapshot = doc.data().qcChecklistSnapshot;
      return Array.isArray(snapshot?.taskSpecificSteps) ? snapshot.taskSpecificSteps : [];
    });
    const requiredChecklistKeys = [...new Set([
      ...REQUIRED_QC_CHECKLIST_STEPS,
      ...taskSpecificSteps.filter((step: any) => step?.required !== false).map((step: any) => String(step.key || '')).filter(Boolean)
    ])];
    const checklistSnapshot = {
      version: inspection.checklistVersion || 'QC_STANDARD_12_STEPS_V2',
      baseSteps: REQUIRED_QC_CHECKLIST_STEPS,
      taskSpecificSteps
    };
    // E. Checklist Verification uses the immutable policy snapshot on each task.
    const checklist = inspection.checklistResults || {};
    if (inspection.overallResult === 'PASS') {
      for (const reqStep of requiredChecklistKeys) {
        if (checklist[reqStep] !== true) {
          throw new Error(`INCOMPLETE_CHECKLIST: Bước kiểm tra bắt buộc "${reqStep}" chưa đạt chuẩn.`);
        }
      }
    } else {
      const failures = Array.isArray(inspection.failures) ? inspection.failures : [];
      if (failures.length === 0) throw new Error('QC_AFFECTED_LINES_REQUIRED: Chọn đúng hạng mục không đạt KCS.');
      const completedLines = new Map(allLinesSnap.docs.map(doc => [doc.id, doc.data()]));
      for (const failure of failures) {
        if (!String(failure.reason || '').trim()) throw new Error('FAILED_REASON_REQUIRED');
        if (!Array.isArray(failure.affectedLineIds) || failure.affectedLineIds.length === 0) throw new Error('QC_AFFECTED_LINES_REQUIRED');
        for (const affectedLineId of failure.affectedLineIds) {
          const affected = completedLines.get(String(affectedLineId));
          if (!affected || !['COMPLETED', 'VERIFIED'].includes(String(affected.status || ''))) {
            throw new Error('QC_AFFECTED_LINE_INVALID');
          }
        }
      }
    }
    const qcEvidenceUrls = Array.isArray(inspection.photoEvidenceUrls) ? inspection.photoEvidenceUrls : [];
    if (qcEvidenceUrls.length > 8 || qcEvidenceUrls.some(url => !isTechnicalEvidenceUrlForWorkOrder(url, workOrderId))) {
      throw new Error('QC_PHOTO_EVIDENCE_INVALID: Ảnh KCS phải thuộc đúng phiếu và tối đa 8 ảnh.');
    }

    const now = new Date().toISOString();
    const inspectionId = `QC_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const qcCommissionPeriods = new Map<string, Awaited<ReturnType<typeof resolveCommissionPayrollPeriod>>>();
    if (inspection.overallResult === 'PASS' && !woData.eligibilityRequiresStockReturn && !woData.eligibilityRequiresCustomerDelivery) {
      for (const lineDoc of allLinesSnap.docs) {
        const staffUid = String(lineDoc.data().assigneeUid || '').trim();
        if (!staffUid) throw new Error('TECHNICAL_COMMISSION_STAFF_UID_REQUIRED');
        const assignedPeriod = String(lineDoc.data().assignedPeriod || getVietnamMonthString(String(lineDoc.data().assignedAt || now)));
        const resolutionKey = commissionPayrollResolutionKey(staffUid, assignedPeriod);
        if (qcCommissionPeriods.has(resolutionKey)) continue;
        qcCommissionPeriods.set(resolutionKey, await resolveCommissionPayrollPeriod(transaction, db, {
          staffUid,
          sourceBranchId: String(woData.branchId || ''),
          requestedPeriod: getVietnamMonthString(now),
          assignedPeriod
        }));
      }
    }

    // F. Save QC Inspection Record
    const qcRef = db.collection('qcInspections').doc(inspectionId);
    transaction.set(qcRef, {
      id: inspectionId,
      workOrderId,
      deviceId: woData.deviceId,
      imei: woData.imei,
      branchId: woData.branchId,
      inspectorUid: inspectorUser.uid,
      inspectorName: inspectorUser.name || 'Chuyên viên KCS',
      checklistVersion: inspection.checklistVersion || 'QC_STANDARD_12_STEPS_V2',
      checklistSnapshot,
      checklistResults: checklist,
      overallResult: inspection.overallResult,
      failedReason: inspection.failedReason || null,
      failures: inspection.failures || [],
      photoEvidenceUrls: qcEvidenceUrls,
      reworkCycle: woData.reworkCount || 0,
      inspectedAt: now,
      createdAt: FieldValue.serverTimestamp()
    });

    if (inspection.overallResult === 'PASS') {
      // 4A. On PASS: Update Work Order status to QC_PASSED
      transaction.update(woRef, {
        status: 'QC_PASSED',
        qcStatus: 'PASSED',
        qcPassedAt: now,
        qcInspectorUid: inspectorUser.uid,
        qcInspectorName: inspectorUser.name || 'Chuyên viên KCS',
        updatedAt: FieldValue.serverTimestamp()
      });

      // Transfer-created commissions remain PENDING until the machine is physically returned to Kho Tổng.
      for (const lineDoc of allLinesSnap.docs) {
        const staffUid = String(lineDoc.data().assigneeUid || '').trim();
        const assignedPeriod = String(lineDoc.data().assignedPeriod || getVietnamMonthString(String(lineDoc.data().assignedAt || now)));
        const commRef = db.collection('commissionLedger').doc(`COMM_${lineDoc.id}`);
        transaction.update(commRef, (woData.eligibilityRequiresStockReturn || woData.eligibilityRequiresCustomerDelivery) ? {
          status: 'PENDING',
          qcApprovedAt: now,
          qcApprovedByUid: inspectorUser.uid,
          updatedAt: FieldValue.serverTimestamp()
        } : {
          status: 'ELIGIBLE',
          eligibleAt: now,
          ...qcCommissionPeriods.get(commissionPayrollResolutionKey(staffUid, assignedPeriod)),
          eligibilityReason: 'QC_PASSED',
          approvedByUid: inspectorUser.uid,
          updatedAt: FieldValue.serverTimestamp()
        });

        transaction.update(lineDoc.ref, {
          status: 'VERIFIED',
          qcVerifiedAt: now,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
      if (linkedTransferRef && linkedTransferSnap?.exists) {
        const transfer = linkedTransferSnap.data()!;
        const items = (transfer.items || []).map((item: any) =>
          item.workOrderId === workOrderId ? { ...item, itemStatus: 'QC_PASSED', qcPassedAt: now } : item
        );
        const allQcPassed = items.every((item: any) => ['QC_PASSED', 'RETURNED_TO_MAIN_WAREHOUSE'].includes(item.itemStatus));
        transaction.update(linkedTransferRef, { items, status: allQcPassed ? 'COMPLETED' : 'WAITING_QC', updatedAt: now });
      }
    } else {
      // 4B. On FAIL: Increment reworkCount, set status to QC_FAILED_REWORK
      const newReworkCount = (woData.reworkCount || 0) + 1;
      transaction.update(woRef, {
        status: 'QC_FAILED_REWORK',
        qcStatus: 'FAILED',
        reworkCount: newReworkCount,
        lastFailedReason: inspection.failedReason,
        updatedAt: FieldValue.serverTimestamp()
      });

      const failureByLine = new Map<string, string>();
      for (const failure of inspection.failures || []) {
        for (const affectedLineId of failure.affectedLineIds || []) {
          failureByLine.set(String(affectedLineId), String(failure.reason || inspection.failedReason || 'KCS không đạt'));
        }
      }
      // Only the failed task lines return to rework. Verified work stays intact.
      for (const lineDoc of allLinesSnap.docs) {
        const reworkReason = failureByLine.get(lineDoc.id);
        if (!reworkReason) continue;
        const lineData = lineDoc.data();
        transaction.update(lineDoc.ref, {
          status: 'REWORK_REQUIRED',
          reworkCycle: Number(lineData.reworkCycle || 0) + 1,
          reworkReason,
          lastReworkReason: reworkReason,
          lastQcInspectionId: inspectionId,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
      if (linkedTransferRef && linkedTransferSnap?.exists) {
        const transfer = linkedTransferSnap.data()!;
        const items = (transfer.items || []).map((item: any) =>
          item.workOrderId === workOrderId ? { ...item, itemStatus: 'QC_FAILED', qcFailedAt: now, qcFailedReason: inspection.failedReason } : item
        );
        transaction.update(linkedTransferRef, { items, status: 'QC_FAILED', updatedAt: now });
      }
    }

    return { success: true, result: inspection.overallResult, inspectionId };
  });
}

/**
 * 6. Return Internal Repaired Device to Stock (Main Warehouse Reception)
 * Enforces: ONLY INBOUND_PREP and TRADE_IN_REFURB can become 'in_stock'
 */
export async function processReturnToStock(
  db: Firestore,
  workOrderId: string,
  targetWarehouseId: string,
  scannedImei: string,
  warehouseStaff: { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] }
): Promise<{ success: boolean; deviceId: string }> {
  if (!targetWarehouseId) throw new Error('TARGET_WAREHOUSE_REQUIRED');
  if (!scannedImei?.trim()) throw new Error('SCANNED_IMEI_REQUIRED');
  return await db.runTransaction(async (transaction) => {
    const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) {
      throw new Error(`WORK_ORDER_NOT_FOUND: Không tìm thấy phiếu kỹ thuật "${workOrderId}".`);
    }

    const woData = woSnap.data()!;

    const targetWarehouseRef = db.collection('warehouses').doc(targetWarehouseId);
    const targetWarehouseSnap = await transaction.get(targetWarehouseRef);
    if (!targetWarehouseSnap.exists) throw new Error('TARGET_WAREHOUSE_NOT_FOUND');
    const targetWarehouse = targetWarehouseSnap.data()!;

    const linkedTransferRef = woData.transferId ? db.collection('transfers').doc(woData.transferId) : null;
    const linkedTransferSnap = linkedTransferRef ? await transaction.get(linkedTransferRef) : null;

    // Protection Invariant (P0-02): Never put customer repair/warranty devices back into saleable stock!
    if (woData.workOrderType === 'CUSTOMER_SERVICE' || woData.workOrderType === 'WARRANTY') {
      throw new Error(`CANNOT_RETURN_CUSTOMER_DEVICE_TO_STOCK: Đây là máy sửa dịch vụ / bảo hành của khách hàng (${woData.customerName || woData.imei}). Vui lòng sử dụng chức năng "Bàn giao trả khách" (/deliver-customer).`);
    }

    if (woData.status !== 'QC_PASSED') {
      throw new Error(`DEVICE_NOT_QC_PASSED: Máy phải đạt chuẩn KCS (QC_PASSED) trước khi được nhập kho sẵn sàng bán.`);
    }
    if (woData.costPostingStatus !== 'POSTED') {
      throw new Error('COST_NOT_POSTED: Máy chỉ được nhập lại kho sau khi giá vốn kỹ thuật đã được chốt.');
    }
    if (scannedImei.trim() !== String(woData.imei || '').trim()) {
      throw new Error('IMEI_MISMATCH: IMEI quét khi nhận lại không khớp phiếu kỹ thuật.');
    }
    const targetBranchId = String(targetWarehouse.branchId || targetWarehouse.owningBranchId || '');
    if (targetWarehouse.isActive === false || targetBranchId !== String(woData.branchId || '') || !['CENTRAL', 'RETAIL_STORE'].includes(String(targetWarehouse.type || ''))) {
      throw new Error('TARGET_WAREHOUSE_NOT_ELIGIBLE');
    }

    if (!canAccessBranch(warehouseStaff, woData.branchId)) {
      throw new Error(`BRANCH_FORBIDDEN: Bạn không có quyền thao tác trên kho chi nhánh "${woData.branchId}".`);
    }

    const now = new Date().toISOString();
    const taskCommissionIds = new Set<string>((Array.isArray(woData.taskLineIds) ? woData.taskLineIds : [])
      .map((lineId: unknown) => `COMM_${String(lineId)}`));
    if (taskCommissionIds.size > 200) throw new Error('TECHNICAL_COMMISSION_LIMIT');
    const returnCommissionDocs = woData.eligibilityRequiresStockReturn
      ? (await Promise.all([...taskCommissionIds].map((id) => transaction.get(db.collection('commissionLedger').doc(id))))).filter((snapshot) => snapshot.exists)
      : [];
    const returnCommissionPeriods = new Map<string, Awaited<ReturnType<typeof resolveCommissionPayrollPeriod>>>();
    for (const commissionDoc of returnCommissionDocs) {
      const commission = commissionDoc.data();
      const staffUid = String(commission.staffUid || '').trim();
      if (!staffUid) throw new Error('TECHNICAL_COMMISSION_STAFF_UID_REQUIRED');
      const assignedPeriod = String(commission.assignedPeriod || getVietnamMonthString(commission.assignedAt || now));
      const resolutionKey = commissionPayrollResolutionKey(staffUid, assignedPeriod);
      if (returnCommissionPeriods.has(resolutionKey)) continue;
      returnCommissionPeriods.set(resolutionKey, await resolveCommissionPayrollPeriod(transaction, db, {
        staffUid,
        sourceBranchId: String(commission.sourceBranchId || commission.branchId || woData.branchId || ''),
        requestedPeriod: getVietnamMonthString(now),
        assignedPeriod
      }));
    }

    // 1. Update Work Order
    transaction.update(woRef, {
      status: 'RETURNED_TO_STOCK',
      returnedToStockAt: now,
      currentCustodianUid: warehouseStaff.uid,
      currentCustodianName: warehouseStaff.name || 'Thủ Kho',
      currentLocationId: targetWarehouseId,
      updatedAt: FieldValue.serverTimestamp()
    });

    // 2. Authoritative Device Status Transition to in_stock
    if (woData.deviceId) {
      const devRef = db.collection('devices').doc(woData.deviceId);
      transaction.update(devRef, {
        status: 'in_stock',
        currentLocationId: targetWarehouseId,
        warehouseId: targetWarehouseId,
        warehouse: targetWarehouseId,
        currentCustodian: warehouseStaff.name || 'Thủ Kho',
        currentCustodianUid: warehouseStaff.uid,
        technicianAssigned: FieldValue.delete(),
        activeTransferId: FieldValue.delete(),
        transferState: FieldValue.delete(),
        activeWorkOrderId: FieldValue.delete(),
        lastQcPassedAt: now,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    if (woData.eligibilityRequiresStockReturn) {
      for (const lineId of woData.taskLineIds || []) {
        const commissionId = `COMM_${lineId}`;
        const commissionDoc = returnCommissionDocs.find((doc) => doc.id === commissionId);
        if (!commissionDoc) throw new Error('TECHNICAL_COMMISSION_NOT_FOUND');
        const commission = commissionDoc.data();
        const staffUid = String(commission.staffUid || '').trim();
        const assignedPeriod = String(commission.assignedPeriod || getVietnamMonthString(commission.assignedAt || now));
        transaction.update(commissionDoc.ref, {
          status: 'ELIGIBLE',
          eligibleAt: now,
          ...returnCommissionPeriods.get(commissionPayrollResolutionKey(staffUid, assignedPeriod)),
          eligibilityReason: 'RETURNED_TO_STOCK',
          approvedByUid: warehouseStaff.uid,
          stockReturnConfirmedAt: now,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    if (linkedTransferRef && linkedTransferSnap?.exists) {
      const transfer = linkedTransferSnap.data()!;
      const items = (transfer.items || []).map((item: any) =>
        item.workOrderId === workOrderId ? { ...item, itemStatus: 'RETURNED_TO_MAIN_WAREHOUSE', returnedAt: now } : item
      );
      const allReturned = items.every((item: any) => item.itemStatus === 'RETURNED_TO_MAIN_WAREHOUSE');
      const allQcReady = items.every((item: any) => ['QC_PASSED', 'RETURNED_TO_MAIN_WAREHOUSE'].includes(item.itemStatus));
      transaction.update(linkedTransferRef, { items, status: allReturned ? 'RETURNED_TO_MAIN_WAREHOUSE' : allQcReady ? 'COMPLETED' : 'WAITING_QC', updatedAt: now });
    }

    // 3. Record Final Movement back to Stock
    const movId = `MOV_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    transaction.set(db.collection('inventoryMovements').doc(movId), {
      id: movId,
      deviceId: woData.deviceId,
      imei: woData.imei,
      branchId: woData.branchId,
      movementType: 'QC_PASS_RETURN_STOCK',
      fromLocationId: woData.currentLocationId || 'KHO_QC',
      toLocationId: targetWarehouseId,
      fromCustodianUid: woData.currentCustodianUid,
      toCustodianUid: warehouseStaff.uid,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      workOrderId,
      performedByUid: warehouseStaff.uid,
      confirmedByUid: warehouseStaff.uid,
      occurredAt: now,
      createdAt: FieldValue.serverTimestamp()
    });

    return { success: true, deviceId: woData.deviceId };
  });
}

export async function processRequestTechnicalQuoteAdjustment(
  db: Firestore,
  workOrderId: string,
  input: TechnicalQuoteAdjustmentInput,
  actor: TechnicalActor
): Promise<{ adjustmentId: string; status: 'PENDING' }> {
  const requestedAmount = Number(input.requestedAmount);
  if (!Number.isSafeInteger(requestedAmount) || requestedAmount < 0) throw new Error('QUOTE_AMOUNT_INVALID');
  if (String(input.reason || '').trim().length < 5) throw new Error('QUOTE_REASON_REQUIRED');
  const key = requireTechnicalIdempotencyKey(input.idempotencyKey);
  const adjustmentId = `TQA_${technicalIdempotencyId(workOrderId, key).slice(0, 28).toUpperCase()}`;
  const adjustmentRef = db.collection('technicalQuoteAdjustments').doc(adjustmentId);
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  return db.runTransaction(async transaction => {
    const [woSnap, adjustmentSnap] = await Promise.all([transaction.get(woRef), transaction.get(adjustmentRef)]);
    if (adjustmentSnap.exists) return { adjustmentId, status: 'PENDING' as const };
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const wo = woSnap.data()!;
    if (!canAccessBranch(actor, String(wo.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (!['CUSTOMER_SERVICE', 'WARRANTY'].includes(String(wo.workOrderType || ''))) throw new Error('QUOTE_NOT_APPLICABLE');
    if (isClosedWorkOrder(wo.status)) throw new Error('WORK_ORDER_CLOSED');
    const now = new Date().toISOString();
    transaction.create(adjustmentRef, {
      id: adjustmentId,
      workOrderId,
      branchId: wo.branchId,
      previousAmount: Number(wo.approvedFinalAmount ?? wo.proposedQuoteAmount ?? 0),
      requestedAmount,
      reason: String(input.reason).trim(),
      customerApprovalEvidenceId: String(input.customerApprovalEvidenceId || '').trim() || null,
      status: 'PENDING',
      requestedByUid: actor.uid,
      requestedByName: actor.name || actor.uid,
      requestedAt: now,
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.update(woRef, { proposedQuoteAmount: requestedAmount, quoteStatus: 'PENDING_APPROVAL', updatedAt: FieldValue.serverTimestamp() });
    return { adjustmentId, status: 'PENDING' as const };
  });
}

export async function processDecideTechnicalQuoteAdjustment(
  db: Firestore,
  workOrderId: string,
  adjustmentId: string,
  input: { decision: 'APPROVED' | 'REJECTED'; reason?: string; idempotencyKey: string },
  actor: TechnicalActor
): Promise<{ adjustmentId: string; status: 'APPROVED' | 'REJECTED' }> {
  const decision = String(input.decision || '').toUpperCase() as 'APPROVED' | 'REJECTED';
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new Error('QUOTE_DECISION_INVALID');
  const key = requireTechnicalIdempotencyKey(input.idempotencyKey);
  const idemRef = db.collection('technicalOperationIdempotency').doc(technicalIdempotencyId(`QUOTE_DECISION:${adjustmentId}`, key));
  const adjustmentRef = db.collection('technicalQuoteAdjustments').doc(adjustmentId);
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  return db.runTransaction(async transaction => {
    const [woSnap, adjustmentSnap, idemSnap] = await Promise.all([
      transaction.get(woRef), transaction.get(adjustmentRef), transaction.get(idemRef)
    ]);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (!adjustmentSnap.exists) throw new Error('QUOTE_ADJUSTMENT_NOT_FOUND');
    const wo = woSnap.data()!;
    const adjustment = adjustmentSnap.data()!;
    if (String(adjustment.workOrderId || '') !== workOrderId) throw new Error('WORK_ORDER_MISMATCH');
    if (!canAccessBranch(actor, String(wo.branchId || ''))) throw new Error('BRANCH_FORBIDDEN');
    if (idemSnap.exists) return { adjustmentId, status: String(adjustment.status || decision) as 'APPROVED' | 'REJECTED' };
    if (adjustment.status !== 'PENDING') throw new Error('QUOTE_ADJUSTMENT_ALREADY_DECIDED');
    if (decision === 'APPROVED' && Number(adjustment.requestedAmount || 0) > 0 && !String(adjustment.customerApprovalEvidenceId || '').trim()) {
      throw new Error('CUSTOMER_QUOTE_APPROVAL_EVIDENCE_REQUIRED');
    }
    const now = new Date().toISOString();
    transaction.update(adjustmentRef, {
      status: decision,
      decisionReason: String(input.reason || '').trim(),
      approvedByUid: actor.uid,
      approvedByName: actor.name || actor.uid,
      approvedAt: now,
      updatedAt: FieldValue.serverTimestamp()
    });
    transaction.update(woRef, decision === 'APPROVED' ? {
      approvedFinalAmount: Number(adjustment.requestedAmount || 0),
      customerApprovedQuote: Number(adjustment.requestedAmount || 0),
      customerApprovalEvidenceId: adjustment.customerApprovalEvidenceId,
      quoteStatus: 'APPROVED',
      quoteVersion: Number(wo.quoteVersion || 0) + 1,
      quoteApprovedAt: now,
      quoteApprovedByUid: actor.uid,
      updatedAt: FieldValue.serverTimestamp()
    } : {
      quoteStatus: 'REJECTED',
      quoteVersion: Number(wo.quoteVersion || 0) + 1,
      updatedAt: FieldValue.serverTimestamp()
    });
    transaction.create(idemRef, { scope: 'QUOTE_DECISION', adjustmentId, workOrderId, decision, createdAt: now });
    return { adjustmentId, status: decision };
  });
}

/**
 * 7. Deliver Customer Service / Warranty Device to Customer
 */
export async function processDeliverToCustomer(
  db: Firestore,
  workOrderId: string,
  notes: string,
  staffUser: { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] },
  paymentInput?: CustomerDeliveryPaymentInput
): Promise<{ success: boolean; workOrderId: string }> {
  const normalizedDeliveryNotes = String(notes || '').trim();
  if (normalizedDeliveryNotes.length < 5) throw new Error('DELIVERY_NOTES_REQUIRED');
  const actorUid = String(staffUser.uid || '').trim();
  if (!actorUid) throw new Error('TECHNICAL_ACTOR_REQUIRED');
  const idempotencyKey = requireTechnicalIdempotencyKey(paymentInput?.idempotencyKey);
  const paidAmount = Number(paymentInput?.paidAmount ?? 0);
  const paymentMethod = String(paymentInput?.paymentMethod || (paidAmount > 0 ? 'CASH' : 'DEBT')).toUpperCase();
  const fundId = String(paymentInput?.fundId || '').trim();
  const paymentNote = String(paymentInput?.note || '').trim();
  const deliveryPayloadHash = crypto.createHash('sha256').update(JSON.stringify({
    workOrderId,
    deliveryNotes: normalizedDeliveryNotes,
    paidAmount,
    paymentMethod,
    fundId,
    paymentNote
  })).digest('hex');
  const idemRef = db.collection('technicalOperationIdempotency').doc(technicalIdempotencyId(`DELIVER_CUSTOMER:${workOrderId}`, idempotencyKey));
  return await db.runTransaction(async (transaction) => {
    const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const [woSnap, idemSnap] = await Promise.all([transaction.get(woRef), transaction.get(idemRef)]);
    if (!woSnap.exists) {
      throw new Error(`WORK_ORDER_NOT_FOUND: Không tìm thấy phiếu kỹ thuật "${workOrderId}".`);
    }

    const woData = woSnap.data()!;
    const branchId = String(woData.branchId || '').trim();
    if (!branchId || !canAccessBranch(staffUser, branchId)) {
      throw new Error(`BRANCH_FORBIDDEN: Bạn không có quyền thao tác trên chi nhánh "${branchId}".`);
    }
    const isCustomerDevice = woData.assetOwnership === 'CUSTOMER' || ['CUSTOMER_SERVICE', 'WARRANTY'].includes(String(woData.workOrderType || ''));
    if (!isCustomerDevice) {
      throw new Error('CUSTOMER_DELIVERY_ONLY: Máy thuộc công ty phải được Kho Tổng quét nhận và kết chuyển giá vốn, không được đi qua luồng giao khách.');
    }
    if (idemSnap.exists) {
      const idem = idemSnap.data()!;
      if (
        String(idem.scope || '') !== 'DELIVER_CUSTOMER'
        || String(idem.workOrderId || '') !== workOrderId
        || String(idem.payloadHash || '') !== deliveryPayloadHash
        || String(idem.actorUid || '') !== actorUid
        || String(idem.branchId || '') !== branchId
      ) {
        throw new Error('TECHNICAL_DELIVERY_IDEMPOTENCY_CONFLICT');
      }
      return { success: true, workOrderId };
    }
    if (woData.status !== 'QC_PASSED') {
      throw new Error(`DEVICE_NOT_QC_PASSED: Máy phải đạt chuẩn KCS (QC_PASSED) trước khi bàn giao trả khách hàng.`);
    }

    const isWarranty = String(woData.workOrderType || '') === 'WARRANTY';
    const hasLegacyApprovalEvidence = Boolean(woData.customerApprovalEvidenceId || (woData.quoteApprovedAt && woData.quoteApprovedByUid));
    if (!isWarranty && String(woData.quoteStatus || '') !== 'APPROVED') {
      if (!(woData.quoteStatus == null && hasLegacyApprovalEvidence && Number.isSafeInteger(Number(woData.customerApprovedQuote)))) {
        throw new Error('QUOTE_APPROVAL_REQUIRED: Báo giá phải được quản lý hoặc kế toán duyệt trước khi giao máy.');
      }
    }
    const finalAmount = isWarranty
      ? 0
      : Number(woData.approvedFinalAmount ?? (hasLegacyApprovalEvidence ? woData.customerApprovedQuote : NaN));
    if (!Number.isFinite(finalAmount) || finalAmount < 0 || !Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > finalAmount) {
      throw new Error('REPAIR_PAYMENT_AMOUNT_INVALID');
    }
    if (!['CASH', 'BANK', 'DEBT'].includes(paymentMethod)) throw new Error('REPAIR_PAYMENT_METHOD_INVALID');
    if (paidAmount > 0 && paymentMethod === 'DEBT') throw new Error('REPAIR_PAYMENT_METHOD_INVALID');
    if (paidAmount > 0 && !fundId) throw new Error('REPAIR_PAYMENT_FUND_REQUIRED');

    parseVnd(finalAmount, { allowZero: true, field: 'REPAIR_FINAL_AMOUNT' });
    parseVnd(paidAmount, { allowZero: true, field: 'REPAIR_PAID_AMOUNT' });
    const now = new Date().toISOString();
    const fundRef = paidAmount > 0 ? db.collection('funds').doc(fundId) : null;
    const balanceDue = Math.max(0, finalAmount - paidAmount);
    const customerPhone = String(woData.customerPhone || '').trim();
    if (balanceDue > 0 && !customerPhone) throw new Error('CUSTOMER_PHONE_REQUIRED_FOR_DEBT');
    const customerId = String(woData.customerId || '').trim() || (customerPhone
      ? `TECHCUS_${crypto.createHash('sha256').update(`${woData.branchId}:${customerPhone.replace(/\D/g, '')}`).digest('hex').slice(0, 20).toUpperCase()}`
      : '');
    const customerProfile = customerId ? {
      id: customerId,
      branchId: woData.branchId,
      type: 'CUSTOMER',
      name: woData.customerName || 'Khách sửa chữa',
      phone: customerPhone
    } : null;
    const customerIdentity = customerProfile ? resolvePartyIdentity(customerProfile, String(woData.branchId || '')) : null;
    const customerRef = customerId ? db.collection('partners').doc(customerId) : null;
    const masterRef = customerIdentity ? db.collection('partyMasters').doc(customerIdentity.partyMasterId) : null;
    const accountRef = customerIdentity ? db.collection('branchPartyAccounts').doc(customerIdentity.branchPartyAccountId) : null;
    const [fundSnap, customerSnap, masterSnap, accountSnap] = await Promise.all([
      fundRef ? transaction.get(fundRef) : Promise.resolve(null),
      customerRef ? transaction.get(customerRef) : Promise.resolve(null),
      masterRef ? transaction.get(masterRef) : Promise.resolve(null),
      accountRef ? transaction.get(accountRef) : Promise.resolve(null)
    ]);
    const fund = fundSnap?.data();
    const expectedFundType = paymentMethod === 'CASH' ? 'CASH' : 'BANK';
    if (paidAmount > 0) {
      if (!fundSnap?.exists || !fund) throw new Error('REPAIR_PAYMENT_FUND_NOT_FOUND');
      if (fund.isActive === false || fund.active === false || fund.isArchived) throw new Error('REPAIR_PAYMENT_FUND_INACTIVE');
      if (String(fund.branchId || '') !== String(woData.branchId || '')) throw new Error('REPAIR_PAYMENT_FUND_BRANCH_MISMATCH');
      if (String(fund.type || '').toUpperCase() !== expectedFundType) throw new Error('REPAIR_PAYMENT_FUND_TYPE_MISMATCH');
    }
    const existingCustomer = customerSnap?.exists ? customerSnap.data()! : null;
    const existingMaster = masterSnap?.exists ? masterSnap.data()! : null;
    const existingAccount = accountSnap?.exists ? accountSnap.data()! : null;
    if (existingCustomer && customerIdentity) {
      if (String(existingCustomer.branchId || '') !== String(woData.branchId || '')) throw new Error('CUSTOMER_BRANCH_MISMATCH');
      if (!['CUSTOMER', 'BOTH'].includes(String(existingCustomer.type || '').toUpperCase())) throw new Error('CUSTOMER_TYPE_INVALID');
      if (existingCustomer.isActive === false || existingCustomer.isArchived === true) throw new Error('CUSTOMER_INACTIVE');
      const linkedMasterId = String(existingCustomer.partyMasterId || '').trim();
      const linkedAccountId = String(existingCustomer.branchPartyAccountId || '').trim();
      if (linkedMasterId && linkedMasterId !== customerIdentity.partyMasterId) throw new Error('CUSTOMER_IDENTITY_MISMATCH');
      if (linkedAccountId && linkedAccountId !== customerIdentity.branchPartyAccountId) throw new Error('CUSTOMER_ACCOUNT_MISMATCH');
    }
    if (existingMaster && customerIdentity) {
      if (String(existingMaster.id || masterRef?.id || '') !== customerIdentity.partyMasterId) throw new Error('CUSTOMER_IDENTITY_MISMATCH');
      if (String(existingMaster.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') throw new Error('CUSTOMER_INACTIVE');
    }
    if (existingAccount && customerIdentity) {
      if (String(existingAccount.branchId || '') !== String(woData.branchId || '')) throw new Error('CUSTOMER_ACCOUNT_BRANCH_MISMATCH');
      if (String(existingAccount.partyMasterId || '') !== customerIdentity.partyMasterId) throw new Error('CUSTOMER_ACCOUNT_IDENTITY_MISMATCH');
      const linkedPartnerId = String(existingAccount.legacyPartnerId || '').trim();
      if (linkedPartnerId && linkedPartnerId !== customerId) throw new Error('CUSTOMER_ACCOUNT_PARTNER_MISMATCH');
      if (!['CUSTOMER', 'BOTH'].includes(String(existingAccount.type || '').toUpperCase())) throw new Error('CUSTOMER_ACCOUNT_TYPE_INVALID');
      if (String(existingAccount.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') throw new Error('CUSTOMER_ACCOUNT_INACTIVE');
    }
    const currentAccountReceivableBalance = existingAccount ? parseVnd(existingAccount.receivableBalance ?? 0, {
      allowZero: true,
      field: 'CUSTOMER_ACCOUNT_RECEIVABLE_BALANCE',
      max: Number.MAX_SAFE_INTEGER
    }) : 0;
    const currentAccountTotalSales = existingAccount ? parseVnd(existingAccount.totalSales ?? 0, {
      allowZero: true,
      field: 'CUSTOMER_ACCOUNT_TOTAL_SALES',
      max: Number.MAX_SAFE_INTEGER
    }) : 0;
    const currentCustomerOutstandingDebt = existingCustomer ? parseVnd(existingCustomer.outstandingDebt ?? 0, {
      allowZero: true,
      field: 'CUSTOMER_OUTSTANDING_DEBT',
      max: Number.MAX_SAFE_INTEGER
    }) : 0;
    const currentCustomerTotalSpent = existingCustomer ? parseVnd(existingCustomer.totalSpent ?? 0, {
      allowZero: true,
      field: 'CUSTOMER_TOTAL_SPENT',
      max: Number.MAX_SAFE_INTEGER
    }) : 0;
    const nextAccountReceivableBalance = currentAccountReceivableBalance + balanceDue;
    const nextAccountTotalSales = currentAccountTotalSales + finalAmount;
    const nextCustomerOutstandingDebt = currentCustomerOutstandingDebt + balanceDue;
    const nextCustomerTotalSpent = currentCustomerTotalSpent + finalAmount;
    parseVnd(nextAccountReceivableBalance, { allowZero: true, field: 'CUSTOMER_ACCOUNT_RECEIVABLE_BALANCE', max: Number.MAX_SAFE_INTEGER });
    parseVnd(nextAccountTotalSales, { allowZero: true, field: 'CUSTOMER_ACCOUNT_TOTAL_SALES', max: Number.MAX_SAFE_INTEGER });
    parseVnd(nextCustomerOutstandingDebt, { allowZero: true, field: 'CUSTOMER_OUTSTANDING_DEBT', max: Number.MAX_SAFE_INTEGER });
    parseVnd(nextCustomerTotalSpent, { allowZero: true, field: 'CUSTOMER_TOTAL_SPENT', max: Number.MAX_SAFE_INTEGER });
    const paymentStatus = finalAmount === 0 ? 'NOT_REQUIRED' : balanceDue === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';
    const paymentTransactionId = paidAmount > 0 ? `TECH_REPAIR_RECEIPT_${workOrderId}` : null;
    const shouldActivateDeliveryCommission = woData.eligibilityRequiresCustomerDelivery
      || ['CUSTOMER_SERVICE', 'WARRANTY'].includes(String(woData.workOrderType || ''));
    const deliveryTaskCommissionIds = new Set<string>((Array.isArray(woData.taskLineIds) ? woData.taskLineIds : [])
      .map((lineId: unknown) => `COMM_${String(lineId)}`));
    if (deliveryTaskCommissionIds.size > 200) throw new Error('TECHNICAL_COMMISSION_LIMIT');
    const deliveryCommissionDocs = shouldActivateDeliveryCommission
      ? (await Promise.all([...deliveryTaskCommissionIds].map((id) => transaction.get(db.collection('commissionLedger').doc(id))))).filter((snapshot) => snapshot.exists)
      : [];
    const deliveryCommissionPeriods = new Map<string, Awaited<ReturnType<typeof resolveCommissionPayrollPeriod>>>();
    for (const commissionDoc of deliveryCommissionDocs) {
      const commission = commissionDoc.data();
      const staffUid = String(commission.staffUid || '').trim();
      if (!staffUid) throw new Error('TECHNICAL_COMMISSION_STAFF_UID_REQUIRED');
      const assignedPeriod = String(commission.assignedPeriod || getVietnamMonthString(commission.assignedAt || now));
      const resolutionKey = commissionPayrollResolutionKey(staffUid, assignedPeriod);
      if (deliveryCommissionPeriods.has(resolutionKey)) continue;
      deliveryCommissionPeriods.set(resolutionKey, await resolveCommissionPayrollPeriod(transaction, db, {
        staffUid,
        sourceBranchId: String(commission.sourceBranchId || commission.branchId || woData.branchId || ''),
        requestedPeriod: getVietnamMonthString(now),
        assignedPeriod
      }));
    }

    if (fundRef && fund) {
      const currentFundBalance = parseVnd(fund.currentBalance ?? 0, {
        allowZero: true,
        field: 'REPAIR_PAYMENT_FUND_BALANCE',
        max: Number.MAX_SAFE_INTEGER
      });
      const currentTotalIncome = parseVnd(fund.totalIncome ?? 0, {
        allowZero: true,
        field: 'REPAIR_PAYMENT_FUND_TOTAL_INCOME',
        max: Number.MAX_SAFE_INTEGER
      });
      const nextFundBalance = currentFundBalance + paidAmount;
      const nextTotalIncome = currentTotalIncome + paidAmount;
      parseVnd(nextFundBalance, { allowZero: true, field: 'REPAIR_PAYMENT_FUND_BALANCE', max: Number.MAX_SAFE_INTEGER });
      parseVnd(nextTotalIncome, { allowZero: true, field: 'REPAIR_PAYMENT_FUND_TOTAL_INCOME', max: Number.MAX_SAFE_INTEGER });
      transaction.update(fundRef, {
        currentBalance: nextFundBalance,
        totalIncome: nextTotalIncome,
        updatedAt: now
      });
      transaction.set(db.collection('cashTransactions').doc(paymentTransactionId!), {
        id: paymentTransactionId,
        code: `PTSC-${String(woData.code || workOrderId)}`,
        type: 'RECEIPT',
        amount: paidAmount,
        category: 'REPAIR_SERVICE_REVENUE',
        categoryName: 'Thu sửa chữa',
        fundId: fundRef.id,
        fundName: fund.name || 'Quỹ thu tiền',
        fundType: fund.type || expectedFundType,
        partnerId: customerId,
        partnerName: woData.customerName || 'Khách sửa chữa',
        partnerType: 'CUSTOMER',
        branchId: woData.branchId,
        referenceType: 'TECHNICAL_WORK_ORDER',
        referenceId: workOrderId,
        referenceCode: woData.code || workOrderId,
        date: now,
        notes: paymentNote || `Thu tiền phiếu sửa ${woData.code || workOrderId}`,
        creator: staffUser.name || 'Nhân viên bàn giao',
        creatorUid: staffUser.uid,
        isPLAccounted: true,
        status: 'COMPLETED',
        createdAt: FieldValue.serverTimestamp()
      });
    }
    if (customerProfile && customerIdentity && customerRef && masterRef && accountRef) {
      if (!masterSnap?.exists) transaction.create(masterRef, newPartyMasterRecord(customerProfile, customerIdentity, staffUser.uid, now));
      if (!accountSnap?.exists) {
        const accountPartner = { ...customerProfile, type: existingCustomer?.type || customerProfile.type, ...existingCustomer };
        const legacyDirectional = resolveLegacyDirectionalBalances(accountPartner, 'CUSTOMER');
        const initialReceivableBalance = legacyDirectional.receivableBalance + balanceDue;
        parseVnd(initialReceivableBalance, { allowZero: true, field: 'CUSTOMER_ACCOUNT_RECEIVABLE_BALANCE', max: Number.MAX_SAFE_INTEGER });
        transaction.create(accountRef, newBranchPartyAccountRecord({ ...accountPartner, totalSpent: nextCustomerTotalSpent }, String(woData.branchId || ''), customerIdentity, staffUser.uid, now, {
          payableBalance: legacyDirectional.payableBalance,
          receivableBalance: initialReceivableBalance
        }));
      } else {
        transaction.update(accountRef, {
          legacyPartnerId: customerId,
          receivableBalance: nextAccountReceivableBalance,
          totalSales: nextAccountTotalSales,
          updatedByUid: staffUser.uid,
          updatedAt: now
        });
      }
      const customerPatch = {
        ...customerProfile,
        partyMasterId: customerIdentity.partyMasterId,
        branchPartyAccountId: customerIdentity.branchPartyAccountId,
        outstandingDebt: nextCustomerOutstandingDebt,
        totalSpent: nextCustomerTotalSpent,
        lastTechnicalWorkOrderId: workOrderId,
        updatedAt: now
      };
      if (customerSnap?.exists) transaction.set(customerRef, customerPatch, { merge: true });
      else transaction.create(customerRef, { ...customerPatch, createdAt: now });
      if (finalAmount > 0) {
        const chargeId = `DLE_TECH_${workOrderId}_CHARGE`;
        transaction.create(db.collection('debtLedgerEntries').doc(chargeId), debtLedgerEntry({
          id: chargeId, branchId: woData.branchId, partyAccountId: customerIdentity.branchPartyAccountId,
          partyMasterId: customerIdentity.partyMasterId, legacyPartnerId: customerId, direction: 'RECEIVABLE',
          sourceType: 'TECHNICAL_WORK_ORDER', sourceDocumentId: workOrderId, sourceDocumentCode: woData.code || workOrderId,
          debitIncrease: finalAmount, actorUid: staffUser.uid, occurredAt: now, note: `Phí sửa chữa ${woData.code || workOrderId}`
        }));
      }
      if (paidAmount > 0) {
        const paidLedgerId = `DLE_TECH_${workOrderId}_INITIAL_PAYMENT`;
        transaction.create(db.collection('debtLedgerEntries').doc(paidLedgerId), debtLedgerEntry({
          id: paidLedgerId, branchId: woData.branchId, partyAccountId: customerIdentity.branchPartyAccountId,
          partyMasterId: customerIdentity.partyMasterId, legacyPartnerId: customerId, direction: 'RECEIVABLE',
          sourceType: 'PAYMENT', sourceDocumentId: workOrderId, sourceDocumentCode: woData.code || workOrderId,
          creditDecrease: paidAmount, actorUid: staffUser.uid, occurredAt: now, note: `Thu tiền sửa chữa ${woData.code || workOrderId}`
        }));
      }
      if (finalAmount > 0) {
        const openItem = newDebtOpenItemRecord({
          branchId: String(woData.branchId || ''),
          partyAccountId: customerIdentity.branchPartyAccountId,
          partyMasterId: customerIdentity.partyMasterId,
          legacyPartnerId: customerId,
          direction: 'RECEIVABLE',
          sourceType: 'TECHNICAL_WORK_ORDER',
          sourceDocumentId: workOrderId,
          sourceDocumentCode: String(woData.code || workOrderId),
          originalAmount: finalAmount,
          settledAmount: paidAmount,
          actorUid: staffUser.uid,
          occurredAt: now
        });
        transaction.create(db.collection('debtOpenItems').doc(openItem.id), openItem);
      }
    }
    transaction.set(db.collection('repairPayments').doc(`REPAIR_PAYMENT_${workOrderId}`), {
      id: `REPAIR_PAYMENT_${workOrderId}`,
      workOrderId,
      workOrderCode: woData.code || workOrderId,
      branchId: woData.branchId,
      customerName: woData.customerName || '',
      customerId,
      partyMasterId: customerIdentity?.partyMasterId || null,
      branchPartyAccountId: customerIdentity?.branchPartyAccountId || null,
      finalAmount,
      paidAmount,
      balanceDue,
      paymentMethod,
      fundId: fundRef?.id || null,
      cashTransactionId: paymentTransactionId,
      collectedByUid: staffUser.uid,
      collectedByName: staffUser.name || 'Nhân viên bàn giao',
      collectedAt: now,
      note: paymentNote,
      status: paymentStatus,
      createdAt: FieldValue.serverTimestamp()
    });

    // 1. Update Work Order
    transaction.update(woRef, {
      status: 'DELIVERED_TO_CUSTOMER',
      deliveredAt: now,
      deliveredByUid: staffUser.uid,
      deliveryNotes: normalizedDeliveryNotes,
      finalServiceAmount: finalAmount,
      approvedFinalAmount: finalAmount,
      paidAmount,
      balanceDue,
      paymentStatus,
      paymentMethod,
      paymentFundId: fundRef?.id || null,
      paymentTransactionId,
      ...(customerIdentity ? {
        customerId,
        partyMasterId: customerIdentity.partyMasterId,
        branchPartyAccountId: customerIdentity.branchPartyAccountId
      } : {}),
      updatedAt: FieldValue.serverTimestamp()
    });

    if (shouldActivateDeliveryCommission) {
      for (const lineId of woData.taskLineIds || []) {
        const commissionId = `COMM_${lineId}`;
        const commissionDoc = deliveryCommissionDocs.find((doc) => doc.id === commissionId);
        if (!commissionDoc) throw new Error('TECHNICAL_COMMISSION_NOT_FOUND');
        const commission = commissionDoc.data();
        const staffUid = String(commission.staffUid || '').trim();
        const assignedPeriod = String(commission.assignedPeriod || getVietnamMonthString(commission.assignedAt || now));
        transaction.update(commissionDoc.ref, {
          status: 'ELIGIBLE',
          eligibleAt: now,
          ...deliveryCommissionPeriods.get(commissionPayrollResolutionKey(staffUid, assignedPeriod)),
          eligibilityReason: 'DELIVERED_TO_CUSTOMER',
          approvedByUid: staffUser.uid,
          customerDeliveryConfirmedAt: now,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    const transactionWithDelete = transaction as typeof transaction & { delete?: (reference: DocumentReference) => void };
    transactionWithDelete.delete?.(db.collection('technicalSecrets').doc(workOrderId));

    // 2. Update Device (Keep sold / customer-owned!)
    if (woData.deviceId) {
      const devRef = db.collection('devices').doc(woData.deviceId);
      transaction.update(devRef, {
        serviceStatus: 'DELIVERED',
        currentCustodian: woData.customerName || 'Khách Hàng',
        currentCustodianUid: 'CUSTOMER',
        technicianAssigned: FieldValue.delete(),
        activeWorkOrderId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    transaction.set(idemRef, {
      scope: 'DELIVER_CUSTOMER',
      workOrderId,
      payloadHash: deliveryPayloadHash,
      actorUid,
      branchId,
      createdAt: now
    });

    return { success: true, workOrderId };
  });
}

export async function processCollectTechnicalDebtPayment(
  db: Firestore,
  workOrderId: string,
  input: { amount: number; paymentMethod: 'CASH' | 'BANK'; fundId: string; note?: string; idempotencyKey: string },
  actor: TechnicalActor
): Promise<{ success: boolean; balanceDue: number; paymentId: string }> {
  const amount = parseVnd(input.amount, { field: 'REPAIR_PAYMENT_AMOUNT' });
  const paymentMethod = String(input.paymentMethod || '').toUpperCase();
  if (!['CASH', 'BANK'].includes(paymentMethod)) throw new Error('REPAIR_PAYMENT_METHOD_INVALID');
  const fundId = String(input.fundId || '').trim();
  if (!fundId) throw new Error('REPAIR_PAYMENT_FUND_REQUIRED');
  const key = requireTechnicalIdempotencyKey(input.idempotencyKey);
  const paymentPayloadHash = crypto.createHash('sha256').update(JSON.stringify({
    workOrderId,
    amount,
    paymentMethod,
    fundId,
    note: String(input.note || '').trim()
  })).digest('hex');
  const paymentId = `REPAIR_PAYMENT_${technicalIdempotencyId(workOrderId, key).slice(0, 28).toUpperCase()}`;
  const idemRef = db.collection('technicalOperationIdempotency').doc(technicalIdempotencyId(`TECH_DEBT_PAYMENT:${workOrderId}`, key));
  const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
  const fundRef = db.collection('funds').doc(fundId);
  return db.runTransaction(async transaction => {
    const [woSnap, fundSnap, idemSnap] = await Promise.all([transaction.get(woRef), transaction.get(fundRef), transaction.get(idemRef)]);
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    const wo = woSnap.data()!;
    const branchId = String(wo.branchId || '').trim();
    if (!branchId || !canAccessBranch(actor, branchId)) throw new Error('BRANCH_FORBIDDEN');
    if (idemSnap.exists) {
      const idem = idemSnap.data()!;
      if (String(idem.payloadHash || '') !== paymentPayloadHash || String(idem.actorUid || '') !== actor.uid || String(idem.branchId || '') !== branchId) {
        throw new Error('TECHNICAL_PAYMENT_IDEMPOTENCY_CONFLICT');
      }
      if (!Object.prototype.hasOwnProperty.call(idem, 'resultBalanceDue')) {
        throw new Error('TECHNICAL_PAYMENT_IDEMPOTENCY_RESULT_MISSING');
      }
      const resultBalanceDue = parseVnd(idem.resultBalanceDue, {
        allowZero: true,
        field: 'TECHNICAL_PAYMENT_IDEMPOTENCY_RESULT',
        max: Number.MAX_SAFE_INTEGER
      });
      return { success: true, balanceDue: resultBalanceDue, paymentId };
    }
    if (wo.status !== 'DELIVERED_TO_CUSTOMER') throw new Error('CUSTOMER_DELIVERY_REQUIRED');
    const currentBalanceDue = parseVnd(wo.balanceDue ?? 0, {
      allowZero: true,
      field: 'REPAIR_PAYMENT_BALANCE_DUE',
      max: Number.MAX_SAFE_INTEGER
    });
    const currentPaidAmount = parseVnd(wo.paidAmount ?? 0, {
      allowZero: true,
      field: 'REPAIR_PAYMENT_PAID_AMOUNT',
      max: Number.MAX_SAFE_INTEGER
    });
    if (amount > currentBalanceDue) throw new Error('REPAIR_PAYMENT_EXCEEDS_BALANCE');
    const nextPaidAmount = currentPaidAmount + amount;
    parseVnd(nextPaidAmount, {
      allowZero: true,
      field: 'REPAIR_PAYMENT_PAID_AMOUNT',
      max: Number.MAX_SAFE_INTEGER
    });
    if (!fundSnap.exists) throw new Error('REPAIR_PAYMENT_FUND_NOT_FOUND');
    const fund = fundSnap.data()!;
    if (String(fund.branchId || '') !== branchId) throw new Error('REPAIR_PAYMENT_FUND_BRANCH_MISMATCH');
    if (String(fund.type || '').toUpperCase() !== paymentMethod) throw new Error('REPAIR_PAYMENT_FUND_TYPE_MISMATCH');
    if (fund.isActive === false || fund.active === false || fund.isArchived) throw new Error('REPAIR_PAYMENT_FUND_INACTIVE');
    const customerId = String(wo.customerId || '').trim();
    const partyMasterId = String(wo.partyMasterId || '').trim();
    const accountId = String(wo.branchPartyAccountId || '').trim();
    if (!customerId || !partyMasterId || !accountId) throw new Error('CUSTOMER_DEBT_IDENTITY_NOT_FOUND');
    const customerRef = db.collection('partners').doc(customerId);
    const masterRef = db.collection('partyMasters').doc(partyMasterId);
    const accountRef = db.collection('branchPartyAccounts').doc(accountId);
    const openItemRef = db.collection('debtOpenItems').doc(debtOpenItemId('TECHNICAL_WORK_ORDER', workOrderId, 'RECEIVABLE'));
    const [customerSnap, masterSnap, accountSnap, openItemSnap] = await Promise.all([
      transaction.get(customerRef),
      transaction.get(masterRef),
      transaction.get(accountRef),
      transaction.get(openItemRef)
    ]);
    if (!customerSnap.exists || !masterSnap.exists || !accountSnap.exists) throw new Error('CUSTOMER_DEBT_ACCOUNT_NOT_FOUND');
    const customer = customerSnap.data()!;
    const master = masterSnap.data()!;
    const account = accountSnap.data()!;
    if (String(customer.id || customerSnap.id || '') !== customerId) throw new Error('CUSTOMER_DEBT_CUSTOMER_MISMATCH');
    if (String(customer.branchId || '') !== branchId) throw new Error('CUSTOMER_DEBT_BRANCH_MISMATCH');
    if (!['CUSTOMER', 'BOTH'].includes(String(customer.type || '').toUpperCase())) throw new Error('CUSTOMER_DEBT_TYPE_INVALID');
    if (customer.isActive === false || customer.isArchived === true) throw new Error('CUSTOMER_DEBT_CUSTOMER_INACTIVE');
    if (String(customer.partyMasterId || '') !== partyMasterId || String(customer.branchPartyAccountId || '') !== accountId) {
      throw new Error('CUSTOMER_DEBT_IDENTITY_MISMATCH');
    }
    if (String(master.id || masterSnap.id || '') !== partyMasterId || String(master.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') {
      throw new Error('CUSTOMER_DEBT_IDENTITY_MISMATCH');
    }
    if (String(account.branchId || '') !== branchId) throw new Error('CUSTOMER_DEBT_ACCOUNT_BRANCH_MISMATCH');
    if (String(account.partyMasterId || '') !== partyMasterId || String(account.legacyPartnerId || '') !== customerId) {
      throw new Error('CUSTOMER_DEBT_ACCOUNT_IDENTITY_MISMATCH');
    }
    if (!['CUSTOMER', 'BOTH'].includes(String(account.type || '').toUpperCase())) throw new Error('CUSTOMER_DEBT_ACCOUNT_TYPE_INVALID');
    if (String(account.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') throw new Error('CUSTOMER_DEBT_ACCOUNT_INACTIVE');
    const accountReceivableBalance = Number(account.receivableBalance);
    const customerOutstandingDebt = Number(customer.outstandingDebt);
    if (!Number.isSafeInteger(accountReceivableBalance) || accountReceivableBalance < currentBalanceDue) {
      throw new Error('CUSTOMER_DEBT_ACCOUNT_BALANCE_MISMATCH');
    }
    if (!Number.isSafeInteger(customerOutstandingDebt) || customerOutstandingDebt < currentBalanceDue) {
      throw new Error('CUSTOMER_DEBT_PROJECTION_MISMATCH');
    }
    const now = new Date().toISOString();
    const currentOpenItem = openItemSnap.exists
      ? openItemSnap.data()!
      : newDebtOpenItemRecord({
        branchId,
        partyAccountId: accountId,
        partyMasterId,
        legacyPartnerId: customerId,
        direction: 'RECEIVABLE',
        sourceType: 'TECHNICAL_WORK_ORDER',
        sourceDocumentId: workOrderId,
        sourceDocumentCode: String(wo.code || workOrderId),
        originalAmount: currentPaidAmount + currentBalanceDue,
        settledAmount: currentPaidAmount,
        actorUid: actor.uid,
        occurredAt: String(wo.deliveredAt || wo.createdAt || now)
      });
    assertDebtOpenItemScope(currentOpenItem, {
      branchId,
      partyAccountId: accountId,
      partyMasterId,
      legacyPartnerId: customerId,
      direction: 'RECEIVABLE',
      sourceType: 'TECHNICAL_WORK_ORDER',
      sourceDocumentId: workOrderId,
      openAmount: currentBalanceDue
    });
    const nextBalanceDue = currentBalanceDue - amount;
    const currentFundBalance = parseVnd(fund.currentBalance ?? 0, {
      allowZero: true,
      field: 'REPAIR_PAYMENT_FUND_BALANCE',
      max: Number.MAX_SAFE_INTEGER
    });
    const currentTotalIncome = parseVnd(fund.totalIncome ?? 0, {
      allowZero: true,
      field: 'REPAIR_PAYMENT_FUND_TOTAL_INCOME',
      max: Number.MAX_SAFE_INTEGER
    });
    const nextFundBalance = currentFundBalance + amount;
    const nextTotalIncome = currentTotalIncome + amount;
    parseVnd(nextFundBalance, { allowZero: true, field: 'REPAIR_PAYMENT_FUND_BALANCE', max: Number.MAX_SAFE_INTEGER });
    parseVnd(nextTotalIncome, { allowZero: true, field: 'REPAIR_PAYMENT_FUND_TOTAL_INCOME', max: Number.MAX_SAFE_INTEGER });
    transaction.update(fundRef, {
      currentBalance: nextFundBalance,
      totalIncome: nextTotalIncome,
      updatedAt: now
    });
    transaction.create(db.collection('cashTransactions').doc(`TECH_DEBT_RECEIPT_${paymentId}`), {
      id: `TECH_DEBT_RECEIPT_${paymentId}`, code: `PTSC-${String(wo.code || workOrderId)}-${paymentId.slice(-6)}`,
      type: 'RECEIPT', amount, category: 'REPAIR_DEBT_COLLECTION', categoryName: 'Thu công nợ sửa chữa',
      fundId, fundName: fund.name || 'Quỹ thu tiền', fundType: fund.type || paymentMethod,
      partnerId: customerId, partnerName: customer.name || wo.customerName || 'Khách sửa chữa', partnerType: 'CUSTOMER',
      branchId: wo.branchId, referenceType: 'TECHNICAL_WORK_ORDER', referenceId: workOrderId,
      referenceCode: wo.code || workOrderId, date: now, notes: input.note || `Thu công nợ phiếu sửa ${wo.code || workOrderId}`,
      creator: actor.name || actor.uid, creatorUid: actor.uid, isPLAccounted: false, status: 'COMPLETED', createdAt: FieldValue.serverTimestamp()
    });
    transaction.create(db.collection('repairPayments').doc(paymentId), {
      id: paymentId, workOrderId, workOrderCode: wo.code || workOrderId, branchId: wo.branchId,
      customerId, customerName: customer.name || wo.customerName || '', amount, paymentMethod, fundId,
      collectedByUid: actor.uid, collectedByName: actor.name || actor.uid, collectedAt: now,
      note: String(input.note || '').trim(), status: 'PAID', createdAt: FieldValue.serverTimestamp()
    });
    const debtLedgerId = `DLE_TECH_${paymentId}`;
    transaction.create(db.collection('debtLedgerEntries').doc(debtLedgerId), debtLedgerEntry({
      id: debtLedgerId, branchId, partyAccountId: accountId,
      partyMasterId, legacyPartnerId: customerId, direction: 'RECEIVABLE',
      sourceType: 'PAYMENT', sourceDocumentId: workOrderId, sourceDocumentCode: wo.code || workOrderId,
      creditDecrease: amount, actorUid: actor.uid, occurredAt: now, note: input.note || `Thu công nợ sửa chữa ${wo.code || workOrderId}`
    }));
    transaction.set(openItemRef, {
      ...currentOpenItem,
      ...settleDebtOpenItemRecord(currentOpenItem, amount, {
        settlementId: paymentId,
        actorUid: actor.uid,
        occurredAt: now
      })
    });
    transaction.update(accountRef, {
      receivableBalance: accountReceivableBalance - amount,
      updatedByUid: actor.uid, updatedAt: now
    });
    transaction.update(customerRef, { outstandingDebt: customerOutstandingDebt - amount, updatedAt: now });
    transaction.update(woRef, {
      paidAmount: nextPaidAmount,
      balanceDue: nextBalanceDue,
      paymentStatus: nextBalanceDue === 0 ? 'PAID' : 'PARTIAL',
      updatedAt: FieldValue.serverTimestamp()
    });
    transaction.create(idemRef, {
      scope: 'TECH_DEBT_PAYMENT', workOrderId, paymentId, payloadHash: paymentPayloadHash,
      actorUid: actor.uid, branchId, resultBalanceDue: nextBalanceDue, createdAt: now
    });
    return { success: true, balanceDue: nextBalanceDue, paymentId };
  });
}

/**
 * 8. Reserve and Issue Spare Parts atomically
 */
export async function processIssueSparePart(
  db: Firestore,
  workOrderId: string,
  lineId: string,
  partId: string,
  quantity: number,
  technicianUser: { uid: string; name?: string; role?: string; branchId?: string; assignedBranchIds?: string[] }
): Promise<{ success: boolean; partId: string; remainingStock: number }> {
  // Deliberately retired. This legacy helper bypassed task policy, personal
  // warehouse custody, lot-cost snapshots and the immutable part ledger.
  // All callers must use POST /api/technical/work-orders/:id/parts/issue.
  void db; void workOrderId; void lineId; void partId; void quantity; void technicianUser;
  throw new Error('LEGACY_PART_ISSUE_RETIRED_USE_PART_LEDGER');
}
