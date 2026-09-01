import crypto from 'node:crypto';
import {
  DocumentData,
  DocumentReference,
  FieldPath,
  Firestore,
  Query
} from 'firebase-admin/firestore';
import {
  DebtDirection,
  DebtOpenItemSourceType,
  assertDebtOpenItemScope,
  debtOpenItemId,
  newDebtOpenItemRecord,
  resolvePartyIdentity
} from './branchPartyService';

export interface ReconciliationDocument<T = Record<string, any>> {
  id: string;
  data: T;
}

export interface DebtOpenItemPlanningInput {
  sources: DebtSourceDocument[];
  partners: ReconciliationDocument[];
  accounts: ReconciliationDocument[];
  partyMasters: ReconciliationDocument[];
  openItems: ReconciliationDocument[];
  generatedAt: string;
  actorUid: string;
  scanComplete: boolean;
}

export interface DebtSourceDocument extends ReconciliationDocument {
  sourceType: DebtOpenItemSourceType;
}

export type DebtReconciliationOutcome =
  | 'READY_TO_CREATE'
  | 'CANONICAL'
  | 'NO_DEBT'
  | 'MISMATCH'
  | 'AMBIGUOUS'
  | 'ORPHAN_OPEN_ITEM'
  | 'BLOCKED';

export interface DebtReconciliationEntry {
  sourceType: DebtOpenItemSourceType;
  sourceCollection: string;
  sourceId: string;
  sourceCode: string;
  branchId: string;
  partnerId: string;
  direction: DebtDirection;
  expectedOpenAmount: number;
  deterministicOpenItemId: string;
  partyMasterId?: string;
  partyAccountId?: string;
  existingOpenItemIds: string[];
  outcome: DebtReconciliationOutcome;
  reason?: string;
  record?: Record<string, any>;
  sourceFingerprint?: string;
  partnerFingerprint?: string;
  accountFingerprint?: string;
  partyMasterFingerprint?: string;
}

export interface DebtAccountCheck {
  branchId: string;
  partyAccountId: string;
  direction: DebtDirection;
  expectedOpenAmount: number;
  accountBalance: number;
  matches: boolean;
  sourceCount: number;
}

export interface DebtOpenItemReconciliationPlan {
  dryRun: true;
  generatedAt: string;
  scanComplete: boolean;
  entries: DebtReconciliationEntry[];
  accountChecks: DebtAccountCheck[];
  summary: {
    sourceCount: number;
    openItemCount: number;
    readyToCreate: number;
    canonical: number;
    noDebt: number;
    mismatch: number;
    ambiguous: number;
    orphan: number;
    blocked: number;
    accountMismatch: number;
  };
}

export interface DebtOpenItemReconciliationOptions {
  apply?: boolean;
  branchId?: string;
  sourceTypes?: DebtOpenItemSourceType[];
  pageSize?: number;
  maxDocumentsPerCollection?: number;
  writeBatchSize?: number;
  actorUid?: string;
}

export interface DebtOpenItemReconciliationReport {
  dryRun: boolean;
  generatedAt: string;
  branchId: string | null;
  scan: Record<string, { scanned: number; complete: boolean }>;
  summary: DebtOpenItemReconciliationPlan['summary'] & {
    applied: number;
    applyFailed: number;
  };
  accountChecks: DebtAccountCheck[];
  entries: DebtReconciliationEntry[];
  applyFailures: Array<{ sourceIds: string[]; reason: string }>;
}

interface NormalizedDebtSource {
  sourceType: DebtOpenItemSourceType;
  sourceCollection: string;
  sourceId: string;
  sourceCode: string;
  branchId: string;
  partnerId: string;
  direction: DebtDirection;
  openAmount: number;
  settledAmount: number;
  originalAmount: number;
  occurredAt: string;
  data: Record<string, any>;
}

interface IdentityScope {
  partyMasterId: string;
  partyAccountId: string;
  partner: ReconciliationDocument;
  account: ReconciliationDocument;
  partyMaster: ReconciliationDocument;
}

const SOURCE_COLLECTIONS: Record<DebtOpenItemSourceType, string> = {
  PURCHASE_ORDER: 'purchaseOrders',
  INVOICE: 'invoices',
  TECHNICAL_WORK_ORDER: 'technicalWorkOrders'
};

const SOURCE_DIRECTIONS: Record<DebtOpenItemSourceType, DebtDirection> = {
  PURCHASE_ORDER: 'PAYABLE',
  INVOICE: 'RECEIVABLE',
  TECHNICAL_WORK_ORDER: 'RECEIVABLE'
};

