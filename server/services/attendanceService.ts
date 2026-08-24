import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { verifyGeofence, LatLng } from './geofenceService';
import { verifyFaceBiometric } from './biometricService';

export function resolveAttendanceRadius(branch: { attendanceRadius?: unknown; allowedGpsRadiusMeters?: unknown } | null | undefined): number {
  const canonical = Number(branch?.attendanceRadius);
  if (Number.isFinite(canonical) && canonical > 0) return canonical;
  const legacy = Number(branch?.allowedGpsRadiusMeters);
  if (Number.isFinite(legacy) && legacy > 0) return legacy;
  return 50;
}

export interface CheckInEvidenceRequest {
  staffId: string;
  staffName?: string;
  role?: string;
  branchId: string;
  branchName?: string;
  userCoords?: LatLng;
  faceCaptureBase64?: string;
  faceEmbedding?: number[];
  faceSessionId?: string;
  qrScanned?: boolean;
  clientIp?: string;
  testShiftMock?: ShiftDefinition; // Optional mock for isolated unit testing
}

export interface CheckOutRequest {
  staffId: string;
  branchId: string;
}

export interface AttendanceReviewRequest {
  attendanceId: string;
  decision: 'APPROVE' | 'REJECT';
  reviewerUid: string;
  reviewerName: string;
  reviewerRole: string;
  reviewerBranchId: string;
  reviewerAssignedBranches?: string[];
  reason?: string;
}

export interface ShiftDefinition {
  shiftId: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  isOff?: boolean;
}

export const STANDARD_SHIFTS: Record<string, ShiftDefinition> = {
  SHIFT_MORNING: {
    shiftId: 'SHIFT_MORNING',
    shiftName: 'Ca sáng',
    startTime: '08:00',
    endTime: '17:00',
    breakMinutes: 60
  },
  SHIFT_AFTERNOON: {
    shiftId: 'SHIFT_AFTERNOON',
    shiftName: 'Ca chiều',
    startTime: '14:00',
    endTime: '22:00',
    breakMinutes: 45
  },
  SHIFT_EVENING: {
    shiftId: 'SHIFT_EVENING',
    shiftName: 'Ca tối',
    startTime: '17:30',
    endTime: '22:30',
    breakMinutes: 30
  },
  OFF: {
    shiftId: 'OFF',
    shiftName: 'Nghỉ',
    startTime: '',
    endTime: '',
    breakMinutes: 0,
    isOff: true
  }
};

export interface AttendanceRecordResult {
  id: string;
  staffId: string;
  staffName: string;
  role?: string;
  branchId: string;
  branchName?: string;
  date: string;
  checkInTime: string;
  checkOutTime?: string;
  status: 'ON_TIME' | 'LATE' | 'PENDING_VERIFICATION' | 'REJECTED' | 'COMPLETED';
  attendanceStatus?: 'CHECKED_IN' | 'COMPLETED' | 'ABSENT' | 'ON_LEAVE';
  punctualityStatus?: 'ON_TIME' | 'LATE' | 'EARLY';
  verificationStatus?: 'VERIFIED' | 'PENDING_REVIEW' | 'REJECTED';
  shiftId?: string;
  shiftName?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  scheduledBreakMinutes?: number;
  graceMinutes?: number;
  lateMinutes?: number;
  earlyMinutes?: number;
  otMinutes?: number;
  workDurationMinutes: number;
  breakDurationMinutes?: number;
  netWorkMinutes?: number;
  verification: {
    gpsVerified: boolean;
    distanceMeters: number;
    faceVerified: boolean;
    faceScore?: number;
    networkVerified: boolean;
    qrScanned: boolean;
    serverTimeIso: string;
  };
  reviewData?: {
    reviewedByUid: string;
    reviewedByName: string;
    reviewedAt: string;
    decision: 'APPROVE' | 'REJECT';
    reason?: string;
  };
}

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

