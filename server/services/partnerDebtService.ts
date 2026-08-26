import crypto from 'node:crypto';
import { Firestore } from 'firebase-admin/firestore';
import {
  assertPartnerForBranch,
  debtLedgerEntry,
  newBranchPartyAccountRecord,
  newPartyMasterRecord,
  resolvePartyIdentity
} from './branchPartyService';

export type PartnerDebtSettlementDirection = 'PAYMENT' | 'RECEIPT';

export interface PartnerDebtActor {
  uid: string;
  role: string;
  branchId?: string;
  assignedBranchIds?: string[];
  name?: string;
}

export interface PartnerDebtSettlementInput {
  partnerId: string;
  fundId: string;
  direction: PartnerDebtSettlementDirection;
  amount: number;
  note?: string;
  idempotencyKey: string;
}

export interface PartnerDebtAllocation {
  sourceType: 'PURCHASE_ORDER' | 'INVOICE';
  sourceId: string;
  sourceCode: string;
  amount: number;
  paidAmount: number;
  remainingDebt: number;
  paymentStatus: 'PAID' | 'PARTIAL';
}

export interface PartnerDebtSettlementResult {
  settlementId: string;
  partner: any;
  fund: any;
  cashTransaction: any;
  allocations: PartnerDebtAllocation[];
  unallocatedAmount: number;
  idempotentReplay?: boolean;
}

function canAccessBranch(actor: PartnerDebtActor, branchId: string): boolean {
  if (!branchId || branchId === 'ALL') return false;
  if (String(actor.role || '').toUpperCase() === 'ADMIN') return true;
  return actor.branchId === branchId || (actor.assignedBranchIds || []).includes(branchId);
}

function requireWholeVnd(value: unknown, errorCode: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(errorCode);
  return amount;
}

