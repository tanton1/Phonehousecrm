import { BranchPartyAccount, CashTransaction, FundAccount, Partner, SalesInvoice } from '../types';
import { apiJson } from './apiClient';

export type PartnerDebtSettlementDirection = 'PAYMENT' | 'RECEIPT';

export async function requestPartnerAccounts(branchId: string): Promise<BranchPartyAccount[]> {
  const accounts: BranchPartyAccount[] = [];
  let cursor = '';
  for (let page = 0; page < 25; page += 1) {
    const params = new URLSearchParams({ branchId, limit: '200' });
    if (cursor) params.set('afterAccountId', cursor);
    const response = await apiJson<{
      success: boolean;
      accounts: BranchPartyAccount[];
      hasMore: boolean;
      nextCursor: string | null;
    }>(`/api/partners/accounts?${params.toString()}`, { method: 'GET' });
    accounts.push(...(response.accounts || []));
    if (!response.hasMore) return accounts;
    if (!response.nextCursor || response.nextCursor === cursor) throw new Error('PARTNER_ACCOUNTS_CURSOR_INVALID');
    cursor = response.nextCursor;
  }
  throw new Error('PARTNER_ACCOUNTS_RESULT_LIMIT: Cần lọc theo chi nhánh nhỏ hơn.');
}

export async function requestPaymentAccounts(branchId: string): Promise<FundAccount[]> {
  const response = await apiJson<{ success: boolean; accounts: Array<Partial<FundAccount> & Pick<FundAccount, 'id' | 'branchId' | 'name' | 'type'>> }>(
    `/api/finance/payment-accounts?branchId=${encodeURIComponent(branchId)}`,
    { method: 'GET' }
  );
  return (response.accounts || []).map(account => ({
    ...account,
    currentBalance: 0,
    openingBalance: 0,
    totalIncome: 0,
    totalExpense: 0,
    isActive: account.isActive !== false,
    color: account.color || (account.type === 'CASH' ? 'orange' : 'blue'),
    balanceHidden: true
  })) as FundAccount[];
}

export interface PartnerDebtAllocationResult {
  sourceType: 'PURCHASE_ORDER' | 'INVOICE';
  sourceId: string;
  sourceCode: string;
  amount: number;
  paidAmount: number;
  remainingDebt: number;
  paymentStatus: 'PAID' | 'PARTIAL';
}

export interface PartnerDebtSettlementResult {
  success: true;
  settlementId: string;
  partner: Partner;
  fund: FundAccount;
  cashTransaction: CashTransaction;
  allocations: PartnerDebtAllocationResult[];
  unallocatedAmount: number;
  idempotentReplay?: boolean;
}

export function createPartnerDebtIdempotencyKey(partnerId: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `PARTNER-DEBT:${partnerId}:${suffix}`;
}

export function requestSettlePartnerDebt(input: {
  partnerId: string;
  fundId: string;
  direction: PartnerDebtSettlementDirection;
  amount: number;
  note: string;
  idempotencyKey: string;
}): Promise<PartnerDebtSettlementResult> {
  return apiJson<PartnerDebtSettlementResult>('/api/finance/partner-debts/settle', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify(input)
  });
}

export interface CashLedgerResponse {
  items: CashTransaction[];
  totals: {
    receipts: number;
    payments: number;
    net: number;
    receiptCount: number;
    paymentCount: number;
    openingExcluded?: number;
    openingCount?: number;
  };
  nextCursor: string | null;
  hasMore: boolean;
  coverage: 'COMPLETE';
  generatedAt: string;
}

export interface S2eCashLedgerRow {
  id: string;
  code: string;
  date: string;
  description: string;
  partnerName: string;
  referenceCode: string;
  receipt: number;
  payment: number;
  runningBalance: number;
  fundId: string;
  fundName: string;
  isInternalTransfer: boolean;
}

export interface S2eCashLedgerSource {
  id: string;
  kind: 'CASH' | 'BANK';
  label: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  fundIds: string[];
  openingBalance: number;
  receipts: number;
  payments: number;
  closingBalance: number;
  internalReceipts: number;
  internalPayments: number;
  rows: S2eCashLedgerRow[];
}

export interface S2eCashLedgerReport {
  regulation: '152/2025/TT-BTC';
  formCode: 'S2e-HKD';
  branchId: string;
  from: string;
  to: string;
  currency: 'VND';
  sources: S2eCashLedgerSource[];
  total: {
    openingBalance: number;
    receipts: number;
    payments: number;
    closingBalance: number;
    internalReceipts: number;
    internalPayments: number;
    externalReceipts: number;
    externalPayments: number;
  };
  excludedSettlementFunds: Array<{
    id: string;
    name: string;
    type: string;
    currentBalance: number;
  }>;
  generatedAt: string;
}

export async function requestCashLedger(input: {
  branchId: string;
  fundId?: string;
  type?: 'ALL' | 'RECEIPT' | 'PAYMENT';
  category?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}): Promise<CashLedgerResponse> {
  const params = new URLSearchParams({ branchId: input.branchId, type: input.type || 'ALL', limit: String(input.limit || 50) });
  if (input.fundId && input.fundId !== 'ALL') params.set('fundId', input.fundId);
  if (input.category) params.set('category', input.category);
  if (input.from) params.set('from', input.from);
  if (input.to) params.set('to', input.to);
  if (input.cursor) params.set('cursor', input.cursor);
  const response = await apiJson<{ success: true; data: CashLedgerResponse }>(`/api/finance/cash-ledger?${params.toString()}`, { method: 'GET' });
  return response.data;
}

export async function requestS2eCashLedger(input: {
  branchId: string;
  from: string;
  to: string;
}): Promise<S2eCashLedgerReport> {
  const params = new URLSearchParams({ branchId: input.branchId, from: input.from, to: input.to });
  const response = await apiJson<{ success: true; data: S2eCashLedgerReport }>(
    `/api/finance/cash-ledger/s2e?${params.toString()}`,
    { method: 'GET' }
  );
  return response.data;
}

export async function requestReconcileFund(input: {
  fundId: string;
  actualBalance: number;
  notes: string;
  idempotencyKey: string;
}): Promise<{ adjustmentTx: CashTransaction | null; fund: FundAccount; reconciliationId: string }> {
  return apiJson<{ adjustmentTx: CashTransaction | null; fund: FundAccount; reconciliationId: string }>('/api/finance/reconcile', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify(input)
  });
}

export interface InstallmentDisbursementResult {
  success: true;
  disbursementId: string;
  invoice: SalesInvoice;
  fund: FundAccount;
  financePartner: Partner;
  cashTransactions: CashTransaction[];
  idempotentReplay?: boolean;
}

export function requestInstallmentDisbursement(input: {
  invoiceId: string;
  fundId: string;
  receivedAmount: number;
  feeAmount: number;
  note: string;
  idempotencyKey: string;
}): Promise<InstallmentDisbursementResult> {
  return apiJson<InstallmentDisbursementResult>('/api/finance/installments/disburse', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify(input)
  });
}
