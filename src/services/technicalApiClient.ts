import { auth } from '../lib/firebase';

export interface TechnicalApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Authoritative Server Request Wrapper for Technical API Endpoints
 */
async function sendTechnicalApiRequest<T>(
  endpoint: string,
  payload: Record<string, any> = {},
  method: string = 'POST'
): Promise<T> {
  const firebaseUser = auth.currentUser;

  if (!firebaseUser) {
    throw new Error('UNAUTHENTICATED: Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
  }

  let token: string;
  try {
    token = await firebaseUser.getIdToken(false);
  } catch (tokenErr) {
    console.warn('[Technical API] Failed to retrieve Firebase ID token:', tokenErr);
    throw new Error('INVALID_AUTH_TOKEN: Không thể xác thực phiên làm việc. Vui lòng đăng nhập lại.');
  }

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };

  if (method !== 'GET' && method !== 'HEAD') {
    options.body = JSON.stringify(payload);
  }

  const response = await fetch(`/api/technical/${endpoint}`, options);

  const result: TechnicalApiResponse<T> = await response.json().catch(() => ({
    success: false,
    error: `Lỗi kết nối máy chủ (HTTP ${response.status})`
  }));

  if (!response.ok || !result.success) {
    throw new Error(result.error || `Yêu cầu kỹ thuật thất bại (Mã lỗi ${response.status})`);
  }

  return result.data as T;
}

/**
 * 1. Create Technical Work Order with Task Lines
 */
export async function requestCreateWorkOrder(payload: {
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
  lines: Array<{
    taskCode: 'LV' | 'EK' | 'TP' | 'RC2.5' | 'FIX_FACE' | 'MAIN' | 'KCS' | 'OTHER';
    taskName: string;
    assigneeUid: string;
    assigneeName: string;
    ratePolicyId?: string;
    ratePolicyVersion?: string;
    commissionAmount: number;
    requiredParts?: Array<{ partId: string; partName: string; quantity: number }>;
  }>;
}): Promise<{ workOrderId: string; code: string; lineIds: string[] }> {
  return await sendTechnicalApiRequest('work-orders', payload);
}

/**
 * 2. Accept Custody of Physical Device
 */
export async function requestAcceptCustody(
  workOrderId: string,
  scannedImei: string,
  preRepairInspection: {
    appearance: 'GOOD' | 'SCRATCHED' | 'DENTED';
    screen: 'OK' | 'DEFECTIVE' | 'NOT_TESTABLE';
    power: 'OK' | 'NO_POWER';
    biometrics: 'OK' | 'DEFECTIVE' | 'NOT_TESTABLE';
    technicianNotes?: string;
  }
): Promise<{ success: boolean; workOrderId: string }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/accept`, { scannedImei, preRepairInspection });
}

/** Confirm a warehouse-dispatched device without retyping its known IMEI. */
export async function requestQuickAcceptCustody(
  workOrderId: string
): Promise<{ success: boolean; workOrderId: string }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/quick-accept`, {});
}

/**
 * 3. Start Work Order Task Line
 */
export async function requestStartTaskLine(
  workOrderId: string,
  lineId: string
): Promise<{ success: boolean; lineId: string }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/start-task`, { lineId });
}

/**
 * 4. Complete Work Order Task Line
 */
export async function requestCompleteTaskLine(
  workOrderId: string,
  lineId: string,
  evidencePhotoUrls: string[] = [],
  notes: string = ''
): Promise<{ success: boolean; lineId: string; workOrderId: string; allLinesCompleted: boolean }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/complete-task`, {
    lineId,
    evidencePhotoUrls,
    notes
  });
}

/**
 * 5. Issue Spare Part
 */
export async function requestIssueSparePart(
  workOrderId: string,
  lineId: string,
  partId: string,
  quantity: number = 1
): Promise<{ success: boolean; partId: string; remainingStock: number }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/parts/issue`, {
    lineId,
    partId,
    quantity
  });
}

/**
 * 6. Submit Independent QC Inspection
 */
export async function requestQCInspection(
  workOrderId: string,
  inspection: {
    checklistVersion?: string;
    checklistResults: Record<string, boolean>;
    overallResult: 'PASS' | 'FAIL';
    failedReason?: string;
    photoEvidenceUrls?: string[];
  }
): Promise<{ success: boolean; result: 'PASS' | 'FAIL'; inspectionId: string }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/qc`, inspection);
}

/**
 * 7. Return Repaired Internal Asset to Main Stock
 */
export async function requestReturnToStock(
  workOrderId: string,
  targetWarehouseId: string = 'KHO_TONG'
): Promise<{ success: boolean; deviceId: string }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/return-to-stock`, { targetWarehouseId });
}

/**
 * 8. Deliver Repaired Device to Customer
 */
export async function requestDeliverToCustomer(
  workOrderId: string,
  notes: string = ''
): Promise<{ success: boolean; workOrderId: string }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/deliver-customer`, { notes });
}

/**
 * 9. Fetch Task Lines for Authenticated Technician (My Work)
 */
export async function fetchMyTechnicalWork(): Promise<any[]> {
  return await sendTechnicalApiRequest('my-work', {}, 'GET');
}
