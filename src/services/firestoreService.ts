import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  updateDoc,
  deleteDoc, 
  onSnapshot, 
  getDocs,
  writeBatch,
  increment,
  arrayUnion,
  query,
  where
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { apiJson } from './apiClient';
import { 
  DeviceItem, 
  Lead, 
  TradeInAppraisal, 
  WarrantyTicket, 
  WarrantyTicketPart,
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
  SparePart,
  ChatConversation,
  ChatMessage,
  PurchaseOrder,
  MasterCatalogItem,
  AttendanceRecord,
  ShiftHandoverReport,
  SOPTemplateItem,
  DailyShiftChecklistItem,
  LeaveRequest,
  StaffMember,
  WeeklyShiftSchedule,
  LeadCareActivity,
  LeadAppointment,
  LeadQuote
} from '../types';
import { RepairServiceItem } from '../data/initialData';

// Firestore Collection Names Constants
const DEVICES_COL = 'devices';
const LEADS_COL = 'leads';
const TRADEINS_COL = 'tradeIns';
const WARRANTY_COL = 'warrantyTickets';
const INVOICES_COL = 'invoices';
const USERS_COL = 'users';
const PARTNERS_COL = 'partners';
const PRODUCTS_COL = 'products';
const TRANSFERS_COL = 'transfers';
const BRANCHES_COL = 'branches';
const WAREHOUSES_COL = 'warehouses';
const SETTINGS_COL = 'storeSettings';
const SPARE_PARTS_COL = 'spareParts';
const FUNDS_COL = 'funds';
const CASH_TRANSACTIONS_COL = 'cashTransactions';
const REPAIR_SERVICES_COL = 'repairServices';
const CHAT_CONVERSATIONS_COL = 'chatConversations';
const PURCHASE_ORDERS_COL = 'purchaseOrders';
const CATALOG_COL = 'catalogItems';
const ATTENDANCE_COL = 'attendance';
const SHIFT_HANDOVER_COL = 'shiftHandover';
const SOP_TEMPLATES_COL = 'sopTemplates';
const DAILY_CHECKLISTS_COL = 'dailyShiftChecklists';
const LEAVE_REQUESTS_COL = 'leaveRequests';
const STAFF_MEMBERS_COL = 'staffMembers';
const WEEKLY_SCHEDULES_COL = 'weeklyShiftSchedules';
const LEAD_CARE_ACTIVITIES_COL = 'leadCareActivities';
const LEAD_APPOINTMENTS_COL = 'leadAppointments';
const LEAD_QUOTES_COL = 'leadQuotes';

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

// Function to wipe all transaction & demo collections in Firestore
export async function clearAllFirestoreDemoData(): Promise<void> {
  const collectionsToWipe = [
    DEVICES_COL,
    LEADS_COL,
    TRADEINS_COL,
    WARRANTY_COL,
    INVOICES_COL,
    PARTNERS_COL,
    TRANSFERS_COL,
    PRODUCTS_COL,
    CASH_TRANSACTIONS_COL,
    SPARE_PARTS_COL,
    CHAT_CONVERSATIONS_COL
  ];

  for (const colName of collectionsToWipe) {
    try {
      const snap = await getDocs(collection(db, colName));
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }
    } catch (e) {
      console.warn(`Could not clear collection ${colName}:`, e);
    }
  }
}

// ----------------- DEVICES -----------------
export function subscribeToDevices(onData: (devices: DeviceItem[]) => void) {
  const colRef = collection(db, DEVICES_COL);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: DeviceItem[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as DeviceItem);
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, DEVICES_COL);
    }
  );
}

