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
  method: 'GET' | 'POST' | 'PATCH',
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
    body: method === 'GET' ? undefined : JSON.stringify(payload || {})
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

export async function requestUpdateInventoryDeviceMetadata(
  device: DeviceItem,
  currentUser?: UserAccount
): Promise<DeviceItem> {
  const result = await sendInventoryRequest<{ device: DeviceItem }>(
    `devices/${encodeURIComponent(device.id)}/metadata`,
    'PATCH',
    device as unknown as Record<string, any>,
    currentUser
  );
  return result.device;
}

export interface InventoryDeviceSummary {
  totalCount: number;
  availableCount: number;
  reservedCount: number;
  technicalCount: number;
  inTransitCount: number;
  soldCount: number;
}

export interface InventoryDevicePage {
  devices: DeviceItem[];
  nextCursor: string | null;
  hasMore: boolean;
  snapshotAt: string;
  summary?: InventoryDeviceSummary;
}

export interface InventoryAccessoryBalanceRow {
  id: string;
  productId: string;
  productMasterId?: string | null;
  sku: string;
  name: string;
  category: string;
  catalogGroupCode?: string | null;
  catalogModelCode?: string | null;
  brand?: string | null;
  branchId?: string | null;
  warehouseId?: string | null;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  sellPrice: number;
  minStockLevel: number;
  status: string;
  compatibleModels?: string[];
  currentCost?: number;
}

export interface InventoryAccessoryTrace {
  product: Record<string, any>;
  balances: Array<Record<string, any>>;
  movements: Array<{
    id: string;
    type: string;
    occurredAt?: string | null;
    quantity?: number;
    warehouseName?: string | null;
    counterpartyWarehouseName?: string | null;
    sourceCode?: string | null;
    sourceId?: string | null;
    actorName?: string | null;
    imei?: string | null;
    note?: string | null;
    status?: string | null;
    legacyDerived?: boolean;
  }>;
  notice?: string;
}

export async function fetchInventoryDevicePage(
  options: {
    limit?: number;
    cursor?: string;
    branchId?: string;
    locationId?: string;
    status?: string;
    search?: string;
    includeSummary?: boolean;
  } = {},
  currentUser?: UserAccount
): Promise<InventoryDevicePage> {
  const params = new URLSearchParams();
  params.set('limit', String(Math.min(500, Math.max(1, options.limit || 100))));
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.branchId) params.set('branchId', options.branchId);
  if (options.locationId) params.set('locationId', options.locationId);
  if (options.status) params.set('status', options.status);
  if (options.search) params.set('search', options.search);
  params.set('includeSummary', options.includeSummary === false ? 'false' : 'true');
  return sendInventoryRequest(`devices?${params.toString()}`, 'GET', undefined, currentUser);
}

export async function fetchInventoryDevices(currentUser?: UserAccount): Promise<{
  devices: DeviceItem[];
  snapshotAt: string;
  summary?: InventoryDeviceSummary;
}> {
  const devicesById = new Map<string, DeviceItem>();
  let cursor: string | undefined;
  let summary: InventoryDeviceSummary | undefined;
  let snapshotAt = new Date().toISOString();
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const page = await fetchInventoryDevicePage({ limit: 500, cursor, includeSummary: pageNumber === 0 }, currentUser);
    page.devices.forEach(device => devicesById.set(device.id, device));
    if (pageNumber === 0) summary = page.summary;
    snapshotAt = page.snapshotAt || snapshotAt;
    if (!page.hasMore || !page.nextCursor) return { devices: [...devicesById.values()], snapshotAt, summary };
    cursor = page.nextCursor;
  }
  throw new Error('INVENTORY_PAGINATION_LIMIT_EXCEEDED: Dữ liệu vượt 50.000 máy; cần lọc theo chi nhánh hoặc kho.');
}

export async function fetchInventoryAccessoryBalances(
  currentUser?: UserAccount,
  warehouseId?: string
): Promise<InventoryAccessoryBalanceRow[]> {
  const params = new URLSearchParams();
  if (warehouseId) params.set('warehouseId', warehouseId);
  const query = params.toString();
  return sendInventoryRequest(`stock-items/accessories${query ? `?${query}` : ''}`, 'GET', undefined, currentUser);
}

export async function fetchInventoryAccessoryTrace(
  productId: string,
  currentUser?: UserAccount
): Promise<InventoryAccessoryTrace> {
  return sendInventoryRequest(`stock-items/accessories/${encodeURIComponent(productId)}/trace`, 'GET', undefined, currentUser);
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

export async function requestCancelPurchaseOrder(
  orderId: string,
  reason: string,
  currentUser?: UserAccount
): Promise<{ order: PurchaseOrder; removedDeviceIds: string[]; idempotentReplay?: boolean }> {
  return sendInventoryRequest(`purchase-orders/${encodeURIComponent(orderId)}/cancel`, 'POST', { reason }, currentUser);
}

export async function requestPayPurchaseOrderDebt(
  orderId: string,
  paymentAllocations: Array<{ fundId: string; method: 'CASH' | 'BANK_TRANSFER'; amount: number }>,
  note: string,
  currentUser?: UserAccount,
  idempotencyKey?: string
): Promise<{ order: PurchaseOrder; paymentTransactionIds: string[]; idempotentReplay?: boolean }> {
  return sendInventoryRequest(`purchase-orders/${encodeURIComponent(orderId)}/payments`, 'POST', {
    paymentAllocations,
    note,
    idempotencyKey: idempotencyKey || createInventoryIdempotencyKey(`purchase-payment:${orderId}`)
  }, currentUser);
}

export async function requestUpdatePurchaseOrderNote(
  orderId: string,
  note: string,
  currentUser?: UserAccount
): Promise<PurchaseOrder> {
  const result = await sendInventoryRequest<{ order: PurchaseOrder }>(
    `purchase-orders/${encodeURIComponent(orderId)}/note`, 'PATCH', { note }, currentUser
  );
  return result.order;
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
