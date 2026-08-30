import { auth } from '../lib/firebase';
import { AttendanceRecord, DailyShiftChecklistItem, LeaveRequest, ShiftHandoverReport } from '../types';
import { getVietnamDateString } from '../utils/dateTimeUtils';
import { uploadEvidenceRecordViaServer } from './evidenceApiClient';

export interface CheckInEvidencePayload {
  branchId: string;
  branchName?: string;
  staffName?: string;
  role?: string;
  userCoords?: {
    latitude: number;
    longitude: number;
  };
  photoFile?: File;
}

export interface CheckInContext {
  serverTimeIso: string;
  serverTimeFormatted: string;
  serverDateFormatted: string;
  workDate: string;
  shift: {
    shiftId: string;
    shiftName: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
  };
  branch: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
}

export interface AttendanceApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AttendanceHistorySummary {
  workDays: number;
  completedDays: number;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeMinutes: number;
  missingCheckoutDays: number;
  pendingReviewDays: number;
}

export interface AttendanceHistoryResult {
  staffUid: string;
  month: string;
  records: AttendanceRecord[];
  summary: AttendanceHistorySummary;
  complete: boolean;
}

/**
 * Executes an authenticated API request to the backend Attendance service
 */
async function sendAttendanceApiRequest<T>(
  endpoint: 'check-in-context' | 'check-in' | 'check-out' | 'location-heartbeats' | 'network-check' | 'review' | 'corrections' | 'verification-sessions' | 'leave-requests' | `leave-requests/${string}/review` | `checklists/${string}/save` | `checklists/${string}/review` | 'handovers' | `handovers/${string}/review`,
  payload: Record<string, any> = {}
): Promise<T> {
  const firebaseUser = auth.currentUser;
  
  if (!firebaseUser) {
    throw new Error('UNAUTHENTICATED: Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
  }

  let token: string;
  try {
    token = await firebaseUser.getIdToken(false);
  } catch (tokenErr) {
    console.warn('[Attendance API] Failed to retrieve Firebase ID token:', tokenErr);
    throw new Error('INVALID_AUTH_TOKEN: Không thể xác thực phiên làm việc. Vui lòng đăng nhập lại.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const response = await fetch(`/api/attendance/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const result: AttendanceApiResponse<T> = await response.json().catch(() => ({
    success: false,
    error: `Lỗi kết nối máy chủ (HTTP ${response.status})`
  }));

  if (!response.ok || !result.success) {
    const errorMsg = result.error || result.message || `Lỗi điểm danh từ máy chủ (${response.status})`;
    throw new Error(errorMsg);
  }

  return result.data as T;
}

