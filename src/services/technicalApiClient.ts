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
  deviceId?: string;
  imei: string;
  model: string;
  workOrderType: 'INBOUND_PREP' | 'CUSTOMER_SERVICE' | 'WARRANTY' | 'TRADE_IN_REFURB' | 'SHOP_RETURN_REWORK';
  branchId: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  assetOwnership?: 'COMPANY' | 'CUSTOMER';
  customerName?: string;
  customerPhone?: string;
  customerApprovedQuote?: number;
  totalEstimatedCost?: number;
  intakeDetails?: {
    issueType?: string;
    faultDescription?: string;
    deviceAppearance?: string;
    accessoriesIncluded?: string;
    expectedReturnDate?: string;
    /** Chỉ là trạng thái hỗ trợ mở máy, tuyệt đối không có tài khoản/mật khẩu. */
    icloudStatus?: string;
    unlockNote?: string;
  };
  notes?: string;
  lines: Array<{
    taskType: string;
    priority?: 'NORMAL' | 'PRIORITY' | 'URGENT';
    assigneeUid: string;
    assigneeName: string;
  }>;
}): Promise<{ workOrderId: string; code: string; lineIds: string[] }> {
  return await sendTechnicalApiRequest('work-orders', payload);
}

/** Attach the actual photos only after Storage has issued trustworthy URLs.
 * The server verifies that every URL belongs to this work order. */
export async function requestAttachIntakeEvidence(
  workOrderId: string,
  intakePhotoUrls: string[]
): Promise<{ workOrderId: string; intakePhotoUrls: string[] }> {
  return await sendTechnicalApiRequest(`work-orders/${encodeURIComponent(workOrderId)}/intake-evidence`, { intakePhotoUrls });
}

export async function requestRevealTechnicalPasscode(workOrderId: string): Promise<{ passcode: string | null }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/passcode`, {}, 'GET');
}

export async function requestTechnicalHandoff(
  workOrderId: string,
  payload: {
    targetWarehouseId: string;
    targetTechnicianUid: string;
    targetTechnicianName?: string;
    scannedImei: string;
    reason: string;
    handoverPhotoUrls?: string[];
  }
): Promise<any> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/handoffs`, {
    ...payload,
    idempotencyKey: createTechnicalIdempotencyKey(`tech-handoff-request-${workOrderId}`)
  });
}

export async function fetchPendingTechnicalHandoffs(): Promise<any[]> {
  return await sendTechnicalApiRequest('handoffs/pending', {}, 'GET');
}

export async function requestAcceptTechnicalHandoff(
  handoffId: string,
  payload: { scannedImei: string; handoverPhotoUrls?: string[]; notes?: string }
): Promise<any> {
  return await sendTechnicalApiRequest(`handoffs/${handoffId}/accept`, {
    ...payload,
    idempotencyKey: createTechnicalIdempotencyKey(`tech-handoff-accept-${handoffId}`)
  });
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
    handoverPhotoUrls?: string[];
  }
): Promise<{ success: boolean; workOrderId: string }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/accept`, { scannedImei, preRepairInspection });
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

/** Pause only this task while waiting for a part; other tasks stay active. */
export async function requestMarkTaskWaitingForParts(
  workOrderId: string,
  lineId: string,
  reason: string
): Promise<{ success: boolean; lineId: string; status: 'WAITING_PARTS'; idempotentReplay?: boolean }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/waiting-parts`, {
    lineId,
    reason,
    idempotencyKey: createTechnicalIdempotencyKey(`task-waiting-parts-${workOrderId}-${lineId}`)
  });
}

export async function requestCreateTechnicalTaskAddition(
  workOrderId: string,
  payload: {
    taskType: string;
    priority?: 'NORMAL' | 'PRIORITY' | 'URGENT';
    reason: string;
    evidencePhotoUrls?: string[];
    additionalCustomerQuote?: number;
  }
): Promise<{ request: any; idempotentReplay?: boolean }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/task-additions`, {
    ...payload,
    idempotencyKey: createTechnicalIdempotencyKey(`task-addition-${workOrderId}-${payload.taskType}`)
  });
}

export async function requestDecideTechnicalTaskAddition(
  workOrderId: string,
  requestId: string,
  payload: {
    decision: 'APPROVED' | 'REJECTED';
    note?: string;
    customerApprovalConfirmed?: boolean;
    additionalCustomerQuote?: number;
  }
): Promise<{ request: any; lineId?: string; idempotentReplay?: boolean }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/task-additions/${requestId}/decision`, {
    ...payload,
    idempotencyKey: createTechnicalIdempotencyKey(`task-addition-decision-${requestId}`)
  });
}

