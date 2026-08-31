import { AggregateField, FieldPath, Firestore } from 'firebase-admin/firestore';

export interface CashLedgerActor {
  uid: string;
  role?: string;
  branchId?: string;
  assignedBranchIds?: string[];
}

export interface CashLedgerQuery {
  branchId?: string;
  fundId?: string;
  type?: 'ALL' | 'RECEIPT' | 'PAYMENT';
  category?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function canAccessBranch(actor: CashLedgerActor, branchId: string): boolean {
  const role = String(actor.role || '').toUpperCase();
  return role === 'ADMIN'
    || actor.branchId === branchId
    || (actor.assignedBranchIds || []).includes(branchId);
}

export function encodeCashLedgerCursor(date: string, documentId: string): string {
  return Buffer.from(JSON.stringify({ v: 1, date, id: documentId }), 'utf8').toString('base64url');
}

export function decodeCashLedgerCursor(cursor: string): { date: string; id: string } {
  try {
    if (!cursor || cursor.length > 1000) throw new Error('INVALID');
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const date = String(parsed?.date || '');
    const id = String(parsed?.id || '');
    if (parsed?.v !== 1 || !date || !id || date.length > 100 || id.length > 500 || /[\r\n]/.test(`${date}${id}`)) {
      throw new Error('INVALID');
    }
    return { date, id };
  } catch {
    throw new Error('CASH_LEDGER_CURSOR_INVALID');
  }
}

function serializeValue(value: any): any {
  if (value == null) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)]));
  }
  return value;
}

export async function listCashLedger(
  db: Firestore,
  actor: CashLedgerActor,
  input: CashLedgerQuery = {}
): Promise<any> {
  const requestedBranchId = String(input.branchId || actor.branchId || '').trim();
  const role = String(actor.role || '').toUpperCase();
  if (!requestedBranchId || (requestedBranchId === 'ALL' && role !== 'ADMIN')) {
    throw new Error('CASH_LEDGER_BRANCH_REQUIRED');
  }
  if (requestedBranchId !== 'ALL' && !canAccessBranch(actor, requestedBranchId)) {
    throw new Error('CASH_LEDGER_BRANCH_FORBIDDEN');
  }

  const fundId = String(input.fundId || '').trim();
  const type = String(input.type || 'ALL').toUpperCase();
  const category = String(input.category || '').trim();
  const from = String(input.from || '').trim();
  const to = String(input.to || '').trim();
  if (!['ALL', 'RECEIPT', 'PAYMENT'].includes(type)) throw new Error('CASH_LEDGER_TYPE_INVALID');
  if ((from && !datePattern.test(from)) || (to && !datePattern.test(to)) || (from && to && from > to)) {
    throw new Error('CASH_LEDGER_DATE_RANGE_INVALID');
  }
  const pageLimit = Math.min(200, Math.max(1, Math.floor(Number(input.limit) || 50)));

  const baseQuery = (transactionType?: 'RECEIPT' | 'PAYMENT', categoryOverride?: string) => {
    let query: any = db.collection('cashTransactions');
    if (requestedBranchId !== 'ALL') query = query.where('branchId', '==', requestedBranchId);
    if (fundId && fundId !== 'ALL') query = query.where('fundId', '==', fundId);
    const effectiveCategory = categoryOverride ?? category;
    if (effectiveCategory) query = query.where('category', '==', effectiveCategory);
    if (transactionType) query = query.where('type', '==', transactionType);
    else if (type !== 'ALL') query = query.where('type', '==', type);
    query = query.where('status', '==', 'COMPLETED');
    if (from) query = query.where('date', '>=', from);
    if (to) query = query.where('date', '<=', `${to}\uf8ff`);
    return query;
  };

  let pageQuery = baseQuery()
    .orderBy('date', 'desc')
    .orderBy(FieldPath.documentId(), 'desc');
  if (input.cursor) {
    const cursor = decodeCashLedgerCursor(input.cursor);
    pageQuery = pageQuery.startAfter(cursor.date, cursor.id);
  }
  const aggregateFor = (transactionType: 'RECEIPT' | 'PAYMENT') => {
    if (type !== 'ALL' && type !== transactionType) {
      return Promise.resolve({ data: () => ({ amount: 0, count: 0 }) });
    }
    return baseQuery(transactionType).aggregate({ amount: AggregateField.sum('amount'), count: AggregateField.count() }).get();
  };
  const openingAggregatePromise = category
    ? Promise.resolve({ data: () => ({ amount: 0, count: 0 }) })
    : baseQuery('RECEIPT', 'OPENING_BALANCE').aggregate({ amount: AggregateField.sum('amount'), count: AggregateField.count() }).get();
  const [pageSnapshot, receiptAggregate, paymentAggregate, openingAggregate] = await Promise.all([
    pageQuery.limit(pageLimit + 1).get(),
    aggregateFor('RECEIPT'),
    aggregateFor('PAYMENT'),
    openingAggregatePromise
  ]);
  const hasMore = pageSnapshot.docs.length > pageLimit;
  const documents = pageSnapshot.docs.slice(0, pageLimit);
  const last = documents.at(-1);
  const receiptData = receiptAggregate.data();
  const paymentData = paymentAggregate.data();
  const openingData = openingAggregate.data();
  const openingExcluded = Number(openingData.amount || 0);
  const receipts = Math.max(0, Number(receiptData.amount || 0) - openingExcluded);
  const payments = Number(paymentData.amount || 0);

  return {
    items: documents.map((document: any) => serializeValue({ ...document.data(), id: document.id })),
    totals: {
      receipts,
      payments,
      net: receipts - payments,
      receiptCount: Math.max(0, Number(receiptData.count || 0) - Number(openingData.count || 0)),
      paymentCount: Number(paymentData.count || 0),
      openingExcluded,
      openingCount: Number(openingData.count || 0)
    },
    nextCursor: hasMore && last ? encodeCashLedgerCursor(String(last.data()?.date || ''), last.id) : null,
    hasMore,
    coverage: 'COMPLETE',
    generatedAt: new Date().toISOString()
  };
}
