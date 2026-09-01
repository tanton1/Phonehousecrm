import crypto from 'node:crypto';
import { FieldValue, Firestore } from 'firebase-admin/firestore';

export type BranchPartyType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH' | 'STAFF';
export type DebtDirection = 'RECEIVABLE' | 'PAYABLE';
export type DebtOpenItemSourceType = 'PURCHASE_ORDER' | 'INVOICE' | 'TECHNICAL_WORK_ORDER';
export type DebtOpenItemStatus = 'OPEN' | 'PARTIAL' | 'SETTLED' | 'REVERSED';
export type DebtLedgerSourceType =
  | 'PURCHASE_ORDER'
  | 'INVOICE'
  | 'TECHNICAL_WORK_ORDER'
  | 'PAYMENT'
  | 'REFUND'
  | 'ADJUSTMENT'
  | 'INTER_BRANCH_TRANSFER';

export interface PartyIdentity {
  partyMasterId: string;
  branchPartyAccountId: string;
  phoneNormalized: string;
  taxCodeNormalized: string;
}

function hashId(prefix: string, value: string, length = 24): string {
  return `${prefix}_${crypto.createHash('sha256').update(value).digest('hex').slice(0, length).toUpperCase()}`;
}

function requireDebtMoney(value: unknown, field: string, allowZero = true): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || (!allowZero && amount === 0)) {
    throw new Error(`${field}_INVALID`);
  }
  return amount;
}

export function debtOpenItemId(
  sourceType: DebtOpenItemSourceType,
  sourceDocumentId: string,
  direction: DebtDirection
): string {
  const normalizedSourceId = String(sourceDocumentId || '').trim();
  if (!normalizedSourceId) throw new Error('DEBT_OPEN_ITEM_SOURCE_REQUIRED');
  return hashId('DOI', `${sourceType}:${normalizedSourceId}:${direction}`, 32);
}

export function debtOpenItemAllocationKey(partyAccountId: string, direction: DebtDirection): string {
  const normalizedAccountId = String(partyAccountId || '').trim();
  if (!normalizedAccountId) throw new Error('DEBT_OPEN_ITEM_ACCOUNT_REQUIRED');
  return `${normalizedAccountId}:${direction}:OPEN`;
}

export function newDebtOpenItemRecord(input: {
  branchId: string;
  partyAccountId: string;
  partyMasterId: string;
  legacyPartnerId: string;
  direction: DebtDirection;
  sourceType: DebtOpenItemSourceType;
  sourceDocumentId: string;
  sourceDocumentCode?: string;
  originalAmount: number;
  settledAmount?: number;
  reversedAmount?: number;
  dueDate?: string | null;
  actorUid: string;
  occurredAt: string;
}) {
  const originalAmount = requireDebtMoney(input.originalAmount, 'DEBT_OPEN_ITEM_ORIGINAL_AMOUNT', false);
  const settledAmount = requireDebtMoney(input.settledAmount || 0, 'DEBT_OPEN_ITEM_SETTLED_AMOUNT');
  const reversedAmount = requireDebtMoney(input.reversedAmount || 0, 'DEBT_OPEN_ITEM_REVERSED_AMOUNT');
  if (settledAmount + reversedAmount > originalAmount) throw new Error('DEBT_OPEN_ITEM_AMOUNT_MISMATCH');
  const openAmount = originalAmount - settledAmount - reversedAmount;
  const status: DebtOpenItemStatus = openAmount > 0
    ? settledAmount > 0 || reversedAmount > 0 ? 'PARTIAL' : 'OPEN'
    : reversedAmount > 0 ? 'REVERSED' : 'SETTLED';
  const id = debtOpenItemId(input.sourceType, input.sourceDocumentId, input.direction);
  return {
    id,
    branchId: String(input.branchId || '').trim(),
    partyAccountId: String(input.partyAccountId || '').trim(),
    partyMasterId: String(input.partyMasterId || '').trim(),
    legacyPartnerId: String(input.legacyPartnerId || '').trim(),
    direction: input.direction,
    sourceType: input.sourceType,
    sourceId: String(input.sourceDocumentId || '').trim(),
    sourceCode: String(input.sourceDocumentCode || input.sourceDocumentId).trim(),
    sourceDocumentId: String(input.sourceDocumentId || '').trim(),
    sourceDocumentCode: String(input.sourceDocumentCode || input.sourceDocumentId).trim(),
    originalAmount,
    settledAmount,
    reversedAmount,
    openAmount,
    status,
    isOpen: openAmount > 0,
    allocationKey: openAmount > 0 ? debtOpenItemAllocationKey(input.partyAccountId, input.direction) : null,
    dueDate: input.dueDate || null,
    settlementCount: 0,
    lastSettlementId: null,
    openedAt: input.occurredAt,
    openedByUid: input.actorUid,
    occurredAt: input.occurredAt,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    updatedByUid: input.actorUid
  };
}

