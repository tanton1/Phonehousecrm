import { describe, expect, it } from 'vitest';
import { getInvoiceFinalAmount, getInvoiceLines, getInvoiceSubtotal } from '../src/utils/invoicePresentation';

describe('Invoice presentation normalization', () => {
  it('derives safe totals for POS invoice items that only have price', () => {
    const invoice = { items: [{ model: 'iPhone 15 Pro', imei: '12345', price: 25000000 }] };
    const lines = getInvoiceLines(invoice);
    expect(lines).toEqual([expect.objectContaining({ quantity: 1, unitPrice: 25000000, totalPrice: 25000000 })]);
    expect(getInvoiceSubtotal(invoice, lines)).toBe(25000000);
  });

  it('uses detailed-item quantity when totalPrice is absent', () => {
    const invoice = { detailedItems: [{ name: 'Cáp sạc', quantity: 2, unitPrice: 150000 }], totalAmount: 300000 };
    const lines = getInvoiceLines(invoice);
    expect(lines[0].totalPrice).toBe(300000);
    expect(getInvoiceFinalAmount(invoice)).toBe(300000);
  });

  it('prefers the canonical detailed items from the checkout response while keeping legacy invoices printable', () => {
    const checkoutInvoice = {
      items: [{ model: 'iPhone 15 Pro', imei: '35678901', price: 25000000 }],
      detailedItems: [{ id: 'device-1', name: 'iPhone 15 Pro', imei: '35678901', quantity: 1, unitPrice: 25000000, totalPrice: 25000000 }],
      totalAmount: 25000000
    };

    const lines = getInvoiceLines(checkoutInvoice);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ name: 'iPhone 15 Pro', quantity: 1, unitPrice: 25000000, totalPrice: 25000000 });
    expect(getInvoiceSubtotal(checkoutInvoice, lines)).toBe(25000000);
  });
});