/**
 * 4. Complete Work Order Task Line
 */
export async function requestCompleteTaskLine(
  workOrderId: string,
  lineId: string,
  evidencePhotoUrls: string[] = [],
  notes: string = '',
  completionMetadata: {
    replacementSerials?: string[];
    postRepairMetrics?: Record<string, string | number | boolean | null>;
  } = {}
): Promise<{ success: boolean; lineId: string; workOrderId: string; allLinesCompleted: boolean }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/complete-task`, {
    lineId,
    evidencePhotoUrls,
    notes,
    completionMetadata
  });
}

/**
 * 5. Issue Spare Part
 */
export async function requestIssueSparePart(
  workOrderId: string,
  lineId: string,
  partId: string,
  warehouseId: string,
  quantity: number = 1,
  lotId?: string,
  reservationId?: string,
  exceptionApprovalId?: string
): Promise<{ issue: any; remainingStock: number; idempotentReplay?: boolean }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/parts/issue`, {
    lineId,
    partId,
    warehouseId,
    lotId,
    reservationId,
    exceptionApprovalId,
    quantity,
    idempotencyKey: createTechnicalIdempotencyKey(`part-issue-${workOrderId}-${lineId}`)
  });
}

export async function requestReserveSparePart(
  workOrderId: string,
  lineId: string,
  partId: string,
  warehouseId: string,
  quantity: number = 1,
  lotId?: string
): Promise<{ reservation: any; availableQuantity: number; idempotentReplay?: boolean }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/parts/reserve`, {
    lineId,
    partId,
    warehouseId,
    lotId,
    quantity,
    idempotencyKey: createTechnicalIdempotencyKey(`part-reserve-${workOrderId}-${lineId}`)
  });
}

/**
 * KTV không thể tự xuất linh kiện không nằm trong policy của task.
 * Hàm này chỉ tạo yêu cầu để Kho/Admin xét duyệt ngoại lệ; không làm
 * phát sinh phiếu xuất hay thay đổi tồn kho.
 */
export async function requestTechnicalPartException(
  workOrderId: string,
  payload: {
    lineId: string;
    partId: string;
    warehouseId: string;
    lotId?: string;
    quantity: number;
    reason: string;
  }
): Promise<{ exception: any }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/parts/exceptions`, {
    ...payload,
    idempotencyKey: createTechnicalIdempotencyKey(`part-exception-${workOrderId}-${payload.lineId}-${payload.partId}`)
  });
}

export async function requestDecideTechnicalPartException(
  workOrderId: string,
  exceptionId: string,
  payload: { decision: 'APPROVED' | 'REJECTED'; quantityApproved?: number; note?: string }
): Promise<{ exception: any; idempotentReplay?: boolean }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/parts/exceptions/${exceptionId}/decision`, {
    ...payload,
    idempotencyKey: createTechnicalIdempotencyKey(`part-exception-decision-${exceptionId}`)
  });
}

export async function requestCancelSparePartReservation(workOrderId: string, reservationId: string, reason: string): Promise<any> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/parts/reservations/${reservationId}/cancel`, {
    reason,
    idempotencyKey: createTechnicalIdempotencyKey(`part-reservation-cancel-${reservationId}`)
  });
}

export async function requestReceiveTechnicalSparePart(payload: {
  partId?: string;
  sku: string;
  name: string;
  category?: string;
  branchId: string;
  warehouseId: string;
  lotCode?: string;
  quantity: number;
  unitCost: number;
  supplierId?: string;
  sourceType: 'PART_PURCHASE' | 'OPENING_BALANCE' | 'MANUAL_ADJUSTMENT';
  sourceId: string;
  sourceCode?: string;
  note?: string;
  compatibleModels?: string[];
  compatibleModelCodes?: string[];
  compatibleModelIds?: string[];
}): Promise<any> {
  return await sendTechnicalApiRequest('parts/receive', {
    ...payload,
    idempotencyKey: createTechnicalIdempotencyKey(`part-receipt-${payload.branchId}-${payload.warehouseId}-${payload.sku}`)
  });
}

