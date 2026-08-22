import { CashTransaction, FundAccount, Partner, SalesInvoice } from '../types';
import { apiJson } from './apiClient';

export type PartnerDebtSettlementDirection = 'PAYMENT' | 'RECEIPT';

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
