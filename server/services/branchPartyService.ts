import crypto from 'node:crypto';

export type BranchPartyType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH' | 'STAFF';
export type DebtDirection = 'RECEIVABLE' | 'PAYABLE';
export type DebtLedgerSourceType =
  | 'PURCHASE_ORDER'
  | 'INVOICE'
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

