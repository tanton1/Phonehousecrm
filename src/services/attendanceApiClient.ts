import { auth } from '../lib/firebase';
import { AttendanceRecord, DailyShiftChecklistItem, LeaveRequest, ShiftHandoverReport } from '../types';

export interface CheckInEvidencePayload {
  branchId: string;
  branchName?: string;
  staffName?: string;
  role?: string;
  userCoords?: {
    latitude: number;
    longitude: number;
  };
  faceCaptureBase64?: string;
  faceSessionId?: string;
  verificationNonce?: string;
  deviceId?: string;
  qrScanned?: boolean;
}

export interface AttendanceApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Executes an authenticated API request to the backend Attendance service
 */
async function sendAttendanceApiRequest<T>(
  endpoint: 'check-in' | 'check-out' | 'network-check' | 'review' | 'verification-sessions' | 'leave-requests' | `leave-requests/${string}/review` | `checklists/${string}/save` | `checklists/${string}/review` | 'handovers' | `handovers/${string}/review`,
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

/**
 * Authoritative Server Check-in with biometric and geofence verification
 */
export async function requestServerCheckIn(evidence: CheckInEvidencePayload): Promise<AttendanceRecord> {
  if (!evidence.branchId) throw new Error('BRANCH_REQUIRED: Cần chọn chi nhánh trước khi chấm công.');
  const storageKey = 'phonehouse_attendance_device_id';
  let deviceId = window.sessionStorage.getItem(storageKey) || '';
  if (!deviceId) {
    deviceId = `WEB_${crypto.randomUUID()}`;
    window.sessionStorage.setItem(storageKey, deviceId);
  }
  const session = await sendAttendanceApiRequest<{ sessionId: string; nonce: string }>('verification-sessions', {
    branchId: evidence.branchId,
    deviceId,
    action: 'CHECK_IN'
  });
  const { faceCaptureBase64: _faceCapture, ...safeEvidence } = evidence;
  return sendAttendanceApiRequest<AttendanceRecord>('check-in', {
    ...safeEvidence,
    faceSessionId: session.sessionId,
    verificationNonce: session.nonce,
    deviceId
  });
}

/**
 * Authoritative Server Check-out returning the completed Attendance Record
 */
export async function requestServerCheckOut(branchId: string): Promise<AttendanceRecord> {
  if (!branchId) throw new Error('BRANCH_REQUIRED: Cần chọn chi nhánh trước khi kết thúc ca.');
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
    faceSessionId: session.sessionId,
    verificationNonce: session.nonce,
    deviceId
  });
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