export async function requestAttendanceHistory(input: {
  staffUid?: string;
  branchId?: string;
  month: string;
}): Promise<AttendanceHistoryResult> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) throw new Error('UNAUTHENTICATED: Vui lòng đăng nhập lại.');
  const token = await firebaseUser.getIdToken(false);
  const params = new URLSearchParams({ month: input.month });
  if (input.staffUid) params.set('staffUid', input.staffUid);
  if (input.branchId) params.set('branchId', input.branchId);
  const response = await fetch(`/api/attendance/history?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  const result: AttendanceApiResponse<AttendanceHistoryResult> = await response.json().catch(() => ({
    success: false,
    error: `Lỗi kết nối máy chủ (HTTP ${response.status})`
  }));
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error || result.message || 'Không tải được lịch sử chấm công.');
  }
  return result.data;
}

/**
 * Authoritative Server Check-in with GPS and a server-stored photo evidence record.
 */
export async function requestServerCheckIn(evidence: CheckInEvidencePayload): Promise<AttendanceRecord> {
  if (!evidence.branchId) throw new Error('BRANCH_REQUIRED: Cần chọn chi nhánh trước khi chấm công.');
  if (!evidence.photoFile) throw new Error('CHECKIN_PHOTO_REQUIRED: Hãy chụp ảnh tại cửa hàng trước khi chấm công.');
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) throw new Error('UNAUTHENTICATED: Vui lòng đăng nhập lại.');
  const storageKey = 'phonehouse_attendance_device_id';
  let deviceId = window.sessionStorage.getItem(storageKey) || '';
  if (!deviceId) {
    deviceId = `WEB_${crypto.randomUUID()}`;
    window.sessionStorage.setItem(storageKey, deviceId);
  }
  const attendanceId = `ATT_${firebaseUser.uid}_${getVietnamDateString().replace(/-/g, '')}`;
  const photo = await uploadEvidenceRecordViaServer({
    resourceType: 'ATTENDANCE',
    resourceId: attendanceId,
    contextId: 'CHECK_IN',
    branchId: evidence.branchId,
    file: evidence.photoFile
  });
  const session = await sendAttendanceApiRequest<{ sessionId: string; nonce: string }>('verification-sessions', {
    branchId: evidence.branchId,
    deviceId,
    action: 'CHECK_IN'
  });
  const { photoFile: _photoFile, ...safeEvidence } = evidence;
  return sendAttendanceApiRequest<AttendanceRecord>('check-in', {
    ...safeEvidence,
    photoEvidenceId: photo.id,
    faceSessionId: session.sessionId,
    verificationNonce: session.nonce,
    deviceId
  });
}

export async function requestCheckInContext(branchId: string): Promise<CheckInContext> {
  if (!branchId) throw new Error('BRANCH_REQUIRED: Cần chọn chi nhánh trước khi chấm công.');
  return sendAttendanceApiRequest<CheckInContext>('check-in-context', { branchId });
}

/**
 * Authoritative Server Check-out returning the completed Attendance Record
 */
export async function requestServerCheckOut(
  branchId: string,
  userCoords: { latitude: number; longitude: number }
): Promise<AttendanceRecord> {
  if (!branchId) throw new Error('BRANCH_REQUIRED: Cần chọn chi nhánh trước khi kết thúc ca.');
  if (!Number.isFinite(userCoords?.latitude) || !Number.isFinite(userCoords?.longitude)) {
    throw new Error('CHECKOUT_GPS_REQUIRED: Cần lấy vị trí GPS hiện tại trước khi kết thúc ca.');
  }
  const storageKey = 'phonehouse_attendance_device_id';
  let deviceId = window.sessionStorage.getItem(storageKey) || '';
  if (!deviceId) {
    deviceId = `WEB_${crypto.randomUUID()}`;
    window.sessionStorage.setItem(storageKey, deviceId);
  }
  const session = await sendAttendanceApiRequest<{ sessionId: string; nonce: string }>('verification-sessions', {
    branchId,
    deviceId,
    action: 'CHECK_OUT'
  });
  return sendAttendanceApiRequest<AttendanceRecord>('check-out', {
    branchId,
    userCoords,
    faceSessionId: session.sessionId,
    verificationNonce: session.nonce,
    deviceId
  });
}

export async function requestAttendanceLocationHeartbeat(input: {
  branchId: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}): Promise<{ attendanceId: string; isInside: boolean; distanceMeters: number; radiusMeters: number }> {
  if (!input.branchId) throw new Error('BRANCH_REQUIRED');
  return sendAttendanceApiRequest('location-heartbeats', input);
}

/**
 * Store Network & IP Verification
 */
export async function requestNetworkCheck(branchId?: string): Promise<{
  clientIp: string;
  isAllowed: boolean;
  branchId?: string;
  verifiedAt: string;
  serverTimeFormatted: string;
  serverDateFormatted: string;
}> {
  return sendAttendanceApiRequest('network-check', { branchId });
}

/**
 * Authoritative Attendance Review (Approve/Reject PENDING_REVIEW records)
 */
export async function requestAttendanceReview(
  attendanceId: string,
  decision: 'APPROVE' | 'REJECT',
  reason?: string
): Promise<AttendanceRecord> {
  return sendAttendanceApiRequest<AttendanceRecord>('review', {
    attendanceId,
    decision,
    reason
  });
}

export async function requestAttendanceCorrection(input: {
  attendanceId: string;
  correctedCheckInTime?: string;
  correctedCheckOutTime?: string;
  correctedCheckOutDate?: string;
  reason: string;
}): Promise<AttendanceRecord> {
  return sendAttendanceApiRequest<AttendanceRecord>('corrections', input);
}

export async function requestCreateLeaveRequest(request: LeaveRequest): Promise<LeaveRequest> {
  return sendAttendanceApiRequest<LeaveRequest>('leave-requests', request as unknown as Record<string, any>);
}

export async function requestReviewLeaveRequest(requestId: string, decision: 'APPROVE' | 'REJECT', reason?: string): Promise<LeaveRequest> {
  return sendAttendanceApiRequest<LeaveRequest>(`leave-requests/${encodeURIComponent(requestId)}/review`, { decision, reason });
}

export async function requestSaveDailyChecklist(item: DailyShiftChecklistItem): Promise<DailyShiftChecklistItem> {
  return sendAttendanceApiRequest<DailyShiftChecklistItem>(`checklists/${encodeURIComponent(item.id)}/save`, item as unknown as Record<string, any>);
}

export async function requestReviewDailyChecklist(checklistId: string): Promise<DailyShiftChecklistItem> {
  return sendAttendanceApiRequest<DailyShiftChecklistItem>(`checklists/${encodeURIComponent(checklistId)}/review`);
}

export async function requestCreateShiftHandover(report: ShiftHandoverReport): Promise<ShiftHandoverReport> {
  return sendAttendanceApiRequest<ShiftHandoverReport>('handovers', report as unknown as Record<string, any>);
}

export async function requestReviewShiftHandover(handoverId: string, feedback?: string): Promise<ShiftHandoverReport> {
  return sendAttendanceApiRequest<ShiftHandoverReport>(`handovers/${encodeURIComponent(handoverId)}/review`, { feedback });
}