/**
 * Calculates time difference in minutes with cross-midnight support (e.g. 22:00 -> 06:00 = 480 mins)
 */
export function diffMinutes(startMinutes: number, endMinutes: number): number {
  if (endMinutes >= startMinutes) {
    return endMinutes - startMinutes;
  }
  return (1440 - startMinutes) + endMinutes;
}

/**
 * Normalizes minutes relative to shift start timestamp
 */
export function normalizeRelativeMinutes(timeStr: string, shiftStartStr: string): number {
  const tMins = parseTimeToMinutes(timeStr);
  const sMins = parseTimeToMinutes(shiftStartStr);
  if (tMins >= sMins) {
    return tMins - sMins;
  }
  return (1440 - sMins) + tMins;
}

/**
 * Calculates Monday week start date (YYYY-MM-DD) for Vietnam timezone
 */
export function getVietnamWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = date.getUTCDay(); // 0 is Sun, 1 is Mon
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date.getTime() + diffToMonday * 86400000);
  return monday.toISOString().split('T')[0];
}

/**
 * Authoritative Fail-Closed Shift Matching Engine
 */
export async function resolveShiftAssignment(
  db: Firestore | null,
  params: {
    staffId: string;
    branchId: string;
    workDate: string;
    testShiftMock?: ShiftDefinition;
  }
): Promise<ShiftDefinition> {
  const { staffId, branchId, workDate, testShiftMock } = params;

  if (testShiftMock) {
    if (testShiftMock.isOff || testShiftMock.shiftId === 'OFF' || testShiftMock.shiftName === 'Nghỉ') {
      throw new Error(`OFF_DAY: Hôm nay (${workDate}) là ngày nghỉ của bạn theo lịch phân ca.`);
    }
    return testShiftMock;
  }

  if (!db) {
    // In-memory test default
    return STANDARD_SHIFTS.SHIFT_MORNING;
  }

  const weekStart = getVietnamWeekStart(workDate);
  const canonicalDocId = `SCHED_${branchId}_${weekStart}_${staffId}`;
  
  let daySchedule: any = null;

  // 1. Try direct O(1) document ID
  const docSnap = await db.collection('weeklyShiftSchedules').doc(canonicalDocId).get();
  if (docSnap.exists) {
    const data = docSnap.data();
    // A draft is visible to managers for editing but must never authorize check-in.
    // Legacy schedules without a status remain valid for backward compatibility.
    if (data?.status !== 'DRAFT' && data?.days && data.days[workDate]) {
      daySchedule = data.days[workDate];
    }
  }

  // 2. If not found by Doc ID, query by staffId + branchId + weekStart
  if (!daySchedule) {
    const qSnap = await db.collection('weeklyShiftSchedules')
      .where('staffId', '==', staffId)
      .where('branchId', '==', branchId)
      .where('weekStart', '==', weekStart)
      .limit(1)
      .get();

    if (!qSnap.empty) {
      const published = qSnap.docs.find((doc: any) => doc.data()?.status !== 'DRAFT' && doc.data()?.days?.[workDate]);
      const data = published?.data();
      if (data?.days && data.days[workDate]) daySchedule = data.days[workDate];
    }
  }

  // 3. Fail-closed: No schedule assignment found
  if (!daySchedule) {
    throw new Error(`SHIFT_NOT_ASSIGNED: Bạn chưa được xếp ca làm việc hôm nay (${workDate}). Vui lòng liên hệ Quản lý cửa hàng để được xếp ca.`);
  }

  // 4. Fail-closed: Day off
  const sName = (daySchedule.shiftName || '').trim();
  const sId = (daySchedule.shiftId || '').trim();
  if (sName === 'Nghỉ' || sId === 'OFF' || daySchedule.isOff) {
    throw new Error(`OFF_DAY: Hôm nay (${workDate}) là ngày nghỉ của bạn theo lịch phân ca.`);
  }

  // 5. Match standard shift or custom shift bounds
  const matchedStandard = STANDARD_SHIFTS[sId] || (
    sName === 'Ca sáng' ? STANDARD_SHIFTS.SHIFT_MORNING : 
    sName === 'Ca chiều' ? STANDARD_SHIFTS.SHIFT_AFTERNOON : 
    sName === 'Ca tối' ? STANDARD_SHIFTS.SHIFT_EVENING : null
  );

  return {
    shiftId: sId || matchedStandard?.shiftId || 'SHIFT_CUSTOM',
    shiftName: sName || matchedStandard?.shiftName || 'Ca làm việc',
    startTime: daySchedule.startTime || matchedStandard?.startTime || '08:00',
    endTime: daySchedule.endTime || matchedStandard?.endTime || '17:00',
    breakMinutes: typeof daySchedule.breakMinutes === 'number' ? daySchedule.breakMinutes : (matchedStandard?.breakMinutes || 60),
    isOff: false
  };
}

