export interface InvoiceLineDisplay {
  id: string;
  name: string;
  imei?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  color?: string;
  storage?: string;
  type: 'device' | 'accessory' | 'service' | 'repair' | 'tradein';
}

export function asInvoiceMoney(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Normalizes legacy and server-authoritative invoice shapes for every UI surface. */
export function getInvoiceLines(invoice: any): InvoiceLineDisplay[] {
  const toLine = (item: any, index: number, fallbackType: InvoiceLineDisplay['type']): InvoiceLineDisplay => {
    const quantity = Math.max(1, Math.floor(asInvoiceMoney(item?.quantity) || 1));
    const rawUnitPrice = item?.unitPrice ?? item?.price ?? item?.sellPrice;
    const rawTotalPrice = item?.totalPrice;
    const unitPrice = asInvoiceMoney(rawUnitPrice);
    const totalPrice = rawTotalPrice === undefined || rawTotalPrice === null
      ? unitPrice * quantity
      : asInvoiceMoney(rawTotalPrice);
    return {
      id: String(item?.id || item?.sku || item?.imei || `${fallbackType}-${index}`),
      name: String(item?.name || item?.model || 'Sản phẩm'),
      imei: item?.imei ? String(item.imei) : undefined,
      quantity,
      unitPrice: unitPrice || (quantity > 0 ? totalPrice / quantity : 0),
      totalPrice,
      color: item?.color ? String(item.color) : undefined,
      storage: item?.storage ? String(item.storage) : undefined,
      type: (item?.type === 'accessory' || item?.type === 'service' || item?.type === 'repair' || item?.type === 'tradein' || item?.type === 'device')
        ? item.type
        : fallbackType
    };
  };

  if (Array.isArray(invoice?.detailedItems) && invoice.detailedItems.length > 0) {
    return invoice.detailedItems.map((item: any, index: number) => toLine(item, index, item?.imei ? 'device' : 'accessory'));
  }
  if (Array.isArray(invoice?.items) && invoice.items.length > 0) {
    return invoice.items.map((item: any, index: number) => toLine(item, index, item?.imei ? 'device' : 'accessory'));
  }
  return [
    ...(Array.isArray(invoice?.devices) ? invoice.devices.map((item: any, index: number) => toLine(item, index, 'device')) : []),
    ...(Array.isArray(invoice?.accessories) ? invoice.accessories.map((item: any, index: number) => toLine(item, index, 'accessory')) : [])
  ];
}

export function getInvoiceSubtotal(invoice: any, lines = getInvoiceLines(invoice)): number {
  const explicit = invoice?.subTotal ?? invoice?.totalAmount;
  return explicit === undefined || explicit === null
    ? lines.reduce((sum, item) => sum + item.totalPrice, 0)
    : asInvoiceMoney(explicit);
}

export function getInvoiceFinalAmount(invoice: any, fallback = 0): number {
  return asInvoiceMoney(invoice?.finalAmount ?? invoice?.totalAmount ?? fallback);
}

export function formatVnd(value: unknown): string {
  return asInvoiceMoney(value).toLocaleString('vi-VN');
}
