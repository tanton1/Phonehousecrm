import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { verifyGeofence, LatLng } from './geofenceService';
import { assertAttendanceVerificationSession } from './attendanceVerificationService';
import { getWeekDates, resolveDepartment } from './shiftSchedulingService';
import { hasPermission, normalizeRole } from '../../shared/permissions';
import { attendanceWorkdayFields } from '../../shared/attendancePolicy';
import {
  attendanceTelegramOutboxId,
  createAttendanceTelegramOutboxRecord,
  telegramAlertsEnabled
} from './telegramService';

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
  verificationNonce?: string;
  deviceId?: string;
  photoEvidenceId?: string;
  qrScanned?: boolean;
  clientIp?: string;
  testShiftMock?: ShiftDefinition; // Optional mock for isolated unit testing
}

export interface CheckOutRequest {
  staffId: string;
  branchId: string;
  userCoords?: LatLng;
  faceSessionId?: string;
  verificationNonce?: string;
  deviceId?: string;
  clientIp?: string;
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
  scheduledNetMinutes?: number;
  requiredFullDayMinutes?: number;
  requiredHalfDayMinutes?: number;
  creditedWorkDay?: 0 | 0.5 | 1;
  workdayStatus?: 'FULL_DAY' | 'HALF_DAY' | 'INSUFFICIENT' | 'MISSING_CHECKOUT' | 'PENDING_REVIEW' | 'REJECTED' | 'SCHEDULE_MISSING';
  workdayPolicyVersion?: string;
  verification: {
    gpsVerified: boolean;
    distanceMeters: number;
    faceVerified: boolean;
    faceScore?: number;
    networkVerified: boolean;
    qrScanned: boolean;
    photoCaptured?: boolean;
    photoEvidenceId?: string;
    photoCapturedAt?: string;
    serverTimeIso: string;
  };
  checkOutVerification?: {
    gpsVerified: boolean;
    distanceMeters: number;
    userCoords: LatLng;
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

  // 3. Department FIXED policy is an authoritative recurring assignment.
  // A published day-level schedule above remains the highest-priority override.
  if (!daySchedule) {
    const userSnap = await db.collection('users').doc(staffId).get();
    if (userSnap.exists && userSnap.data()?.active !== false) {
      const department = resolveDepartment(userSnap.data() || {});
      const policyId = `POLICY_${branchId}_${department.departmentId.replace(/[^A-Z0-9_-]/g, '_')}`;
      const policySnap = await db.collection('shiftDepartmentPolicies').doc(policyId).get();
      const policy = policySnap.exists ? policySnap.data() : null;
      if (policy?.active !== false && policy?.mode === 'FIXED' && policy?.defaultShiftId) {
        const weekDayIndex = getWeekDates(weekStart).indexOf(workDate); // 0 = Monday ... 6 = Sunday
        const workDayIndexes = Array.isArray(policy.workDayIndexes) ? policy.workDayIndexes.map(Number) : [];
        if (!workDayIndexes.includes(weekDayIndex)) {
          throw new Error(`OFF_DAY: Hôm nay (${workDate}) là ngày nghỉ theo ca cố định của bộ phận ${policy.departmentName || department.departmentName}.`);
        }
        const definitionSnap = await db.collection('shiftDefinitions').doc(String(policy.defaultShiftId)).get();
        if (!definitionSnap.exists || definitionSnap.data()?.active === false) {
          throw new Error('SHIFT_DEFINITION_NOT_FOUND: Ca cố định của bộ phận không còn hoạt động.');
        }
        const definition = definitionSnap.data() || {};
        if (definition.branchId && definition.branchId !== 'ALL' && definition.branchId !== branchId) {
          throw new Error('SHIFT_DEFINITION_BRANCH_MISMATCH: Ca cố định không thuộc chi nhánh chấm công.');
        }
        daySchedule = {
          shiftId: policy.defaultShiftId,
          shiftName: definition.name || 'Ca cố định',
          startTime: definition.startTime,
          endTime: definition.endTime,
          breakMinutes: Number(definition.breakDurationMinutes ?? definition.breakMinutes ?? 0),
          status: 'FIXED_POLICY',
          isOff: false
        };
      }
    }
  }

  // 4. Fail-closed: no weekly assignment or recurring fixed policy found.
  if (!daySchedule) {
    throw new Error(`SHIFT_NOT_ASSIGNED: Bạn chưa được xếp ca làm việc hôm nay (${workDate}). Vui lòng liên hệ Quản lý cửa hàng để được xếp ca.`);
  }

  // 5. Fail-closed: Day off
  const sName = (daySchedule.shiftName || '').trim();
  const sId = (daySchedule.shiftId || '').trim();
  if (sName === 'Nghỉ' || sId === 'OFF' || daySchedule.isOff) {
    throw new Error(`OFF_DAY: Hôm nay (${workDate}) là ngày nghỉ của bạn theo lịch phân ca.`);
  }

  // 6. Match standard shift or custom shift bounds
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
    faceSessionId,
    verificationNonce,
    deviceId,
    photoEvidenceId,
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
  let authoritativeBranchName = branchName;

  if (!db) {
    // In memory / mock test mode
    authoritativeStoreCoords = { latitude: 16.0678, longitude: 108.2208 };
  } else {
    // 1A. Geofence & Network Authority
    const branchDoc = await db.collection('branches').doc(branchId).get();
    if (!branchDoc.exists) {
      throw new Error(`BRANCH_NOT_FOUND: Chi nhánh "${branchId}" không tồn tại trên hệ thống.`);
    }
    const bData = branchDoc.data()!;

    if (bData.isActive === false || bData.active === false) {
      throw new Error(`BRANCH_NOT_ACTIVE: Chi nhánh "${bData.name || branchId}" đã ngừng hoạt động.`);
    }

    if (typeof bData.gpsLatitude !== 'number' || typeof bData.gpsLongitude !== 'number') {
      throw new Error(`BRANCH_GPS_NOT_CONFIGURED: Chi nhánh "${bData.name || branchId}" chưa được cấu hình tọa độ GPS chuẩn.`);
    }

    authoritativeStoreCoords = { latitude: bData.gpsLatitude, longitude: bData.gpsLongitude };
    authoritativeRadius = resolveAttendanceRadius(bData);
    authoritativeBranchName = String(bData.name || bData.branchName || branchName);

  }

  // Face capture is supplementary evidence only. Browser-provided embeddings
  // never authorize attendance and are deliberately ignored.
  const isFaceVerified = false;

  // 2. Authoritative Geofencing Calculation
  const geoCheck = verifyGeofence(userCoords, authoritativeStoreCoords, authoritativeRadius);

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

  if (!geoCheck.isInside) {
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
  const checkInViolations: Array<'LATE' | 'OUTSIDE_GEOFENCE'> = [];
  if (lateMinutes > 0) checkInViolations.push('LATE');
  if (!geoCheck.isInside) checkInViolations.push('OUTSIDE_GEOFENCE');
  const newRecord: AttendanceRecordResult = {
    id: recordId,
    staffId,
    staffName,
    role,
    branchId,
    branchName: authoritativeBranchName,
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
      gpsVerified: geoCheck.isInside,
      distanceMeters: geoCheck.distanceMeters,
      faceVerified: isFaceVerified,
      networkVerified: false,
      qrScanned,
      photoCaptured: Boolean(photoEvidenceId),
      ...(userCoords ? { userCoords } : {}),
      ...(photoEvidenceId ? { photoEvidenceId, photoCapturedAt: serverTimeIso } : {}),
      serverTimeIso
    }
  };

  // 6. Persistence with Duplicate Locking
  if (db) {
    const attRef = db.collection('attendance').doc(recordId);
    if (!photoEvidenceId) throw new Error('CHECKIN_PHOTO_REQUIRED: Cần chụp ảnh tại thời điểm chấm công.');
    if (!faceSessionId || !verificationNonce || !deviceId) throw new Error('VERIFICATION_SESSION_REQUIRED');
    const sessionRef = db.collection('attendanceVerificationSessions').doc(faceSessionId);
    const photoRef = db.collection('evidenceRecords').doc(photoEvidenceId);
    await db.runTransaction(async (transaction) => {
      const [sessionSnap, snap, photoSnap] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(attRef),
        transaction.get(photoRef)
      ]);
      assertAttendanceVerificationSession(sessionSnap.exists ? sessionSnap.data() : null, {
        sessionId: faceSessionId,
        nonce: verificationNonce,
        uid: staffId,
        branchId,
        deviceId,
        action: 'CHECK_IN',
        clientIp
      });
      const photo = photoSnap.exists ? photoSnap.data() : null;
      if (!photo || photo.status !== 'ACTIVE' || photo.resourceType !== 'ATTENDANCE' || photo.resourceId !== recordId) {
        throw new Error('CHECKIN_PHOTO_INVALID: Ảnh chấm công không hợp lệ hoặc không thuộc ngày hiện tại.');
      }
      if (photo.branchId !== branchId || photo.createdByUid !== staffId) throw new Error('CHECKIN_PHOTO_FORBIDDEN');
      if (photo.linkedAttendanceId && photo.linkedAttendanceId !== recordId) throw new Error('CHECKIN_PHOTO_ALREADY_USED');
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
      transaction.update(sessionRef, {
        status: 'USED',
        usedAt: FieldValue.serverTimestamp(),
        attendanceId: recordId
      });
      transaction.update(photoRef, {
        linkedAttendanceId: recordId,
        linkedAt: FieldValue.serverTimestamp()
      });
      if (checkInViolations.length > 0 && telegramAlertsEnabled()) {
        transaction.set(
          db.collection('telegramOutboxEvents').doc(attendanceTelegramOutboxId(recordId, 'CHECK_IN')),
          createAttendanceTelegramOutboxRecord({
            attendanceId: recordId,
            action: 'CHECK_IN',
            staffId,
            staffName,
            branchId,
            branchName: authoritativeBranchName,
            scheduledStart,
            scheduledEnd,
            actualTime: timeStr,
            lateMinutes,
            distanceMeters: geoCheck.distanceMeters,
            radiusMeters: authoritativeRadius,
            violations: checkInViolations
          }),
          { merge: false }
        );
      }
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
      branchId: payload.branchId || 'TEST_BRANCH',
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
      scheduledNetMinutes: 480,
      requiredFullDayMinutes: 432,
      requiredHalfDayMinutes: 240,
      creditedWorkDay: 1,
      workdayStatus: 'FULL_DAY',
      workdayPolicyVersion: 'ATTENDANCE_WORKDAY_V1',
      earlyMinutes: 0,
      otMinutes: 0,
      verification: {
        gpsVerified: true,
        distanceMeters: 10,
        faceVerified: true,
        networkVerified: true,
        qrScanned: false,
        serverTimeIso: now.toISOString()
      },
      checkOutVerification: {
        gpsVerified: true,
        distanceMeters: 10,
        userCoords: payload.userCoords || { latitude: 16.0678, longitude: 108.2208 },
        serverTimeIso: now.toISOString()
      }
    };
    return completedRecord;
  }