export async function processServerCheckIn(
  db: Firestore | null,
  payload: CheckInEvidenceRequest
): Promise<AttendanceRecordResult> {
  const {
    staffId,
    staffName = 'Nhân viên',
    role = 'STAFF',
    branchId,
    branchName = 'Chi nhánh PhoneHouse',
    userCoords,
    faceCaptureBase64,
    faceEmbedding,
    faceSessionId,
    qrScanned = false,
    clientIp = '127.0.0.1',
    testShiftMock
  } = payload;

  if (!staffId) {
    throw new Error('Thiếu mã nhân viên (staffId).');
  }

  if (!branchId) {
    throw new Error('Thiếu mã chi nhánh làm việc (branchId).');
  }

  // 1. Authoritative Store Geofence Lookup from DB with Fail-Closed Safety
  let authoritativeStoreCoords: LatLng;
  let authoritativeRadius = 50; // meters - default geofence for a configured branch
  let isNetworkAllowed = clientIp === '127.0.0.1' || clientIp === '::1';

  if (!db) {
    // In memory / mock test mode
    authoritativeStoreCoords = { latitude: 16.0678, longitude: 108.2208 };
    isNetworkAllowed = true;
  } else {
    // 1A. Geofence & Network Authority
    const branchDoc = await db.collection('branches').doc(branchId).get();
    if (!branchDoc.exists) {
      throw new Error(`BRANCH_NOT_FOUND: Chi nhánh "${branchId}" không tồn tại trên hệ thống.`);
    }
    const bData = branchDoc.data()!;

    if (typeof bData.gpsLatitude !== 'number' || typeof bData.gpsLongitude !== 'number') {
      throw new Error(`BRANCH_GPS_NOT_CONFIGURED: Chi nhánh "${bData.name || branchId}" chưa được cấu hình tọa độ GPS chuẩn.`);
    }

    authoritativeStoreCoords = { latitude: bData.gpsLatitude, longitude: bData.gpsLongitude };
    authoritativeRadius = resolveAttendanceRadius(bData);

    let allowedIps: string[] = [];
    if (Array.isArray(bData.allowedPublicIps)) {
      allowedIps = bData.allowedPublicIps;
    } else if (typeof bData.storePublicIp === 'string') {
      allowedIps = bData.storePublicIp.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    if (allowedIps.includes(clientIp)) {
      isNetworkAllowed = true;
    }
  }

  // 1B. Biometric Face Verification V2 (Single Source of Truth: staffFaceProfiles)
  const faceCheck = await verifyFaceBiometric(db, {
    staffUid: staffId,
    liveEmbedding: faceEmbedding,
    liveCaptureBase64: faceCaptureBase64
  });
  const isFaceVerified = faceCheck.verified;

  // 2. Authoritative Geofencing Calculation
  const geoCheck = verifyGeofence(userCoords, authoritativeStoreCoords, authoritativeRadius);
  if (!geoCheck.isInside) {
    throw new Error(geoCheck.error || 'Vị trí GPS không nằm trong bán kính cho phép của cửa hàng.');
  }

  // 3. Authoritative Server Timestamp (Vietnam Timezone)
  const now = new Date();
  const dateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD
  const timeStr = now.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'
  });
  const serverTimeIso = now.toISOString();

  // 4. Shift Assignment Matching Engine (Fail-Closed)
  const shiftAssignment = await resolveShiftAssignment(db, {
    staffId,
    branchId,
    workDate: dateStr,
    testShiftMock
  });

  const {
    shiftId,
    shiftName,
    startTime: scheduledStart,
    endTime: scheduledEnd,
    breakMinutes: scheduledBreakMinutes
  } = shiftAssignment;

  const graceMinutes = 5; // 5 phút linh hoạt

  // 5. Calculate Late Minutes based on Scheduled Shift Start + Tolerance Grace
  const shiftStartMinutes = parseTimeToMinutes(scheduledStart);
  const checkInMinutes = parseTimeToMinutes(timeStr);
  const lateMinutes = Math.max(0, checkInMinutes - (shiftStartMinutes + graceMinutes));

  let status: 'ON_TIME' | 'LATE' | 'PENDING_VERIFICATION' = 'ON_TIME';
  let punctualityStatus: 'ON_TIME' | 'LATE' | 'EARLY' = 'ON_TIME';
  let verificationStatus: 'VERIFIED' | 'PENDING_REVIEW' | 'REJECTED' = 'VERIFIED';

  if (!isFaceVerified || !isNetworkAllowed) {
    status = 'PENDING_VERIFICATION';
    verificationStatus = 'PENDING_REVIEW';
  } else if (lateMinutes > 0) {
    status = 'LATE';
    punctualityStatus = 'LATE';
  } else {
    status = 'ON_TIME';
    punctualityStatus = 'ON_TIME';
  }

  const recordId = `ATT_${staffId}_${dateStr.replace(/-/g, '')}`;
  const newRecord: AttendanceRecordResult = {
    id: recordId,
    staffId,
    staffName,
    role,
    branchId,
    branchName,
    date: dateStr,
    checkInTime: timeStr,
    status,
    attendanceStatus: 'CHECKED_IN',
    punctualityStatus,
    verificationStatus,
    shiftId,
    shiftName,
    scheduledStart,
    scheduledEnd,
    scheduledBreakMinutes,
    graceMinutes,
    lateMinutes,
    workDurationMinutes: 0,
    breakDurationMinutes: scheduledBreakMinutes,
    netWorkMinutes: 0,
    earlyMinutes: 0,
    otMinutes: 0,
    verification: {
      gpsVerified: true,
      distanceMeters: geoCheck.distanceMeters,
      faceVerified: isFaceVerified,
      faceScore: faceCheck.score,
      networkVerified: isNetworkAllowed,
      qrScanned,
      serverTimeIso
    }
  };

  // 6. Persistence with Duplicate Locking
  if (db) {
    const attRef = db.collection('attendance').doc(recordId);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(attRef);
      if (snap.exists) {
        const existingData = snap.data()!;
        if (existingData.checkInTime) {
          throw new Error(`ALREADY_CHECKED_IN: Bạn đã điểm danh hôm nay lúc ${existingData.checkInTime}.`);
        }
      }
      transaction.set(attRef, {
        ...newRecord,
        createdAt: FieldValue.serverTimestamp()
      });
    });
  }

  return newRecord;
}

