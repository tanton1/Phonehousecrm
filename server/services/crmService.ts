import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { 
  LeadStatus, 
  LeadCareActivity, 
  EvidenceVerificationStatus, 
  DeviceReservation,
  LeadQuote 
} from '../../src/types';
import { emitCrmEvent, normalizeCustomerId } from './crmEventService';

export interface CareActivityReviewRequest {
  activityId: string;
  status: EvidenceVerificationStatus;
  reviewerUid: string;
  reviewerName: string;
  reviewerRole: string;
  reviewerBranchId: string;
  reviewerAssignedBranches?: string[];
  note?: string;
}

export interface LeadTransitionContext {
  invoiceId?: string;
  depositReference?: string;
  appointmentId?: string;
  quoteId?: string;
  lostReason?: string;
  staffId: string;
  staffName?: string;
  branchId: string;
  notes?: string;
}

export interface DeviceReservationRequest {
  deviceId: string;
  leadId: string;
  quoteId?: string;
  customerId?: string;
  staffId: string;
  branchId: string;
  reservationDurationMinutes?: number; // Defaults to 30 mins
}

/**
 * Validates Lead State Machine Transitions
 */
export function canTransitionLeadState(
  from: LeadStatus,
  to: LeadStatus,
  context?: Partial<LeadTransitionContext>
): { allowed: boolean; reason?: string } {
  if (from === to) {
    return { allowed: true };
  }

  // WON is immutable except for manager correction
  if (from === 'won' && to !== 'won') {
    return { allowed: false, reason: 'Giao dịch đã chốt thành công (WON) không thể quay lại trạng thái trước.' };
  }

  // WON requires invoice reference
  if (to === 'won' && !context?.invoiceId) {
    return { allowed: false, reason: 'Chuyển sang WON yêu cầu phải có mã hóa đơn / đơn hàng POS (invoiceId).' };
  }

  // LOST requires reason
  if (to === 'lost' && !context?.lostReason) {
    return { allowed: false, reason: 'Đánh dấu Lost yêu cầu phải ghi nhận lý do mất khách (lostReason).' };
  }

  // Standard Allowed Transition Graph
  const validTransitions: Record<string, string[]> = {
    new: ['contacted', 'consulting', 'negotiating', 'appointment_scheduled', 'lost'],
    contacted: ['consulting', 'negotiating', 'appointment_scheduled', 'deposit_paid', 'deposit', 'lost'],
    consulting: ['appointment_scheduled', 'deposit_paid', 'deposit', 'won', 'lost'],
    negotiating: ['appointment_scheduled', 'deposit_paid', 'deposit', 'won', 'lost'],
    appointment_scheduled: ['consulting', 'negotiating', 'deposit_paid', 'deposit', 'won', 'lost'],
    deposit_paid: ['won', 'lost'],
    deposit: ['won', 'lost'],
    lost: ['new', 'contacted', 'consulting', 'negotiating'] // Re-open lost lead
  };

  const allowedNext = validTransitions[from] || [];
  if (!allowedNext.includes(to)) {
    return { 
      allowed: false, 
      reason: `Không được phép chuyển trực tiếp từ trạng thái "${from}" sang "${to}".` 
    };
  }

  return { allowed: true };
}

/**
 * Authoritative Server QA Activity Review
 */
