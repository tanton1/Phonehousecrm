import { 
  collection, 
  doc, 
  onSnapshot, 
  query,
  where,
  or
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { apiJson } from './apiClient';
import { 
  DeviceItem, 
  Lead, 
  TradeInAppraisal, 
  SalesInvoice, 
  UserAccount, 
  Partner, 
  FundAccount, 
  CashTransaction, 
  StockTransferSlip, 
  ProductItem,
  StoreBranch,
  WarehouseInfo,
  StoreSettings,
  PurchaseOrder,
  AttendanceRecord,
  ShiftHandoverReport,
  SOPTemplateItem,
  DailyShiftChecklistItem,
  LeaveRequest,
  StaffMember,
} from '../types';
import { RepairServiceItem } from '../data/initialData';
import { invoiceDateTime } from '../utils/dateValue';

// Firestore Collection Names Constants
const LEADS_COL = 'leads';
const TRADEINS_COL = 'tradeIns';
const INVOICES_COL = 'invoices';
const USERS_COL = 'users';
const PARTNERS_COL = 'partners';
const TRANSFERS_COL = 'transfers';
const BRANCHES_COL = 'branches';
const WAREHOUSES_COL = 'warehouses';
const SETTINGS_COL = 'storeSettings';
const FUNDS_COL = 'funds';
const CASH_TRANSACTIONS_COL = 'cashTransactions';
const REPAIR_SERVICES_COL = 'repairServices';
const PURCHASE_ORDERS_COL = 'purchaseOrders';
const ATTENDANCE_COL = 'attendance';
const SHIFT_HANDOVER_COL = 'shiftHandover';
const SOP_TEMPLATES_COL = 'sopTemplates';
const DAILY_CHECKLISTS_COL = 'dailyShiftChecklists';
const LEAVE_REQUESTS_COL = 'leaveRequests';
const STAFF_MEMBERS_COL = 'staffMembers';

function concreteRealtimeBranchId(value: unknown): string | null {
  const branchId = String(value || '').trim();
  return branchId && branchId !== 'ALL' ? branchId : null;
}
function emptySubscription<T>(onData: (items: T[]) => void) {
  onData([]);
  return () => undefined;
}

// Helper to strip undefined values so Firestore setDoc does not throw
export function cleanDataForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => cleanDataForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleaned[key] = cleanDataForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return data;
}

// ----------------- LEADS -----------------
export function subscribeToLeads(onData: (leads: Lead[]) => void, branchId?: string) {
  const colRef = collection(db, LEADS_COL);
  const concreteBranchId = concreteRealtimeBranchId(branchId);
  if (!concreteBranchId) return emptySubscription(onData);
  const scoped = query(colRef, where('branchId', '==', concreteBranchId));
  return onSnapshot(
    scoped,
    (snapshot) => {
      const items: Lead[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as Lead);
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, LEADS_COL);
    }
  );
}

// ----------------- TRADE IN -----------------
export function subscribeToTradeIns(onData: (tradeIns: TradeInAppraisal[]) => void, branchId?: string) {
  const colRef = collection(db, TRADEINS_COL);
  const concreteBranchId = concreteRealtimeBranchId(branchId);
  if (!concreteBranchId) return emptySubscription(onData);
  const scoped = query(colRef, where('branchId', '==', concreteBranchId));
  return onSnapshot(
    scoped,
    (snapshot) => {
      const items: TradeInAppraisal[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as TradeInAppraisal);
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, TRADEINS_COL);
    }
  );
}

// ----------------- INVOICES -----------------
export function subscribeToInvoices(onData: (invoices: SalesInvoice[]) => void, branchId?: string) {
  const colRef = collection(db, INVOICES_COL);
  const concreteBranchId = concreteRealtimeBranchId(branchId);
  if (!concreteBranchId) return emptySubscription(onData);
  const scoped = query(colRef, where('branchId', '==', concreteBranchId));
  return onSnapshot(
    scoped,
    (snapshot) => {
      const items: SalesInvoice[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as any;
        items.push({
          ...data,
          id: data.id || doc.id,
          // Server writes use FieldValue.serverTimestamp(). Normalize it at the
          // client boundary so every invoice view receives a safe ISO string.
          createdAt: invoiceDateTime(data.createdAt, data.createdDate || '')
        } as SalesInvoice);
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, INVOICES_COL);
    }
  );
}