export async function addDeviceToFirestore(device: DeviceItem) {
  const path = `${DEVICES_COL}/${device.id}`;
  try {
    const docRef = doc(db, DEVICES_COL, device.id);
    await setDoc(docRef, cleanDataForFirestore(device));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateDeviceInFirestore(device: DeviceItem) {
  const path = `${DEVICES_COL}/${device.id}`;
  try {
    const docRef = doc(db, DEVICES_COL, device.id);
    await setDoc(docRef, cleanDataForFirestore(device), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteDeviceFromFirestore(id: string) {
  const path = `${DEVICES_COL}/${id}`;
  try {
    const docRef = doc(db, DEVICES_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------- LEADS -----------------
export function subscribeToLeads(onData: (leads: Lead[]) => void) {
  const colRef = collection(db, LEADS_COL);
  return onSnapshot(
    colRef,
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

export async function addLeadToFirestore(lead: Lead) {
  const path = `${LEADS_COL}/${lead.id}`;
  try {
    const docRef = doc(db, LEADS_COL, lead.id);
    await setDoc(docRef, cleanDataForFirestore(lead));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateLeadInFirestore(lead: Lead) {
  const path = `${LEADS_COL}/${lead.id}`;
  try {
    const docRef = doc(db, LEADS_COL, lead.id);
    await setDoc(docRef, cleanDataForFirestore(lead), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ----------------- TRADE IN -----------------
export function subscribeToTradeIns(onData: (tradeIns: TradeInAppraisal[]) => void) {
  const colRef = collection(db, TRADEINS_COL);
  return onSnapshot(
    colRef,
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

export async function addTradeInToFirestore(tradeIn: TradeInAppraisal) {
  const path = `${TRADEINS_COL}/${tradeIn.id}`;
  try {
    const docRef = doc(db, TRADEINS_COL, tradeIn.id);
    await setDoc(docRef, cleanDataForFirestore(tradeIn));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTradeInInFirestore(tradeIn: TradeInAppraisal) {
  const path = `${TRADEINS_COL}/${tradeIn.id}`;
  try {
    const docRef = doc(db, TRADEINS_COL, tradeIn.id);
    await setDoc(docRef, cleanDataForFirestore(tradeIn), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ----------------- WARRANTY -----------------
export function subscribeToWarrantyTickets(onData: (tickets: WarrantyTicket[]) => void) {
  const colRef = collection(db, WARRANTY_COL);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: WarrantyTicket[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as WarrantyTicket);
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, WARRANTY_COL);
    }
  );
}

export async function addWarrantyTicketToFirestore(ticket: WarrantyTicket) {
  const path = `${WARRANTY_COL}/${ticket.id}`;
  try {
    const docRef = doc(db, WARRANTY_COL, ticket.id);
    await setDoc(docRef, cleanDataForFirestore(ticket));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

export async function updateWarrantyTicketInFirestore(ticket: WarrantyTicket) {
  const path = `${WARRANTY_COL}/${ticket.id}`;
  try {
    const docRef = doc(db, WARRANTY_COL, ticket.id);
    await setDoc(docRef, cleanDataForFirestore(ticket), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

// ----------------- INVOICES -----------------
export function subscribeToInvoices(onData: (invoices: SalesInvoice[]) => void) {
  const colRef = collection(db, INVOICES_COL);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: SalesInvoice[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as SalesInvoice);
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, INVOICES_COL);
    }
  );
}

export async function addInvoiceToFirestore(invoice: SalesInvoice) {
  const path = `${INVOICES_COL}/${invoice.id}`;
  try {
    const docRef = doc(db, INVOICES_COL, invoice.id);
    await setDoc(docRef, cleanDataForFirestore(invoice));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateInvoiceInFirestore(invoice: SalesInvoice) {
  const path = `${INVOICES_COL}/${invoice.id}`;
  try {
    const docRef = doc(db, INVOICES_COL, invoice.id);
    await setDoc(docRef, cleanDataForFirestore(invoice), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteInvoiceFromFirestore(id: string) {
  const path = `${INVOICES_COL}/${id}`;
  try {
    const docRef = doc(db, INVOICES_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------- USERS & PERMISSIONS -----------------
export function subscribeToUsers(onData: (users: UserAccount[]) => void) {
  const colRef = collection(db, USERS_COL);
  return onSnapshot(
    colRef,
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

export async function addUserToFirestore(user: UserAccount) {
  const path = `${USERS_COL}/${user.id}`;
  try {
    const docRef = doc(db, USERS_COL, user.id);
    await setDoc(docRef, cleanDataForFirestore(user));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUserInFirestore(user: UserAccount) {
  const path = `${USERS_COL}/${user.id}`;
  try {
    const docRef = doc(db, USERS_COL, user.id);
    await setDoc(docRef, cleanDataForFirestore(user), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteUserFromFirestore(id: string) {
  const path = `${USERS_COL}/${id}`;
  try {
    const docRef = doc(db, USERS_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------- PARTNERS (CUSTOMERS & SUPPLIERS) -----------------
export function subscribeToPartners(onData: (partners: Partner[]) => void) {
  const colRef = collection(db, PARTNERS_COL);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: Partner[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as Partner);
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, PARTNERS_COL);
    }
  );
}

export async function addPartnerToFirestore(partner: Partner) {
  const path = `${PARTNERS_COL}/${partner.id}`;
  try {
    const docRef = doc(db, PARTNERS_COL, partner.id);
    await setDoc(docRef, cleanDataForFirestore(partner));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

export async function updatePartnerInFirestore(partner: Partner) {
  const path = `${PARTNERS_COL}/${partner.id}`;
  try {
    const docRef = doc(db, PARTNERS_COL, partner.id);
    await setDoc(docRef, cleanDataForFirestore(partner), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deletePartnerFromFirestore(id: string) {
  const path = `${PARTNERS_COL}/${id}`;
  try {
    const docRef = doc(db, PARTNERS_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToFunds(onData: (funds: FundAccount[]) => void) {
  const colRef = collection(db, FUNDS_COL);
  return onSnapshot(colRef, (snapshot) => {
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

export function subscribeToCashTransactions(onData: (txs: CashTransaction[]) => void) {
  const colRef = collection(db, CASH_TRANSACTIONS_COL);
  return onSnapshot(colRef, (snapshot) => {
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
export function subscribeToTransfers(onData: (transfers: StockTransferSlip[]) => void) {
  const colRef = collection(db, TRANSFERS_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as StockTransferSlip);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, TRANSFERS_COL));
}

// ----------------- PRODUCTS (ACCESSORIES / PARTS) -----------------
export function subscribeToProducts(onData: (products: ProductItem[]) => void) {
  const colRef = collection(db, PRODUCTS_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as ProductItem);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, PRODUCTS_COL));
}

export async function addProductToFirestore(product: ProductItem) {
  const path = `${PRODUCTS_COL}/${product.id}`;
  try {
    const docRef = doc(db, PRODUCTS_COL, product.id);
    await setDoc(docRef, cleanDataForFirestore(product));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateProductInFirestore(product: ProductItem) {
  const path = `${PRODUCTS_COL}/${product.id}`;
  try {
    const docRef = doc(db, PRODUCTS_COL, product.id);
    await setDoc(docRef, cleanDataForFirestore(product), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProductFromFirestore(id: string) {
  const path = `${PRODUCTS_COL}/${id}`;
  try {
    const docRef = doc(db, PRODUCTS_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
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
    const data = snapshot.docs.map(doc => doc.data() as StoreBranch);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, BRANCHES_COL));
}

export async function addBranchToFirestore(branch: StoreBranch, existingBranches: StoreBranch[] = []) {
  const path = `${BRANCHES_COL}/${branch.id}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, BRANCHES_COL, branch.id), cleanDataForFirestore(branch));
    if (branch.isHeadquarter) {
      existingBranches.filter(item => item.isHeadquarter && item.id !== branch.id).forEach(item => {
        batch.set(doc(db, BRANCHES_COL, item.id), { isHeadquarter: false }, { merge: true });
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateBranchInFirestore(branch: StoreBranch, existingBranches: StoreBranch[] = []) {
  const path = `${BRANCHES_COL}/${branch.id}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, BRANCHES_COL, branch.id), cleanDataForFirestore(branch), { merge: true });
    if (branch.isHeadquarter) {
      existingBranches.filter(item => item.isHeadquarter && item.id !== branch.id).forEach(item => {
        batch.set(doc(db, BRANCHES_COL, item.id), { isHeadquarter: false }, { merge: true });
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteBranchFromFirestore(id: string) {
  const path = `${BRANCHES_COL}/${id}`;
  try {
    await deleteDoc(doc(db, BRANCHES_COL, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
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
export function subscribeToChatConversations(onData: (convos: ChatConversation[]) => void) {
  const q = collection(db, CHAT_CONVERSATIONS_COL);
  return onSnapshot(
    q,
    (snapshot) => {
      const convos: ChatConversation[] = [];
      snapshot.forEach((docSnap) => {
        convos.push({ id: docSnap.id, ...docSnap.data() } as ChatConversation);
      });
      // Sort by newest updatedAt
      convos.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      onData(convos);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, CHAT_CONVERSATIONS_COL)
  );
}

export async function createChatConversationInFirestore(convo: ChatConversation) {
  const convRef = doc(db, CHAT_CONVERSATIONS_COL, convo.id);
  try {
    await setDoc(convRef, cleanDataForFirestore(convo), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${CHAT_CONVERSATIONS_COL}/${convo.id}`);
  }
}

export async function sendMessageToChat(conversationId: string, message: ChatMessage) {
  const convRef = doc(db, CHAT_CONVERSATIONS_COL, conversationId);
  try {
    const docSnap = await getDoc(convRef);
    if (docSnap.exists()) {
      await updateDoc(convRef, {
        messages: arrayUnion(message),
        lastMessage: {
          content: message.content,
          sender: message.sender,
          timestamp: message.timestamp,
          unread: false
        },
        updatedAt: message.timestamp
      });
    } else {
      await setDoc(convRef, cleanDataForFirestore({
        id: conversationId,
        customerName: 'Khách hàng',
        customerPhone: '',
        channel: 'FACEBOOK',
        messages: [message],
        lastMessage: {
          content: message.content,
          sender: message.sender,
          timestamp: message.timestamp,
          unread: false
        },
        status: 'ACTIVE',
        updatedAt: message.timestamp
      }));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${CHAT_CONVERSATIONS_COL}/${conversationId}`);
  }
}

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
  try {
    await setDoc(doc(db, SETTINGS_COL, 'main'), cleanDataForFirestore(settings));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${SETTINGS_COL}/main`);
  }
}


// ----------------- SPARE PARTS -----------------
export function subscribeToSpareParts(onData: (parts: SparePart[]) => void) {
  const colRef = collection(db, SPARE_PARTS_COL);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: SparePart[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as SparePart);
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, SPARE_PARTS_COL);
    }
  );
}

export async function addSparePartToFirestore(part: SparePart) {
  const path = `${SPARE_PARTS_COL}/${part.id}`;
  try {
    const docRef = doc(db, SPARE_PARTS_COL, part.id);
    await setDoc(docRef, cleanDataForFirestore(part));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateSparePartInFirestore(part: SparePart) {
  const path = `${SPARE_PARTS_COL}/${part.id}`;
  try {
    const docRef = doc(db, SPARE_PARTS_COL, part.id);
    await setDoc(docRef, cleanDataForFirestore(part), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteSparePartFromFirestore(id: string) {
  const path = `${SPARE_PARTS_COL}/${id}`;
  try {
    const docRef = doc(db, SPARE_PARTS_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deductSparePartsStockForWarrantyTicket(partsUsed: WarrantyTicketPart[]) {
  if (!partsUsed || partsUsed.length === 0) return;
  const batch = writeBatch(db);
  for (const p of partsUsed) {
    if (p.id) {
      const partRef = doc(db, SPARE_PARTS_COL, p.id);
      batch.update(partRef, {
        stockQuantity: increment(-p.quantity)
      });
    }
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${SPARE_PARTS_COL}/deductStock`);
  }
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

export async function addRepairServiceToFirestore(item: RepairServiceItem) {
  const path = `${REPAIR_SERVICES_COL}/${item.id}`;
  try {
    const docRef = doc(db, REPAIR_SERVICES_COL, item.id);
    await setDoc(docRef, cleanDataForFirestore(item));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateRepairServiceInFirestore(item: RepairServiceItem) {
  const path = `${REPAIR_SERVICES_COL}/${item.id}`;
  try {
    const docRef = doc(db, REPAIR_SERVICES_COL, item.id);
    await setDoc(docRef, cleanDataForFirestore(item), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteRepairServiceFromFirestore(id: string) {
  const path = `${REPAIR_SERVICES_COL}/${id}`;
  try {
    const docRef = doc(db, REPAIR_SERVICES_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function processCheckoutTransaction(params: {
  invoice: SalesInvoice;
  devicesToSell: DeviceItem[];
  accessoriesToSell: { product: ProductItem; quantity: number }[];
  cashTx?: CashTransaction | null;
  tradeInDevice?: DeviceItem | null;
  customerPartner?: Partner | null;
  financeCompanyPartner?: Partner | null;
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
}) {
  const idToken = await auth.currentUser?.getIdToken().catch(() => null);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  }
  headers['x-staff-uid'] = auth.currentUser?.uid || 'staff-pos';
  headers['x-staff-role'] = 'SALES';
  headers['x-staff-branch-id'] = params.invoice.branchId || 'CN01';

  const payload = {
    idempotencyKey: params.idempotencyKey || `POS-${params.invoice.id}-${Date.now()}`,
    branchId: params.invoice.branchId || 'CN01',
    deviceIds: params.devicesToSell.map(d => d.id),
    accessoryLines: params.accessoriesToSell.map(a => ({
      productId: a.product.id,
      quantity: a.quantity
    })),
    commissionTagSelections: params.commissionTagSelections || [],
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
export function subscribeToPurchaseOrders(onData: (orders: PurchaseOrder[]) => void) {
  const colRef = collection(db, PURCHASE_ORDERS_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as PurchaseOrder);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, PURCHASE_ORDERS_COL));
}

export async function addPurchaseOrderToFirestore(order: PurchaseOrder) {
  const path = `${PURCHASE_ORDERS_COL}/${order.id}`;
  try {
    const docRef = doc(db, PURCHASE_ORDERS_COL, order.id);
    await setDoc(docRef, cleanDataForFirestore(order));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updatePurchaseOrderInFirestore(order: PurchaseOrder) {
  const path = `${PURCHASE_ORDERS_COL}/${order.id}`;
  try {
    const docRef = doc(db, PURCHASE_ORDERS_COL, order.id);
    await setDoc(docRef, cleanDataForFirestore(order), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deletePurchaseOrderFromFirestore(id: string) {
  const path = `${PURCHASE_ORDERS_COL}/${id}`;
  try {
    const docRef = doc(db, PURCHASE_ORDERS_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------- MASTER CATALOG -----------------
export function subscribeToCatalog(onData: (items: MasterCatalogItem[]) => void) {
  const colRef = collection(db, CATALOG_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as MasterCatalogItem);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, CATALOG_COL));
}

export async function addCatalogItemToFirestore(item: MasterCatalogItem) {
  const path = `${CATALOG_COL}/${item.id}`;
  try {
    const docRef = doc(db, CATALOG_COL, item.id);
    await setDoc(docRef, cleanDataForFirestore(item));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCatalogItemInFirestore(item: MasterCatalogItem) {
  const path = `${CATALOG_COL}/${item.id}`;
  try {
    const docRef = doc(db, CATALOG_COL, item.id);
    await setDoc(docRef, cleanDataForFirestore(item), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCatalogItemFromFirestore(id: string) {
  const path = `${CATALOG_COL}/${id}`;
  try {
    const docRef = doc(db, CATALOG_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
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
  if (userScope && userScope.role && userScope.role !== 'ADMIN' && userScope.role !== 'MANAGER') {
    if (userScope.uid) {
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

export async function addAttendanceRecordToFirestore(record: AttendanceRecord) {
  const path = `${ATTENDANCE_COL}/${record.id}`;
  try {
    const docRef = doc(db, ATTENDANCE_COL, record.id);
    await setDoc(docRef, cleanDataForFirestore(record));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

export async function updateAttendanceRecordInFirestore(record: AttendanceRecord) {
  const path = `${ATTENDANCE_COL}/${record.id}`;
  try {
    const docRef = doc(db, ATTENDANCE_COL, record.id);
    await setDoc(docRef, cleanDataForFirestore(record), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function deleteAttendanceRecordFromFirestore(id: string) {
  const path = `${ATTENDANCE_COL}/${id}`;
  try {
    const docRef = doc(db, ATTENDANCE_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}

// ----------------- SHIFT HANDOVER (BÀN GIAO CA TRỰC) -----------------
export function subscribeToShiftHandovers(onData: (reports: ShiftHandoverReport[]) => void) {
  const colRef = collection(db, SHIFT_HANDOVER_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as ShiftHandoverReport);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, SHIFT_HANDOVER_COL));
}

export async function addShiftHandoverToFirestore(report: ShiftHandoverReport) {
  const path = `${SHIFT_HANDOVER_COL}/${report.id}`;
  try {
    const docRef = doc(db, SHIFT_HANDOVER_COL, report.id);
    await setDoc(docRef, cleanDataForFirestore(report));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateShiftHandoverInFirestore(report: ShiftHandoverReport) {
  const path = `${SHIFT_HANDOVER_COL}/${report.id}`;
  try {
    const docRef = doc(db, SHIFT_HANDOVER_COL, report.id);
    await setDoc(docRef, cleanDataForFirestore(report), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ----------------- SOP TEMPLATES (QUY TRÌNH CHUẨN SOP) -----------------
export function subscribeToSOPTemplates(onData: (templates: SOPTemplateItem[]) => void) {
  const colRef = collection(db, SOP_TEMPLATES_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as SOPTemplateItem);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, SOP_TEMPLATES_COL));
}

export async function addSOPTemplateToFirestore(template: SOPTemplateItem) {
  const path = `${SOP_TEMPLATES_COL}/${template.id}`;
  try {
    const docRef = doc(db, SOP_TEMPLATES_COL, template.id);
    await setDoc(docRef, cleanDataForFirestore(template));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateSOPTemplateInFirestore(template: SOPTemplateItem) {
  const path = `${SOP_TEMPLATES_COL}/${template.id}`;
  try {
    const docRef = doc(db, SOP_TEMPLATES_COL, template.id);
    await setDoc(docRef, cleanDataForFirestore(template), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteSOPTemplateFromFirestore(id: string) {
  const path = `${SOP_TEMPLATES_COL}/${id}`;
  try {
    const docRef = doc(db, SOP_TEMPLATES_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------- DAILY SHIFT CHECKLISTS -----------------
export function subscribeToDailyChecklists(onData: (items: DailyShiftChecklistItem[]) => void) {
  const colRef = collection(db, DAILY_CHECKLISTS_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as DailyShiftChecklistItem);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, DAILY_CHECKLISTS_COL));
}

export async function addDailyChecklistItemToFirestore(item: DailyShiftChecklistItem) {
  const path = `${DAILY_CHECKLISTS_COL}/${item.id}`;
  try {
    const docRef = doc(db, DAILY_CHECKLISTS_COL, item.id);
    await setDoc(docRef, cleanDataForFirestore(item));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateDailyChecklistItemInFirestore(item: DailyShiftChecklistItem) {
  const path = `${DAILY_CHECKLISTS_COL}/${item.id}`;
  try {
    const docRef = doc(db, DAILY_CHECKLISTS_COL, item.id);
    await setDoc(docRef, cleanDataForFirestore(item), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteDailyChecklistItemFromFirestore(id: string) {
  const path = `${DAILY_CHECKLISTS_COL}/${id}`;
  try {
    const docRef = doc(db, DAILY_CHECKLISTS_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------- LEAVE REQUESTS -----------------
export function subscribeToLeaveRequests(onData: (requests: LeaveRequest[]) => void) {
  const colRef = collection(db, LEAVE_REQUESTS_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as LeaveRequest);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, LEAVE_REQUESTS_COL));
}

export async function addLeaveRequestToFirestore(request: LeaveRequest) {
  const path = `${LEAVE_REQUESTS_COL}/${request.id}`;
  try {
    const docRef = doc(db, LEAVE_REQUESTS_COL, request.id);
    await setDoc(docRef, cleanDataForFirestore(request));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateLeaveRequestInFirestore(request: LeaveRequest) {
  const path = `${LEAVE_REQUESTS_COL}/${request.id}`;
  try {
    const docRef = doc(db, LEAVE_REQUESTS_COL, request.id);
    await setDoc(docRef, cleanDataForFirestore(request), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ----------------- WEEKLY SHIFT SCHEDULES (LỊCH & XẾP CA TUẦN) -----------------
export function subscribeToWeeklyShiftSchedules(
  onData: (schedules: WeeklyShiftSchedule[]) => void,
  branchId?: string,
  weekStart?: string
) {
  const colRef = collection(db, WEEKLY_SCHEDULES_COL);
  let schedQuery: any = colRef;
  const conditions: any[] = [];
  if (branchId && branchId !== 'ALL') {
    conditions.push(where('branchId', '==', branchId));
  }
  if (weekStart) {
    conditions.push(where('weekStart', '==', weekStart));
  }
  if (conditions.length > 0) {
    schedQuery = query(colRef, ...conditions);
  }
  return onSnapshot(
    schedQuery,
    (snapshot: any) => {
      const items = snapshot.docs.map((d: any) => ({
        ...d.data(),
        id: d.id
      })) as WeeklyShiftSchedule[];
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, WEEKLY_SCHEDULES_COL);
    }
  );
}

export async function saveWeeklyShiftScheduleToFirestore(schedule: WeeklyShiftSchedule) {
  const path = `${WEEKLY_SCHEDULES_COL}/${schedule.id}`;
  try {
    const docRef = doc(db, WEEKLY_SCHEDULES_COL, schedule.id);
    await setDoc(docRef, cleanDataForFirestore(schedule), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

// ----------------- LEAD CARE ACTIVITIES (HOẠT ĐỘNG CHĂM SÓC LEAD CÓ BẰNG CHỨNG) -----------------
export function subscribeToLeadCareActivities(
  onData: (activities: LeadCareActivity[]) => void,
  filter?: { leadId?: string; branchId?: string }
) {
  const colRef = collection(db, LEAD_CARE_ACTIVITIES_COL);
  let actQuery: any = colRef;
  if (filter?.leadId) {
    actQuery = query(colRef, where('leadId', '==', filter.leadId));
  } else if (filter?.branchId && filter.branchId !== 'ALL') {
    actQuery = query(colRef, where('branchId', '==', filter.branchId));
  }
  return onSnapshot(
    actQuery,
    (snapshot: any) => {
      const items = snapshot.docs.map((d: any) => ({
        ...d.data(),
        id: d.id
      })) as LeadCareActivity[];
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, LEAD_CARE_ACTIVITIES_COL);
    }
  );
}

export async function addLeadCareActivityToFirestore(activity: LeadCareActivity) {
  const path = `${LEAD_CARE_ACTIVITIES_COL}/${activity.id}`;
  try {
    const docRef = doc(db, LEAD_CARE_ACTIVITIES_COL, activity.id);
    await setDoc(docRef, cleanDataForFirestore(activity));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

export async function updateLeadCareActivityInFirestore(activity: LeadCareActivity) {
  const path = `${LEAD_CARE_ACTIVITIES_COL}/${activity.id}`;
  try {
    const docRef = doc(db, LEAD_CARE_ACTIVITIES_COL, activity.id);
    await setDoc(docRef, cleanDataForFirestore(activity), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

// ----------------- LEAD APPOINTMENTS (LỊCH HẸN SHOWROOM) -----------------
export function subscribeToLeadAppointments(
  onData: (appointments: LeadAppointment[]) => void,
  filter?: { branchId?: string; leadId?: string }
) {
  const colRef = collection(db, LEAD_APPOINTMENTS_COL);
  let apptQuery: any = colRef;
  if (filter?.leadId) {
    apptQuery = query(colRef, where('leadId', '==', filter.leadId));
  } else if (filter?.branchId && filter.branchId !== 'ALL') {
    apptQuery = query(colRef, where('branchId', '==', filter.branchId));
  }
  return onSnapshot(
    apptQuery,
    (snapshot: any) => {
      const items = snapshot.docs.map((d: any) => ({
        ...d.data(),
        id: d.id
      })) as LeadAppointment[];
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, LEAD_APPOINTMENTS_COL);
    }
  );
}

export async function addLeadAppointmentToFirestore(appointment: LeadAppointment) {
  const path = `${LEAD_APPOINTMENTS_COL}/${appointment.id}`;
  try {
    const docRef = doc(db, LEAD_APPOINTMENTS_COL, appointment.id);
    await setDoc(docRef, cleanDataForFirestore(appointment));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

export async function updateLeadAppointmentInFirestore(appointment: LeadAppointment) {
  const path = `${LEAD_APPOINTMENTS_COL}/${appointment.id}`;
  try {
    const docRef = doc(db, LEAD_APPOINTMENTS_COL, appointment.id);
    await setDoc(docRef, cleanDataForFirestore(appointment), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

// ----------------- LEAD QUOTES (BÁO GIÁ SẢN PHẨM & DEAL) -----------------
export function subscribeToLeadQuotes(
  onData: (quotes: LeadQuote[]) => void,
  filter?: { leadId?: string; branchId?: string }
) {
  const colRef = collection(db, LEAD_QUOTES_COL);
  let quoteQuery: any = colRef;
  if (filter?.leadId) {
    quoteQuery = query(colRef, where('leadId', '==', filter.leadId));
  } else if (filter?.branchId && filter.branchId !== 'ALL') {
    quoteQuery = query(colRef, where('branchId', '==', filter.branchId));
  }
  return onSnapshot(
    quoteQuery,
    (snapshot: any) => {
      const items = snapshot.docs.map((d: any) => ({
        ...d.data(),
        id: d.id
      })) as LeadQuote[];
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, LEAD_QUOTES_COL);
    }
  );
}

export async function addLeadQuoteToFirestore(quote: LeadQuote) {
  const path = `${LEAD_QUOTES_COL}/${quote.id}`;
  try {
    const docRef = doc(db, LEAD_QUOTES_COL, quote.id);
    await setDoc(docRef, cleanDataForFirestore(quote));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

export async function updateLeadQuoteInFirestore(quote: LeadQuote) {
  const path = `${LEAD_QUOTES_COL}/${quote.id}`;
  try {
    const docRef = doc(db, LEAD_QUOTES_COL, quote.id);
    await setDoc(docRef, cleanDataForFirestore(quote), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}