export async function processCareActivityReview(
  db: Firestore | null,
  payload: CareActivityReviewRequest
): Promise<LeadCareActivity> {
  const {
    activityId,
    status,
    reviewerUid,
    reviewerName,
    reviewerRole,
    reviewerBranchId,
    reviewerAssignedBranches = [],
    note = ''
  } = payload;

  if (!reviewerUid || !reviewerBranchId) {
    throw new Error('MISSING_STAFF_IDENTITY: Thiếu mã nhân viên hoặc chi nhánh của người kiểm duyệt.');
  }

  // 1. Role Verification: Admin or Manager required
  const isAuthorized = ['ADMIN', 'MANAGER', 'STORE_MANAGER'].includes(String(reviewerRole || '').toUpperCase());
  if (!isAuthorized) {
    throw new Error('PERMISSION_DENIED: Chỉ Quản lý cửa hàng (Manager) hoặc Quản trị viên (Admin) mới có quyền duyệt QA chăm sóc.');
  }

  const nowIso = new Date().toISOString();

  if (!db) {
    // In-memory test mock return
    return {
      id: activityId,
      leadId: 'LEAD-TEST-01',
      sequence: 1,
      attemptNo: 1,
      isMeaningfulContact: true,
      staffId: 'STAFF-01',
      staffName: 'Nhân viên A',
      branchId: reviewerBranchId,
      channel: 'CALL',
      action: 'CALL_CUSTOMER',
      outcome: 'CONNECTED',
      evidenceType: 'CALL_LOG',
      verificationStatus: status,
      qaReview: {
        status,
        reviewedBy: reviewerUid,
        reviewedByName: reviewerName,
        reviewedAt: nowIso,
        note
      },
      auditHistory: [
        {
          previousStatus: 'SELF_REPORTED',
          newStatus: status,
          changedBy: reviewerUid,
          changedByName: reviewerName,
          changedAt: nowIso,
          note
        }
      ],
      createdAt: nowIso
    };
  }

  const actRef = db.collection('leadCareActivities').doc(activityId);
  const updatedActivity = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(actRef);
    if (!snap.exists) {
      throw new Error(`ACTIVITY_NOT_FOUND: Không tìm thấy hoạt động chăm sóc "${activityId}".`);
    }

    const currentData = snap.data()! as LeadCareActivity;

    // 2. Branch Isolation Check: Manager can only review their own branch
    if (reviewerRole !== 'ADMIN') {
      const allowedBranches = [reviewerBranchId, ...reviewerAssignedBranches];
      if (!allowedBranches.includes(currentData.branchId)) {
        throw new Error(`BRANCH_FORBIDDEN: Bạn chỉ có quyền kiểm duyệt hoạt động thuộc chi nhánh phụ trách (${reviewerBranchId}).`);
      }
    }

    const auditHistory = currentData.auditHistory || [];
    const newAuditEntry = {
      previousStatus: currentData.verificationStatus || 'SELF_REPORTED',
      newStatus: status,
      changedBy: reviewerUid,
      changedByName: reviewerName,
      changedAt: nowIso,
      note
    };

    const qaReview = {
      status,
      reviewedBy: reviewerUid,
      reviewedByName: reviewerName,
      reviewedAt: nowIso,
      note
    };

    const updateFields = {
      verificationStatus: status,
      qaReview,
      auditHistory: [...auditHistory, newAuditEntry],
      updatedAt: FieldValue.serverTimestamp()
    };

    transaction.update(actRef, updateFields);

    return {
      ...currentData,
      ...updateFields
    };
  });

  return updatedActivity;
}

/**
 * Authoritative Device Reservation Engine (30-Minute Hold with Auto-Release)
 */
export async function processDeviceReservation(
  db: Firestore | null,
  payload: DeviceReservationRequest
): Promise<DeviceReservation> {
  const {
    deviceId,
    leadId,
    quoteId,
    customerId,
    staffId,
    branchId,
    reservationDurationMinutes = 30
  } = payload;

  if (!deviceId || !leadId || !staffId || !branchId) {
    throw new Error('MISSING_RESERVATION_PARAMS: Thiếu thông tin thiết bị, leadId, staffId hoặc branchId.');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + reservationDurationMinutes * 60000).toISOString();
  const reservationId = `RES_${deviceId}_${Date.now()}`;
  const validCustomerId = normalizeCustomerId(customerId);

  const reservationRecord: DeviceReservation = {
    id: reservationId,
    deviceId,
    imei: '',
    model: '',
    leadId,
    quoteId,
    customerId: validCustomerId,
    staffId,
    branchId,
    reservedAt: now.toISOString(),
    expiresAt,
    status: 'ACTIVE'
  };

  if (!db) {
    reservationRecord.imei = '358901234567890';
    reservationRecord.model = 'iPhone 16 Pro Max 256GB';
    return reservationRecord;
  }

  const deviceRef = db.collection('devices').doc(deviceId);
  const resRef = db.collection('deviceReservations').doc(reservationId);

  await db.runTransaction(async (transaction) => {
    const devSnap = await transaction.get(deviceRef);
    if (!devSnap.exists) {
      throw new Error(`DEVICE_NOT_FOUND: Không tìm thấy thiết bị IMEI "${deviceId}".`);
    }

    const devData = devSnap.data()!;
    reservationRecord.imei = devData.imei || deviceId;
    reservationRecord.model = devData.model || 'Điện thoại';

    // Check device branch isolation
    if (devData.branchId && devData.branchId !== branchId) {
      throw new Error(`DEVICE_BRANCH_FORBIDDEN: Thiết bị ${devData.model} (${devData.imei}) thuộc chi nhánh "${devData.branchId}", không thể giữ cho Lead ở chi nhánh "${branchId}".`);
    }

    // Check if device is available
    if (devData.status === 'sold') {
      throw new Error(`DEVICE_ALREADY_SOLD: Thiết bị ${devData.model} (${devData.imei}) đã được bán.`);
    }

    // Check if already reserved & still active
    if (devData.status === 'reserved' && devData.reservedUntil) {
      const isStillReserved = new Date(devData.reservedUntil).getTime() > Date.now();
      if (isStillReserved && devData.reservedForLeadId !== leadId) {
        throw new Error(`DEVICE_ALREADY_RESERVED: Thiết bị ${devData.model} (${devData.imei}) đang được nhân viên khác giữ cho khách hàng đến ${devData.reservedUntil}.`);
      }
      // If reservation is expired, it will be overwritten and refreshed
    }

    // Atomically reserve device
    transaction.update(deviceRef, {
      status: 'reserved',
      reservedForLeadId: leadId,
      reservedUntil: expiresAt,
      reservedByStaffId: staffId,
      updatedAt: FieldValue.serverTimestamp()
    });

    transaction.set(resRef, {
      ...reservationRecord,
      createdAt: FieldValue.serverTimestamp()
    });
  });

  return reservationRecord;
}

