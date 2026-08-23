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

export interface CreateWorkOrderLineInput {
  taskType: string;
  priority?: TechnicalPriority;
  assigneeUid: string;
  assigneeName: string;
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
}

export interface CustomerDeliveryPaymentInput {
  finalAmount?: number;
  paidAmount?: number;
  paymentMethod?: 'CASH' | 'BANK' | 'DEBT';
  fundId?: string;
  note?: string;
}

function canAccessBranch(user: any, targetBranchId?: string): boolean {
  if (!targetBranchId) return true;
  if (user?.role === 'ADMIN') return true;
  const userBranchId = user?.branchId;
  const assigned = user?.assignedBranchIds || [];
  return userBranchId === targetBranchId || assigned.includes(targetBranchId);
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
        status: 'ASSIGNED',
        requiredParts: config.requiredPartTemplates || [],
        intakeIssueTypes: config.intakeIssueTypes || [],
        requiredEvidenceTypes: config.requiredEvidenceTypes || [],
        qcChecklistTemplateId: config.qcChecklistTemplateId || null,
        evidencePhotoUrls: [],
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
        payrollPeriod: now.slice(0, 7), // YYYY-MM
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
  if (urls.length < 1 || urls.length > 6 || urls.some(url => !isTechnicalEvidenceUrlForWorkOrder(url, workOrderId))) {
    throw new Error('INTAKE_EVIDENCE_INVALID: Cần từ 1 đến 6 ảnh thuộc đúng phiếu tiếp nhận.');
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
  const handoverPhotoUrls = preRepairInspection?.handoverPhotoUrls;
  if (!preRepairInspection || !Array.isArray(handoverPhotoUrls) || handoverPhotoUrls.length === 0 || handoverPhotoUrls.length > 6 || handoverPhotoUrls.some(url => !isTechnicalEvidenceUrlForWorkOrder(url, workOrderId))) {
    throw new Error('PRE_REPAIR_INSPECTION_EVIDENCE_REQUIRED: Bắt buộc checklist và 1–6 ảnh tình trạng khi KTV nhận máy.');
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
    const canAccept = isAssignedTech || technicianUser.role === 'ADMIN' || technicianUser.role === 'MANAGER' || technicianUser.role === 'TECH_LEAD';

    if (!canAccept) {
      throw new Error('TECHNICIAN_NOT_ASSIGNED: Bạn không có tên trong danh sách KTV được phân công xử lý phiếu kỹ thuật này.');
    }

    const currentStatus = woData.status as WorkOrderStatus;
    if (currentStatus !== 'ASSIGNED' && currentStatus !== 'DRAFT' && currentStatus !== 'QC_FAILED_REWORK') {
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
      movementType: 'TECH_ACCEPT',
      fromLocationId: woData.currentLocationId || woData.sourceWarehouseId || null,
      toLocationId: techLocationId,
      fromCustodianUid: woData.currentCustodianUid,
      toCustodianUid: technicianUser.uid,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      workOrderId,
      performedByUid: technicianUser.uid,
      confirmedByUid: technicianUser.uid,
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
    handoverPhotoUrls: string[];
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
  if (!Array.isArray(input.handoverPhotoUrls) || input.handoverPhotoUrls.length < 1 || input.handoverPhotoUrls.length > 6 || input.handoverPhotoUrls.some(url => !isTechnicalEvidenceUrlForWorkOrder(url, workOrderId))) {
    throw new Error('TECH_HANDOFF_EVIDENCE_REQUIRED');
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
      requestPhotoUrls: input.handoverPhotoUrls,
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
  input: { scannedImei: string; handoverPhotoUrls: string[]; notes?: string; idempotencyKey: string },
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
    if (!Array.isArray(input.handoverPhotoUrls) || input.handoverPhotoUrls.length < 1 || input.handoverPhotoUrls.length > 6 || input.handoverPhotoUrls.some(url => !isTechnicalEvidenceUrlForWorkOrder(url, String(handoff.workOrderId || '')))) {
      throw new Error('TECH_HANDOFF_EVIDENCE_REQUIRED');
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
      acceptancePhotoUrls: input.handoverPhotoUrls,
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
    if (woSnap.data()?.activeHandoffId) throw new Error('TECH_HANDOFF_PENDING: Không thể bắt đầu task khi máy đang chờ bàn giao trách nhiệm.');

    const lineData = lineSnap.data()!;

    // Parent-Child URL Verification
    if (lineData.workOrderId !== workOrderId) {
      throw new Error(`WORK_ORDER_MISMATCH: Hạng mục "${lineId}" không thuộc phiếu kỹ thuật "${workOrderId}".`);
    }

    // Assignee Verification
    if (lineData.assigneeUid !== technicianUser.uid && technicianUser.role !== 'ADMIN' && technicianUser.role !== 'MANAGER') {
      throw new Error('PERMISSION_DENIED: Hạng mục này không được phân công cho bạn.');
    }

    // State Machine Validation
    const transition = canTransitionTaskLine(lineData.status as TaskLineStatus, 'IN_PROGRESS');
    if (!transition.allowed) {
      throw new Error(transition.reason);
    }

    const now = new Date().toISOString();
    transaction.update(lineRef, {
      status: 'IN_PROGRESS',
      startedAt: now,
      updatedAt: FieldValue.serverTimestamp()
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
 * 4. Complete a work order line with evidence photos
 */
export async function processCompleteTaskLine(
  db: Firestore,
  workOrderId: string,
  lineId: string,
  evidencePhotoUrls: string[],
  notes: string,
  technicianUser: { uid: string; role?: string },
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

    // Assignee Verification
    if (lineData.assigneeUid !== technicianUser.uid && technicianUser.role !== 'ADMIN' && technicianUser.role !== 'MANAGER') {
      throw new Error('PERMISSION_DENIED: Hạng mục này không được phân công cho bạn.');
    }

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
    if (requiredEvidenceTypes.includes('AFTER_PHOTO') && evidencePhotoUrls.length === 0) {
      throw new Error('AFTER_PHOTO_REQUIRED: Hạng mục này bắt buộc có ảnh sau sửa.');
    }

    const replacementSerials = Array.isArray(completionMetadata.replacementSerials)
      ? completionMetadata.replacementSerials.map(value => String(value).trim()).filter(Boolean)
      : [];
    if (requiredEvidenceTypes.includes('REPLACEMENT_SERIAL') && replacementSerials.length === 0) {
      throw new Error('REPLACEMENT_SERIAL_REQUIRED: Hạng mục này bắt buộc ghi serial linh kiện thay thế.');
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
    const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const woSnap = await transaction.get(woRef);
    const woData = woSnap.exists ? woSnap.data()! : {};
    if (!woSnap.exists) throw new Error('WORK_ORDER_NOT_FOUND');
    if (woData.activeHandoffId) throw new Error('TECH_HANDOFF_PENDING: Không thể hoàn thành task khi máy đang chờ bàn giao trách nhiệm.');
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
    transaction.update(lineRef, {
      status: 'COMPLETED',
      completedAt: now,
      evidencePhotoUrls,
      completionNotes: normalizedNotes,
      completionMetadata: {
        replacementSerials,
        postRepairMetrics: completionMetadata.postRepairMetrics || {}
      },
      updatedAt: FieldValue.serverTimestamp()
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

    // E. Checklist Verification: All required steps must be true for PASS
    const checklist = inspection.checklistResults || {};
    if (inspection.overallResult === 'PASS') {
      for (const reqStep of REQUIRED_QC_CHECKLIST_STEPS) {
        if (checklist[reqStep] !== true) {
          throw new Error(`INCOMPLETE_CHECKLIST: Bước kiểm tra bắt buộc "${reqStep}" chưa đạt chuẩn.`);
        }
      }
    } else {
      if (!inspection.failedReason || inspection.failedReason.trim().length === 0) {
        throw new Error('FAILED_REASON_REQUIRED: Bắt buộc nhập lý do không đạt KCS để KTV có căn cứ xử lý lại.');
      }
    }
    const qcEvidenceUrls = Array.isArray(inspection.photoEvidenceUrls) ? inspection.photoEvidenceUrls : [];
    if (qcEvidenceUrls.length < 1 || qcEvidenceUrls.length > 8 || qcEvidenceUrls.some(url => !isTechnicalEvidenceUrlForWorkOrder(url, workOrderId))) {
      throw new Error('QC_PHOTO_EVIDENCE_REQUIRED: KCS phải có từ 1 đến 8 ảnh bằng chứng hợp lệ.');
    }

    const now = new Date().toISOString();
    const inspectionId = `QC_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

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
      checklistResults: checklist,
      overallResult: inspection.overallResult,
      failedReason: inspection.failedReason || null,
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
        const commRef = db.collection('commissionLedger').doc(`COMM_${lineDoc.id}`);
        transaction.update(commRef, (woData.eligibilityRequiresStockReturn || woData.eligibilityRequiresCustomerDelivery) ? {
          status: 'PENDING',
          qcApprovedAt: now,
          qcApprovedByUid: inspectorUser.uid,
          updatedAt: FieldValue.serverTimestamp()
        } : {
          status: 'ELIGIBLE',
          eligibleAt: now,
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

      // Reset task lines to REWORK_REQUIRED
      for (const lineDoc of allLinesSnap.docs) {
        transaction.update(lineDoc.ref, {
          status: 'REWORK_REQUIRED',
          reworkReason: inspection.failedReason,
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
        transaction.update(db.collection('commissionLedger').doc(`COMM_${lineId}`), {
          status: 'ELIGIBLE',
          eligibleAt: now,
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
  return await db.runTransaction(async (transaction) => {
    const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) {
      throw new Error(`WORK_ORDER_NOT_FOUND: Không tìm thấy phiếu kỹ thuật "${workOrderId}".`);
    }

    const woData = woSnap.data()!;
    const isCustomerDevice = woData.assetOwnership === 'CUSTOMER' || ['CUSTOMER_SERVICE', 'WARRANTY'].includes(String(woData.workOrderType || ''));
    if (!isCustomerDevice) {
      throw new Error('CUSTOMER_DELIVERY_ONLY: Máy thuộc công ty phải được Kho Tổng quét nhận và kết chuyển giá vốn, không được đi qua luồng giao khách.');
    }
    if (woData.status !== 'QC_PASSED') {
      throw new Error(`DEVICE_NOT_QC_PASSED: Máy phải đạt chuẩn KCS (QC_PASSED) trước khi bàn giao trả khách hàng.`);
    }

    if (!canAccessBranch(staffUser, woData.branchId)) {
      throw new Error(`BRANCH_FORBIDDEN: Bạn không có quyền thao tác trên chi nhánh "${woData.branchId}".`);
    }

    const finalAmount = Number(paymentInput?.finalAmount ?? woData.finalServiceAmount ?? woData.customerApprovedQuote ?? woData.totalEstimatedCost ?? 0);
    const paidAmount = Number(paymentInput?.paidAmount ?? 0);
    const paymentMethod = String(paymentInput?.paymentMethod || (paidAmount > 0 ? 'CASH' : 'DEBT')).toUpperCase();
    if (!Number.isFinite(finalAmount) || finalAmount < 0 || !Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > finalAmount) {
      throw new Error('REPAIR_PAYMENT_AMOUNT_INVALID');
    }
    if (!['CASH', 'BANK', 'DEBT'].includes(paymentMethod)) throw new Error('REPAIR_PAYMENT_METHOD_INVALID');
    if (paidAmount > 0 && paymentMethod === 'DEBT') throw new Error('REPAIR_PAYMENT_METHOD_INVALID');
    if (paidAmount > 0 && !String(paymentInput?.fundId || '').trim()) throw new Error('REPAIR_PAYMENT_FUND_REQUIRED');

    const now = new Date().toISOString();
    const fundRef = paidAmount > 0 ? db.collection('funds').doc(String(paymentInput?.fundId || '').trim()) : null;
    const fundSnap = fundRef ? await transaction.get(fundRef) : null;
    const fund = fundSnap?.data();
    const expectedFundType = paymentMethod === 'CASH' ? 'CASH' : 'BANK';
    if (paidAmount > 0) {
      if (!fundSnap?.exists || !fund) throw new Error('REPAIR_PAYMENT_FUND_NOT_FOUND');
      if (fund.isActive === false || fund.active === false || fund.isArchived) throw new Error('REPAIR_PAYMENT_FUND_INACTIVE');
      if (String(fund.branchId || '') !== String(woData.branchId || '')) throw new Error('REPAIR_PAYMENT_FUND_BRANCH_MISMATCH');
      if (String(fund.type || '').toUpperCase() !== expectedFundType) throw new Error('REPAIR_PAYMENT_FUND_TYPE_MISMATCH');
    }
    const balanceDue = Math.max(0, finalAmount - paidAmount);
    const paymentStatus = finalAmount === 0 ? 'NOT_REQUIRED' : balanceDue === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';
    const paymentTransactionId = paidAmount > 0 ? `TECH_REPAIR_RECEIPT_${workOrderId}` : null;

    if (fundRef && fund) {
      transaction.update(fundRef, {
        currentBalance: Number(fund.currentBalance || 0) + paidAmount,
        totalIncome: Number(fund.totalIncome || 0) + paidAmount,
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
        partnerId: woData.customerId || '',
        partnerName: woData.customerName || 'Khách sửa chữa',
        partnerType: 'CUSTOMER',
        branchId: woData.branchId,
        referenceType: 'TECHNICAL_WORK_ORDER',
        referenceId: workOrderId,
        referenceCode: woData.code || workOrderId,
        date: now,
        notes: paymentInput?.note || `Thu tiền phiếu sửa ${woData.code || workOrderId}`,
        creator: staffUser.name || 'Nhân viên bàn giao',
        creatorUid: staffUser.uid,
        isPLAccounted: true,
        status: 'COMPLETED',
        createdAt: FieldValue.serverTimestamp()
      });
    }
    transaction.set(db.collection('repairPayments').doc(`REPAIR_PAYMENT_${workOrderId}`), {
      id: `REPAIR_PAYMENT_${workOrderId}`,
      workOrderId,
      workOrderCode: woData.code || workOrderId,
      branchId: woData.branchId,
      customerName: woData.customerName || '',
      finalAmount,
      paidAmount,
      balanceDue,
      paymentMethod,
      fundId: fundRef?.id || null,
      cashTransactionId: paymentTransactionId,
      collectedByUid: staffUser.uid,
      collectedByName: staffUser.name || 'Nhân viên bàn giao',
      collectedAt: now,
      note: paymentInput?.note || '',
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
      paidAmount,
      balanceDue,
      paymentStatus,
      paymentMethod,
      paymentFundId: fundRef?.id || null,
      paymentTransactionId,
      updatedAt: FieldValue.serverTimestamp()
    });

    if (woData.eligibilityRequiresCustomerDelivery || ['CUSTOMER_SERVICE', 'WARRANTY'].includes(String(woData.workOrderType || ''))) {
      for (const lineId of woData.taskLineIds || []) {
        transaction.update(db.collection('commissionLedger').doc(`COMM_${lineId}`), {
          status: 'ELIGIBLE',
          eligibleAt: now,
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

    return { success: true, workOrderId };
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