// ----------------- USERS & PERMISSIONS -----------------
export function subscribeToUsers(onData: (users: UserAccount[]) => void, userId?: string, branchId?: string) {
  const colRef = collection(db, USERS_COL);
  if (userId) {
    return onSnapshot(doc(db, USERS_COL, userId), snapshot => {
      onData(snapshot.exists() ? [{ ...snapshot.data(), id: snapshot.id } as UserAccount] : []);
    }, error => handleFirestoreError(error, OperationType.GET, `${USERS_COL}/${userId}`));
  }
  const concreteBranchId = concreteRealtimeBranchId(branchId);
  if (!concreteBranchId) return emptySubscription(onData);
  const scoped = query(colRef, where('branchId', '==', concreteBranchId));
  return onSnapshot(
    scoped,
    (snapshot) => {
      const items: UserAccount[] = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as UserAccount[];
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, USERS_COL);
    }
  );
}

// ----------------- PARTNERS (CUSTOMERS & SUPPLIERS) -----------------
export function subscribeToPartners(onData: (partners: Partner[]) => void, branchId?: string) {
  const colRef = collection(db, PARTNERS_COL);
  const concreteBranchId = concreteRealtimeBranchId(branchId);
  if (!concreteBranchId) return emptySubscription(onData);
  const scoped = query(colRef, where('branchId', '==', concreteBranchId));
  return onSnapshot(
    scoped,
    (snapshot) => {
      const items: Partner[] = [];
      snapshot.forEach((doc) => {
        // The Firestore document ID is authoritative. Legacy records can carry
        // a stale embedded `id`; letting it win would make the form submit a
        // different supplier document than the one shown on screen.
        const partner = { ...doc.data(), id: doc.id } as Partner & { isActive?: boolean; isArchived?: boolean };
        if (partner.isActive !== false && partner.isArchived !== true) items.push(partner);
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, PARTNERS_COL);
    }
  );
}

export async function addPartnerToFirestore(partner: Partner) {
  const response = await apiJson<{ success: boolean; partner: Partner }>('/api/partners', {
    method: 'POST',
    body: JSON.stringify(partner)
  });
  return response.partner;
}
export async function fetchLegacyUnassignedPartners(type: 'SUPPLIER' | 'CUSTOMER' = 'SUPPLIER') {
  const response = await apiJson<{ success: boolean; partners: Partner[] }>(
    `/api/partners/legacy-unassigned?type=${encodeURIComponent(type)}&limit=200`,
    { method: 'GET' }
  );
  return response.partners || [];
}
export async function updatePartnerInFirestore(partner: Partner) {
  const response = await apiJson<{ success: boolean; partner: Partner }>(`/api/partners/${encodeURIComponent(partner.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(partner)
  });
  return response.partner;
}

export async function deletePartnerFromFirestore(id: string) {
  return apiJson<{ success: boolean }>(`/api/partners/${encodeURIComponent(id)}/archive`, { method: 'POST' });
}

export function subscribeToFunds(onData: (funds: FundAccount[]) => void, branchId?: string) {
  const colRef = collection(db, FUNDS_COL);
  const concreteBranchId = concreteRealtimeBranchId(branchId);
  if (!concreteBranchId) return emptySubscription(onData);
  const scoped = query(colRef, where('branchId', '==', concreteBranchId));
  return onSnapshot(scoped, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as FundAccount);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, FUNDS_COL));
}

export async function addFundToFirestore(fund: FundAccount) {
  const response = await apiJson<{ success: boolean; account: FundAccount }>('/api/finance/accounts', {
    method: 'POST',
    body: JSON.stringify(fund)
  });
  return response.account;
}

export async function updateFundInFirestore(fund: FundAccount) {
  const response = await apiJson<{ success: boolean; account: FundAccount }>(`/api/finance/accounts/${encodeURIComponent(fund.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(fund)
  });
  return response.account;
}

export async function deleteFundFromFirestore(id: string) {
  return apiJson<{ success: boolean }>(`/api/finance/accounts/${encodeURIComponent(id)}/archive`, {
    method: 'POST'
  });
}

export function subscribeToCashTransactions(onData: (txs: CashTransaction[]) => void, branchId?: string) {
  const colRef = collection(db, CASH_TRANSACTIONS_COL);
  const concreteBranchId = concreteRealtimeBranchId(branchId);
  if (!concreteBranchId) return emptySubscription(onData);
  const scoped = query(colRef, where('branchId', '==', concreteBranchId));
  return onSnapshot(scoped, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as CashTransaction);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, CASH_TRANSACTIONS_COL));
}