export async function requestConsumeSparePart(workOrderId: string, issueId: string, quantity: number, note = ''): Promise<any> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/parts/${issueId}/consume`, {
    quantity, note, idempotencyKey: createTechnicalIdempotencyKey(`part-consume-${issueId}`)
  });
}

export async function requestReturnSparePart(workOrderId: string, issueId: string, quantity: number, note = ''): Promise<any> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/parts/${issueId}/return`, {
    quantity, note, idempotencyKey: createTechnicalIdempotencyKey(`part-return-${issueId}`)
  });
}

export async function requestScrapSparePart(workOrderId: string, issueId: string, quantity: number, reason: string, capitalizeToDevice = false): Promise<any> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/parts/${issueId}/scrap`, {
    quantity, reason, capitalizeToDevice, idempotencyKey: createTechnicalIdempotencyKey(`part-scrap-${issueId}`)
  });
}

export async function requestCancelSparePartIssue(workOrderId: string, issueId: string, reason: string): Promise<any> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/parts/${issueId}/cancel`, {
    reason, idempotencyKey: createTechnicalIdempotencyKey(`part-cancel-${issueId}`)
  });
}

export async function requestAddTechnicalExternalCost(workOrderId: string, payload: Record<string, any>): Promise<any> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/external-costs`, {
    ...payload,
    idempotencyKey: createTechnicalIdempotencyKey(`external-cost-${workOrderId}`)
  });
}

export async function requestDecideTechnicalExternalCost(
  workOrderId: string,
  costId: string,
  decision: 'APPROVED' | 'REJECTED'
): Promise<any> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/external-costs/${costId}/decision`, { decision });
}

export async function requestAddTechnicalRecovery(workOrderId: string, payload: Record<string, any>): Promise<any> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/recoveries`, {
    ...payload,
    idempotencyKey: createTechnicalIdempotencyKey(`recovery-${workOrderId}`)
  });
}

export async function requestDecideTechnicalRecovery(
  workOrderId: string,
  recoveryId: string,
  decision: 'APPROVED' | 'REJECTED'
): Promise<any> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/recoveries/${recoveryId}/decision`, { decision });
}

export async function fetchTechnicalCostBreakdown(workOrderId: string): Promise<any> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/cost-breakdown`, {}, 'GET');
}

export async function fetchTechnicalSpareParts(warehouseId?: string): Promise<any[]> {
  const query = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}` : '';
  return await sendTechnicalApiRequest(`parts${query}`, {}, 'GET');
}

/**
 * A request moves stock only after it has been approved.  The requester
 * never receives a write path to the central balance directly.
 */
export interface TechnicalPartStockRequest {
  id: string;
  status: 'PENDING' | 'FULFILLED' | 'REJECTED' | string;
  branchId?: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  targetCustodianUid?: string | null;
  targetCustodianName?: string | null;
  partId: string;
  lotId?: string | null;
  sku?: string;
  partName?: string;
  category?: string;
  quantityRequested: number;
  quantityApproved?: number;
  sourceAvailableSnapshot?: number;
  reason: string;
  workOrderId?: string | null;
  workOrderLineId?: string | null;
  requestedByUid?: string;
  requestedByName?: string | null;
  requestedAt?: string;
  decidedByUid?: string | null;
  decidedByName?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  transferId?: string | null;
}

export async function fetchTechnicalPartStockRequests(
  status?: string
): Promise<TechnicalPartStockRequest[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return await sendTechnicalApiRequest(`parts/requests${query}`, {}, 'GET');
}

export async function requestTechnicalPartStockRequest(payload: {
  sourceWarehouseId: string;
  targetWarehouseId: string;
  partId: string;
  lotId?: string;
  quantity: number;
  reason: string;
  workOrderId?: string;
  workOrderLineId?: string;
}): Promise<{ request: TechnicalPartStockRequest; idempotentReplay?: boolean }> {
  return await sendTechnicalApiRequest('parts/requests', {
    ...payload,
    idempotencyKey: createTechnicalIdempotencyKey(
      `part-stock-request-${payload.sourceWarehouseId}-${payload.targetWarehouseId}-${payload.partId}`
    )
  });
}

export async function requestDecideTechnicalPartStockRequest(
  requestId: string,
  payload: {
    decision: 'APPROVED' | 'REJECTED';
    quantityApproved?: number;
    note?: string;
  }
): Promise<{ request: TechnicalPartStockRequest; transferId?: string; idempotentReplay?: boolean }> {
  return await sendTechnicalApiRequest(`parts/requests/${requestId}/decision`, {
    ...payload,
    idempotencyKey: createTechnicalIdempotencyKey(`part-stock-request-decision-${requestId}`)
  });
}