export async function processServerCheckOut(
  db: Firestore | null,
  payload: CheckOutRequest
): Promise<AttendanceRecordResult> {
  const { staffId } = payload;
  const now = new Date();
  const dateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  const timeStr = now.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'
  });

  const recordId = `ATT_${staffId}_${dateStr.replace(/-/g, '')}`;
  let completedRecord: AttendanceRecordResult;

  if (!db) {
    // In-memory test mode
    completedRecord = {
      id: recordId,
      staffId,
      staffName: 'Nhân viên',
      branchId: payload.branchId || 'CN01',
      date: dateStr,
      checkInTime: '08:00:00',
      checkOutTime: timeStr,
      status: 'COMPLETED',
      attendanceStatus: 'COMPLETED',
      punctualityStatus: 'ON_TIME',
      verificationStatus: 'VERIFIED',
      workDurationMinutes: 523,
      breakDurationMinutes: 60,
      netWorkMinutes: 463,
      earlyMinutes: 0,
      otMinutes: 0,
      verification: {
        gpsVerified: true,
        distanceMeters: 10,
        faceVerified: true,
        networkVerified: true,
        qrScanned: false,
        serverTimeIso: now.toISOString()
      }
    };
    return completedRecord;
  }

  // 1. Find active check-in document for this staffId (handles overnight and regular shifts)
  let targetAttRef = db.collection('attendance').doc(recordId);
  try {
    const openQuery = await db.collection('attendance')
      .where('staffId', '==', staffId)
      .where('attendanceStatus', '==', 'CHECKED_IN')
      .limit(1)
      .get();

    if (!openQuery.empty) {
      targetAttRef = openQuery.docs[0].ref;
    }
  } catch (queryErr) {
    console.warn('[Checkout] Fallback to direct record ID:', queryErr);
  }

  completedRecord = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(targetAttRef);
    if (!snap.exists) {
      throw new Error('NOT_CHECKED_IN: Không tìm thấy lượt điểm danh vào ca đang mở để kết thúc ca.');
    }
    const data = snap.data()!;
    if (data.checkOutTime) {
      throw new Error(`ALREADY_CHECKED_OUT: Bạn đã kết thúc ca làm việc lúc ${data.checkOutTime}.`);
    }

    const inMinutes = parseTimeToMinutes(data.checkInTime || '08:00:00');
    const outMinutes = parseTimeToMinutes(timeStr);
    const workDurationMinutes = diffMinutes(inMinutes, outMinutes);

    const scheduledStart = data.scheduledStart || '08:00';
    const scheduledEnd = data.scheduledEnd || '17:00';
    
    // Relative Timeline Calculations (Robust against overnight shifts)
    const scheduledShiftDuration = diffMinutes(parseTimeToMinutes(scheduledStart), parseTimeToMinutes(scheduledEnd));
    const relativeCheckout = normalizeRelativeMinutes(timeStr, scheduledStart);

    let earlyMinutes = 0;
    let otMinutes = 0;
    if (relativeCheckout < scheduledShiftDuration) {
      earlyMinutes = scheduledShiftDuration - relativeCheckout;
    } else {
      otMinutes = relativeCheckout - scheduledShiftDuration;
    }

    const scheduledBreak = data.scheduledBreakMinutes || data.breakDurationMinutes || 0;
    const netWorkMinutes = Math.max(0, workDurationMinutes - scheduledBreak);

    const updateFields = {
      checkOutTime: timeStr,
      status: 'COMPLETED',
      attendanceStatus: 'COMPLETED',
      punctualityStatus: earlyMinutes > 15 ? 'EARLY' : data.lateMinutes > 0 ? 'LATE' : 'ON_TIME',
      workDurationMinutes,
      netWorkMinutes,
      earlyMinutes,
      otMinutes,
      updatedAt: FieldValue.serverTimestamp()
    };

    transaction.update(targetAttRef, updateFields);

    return {
      ...data,
      id: recordId,
      ...updateFields
    } as unknown as AttendanceRecordResult;
  });

  return completedRecord;
}

