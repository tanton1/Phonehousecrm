import { Firestore, FieldValue, DocumentReference } from 'firebase-admin/firestore';
import crypto from 'crypto';

export interface CreateWorkOrderLineInput {
  taskCode: 'LV' | 'EK' | 'TP' | 'RC2.5' | 'FIX_FACE' | 'MAIN' | 'KCS' | 'OTHER';
  taskName: string;
  assigneeUid: string;
  assigneeName: string;
  ratePolicyId?: string;
  ratePolicyVersion?: string;
  commissionAmount: number;
  requiredParts?: Array<{ partId: string; partName: string; quantity: number }>;
}

export interface CreateWorkOrderInput {
  deviceId: string;
  imei: string;
  model: string;
  workOrderType: 'INBOUND_PREP' | 'CUSTOMER_SERVICE' | 'WARRANTY' | 'TRADE_IN_REFURB' | 'SHOP_RETURN_REWORK';
  branchId: string;
  sourceWarehouseId?: string;
  customerName?: string;
  customerPhone?: string;
  customerApprovedQuote?: number;
  totalEstimatedCost?: number;
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

export async function processCreateWorkOrder(
  db: Firestore,
  input: CreateWorkOrderInput,
  creatorUser: { uid: string; name?: string; role?: string }
): Promise<{ workOrderId: string; code: string; lineIds: string[] }> {
  if (!input.imei || input.imei.trim().length === 0) {
    throw new Error('IMEI_REQUIRED: Bắt buộc phải có số IMEI thật để khởi tạo phiếu kỹ thuật.');
  }

  if (!input.lines || input.lines.length === 0) {
    throw new Error('WORK_ORDER_LINES_REQUIRED: Phiếu kỹ thuật phải có ít nhất 1 hạng mục công việc.');
  }

  const now = new Date().toISOString();
  const workOrderId = `WO_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const code = `SC-${now.slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const branchId = input.branchId || 'CN01';
  const initialLocation = input.sourceWarehouseId || 'KHO_TONG';

  return await db.runTransaction(async (transaction) => {
    // 1. Invariant: Only ONE active work order per IMEI
    const existingActiveOrders = await transaction.get(
      db.collection('technicalWorkOrders')
        .where('imei', '==', input.imei.trim())
        .where('status', 'in', ['ASSIGNED', 'ACCEPTED', 'DIAGNOSING', 'IN_PROGRESS', 'TECH_COMPLETED', 'QC_PENDING'])
        .limit(1)
    );

    const hasActive = existingActiveOrders && !existingActiveOrders.empty && Array.isArray(existingActiveOrders.docs) && existingActiveOrders.docs.length > 0;

    if (hasActive) {
      const activeDoc = existingActiveOrders.docs[0];
      throw new Error(`ACTIVE_WORK_ORDER_EXISTS: IMEI ${input.imei} đang có phiếu kỹ thuật active (${activeDoc.data().code || activeDoc.id}).`);
    }

    // 2. Read or verify device
    let devRef: DocumentReference | null = null;
    let devData: any = null;
    if (input.deviceId) {
      devRef = db.collection('devices').doc(input.deviceId);
      const devSnap = await transaction.get(devRef);
      if (devSnap.exists) {
        devData = devSnap.data();
      }
    }

    // 3. Create Task Lines
    const lineIds: string[] = [];
    let totalCommission = 0;

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      const lineId = `WOL_${workOrderId}_${i + 1}`;
      lineIds.push(lineId);
      totalCommission += line.commissionAmount || 0;

      const lineDocRef = db.collection('technicalWorkOrderLines').doc(lineId);
      transaction.set(lineDocRef, {
        id: lineId,
        workOrderId,
        deviceId: input.deviceId,
        imei: input.imei.trim(),
        model: input.model,
        taskCode: line.taskCode,
        taskName: line.taskName,
        assigneeUid: line.assigneeUid,
        assigneeName: line.assigneeName,
        ratePolicyId: line.ratePolicyId || 'STANDARD_MATRIX_V1',
        ratePolicyVersion: line.ratePolicyVersion || '2026.1',
        commissionAmount: line.commissionAmount || 0,
        status: 'ASSIGNED',
        requiredParts: line.requiredParts || [],
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
        imei: input.imei.trim(),
        taskCode: line.taskCode,
        taskName: line.taskName,
        amount: line.commissionAmount || 0,
        status: 'PENDING',
        payrollPeriod: now.slice(0, 7), // YYYY-MM
        createdAt: FieldValue.serverTimestamp()
      });
    }

    // 4. Create Header Technical Work Order
    const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const woRecord = {
      id: workOrderId,
      code,
      deviceId: input.deviceId,
      imei: input.imei.trim(),
      model: input.model,
      workOrderType: input.workOrderType,
      branchId,
      sourceWarehouseId: initialLocation,
      status: 'ASSIGNED',
      currentCustodianUid: creatorUser.uid,
      currentCustodianName: creatorUser.name || 'Thủ Kho',
      currentLocationId: initialLocation,
      taskLineIds: lineIds,
      reworkCount: 0,
      customerName: input.customerName || null,
      customerPhone: input.customerPhone || null,
      customerApprovedQuote: input.customerApprovedQuote || 0,
      totalEstimatedCost: input.totalEstimatedCost || 0,
      totalActualCost: 0,
      totalCommissionAmount: totalCommission,
      notes: input.notes || '',
      createdByUid: creatorUser.uid,
      createdByName: creatorUser.name || 'Quản lý',
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp()
    };
    transaction.set(woRef, woRecord);

    // 5. Update Device operational status and custodian
    if (devRef && devData) {
      transaction.update(devRef, {
        status: 'in_repair',
        currentCustodian: creatorUser.name || 'Thủ Kho',
        currentCustodianUid: creatorUser.uid,
        technicianAssigned: input.lines[0]?.assigneeName || 'Bộ phận Kỹ thuật',
        activeWorkOrderId: workOrderId,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    // 6. Record Initial Inventory Movement
    const movId = `MOV_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    transaction.set(db.collection('inventoryMovements').doc(movId), {
      id: movId,
      deviceId: input.deviceId,
      imei: input.imei.trim(),
      movementType: 'DISPATCH_TO_TECH',
      fromLocationId: initialLocation,
      toLocationId: 'KHO_KTV_CHO_NHAN',
      fromCustodianUid: creatorUser.uid,
      toCustodianUid: input.lines[0]?.assigneeUid || creatorUser.uid,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      performedByUid: creatorUser.uid,
      occurredAt: now,
      createdAt: FieldValue.serverTimestamp()
    });

    return { workOrderId, code, lineIds };
  });
}

/**
 * KTV physically scans IMEI to accept custody and begin responsibility
 */
export async function processAcceptCustody(
  db: Firestore,
  workOrderId: string,
  technicianUser: { uid: string; name?: string; role?: string }
): Promise<{ success: boolean; workOrderId: string }> {
  return await db.runTransaction(async (transaction) => {
    const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) {
      throw new Error(`WORK_ORDER_NOT_FOUND: Không tìm thấy phiếu kỹ thuật "${workOrderId}".`);
    }

    const woData = woSnap.data()!;
    if (woData.status !== 'ASSIGNED' && woData.status !== 'DRAFT') {
      throw new Error(`INVALID_STATUS: Phiếu kỹ thuật đang ở trạng thái "${woData.status}", không thể xác nhận nhận máy.`);
    }

    const now = new Date().toISOString();
    const techLocationId = `KHO_KTV_${technicianUser.uid.slice(0, 8).toUpperCase()}`;

    // Update Work Order
    transaction.update(woRef, {
      status: 'ACCEPTED',
      currentCustodianUid: technicianUser.uid,
      currentCustodianName: technicianUser.name || 'Kỹ thuật viên',
      currentLocationId: techLocationId,
      acceptedAt: now,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Update task lines assigned to this technician
    const linesSnap = await transaction.get(
      db.collection('technicalWorkOrderLines').where('workOrderId', '==', workOrderId)
    );

    for (const doc of linesSnap.docs) {
      const lData = doc.data();
      if (lData.assigneeUid === technicianUser.uid && lData.status === 'ASSIGNED') {
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
        currentCustodian: technicianUser.name || 'Kỹ thuật viên',
        currentCustodianUid: technicianUser.uid,
        technicianAssigned: technicianUser.name || 'Kỹ thuật viên',
        warehouseId: techLocationId,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    // Record Immutable Inventory Movement
    const movId = `MOV_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    transaction.set(db.collection('inventoryMovements').doc(movId), {
      id: movId,
      deviceId: woData.deviceId,
      imei: woData.imei,
      movementType: 'TECH_ACCEPT',
      fromLocationId: woData.currentLocationId || 'KHO_TONG',
      toLocationId: techLocationId,
      fromCustodianUid: woData.currentCustodianUid,
      toCustodianUid: technicianUser.uid,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      performedByUid: technicianUser.uid,
      confirmedByUid: technicianUser.uid,
      occurredAt: now,
      createdAt: FieldValue.serverTimestamp()
    });

    return { success: true, workOrderId };
  });
}

/**
 * Start a specific work order line
 */
export async function processStartTaskLine(
  db: Firestore,
  lineId: string,
  technicianUser: { uid: string }
): Promise<{ success: boolean; lineId: string }> {
  return await db.runTransaction(async (transaction) => {
    const lineRef = db.collection('technicalWorkOrderLines').doc(lineId);
    const lineSnap = await transaction.get(lineRef);
    if (!lineSnap.exists) {
      throw new Error(`LINE_NOT_FOUND: Không tìm thấy hạng mục công việc "${lineId}".`);
    }

    const lineData = lineSnap.data()!;
    if (lineData.assigneeUid !== technicianUser.uid) {
      throw new Error('PERMISSION_DENIED: Hạng mục này không được phân công cho bạn.');
    }

    const now = new Date().toISOString();
    transaction.update(lineRef, {
      status: 'IN_PROGRESS',
      startedAt: now,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Update parent work order status to IN_PROGRESS
    const woRef = db.collection('technicalWorkOrders').doc(lineData.workOrderId);
    transaction.update(woRef, {
      status: 'IN_PROGRESS',
      updatedAt: FieldValue.serverTimestamp()
    });

    return { success: true, lineId };
  });
}

/**
 * Complete a work order line
 */
export async function processCompleteTaskLine(
  db: Firestore,
  lineId: string,
  evidencePhotoUrls: string[],
  notes: string,
  technicianUser: { uid: string }
): Promise<{ success: boolean; lineId: string; workOrderId: string; allLinesCompleted: boolean }> {
  return await db.runTransaction(async (transaction) => {
    const lineRef = db.collection('technicalWorkOrderLines').doc(lineId);
    const lineSnap = await transaction.get(lineRef);
    if (!lineSnap.exists) {
      throw new Error(`LINE_NOT_FOUND: Không tìm thấy hạng mục công việc "${lineId}".`);
    }

    const lineData = lineSnap.data()!;
    if (lineData.assigneeUid !== technicianUser.uid) {
      throw new Error('PERMISSION_DENIED: Hạng mục này không được phân công cho bạn.');
    }

    const now = new Date().toISOString();
    transaction.update(lineRef, {
      status: 'COMPLETED',
      completedAt: now,
      evidencePhotoUrls: evidencePhotoUrls || [],
      completionNotes: notes || '',
      updatedAt: FieldValue.serverTimestamp()
    });

    // Check if ALL lines in the Work Order are now completed
    const allLinesSnap = await transaction.get(
      db.collection('technicalWorkOrderLines').where('workOrderId', '==', lineData.workOrderId)
    );

    let allCompleted = true;
    for (const doc of allLinesSnap.docs) {
      if (doc.id === lineId) continue;
      const status = doc.data().status;
      if (status !== 'COMPLETED' && status !== 'VERIFIED') {
        allCompleted = false;
        break;
      }
    }

    const woRef = db.collection('technicalWorkOrders').doc(lineData.workOrderId);
    if (allCompleted) {
      transaction.update(woRef, {
        status: 'TECH_COMPLETED',
        techCompletedAt: now,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    return { success: true, lineId, workOrderId: lineData.workOrderId, allLinesCompleted: allCompleted };
  });
}

/**
 * Independent QC Inspection (Enforces inspectorUid !== technicianUid)
 */
export async function processQCInspection(
  db: Firestore,
  workOrderId: string,
  inspection: QCInspectionInput,
  inspectorUser: { uid: string; name?: string; role?: string }
): Promise<{ success: boolean; result: 'PASS' | 'FAIL'; inspectionId: string }> {
  return await db.runTransaction(async (transaction) => {
    const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) {
      throw new Error(`WORK_ORDER_NOT_FOUND: Không tìm thấy phiếu kỹ thuật "${workOrderId}".`);
    }

    const woData = woSnap.data()!;

    // 1. Verify Work Order is ready for QC
    if (woData.status !== 'TECH_COMPLETED' && woData.status !== 'QC_PENDING' && woData.status !== 'IN_PROGRESS') {
      throw new Error(`INVALID_QC_STATE: Phiếu kỹ thuật ở trạng thái "${woData.status}", chưa thể nghiệm thu KCS.`);
    }

    // 2. Strict Invariant: Inspector cannot be the technician who repaired the device
    const allLinesSnap = await transaction.get(
      db.collection('technicalWorkOrderLines').where('workOrderId', '==', workOrderId)
    );

    const technicianUids = allLinesSnap.docs.map(d => d.data().assigneeUid);
    const isOnlyTech = technicianUids.length === 1 && technicianUids[0] === inspectorUser.uid;

    if (technicianUids.includes(inspectorUser.uid) && inspectorUser.role !== 'ADMIN' && inspectorUser.role !== 'MANAGER') {
      throw new Error('QC_SELF_INSPECTION_FORBIDDEN: Người sửa chữa không được tự nghiệm thu KCS cho chính công việc của mình.');
    }

    const now = new Date().toISOString();
    const inspectionId = `QC_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // 3. Save QC Record
    const qcRef = db.collection('qcInspections').doc(inspectionId);
    transaction.set(qcRef, {
      id: inspectionId,
      workOrderId,
      deviceId: woData.deviceId,
      imei: woData.imei,
      inspectorUid: inspectorUser.uid,
      inspectorName: inspectorUser.name || 'Chuyên viên KCS',
      checklistVersion: inspection.checklistVersion || 'QC_STANDARD_12_STEPS_V2',
      checklistResults: inspection.checklistResults || {},
      overallResult: inspection.overallResult,
      failedReason: inspection.failedReason || null,
      photoEvidenceUrls: inspection.photoEvidenceUrls || [],
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

      // Activate all commission records to ELIGIBLE
      for (const lineDoc of allLinesSnap.docs) {
        const commRef = db.collection('commissionLedger').doc(`COMM_${lineDoc.id}`);
        transaction.update(commRef, {
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
    } else {
      // 4B. On FAIL: Increment reworkCount, set status to QC_FAILED_REWORK
      const newReworkCount = (woData.reworkCount || 0) + 1;
      transaction.update(woRef, {
        status: 'QC_FAILED_REWORK',
        qcStatus: 'FAILED',
        reworkCount: newReworkCount,
        lastFailedReason: inspection.failedReason || 'Không đạt tiêu chuẩn KCS',
        updatedAt: FieldValue.serverTimestamp()
      });

      // Reset task lines to REWORK_REQUIRED
      for (const lineDoc of allLinesSnap.docs) {
        transaction.update(lineDoc.ref, {
          status: 'REWORK_REQUIRED',
          reworkReason: inspection.failedReason || 'KCS yêu cầu xử lý lại',
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    return { success: true, result: inspection.overallResult, inspectionId };
  });
}

/**
 * Return repaired device to stock (Main Warehouse Reception)
 */
export async function processReturnToStock(
  db: Firestore,
  workOrderId: string,
  targetWarehouseId: string = 'KHO_TONG',
  warehouseStaff: { uid: string; name?: string; role?: string }
): Promise<{ success: boolean; deviceId: string }> {
  return await db.runTransaction(async (transaction) => {
    const woRef = db.collection('technicalWorkOrders').doc(workOrderId);
    const woSnap = await transaction.get(woRef);
    if (!woSnap.exists) {
      throw new Error(`WORK_ORDER_NOT_FOUND: Không tìm thấy phiếu kỹ thuật "${workOrderId}".`);
    }

    const woData = woSnap.data()!;
    if (woData.status !== 'QC_PASSED') {
      throw new Error(`DEVICE_NOT_QC_PASSED: Máy phải đạt chuẩn KCS (QC_PASSED) trước khi được nhập kho sẵn sàng bán.`);
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
        warehouseId: targetWarehouseId,
        warehouse: targetWarehouseId,
        currentCustodian: warehouseStaff.name || 'Thủ Kho',
        currentCustodianUid: warehouseStaff.uid,
        technicianAssigned: FieldValue.delete(),
        activeWorkOrderId: FieldValue.delete(),
        lastQcPassedAt: now,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    // 3. Record Final Movement back to Stock
    const movId = `MOV_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    transaction.set(db.collection('inventoryMovements').doc(movId), {
      id: movId,
      deviceId: woData.deviceId,
      imei: woData.imei,
      movementType: 'QC_PASS_RETURN_STOCK',
      fromLocationId: woData.currentLocationId || 'KHO_QC',
      toLocationId: targetWarehouseId,
      fromCustodianUid: woData.currentCustodianUid,
      toCustodianUid: warehouseStaff.uid,
      sourceType: 'WORK_ORDER',
      sourceId: workOrderId,
      performedByUid: warehouseStaff.uid,
      confirmedByUid: warehouseStaff.uid,
      occurredAt: now,
      createdAt: FieldValue.serverTimestamp()
    });

    return { success: true, deviceId: woData.deviceId };
  });
}

/**
 * Reserve and Issue Spare Parts atomically
 */
export async function processIssueSparePart(
  db: Firestore,
  workOrderId: string,
  lineId: string,
  partId: string,
  quantity: number,
  technicianUser: { uid: string; name?: string }
): Promise<{ success: boolean; partId: string; remainingStock: number }> {
  if (quantity <= 0) {
    throw new Error('INVALID_QUANTITY: Số lượng linh kiện phải lớn hơn 0.');
  }

  return await db.runTransaction(async (transaction) => {
    const partRef = db.collection('spareParts').doc(partId);
    const partSnap = await transaction.get(partRef);
    if (!partSnap.exists) {
      throw new Error(`SPARE_PART_NOT_FOUND: Không tìm thấy linh kiện ID "${partId}".`);
    }

    const partData = partSnap.data()!;
    const currentStock = typeof partData.stockQuantity === 'number' ? partData.stockQuantity : 0;

    if (currentStock < quantity) {
      throw new Error(`INSUFFICIENT_PARTS_STOCK: Linh kiện "${partData.name}" chỉ còn ${currentStock} cái (yêu cầu ${quantity}).`);
    }

    // Deduct stock atomically
    const newStock = currentStock - quantity;
    transaction.update(partRef, {
      stockQuantity: newStock,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Record Part Reservation / Movement
    const resId = `PART_ISSUE_${Date.now()}_${partId}`;
    transaction.set(db.collection('technicalPartReservations').doc(resId), {
      id: resId,
      workOrderId,
      workOrderLineId: lineId,
      partId,
      partName: partData.name,
      quantity,
      issuedToUid: technicianUser.uid,
      issuedToName: technicianUser.name || 'Kỹ thuật viên',
      status: 'ISSUED',
      issuedAt: new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp()
    });

    return { success: true, partId, remainingStock: newStock };
  });
}