  const latitude = Number(payload.userCoords?.latitude);
  const longitude = Number(payload.userCoords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('CHECKOUT_GPS_REQUIRED: Cần lấy vị trí GPS hiện tại trước khi xác nhận ra ca.');
  }
  const userCoords = { latitude, longitude };
  const branchSnap = await db.collection('branches').doc(String(payload.branchId || '')).get();
  if (!branchSnap.exists) throw new Error('BRANCH_NOT_FOUND: Không tìm thấy chi nhánh chấm công.');
  const branch = branchSnap.data() || {};
  if (branch.isActive === false || branch.active === false) throw new Error('BRANCH_NOT_ACTIVE: Chi nhánh đã ngừng hoạt động.');
  if (typeof branch.gpsLatitude !== 'number' || typeof branch.gpsLongitude !== 'number') {
    throw new Error('BRANCH_GPS_NOT_CONFIGURED: Chi nhánh chưa được cấu hình tọa độ GPS chuẩn.');
  }
  const geoCheck = verifyGeofence(userCoords, {
    latitude: branch.gpsLatitude,
    longitude: branch.gpsLongitude
  }, resolveAttendanceRadius(branch));
  const checkOutVerification = {
    gpsVerified: geoCheck.isInside,
    distanceMeters: geoCheck.distanceMeters,
    userCoords,
    serverTimeIso: now.toISOString()
  };

