import crypto from 'node:crypto';
import { Firestore } from 'firebase-admin/firestore';
import {
  assertDebtOpenItemScope,
  assertPartnerForBranch,
  debtOpenItemAllocationKey,
  debtOpenItemId,
  debtLedgerEntry,
  newBranchPartyAccountRecord,
  newDebtOpenItemRecord,
  newPartyMasterRecord,
  resolvePartyIdentity,
  settleDebtOpenItemRecord,
  type DebtDirection,
  type DebtOpenItemSourceType
} from './branchPartyService';
import { parseVnd } from '../utils/financeIntegrity';

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
  sourceType: DebtOpenItemSourceType;
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

function requireNonNegativeWholeVnd(value: unknown, errorCode: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(errorCode);
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
    amount: parseVnd(raw.amount, { field: 'PARTNER_DEBT_AMOUNT' }),
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
    const branchId = String(fund.branchId || '').trim();
    if (!canAccessBranch(actor, branchId)) throw new Error('PARTNER_DEBT_BRANCH_FORBIDDEN');
    if (idemSnap.exists) {
      const idem = idemSnap.data()!;
      if (idem.payloadHash !== payloadHash || String(idem.actorUid || '') !== actor.uid || String(idem.branchId || '') !== branchId) {
        throw new Error('PARTNER_DEBT_IDEMPOTENCY_CONFLICT');
      }
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

    const currentFundBalance = parseVnd(fund.currentBalance ?? 0, {
      allowZero: true,
      field: 'PARTNER_DEBT_FUND_BALANCE',
      max: Number.MAX_SAFE_INTEGER
    });
    if (input.direction === 'PAYMENT' && currentFundBalance < input.amount) throw new Error('INSUFFICIENT_FUNDS');

    const debtDirection: DebtDirection = input.direction === 'PAYMENT' ? 'PAYABLE' : 'RECEIVABLE';
    const allocationKey = debtOpenItemAllocationKey(partnerIdentity.branchPartyAccountId, debtDirection);
    const openItemQuery = db.collection('debtOpenItems').where('allocationKey', '==', allocationKey).limit(101);
    const openItemSnap = await transaction.get(openItemQuery);
    const emptyQuerySnapshot = { docs: [] as any[] };
    // Always discover open legacy source documents as well as canonical items.
    // During rollout a partner can legitimately have both: skipping these
    // queries as soon as one canonical item exists makes the remaining balance
    // impossible to settle. sourceDocuments below de-duplicates by type + id,
    // while deterministic open-item reads prevent an already-closed item from
    // being recreated.
    const [purchaseSourceSnap, invoiceSourceSnap, technicalSourceSnap] = await Promise.all([
      input.direction === 'PAYMENT'
        ? transaction.get(db.collection('purchaseOrders').where('supplierId', '==', input.partnerId).where('debtAmount', '>', 0).limit(101))
        : Promise.resolve(emptyQuerySnapshot),
      input.direction === 'RECEIPT'
        ? transaction.get(db.collection('invoices').where('customerId', '==', input.partnerId).where('debtAmount', '>', 0).limit(101))
        : Promise.resolve(emptyQuerySnapshot),
      input.direction === 'RECEIPT'
        ? transaction.get(db.collection('technicalWorkOrders').where('customerId', '==', input.partnerId).where('balanceDue', '>', 0).limit(101))
        : Promise.resolve(emptyQuerySnapshot)
    ]);
    if (openItemSnap.docs.length > 100 || purchaseSourceSnap.docs.length > 100 || invoiceSourceSnap.docs.length > 100 || technicalSourceSnap.docs.length > 100) {
      throw new Error('PARTNER_DEBT_TOO_MANY_REFERENCES');
    }

    type CanonicalSource = {
      sourceType: DebtOpenItemSourceType;
      doc: any;
      data: any;
      debtAmount: number;
      openItemRef: any;
      openItem: any;
      openItemExists: boolean;
      occurredAt: string;
    };
    const sourceDocuments = new Map<string, { sourceType: DebtOpenItemSourceType; doc: any; data: any }>();
    const addSourceDocuments = (sourceType: DebtOpenItemSourceType, docs: any[]) => docs.forEach(doc => {
      sourceDocuments.set(`${sourceType}:${doc.id}`, { sourceType, doc, data: doc.data() });
    });
    addSourceDocuments('PURCHASE_ORDER', purchaseSourceSnap.docs);
    addSourceDocuments('INVOICE', invoiceSourceSnap.docs);
    addSourceDocuments('TECHNICAL_WORK_ORDER', technicalSourceSnap.docs);

    const existingOpenItems = new Map<string, { doc: any; data: any }>();
    for (const doc of openItemSnap.docs) {
      const item = doc.data();
      const sourceType = String(item.sourceType || '') as DebtOpenItemSourceType;
      if (!['PURCHASE_ORDER', 'INVOICE', 'TECHNICAL_WORK_ORDER'].includes(sourceType)) {
        throw new Error('PARTNER_DEBT_OPEN_ITEM_SOURCE_UNSUPPORTED');
      }
      const sourceId = String(item.sourceId || item.sourceDocumentId || '').trim();
      if (!sourceId) throw new Error('PARTNER_DEBT_OPEN_ITEM_SOURCE_INVALID');
      const openItemSourceKey = `${sourceType}:${sourceId}`;
      if (existingOpenItems.has(openItemSourceKey)) {
        throw new Error('PARTNER_DEBT_OPEN_ITEM_DUPLICATE: Một chứng từ đang có nhiều open-item; cần chạy đối soát trước khi thu/chi công nợ.');
      }
      existingOpenItems.set(openItemSourceKey, { doc, data: item });
      if (!sourceDocuments.has(openItemSourceKey)) {
        const collection = sourceType === 'PURCHASE_ORDER' ? 'purchaseOrders'
          : sourceType === 'INVOICE' ? 'invoices' : 'technicalWorkOrders';
        const sourceDoc = await transaction.get(db.collection(collection).doc(sourceId));
        if (!sourceDoc.exists) throw new Error('PARTNER_DEBT_OPEN_ITEM_SOURCE_NOT_FOUND');
        sourceDocuments.set(openItemSourceKey, { sourceType, doc: sourceDoc, data: sourceDoc.data() });
      }
    }
    if (sourceDocuments.size > 100) throw new Error('PARTNER_DEBT_TOO_MANY_REFERENCES');
    // Closed legacy items no longer carry allocationKey, so the account-level
    // query above cannot see them. Discover every item attached to each source
    // through both field names used during the rollout. This must happen before
    // the deterministic document read; otherwise an already-settled legacy item
    // could be silently recreated under the canonical ID and reopen the debt.
    const sourceOpenItemResults = await Promise.all([...sourceDocuments.values()].map(async source => {
      const [sourceIdSnap, sourceDocumentIdSnap] = await Promise.all([
        transaction.get(db.collection('debtOpenItems')
          .where('sourceType', '==', source.sourceType)
          .where('sourceId', '==', source.doc.id)
          .limit(3)),
        transaction.get(db.collection('debtOpenItems')
          .where('sourceType', '==', source.sourceType)
          .where('sourceDocumentId', '==', source.doc.id)
          .limit(3))
      ]);
      return { source, docs: [...sourceIdSnap.docs, ...sourceDocumentIdSnap.docs] };
    }));
    for (const { source, docs } of sourceOpenItemResults) {
      const key = `${source.sourceType}:${source.doc.id}`;
      const uniqueDocs = new Map<string, any>();
      for (const doc of docs) uniqueDocs.set(doc.id, doc);
      const allocationItem = existingOpenItems.get(key);
      if (allocationItem) uniqueDocs.set(allocationItem.doc.id, allocationItem.doc);
      if (uniqueDocs.size > 1) {
        throw new Error('PARTNER_DEBT_OPEN_ITEM_DUPLICATE: Một chứng từ đang có nhiều open-item; cần chạy đối soát trước khi thu/chi công nợ.');
      }
      const discovered = [...uniqueDocs.values()][0];
      if (discovered) existingOpenItems.set(key, { doc: discovered, data: discovered.data() });
    }
    // Always read the deterministic document too. A closed or malformed item
    // intentionally has no allocationKey and must never be silently overwritten
    // (which would reopen already-settled debt).
    for (const [key, source] of sourceDocuments) {
      const deterministicRef = db.collection('debtOpenItems').doc(
        debtOpenItemId(source.sourceType, source.doc.id, debtDirection)
      );
      const deterministicSnap = await transaction.get(deterministicRef);
      const existing = existingOpenItems.get(key);
      if (existing) {
        if (existing.doc.id !== deterministicRef.id) {
          if (deterministicSnap.exists) {
            throw new Error('PARTNER_DEBT_OPEN_ITEM_DUPLICATE: Một chứng từ đang có cả open-item legacy và canonical; cần chạy đối soát trước khi thu/chi công nợ.');
          }
          throw new Error('PARTNER_DEBT_OPEN_ITEM_MIGRATION_REQUIRED: Open-item legacy phải được chuyển sang ID canonical bằng công cụ đối soát trước khi thu/chi công nợ.');
        }
        continue;
      }
      if (deterministicSnap.exists) existingOpenItems.set(key, { doc: deterministicSnap, data: deterministicSnap.data() });
    }

    const migrationNow = new Date().toISOString();
    const canonicalSources: CanonicalSource[] = [];
    for (const [key, source] of sourceDocuments) {
      const status = String(source.data.status || '').toUpperCase();
      const expectedPartnerId = source.sourceType === 'PURCHASE_ORDER'
        ? String(source.data.supplierId || '')
        : String(source.data.customerId || '');
      const debtAmountValue = source.sourceType === 'TECHNICAL_WORK_ORDER'
        ? source.data.balanceDue
        : source.data.debtAmount;
      const debtAmount = Number(debtAmountValue || 0);
      const hasExistingOpenItem = existingOpenItems.has(key);
      if (String(source.data.branchId || '') !== branchId || expectedPartnerId !== input.partnerId) {
        if (hasExistingOpenItem) throw new Error('PARTNER_DEBT_OPEN_ITEM_SOURCE_SCOPE_MISMATCH');
        continue;
      }
      if (['CANCELLED', 'REVERSED'].includes(status) || debtAmount <= 0) {
        if (hasExistingOpenItem) {
          const closedItem = existingOpenItems.get(key)!.data;
          assertDebtOpenItemScope(closedItem, {
            branchId,
            partyAccountId: partnerIdentity.branchPartyAccountId,
            partyMasterId: partnerIdentity.partyMasterId,
            legacyPartnerId: input.partnerId,
            direction: debtDirection,
            sourceType: source.sourceType,
            sourceDocumentId: source.doc.id,
            openAmount: 0
          });
        }
        continue;
      }
      const normalizedDebtAmount = requireWholeVnd(debtAmount, 'PARTNER_DEBT_SOURCE_AMOUNT_INVALID');
      const existing = existingOpenItems.get(key);
      const sourceCode = String(source.data.code || source.data.invoiceCode || source.doc.id);
      const settledFromCollections = source.sourceType === 'INVOICE'
        ? (Array.isArray(source.data.debtCollections) ? source.data.debtCollections : []).reduce((sum: number, entry: any) => {
          const amount = requireNonNegativeWholeVnd(entry?.amount || 0, 'PARTNER_DEBT_SOURCE_AMOUNT_INVALID');
          const next = sum + amount;
          if (!Number.isSafeInteger(next)) throw new Error('PARTNER_DEBT_SOURCE_AMOUNT_INVALID');
          return next;
        }, 0)
        : requireNonNegativeWholeVnd(source.data.paidAmount || 0, 'PARTNER_DEBT_SOURCE_AMOUNT_INVALID');
      const occurredAtRaw = source.data.orderDate || source.data.deliveredAt || source.data.createdAt || source.data.date;
      const occurredAt = typeof occurredAtRaw === 'string' && occurredAtRaw ? occurredAtRaw : migrationNow;
      const openItem = existing?.data || newDebtOpenItemRecord({
        branchId,
        partyAccountId: partnerIdentity.branchPartyAccountId,
        partyMasterId: partnerIdentity.partyMasterId,
        legacyPartnerId: input.partnerId,
        direction: debtDirection,
        sourceType: source.sourceType,
        sourceDocumentId: source.doc.id,
        sourceDocumentCode: sourceCode,
        originalAmount: settledFromCollections + normalizedDebtAmount,
        settledAmount: settledFromCollections,
        actorUid: actor.uid,
        occurredAt
      });
      assertDebtOpenItemScope(openItem, {
        branchId,
        partyAccountId: partnerIdentity.branchPartyAccountId,
        partyMasterId: partnerIdentity.partyMasterId,
        legacyPartnerId: input.partnerId,
        direction: debtDirection,
        sourceType: source.sourceType,
        sourceDocumentId: source.doc.id,
        openAmount: normalizedDebtAmount
      });
      canonicalSources.push({
        ...source,
        debtAmount: normalizedDebtAmount,
        openItemRef: db.collection('debtOpenItems').doc(debtOpenItemId(source.sourceType, source.doc.id, debtDirection)),
        openItem,
        openItemExists: Boolean(existing),
        occurredAt
      });
    }
    canonicalSources.sort((a, b) => sourceDate({ createdAt: a.occurredAt }) - sourceDate({ createdAt: b.occurredAt }) || a.doc.id.localeCompare(b.doc.id));
    const openSourceDebt = canonicalSources.reduce((total, source) => {
      const next = total + source.debtAmount;
      if (!Number.isSafeInteger(next)) throw new Error('PARTNER_DEBT_SOURCE_AMOUNT_INVALID');
      return next;
    }, 0);
    const balanceField = input.direction === 'PAYMENT' ? 'payableBalance' : 'receivableBalance';
    let currentPayableBalance = 0;
    let currentReceivableBalance = 0;
    if (branchPartyAccountSnap.exists) {
      const account = branchPartyAccountSnap.data()!;
      currentPayableBalance = requireNonNegativeWholeVnd(
        account.payableBalance || 0,
        'PARTNER_DEBT_ACCOUNT_BALANCE_INVALID'
      );
      currentReceivableBalance = requireNonNegativeWholeVnd(
        account.receivableBalance || 0,
        'PARTNER_DEBT_ACCOUNT_BALANCE_INVALID'
      );
    } else {
      if (partnerType === 'BOTH') throw new Error('PARTNER_DEBT_ACCOUNT_REQUIRED_FOR_BOTH');
      if (input.direction === 'PAYMENT') currentPayableBalance = openSourceDebt;
      else currentReceivableBalance = openSourceDebt;
    }
    const currentDirectionalBalance = input.direction === 'PAYMENT'
      ? currentPayableBalance
      : currentReceivableBalance;
    if (currentDirectionalBalance < openSourceDebt) {
      throw new Error('PARTNER_DEBT_ACCOUNT_BALANCE_MISMATCH');
    }
    if (currentDirectionalBalance > openSourceDebt) {
      throw new Error('PARTNER_DEBT_OPEN_ITEMS_INCOMPLETE');
    }
    if (input.amount > currentDirectionalBalance) throw new Error('PARTNER_DEBT_AMOUNT_EXCEEDS_BALANCE');
    if (input.amount > openSourceDebt) throw new Error('PARTNER_DEBT_SOURCE_BALANCE_MISMATCH');

    let remaining = input.amount;
    const allocations: PartnerDebtAllocation[] = [];
    for (const source of canonicalSources) {
      if (remaining <= 0) break;
      if (allocations.length >= 100) throw new Error('PARTNER_DEBT_TOO_MANY_REFERENCES');
      const sourceDebt = source.debtAmount;
      const allocatedAmount = Math.min(sourceDebt, remaining);
      allocations.push({
        sourceType: source.sourceType,
        sourceId: source.doc.id,
        sourceCode: String(source.data.code || source.data.invoiceCode || source.doc.id),
        amount: allocatedAmount,
        paidAmount: Number(source.data.paidAmount || 0) + allocatedAmount,
        remainingDebt: sourceDebt - allocatedAmount,
        paymentStatus: sourceDebt - allocatedAmount === 0 ? 'PAID' : 'PARTIAL'
      });
      remaining -= allocatedAmount;
    }
    if (remaining !== 0) throw new Error('PARTNER_DEBT_SOURCE_BALANCE_MISMATCH');

    const nextPayableBalance = input.direction === 'PAYMENT'
      ? currentPayableBalance - input.amount
      : currentPayableBalance;
    const nextReceivableBalance = input.direction === 'RECEIPT'
      ? currentReceivableBalance - input.amount
      : currentReceivableBalance;

    const now = migrationNow;
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

    for (const source of canonicalSources) {
      const allocation = allocations.find(item => item.sourceType === source.sourceType && item.sourceId === source.doc.id);
      if (!allocation) {
        if (!source.openItemExists) transaction.set(source.openItemRef, source.openItem);
        continue;
      }
      const debtSettlementIds = [...new Set([...(Array.isArray(source.data.debtSettlementIds) ? source.data.debtSettlementIds : []), settlementId])];
      const sourceUpdate: any = {
        paidAmount: allocation.paidAmount,
        paymentStatus: allocation.paymentStatus,
        debtSettlementIds,
        updatedAt: now
      };
      if (allocation.sourceType === 'TECHNICAL_WORK_ORDER') sourceUpdate.balanceDue = allocation.remainingDebt;
      else sourceUpdate.debtAmount = allocation.remainingDebt;
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
      if (allocation.sourceType === 'TECHNICAL_WORK_ORDER') {
        const repairPaymentId = `REPAIR_PAYMENT_${settlementId}_${allocation.sourceId}`;
        transaction.set(db.collection('repairPayments').doc(repairPaymentId), {
          id: repairPaymentId,
          workOrderId: allocation.sourceId,
          workOrderCode: allocation.sourceCode,
          branchId,
          customerId: input.partnerId,
          customerName: partner.name || source.data.customerName || '',
          partyMasterId: partnerIdentity.partyMasterId,
          branchPartyAccountId: partnerIdentity.branchPartyAccountId,
          amount: allocation.amount,
          paymentMethod: String(fund.type || '').toUpperCase() === 'CASH' ? 'CASH' : 'BANK',
          fundId: input.fundId,
          partnerDebtSettlementId: settlementId,
          collectedByUid: actor.uid,
          collectedByName: actor.name || actor.uid,
          collectedAt: now,
          note,
          status: 'PAID',
          createdAt: now
        });
      }
      transaction.set(source.openItemRef, {
        ...source.openItem,
        ...settleDebtOpenItemRecord(source.openItem, allocation.amount, {
          settlementId,
          actorUid: actor.uid,
          occurredAt: now
        })
      });
    }

    const currentTotalExpense = parseVnd(fund.totalExpense ?? 0, {
      allowZero: true,
      field: 'PARTNER_DEBT_FUND_TOTAL_EXPENSE',
      max: Number.MAX_SAFE_INTEGER
    });
    const currentTotalIncome = parseVnd(fund.totalIncome ?? 0, {
      allowZero: true,
      field: 'PARTNER_DEBT_FUND_TOTAL_INCOME',
      max: Number.MAX_SAFE_INTEGER
    });
    const nextFundBalance = input.direction === 'PAYMENT'
      ? currentFundBalance - input.amount
      : currentFundBalance + input.amount;
    const nextTotalExpense = currentTotalExpense + (input.direction === 'PAYMENT' ? input.amount : 0);
    const nextTotalIncome = currentTotalIncome + (input.direction === 'RECEIPT' ? input.amount : 0);
    parseVnd(nextFundBalance, { allowZero: true, field: 'PARTNER_DEBT_FUND_BALANCE', max: Number.MAX_SAFE_INTEGER });
    parseVnd(nextTotalExpense, { allowZero: true, field: 'PARTNER_DEBT_FUND_TOTAL_EXPENSE', max: Number.MAX_SAFE_INTEGER });
    parseVnd(nextTotalIncome, { allowZero: true, field: 'PARTNER_DEBT_FUND_TOTAL_INCOME', max: Number.MAX_SAFE_INTEGER });
    const nextFund = {
      ...fund,
      id: fundSnap.id,
      currentBalance: nextFundBalance,
      totalExpense: nextTotalExpense,
      totalIncome: nextTotalIncome,
      updatedAt: now
    };
    const nextPartner = {
      ...partner,
      id: partnerSnap.id,
      // outstandingDebt is retained as a legacy read projection only. BOTH is
      // represented as gross exposure so reducing one direction never hides or
      // mutates the other; all mutations validate the directional account.
      outstandingDebt: partnerType === 'BOTH'
        ? nextPayableBalance + nextReceivableBalance
        : input.direction === 'PAYMENT' ? nextPayableBalance : nextReceivableBalance,
      payableOutstandingDebt: nextPayableBalance,
      receivableOutstandingDebt: nextReceivableBalance,
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
      payableOutstandingDebt: nextPartner.payableOutstandingDebt,
      receivableOutstandingDebt: nextPartner.receivableOutstandingDebt,
      debtTransactions: nextPartner.debtTransactions,
      lastInteraction: nextPartner.lastInteraction,
      updatedAt: now
    });
    if (!partyMasterSnap.exists) {
      transaction.set(partyMasterRef, newPartyMasterRecord({ id: partnerSnap.id, ...partner }, partnerIdentity, actor.uid, now));
    }
    const account = branchPartyAccountSnap.exists ? branchPartyAccountSnap.data()! : null;
    if (!account) {
      transaction.set(branchPartyAccountRef, newBranchPartyAccountRecord(
        { id: partnerSnap.id, ...partner }, branchId, partnerIdentity, actor.uid, now,
        { payableBalance: nextPayableBalance, receivableBalance: nextReceivableBalance }
      ));
    } else {
      transaction.update(branchPartyAccountRef, {
        [balanceField]: input.direction === 'PAYMENT' ? nextPayableBalance : nextReceivableBalance,
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
      balanceField,
      canonicalBalanceBefore: currentDirectionalBalance,
      canonicalBalanceAfter: input.direction === 'PAYMENT' ? nextPayableBalance : nextReceivableBalance,
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
      branchId,
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