/**
 * Authoritative Device Reservation Release
 */
export async function processReleaseDeviceReservation(
  db: Firestore | null,
  deviceId: string,
  quoteId?: string
): Promise<void> {
  if (!db) return;

  const deviceRef = db.collection('devices').doc(deviceId);
  await db.runTransaction(async (transaction) => {
    const devSnap = await transaction.get(deviceRef);
    if (devSnap.exists) {
      const devData = devSnap.data()!;
      if (devData.status === 'reserved') {
        transaction.update(deviceRef, {
          status: 'in_stock',
          reservedForLeadId: FieldValue.delete(),
          reservedUntil: FieldValue.delete(),
          reservedByStaffId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }
  });
}

/**
 * Authoritative Idempotent Quote to POS Conversion
 */
export async function processConvertQuoteToPOS(
  db: Firestore | null,
  quoteId: string,
  invoiceId: string
): Promise<{ alreadyConverted?: boolean; invoiceId: string }> {
  if (!db) {
    return { invoiceId };
  }

  const quoteRef = db.collection('leadQuotes').doc(quoteId);
    const invRef = db.collection('invoices').doc(invoiceId);

  return await db.runTransaction(async (transaction) => {
    const qSnap = await transaction.get(quoteRef);
    if (!qSnap.exists) {
      throw new Error(`QUOTE_NOT_FOUND: Báo giá "${quoteId}" không tồn tại.`);
    }

    const qData = qSnap.data()! as LeadQuote;
    
    // Idempotency check
    if (qData.status === 'CONVERTED_POS') {
      if (qData.convertedInvoiceId === invoiceId) {
        return { alreadyConverted: true, invoiceId };
      }
      throw new Error(`QUOTE_ALREADY_CONVERTED: Báo giá "${quoteId}" đã được chuyển sang hóa đơn ${qData.convertedInvoiceId} trước đó.`);
    }

    // Verify invoice exists & is completed
    const invSnap = await transaction.get(invRef);
    if (!invSnap.exists) {
      throw new Error(`INVOICE_NOT_FOUND: Không tìm thấy hóa đơn POS "${invoiceId}". Vui lòng tạo đơn thanh toán trước.`);
    }
      const invData = invSnap.data()!;
      if (invData.status !== 'completed') {
      throw new Error(`INVOICE_NOT_COMPLETED: Hóa đơn "${invoiceId}" chưa hoàn tất thanh toán.`);
      }

      const sourceRequestId = String((qData as any).sourceRequestId || '');
      const sourceRequestRef = sourceRequestId ? db.collection('customerQuoteRequests').doc(sourceRequestId) : null;
      const sourceRequestSnap = sourceRequestRef ? await transaction.get(sourceRequestRef) : null;

      transaction.update(quoteRef, {
      status: 'CONVERTED_POS',
      convertedInvoiceId: invoiceId,
      updatedAt: FieldValue.serverTimestamp()
      });
      if (sourceRequestRef && sourceRequestSnap?.exists) {
        transaction.update(sourceRequestRef, {
          status: 'CONVERTED',
          convertedInvoiceId: invoiceId,
          convertedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        transaction.set(db.collection('customerQuoteAnalytics').doc(`CONVERSION_${sourceRequestId}`), {
          event: 'CONVERTED_POS',
          requestId: sourceRequestId,
          requestCode: String(sourceRequestSnap.data()?.requestCode || ''),
          quoteId,
          invoiceId,
          quoteType: String((qData as any).quoteType || sourceRequestSnap.data()?.quoteType || ''),
          branchId: String((qData as any).branchId || sourceRequestSnap.data()?.branchId || ''),
          createdAt: FieldValue.serverTimestamp()
        }, { merge: false });
      }

    return { alreadyConverted: false, invoiceId };
  });
}
