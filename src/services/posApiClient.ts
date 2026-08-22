import { SalesInvoice } from '../types';
import { apiJson } from './apiClient';

export async function requestUpdateInvoiceNote(invoiceId: string, notes: string): Promise<SalesInvoice> {
  const response = await apiJson<{ success: true; data: { invoice: SalesInvoice } }>(
    `/api/pos/invoices/${encodeURIComponent(invoiceId)}/notes`,
    { method: 'PATCH', body: JSON.stringify({ notes }) }
  );
  return response.data.invoice;
}
