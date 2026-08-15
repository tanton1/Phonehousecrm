import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { DeviceItem, Lead, TradeInAppraisal, WarrantyTicket, SalesInvoice, UserAccount, Partner, FundAccount, CashTransaction } from '../types';
import { 
  INITIAL_DEVICES, 
  INITIAL_LEADS, 
  INITIAL_TRADE_INS, 
  INITIAL_WARRANTY_TICKETS, 
  INITIAL_INVOICES,
  INITIAL_USERS,
  INITIAL_PARTNERS
} from '../data/initialData';

// Collection Names
const DEVICES_COL = 'devices';
const LEADS_COL = 'leads';
const TRADEINS_COL = 'tradeIns';
const WARRANTY_COL = 'warrantyTickets';
const INVOICES_COL = 'invoices';
const USERS_COL = 'users';
const PARTNERS_COL = 'partners';

// Auto-seed Initial Data if Firestore is completely empty
export async function seedInitialDataIfEmpty() {
  try {
    const devicesSnap = await getDocs(collection(db, DEVICES_COL));
    if (devicesSnap.empty) {
      console.log('Seeding initial iPhone inventory and CRM records to Firestore...');
      const batch = writeBatch(db);

      INITIAL_DEVICES.forEach((d) => {
        const ref = doc(db, DEVICES_COL, d.id);
        batch.set(ref, d);
      });

      INITIAL_LEADS.forEach((l) => {
        const ref = doc(db, LEADS_COL, l.id);
        batch.set(ref, l);
      });

      INITIAL_TRADE_INS.forEach((t) => {
        const ref = doc(db, TRADEINS_COL, t.id);
        batch.set(ref, t);
      });

      INITIAL_WARRANTY_TICKETS.forEach((w) => {
        const ref = doc(db, WARRANTY_COL, w.id);
        batch.set(ref, w);
      });

      INITIAL_INVOICES.forEach((inv) => {
        const ref = doc(db, INVOICES_COL, inv.id);
        batch.set(ref, inv);
      });

      INITIAL_USERS.forEach((usr) => {
        const ref = doc(db, USERS_COL, usr.id);
        batch.set(ref, usr);
      });

      INITIAL_PARTNERS.forEach((p) => {
        const ref = doc(db, PARTNERS_COL, p.id);
        batch.set(ref, p);
      });

      await batch.commit();
      console.log('✅ Initial data seeded to Firestore successfully!');
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
    await setDoc(docRef, device);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateDeviceInFirestore(device: DeviceItem) {
  const path = `${DEVICES_COL}/${device.id}`;
  try {
    const docRef = doc(db, DEVICES_COL, device.id);
    await setDoc(docRef, device, { merge: true });
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
    await setDoc(docRef, lead);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateLeadInFirestore(lead: Lead) {
  const path = `${LEADS_COL}/${lead.id}`;
  try {
    const docRef = doc(db, LEADS_COL, lead.id);
    await setDoc(docRef, lead, { merge: true });
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
    await setDoc(docRef, tradeIn);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTradeInInFirestore(tradeIn: TradeInAppraisal) {
  const path = `${TRADEINS_COL}/${tradeIn.id}`;
  try {
    const docRef = doc(db, TRADEINS_COL, tradeIn.id);
    await setDoc(docRef, tradeIn, { merge: true });
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
    await setDoc(docRef, ticket);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateWarrantyTicketInFirestore(ticket: WarrantyTicket) {
  const path = `${WARRANTY_COL}/${ticket.id}`;
  try {
    const docRef = doc(db, WARRANTY_COL, ticket.id);
    await setDoc(docRef, ticket, { merge: true });
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
    await setDoc(docRef, invoice);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateInvoiceInFirestore(invoice: SalesInvoice) {
  const path = `${INVOICES_COL}/${invoice.id}`;
  try {
    const docRef = doc(db, INVOICES_COL, invoice.id);
    await setDoc(docRef, invoice, { merge: true });
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
    await setDoc(docRef, user);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUserInFirestore(user: UserAccount) {
  const path = `${USERS_COL}/${user.id}`;
  try {
    const docRef = doc(db, USERS_COL, user.id);
    await setDoc(docRef, user, { merge: true });
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
    await setDoc(docRef, partner);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updatePartnerInFirestore(partner: Partner) {
  const path = `${PARTNERS_COL}/${partner.id}`;
  try {
    const docRef = doc(db, PARTNERS_COL, partner.id);
    await setDoc(docRef, partner, { merge: true });
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


const FUNDS_COL = 'funds';
const CASH_TRANSACTIONS_COL = 'cashTransactions';

export function subscribeToFunds(onData: (funds: FundAccount[]) => void) {
  const colRef = collection(db, FUNDS_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as FundAccount);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, FUNDS_COL));
}

export async function addFundToFirestore(fund: FundAccount) {
  try {
    await setDoc(doc(db, FUNDS_COL, fund.id), fund);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, FUNDS_COL);
  }
}

export async function updateFundInFirestore(fund: FundAccount) {
  try {
    await updateDoc(doc(db, FUNDS_COL, fund.id), { ...fund });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, FUNDS_COL);
  }
}

export async function deleteFundFromFirestore(id: string) {
  try {
    await deleteDoc(doc(db, FUNDS_COL, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, FUNDS_COL);
  }
}

export function subscribeToCashTransactions(onData: (txs: CashTransaction[]) => void) {
  const colRef = collection(db, CASH_TRANSACTIONS_COL);
  return onSnapshot(colRef, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as CashTransaction);
    onData(data);
  }, (error) => handleFirestoreError(error, OperationType.LIST, CASH_TRANSACTIONS_COL));
}

export async function addCashTransactionToFirestore(tx: CashTransaction) {
  try {
    await setDoc(doc(db, CASH_TRANSACTIONS_COL, tx.id), tx);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, CASH_TRANSACTIONS_COL);
  }
}

export async function updateCashTransactionInFirestore(tx: CashTransaction) {
  try {
    await updateDoc(doc(db, CASH_TRANSACTIONS_COL, tx.id), { ...tx });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, CASH_TRANSACTIONS_COL);
  }
}

export async function deleteCashTransactionFromFirestore(id: string) {
  try {
    await deleteDoc(doc(db, CASH_TRANSACTIONS_COL, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, CASH_TRANSACTIONS_COL);
  }
}