export async function addCashTransactionToFirestore(tx: CashTransaction) {
  if (!tx.branchId || tx.branchId === 'ALL' || !tx.fundId) {
    throw new Error('Giao dịch phải có tài khoản và chi nhánh hợp lệ.');
  }
  const endpoint = tx.type === 'RECEIPT' ? '/api/finance/receipt' : '/api/finance/payment';
  const response = await apiJson<{ success: boolean; transaction: CashTransaction }>(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      fundId: tx.fundId,
      amount: tx.amount,
      partnerId: tx.partnerId,
      partnerName: tx.partnerName,
      partnerType: tx.partnerType,
      category: tx.category,
      categoryName: tx.categoryName,
      notes: tx.notes,
      branchId: tx.branchId,
      isPLAccounted: tx.isPLAccounted,
      idempotencyKey: tx.id
    })
  });
  if (!response.success || !response.transaction) {
    throw new Error('Máy chủ không trả về chứng từ thu/chi.');
  }
  return response.transaction;
}

// ----------------- TRANSFERS -----------------
export function subscribeToTransfers(onData: (transfers: StockTransferSlip[]) => void, branchId?: string) {
  const colRef = collection(db, TRANSFERS_COL);
  const concreteBranchId = concreteRealtimeBranchId(branchId);
  if (!concreteBranchId) return emptySubscription(onData);
  const scoped = query(colRef, or(where('sourceBranchId', '==', concreteBranchId), where('destinationBranchId', '==', concreteBranchId)));
  return onSnapshot(scoped, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as StockTransferSlip);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, TRANSFERS_COL));
}

// ----------------- FUND TRANSFER EXECUTION (ATOMIC BATCH) -----------------
export async function executeFundTransferInFirestore(
  fromFund: FundAccount,
  toFund: FundAccount,
  amount: number,
  notes: string,
  creator: string = 'Nhật Tân (Admin)'
): Promise<{ txOut: CashTransaction; txIn: CashTransaction }> {
  if (!fromFund.branchId || fromFund.branchId === 'ALL' || !toFund.branchId || toFund.branchId === 'ALL') {
    throw new Error('Hai tài khoản chuyển quỹ phải được định danh theo chi nhánh.');
  }

  const data = await apiJson<{ success: boolean; txOut: CashTransaction; txIn: CashTransaction }>('/api/finance/transfer', {
    method: 'POST',
    body: JSON.stringify({
      fromFundId: fromFund.id,
      toFundId: toFund.id,
      amount,
      notes,
      idempotencyKey: `fund-transfer-${Date.now()}-${fromFund.id}-${toFund.id}`
    })
  });

  if (!data.success || !data.txOut || !data.txIn) {
    throw new Error('Máy chủ không trả về đầy đủ chứng từ chuyển quỹ.');
  }
  return { txOut: data.txOut, txIn: data.txIn };
}

// ----------------- BRANCHES (CỬA HÀNG / CHI NHÁNH) -----------------
export function subscribeToBranches(onData: (branches: StoreBranch[]) => void) {
  const colRef = collection(db, BRANCHES_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs
      .map(doc => doc.data() as StoreBranch & { isArchived?: boolean })
      .filter(branch => branch.isActive !== false && branch.isArchived !== true);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, BRANCHES_COL));
}

export async function addBranchToFirestore(branch: StoreBranch, existingBranches: StoreBranch[] = []) {
  void existingBranches;
  const response = await apiJson<{ success: boolean; branch: StoreBranch }>('/api/configuration/branches', {
    method: 'POST',
    body: JSON.stringify(branch)
  });
  return response.branch;
}

