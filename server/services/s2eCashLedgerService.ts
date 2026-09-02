import { AggregateField, FieldPath, Firestore } from 'firebase-admin/firestore';
import type { CashLedgerActor } from './cashLedgerService';

export interface S2eCashLedgerQuery {
  branchId?: string;
  from?: string;
  to?: string;
}

interface S2eFundInput {
  id: string;
  branchId: string;
  name: string;
  type: string;
  openingBalance?: number;
  currentBalance?: number;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  isArchived?: boolean;
}

interface S2eTransactionInput {
  id: string;
  fundId: string;
  fundName?: string;
  fundType?: string;
  code?: string;
  date?: string;
  type?: string;
  category?: string;
  categoryName?: string;
  amount?: number;
  notes?: string;
  partnerName?: string;
  referenceCode?: string;
  transferGroupId?: string;
}

interface KnownOpeningTransaction {
  exists: boolean;
  date?: string;
  type?: string;
  amount?: number;
}

interface BuildS2eInput {
  branchId: string;
  from: string;
  to: string;
  funds: S2eFundInput[];
  periodTransactions: S2eTransactionInput[];
  priorNetByFund: Record<string, number>;
  knownOpeningByFund: Record<string, KnownOpeningTransaction>;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REPORT_ROWS = 20_000;
const CASH_TYPES = new Set(['CASH', 'BANK']);
const OPENING_CATEGORIES = new Set(['OPENING_BALANCE']);
const INTERNAL_TRANSFER_CATEGORIES = new Set(['INTERNAL_TRANSFER', 'INTER_BRANCH_RECEIPT', 'INTER_BRANCH_PAYMENT']);

function canAccessBranch(actor: CashLedgerActor, branchId: string): boolean {
  const role = String(actor.role || '').toUpperCase();
  return role === 'ADMIN'
    || actor.branchId === branchId
    || (actor.assignedBranchIds || []).includes(branchId);
}

function finiteMoney(value: unknown): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function transactionEffect(transaction: Pick<S2eTransactionInput, 'type' | 'amount'>): number {
  const amount = finiteMoney(transaction.amount);
  if (transaction.type === 'RECEIPT') return amount;
  if (transaction.type === 'PAYMENT') return -amount;
  return 0;
}

function sourceIdForFund(fund: S2eFundInput): string {
  return fund.type === 'CASH' ? 'CASH' : `BANK:${fund.id}`;
}

function sourceLabelForFund(fund: S2eFundInput): string {
  if (fund.type === 'CASH') return 'Tiền mặt';
  const bankLabel = fund.bankName || fund.name || 'Tiền gửi thanh toán';
  return fund.accountNumber ? `${bankLabel} • ${fund.accountNumber}` : bankLabel;
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

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000);
}

