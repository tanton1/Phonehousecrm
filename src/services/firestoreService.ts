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
  PartnerDebtTransaction,
  AttendanceRecord,
  ShiftHandoverReport,
  SOPTemplateItem,
  DailyShiftChecklistItem,
  LeaveRequest,
  StaffMember,
  WeeklyShiftSchedule
} from '../types';
import { 
  INITIAL_DEVICES, 
  INITIAL_LEADS, 
  INITIAL_TRADE_INS, 
  INITIAL_WARRANTY_TICKETS, 
  INITIAL_INVOICES,
  INITIAL_USERS,
  INITIAL_PARTNERS,
  INITIAL_TRANSFERS,
  INITIAL_BRANCHES,
  INITIAL_WAREHOUSES,
  INITIAL_STORE_SETTINGS,
  INITIAL_FUNDS,
  INITIAL_CASH_TRANSACTIONS,
  INITIAL_SPARE_PARTS,
  INITIAL_PURCHASE_ORDERS,
  REPAIR_SERVICES_PRICELIST,
  RepairServiceItem
} from '../data/initialData';
import { INITIAL_CATALOG_ITEMS } from '../data/catalogData';
import { INITIAL_TODAY_ATTENDANCE_LIST, INITIAL_STAFF_MEMBERS, INITIAL_LEAVE_REQUESTS } from '../data/attendanceData';
import { INITIAL_SOP_TEMPLATES, INITIAL_TODAY_SHIFT_CHECKLISTS, INITIAL_HANDOVER_REPORTS } from '../data/sopTemplatesData';

// Collection Names
const DEVICES_COL = 'devices';
const LEADS_COL = 'leads';
const TRADEINS_COL = 'tradeIns';
const WARRANTY_COL = 'warrantyTickets';
const INVOICES_COL = 'invoices';
const USERS_COL = 'users';
const PARTNERS_COL = 'partners';
const TRANSFERS_COL = 'transfers';
const PRODUCTS_COL = 'products';
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

// Auto-seed Initial Configuration if Firestore is empty (Only seeds system branches, warehouses and settings without demo transaction data)
export async function seedInitialDataIfEmpty() {
  try {
    const branchesSnap = await getDocs(collection(db, BRANCHES_COL));
    if (branchesSnap.empty) {
      console.log('Seeding initial system branches, warehouses and settings to Firestore...');
      const batch = writeBatch(db);

      INITIAL_BRANCHES.forEach((br) => {
        const ref = doc(db, BRANCHES_COL, br.id);
        batch.set(ref, cleanDataForFirestore(br));
      });

      INITIAL_WAREHOUSES.forEach((wh) => {
        const ref = doc(db, WAREHOUSES_COL, wh.id);
        batch.set(ref, cleanDataForFirestore(wh));
      });

      INITIAL_FUNDS.forEach((f) => {
        const ref = doc(db, FUNDS_COL, f.id);
        batch.set(ref, cleanDataForFirestore(f));
      });

      REPAIR_SERVICES_PRICELIST.forEach((r) => {
        const ref = doc(db, REPAIR_SERVICES_COL, r.id);
        batch.set(ref, cleanDataForFirestore(r));
      });

      const settingsRef = doc(db, SETTINGS_COL, 'main');
      batch.set(settingsRef, cleanDataForFirestore(INITIAL_STORE_SETTINGS));

      await batch.commit();
      console.log('✅ Initial system configuration saved to Firestore!');
    }
  } catch (error) {
    console.warn('Initial seeding note (will use local fallback if offline):', error);
  }
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
  }
}

export async function updateWarrantyTicketInFirestore(ticket: WarrantyTicket) {
  const path = `${WARRANTY_COL}/${ticket.id}`;
  try {
    const docRef = doc(db, WARRANTY_COL, ticket.id);
    await setDoc(docRef, cleanDataForFirestore(ticket), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
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
      if (items.length > 0) {
        onData(items);
      } else {
        // Fallback to default partners if collection is empty
        onData(INITIAL_PARTNERS);
      }
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
    if (data.length > 0) {
      onData(data);
    } else {
      onData(INITIAL_FUNDS);
    }
  }, (error) => handleFirestoreError(error, OperationType.LIST, FUNDS_COL));
}

