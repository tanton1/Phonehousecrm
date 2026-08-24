import { auth } from '../lib/firebase';
import {
  CashTransaction,
  InterBranchDebtLedger,
  StockTransferSlip,
  TechnicalPriority,
  TechnicalTaskTypeConfig,
  UserAccount
} from '../types';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function sendInventoryTransferRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST',
  payload: Record<string, any> | undefined,
  currentUser?: UserAccount
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const firebaseUser = auth.currentUser;
  if (firebaseUser) {
    headers.Authorization = `Bearer ${await firebaseUser.getIdToken(false)}`;
  } else if (currentUser) {
    // Development-only headers are ignored by the server in production.
    headers['x-staff-uid'] = currentUser.id;
    headers['x-staff-role'] = currentUser.role;
    headers['x-staff-branch-id'] = currentUser.branchId || '';
  }
  const response = await fetch(`/api/inventory-transfers/${endpoint}`, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(payload || {}) : undefined
  });
  const result = await response.json().catch(() => ({ success: false, error: `HTTP_${response.status}` })) as ApiEnvelope<T>;
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error || result.message || `Yêu cầu điều chuyển thất bại (HTTP ${response.status}).`);
  }
  return result.data;
}

export function createIdempotencyKey(scope: string): string {
  const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${scope}:${randomPart}`;
}

export async function fetchInventoryTransferMetadata(currentUser?: UserAccount): Promise<{ taskTypes: TechnicalTaskTypeConfig[] }> {
  return sendInventoryTransferRequest('metadata', 'GET', undefined, currentUser);
}

export async function fetchInventoryTransfers(currentUser?: UserAccount): Promise<{ transfers: StockTransferSlip[] }> {
  return sendInventoryTransferRequest('', 'GET', undefined, currentUser);
}

export async function requestCreateTechnicalTransfer(
  payload: {
    sourceBranchId: string;
    sourceLocationId: string;
    destinationLocationId: string;
    items: Array<{ deviceId: string; tasks: Array<{ taskType: string; priority: TechnicalPriority }> }>;
    notes?: string;
    handoverImageUrls?: string[];
    idempotencyKey: string;
  },
  currentUser?: UserAccount
): Promise<{ transferId: string; code: string; transfer: StockTransferSlip; idempotentReplay?: boolean }> {
  return sendInventoryTransferRequest('technical', 'POST', payload, currentUser);
}

export async function requestAcceptTechnicalTransfer(
  transferId: string,
  scannedImeis: string[],
  currentUser?: UserAccount
): Promise<{ transferId: string; transfer: StockTransferSlip; acceptedCount: number }> {
  return sendInventoryTransferRequest(`technical/${transferId}/accept`, 'POST', {
    scannedImeis,
    idempotencyKey: createIdempotencyKey(`accept-tech-${transferId}`)
  }, currentUser);
}

export async function requestCancelTechnicalTransfer(
  transferId: string,
  reason: string,
  currentUser?: UserAccount
): Promise<{ transferId: string; transfer: StockTransferSlip }> {
  return sendInventoryTransferRequest(`technical/${transferId}/cancel`, 'POST', { reason }, currentUser);
}

export async function requestCreateInterBranchTransfer(
  payload: {
    sourceBranchId: string;
    destinationBranchId: string;
    sourceLocationId: string;
    destinationLocationId: string;
    deviceIds: string[];
    expectedDeliveryAt?: string;
    transporter?: string;
    notes?: string;
    idempotencyKey: string;
  },
  currentUser?: UserAccount
): Promise<{ transferId: string; code: string; transfer: StockTransferSlip; idempotentReplay?: boolean }> {
  return sendInventoryTransferRequest('inter-branch', 'POST', payload, currentUser);
}

export async function requestReceiveInterBranchTransfer(
  transferId: string,
  results: Array<{ imei: string; result: 'RECEIVED' | 'MISSING' | 'WRONG_DEVICE' | 'DAMAGED'; scannedImei?: string; notes?: string }>,
  currentUser?: UserAccount
): Promise<{ transferId: string; transfer: StockTransferSlip; postedAmount: number }> {
  return sendInventoryTransferRequest(`inter-branch/${transferId}/receive`, 'POST', {
    results,
    idempotencyKey: createIdempotencyKey(`receive-${transferId}`)
  }, currentUser);
}

export async function requestCompleteInterBranchTransfer(
  transferId: string,
  currentUser?: UserAccount
): Promise<{ transferId: string; transfer: StockTransferSlip }> {
  return sendInventoryTransferRequest(`inter-branch/${transferId}/complete`, 'POST', {}, currentUser);
}

export async function fetchInterBranchDebts(
  filters: { branchId?: string; financialStatus?: string } = {},
  currentUser?: UserAccount
): Promise<{ debts: InterBranchDebtLedger[]; total: number }> {
  const query = new URLSearchParams();
  if (filters.branchId && filters.branchId !== 'ALL') query.set('branchId', filters.branchId);
  if (filters.financialStatus && filters.financialStatus !== 'ALL') query.set('financialStatus', filters.financialStatus);
  return sendInventoryTransferRequest(`inter-branch-debts${query.size ? `?${query.toString()}` : ''}`, 'GET', undefined, currentUser);
}

export async function requestSettleInterBranchDebt(
  transferId: string,
  payload: {
    amount: number;
    payerFundId: string;
    receiverFundId: string;
    note?: string;
    idempotencyKey: string;
  },
  currentUser?: UserAccount
): Promise<{
  transferId: string;
  debt: InterBranchDebtLedger;
  settlement: Record<string, any>;
  cashTransactions: CashTransaction[];
  idempotentReplay?: boolean;
}> {
  return sendInventoryTransferRequest(`inter-branch/${transferId}/settlements`, 'POST', payload, currentUser);
}