  // 1. Find active check-in document for this staffId (handles overnight and regular shifts)
  let targetAttRef = db.collection('attendance').doc(recordId);
  try {
    const openQuery = await db.collection('attendance')
      .where('staffId', '==', staffId)
      .where('branchId', '==', payload.branchId)
      .where('attendanceStatus', '==', 'CHECKED_IN')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (!openQuery.empty) {
      targetAttRef = openQuery.docs[0].ref;
    }
  } catch (queryErr) {
    console.warn('[Checkout] Fallback to direct record ID:', queryErr);
  }

  completedRecord = await db.runTransaction(async (transaction) => {
    if (!payload.faceSessionId || !payload.verificationNonce || !payload.deviceId) throw new Error('VERIFICATION_SESSION_REQUIRED');
    const sessionRef = db.collection('attendanceVerificationSessions').doc(payload.faceSessionId);
    const [sessionSnap, snap] = await Promise.all([transaction.get(sessionRef), transaction.get(targetAttRef)]);
    assertAttendanceVerificationSession(sessionSnap.exists ? sessionSnap.data() : null, {
      sessionId: payload.faceSessionId,
      nonce: payload.verificationNonce,
      uid: staffId,
      branchId: payload.branchId,
      deviceId: payload.deviceId,
      action: 'CHECK_OUT',
      clientIp: payload.clientIp || ''
    });
    if (!snap.exists) {
      throw new Error('NOT_CHECKED_IN: Không tìm thấy lượt điểm danh vào ca đang mở để kết thúc ca.');
    }
    const data = snap.data()!;
    if (String(data.staffId || '') !== staffId || String(data.branchId || '') !== String(payload.branchId || '')) {
      throw new Error('ATTENDANCE_BRANCH_OR_STAFF_MISMATCH');
    }
    if (String(data.attendanceStatus || '') !== 'CHECKED_IN') {
      throw new Error('ATTENDANCE_NOT_OPEN');
    }
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

    const verificationStatus: 'VERIFIED' | 'PENDING_REVIEW' | 'REJECTED' = data.verificationStatus === 'REJECTED'
      ? 'REJECTED'
      : data.verificationStatus === 'PENDING_REVIEW' || !geoCheck.isInside
        ? 'PENDING_REVIEW'
        : 'VERIFIED';

    const calculatedRecord = {
      ...data,
      checkOutTime: timeStr,
      status: 'COMPLETED',
      attendanceStatus: 'COMPLETED',
      verificationStatus,
      punctualityStatus: earlyMinutes > 15 ? 'EARLY' : data.lateMinutes > 0 ? 'LATE' : 'ON_TIME',
      workDurationMinutes,
      netWorkMinutes,
      earlyMinutes,
      otMinutes,
      checkOutVerification
    };
    const updateFields = {
      checkOutTime: calculatedRecord.checkOutTime,
      status: calculatedRecord.status,
      attendanceStatus: calculatedRecord.attendanceStatus,
      verificationStatus: calculatedRecord.verificationStatus,
      punctualityStatus: calculatedRecord.punctualityStatus,
      workDurationMinutes: calculatedRecord.workDurationMinutes,
      netWorkMinutes: calculatedRecord.netWorkMinutes,
      earlyMinutes: calculatedRecord.earlyMinutes,
      otMinutes: calculatedRecord.otMinutes,
      checkOutVerification,
      ...attendanceWorkdayFields(calculatedRecord),
      updatedAt: FieldValue.serverTimestamp()
    };

    transaction.update(targetAttRef, updateFields);
    transaction.update(sessionRef, {
      status: 'USED',
      usedAt: FieldValue.serverTimestamp(),
      attendanceId: targetAttRef.id
    });
    if (!geoCheck.isInside && telegramAlertsEnabled()) {
      transaction.set(
        db.collection('telegramOutboxEvents').doc(attendanceTelegramOutboxId(targetAttRef.id, 'CHECK_OUT')),
        createAttendanceTelegramOutboxRecord({
          attendanceId: targetAttRef.id,
          action: 'CHECK_OUT',
          staffId,
          staffName: String(data.staffName || staffId),
          branchId: String(data.branchId || payload.branchId),
          branchName: String(data.branchName || branch.name || branch.code || payload.branchId),
          scheduledStart: data.scheduledStart,
          scheduledEnd: data.scheduledEnd,
          actualTime: timeStr,
          distanceMeters: geoCheck.distanceMeters,
          radiusMeters: resolveAttendanceRadius(branch),
          violations: ['OUTSIDE_GEOFENCE']
        }),
        { merge: false }
      );
    }

    return {
      ...data,
      id: targetAttRef.id,
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

  const canonicalReviewerRole = normalizeRole(reviewerRole);
  const isAuthorized = hasPermission(canonicalReviewerRole, 'ATTENDANCE_REVIEW');
  if (!isAuthorized) {
    throw new Error('PERMISSION_DENIED: Chỉ Quản lý cửa hàng (Manager) hoặc Quản trị viên (Admin) mới có quyền duyệt chấm công.');
  }
  if (decision === 'REJECT' && reason.trim().length < 5) {
    throw new Error('ATTENDANCE_REVIEW_REASON_REQUIRED: Cần ghi rõ lý do từ chối chấm công.');
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
    if (canonicalReviewerRole !== 'ADMIN' && canonicalReviewerRole !== 'REGIONAL_MANAGER') {
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

    const reviewedRecord = {
      ...data,
      verificationStatus: newVerificationStatus,
      status: newStatus,
      reviewData
    };
    const updateFields = {
      verificationStatus: reviewedRecord.verificationStatus,
      status: reviewedRecord.status,
      reviewData: reviewedRecord.reviewData,
      ...attendanceWorkdayFields(reviewedRecord),
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