const TERMINAL_SOURCE_STATUSES = new Set(['CANCELLED', 'CANCELED', 'REVERSED', 'VOID', 'REFUNDED']);
const TERMINAL_OPEN_ITEM_STATUSES = new Set(['SETTLED', 'REVERSED']);
const SUPPORTED_OPEN_ITEM_STATUSES = new Set(['OPEN', 'PARTIAL', 'SETTLED', 'REVERSED']);

function text(value: unknown): string {
  return String(value || '').trim();
}

function wholeVnd(value: unknown, field: string): number {
  const amount = Number(value ?? 0);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`${field}_INVALID`);
  return amount;
}

function safeAdd(left: number, right: number, field: string): number {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error(`${field}_INVALID`);
  return total;
}

function isoValue(value: any, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (value && typeof value.toDate === 'function') {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return fallback;
}

function fingerprintValue(value: any): any {
  if (value === null || value === undefined) return value ?? null;
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(fingerprintValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, fingerprintValue(value[key])]));
  }
  return value;
}

export function debtReconciliationFingerprint(value: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(fingerprintValue(value))).digest('hex');
}

function sourceKey(sourceType: DebtOpenItemSourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

function accountKey(accountId: string, direction: DebtDirection): string {
  return `${accountId}:${direction}`;
}

function mapDocuments(items: ReconciliationDocument[]): Map<string, ReconciliationDocument> {
  return new Map(items.map(item => [item.id, item]));
}

function normalizeDebtSource(source: DebtSourceDocument, generatedAt: string): NormalizedDebtSource {
  const data = source.data || {};
  const sourceType = source.sourceType;
  if (!SOURCE_COLLECTIONS[sourceType]) throw new Error('DEBT_RECONCILIATION_SOURCE_TYPE_UNSUPPORTED');
  const direction = SOURCE_DIRECTIONS[sourceType];
  const branchId = text(data.branchId);
  if (!branchId || branchId === 'ALL') throw new Error('DEBT_RECONCILIATION_BRANCH_REQUIRED');
  const partnerId = sourceType === 'PURCHASE_ORDER' ? text(data.supplierId) : text(data.customerId);
  if (!partnerId) throw new Error('DEBT_RECONCILIATION_PARTNER_REQUIRED');
  const openAmount = wholeVnd(
    sourceType === 'TECHNICAL_WORK_ORDER' ? data.balanceDue : data.debtAmount,
    'DEBT_RECONCILIATION_OPEN_AMOUNT'
  );
  const status = text(data.status).toUpperCase();
  if (openAmount > 0 && TERMINAL_SOURCE_STATUSES.has(status)) {
    throw new Error('DEBT_RECONCILIATION_TERMINAL_SOURCE_HAS_DEBT');
  }
  let settledAmount = 0;
  if (sourceType === 'INVOICE') {
    for (const collection of Array.isArray(data.debtCollections) ? data.debtCollections : []) {
      settledAmount = safeAdd(
        settledAmount,
        wholeVnd(collection?.amount, 'DEBT_RECONCILIATION_SETTLED_AMOUNT'),
        'DEBT_RECONCILIATION_SETTLED_AMOUNT'
      );
    }
  } else {
    settledAmount = wholeVnd(data.paidAmount, 'DEBT_RECONCILIATION_SETTLED_AMOUNT');
  }
  const originalAmount = safeAdd(openAmount, settledAmount, 'DEBT_RECONCILIATION_ORIGINAL_AMOUNT');
  const occurredAtRaw = sourceType === 'PURCHASE_ORDER'
    ? data.orderDate || data.completedAt || data.createdAt || data.date
    : sourceType === 'TECHNICAL_WORK_ORDER'
      ? data.deliveredAt || data.createdAt
      : data.createdAt || data.createdDate || data.date;
  return {
    sourceType,
    sourceCollection: SOURCE_COLLECTIONS[sourceType],
    sourceId: source.id,
    sourceCode: text(data.code || data.invoiceCode || source.id),
    branchId,
    partnerId,
    direction,
    openAmount,
    settledAmount,
    originalAmount,
    occurredAt: isoValue(occurredAtRaw, generatedAt),
    data
  };
}

function uniqueIds(values: unknown[]): string[] {
  return [...new Set(values.map(text).filter(Boolean))];
}

function sourceIdentityIds(source: NormalizedDebtSource): { masterIds: string[]; accountIds: string[] } {
  const data = source.data;
  if (source.sourceType === 'PURCHASE_ORDER') {
    return {
      masterIds: uniqueIds([data.partyMasterId, data.supplierPartyMasterId]),
      accountIds: uniqueIds([data.branchSupplierAccountId, data.branchPartyAccountId])
    };
  }
  if (source.sourceType === 'INVOICE') {
    return {
      masterIds: uniqueIds([data.customerPartyMasterId, data.partyMasterId]),
      accountIds: uniqueIds([data.branchCustomerAccountId, data.branchPartyAccountId])
    };
  }
  return {
    masterIds: uniqueIds([data.partyMasterId, data.customerPartyMasterId]),
    accountIds: uniqueIds([data.branchPartyAccountId, data.branchCustomerAccountId])
  };
}

function resolveIdentityScope(
  source: NormalizedDebtSource,
  partners: Map<string, ReconciliationDocument>,
  accounts: Map<string, ReconciliationDocument>,
  partyMasters: Map<string, ReconciliationDocument>
): IdentityScope {
  const partner = partners.get(source.partnerId);
  if (!partner) throw new Error('DEBT_RECONCILIATION_PARTNER_NOT_FOUND');
  const partnerData = partner.data || {};
  if (text(partnerData.branchId) !== source.branchId) throw new Error('DEBT_RECONCILIATION_PARTNER_BRANCH_MISMATCH');
  if (partnerData.isActive === false || partnerData.isArchived === true) throw new Error('DEBT_RECONCILIATION_PARTNER_INACTIVE');
  const allowedPartnerTypes = source.direction === 'PAYABLE' ? ['SUPPLIER', 'BOTH'] : ['CUSTOMER', 'BOTH'];
  if (!allowedPartnerTypes.includes(text(partnerData.type).toUpperCase())) {
    throw new Error('DEBT_RECONCILIATION_PARTNER_TYPE_MISMATCH');
  }

  const sourceIds = sourceIdentityIds(source);
  if (sourceIds.masterIds.length > 1 || sourceIds.accountIds.length > 1) {
    throw new Error('DEBT_RECONCILIATION_SOURCE_IDENTITY_AMBIGUOUS');
  }
  const partnerMasterId = text(partnerData.partyMasterId);
  const partnerAccountId = text(partnerData.branchPartyAccountId);
  if (sourceIds.masterIds[0] && partnerMasterId && sourceIds.masterIds[0] !== partnerMasterId) {
    throw new Error('DEBT_RECONCILIATION_SOURCE_IDENTITY_MISMATCH');
  }
  if (sourceIds.accountIds[0] && partnerAccountId && sourceIds.accountIds[0] !== partnerAccountId) {
    throw new Error('DEBT_RECONCILIATION_SOURCE_ACCOUNT_MISMATCH');
  }

  let resolvedMasterId = sourceIds.masterIds[0] || partnerMasterId;
  let resolvedAccountId = sourceIds.accountIds[0] || partnerAccountId;
  if (!resolvedMasterId || !resolvedAccountId) {
    let derived;
    try {
      derived = resolvePartyIdentity({ id: partner.id, ...partnerData }, source.branchId);
    } catch {
      throw new Error('DEBT_RECONCILIATION_IDENTITY_REQUIRED');
    }
    resolvedMasterId ||= derived.partyMasterId;
    resolvedAccountId ||= derived.branchPartyAccountId;
  }
  if (!resolvedMasterId || !resolvedAccountId) throw new Error('DEBT_RECONCILIATION_IDENTITY_REQUIRED');

  const account = accounts.get(resolvedAccountId);
  if (!account) throw new Error('DEBT_RECONCILIATION_ACCOUNT_NOT_FOUND');
  const accountData = account.data || {};
  if (text(accountData.branchId) !== source.branchId) throw new Error('DEBT_RECONCILIATION_ACCOUNT_BRANCH_MISMATCH');
  if (text(accountData.partyMasterId) !== resolvedMasterId) throw new Error('DEBT_RECONCILIATION_ACCOUNT_IDENTITY_MISMATCH');
  if (text(accountData.legacyPartnerId) && text(accountData.legacyPartnerId) !== source.partnerId) {
    throw new Error('DEBT_RECONCILIATION_ACCOUNT_PARTNER_MISMATCH');
  }
  if (['ARCHIVED', 'INACTIVE'].includes(text(accountData.status).toUpperCase())) {
    throw new Error('DEBT_RECONCILIATION_ACCOUNT_INACTIVE');
  }
  const allowedAccountTypes = source.direction === 'PAYABLE' ? ['SUPPLIER', 'BOTH'] : ['CUSTOMER', 'BOTH'];
  if (!allowedAccountTypes.includes(text(accountData.type).toUpperCase())) {
    throw new Error('DEBT_RECONCILIATION_ACCOUNT_TYPE_MISMATCH');
  }
  wholeVnd(accountData.payableBalance, 'DEBT_RECONCILIATION_ACCOUNT_PAYABLE');
  wholeVnd(accountData.receivableBalance, 'DEBT_RECONCILIATION_ACCOUNT_RECEIVABLE');

  const partyMaster = partyMasters.get(resolvedMasterId);
  if (!partyMaster) throw new Error('DEBT_RECONCILIATION_PARTY_MASTER_NOT_FOUND');
  if (['ARCHIVED', 'INACTIVE'].includes(text(partyMaster.data?.status).toUpperCase())) {
    throw new Error('DEBT_RECONCILIATION_PARTY_MASTER_INACTIVE');
  }
  return {
    partyMasterId: resolvedMasterId,
    partyAccountId: resolvedAccountId,
    partner,
    account,
    partyMaster
  };
}

function itemSourceKey(item: ReconciliationDocument): string | null {
  const sourceType = text(item.data?.sourceType) as DebtOpenItemSourceType;
  const sourceId = text(item.data?.sourceDocumentId || item.data?.sourceId);
  if (!SOURCE_COLLECTIONS[sourceType] || !sourceId) return null;
  return sourceKey(sourceType, sourceId);
}

function summaryFor(entries: DebtReconciliationEntry[], openItemCount: number, accountChecks: DebtAccountCheck[]) {
  const count = (outcome: DebtReconciliationOutcome) => entries.filter(entry => entry.outcome === outcome).length;
  return {
    sourceCount: entries.filter(entry => entry.outcome !== 'ORPHAN_OPEN_ITEM').length,
    openItemCount,
    readyToCreate: count('READY_TO_CREATE'),
    canonical: count('CANONICAL'),
    noDebt: count('NO_DEBT'),
    mismatch: count('MISMATCH'),
    ambiguous: count('AMBIGUOUS'),
    orphan: count('ORPHAN_OPEN_ITEM'),
    blocked: count('BLOCKED'),
    accountMismatch: accountChecks.filter(check => !check.matches).length
  };
}

export function buildDebtOpenItemReconciliationPlan(input: DebtOpenItemPlanningInput): DebtOpenItemReconciliationPlan {
  const sources = input.sources || [];
  const partners = mapDocuments(input.partners || []);
  const accounts = mapDocuments(input.accounts || []);
  const partyMasters = mapDocuments(input.partyMasters || []);
  const openItemsBySource = new Map<string, ReconciliationDocument[]>();
  const matchedOpenItemIds = new Set<string>();
  for (const item of input.openItems || []) {
    const key = itemSourceKey(item);
    if (!key) continue;
    const items = openItemsBySource.get(key) || [];
    items.push(item);
    openItemsBySource.set(key, items);
  }

  const entries: DebtReconciliationEntry[] = [];
  const validPositiveSources: Array<{
    entry: DebtReconciliationEntry;
    source: NormalizedDebtSource;
    identity: IdentityScope;
  }> = [];

  for (const rawSource of sources) {
    const fallbackType = rawSource.sourceType;
    const deterministicId = SOURCE_DIRECTIONS[fallbackType]
      ? debtOpenItemId(fallbackType, rawSource.id, SOURCE_DIRECTIONS[fallbackType])
      : '';
    let source: NormalizedDebtSource;
    try {
      source = normalizeDebtSource(rawSource, input.generatedAt);
    } catch (error: any) {
      entries.push({
        sourceType: fallbackType,
        sourceCollection: SOURCE_COLLECTIONS[fallbackType] || 'unknown',
        sourceId: rawSource.id,
        sourceCode: text(rawSource.data?.code || rawSource.data?.invoiceCode || rawSource.id),
        branchId: text(rawSource.data?.branchId),
        partnerId: fallbackType === 'PURCHASE_ORDER' ? text(rawSource.data?.supplierId) : text(rawSource.data?.customerId),
        direction: SOURCE_DIRECTIONS[fallbackType] || 'RECEIVABLE',
        expectedOpenAmount: 0,
        deterministicOpenItemId: deterministicId,
        existingOpenItemIds: [],
        outcome: 'MISMATCH',
        reason: text(error?.message || 'DEBT_RECONCILIATION_SOURCE_INVALID')
      });
      continue;
    }
    const key = sourceKey(source.sourceType, source.sourceId);
    const existingItems = openItemsBySource.get(key) || [];
    existingItems.forEach(item => matchedOpenItemIds.add(item.id));
    const entry: DebtReconciliationEntry = {
      sourceType: source.sourceType,
      sourceCollection: source.sourceCollection,
      sourceId: source.sourceId,
      sourceCode: source.sourceCode,
      branchId: source.branchId,
      partnerId: source.partnerId,
      direction: source.direction,
      expectedOpenAmount: source.openAmount,
      deterministicOpenItemId: debtOpenItemId(source.sourceType, source.sourceId, source.direction),
      existingOpenItemIds: existingItems.map(item => item.id),
      outcome: source.openAmount > 0 ? 'BLOCKED' : 'NO_DEBT'
    };
    if (source.openAmount === 0 && existingItems.length === 0) {
      entries.push(entry);
      continue;
    }

    let identity: IdentityScope;
    try {
      identity = resolveIdentityScope(source, partners, accounts, partyMasters);
      entry.partyMasterId = identity.partyMasterId;
      entry.partyAccountId = identity.partyAccountId;
      entry.sourceFingerprint = debtReconciliationFingerprint(source.data);
      entry.partnerFingerprint = debtReconciliationFingerprint(identity.partner.data);
      entry.accountFingerprint = debtReconciliationFingerprint(identity.account.data);
      entry.partyMasterFingerprint = debtReconciliationFingerprint(identity.partyMaster.data);
    } catch (error: any) {
      entry.outcome = 'MISMATCH';
      entry.reason = text(error?.message || 'DEBT_RECONCILIATION_IDENTITY_INVALID');
      entries.push(entry);
      continue;
    }

    if (existingItems.length > 1) {
      entry.outcome = 'AMBIGUOUS';
      entry.reason = 'DEBT_RECONCILIATION_MULTIPLE_OPEN_ITEMS';
      entries.push(entry);
      if (source.openAmount > 0) validPositiveSources.push({ entry, source, identity });
      continue;
    }
    if (existingItems.length === 1) {
      const existing = existingItems[0];
      const status = text(existing.data?.status).toUpperCase();
      if (existing.id !== entry.deterministicOpenItemId) {
        entry.outcome = TERMINAL_OPEN_ITEM_STATUSES.has(status) ? 'BLOCKED' : 'AMBIGUOUS';
        entry.reason = TERMINAL_OPEN_ITEM_STATUSES.has(status)
          ? 'DEBT_RECONCILIATION_TERMINAL_ITEM_WOULD_REOPEN'
          : 'DEBT_RECONCILIATION_NON_DETERMINISTIC_OPEN_ITEM';
      } else if (!SUPPORTED_OPEN_ITEM_STATUSES.has(status)) {
        entry.outcome = 'MISMATCH';
        entry.reason = 'DEBT_RECONCILIATION_OPEN_ITEM_STATUS_INVALID';
      } else if (source.openAmount > 0 && TERMINAL_OPEN_ITEM_STATUSES.has(status)) {
        entry.outcome = 'BLOCKED';
        entry.reason = 'DEBT_RECONCILIATION_TERMINAL_ITEM_WOULD_REOPEN';
      } else {
        try {
          assertDebtOpenItemScope(existing.data, {
            branchId: source.branchId,
            partyAccountId: identity.partyAccountId,
            partyMasterId: identity.partyMasterId,
            legacyPartnerId: source.partnerId,
            direction: source.direction,
            sourceType: source.sourceType,
            sourceDocumentId: source.sourceId,
            openAmount: source.openAmount
          });
          entry.outcome = source.openAmount > 0 ? 'CANONICAL' : 'NO_DEBT';
        } catch (error: any) {
          entry.outcome = 'MISMATCH';
          entry.reason = text(error?.message || 'DEBT_RECONCILIATION_OPEN_ITEM_MISMATCH');
        }
      }
      entries.push(entry);
      if (source.openAmount > 0) validPositiveSources.push({ entry, source, identity });
      continue;
    }

    if (source.openAmount > 0) {
      entry.outcome = 'READY_TO_CREATE';
      entry.record = {
        ...newDebtOpenItemRecord({
          branchId: source.branchId,
          partyAccountId: identity.partyAccountId,
          partyMasterId: identity.partyMasterId,
          legacyPartnerId: source.partnerId,
          direction: source.direction,
          sourceType: source.sourceType,
          sourceDocumentId: source.sourceId,
          sourceDocumentCode: source.sourceCode,
          originalAmount: source.originalAmount,
          settledAmount: source.settledAmount,
          actorUid: input.actorUid,
          occurredAt: source.occurredAt
        }),
        reconciliationBackfill: true,
        reconciliationBackfilledAt: input.generatedAt,
        reconciliationBackfilledByUid: input.actorUid
      };
      validPositiveSources.push({ entry, source, identity });
    }
    entries.push(entry);
  }

  for (const item of input.openItems || []) {
    if (matchedOpenItemIds.has(item.id)) continue;
    const sourceType = text(item.data?.sourceType) as DebtOpenItemSourceType;
    if (!SOURCE_COLLECTIONS[sourceType]) continue;
    const sourceId = text(item.data?.sourceDocumentId || item.data?.sourceId);
    entries.push({
      sourceType,
      sourceCollection: SOURCE_COLLECTIONS[sourceType],
      sourceId,
      sourceCode: text(item.data?.sourceDocumentCode || item.data?.sourceCode || sourceId),
      branchId: text(item.data?.branchId),
      partnerId: text(item.data?.legacyPartnerId),
      direction: text(item.data?.direction) as DebtDirection || SOURCE_DIRECTIONS[sourceType],
      expectedOpenAmount: 0,
      deterministicOpenItemId: sourceId ? debtOpenItemId(sourceType, sourceId, SOURCE_DIRECTIONS[sourceType]) : '',
      partyMasterId: text(item.data?.partyMasterId) || undefined,
      partyAccountId: text(item.data?.partyAccountId) || undefined,
      existingOpenItemIds: [item.id],
      outcome: 'ORPHAN_OPEN_ITEM',
      reason: sourceId ? 'DEBT_RECONCILIATION_SOURCE_NOT_FOUND' : 'DEBT_RECONCILIATION_OPEN_ITEM_SOURCE_REQUIRED'
    });
  }

  const grouped = new Map<string, { account: ReconciliationDocument; direction: DebtDirection; total: number; entries: DebtReconciliationEntry[] }>();
  for (const item of validPositiveSources) {
    const key = accountKey(item.identity.partyAccountId, item.source.direction);
    const current = grouped.get(key) || { account: item.identity.account, direction: item.source.direction, total: 0, entries: [] };
    current.total = safeAdd(current.total, item.source.openAmount, 'DEBT_RECONCILIATION_ACCOUNT_SOURCE_TOTAL');
    current.entries.push(item.entry);
    grouped.set(key, current);
  }
  const accountChecks: DebtAccountCheck[] = [];
  for (const group of grouped.values()) {
    const balance = wholeVnd(
      group.direction === 'PAYABLE' ? group.account.data?.payableBalance : group.account.data?.receivableBalance,
      'DEBT_RECONCILIATION_ACCOUNT_BALANCE'
    );
    const check: DebtAccountCheck = {
      branchId: text(group.account.data?.branchId),
      partyAccountId: group.account.id,
      direction: group.direction,
      expectedOpenAmount: group.total,
      accountBalance: balance,
      matches: balance === group.total,
      sourceCount: group.entries.length
    };
    accountChecks.push(check);
    if (!check.matches) {
      for (const entry of group.entries) {
        if (entry.outcome === 'READY_TO_CREATE') {
          entry.outcome = 'MISMATCH';
          entry.reason = 'DEBT_RECONCILIATION_ACCOUNT_BALANCE_MISMATCH';
          delete entry.record;
        }
      }
    }
  }
  if (!input.scanComplete) {
    for (const entry of entries) {
      if (entry.outcome === 'READY_TO_CREATE') {
        entry.outcome = 'BLOCKED';
        entry.reason = 'DEBT_RECONCILIATION_SCAN_TRUNCATED';
        delete entry.record;
      }
    }
  }

  entries.sort((left, right) => left.sourceType.localeCompare(right.sourceType) || left.sourceId.localeCompare(right.sourceId));
  accountChecks.sort((left, right) => left.partyAccountId.localeCompare(right.partyAccountId) || left.direction.localeCompare(right.direction));
  return {
    dryRun: true,
    generatedAt: input.generatedAt,
    scanComplete: input.scanComplete,
    entries,
    accountChecks,
    summary: summaryFor(entries, input.openItems.length, accountChecks)
  };
}

interface ScanResult {
  docs: ReconciliationDocument[];
  complete: boolean;
}

async function scanCollection(
  db: Firestore,
  collectionName: string,
  options: { pageSize: number; maxDocuments: number; branchId?: string }
): Promise<ScanResult> {
  const docs: ReconciliationDocument[] = [];
  let cursor: string | null = null;
  let complete = false;
  while (docs.length < options.maxDocuments) {
    const remaining = options.maxDocuments - docs.length;
    const limit = Math.min(options.pageSize, remaining);
    let query: Query<DocumentData> = db.collection(collectionName);
    if (options.branchId) query = query.where('branchId', '==', options.branchId);
    query = query.orderBy(FieldPath.documentId()).limit(limit);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    for (const doc of snapshot.docs) docs.push({ id: doc.id, data: doc.data() });
    if (snapshot.size < limit || snapshot.empty) {
      complete = true;
      break;
    }
    cursor = snapshot.docs[snapshot.docs.length - 1].id;
  }
  return { docs, complete };
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function loadDocuments(db: Firestore, collectionName: string, ids: string[]): Promise<ReconciliationDocument[]> {
  const unique = [...new Set(ids.map(text).filter(Boolean))];
  const result: ReconciliationDocument[] = [];
  for (const idsChunk of chunk(unique, 200)) {
    const snapshots = await db.getAll(...idsChunk.map(id => db.collection(collectionName).doc(id)));
    snapshots.forEach(snapshot => {
      if (snapshot.exists) result.push({ id: snapshot.id, data: snapshot.data() || {} });
    });
  }
  return result;
}

function collectIdentityDocumentIds(sources: DebtSourceDocument[], partners: ReconciliationDocument[]) {
  const partnerMap = mapDocuments(partners);
  const masterIds = new Set<string>();
  const accountIds = new Set<string>();
  for (const source of sources) {
    try {
      const normalized = normalizeDebtSource(source, new Date(0).toISOString());
      const partner = partnerMap.get(normalized.partnerId);
      const direct = sourceIdentityIds(normalized);
      direct.masterIds.forEach(id => masterIds.add(id));
      direct.accountIds.forEach(id => accountIds.add(id));
      if (!partner) continue;
      const partnerMasterId = text(partner.data?.partyMasterId);
      const partnerAccountId = text(partner.data?.branchPartyAccountId);
      if (partnerMasterId) masterIds.add(partnerMasterId);
      if (partnerAccountId) accountIds.add(partnerAccountId);
      try {
        const resolved = resolvePartyIdentity({ id: partner.id, ...partner.data }, normalized.branchId);
        masterIds.add(resolved.partyMasterId);
        accountIds.add(resolved.branchPartyAccountId);
      } catch {
        // The pure planner reports the missing/ambiguous identity explicitly.
      }
    } catch {
      // Invalid sources are reported by the pure planner and require no lookups.
    }
  }
  return { masterIds: [...masterIds], accountIds: [...accountIds] };
}

async function applyReadyEntries(
  db: Firestore,
  entries: DebtReconciliationEntry[],
  writeBatchSize: number
): Promise<{ applied: number; failures: Array<{ sourceIds: string[]; reason: string }> }> {
  let applied = 0;
  const failures: Array<{ sourceIds: string[]; reason: string }> = [];
  for (const entryChunk of chunk(entries.filter(entry => entry.outcome === 'READY_TO_CREATE' && entry.record), writeBatchSize)) {
    try {
      await db.runTransaction(async transaction => {
        const referenceMap = new Map<string, DocumentReference<DocumentData>>();
        for (const entry of entryChunk) {
          const references = [
            db.collection(entry.sourceCollection).doc(entry.sourceId),
            db.collection('partners').doc(entry.partnerId),
            db.collection('branchPartyAccounts').doc(entry.partyAccountId!),
            db.collection('partyMasters').doc(entry.partyMasterId!),
            db.collection('debtOpenItems').doc(entry.deterministicOpenItemId)
          ];
          references.forEach(reference => referenceMap.set(reference.path, reference));
        }
        const snapshots = await Promise.all([...referenceMap.values()].map(reference => transaction.get(reference)));
        const snapshotMap = new Map(snapshots.map(snapshot => [snapshot.ref.path, snapshot]));
        for (const entry of entryChunk) {
          const sourceSnap = snapshotMap.get(`${entry.sourceCollection}/${entry.sourceId}`)!;
          const partnerSnap = snapshotMap.get(`partners/${entry.partnerId}`)!;
          const accountSnap = snapshotMap.get(`branchPartyAccounts/${entry.partyAccountId}`)!;
          const masterSnap = snapshotMap.get(`partyMasters/${entry.partyMasterId}`)!;
          const openItemSnap = snapshotMap.get(`debtOpenItems/${entry.deterministicOpenItemId}`)!;
          if (!sourceSnap?.exists || !partnerSnap?.exists || !accountSnap?.exists || !masterSnap?.exists) {
            throw new Error('DEBT_RECONCILIATION_APPLY_REFERENCE_CHANGED');
          }
          if (openItemSnap?.exists) throw new Error('DEBT_RECONCILIATION_APPLY_ITEM_ALREADY_EXISTS');
          if (debtReconciliationFingerprint(sourceSnap.data()) !== entry.sourceFingerprint
            || debtReconciliationFingerprint(partnerSnap.data()) !== entry.partnerFingerprint
            || debtReconciliationFingerprint(accountSnap.data()) !== entry.accountFingerprint
            || debtReconciliationFingerprint(masterSnap.data()) !== entry.partyMasterFingerprint) {
            throw new Error('DEBT_RECONCILIATION_APPLY_SNAPSHOT_CHANGED');
          }
        }
        for (const entry of entryChunk) {
          transaction.create(db.collection('debtOpenItems').doc(entry.deterministicOpenItemId), entry.record!);
        }
      });
      applied += entryChunk.length;
    } catch (error: any) {
      failures.push({
        sourceIds: entryChunk.map(entry => `${entry.sourceType}:${entry.sourceId}`),
        reason: text(error?.message || 'DEBT_RECONCILIATION_APPLY_FAILED')
      });
    }
  }
  return { applied, failures };
}

export async function reconcileDebtOpenItems(
  db: Firestore,
  options: DebtOpenItemReconciliationOptions = {}
): Promise<DebtOpenItemReconciliationReport> {
  const generatedAt = new Date().toISOString();
  const branchId = text(options.branchId);
  const actorUid = text(options.actorUid);
  if (branchId === 'ALL') throw new Error('DEBT_RECONCILIATION_BRANCH_INVALID');
  if (options.apply === true && !branchId) throw new Error('DEBT_RECONCILIATION_APPLY_BRANCH_REQUIRED');
  if (options.apply === true && !actorUid) throw new Error('DEBT_RECONCILIATION_APPLY_ACTOR_REQUIRED');
  const pageSize = Math.min(250, Math.max(25, Number(options.pageSize) || 200));
  const maxDocuments = Math.min(100_000, Math.max(pageSize, Number(options.maxDocumentsPerCollection) || 25_000));
  const writeBatchSize = Math.min(50, Math.max(1, Number(options.writeBatchSize) || 25));
  const requestedTypes = options.sourceTypes?.length
    ? [...new Set(options.sourceTypes)]
    : Object.keys(SOURCE_COLLECTIONS) as DebtOpenItemSourceType[];
  const sourceScanResults = await Promise.all(requestedTypes.map(async sourceType => ({
    sourceType,
    result: await scanCollection(db, SOURCE_COLLECTIONS[sourceType], { pageSize, maxDocuments, ...(branchId ? { branchId } : {}) })
  })));
  // Keep orphan discovery branch-scoped, but never trust the item's branchId to
  // discover the deterministic record. A malformed/terminal deterministic item
  // may carry the wrong branch and still must block dry-run before --apply.
  const openItemScan = await scanCollection(db, 'debtOpenItems', { pageSize, maxDocuments, ...(branchId ? { branchId } : {}) });
  const sources: DebtSourceDocument[] = sourceScanResults.flatMap(({ sourceType, result }) => (
    result.docs.map(doc => ({ ...doc, sourceType }))
  ));
  const deterministicOpenItemIds = sources.map(source => debtOpenItemId(
    source.sourceType,
    source.id,
    SOURCE_DIRECTIONS[source.sourceType]
  ));
  const deterministicOpenItems = await loadDocuments(db, 'debtOpenItems', deterministicOpenItemIds);
  const relevantOpenItems = [...new Map(
    [...openItemScan.docs, ...deterministicOpenItems].map(item => [item.id, item])
  ).values()];
  const partnerIds = sources.map(source => (
    source.sourceType === 'PURCHASE_ORDER' ? text(source.data?.supplierId) : text(source.data?.customerId)
  )).filter(Boolean);
  const partners = await loadDocuments(db, 'partners', partnerIds);
  const identityIds = collectIdentityDocumentIds(sources, partners);
  const [accounts, partyMasters] = await Promise.all([
    loadDocuments(db, 'branchPartyAccounts', identityIds.accountIds),
    loadDocuments(db, 'partyMasters', identityIds.masterIds)
  ]);
  const scanComplete = openItemScan.complete && sourceScanResults.every(item => item.result.complete);
  const plan = buildDebtOpenItemReconciliationPlan({
    sources,
    partners,
    accounts,
    partyMasters,
    openItems: relevantOpenItems,
    generatedAt,
    actorUid: actorUid || 'DEBT_RECONCILIATION_SCRIPT',
    scanComplete
  });
  const applyResult = options.apply
    ? await applyReadyEntries(db, plan.entries, writeBatchSize)
    : { applied: 0, failures: [] as Array<{ sourceIds: string[]; reason: string }> };
  const scan = Object.fromEntries([
    ...sourceScanResults.map(({ sourceType, result }) => [SOURCE_COLLECTIONS[sourceType], { scanned: result.docs.length, complete: result.complete }]),
    ['debtOpenItems', { scanned: openItemScan.docs.length, complete: openItemScan.complete }],
    ['debtOpenItemsDeterministic', { scanned: deterministicOpenItems.length, complete: true }]
  ]);
  return {
    dryRun: options.apply !== true,
    generatedAt,
    branchId: branchId || null,
    scan,
    summary: {
      ...plan.summary,
      applied: applyResult.applied,
      applyFailed: applyResult.failures.reduce((sum, item) => sum + item.sourceIds.length, 0)
    },
    accountChecks: plan.accountChecks,
    entries: plan.entries,
    applyFailures: applyResult.failures
  };
}
