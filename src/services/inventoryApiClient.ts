import { auth } from '../lib/firebase';
import { DeviceItem, PurchaseOrder, UserAccount } from '../types';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function sendInventoryRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST',
  payload?: Record<string, any>,
  currentUser?: UserAccount
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const firebaseUser = auth.currentUser;
  if (firebaseUser) {
    headers.Authorization = `Bearer ${await firebaseUser.getIdToken(false)}`;
  } else if (currentUser) {
    headers['x-staff-uid'] = currentUser.id;
    headers['x-staff-role'] = currentUser.role;
    headers['x-staff-branch-id'] = currentUser.branchId || '';
  }
  const response = await fetch(`/api/inventory/${endpoint}`, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(payload || {}) : undefined
  });
  const result = await response.json().catch(() => ({ success: false, error: `HTTP_${response.status}` })) as ApiEnvelope<T>;
  if (!response.ok || !result.success || !result.data) throw new Error(result.error || result.message || `Yêu cầu kho thất bại (HTTP ${response.status}).`);
  return result.data;
}

export function createInventoryIdempotencyKey(scope: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${scope}:${suffix}`;
}

export async function fetchInventoryDevices(currentUser?: UserAccount): Promise<{ devices: DeviceItem[]; snapshotAt: string }> {
  return sendInventoryRequest('devices', 'GET', undefined, currentUser);
}

export async function requestImportInventoryDevices(
  payload: {
    branchId: string;
    locationId: string;
    sourceType: 'PURCHASE_ORDER' | 'TRADE_IN' | 'MANUAL_IMPORT' | 'POS_TRADE_IN' | 'DATA_MIGRATION';
    sourceId: string;
    idempotencyKey: string;
    devices: DeviceItem[];
  },
  currentUser?: UserAccount
): Promise<{ devices: DeviceItem[]; importedCount: number; idempotentReplay?: boolean }> {
  return sendInventoryRequest('devices/import', 'POST', payload, currentUser);
}

export async function requestReceivePurchaseOrder(
  order: PurchaseOrder,
  currentUser?: UserAccount
): Promise<{ order: PurchaseOrder; devices: DeviceItem[]; importedCount: number; idempotentReplay?: boolean }> {
  return sendInventoryRequest('purchase-orders/receive', 'POST', { order }, currentUser);
}

export async function fetchInventoryAudit(currentUser?: UserAccount): Promise<{
  dryRun: true;
  generatedAt: string;
  issueCount: number;
  counts: Record<string, number>;
  issues: Array<Record<string, any>>;
}> {
  return sendInventoryRequest('audit', 'GET', undefined, currentUser);
}