export async function requestFinalizeTechnicalCost(workOrderId: string): Promise<any> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/finalize-cost`, {
    idempotencyKey: createTechnicalIdempotencyKey(`finalize-cost-${workOrderId}`)
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
  targetWarehouseId: string,
  scannedImei: string
): Promise<{ success: boolean; deviceId: string }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/return-to-stock`, { targetWarehouseId, scannedImei });
}

/**
 * 8. Deliver Repaired Device to Customer
 */
export async function requestDeliverToCustomer(
  workOrderId: string,
  notes: string = '',
  payment?: {
    finalAmount: number;
    paidAmount: number;
    paymentMethod: 'CASH' | 'BANK' | 'DEBT';
    fundId?: string;
    note?: string;
  }
): Promise<{ success: boolean; workOrderId: string }> {
  return await sendTechnicalApiRequest(`work-orders/${workOrderId}/deliver-customer`, { notes, payment });
}

export interface TechnicalCommissionLedgerEntry {
  id: string;
  staffUid: string;
  staffName: string;
  workOrderId: string;
  workOrderLineId: string;
  workOrderType?: string;
  branchId: string;
  imei?: string;
  taskCode?: string;
  taskName?: string;
  commissionPayable?: number;
  amount?: number;
  policyId?: string;
  policyVersion?: string;
  payrollPeriod: string;
  status: 'PENDING' | 'ELIGIBLE' | 'CANCELLED' | 'PAID';
  createdAt?: string | null;
  eligibleAt?: string | null;
  paidAt?: string | null;
  payrollPostingId?: string;
}

export async function fetchTechnicalCommissionLedger(period: string): Promise<TechnicalCommissionLedgerEntry[]> {
  return await sendTechnicalApiRequest(`commissions?period=${encodeURIComponent(period)}`, {}, 'GET');
}

export interface RepairRevenueReport {
  from: string;
  to: string;
  summary: {
    deliveredCount: number;
    warrantyCount: number;
    serviceRevenue: number;
    cashCollected: number;
    outstanding: number;
  };
  items: Array<{
    workOrderId: string;
    code: string;
    branchId: string;
    type: string;
    customerName: string;
    customerPhone: string;
    imei: string;
    model: string;
    deliveredAt: string;
    finalAmount: number;
    paidAmount: number;
    balanceDue: number;
    paymentStatus: string;
    paymentMethod: string;
    deliveryNotes: string;
  }>;
}

export async function fetchRepairRevenueReport(from?: string, to?: string): Promise<RepairRevenueReport> {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  return await sendTechnicalApiRequest(`reports/repair-revenue${query.size ? `?${query.toString()}` : ''}`, {}, 'GET');
}

export type RetailRepairStage = 'WAITING_ACCEPTANCE' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'WAITING_QC' | 'WAITING_DELIVERY' | 'COMPLETED';

export interface RetailRepairCase {
  id: string;
  code: string;
  branchId: string;
  type: 'CUSTOMER_SERVICE' | 'WARRANTY' | string;
  status: string;
  stage: RetailRepairStage;
  customerName: string;
  customerPhone: string;
  imei: string;
  model: string;
  receivedAt: string;
  expectedReturnDate: string;
  deliveredAt: string;
  finalAmount: number;
  paidAmount: number;
  balanceDue: number;
  paymentStatus: string;
  paymentMethod: string;
  taskLines: Array<{ id: string; taskName: string; status: string; assigneeUid: string; assigneeName: string; deadlineAt: string }>;
}

export interface RetailRepairDashboard {
  summary: {
    receivedCount: number;
    inProgressCount: number;
    waitingDeliveryCount: number;
    deliveredCount: number;
    serviceRevenue: number;
    cashCollected: number;
    outstanding: number;
    warrantyCount: number;
  };
  items: RetailRepairCase[];
}

export async function fetchRetailRepairDashboard(): Promise<RetailRepairDashboard> {
  return await sendTechnicalApiRequest('retail-repairs', {}, 'GET');
}

/**
 * 9. Fetch Task Lines for Authenticated Technician (My Work)
 */
export async function fetchMyTechnicalWork(): Promise<any[]> {
  return await sendTechnicalApiRequest('my-work', {}, 'GET');
}

export function createTechnicalIdempotencyKey(scope: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${scope}:${suffix}`;
}