export function buildS2eCashLedgerReport(input: BuildS2eInput): any {
  const eligibleFunds = input.funds.filter(fund => CASH_TYPES.has(String(fund.type || '').toUpperCase()));
  const eligibleFundIds = new Set(eligibleFunds.map(fund => fund.id));
  const fundsById = new Map(eligibleFunds.map(fund => [fund.id, fund]));
  const periodTransactions = input.periodTransactions
    .filter(transaction => eligibleFundIds.has(transaction.fundId))
    .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')) || left.id.localeCompare(right.id));

  const openingByFund: Record<string, number> = {};
  for (const fund of eligibleFunds) {
    const knownOpening = input.knownOpeningByFund[fund.id];
    const hasKnownOpening = knownOpening?.exists === true;
    let opening = finiteMoney(input.priorNetByFund[fund.id]);

    // The deterministic OPENING_<fundId> voucher is already part of priorNet when
    // it predates the report. If it falls inside the selected period, move it to
    // opening so it never inflates "Thu trong kỳ".
    if (hasKnownOpening && String(knownOpening.date || '') >= input.from && String(knownOpening.date || '') <= `${input.to}\uf8ff`) {
      opening += transactionEffect(knownOpening);
    } else if (!hasKnownOpening) {
      // Compatibility for legacy funds created before opening vouchers were linked.
      opening += finiteMoney(fund.openingBalance);
    }

    // Also recognize imported opening vouchers whose id is not deterministic.
    const importedOpeningEffect = periodTransactions
      .filter(transaction => transaction.fundId === fund.id && OPENING_CATEGORIES.has(String(transaction.category || '')))
      .reduce((sum, transaction) => sum + transactionEffect(transaction), 0);
    if (!hasKnownOpening) opening += importedOpeningEffect;

    openingByFund[fund.id] = opening;
  }

  const sourceMap = new Map<string, any>();
  for (const fund of eligibleFunds) {
    const sourceId = sourceIdForFund(fund);
    const existing = sourceMap.get(sourceId) || {
      id: sourceId,
      kind: fund.type === 'CASH' ? 'CASH' : 'BANK',
      label: sourceLabelForFund(fund),
      bankName: fund.type === 'BANK' ? fund.bankName || '' : '',
      accountNumber: fund.type === 'BANK' ? fund.accountNumber || '' : '',
      accountHolder: fund.type === 'BANK' ? fund.accountHolder || '' : '',
      fundIds: [],
      openingBalance: 0,
      receipts: 0,
      payments: 0,
      closingBalance: 0,
      internalReceipts: 0,
      internalPayments: 0,
      rows: []
    };
    existing.fundIds.push(fund.id);
    existing.openingBalance += finiteMoney(openingByFund[fund.id]);
    sourceMap.set(sourceId, existing);
  }

  for (const transaction of periodTransactions) {
    if (OPENING_CATEGORIES.has(String(transaction.category || ''))) continue;
    const fund = fundsById.get(transaction.fundId);
    if (!fund) continue;
    const source = sourceMap.get(sourceIdForFund(fund));
    if (!source) continue;
    const amount = finiteMoney(transaction.amount);
    const isReceipt = transaction.type === 'RECEIPT';
    const isPayment = transaction.type === 'PAYMENT';
    const isInternalTransfer = INTERNAL_TRANSFER_CATEGORIES.has(String(transaction.category || '')) || Boolean(transaction.transferGroupId);
    if (isReceipt) source.receipts += amount;
    if (isPayment) source.payments += amount;
    if (isInternalTransfer && isReceipt) source.internalReceipts += amount;
    if (isInternalTransfer && isPayment) source.internalPayments += amount;
    source.rows.push({
      id: transaction.id,
      code: transaction.code || transaction.id,
      date: String(transaction.date || ''),
      description: transaction.notes || transaction.categoryName || 'Thu/chi tiền',
      partnerName: transaction.partnerName || '',
      referenceCode: transaction.referenceCode || '',
      receipt: isReceipt ? amount : 0,
      payment: isPayment ? amount : 0,
      runningBalance: 0,
      fundId: fund.id,
      fundName: fund.name,
      isInternalTransfer
    });
  }

  const sources = [...sourceMap.values()]
    .sort((left, right) => left.kind === right.kind ? left.label.localeCompare(right.label, 'vi') : left.kind === 'CASH' ? -1 : 1)
    .map(source => {
      let runningBalance = source.openingBalance;
      source.rows = source.rows.map((row: any) => {
        runningBalance += row.receipt - row.payment;
        return { ...row, runningBalance };
      });
      source.closingBalance = source.openingBalance + source.receipts - source.payments;
      return source;
    });

  const total = sources.reduce((summary, source) => ({
    openingBalance: summary.openingBalance + source.openingBalance,
    receipts: summary.receipts + source.receipts,
    payments: summary.payments + source.payments,
    closingBalance: summary.closingBalance + source.closingBalance,
    internalReceipts: summary.internalReceipts + source.internalReceipts,
    internalPayments: summary.internalPayments + source.internalPayments
  }), { openingBalance: 0, receipts: 0, payments: 0, closingBalance: 0, internalReceipts: 0, internalPayments: 0 });

  const excludedSettlementFunds = input.funds
    .filter(fund => !CASH_TYPES.has(String(fund.type || '').toUpperCase()))
    .map(fund => ({ id: fund.id, name: fund.name, type: fund.type, currentBalance: finiteMoney(fund.currentBalance) }));

  return {
    regulation: '152/2025/TT-BTC',
    formCode: 'S2e-HKD',
    branchId: input.branchId,
    from: input.from,
    to: input.to,
    currency: 'VND',
    sources,
    total: {
      ...total,
      externalReceipts: total.receipts - total.internalReceipts,
      externalPayments: total.payments - total.internalPayments
    },
    excludedSettlementFunds,
    generatedAt: new Date().toISOString()
  };
}