function assertDebtOpenItemInvariant(item: any): { originalAmount: number; settledAmount: number; reversedAmount: number; openAmount: number } {
  const originalAmount = requireDebtMoney(item?.originalAmount, 'DEBT_OPEN_ITEM_ORIGINAL_AMOUNT', false);
  const settledAmount = requireDebtMoney(item?.settledAmount || 0, 'DEBT_OPEN_ITEM_SETTLED_AMOUNT');
  const reversedAmount = requireDebtMoney(item?.reversedAmount ?? item?.cancelledAmount ?? 0, 'DEBT_OPEN_ITEM_REVERSED_AMOUNT');
  const openAmount = requireDebtMoney(item?.openAmount, 'DEBT_OPEN_ITEM_OPEN_AMOUNT');
  if (originalAmount !== settledAmount + reversedAmount + openAmount) throw new Error('DEBT_OPEN_ITEM_AMOUNT_MISMATCH');
  return { originalAmount, settledAmount, reversedAmount, openAmount };
}

export function settleDebtOpenItemRecord(
  item: any,
  amountValue: unknown,
  input: { settlementId: string; actorUid: string; occurredAt: string }
) {
  const amount = requireDebtMoney(amountValue, 'DEBT_OPEN_ITEM_SETTLEMENT_AMOUNT', false);
  const current = assertDebtOpenItemInvariant(item);
  if (String(item?.status || '').toUpperCase() === 'REVERSED') throw new Error('DEBT_OPEN_ITEM_REVERSED');
  if (amount > current.openAmount) throw new Error('DEBT_OPEN_ITEM_SETTLEMENT_EXCEEDS_OPEN');
  const openAmount = current.openAmount - amount;
  const settledAmount = current.settledAmount + amount;
  return {
    settledAmount,
    openAmount,
    status: openAmount === 0 ? 'SETTLED' : 'PARTIAL',
    isOpen: openAmount > 0,
    allocationKey: openAmount > 0 ? debtOpenItemAllocationKey(item.partyAccountId, item.direction) : null,
    settlementCount: requireDebtMoney(item?.settlementCount || 0, 'DEBT_OPEN_ITEM_SETTLEMENT_COUNT') + 1,
    lastSettlementId: String(input.settlementId || '').trim(),
    lastSettledAt: input.occurredAt,
    updatedAt: input.occurredAt,
    updatedByUid: input.actorUid
  };
}

