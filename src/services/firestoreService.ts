import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  DeviceItem, 
  Lead, 
  TradeInAppraisal, 
  WarrantyTicket, 
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
  SparePart
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
  REPAIR_SERVICES_PRICELIST,
  RepairServiceItem
} from '../data/initialData';

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

// Auto-seed Initial Data if Firestore is completely empty
export async function seedInitialDataIfEmpty() {
  try {
    const devicesSnap = await getDocs(collection(db, DEVICES_COL));
    if (devicesSnap.empty) {
      console.log('Seeding initial iPhone inventory and CRM records to Firestore...');
      const batch = writeBatch(db);

      INITIAL_DEVICES.forEach((d) => {
        const ref = doc(db, DEVICES_COL, d.id);
        batch.set(ref, cleanDataForFirestore(d));
      });

      INITIAL_LEADS.forEach((l) => {
        const ref = doc(db, LEADS_COL, l.id);
        batch.set(ref, cleanDataForFirestore(l));
      });

      INITIAL_TRADE_INS.forEach((t) => {
        const ref = doc(db, TRADEINS_COL, t.id);
        batch.set(ref, cleanDataForFirestore(t));
      });

      INITIAL_WARRANTY_TICKETS.forEach((w) => {
        const ref = doc(db, WARRANTY_COL, w.id);
        batch.set(ref, cleanDataForFirestore(w));
      });

      INITIAL_INVOICES.forEach((inv) => {
        const ref = doc(db, INVOICES_COL, inv.id);
        batch.set(ref, cleanDataForFirestore(inv));
      });

      INITIAL_USERS.forEach((usr) => {
        const ref = doc(db, USERS_COL, usr.id);
        batch.set(ref, cleanDataForFirestore(usr));
      });

      INITIAL_PARTNERS.forEach((p) => {
        const ref = doc(db, PARTNERS_COL, p.id);
        batch.set(ref, cleanDataForFirestore(p));
      });

      INITIAL_TRANSFERS.forEach((tr) => {
        const ref = doc(db, TRANSFERS_COL, tr.id);
        batch.set(ref, cleanDataForFirestore(tr));
      });

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

      INITIAL_CASH_TRANSACTIONS.forEach((tx) => {
        const ref = doc(db, CASH_TRANSACTIONS_COL, tx.id);
        batch.set(ref, cleanDataForFirestore(tx));
      });

      INITIAL_SPARE_PARTS.forEach((part) => {
        const ref = doc(db, SPARE_PARTS_COL, part.id);
        batch.set(ref, cleanDataForFirestore(part));
      });

      const settingsRef = doc(db, SETTINGS_COL, 'main');
      batch.set(settingsRef, cleanDataForFirestore(INITIAL_STORE_SETTINGS));

      await batch.commit();
      console.log('✅ Initial data seeded to Firestore successfully!');
    } else {
      // Check if funds need seeding
      const fundsSnap = await getDocs(collection(db, FUNDS_COL));
      if (fundsSnap.empty) {
        const fundBatch = writeBatch(db);
        INITIAL_FUNDS.forEach((f) => {
          const ref = doc(db, FUNDS_COL, f.id);
          fundBatch.set(ref, cleanDataForFirestore(f));
        });
        await fundBatch.commit();
      }

      // Check if spare parts need seeding
      const partsSnap = await getDocs(collection(db, SPARE_PARTS_COL));
      if (partsSnap.empty) {
        const partsBatch = writeBatch(db);
        INITIAL_SPARE_PARTS.forEach((p) => {
          const ref = doc(db, SPARE_PARTS_COL, p.id);
          partsBatch.set(ref, cleanDataForFirestore(p));
        });
        await partsBatch.commit();
      }

      // Check if repair services need seeding
      const repairSnap = await getDocs(collection(db, REPAIR_SERVICES_COL));
      if (repairSnap.empty) {
        const repairBatch = writeBatch(db);
        REPAIR_SERVICES_PRICELIST.forEach((r) => {
          const ref = doc(db, REPAIR_SERVICES_COL, r.id);
          repairBatch.set(ref, cleanDataForFirestore(r));
        });
        await repairBatch.commit();
      }
    }
  } catch (error) {
    console.warn('Initial seeding note (will use local fallback if offline):', error);
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
      const items: UserAccount[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as UserAccount);
      });
      if (items.length > 0) {
        onData(items);
      } else {
        // Fallback to default users if collection is empty
        onData(INITIAL_USERS);
      }
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
    const batch = writeBatch(db);
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const transferRefCode = `TRF-${Date.now().toString().slice(-6)}`;

    // 1. Calculate updated balances
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

    // 2. Prepare transaction documents
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

    // 3. Write in Firestore batch
    batch.set(doc(db, FUNDS_COL, updatedFromFund.id), cleanDataForFirestore(updatedFromFund), { merge: true });
    batch.set(doc(db, FUNDS_COL, updatedToFund.id), cleanDataForFirestore(updatedToFund), { merge: true });
    batch.set(doc(db, CASH_TRANSACTIONS_COL, txOut.id), cleanDataForFirestore(txOut), { merge: true });
    batch.set(doc(db, CASH_TRANSACTIONS_COL, txIn.id), cleanDataForFirestore(txIn), { merge: true });

    await batch.commit();

    return { txOut, txIn };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, FUNDS_COL);
    throw error;
  }
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
