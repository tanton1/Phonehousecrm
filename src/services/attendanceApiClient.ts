import { auth } from '../lib/firebase';
import { AttendanceRecord } from '../types';

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
  endpoint: 'check-in' | 'check-out' | 'network-check' | 'review',
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
  return sendAttendanceApiRequest<AttendanceRecord>('check-in', evidence);
}

/**
 * Authoritative Server Check-out returning the completed Attendance Record
 */
export async function requestServerCheckOut(branchId: string): Promise<AttendanceRecord> {
  return sendAttendanceApiRequest<AttendanceRecord>('check-out', { branchId });
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
