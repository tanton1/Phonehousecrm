import { auth } from '../lib/firebase';
import { 
  EvidenceVerificationStatus, 
  LeadStatus, 
  LeadCareActivity, 
  DeviceReservation 
} from '../types';

export interface CrmApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Authoritative Server Request Wrapper for CRM API Endpoints
 */
async function sendCrmApiRequest<T>(
  endpoint: string,
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
    console.warn('[CRM API] Failed to retrieve Firebase ID token:', tokenErr);
    throw new Error('INVALID_AUTH_TOKEN: Không thể xác thực phiên làm việc. Vui lòng đăng nhập lại.');
  }

  const response = await fetch(`/api/crm/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const result: CrmApiResponse<T> = await response.json().catch(() => ({
    success: false,
    error: `Lỗi kết nối máy chủ (HTTP ${response.status})`
  }));

  if (!response.ok || !result.success) {
    throw new Error(result.error || `Yêu cầu CRM thất bại (Mã lỗi ${response.status})`);
  }

  return result.data as T;
}

/**
 * 1. Request Server-side QA Review for a Lead Care Activity
 */
export async function requestServerCareReview(
  activityId: string,
  status: EvidenceVerificationStatus,
  note?: string
): Promise<LeadCareActivity> {
  return sendCrmApiRequest<LeadCareActivity>('care/review', {
    activityId,
    status,
    note
  });
}

/**
 * 2. Request Authoritative Lead State Transition
 */
export async function requestLeadStateTransition(
  leadId: string,
  fromStatus: LeadStatus,
  toStatus: LeadStatus,
  context?: {
    invoiceId?: string;
    depositReference?: string;
    appointmentId?: string;
    quoteId?: string;
    lostReason?: string;
    notes?: string;
  }
): Promise<{ leadId: string; status: LeadStatus }> {
  return sendCrmApiRequest<{ leadId: string; status: LeadStatus }>('leads/transition', {
    leadId,
    fromStatus,
    toStatus,
    context
  });
}

/**
 * 3. Request 30-Minute Device Inventory Reservation
 */
export async function requestDeviceReservation(
  deviceId: string,
  leadId: string,
  quoteId?: string,
  customerId?: string
): Promise<DeviceReservation> {
  return sendCrmApiRequest<DeviceReservation>('quotes/reserve', {
    deviceId,
    leadId,
    quoteId,
    customerId
  });
}

/**
 * 4. Request Convert Quote to POS Order
 */
export async function requestConvertQuoteToPOS(
  quoteId: string,
  invoiceId: string
): Promise<{ success: boolean; message?: string }> {
  return sendCrmApiRequest<{ success: boolean; message?: string }>('quotes/convert-pos', {
    quoteId,
    invoiceId
  });
}