export function assertDebtOpenItemScope(item: any, expected: {
  branchId: string;
  partyAccountId: string;
  partyMasterId?: string;
  legacyPartnerId?: string;
  direction: DebtDirection;
  sourceType: DebtOpenItemSourceType;
  sourceDocumentId: string;
  openAmount?: number;
}): void {
  if (String(item?.branchId || '') !== expected.branchId) throw new Error('DEBT_OPEN_ITEM_BRANCH_MISMATCH');
  if (String(item?.partyAccountId || '') !== expected.partyAccountId) throw new Error('DEBT_OPEN_ITEM_ACCOUNT_MISMATCH');
  if (expected.partyMasterId && String(item?.partyMasterId || '') !== expected.partyMasterId) throw new Error('DEBT_OPEN_ITEM_IDENTITY_MISMATCH');
  if (expected.legacyPartnerId && String(item?.legacyPartnerId || '') !== expected.legacyPartnerId) throw new Error('DEBT_OPEN_ITEM_PARTNER_MISMATCH');
  if (String(item?.direction || '') !== expected.direction) throw new Error('DEBT_OPEN_ITEM_DIRECTION_MISMATCH');
  if (String(item?.sourceType || '') !== expected.sourceType) throw new Error('DEBT_OPEN_ITEM_SOURCE_TYPE_MISMATCH');
  if (String(item?.sourceDocumentId || '') !== expected.sourceDocumentId) throw new Error('DEBT_OPEN_ITEM_SOURCE_MISMATCH');
  if (expected.openAmount !== undefined && Number(item?.openAmount) !== expected.openAmount) throw new Error('DEBT_OPEN_ITEM_SOURCE_BALANCE_MISMATCH');
  assertDebtOpenItemInvariant(item);
}

export function cancelDebtOpenItemRecord(
  item: any,
  amountValue: unknown,
  input: { cancellationId: string; reason?: string; actorUid: string; occurredAt: string }
) {
  const amount = requireDebtMoney(amountValue, 'DEBT_OPEN_ITEM_CANCELLATION_AMOUNT');
  const current = assertDebtOpenItemInvariant(item);
  if (amount > current.openAmount) throw new Error('DEBT_OPEN_ITEM_CANCELLATION_EXCEEDS_OPEN');
  const openAmount = current.openAmount - amount;
  const reversedAmount = current.reversedAmount + amount;
  return {
    reversedAmount,
    openAmount,
    status: openAmount === 0 ? 'REVERSED' : 'PARTIAL',
    isOpen: openAmount > 0,
    allocationKey: openAmount > 0 ? debtOpenItemAllocationKey(item.partyAccountId, item.direction) : null,
    lastCancellationId: String(input.cancellationId || '').trim(),
    lastCancelledAt: input.occurredAt,
    cancellationReason: String(input.reason || '').trim(),
    updatedAt: input.occurredAt,
    updatedByUid: input.actorUid
  };
}

export function normalizePartyPhone(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 10) return `0${digits.slice(2)}`;
  return digits;
}