export async function addFundToFirestore(fund: FundAccount) {
  const path = `${FUNDS_COL}/${fund.id}`;
  try {
    const docRef = doc(db, FUNDS_COL, fund.id);
    await setDoc(docRef, cleanDataForFirestore(fund));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateFundInFirestore(fund: FundAccount) {
  const path = `${FUNDS_COL}/${fund.id}`;
  try {
    const docRef = doc(db, FUNDS_COL, fund.id);
    await setDoc(docRef, cleanDataForFirestore(fund), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFundFromFirestore(id: string) {
  const path = `${FUNDS_COL}/${id}`;
  try {
    const docRef = doc(db, FUNDS_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToCashTransactions(onData: (txs: CashTransaction[]) => void) {
  const colRef = collection(db, CASH_TRANSACTIONS_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as CashTransaction);
    if (data.length > 0) {
      onData(data);
    } else {
      onData(INITIAL_CASH_TRANSACTIONS);
    }
  }, (error) => handleFirestoreError(error, OperationType.LIST, CASH_TRANSACTIONS_COL));
}

export async function addCashTransactionToFirestore(tx: CashTransaction) {
  try {
    const idToken = await auth.currentUser?.getIdToken().catch(() => null);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }
    headers['x-staff-uid'] = auth.currentUser?.uid || 'staff-finance';
    headers['x-staff-role'] = 'ACCOUNTANT';
    headers['x-staff-branch-id'] = tx.branchId || 'CN01';

    const endpoint = tx.type === 'RECEIPT' ? '/api/finance/receipt' : '/api/finance/payment';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
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
        isPLAccounted: tx.isPLAccounted
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.transaction) {
        return data.transaction;
      }
    }
  } catch (apiErr) {
    console.warn('[Finance API Offline/Fallback]:', apiErr);
  }

  const path = `${CASH_TRANSACTIONS_COL}/${tx.id}`;
  try {
    const docRef = doc(db, CASH_TRANSACTIONS_COL, tx.id);
    await setDoc(docRef, cleanDataForFirestore(tx));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCashTransactionInFirestore(tx: CashTransaction) {
  const path = `${CASH_TRANSACTIONS_COL}/${tx.id}`;
  try {
    const docRef = doc(db, CASH_TRANSACTIONS_COL, tx.id);
    await setDoc(docRef, cleanDataForFirestore(tx), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCashTransactionFromFirestore(id: string) {
  const path = `${CASH_TRANSACTIONS_COL}/${id}`;
  try {
    const docRef = doc(db, CASH_TRANSACTIONS_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------- TRANSFERS -----------------
export function subscribeToTransfers(onData: (transfers: StockTransferSlip[]) => void) {
  const colRef = collection(db, TRANSFERS_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as StockTransferSlip);
    if (data.length > 0) {
      onData(data);
    } else {
      onData(INITIAL_TRANSFERS);
    }
  }, (error) => handleFirestoreError(error, OperationType.LIST, TRANSFERS_COL));
}

export async function addTransferToFirestore(transfer: StockTransferSlip) {
  const path = `${TRANSFERS_COL}/${transfer.id}`;
  try {
    const docRef = doc(db, TRANSFERS_COL, transfer.id);
    await setDoc(docRef, cleanDataForFirestore(transfer));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTransferInFirestore(transfer: StockTransferSlip) {
  const path = `${TRANSFERS_COL}/${transfer.id}`;
  try {
    const docRef = doc(db, TRANSFERS_COL, transfer.id);
    await setDoc(docRef, cleanDataForFirestore(transfer), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTransferFromFirestore(id: string) {
  const path = `${TRANSFERS_COL}/${id}`;
  try {
    const docRef = doc(db, TRANSFERS_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
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
  try {
    const idToken = await auth.currentUser?.getIdToken().catch(() => null);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }
    headers['x-staff-uid'] = auth.currentUser?.uid || 'admin-finance';
    headers['x-staff-role'] = 'ADMIN';
    headers['x-staff-branch-id'] = fromFund.branchId || 'CN01';

    const response = await fetch('/api/finance/transfer', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fromFundId: fromFund.id,
        toFundId: toFund.id,
        amount,
        notes,
        branchId: fromFund.branchId
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.txOut && data.txIn) {
        return { txOut: data.txOut, txIn: data.txIn };
      }
    }
  } catch (apiErr) {
    console.warn('[Finance Transfer API Offline/Fallback]:', apiErr);
  }

  const batch = writeBatch(db);
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const transferRefCode = `TRF-${Date.now().toString().slice(-6)}`;

  const updatedFromFund: FundAccount = {
    ...fromFund,
    currentBalance: fromFund.currentBalance - amount,
    totalExpense: (fromFund.totalExpense || 0) + amount
  };

  const updatedToFund: FundAccount = {
    ...toFund,
    currentBalance: toFund.currentBalance + amount,
    totalIncome: (toFund.totalIncome || 0) + amount
  };

  const txOut: CashTransaction = {
    id: `TX-${Date.now()}-OUT`,
    code: `PC-${transferRefCode}-OUT`,
    type: 'PAYMENT',
    category: 'OTHER_EXPENSE',
    categoryName: 'Chuyển quỹ nội bộ (Chi)',
    amount,
    fundType: fromFund.type,
    fundName: fromFund.name,
    date: dateStr,
    creator,
    referenceCode: transferRefCode,
    notes: notes || `Chuyển ${amount.toLocaleString('vi-VN')}đ sang ${toFund.name}`,
    status: 'COMPLETED'
  };

  const txIn: CashTransaction = {
    id: `TX-${Date.now() + 1}-IN`,
    code: `PT-${transferRefCode}-IN`,
    type: 'RECEIPT',
    category: 'OTHER_INCOME',
    categoryName: 'Chuyển quỹ nội bộ (Thu)',
    amount,
    fundType: toFund.type,
    fundName: toFund.name,
    date: dateStr,
    creator,
    referenceCode: transferRefCode,
    notes: notes || `Nhận ${amount.toLocaleString('vi-VN')}đ từ ${fromFund.name}`,
    status: 'COMPLETED'
  };

  try {
    batch.set(doc(db, FUNDS_COL, updatedFromFund.id), cleanDataForFirestore(updatedFromFund), { merge: true });
    batch.set(doc(db, FUNDS_COL, updatedToFund.id), cleanDataForFirestore(updatedToFund), { merge: true });
    batch.set(doc(db, CASH_TRANSACTIONS_COL, txOut.id), cleanDataForFirestore(txOut), { merge: true });
    batch.set(doc(db, CASH_TRANSACTIONS_COL, txIn.id), cleanDataForFirestore(txIn), { merge: true });
    await batch.commit();
  } catch (err) {
    console.warn('[Client Batch Fallback skipped on rule denial]:', err);
  }

  return { txOut, txIn };
}

// ----------------- BRANCHES (CỬA HÀNG / CHI NHÁNH) -----------------
export function subscribeToBranches(onData: (branches: StoreBranch[]) => void) {
  const colRef = collection(db, BRANCHES_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as StoreBranch);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, BRANCHES_COL));
}

export async function addBranchToFirestore(branch: StoreBranch) {
  const path = `${BRANCHES_COL}/${branch.id}`;
  try {
    await setDoc(doc(db, BRANCHES_COL, branch.id), cleanDataForFirestore(branch));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateBranchInFirestore(branch: StoreBranch) {
  const path = `${BRANCHES_COL}/${branch.id}`;
  try {
    const docRef = doc(db, BRANCHES_COL, branch.id);
    await setDoc(docRef, cleanDataForFirestore(branch), { merge: true });
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
    const data = snapshot.docs.map(doc => doc.data() as WarehouseInfo);
    if (data.length > 0) {
      onData(data);
    } else {
      onData(INITIAL_WAREHOUSES);
    }
  }, (error) => handleFirestoreError(error, OperationType.LIST, WAREHOUSES_COL));
}

export async function addWarehouseToFirestore(warehouse: WarehouseInfo) {
  const path = `${WAREHOUSES_COL}/${warehouse.id}`;
  try {
    await setDoc(doc(db, WAREHOUSES_COL, warehouse.id), cleanDataForFirestore(warehouse));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateWarehouseInFirestore(warehouse: WarehouseInfo) {
  const path = `${WAREHOUSES_COL}/${warehouse.id}`;
  try {
    const docRef = doc(db, WAREHOUSES_COL, warehouse.id);
    await setDoc(docRef, cleanDataForFirestore(warehouse), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteWarehouseFromFirestore(id: string) {
  const path = `${WAREHOUSES_COL}/${id}`;
  try {
    await deleteDoc(doc(db, WAREHOUSES_COL, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
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
  cancelledBy: string;
  reason: string;
  devicesToRestore: DeviceItem[];
  accessoriesToRestore: { product: ProductItem; quantity: number }[];
  refundTx: CashTransaction | null;
  fundToDeduct: FundAccount | null;
  customerPartner: Partner | null;
}) {
  const batch = writeBatch(db);
  const path = `${INVOICES_COL}/${params.invoiceId}`;

  try {
    // 1. Mark Invoice as CANCELLED with audit trail
    const invRef = doc(db, INVOICES_COL, params.invoiceId);
    batch.update(invRef, {
      status: 'CANCELLED',
      cancellationReason: params.reason,
      cancelledBy: params.cancelledBy,
      cancelledAt: new Date().toISOString()
    });

    // 2. Restore Devices status back to 'in_stock'
    for (const d of params.devicesToRestore) {
      const devRef = doc(db, DEVICES_COL, d.id);
      batch.update(devRef, {
        status: 'in_stock',
        soldDate: null,
        customerName: null,
        customerPhone: null
      });
    }

    // 3. Restore Accessory Stock Quantity
    for (const acc of params.accessoriesToRestore) {
      const prodRef = doc(db, PRODUCTS_COL, acc.product.id);
      batch.update(prodRef, {
        stockQuantity: increment(acc.quantity)
      });
    }

    // 4. Create Refund Cash Transaction (PAYMENT)
    if (params.refundTx) {
      const txRef = doc(db, CASH_TRANSACTIONS_COL, params.refundTx.id);
      batch.set(txRef, cleanDataForFirestore(params.refundTx));
    }

    // 5. Deduct Fund Balance using atomic increment
    if (params.fundToDeduct && params.refundTx && params.refundTx.amount > 0) {
      const fundRef = doc(db, FUNDS_COL, params.fundToDeduct.id);
      batch.update(fundRef, {
        currentBalance: increment(-params.refundTx.amount),
        totalExpense: increment(params.refundTx.amount)
      });
    }

    // 6. Reverse customer totalSpent if applicable
    if (params.customerPartner && params.refundTx && params.refundTx.amount > 0) {
      const custRef = doc(db, PARTNERS_COL, params.customerPartner.id);
      batch.update(custRef, {
        totalSpent: increment(-params.refundTx.amount)
      });
    }

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
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
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  const txOutId = `TX-OUT-${Date.now()}`;
  const txInId = `TX-IN-${Date.now() + 1}`;

  try {
    // 1. Deduct from source fund
    const fromRef = doc(db, FUNDS_COL, params.fromFundId);
    batch.update(fromRef, {
      currentBalance: increment(-params.amount),
      totalExpense: increment(params.amount)
    });

    // 2. Add to destination fund
    const toRef = doc(db, FUNDS_COL, params.toFundId);
    batch.update(toRef, {
      currentBalance: increment(params.amount),
      totalIncome: increment(params.amount)
    });

    // 3. Create debit entry (chi chuyển quỹ)
    const txOutRef = doc(db, CASH_TRANSACTIONS_COL, txOutId);
    const txOutData: CashTransaction = {
      id: txOutId,
      code: `PC-${Date.now().toString().slice(-6)}`,
      type: 'PAYMENT',
      category: 'OTHER_EXPENSE',
      categoryName: 'Chuyển quỹ nội bộ (Chi)',
      amount: params.amount,
      fundType: 'CASH',
      fundName: params.fromFundName,
      fundId: params.fromFundId,
      date: now.split('T')[0],
      notes: `Chuyển quỹ sang [${params.toFundName}]: ${params.note}`,
      branchId: params.branchId || 'ALL',
      creator: params.transferredBy,
      status: 'COMPLETED'
    };
    batch.set(txOutRef, cleanDataForFirestore(txOutData));

    // 4. Create credit entry (thu nhận chuyển quỹ)
    const txInRef = doc(db, CASH_TRANSACTIONS_COL, txInId);
    const txInData: CashTransaction = {
      id: txInId,
      code: `PT-${Date.now().toString().slice(-6)}`,
      type: 'RECEIPT',
      category: 'OTHER_INCOME',
      categoryName: 'Chuyển quỹ nội bộ (Thu)',
      amount: params.amount,
      fundType: 'CASH',
      fundName: params.toFundName,
      fundId: params.toFundId,
      date: now.split('T')[0],
      notes: `Nhận chuyển quỹ từ [${params.fromFundName}]: ${params.note}`,
      branchId: params.branchId || 'ALL',
      creator: params.transferredBy,
      status: 'COMPLETED'
    };
    batch.set(txInRef, cleanDataForFirestore(txInData));

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${FUNDS_COL}/transfer`);
    throw error;
  }
}

// ----------------- DEBT SETTLEMENT ATOMIC BATCH -----------------
export async function executeDebtSettlementInFirestore(params: {
  partner: Partner;
  newDebtAmount: number;
  newDebtTransaction: PartnerDebtTransaction;
  cashTx: CashTransaction;
  fund: FundAccount;
}) {
  const batch = writeBatch(db);
  try {
    // 1. Update Partner
    const partnerRef = doc(db, PARTNERS_COL, params.partner.id);
    const updatedPartner: Partner = {
      ...params.partner,
      outstandingDebt: params.newDebtAmount,
      debtTransactions: [params.newDebtTransaction, ...(params.partner.debtTransactions || [])]
    };
    batch.set(partnerRef, cleanDataForFirestore(updatedPartner), { merge: true });

    // 2. Add CashTransaction
    const txRef = doc(db, CASH_TRANSACTIONS_COL, params.cashTx.id);
    batch.set(txRef, cleanDataForFirestore(params.cashTx));

    // 3. Update Fund
    const fundRef = doc(db, FUNDS_COL, params.fund.id);
    const delta = params.cashTx.type === 'RECEIPT' ? params.cashTx.amount : -params.cashTx.amount;
    const updatedFund: FundAccount = {
      ...params.fund,
      currentBalance: params.fund.currentBalance + delta,
      totalIncome: params.cashTx.type === 'RECEIPT' ? (params.fund.totalIncome || 0) + params.cashTx.amount : params.fund.totalIncome,
      totalExpense: params.cashTx.type === 'PAYMENT' ? (params.fund.totalExpense || 0) + params.cashTx.amount : params.fund.totalExpense
    };
    batch.set(fundRef, cleanDataForFirestore(updatedFund), { merge: true });

    await batch.commit();
    return { updatedPartner, cashTx: params.cashTx, updatedFund };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'debt_settlement');
    throw error;
  }
}

// ----------------- PURCHASE ORDERS -----------------
export function subscribeToPurchaseOrders(onData: (orders: PurchaseOrder[]) => void) {
  const colRef = collection(db, PURCHASE_ORDERS_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as PurchaseOrder);
    if (data.length > 0) {
      onData(data);
    } else {
      onData(INITIAL_PURCHASE_ORDERS);
    }
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
    if (data.length > 0) {
      onData(data);
    } else {
      onData(INITIAL_CATALOG_ITEMS);
    }
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
  }
}

export async function updateAttendanceRecordInFirestore(record: AttendanceRecord) {
  const path = `${ATTENDANCE_COL}/${record.id}`;
  try {
    const docRef = doc(db, ATTENDANCE_COL, record.id);
    await setDoc(docRef, cleanDataForFirestore(record), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAttendanceRecordFromFirestore(id: string) {
  const path = `${ATTENDANCE_COL}/${id}`;
  try {
    const docRef = doc(db, ATTENDANCE_COL, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------- SHIFT HANDOVER (BÀN GIAO CA TRỰC) -----------------
export function subscribeToShiftHandovers(onData: (reports: ShiftHandoverReport[]) => void) {
  const colRef = collection(db, SHIFT_HANDOVER_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as ShiftHandoverReport);
    if (data.length > 0) {
      onData(data);
    } else {
      onData(INITIAL_HANDOVER_REPORTS);
    }
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

// ----------------- SOP TEMPLATES -----------------
export function subscribeToSOPTemplates(onData: (templates: SOPTemplateItem[]) => void) {
  const colRef = collection(db, SOP_TEMPLATES_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as SOPTemplateItem);
    if (data.length > 0) {
      onData(data);
    } else {
      onData(INITIAL_SOP_TEMPLATES);
    }
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
    if (data.length > 0) {
      onData(data);
    } else {
      onData(INITIAL_TODAY_SHIFT_CHECKLISTS);
    }
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
    if (data.length > 0) {
      onData(data);
    } else {
      onData(INITIAL_LEAVE_REQUESTS);
    }
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
  branchId?: string
) {
  const colRef = collection(db, WEEKLY_SCHEDULES_COL);
  let schedQuery: any = colRef;
  if (branchId && branchId !== 'ALL') {
    schedQuery = query(colRef, where('branchId', '==', branchId));
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
  }
}
