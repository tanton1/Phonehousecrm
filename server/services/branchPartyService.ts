import crypto from 'node:crypto';
import { FieldValue, Firestore } from 'firebase-admin/firestore';

export type BranchPartyType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH' | 'STAFF';
export type DebtDirection = 'RECEIVABLE' | 'PAYABLE';
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
      const supplierSide = type === 'SUPPLIER' || type === 'BOTH';
      transaction.create(accountRef, newBranchPartyAccountRecord(partner, input.branchId, identity, actorUid, now, {
        payableBalance: supplierSide ? Number(partner.outstandingDebt || 0) : 0,
        receivableBalance: supplierSide ? 0 : Number(partner.outstandingDebt || 0)
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