export function normalizePartyTaxCode(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

/**
 * Produces stable IDs for the shared identity and its branch-owned account.
 * Existing references always win so editing a phone/tax code can never silently
 * move an already-posted document to another account.
 */
export function resolvePartyIdentity(partner: any, branchId: string): PartyIdentity {
  const phoneNormalized = normalizePartyPhone(partner?.phone);
  const taxCodeNormalized = normalizePartyTaxCode(partner?.taxCode);
  const identityKey = taxCodeNormalized ? `TAX:${taxCodeNormalized}` : `PHONE:${phoneNormalized}`;
  if (!taxCodeNormalized && !phoneNormalized) throw new Error('PARTY_IDENTITY_REQUIRED');
  const partyMasterId = String(partner?.partyMasterId || '').trim() || hashId('PTY', identityKey);
  const branchPartyAccountId = String(partner?.branchPartyAccountId || '').trim()
    || hashId('BPA', `${branchId}:${partyMasterId}`);
  return { partyMasterId, branchPartyAccountId, phoneNormalized, taxCodeNormalized };
}

export function assertPartnerForBranch(
  partner: any,
  branchId: string,
  allowedTypes: BranchPartyType[],
  errorPrefix: string
): void {
  const partnerBranchId = String(partner?.branchId || '').trim();
  if (!partnerBranchId || partnerBranchId === 'ALL') throw new Error(`${errorPrefix}_BRANCH_REQUIRED`);
  if (partnerBranchId !== branchId) throw new Error(`${errorPrefix}_BRANCH_MISMATCH`);
  if (partner?.isActive === false || partner?.isArchived === true) throw new Error(`${errorPrefix}_INACTIVE`);
  const type = String(partner?.type || '').trim().toUpperCase() as BranchPartyType;
  if (!allowedTypes.includes(type)) throw new Error(`${errorPrefix}_TYPE_INVALID`);
}

export function newPartyMasterRecord(partner: any, identity: PartyIdentity, actorUid: string, now: string) {
  return {
    id: identity.partyMasterId,
    displayName: String(partner?.name || '').trim(),
    legalName: String(partner?.name || '').trim(),
    phoneNormalized: identity.phoneNormalized,
    taxCodeNormalized: identity.taxCodeNormalized,
    email: String(partner?.email || '').trim(),
    address: String(partner?.address || '').trim(),
    status: 'ACTIVE',
    createdByUid: actorUid,
    createdAt: now,
    updatedAt: now
  };
}

export function newBranchPartyAccountRecord(
  partner: any,
  branchId: string,
  identity: PartyIdentity,
  actorUid: string,
  now: string,
  initial?: { receivableBalance?: number; payableBalance?: number }
) {
  return {
    id: identity.branchPartyAccountId,
    branchId,
    partyMasterId: identity.partyMasterId,
    legacyPartnerId: String(partner?.id || '').trim(),
    type: String(partner?.type || '').trim().toUpperCase(),
    code: String(partner?.code || partner?.id || identity.branchPartyAccountId).trim(),
    creditLimit: Number(partner?.creditLimit || 0),
    paymentTermDays: Number(partner?.paymentTermDays || 0),
    receivableBalance: Number(initial?.receivableBalance || 0),
    payableBalance: Number(initial?.payableBalance || 0),
    totalSales: Number(partner?.totalSalesTo || partner?.totalSpent || 0),
    totalPurchases: Number(partner?.totalPurchasedFrom || 0),
    status: partner?.isActive === false || partner?.isArchived === true ? 'ARCHIVED' : 'ACTIVE',
    createdByUid: actorUid,
    createdAt: now,
    updatedAt: now
  };
}

export function mergeBranchPartyType(current: unknown, requested: unknown): BranchPartyType {
  const left = String(current || '').trim().toUpperCase() as BranchPartyType;
  const right = String(requested || '').trim().toUpperCase() as BranchPartyType;
  if (!left) return right;
  if (!right || left === right) return left;
  if (left === 'BOTH' || right === 'BOTH') return 'BOTH';
  if (new Set([left, right]).size === 2 && [left, right].every(type => type === 'CUSTOMER' || type === 'SUPPLIER')) {
    return 'BOTH';
  }
  throw new Error('PARTNER_ACCOUNT_TYPE_CONFLICT');
}

export function resolveLegacyDirectionalBalances(
  partner: any,
  errorPrefix = 'PARTNER'
): { payableBalance: number; receivableBalance: number } {
  const type = String(partner?.type || '').trim().toUpperCase() as BranchPartyType;
  const scalar = Number(partner?.outstandingDebt || 0);
  if (!Number.isSafeInteger(scalar) || scalar < 0) throw new Error(`${errorPrefix}_DEBT_PROJECTION_INVALID`);
  const explicitPayable = partner?.payableOutstandingDebt;
  const explicitReceivable = partner?.receivableOutstandingDebt;
  const hasPayable = explicitPayable !== undefined && explicitPayable !== null;
  const hasReceivable = explicitReceivable !== undefined && explicitReceivable !== null;
  const payable = hasPayable ? Number(explicitPayable) : 0;
  const receivable = hasReceivable ? Number(explicitReceivable) : 0;
  if (!Number.isSafeInteger(payable) || payable < 0 || !Number.isSafeInteger(receivable) || receivable < 0) {
    throw new Error(`${errorPrefix}_DIRECTIONAL_DEBT_INVALID`);
  }
  if (type === 'BOTH') {
    if (scalar > 0 && (!hasPayable || !hasReceivable)) {
      throw new Error(`${errorPrefix}_DIRECTIONAL_DEBT_MIGRATION_REQUIRED`);
    }
    return { payableBalance: payable, receivableBalance: receivable };
  }
  if (type === 'SUPPLIER') return { payableBalance: hasPayable ? payable : scalar, receivableBalance: 0 };
  if (type === 'CUSTOMER') return { payableBalance: 0, receivableBalance: hasReceivable ? receivable : scalar };
  return { payableBalance: 0, receivableBalance: 0 };
}

/**
 * Idempotently creates or repairs the branch-owned partner projection. This
 * handles the production migration case where the deterministic account was
 * already created, but its legacy `partners` document is missing branchId and
 * therefore cannot appear in a branch-scoped query.
 */
export async function ensureBranchPartner(
  db: Firestore,
  input: { id: string; branchId: string; details: Record<string, any> },
  actorUid: string
): Promise<{ partner: any; created: boolean; repaired: boolean }> {
  const now = new Date().toISOString();
  const draft = {
    id: input.id,
    branchId: input.branchId,
    ...input.details,
    outstandingDebt: 0,
    totalPurchasedFrom: 0,
    totalSalesTo: 0,
    totalSpent: 0,
    loyaltyPoints: 0,
    debtTransactions: [],
    createdAt: now,
    createdByUid: actorUid,
    isActive: true
  };
  const identity = resolvePartyIdentity(draft, input.branchId);
  const requestedPartnerRef = db.collection('partners').doc(input.id);
  const branchRef = db.collection('branches').doc(input.branchId);
  const masterRef = db.collection('partyMasters').doc(identity.partyMasterId);
  const accountRef = db.collection('branchPartyAccounts').doc(identity.branchPartyAccountId);

  return db.runTransaction(async transaction => {
    const [requestedPartnerSnap, branchSnap, masterSnap, accountSnap] = await Promise.all([
      transaction.get(requestedPartnerRef),
      transaction.get(branchRef),
      transaction.get(masterRef),
      transaction.get(accountRef)
    ]);
    if (!branchSnap.exists || branchSnap.data()?.isActive === false || branchSnap.data()?.active === false) {
      throw new Error('BRANCH_NOT_ACTIVE');
    }

    const account = accountSnap.exists ? accountSnap.data()! : null;
    if (account && String(account.branchId || '') !== input.branchId) throw new Error('PARTNER_ACCOUNT_BRANCH_MISMATCH');
    if (account && String(account.partyMasterId || '') !== identity.partyMasterId) throw new Error('PARTNER_ACCOUNT_IDENTITY_MISMATCH');

    const linkedPartnerId = String(account?.legacyPartnerId || '').trim();
    const linkedPartnerRef = linkedPartnerId && linkedPartnerId !== input.id
      ? db.collection('partners').doc(linkedPartnerId)
      : null;
    const linkedPartnerSnap = linkedPartnerRef ? await transaction.get(linkedPartnerRef) : null;
    const targetRef = linkedPartnerSnap?.exists ? linkedPartnerRef! : requestedPartnerRef;
    const targetSnap = linkedPartnerSnap?.exists ? linkedPartnerSnap : requestedPartnerSnap;
    const existing = targetSnap.exists ? targetSnap.data()! : null;
    const existingBranchId = String(existing?.branchId || '').trim();
    if (existingBranchId && existingBranchId !== 'ALL' && existingBranchId !== input.branchId) {
      throw new Error('PARTNER_BRANCH_MISMATCH');
    }
    if (requestedPartnerSnap.exists && targetRef.id !== requestedPartnerRef.id) throw new Error('PARTNER_ID_DUPLICATE');

    const type = mergeBranchPartyType(account?.type || existing?.type, input.details.type);
    const partner = {
      ...(existing || {}),
      ...draft,
      id: targetRef.id,
      branchId: input.branchId,
      type,
      partyMasterId: identity.partyMasterId,
      branchPartyAccountId: identity.branchPartyAccountId,
      outstandingDebt: Number(existing?.outstandingDebt || account?.payableBalance || account?.receivableBalance || 0),
      totalPurchasedFrom: Number(existing?.totalPurchasedFrom || account?.totalPurchases || 0),
      totalSalesTo: Number(existing?.totalSalesTo || account?.totalSales || 0),
      totalSpent: Number(existing?.totalSpent || 0),
      loyaltyPoints: Number(existing?.loyaltyPoints || 0),
      debtTransactions: Array.isArray(existing?.debtTransactions) ? existing.debtTransactions : [],
      createdAt: existing?.createdAt || now,
      createdByUid: existing?.createdByUid || actorUid,
      isActive: true,
      isArchived: false,
      updatedByUid: actorUid
    };

    if (!masterSnap.exists) transaction.create(masterRef, newPartyMasterRecord(partner, identity, actorUid, now));
    if (!accountSnap.exists) {
      const directional = resolveLegacyDirectionalBalances({ ...partner, type }, 'PARTNER');
      transaction.create(accountRef, newBranchPartyAccountRecord(partner, input.branchId, identity, actorUid, now, {
        payableBalance: directional.payableBalance,
        receivableBalance: directional.receivableBalance
      }));
    } else {
      transaction.update(accountRef, {
        legacyPartnerId: targetRef.id,
        type,
        status: 'ACTIVE',
        updatedByUid: actorUid,
        updatedAt: now
      });
    }

    const projection = {
      ...partner,
      ...(existingBranchId !== input.branchId ? {
        legacyBranchAdoptedAt: now,
        legacyBranchAdoptedByUid: actorUid
      } : {}),
      updatedAt: FieldValue.serverTimestamp()
    };
    if (targetSnap.exists) transaction.set(targetRef, projection, { merge: true });
    else transaction.create(targetRef, { ...projection, createdAtServer: FieldValue.serverTimestamp() });

    return { partner, created: !targetSnap.exists, repaired: Boolean(accountSnap.exists || targetSnap.exists) };
  });
}

export function debtLedgerEntry(input: {
  id: string;
  branchId: string;
  partyAccountId: string;
  partyMasterId?: string;
  legacyPartnerId: string;
  direction: DebtDirection;
  sourceType: DebtLedgerSourceType;
  sourceDocumentId: string;
  sourceDocumentCode?: string;
  debitIncrease?: number;
  creditDecrease?: number;
  dueDate?: string;
  actorUid: string;
  occurredAt: string;
  reversalOf?: string;
  note?: string;
}) {
  const debitIncrease = Number(input.debitIncrease || 0);
  const creditDecrease = Number(input.creditDecrease || 0);
  if (!Number.isSafeInteger(debitIncrease) || debitIncrease < 0 || !Number.isSafeInteger(creditDecrease) || creditDecrease < 0) {
    throw new Error('DEBT_LEDGER_AMOUNT_INVALID');
  }
  if ((debitIncrease === 0) === (creditDecrease === 0)) throw new Error('DEBT_LEDGER_ONE_SIDED_ENTRY_REQUIRED');
  return {
    id: input.id,
    branchId: input.branchId,
    partyAccountId: input.partyAccountId,
    ...(input.partyMasterId ? { partyMasterId: input.partyMasterId } : {}),
    legacyPartnerId: input.legacyPartnerId,
    direction: input.direction,
    sourceType: input.sourceType,
    sourceDocumentId: input.sourceDocumentId,
    sourceDocumentCode: input.sourceDocumentCode || input.sourceDocumentId,
    debitIncrease,
    creditDecrease,
    balanceDelta: debitIncrease - creditDecrease,
    amountAllocated: creditDecrease,
    dueDate: input.dueDate || null,
    status: 'POSTED',
    reversalOf: input.reversalOf || null,
    note: String(input.note || '').trim(),
    actorUid: input.actorUid,
    occurredAt: input.occurredAt,
    createdAt: input.occurredAt
  };
}
