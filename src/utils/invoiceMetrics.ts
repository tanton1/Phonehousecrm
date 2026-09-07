import type { CashTransaction, SalesInvoice } from '../types';
import { getVietnamDateString } from './dateTimeUtils';
import { toIsoDateTime } from './dateValue';

const NON_POSTED_INVOICE_STATUSES = new Set([
  'CANCELLED',
  'CANCELED',
  'REFUNDED',
  'REVERSED',
  'VOID',
  'DRAFT',
  'PENDING',
  'FAILED'
]);

const NON_POSTED_CASH_RECORD_STATUSES = new Set([
  'DRAFT',
  'REVERSED',
  'CANCELLED',
  'CANCELED'
]);

/** Resolves a Firestore/ISO/local business timestamp to its Vietnam date. */
export function dateOnlyInVietnam(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    // Canonical finance strings are already recorded in Vietnam local time.
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(trimmed) && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
  }
  const iso = toIsoDateTime(value);
  if (!iso) return '';
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? '' : getVietnamDateString(parsed);
}

export function invoiceBusinessDate(invoice: Pick<SalesInvoice, 'createdDate' | 'createdAt'> & { date?: unknown }): string {
  return dateOnlyInVietnam(invoice.createdDate || invoice.createdAt || invoice.date);
}

export function isPostedInvoice(invoice: Pick<SalesInvoice, 'status'>): boolean {
  // Before lifecycle status existed, persisted invoices represented completed
  // sales. Keep those records, but fail closed for every known non-posted state.
  const status = String(invoice.status || 'COMPLETED').trim().toUpperCase();
  return !NON_POSTED_INVOICE_STATUSES.has(status);
}

export function isPostedCashTransaction(transaction: Pick<CashTransaction, 'status' | 'recordStatus'>): boolean {
  const status = String(transaction.status || 'COMPLETED').trim().toUpperCase();
  const recordStatus = String(transaction.recordStatus || 'POSTED').trim().toUpperCase();
  return status === 'COMPLETED' && !NON_POSTED_CASH_RECORD_STATUSES.has(recordStatus);
}

export function invoiceRevenueAmount(invoice: Pick<SalesInvoice, 'finalAmount' | 'totalAmount'>): number {
  const finalAmount = Number(invoice.finalAmount);
  if (Number.isFinite(finalAmount) && finalAmount >= 0) return finalAmount;
  const totalAmount = Number(invoice.totalAmount);
  return Number.isFinite(totalAmount) && totalAmount >= 0 ? totalAmount : 0;
}

export function invoiceLineItems(invoice: SalesInvoice): any[] {
  if (Array.isArray(invoice.detailedItems) && invoice.detailedItems.length > 0) return invoice.detailedItems;
  return Array.isArray(invoice.items) ? invoice.items : [];
}

export function shiftIsoDate(date: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(days)) return '';
  const shifted = new Date(`${date}T12:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function invoiceStaffUid(invoice: SalesInvoice): string {
  const record = invoice as SalesInvoice & {
    creatorUid?: string;
    sellerId?: string;
    cashierId?: string;
    salesStaffId?: string;
  };
  return String(record.creatorUid || record.sellerId || record.salesStaffId || record.cashierId || '').trim();
}