/**
 * Authoritative Attendance Review Process (For PENDING_REVIEW records)
 */
export async function processAttendanceReview(
  db: Firestore | null,
  payload: AttendanceReviewRequest
): Promise<AttendanceRecordResult> {
  const {
    attendanceId,
    decision,
    reviewerUid,
    reviewerName,
    reviewerRole,
    reviewerBranchId,
    reviewerAssignedBranches = [],
    reason = ''
  } = payload;

  if (!reviewerUid || !reviewerBranchId) {
    throw new Error('MISSING_STAFF_IDENTITY: Thiếu mã hoặc chi nhánh người kiểm duyệt.');
  }

  const isAuthorized = reviewerRole === 'ADMIN' || reviewerRole === 'MANAGER';
  if (!isAuthorized) {
    throw new Error('PERMISSION_DENIED: Chỉ Quản lý cửa hàng (Manager) hoặc Quản trị viên (Admin) mới có quyền duyệt chấm công.');
  }

  const nowIso = new Date().toISOString();

  if (!db) {
    return {
      id: attendanceId,
      staffId: 'STAFF-01',
      staffName: 'Nhân viên A',
      branchId: reviewerBranchId,
      date: '2026-08-20',
      checkInTime: '08:00:00',
      status: decision === 'APPROVE' ? 'ON_TIME' : 'REJECTED',
      attendanceStatus: 'CHECKED_IN',
      punctualityStatus: 'ON_TIME',
      verificationStatus: decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED',
      workDurationMinutes: 0,
      netWorkMinutes: 0,
      verification: {
        gpsVerified: true,
        distanceMeters: 10,
        faceVerified: decision === 'APPROVE',
        networkVerified: decision === 'APPROVE',
        qrScanned: false,
        serverTimeIso: nowIso
      },
      reviewData: {
        reviewedByUid: reviewerUid,
        reviewedByName: reviewerName,
        reviewedAt: nowIso,
        decision,
        reason
      }
    };
  }

  const attRef = db.collection('attendance').doc(attendanceId);
  const auditRef = db.collection('attendanceAuditLogs').doc(`AUDIT_${attendanceId}_${Date.now()}`);

  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(attRef);
    if (!snap.exists) {
      throw new Error(`ATTENDANCE_NOT_FOUND: Không tìm thấy bản ghi chấm công "${attendanceId}".`);
    }

    const data = snap.data()! as AttendanceRecordResult;

    // Branch Isolation check
    if (reviewerRole !== 'ADMIN') {
      const allowedBranches = [reviewerBranchId, ...reviewerAssignedBranches];
      if (!allowedBranches.includes(data.branchId)) {
        throw new Error(`BRANCH_FORBIDDEN: Bạn chỉ có quyền duyệt chấm công thuộc chi nhánh phụ trách (${reviewerBranchId}).`);
      }
    }

    const newVerificationStatus: 'VERIFIED' | 'REJECTED' = decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
    const newStatus: 'ON_TIME' | 'LATE' | 'REJECTED' = decision === 'APPROVE' ? (data.lateMinutes && data.lateMinutes > 0 ? 'LATE' : 'ON_TIME') : 'REJECTED';

    const reviewData = {
      reviewedByUid: reviewerUid,
      reviewedByName: reviewerName,
      reviewedAt: nowIso,
      decision,
      reason
    };

    const updateFields = {
      verificationStatus: newVerificationStatus,
      status: newStatus,
      reviewData,
      updatedAt: FieldValue.serverTimestamp()
    };

    transaction.update(attRef, updateFields);

    transaction.set(auditRef, {
      id: auditRef.id,
      attendanceId,
      staffId: data.staffId,
      branchId: data.branchId,
      action: decision === 'APPROVE' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED',
      performedByUid: reviewerUid,
      performedByName: reviewerName,
      previousStatus: data.verificationStatus || 'PENDING_REVIEW',
      newStatus: newVerificationStatus,
      reason,
      timestamp: nowIso
    });

    return {
      ...data,
      ...updateFields
    } as unknown as AttendanceRecordResult;
  });
}
