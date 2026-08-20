import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { 
  LeadStatus, 
  LeadCareActivity, 
  EvidenceVerificationStatus, 
  CustomerActivity, 
  DeviceReservation,
  LeadQuote 
} from '../../src/types';

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

  // 1. Role Verification: Admin or Manager required
  const isAuthorized = reviewerRole === 'ADMIN' || reviewerRole === 'MANAGER';
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
 * Authoritative Device Reservation Engine (30-Minute Hold)
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

  const now = new Date();
  const expiresAt = new Date(now.getTime() + reservationDurationMinutes * 60000).toISOString();
  const reservationId = `RES_${deviceId}_${Date.now()}`;

  const reservationRecord: DeviceReservation = {
    id: reservationId,
    deviceId,
    imei: '',
    model: '',
    leadId,
    quoteId,
    customerId,
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

    // Check if device is available
    if (devData.status === 'sold') {
      throw new Error(`DEVICE_ALREADY_SOLD: Thiết bị ${devData.model} (${devData.imei}) đã được bán.`);
    }

    if (devData.status === 'reserved' && devData.reservedUntil) {
      const isStillReserved = new Date(devData.reservedUntil).getTime() > Date.now();
      if (isStillReserved && devData.reservedForLeadId !== leadId) {
        throw new Error(`DEVICE_ALREADY_RESERVED: Thiết bị ${devData.model} (${devData.imei}) đang được nhân viên khác giữ cho khách hàng đến ${devData.reservedUntil}.`);
      }
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
 * Authoritative Quote to POS Conversion
 */
export async function processConvertQuoteToPOS(
  db: Firestore | null,
  quoteId: string,
  invoiceId: string
): Promise<void> {
  if (!db) return;

  const quoteRef = db.collection('leadQuotes').doc(quoteId);
  await db.runTransaction(async (transaction) => {
    const qSnap = await transaction.get(quoteRef);
    if (!qSnap.exists) {
      throw new Error(`QUOTE_NOT_FOUND: Báo giá "${quoteId}" không tồn tại.`);
    }

    const qData = qSnap.data()! as LeadQuote;
    if (qData.status === 'CONVERTED_POS') {
      throw new Error(`QUOTE_ALREADY_CONVERTED: Báo giá "${quoteId}" đã được chuyển sang đơn hàng POS trước đó.`);
    }

    transaction.update(quoteRef, {
      status: 'CONVERTED_POS',
      convertedInvoiceId: invoiceId,
      updatedAt: FieldValue.serverTimestamp()
    });

    // If a reserved device was attached, update device status to sold
    if (qData.reservedDeviceId) {
      const devRef = db.collection('devices').doc(qData.reservedDeviceId);
      transaction.update(devRef, {
        status: 'sold',
        soldDate: new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
  });
}