function sourceDate(source: any): number {
  const raw = source.orderDate || source.createdAt || source.date || source.receivedDate || '';
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function stablePayloadHash(input: PartnerDebtSettlementInput): string {
  return crypto.createHash('sha256').update(JSON.stringify({
    partnerId: input.partnerId,
    fundId: input.fundId,
    direction: input.direction,
    amount: input.amount,
    note: String(input.note || '').trim()
  })).digest('hex');
}

export function validatePartnerDebtSettlementInput(raw: Partial<PartnerDebtSettlementInput>): PartnerDebtSettlementInput {
  const partnerId = String(raw.partnerId || '').trim();
  const fundId = String(raw.fundId || '').trim();
  const direction = String(raw.direction || '').trim().toUpperCase() as PartnerDebtSettlementDirection;
  const idempotencyKey = String(raw.idempotencyKey || '').trim();
  if (!partnerId) throw new Error('PARTNER_DEBT_PARTNER_REQUIRED');
  if (!fundId) throw new Error('PARTNER_DEBT_FUND_REQUIRED');
  if (!['PAYMENT', 'RECEIPT'].includes(direction)) throw new Error('PARTNER_DEBT_DIRECTION_INVALID');
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new Error('PARTNER_DEBT_IDEMPOTENCY_REQUIRED');
  return {
    partnerId,
    fundId,
    direction,
    amount: requireWholeVnd(raw.amount, 'PARTNER_DEBT_AMOUNT_INVALID'),
    note: String(raw.note || '').trim().slice(0, 500),
    idempotencyKey
  };
}

/**
 * Settles partner debt as one accounting transaction. The browser never writes
 * the partner balance, source documents or fund independently.
 */
export async function processPartnerDebtSettlement(
  db: Firestore,
  rawInput: Partial<PartnerDebtSettlementInput>,
  actor: PartnerDebtActor
): Promise<PartnerDebtSettlementResult> {
  const input = validatePartnerDebtSettlementInput(rawInput);
  const idempotencyId = crypto.createHash('sha256')
    .update(`PARTNER_DEBT:${input.partnerId}:${input.idempotencyKey}`)
    .digest('hex');
  const settlementId = `PDS_${idempotencyId.slice(0, 24).toUpperCase()}`;
  const cashTransactionId = `TX_${settlementId}`;
  const payloadHash = stablePayloadHash(input);
  const idemRef = db.collection('partnerDebtSettlementRequests').doc(idempotencyId);
  const partnerRef = db.collection('partners').doc(input.partnerId);
  const fundRef = db.collection('funds').doc(input.fundId);

  return db.runTransaction(async transaction => {
    const [idemSnap, partnerSnap, fundSnap] = await Promise.all([
      transaction.get(idemRef),
      transaction.get(partnerRef),
      transaction.get(fundRef)
    ]);
    if (!partnerSnap.exists) throw new Error('PARTNER_DEBT_PARTNER_NOT_FOUND');
    if (!fundSnap.exists) throw new Error('PARTNER_DEBT_FUND_NOT_FOUND');

    const partner = partnerSnap.data()!;
    const fund = fundSnap.data()!;
    if (idemSnap.exists) {
      const idem = idemSnap.data()!;
      if (idem.payloadHash !== payloadHash) throw new Error('PARTNER_DEBT_IDEMPOTENCY_CONFLICT');
      return {
        settlementId,
        partner: { id: partnerSnap.id, ...partner },
        fund: { id: fundSnap.id, ...fund },
        cashTransaction: idem.cashTransaction,
        allocations: idem.allocations || [],
        unallocatedAmount: Number(idem.unallocatedAmount || 0),
        idempotentReplay: true
      };
    }

    const branchId = String(fund.branchId || '').trim();
    if (!canAccessBranch(actor, branchId)) throw new Error('PARTNER_DEBT_BRANCH_FORBIDDEN');
    if (fund.isActive === false || fund.active === false || fund.isArchived === true) throw new Error('PARTNER_DEBT_FUND_INACTIVE');
    if (!['CASH', 'BANK'].includes(String(fund.type || '').toUpperCase())) throw new Error('PARTNER_DEBT_FUND_TYPE_INVALID');

    const partnerBranchId = String(partner.branchId || '').trim();
    if (!partnerBranchId || partnerBranchId === 'ALL') throw new Error('PARTNER_DEBT_PARTNER_BRANCH_REQUIRED');
    if (partnerBranchId !== branchId) throw new Error('PARTNER_DEBT_BRANCH_MISMATCH');
    const partnerType = String(partner.type || '').toUpperCase();
    const isFinancePartner = String(partner.supplierCategory || '').toUpperCase() === 'FINANCE_PARTNER';
    if (isFinancePartner) throw new Error('PARTNER_DEBT_FINANCE_PARTNER_USE_INSTALLMENT_RECONCILIATION');
    if (input.direction === 'PAYMENT' && !['SUPPLIER', 'BOTH'].includes(partnerType)) {
      throw new Error('PARTNER_DEBT_PAYMENT_REQUIRES_SUPPLIER');
    }
    if (input.direction === 'RECEIPT' && !['CUSTOMER', 'BOTH'].includes(partnerType)) {
      throw new Error('PARTNER_DEBT_RECEIPT_REQUIRES_CUSTOMER');
    }
    assertPartnerForBranch(
      partner,
      branchId,
      input.direction === 'PAYMENT' ? ['SUPPLIER', 'BOTH'] : ['CUSTOMER', 'BOTH'],
      'PARTNER_DEBT_PARTNER'
    );
    const partnerIdentity = resolvePartyIdentity({ id: partnerSnap.id, ...partner }, branchId);
    const partyMasterRef = db.collection('partyMasters').doc(partnerIdentity.partyMasterId);
    const branchPartyAccountRef = db.collection('branchPartyAccounts').doc(partnerIdentity.branchPartyAccountId);
    const [partyMasterSnap, branchPartyAccountSnap] = await Promise.all([
      transaction.get(partyMasterRef), transaction.get(branchPartyAccountRef)
    ]);
    if (branchPartyAccountSnap.exists) {
      const account = branchPartyAccountSnap.data()!;
      if (String(account.branchId || '') !== branchId) throw new Error('PARTNER_DEBT_ACCOUNT_BRANCH_MISMATCH');
      if (String(account.partyMasterId || '') !== partnerIdentity.partyMasterId) throw new Error('PARTNER_DEBT_ACCOUNT_IDENTITY_MISMATCH');
      if (account.status === 'ARCHIVED' || account.status === 'INACTIVE') throw new Error('PARTNER_DEBT_ACCOUNT_INACTIVE');
    }

    const currentDebt = Number(partner.outstandingDebt || 0);
    if (!Number.isSafeInteger(currentDebt) || currentDebt < input.amount) throw new Error('PARTNER_DEBT_AMOUNT_EXCEEDS_BALANCE');
    const currentFundBalance = Number(fund.currentBalance || 0);
    if (!Number.isSafeInteger(currentFundBalance) || currentFundBalance < 0) throw new Error('PARTNER_DEBT_FUND_BALANCE_INVALID');
    if (input.direction === 'PAYMENT' && currentFundBalance < input.amount) throw new Error('INSUFFICIENT_FUNDS');

    const sourceCollection = input.direction === 'PAYMENT' ? 'purchaseOrders' : 'invoices';
    const partnerField = input.direction === 'PAYMENT' ? 'supplierId' : 'customerId';
    const sourceSnap = await transaction.get(db.collection(sourceCollection).where(partnerField, '==', input.partnerId));
    const openSources = sourceSnap.docs
      .map(doc => ({ doc, data: doc.data() }))
      .filter(({ data }) => {
        const status = String(data.status || '').toUpperCase();
        return String(data.branchId || '') === branchId && Number(data.debtAmount || 0) > 0 && !['CANCELLED', 'REVERSED'].includes(status);
      })
      .sort((a, b) => sourceDate(a.data) - sourceDate(b.data) || a.doc.id.localeCompare(b.doc.id));

    let remaining = input.amount;
    const allocations: PartnerDebtAllocation[] = [];
    for (const source of openSources) {
      if (remaining <= 0) break;
      if (allocations.length >= 100) throw new Error('PARTNER_DEBT_TOO_MANY_REFERENCES');
      const sourceDebt = requireWholeVnd(source.data.debtAmount, 'PARTNER_DEBT_SOURCE_AMOUNT_INVALID');
      const allocatedAmount = Math.min(sourceDebt, remaining);
      allocations.push({
        sourceType: input.direction === 'PAYMENT' ? 'PURCHASE_ORDER' : 'INVOICE',
        sourceId: source.doc.id,
        sourceCode: String(source.data.code || source.data.invoiceCode || source.doc.id),
        amount: allocatedAmount,
        paidAmount: Number(source.data.paidAmount || 0) + allocatedAmount,
        remainingDebt: sourceDebt - allocatedAmount,
        paymentStatus: sourceDebt - allocatedAmount === 0 ? 'PAID' : 'PARTIAL'
      });
      remaining -= allocatedAmount;
    }

    const now = new Date().toISOString();
    const cashCode = `${input.direction === 'PAYMENT' ? 'PC' : 'PT'}-NO-${idempotencyId.slice(0, 8).toUpperCase()}`;
    const note = input.note || (input.direction === 'PAYMENT'
      ? `Thanh toán công nợ nhà cung cấp ${partner.name || input.partnerId}`
      : `Thu công nợ khách hàng ${partner.name || input.partnerId}`);
    const cashTransaction = {
      id: cashTransactionId,
      code: cashCode,
      type: input.direction,
      category: input.direction === 'PAYMENT' ? 'SUPPLIER_DEBT_PAY' : 'CUSTOMER_DEBT_COLLECT',
      categoryName: input.direction === 'PAYMENT' ? 'Chi thanh toán công nợ nhà cung cấp' : 'Thu công nợ khách hàng',
      amount: input.amount,
      branchId,
      fundId: input.fundId,
      fundName: fund.name || '',
      fundType: fund.type,
      date: now,
      partnerId: input.partnerId,
      partyMasterId: partnerIdentity.partyMasterId,
      branchPartyAccountId: partnerIdentity.branchPartyAccountId,
      partnerName: partner.name || '',
      partnerType,
      partnerDebtSettlementId: settlementId,
      allocatedReferences: allocations,
      creator: actor.name || actor.uid,
      creatorUid: actor.uid,
      notes: note,
      status: 'COMPLETED',
      isPLAccounted: false,
      createdAt: now
    };
    const debtTransaction = {
      id: `DEBT_${settlementId}`,
      date: now.slice(0, 10),
      type: 'PAYMENT',
      amount: input.amount,
      note,
      referenceId: settlementId,
      referenceCode: cashCode,
      referenceType: 'PAYMENT',
      direction: input.direction,
      fundId: input.fundId,
      cashTransactionId,
      allocatedReferences: allocations
    };

    for (const allocation of allocations) {
      const source = openSources.find(item => item.doc.id === allocation.sourceId)!;
      const debtSettlementIds = [...new Set([...(Array.isArray(source.data.debtSettlementIds) ? source.data.debtSettlementIds : []), settlementId])];
      const sourceUpdate: any = {
        debtAmount: allocation.remainingDebt,
        paidAmount: allocation.paidAmount,
        paymentStatus: allocation.paymentStatus,
        debtSettlementIds,
        updatedAt: now
      };
      if (allocation.sourceType === 'PURCHASE_ORDER') {
        sourceUpdate.paymentAllocations = [
          ...(Array.isArray(source.data.paymentAllocations) ? source.data.paymentAllocations : []),
          {
            id: `${settlementId}_${allocation.sourceId}`,
            partnerDebtSettlementId: settlementId,
            fundId: input.fundId,
            method: fund.type === 'CASH' ? 'CASH' : 'BANK_TRANSFER',
            amount: allocation.amount,
            createdAt: now,
            createdByUid: actor.uid
          }
        ];
      } else {
        sourceUpdate.debtCollections = [
          ...(Array.isArray(source.data.debtCollections) ? source.data.debtCollections : []),
          {
            id: `${settlementId}_${allocation.sourceId}`,
            partnerDebtSettlementId: settlementId,
            fundId: input.fundId,
            amount: allocation.amount,
            createdAt: now,
            createdByUid: actor.uid
          }
        ];
      }
      transaction.update(source.doc.ref, sourceUpdate);
    }

    const nextFund = {
      ...fund,
      id: fundSnap.id,
      currentBalance: input.direction === 'PAYMENT' ? currentFundBalance - input.amount : currentFundBalance + input.amount,
      totalExpense: Number(fund.totalExpense || 0) + (input.direction === 'PAYMENT' ? input.amount : 0),
      totalIncome: Number(fund.totalIncome || 0) + (input.direction === 'RECEIPT' ? input.amount : 0),
      updatedAt: now
    };
    const nextPartner = {
      ...partner,
      id: partnerSnap.id,
      outstandingDebt: currentDebt - input.amount,
      debtTransactions: [debtTransaction, ...(Array.isArray(partner.debtTransactions) ? partner.debtTransactions : [])].slice(0, 200),
      lastInteraction: now.slice(0, 10),
      updatedAt: now
    };
    transaction.update(fundRef, {
      currentBalance: nextFund.currentBalance,
      totalExpense: nextFund.totalExpense,
      totalIncome: nextFund.totalIncome,
      updatedAt: now
    });
    transaction.update(partnerRef, {
      partyMasterId: partnerIdentity.partyMasterId,
      branchPartyAccountId: partnerIdentity.branchPartyAccountId,
      outstandingDebt: nextPartner.outstandingDebt,
      debtTransactions: nextPartner.debtTransactions,
      lastInteraction: nextPartner.lastInteraction,
      updatedAt: now
    });
    if (!partyMasterSnap.exists) {
      transaction.set(partyMasterRef, newPartyMasterRecord({ id: partnerSnap.id, ...partner }, partnerIdentity, actor.uid, now));
    }
    const account = branchPartyAccountSnap.exists ? branchPartyAccountSnap.data()! : null;
    const balanceField = input.direction === 'PAYMENT' ? 'payableBalance' : 'receivableBalance';
    if (!account) {
      transaction.set(branchPartyAccountRef, newBranchPartyAccountRecord(
        { id: partnerSnap.id, ...partner }, branchId, partnerIdentity, actor.uid, now,
        input.direction === 'PAYMENT'
          ? { payableBalance: nextPartner.outstandingDebt }
          : { receivableBalance: nextPartner.outstandingDebt }
      ));
    } else {
      const accountBalance = Number(account[balanceField] || 0);
      if (!Number.isSafeInteger(accountBalance) || accountBalance + 1 < input.amount) throw new Error('PARTNER_DEBT_ACCOUNT_BALANCE_MISMATCH');
      transaction.update(branchPartyAccountRef, {
        [balanceField]: Math.max(0, accountBalance - input.amount),
        updatedAt: now,
        updatedByUid: actor.uid
      });
    }
    const debtLedgerId = `DLE_${settlementId}`;
    transaction.set(db.collection('debtLedgerEntries').doc(debtLedgerId), debtLedgerEntry({
      id: debtLedgerId,
      branchId,
      partyAccountId: partnerIdentity.branchPartyAccountId,
      partyMasterId: partnerIdentity.partyMasterId,
      legacyPartnerId: input.partnerId,
      direction: input.direction === 'PAYMENT' ? 'PAYABLE' : 'RECEIVABLE',
      sourceType: 'PAYMENT',
      sourceDocumentId: settlementId,
      sourceDocumentCode: cashCode,
      creditDecrease: input.amount,
      actorUid: actor.uid,
      occurredAt: now,
      note
    }));
    transaction.set(db.collection('cashTransactions').doc(cashTransactionId), cashTransaction);
    transaction.set(db.collection('partnerDebtSettlements').doc(settlementId), {
      id: settlementId,
      partnerId: input.partnerId,
      partyMasterId: partnerIdentity.partyMasterId,
      branchPartyAccountId: partnerIdentity.branchPartyAccountId,
      partnerName: partner.name || '',
      partnerType,
      branchId,
      fundId: input.fundId,
      direction: input.direction,
      amount: input.amount,
      allocations,
      unallocatedAmount: remaining,
      cashTransactionId,
      note,
      status: 'COMPLETED',
      actorUid: actor.uid,
      createdAt: now
    });
    transaction.set(idemRef, {
      id: idempotencyId,
      settlementId,
      payloadHash,
      cashTransaction,
      allocations,
      unallocatedAmount: remaining,
      createdAt: now,
      actorUid: actor.uid
    });

    return {
      settlementId,
      partner: nextPartner,
      fund: nextFund,
      cashTransaction,
      allocations,
      unallocatedAmount: remaining
    };
  });
}
