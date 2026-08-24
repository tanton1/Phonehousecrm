import { auth } from '../lib/firebase';
import { 
  EvidenceVerificationStatus, 
  LeadStatus, 
  LeadCareActivity, 
  DeviceReservation,
  Lead,
  LeadAppointment,
  LeadQuote,
  CRMTask
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
async function requestCrmApi<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH';
    payload?: Record<string, any>;
    query?: Record<string, string | number | boolean | null | undefined>;
  } = {}
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

  const query = new URLSearchParams();
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const response = await fetch(`/api/crm/${endpoint}${query.size ? `?${query.toString()}` : ''}`, {
    method: options.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: (options.method || 'POST') === 'GET' ? undefined : JSON.stringify(options.payload || {})
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

async function sendCrmApiRequest<T>(endpoint: string, payload: Record<string, any> = {}): Promise<T> {
  return requestCrmApi<T>(endpoint, { method: 'POST', payload });
}

export function createCrmOperationKey(prefix = 'CRM') {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${uuid}`;
}

export interface CrmLeadPage {
  items: Lead[];
  nextCursor: string | null;
  hasMore: boolean;
  summary: { loaded: number; scope: string };
}

export interface CrmWorkQueueItem {
  task: CRMTask & { legacyProjection?: boolean };
  lead: Lead | null;
  overdue: boolean;
}

export interface CrmWorkQueueResult {
  items: CrmWorkQueueItem[];
  summary: { total: number; overdue: number; newLeads: number; appointments: number; postSale: number };
}

export async function requestCrmLeadPage(input: {
  branchId?: string; ownerId?: string; status?: string; source?: string; search?: string; cursor?: string; limit?: number;
}): Promise<CrmLeadPage> {
  return requestCrmApi<CrmLeadPage>('leads', { method: 'GET', query: input });
}

export async function requestCrmWorkQueue(input: { branchId?: string; ownerId?: string; limit?: number } = {}): Promise<CrmWorkQueueResult> {
  return requestCrmApi<CrmWorkQueueResult>('work-queue', { method: 'GET', query: input });
}

export async function requestCrmCareActivities(input: { branchId?: string; staffId?: string; verificationStatus?: string; limit?: number } = {}): Promise<{ items: LeadCareActivity[]; summary: { total: number; limited: boolean } }> {
  return requestCrmApi('care/activities', { method: 'GET', query: input });
}

export async function requestCreateCrmLead(input: {
  branchId: string; name: string; phone: string; zalo?: string; source?: string; interestedModel?: string;
  budget?: number; tradeInRequired?: boolean; tradeInModel?: string; notes?: string; requestedAssigneeId?: string;
  nextActionType?: string; nextActionAt?: string; operationKey?: string;
}): Promise<{ lead: Lead; task: CRMTask; duplicateCustomer: boolean; assignment: { staffId: string; staffName: string; mode: string }; idempotentReplay?: boolean }> {
  return requestCrmApi('leads', { method: 'POST', payload: { ...input, operationKey: input.operationKey || createCrmOperationKey('LEAD') } });
}

export async function requestRecordCrmCare(leadId: string, input: Record<string, any>): Promise<{ activity: LeadCareActivity; lead: Lead; nextTask?: CRMTask; idempotentReplay?: boolean }> {
  return requestCrmApi(`leads/${encodeURIComponent(leadId)}/care`, {
    method: 'POST', payload: { ...input, operationKey: input.operationKey || createCrmOperationKey('CARE') }
  });
}

export async function requestAssignCrmLead(leadId: string, input: { toStaffId: string; reason?: string; notes?: string; operationKey?: string }): Promise<{ lead: Lead }> {
  return requestCrmApi(`leads/${encodeURIComponent(leadId)}/assign`, {
    method: 'POST', payload: { ...input, operationKey: input.operationKey || createCrmOperationKey('ASSIGN') }
  });
}

export async function requestCreateCrmAppointment(input: Partial<LeadAppointment> & { leadId: string; operationKey?: string }): Promise<{ appointment: LeadAppointment; lead: Lead }> {
  return requestCrmApi('appointments', { method: 'POST', payload: { ...input, operationKey: input.operationKey || createCrmOperationKey('APPT') } });
}

export async function requestUpdateCrmAppointment(appointmentId: string, status: LeadAppointment['status']): Promise<{ appointment: LeadAppointment }> {
  return requestCrmApi(`appointments/${encodeURIComponent(appointmentId)}`, {
    method: 'PATCH', payload: { status, operationKey: createCrmOperationKey('APPT_STATUS') }
  });
}

export async function requestCreateCrmQuote(input: Partial<LeadQuote> & { leadId: string; operationKey?: string }): Promise<{ quote: LeadQuote; lead: Lead }> {
  return requestCrmApi('quotes', { method: 'POST', payload: { ...input, operationKey: input.operationKey || createCrmOperationKey('QUOTE') } });
}

export async function requestCrmCustomer360(leadId: string): Promise<any> {
  return requestCrmApi(`customers/${encodeURIComponent(leadId)}/360`, { method: 'GET' });
}

export async function requestCrmDashboard(input: { branchId?: string; dateFrom?: string; dateTo?: string } = {}): Promise<any> {
  return requestCrmApi('dashboard', { method: 'GET', query: input });
}

export async function requestCrmDispatch(branchId: string): Promise<any> {
  return requestCrmApi('dispatch', { method: 'GET', query: { branchId } });
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