export async function updateBranchInFirestore(branch: StoreBranch, existingBranches: StoreBranch[] = []) {
  void existingBranches;
  const response = await apiJson<{ success: boolean; branch: StoreBranch }>(`/api/configuration/branches/${encodeURIComponent(branch.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(branch)
  });
  return response.branch;
}

export async function deleteBranchFromFirestore(id: string) {
  return apiJson<{ success: boolean }>(`/api/configuration/branches/${encodeURIComponent(id)}/archive`, { method: 'POST' });
}

// ----------------- WAREHOUSES (KHO HÀNG) -----------------
export function subscribeToWarehouses(onData: (warehouses: WarehouseInfo[]) => void) {
  const colRef = collection(db, WAREHOUSES_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as WarehouseInfo));
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, WAREHOUSES_COL));
}

export async function addWarehouseToFirestore(warehouse: WarehouseInfo) {
  const response = await apiJson<{ success: boolean; warehouse: WarehouseInfo }>('/api/configuration/warehouses', {
    method: 'POST',
    body: JSON.stringify(warehouse)
  });
  return response.warehouse;
}

export async function updateWarehouseInFirestore(warehouse: WarehouseInfo) {
  const response = await apiJson<{ success: boolean; warehouse: WarehouseInfo }>(`/api/configuration/warehouses/${encodeURIComponent(String(warehouse.id))}`, {
    method: 'PATCH',
    body: JSON.stringify(warehouse)
  });
  return response.warehouse;
}

export async function deleteWarehouseFromFirestore(id: string) {
  return apiJson<{ success: boolean }>(`/api/configuration/warehouses/${encodeURIComponent(id)}/archive`, {
    method: 'POST'
  });
}

export async function restoreWarehouseFromFirestore(id: string) {
  const response = await apiJson<{ success: boolean; warehouse: WarehouseInfo }>(`/api/configuration/warehouses/${encodeURIComponent(id)}/restore`, {
    method: 'POST'
  });
  return response.warehouse;
}

// ----------------- STORE SETTINGS (CÀI ĐẶT DOANH NGHIỆP) -----------------
export function subscribeToStoreSettings(onData: (settings: StoreSettings | null) => void) {
  const docRef = doc(db, SETTINGS_COL, 'main');
  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      onData(snapshot.data() as StoreSettings);
    } else {
      onData(null);
    }
  }, (error) => handleFirestoreError(error, OperationType.GET, `${SETTINGS_COL}/main`));
}

export async function saveStoreSettingsToFirestore(settings: StoreSettings) {
  const response = await apiJson<{ success: boolean; settings: StoreSettings }>('/api/configuration/store-settings', {
    method: 'PUT',
    body: JSON.stringify(settings)
  });
  return response.settings;
}


// ----------------- REPAIR SERVICES (BẢNG GIÁ DỊCH VỤ SỬA CHỮA) -----------------
export function subscribeToRepairServices(onData: (items: RepairServiceItem[]) => void) {
  const colRef = collection(db, REPAIR_SERVICES_COL);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: RepairServiceItem[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as RepairServiceItem);
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, REPAIR_SERVICES_COL);
    }
  );
}

export async function processCheckoutTransaction(params: {
  invoice: SalesInvoice;
  devicesToSell: DeviceItem[];
  accessoriesToSell: { product: ProductItem; quantity: number }[];
  /** @deprecated Server checkout creates the canonical receipt. Ignored. */
  cashTx?: CashTransaction | null;
  warehouseId: string;
  tradeInAppraisalId?: string;
  tradeInDevice?: DeviceItem | null;
  customerPartner?: Partner | null;
  financeCompanyPartner?: Partner | null;
  /** @deprecated Server checkout updates the canonical fund balance. Ignored. */
  fundToUpdate?: FundAccount | null;
  payments?: Array<{
    method: 'CASH' | 'BANK' | 'CARD' | 'INSTALLMENT' | 'DEBT';
    amount: number;
    fundId?: string;
    bankName?: string;
    accountNumber?: string;
  }>;
  idempotencyKey?: string;
  commissionTagSelections?: Array<{
    itemType: 'DEVICE' | 'ACCESSORY';
    itemId: string;
    tagIds: string[];
  }>;
  priceAdjustments?: Array<{
    itemType: 'DEVICE' | 'ACCESSORY';
    itemId: string;
    unitPrice: number;
    reason?: string;
  }>;
}) {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  }
  headers['x-staff-uid'] = auth.currentUser?.uid || 'staff-pos';
  headers['x-staff-role'] = 'SALES';
  if (!params.invoice.branchId) throw new Error('BRANCH_REQUIRED: Hóa đơn chưa có chi nhánh.');
  headers['x-staff-branch-id'] = params.invoice.branchId;

  const payload = {
    idempotencyKey: params.idempotencyKey || `POS-${params.invoice.id}-${Date.now()}`,
    branchId: params.invoice.branchId,
    warehouseId: params.warehouseId,
    deviceIds: params.devicesToSell.map(d => d.id),
    accessoryLines: params.accessoriesToSell.map(a => ({
      productId: a.product.id,
      quantity: a.quantity
    })),
    commissionTagSelections: params.commissionTagSelections || [],
    priceAdjustments: params.priceAdjustments || [],
    customerId: params.customerPartner?.id,
    customerName: params.invoice.customerName,
    customerPhone: params.invoice.customerPhone || params.invoice.phone,
    payment: {
      method: params.invoice.paymentMethod?.includes('Trả góp') ? 'INSTALLMENT' : params.invoice.paymentMethod?.includes('QR') ? 'BANK' : params.invoice.paymentMethod?.includes('thẻ') ? 'CARD' : 'CASH',
      fundId: params.invoice.paymentFundId,
      downPayment: params.invoice.downPayment || 0,
      installmentFinancePartnerId: params.financeCompanyPartner?.id
    },
    payments: params.payments || (params.invoice.splitPayments as any),
    installmentFinancePartnerId: params.financeCompanyPartner?.id,
    notes: params.invoice.notes,
    tradeInAppraisalId: params.tradeInAppraisalId,
    invoice: cleanDataForFirestore(params.invoice),
    tradeInDevice: params.tradeInDevice ? cleanDataForFirestore(params.tradeInDevice) : null,
    devicesToSell: params.devicesToSell,
    accessoriesToSell: params.accessoriesToSell,
    customerPartner: params.customerPartner ? cleanDataForFirestore(params.customerPartner) : null,
    financeCompanyPartner: params.financeCompanyPartner ? cleanDataForFirestore(params.financeCompanyPartner) : null
  };

  const response = await fetch('/api/pos/checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || `Thanh toán thất bại (Mã lỗi: ${response.status})`);
  }

  return result.data;
}

// ----------------- INVOICE CANCELLATION & REFUND ATOMIC REVERSAL -----------------
export async function cancelInvoiceInFirestore(params: {
  invoiceId: string;
  branchId: string;
  cancelledBy: string;
  reason: string;
  devicesToRestore: DeviceItem[];
  accessoriesToRestore: { product: ProductItem; quantity: number }[];
  refundTx: CashTransaction | null;
  fundToDeduct: FundAccount | null;
  customerPartner: Partner | null;
}) {
  return apiJson<{ success: boolean; data: { invoiceId: string; refundTransaction: CashTransaction | null; restoredDeviceIds: string[] } }>('/api/pos/refund', {
    method: 'POST',
    body: JSON.stringify({
      invoiceId: params.invoiceId,
      branchId: params.branchId,
      fundId: params.fundToDeduct?.id || '',
      reason: params.reason,
      idempotencyKey: `refund-${params.invoiceId}`
    })
  });
}

// ----------------- ATOMIC FUND TRANSFER & LEDGER ENTRY -----------------
export async function transferFundsInFirestore(params: {
  fromFundId: string;
  toFundId: string;
  fromFundName: string;
  toFundName: string;
  amount: number;
  note: string;
  transferredBy: string;
  branchId?: string;
  branchName?: string;
}) {
  const data = await apiJson<{ success: boolean; txOut: CashTransaction; txIn: CashTransaction }>('/api/finance/transfer', {
    method: 'POST',
    body: JSON.stringify({
      fromFundId: params.fromFundId,
      toFundId: params.toFundId,
      amount: params.amount,
      notes: params.note,
      idempotencyKey: `fund-transfer-${Date.now()}-${params.fromFundId}-${params.toFundId}`
    })
  });
  if (!data.success || !data.txOut || !data.txIn) {
    throw new Error('Máy chủ không trả về đầy đủ chứng từ chuyển quỹ.');
  }
  return { txOut: data.txOut, txIn: data.txIn };
}

// ----------------- PURCHASE ORDERS -----------------
export function subscribeToPurchaseOrders(onData: (orders: PurchaseOrder[]) => void, branchId?: string) {
  const colRef = collection(db, PURCHASE_ORDERS_COL);
  const concreteBranchId = concreteRealtimeBranchId(branchId);
  if (!concreteBranchId) return emptySubscription(onData);
  const scoped = query(colRef, where('branchId', '==', concreteBranchId));
  return onSnapshot(scoped, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as PurchaseOrder);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, PURCHASE_ORDERS_COL));
}

// ----------------- ATTENDANCE (CHẤM CÔNG 4 YẾU TỐ) -----------------
export function subscribeToAttendance(
  onData: (records: AttendanceRecord[]) => void,
  userScope?: { uid?: string; role?: string; branchId?: string } | null,
  onError?: (error: any) => void
) {
  const colRef = collection(db, ATTENDANCE_COL);
  let attendanceQuery: any = colRef;

  // Role-based query scoping to comply with Firestore Security Rules
  if (userScope && userScope.role) {
    if (userScope.branchId && userScope.branchId !== 'ALL' && ['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'].includes(userScope.role)) {
      attendanceQuery = query(colRef, where('branchId', '==', userScope.branchId));
    } else if (userScope.role !== 'ADMIN' && userScope.uid) {
      attendanceQuery = query(colRef, where('staffId', '==', userScope.uid));
    }
  }

  return onSnapshot(
    attendanceQuery,
    (snapshot: any) => {
      const data = snapshot.docs.map((doc: any) => ({
        ...doc.data(),
        id: doc.id
      })) as AttendanceRecord[];
      onData(data);
    },
    (error) => {
      const errInfo = handleFirestoreError(error, OperationType.LIST, ATTENDANCE_COL);
      onError?.(errInfo);
    }
  );
}

// ----------------- SHIFT HANDOVER (BÀN GIAO CA TRỰC) -----------------
export function subscribeToShiftHandovers(
  onData: (reports: ShiftHandoverReport[]) => void,
  scope?: { role?: string; branchId?: string } | null
) {
  const colRef = collection(db, SHIFT_HANDOVER_COL);
  const branchId = String(scope?.branchId || '').trim();
  if (!branchId || branchId === 'ALL') {
    onData([]);
    return () => undefined;
  }
  const scoped = branchId
    ? query(colRef, where('branchId', '==', scope.branchId))
    : colRef;
  return onSnapshot(scoped, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as ShiftHandoverReport);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, SHIFT_HANDOVER_COL));
}

// ----------------- SOP TEMPLATES (QUY TRÌNH CHUẨN SOP) -----------------
export function subscribeToSOPTemplates(onData: (templates: SOPTemplateItem[]) => void) {
  const colRef = collection(db, SOP_TEMPLATES_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as SOPTemplateItem);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, SOP_TEMPLATES_COL));
}

// ----------------- DAILY SHIFT CHECKLISTS -----------------
export function subscribeToDailyChecklists(
  onData: (items: DailyShiftChecklistItem[]) => void,
  scope?: { uid?: string; role?: string; branchId?: string } | null
) {
  const colRef = collection(db, DAILY_CHECKLISTS_COL);
  const role = String(scope?.role || '').toUpperCase();
  const elevated = ['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'].includes(role);
  const branchId = String(scope?.branchId || '').trim();
  if (elevated && (!branchId || branchId === 'ALL')) {
    onData([]);
    return () => undefined;
  }
  const scoped = scope?.uid && !elevated
    ? query(colRef, where('staffId', '==', scope.uid))
    : branchId
      ? query(colRef, where('branchId', '==', branchId))
      : colRef;
  return onSnapshot(scoped, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as DailyShiftChecklistItem);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, DAILY_CHECKLISTS_COL));
}

// ----------------- LEAVE REQUESTS -----------------
export function subscribeToLeaveRequests(
  onData: (requests: LeaveRequest[]) => void,
  userScope?: { uid?: string; role?: string; branchId?: string } | null,
  onError?: (error: any) => void
) {
  const colRef = collection(db, LEAVE_REQUESTS_COL);
  const role = String(userScope?.role || '').toUpperCase();
  const scopedQuery = userScope?.uid && !['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'].includes(role)
    ? query(colRef, where('staffId', '==', userScope.uid))
    : userScope?.branchId && userScope.branchId !== 'ALL'
      ? query(colRef, where('branchId', '==', userScope.branchId))
      : colRef;
  return onSnapshot(scopedQuery, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as LeaveRequest));
    onData(data);
  }, (error) => {
    const info = handleFirestoreError(error, OperationType.LIST, LEAVE_REQUESTS_COL);
    onError?.(info);
  });
}
export const FIRESTORE_REALTIME_SCOPE_POLICY = 'BRANCH_REQUIRED' as const;