export async function getS2eCashLedgerReport(
  db: Firestore,
  actor: CashLedgerActor,
  input: S2eCashLedgerQuery
): Promise<any> {
  const branchId = String(input.branchId || actor.branchId || '').trim();
  const role = String(actor.role || '').toUpperCase();
  const from = String(input.from || '').trim();
  const to = String(input.to || '').trim();
  if (!branchId) throw new Error('S2E_BRANCH_REQUIRED');
  if (branchId === 'ALL' && role !== 'ADMIN') throw new Error('S2E_BRANCH_FORBIDDEN');
  if (branchId !== 'ALL' && !canAccessBranch(actor, branchId)) throw new Error('S2E_BRANCH_FORBIDDEN');
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) throw new Error('S2E_DATE_RANGE_INVALID');
  if (daysBetween(from, to) > 366) throw new Error('S2E_DATE_RANGE_TOO_LARGE');

  const fundQuery = branchId === 'ALL'
    ? db.collection('funds')
    : db.collection('funds').where('branchId', '==', branchId);
  const fundSnapshot = await fundQuery.get();
  const funds = fundSnapshot.docs.map(document => serializeValue({ ...document.data(), id: document.id })) as S2eFundInput[];
  const eligibleFunds = funds.filter(fund => CASH_TYPES.has(String(fund.type || '').toUpperCase()));

  let periodQuery: any = db.collection('cashTransactions')
    .where('status', '==', 'COMPLETED')
    .where('date', '>=', from)
    .where('date', '<=', `${to}\uf8ff`);
  if (branchId !== 'ALL') periodQuery = periodQuery.where('branchId', '==', branchId);
  periodQuery = periodQuery
    .orderBy('date', 'asc')
    .orderBy(FieldPath.documentId(), 'asc')
    .limit(MAX_REPORT_ROWS + 1);
  const periodSnapshot = await periodQuery.get();
  if (periodSnapshot.docs.length > MAX_REPORT_ROWS) throw new Error('S2E_REPORT_TOO_MANY_ROWS');
  const periodTransactions = periodSnapshot.docs.map((document: any) => serializeValue({ ...document.data(), id: document.id })) as S2eTransactionInput[];

  const priorNetByFund: Record<string, number> = {};
  const knownOpeningByFund: Record<string, KnownOpeningTransaction> = {};
  await Promise.all(eligibleFunds.map(async fund => {
    const priorBase = () => {
      let query: any = db.collection('cashTransactions')
        .where('fundId', '==', fund.id)
        .where('status', '==', 'COMPLETED')
        .where('date', '<', from);
      if (branchId !== 'ALL') query = query.where('branchId', '==', branchId);
      return query;
    };
    const [receiptsSnapshot, paymentsSnapshot, openingSnapshot] = await Promise.all([
      priorBase().where('type', '==', 'RECEIPT').aggregate({ amount: AggregateField.sum('amount') }).get(),
      priorBase().where('type', '==', 'PAYMENT').aggregate({ amount: AggregateField.sum('amount') }).get(),
      db.collection('cashTransactions').doc(`OPENING_${fund.id}`).get()
    ]);
    priorNetByFund[fund.id] = finiteMoney(receiptsSnapshot.data().amount) - finiteMoney(paymentsSnapshot.data().amount);
    const openingData = openingSnapshot.exists ? serializeValue(openingSnapshot.data()) : null;
    knownOpeningByFund[fund.id] = {
      // Keep knowledge of a posted opening voucher even when it falls after the
      // selected period. Otherwise a future account would incorrectly fall back
      // to fund.openingBalance and appear in an earlier historical report.
      exists: Boolean(openingData && openingData.status === 'COMPLETED'),
      date: openingData?.date,
      type: openingData?.type,
      amount: openingData?.amount
    };
  }));

  return buildS2eCashLedgerReport({
    branchId,
    from,
    to,
    funds,
    periodTransactions,
    priorNetByFund,
    knownOpeningByFund
  });
}
