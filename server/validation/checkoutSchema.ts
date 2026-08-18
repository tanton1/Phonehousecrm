/**
 * POS Checkout Payload Validator
 * Enforces schema integrity before executing atomic Firestore transaction.
 */

export interface CheckoutPayload {
  invoice: {
    id: string;
    invoiceCode?: string;
    customerName?: string;
    customerPhone?: string;
    phone?: string;
    devices?: any[];
    items?: any[];
    accessories?: any[];
    totalAmount: number;
    discountAmount?: number;
    tradeInDeduction?: number;
    finalAmount: number;
    paymentMethod: string;
    paymentFundId?: string;
    paymentTransactionId?: string;
    branchId?: string;
    warehouseId?: string;
    installmentDisbursementStatus?: 'PENDING' | 'DISBURSED';
    installmentExpectedAmount?: number;
    installmentContractCode?: string;
    history?: any[];
  };
  devicesToSell?: Array<{
    id: string;
    imei: string;
    model: string;
    sellPrice?: number;
  }>;
  accessoriesToSell?: Array<{
    product: {
      id: string;
      name: string;
      stockQuantity: number;
    };
    quantity: number;
  }>;
  cashTx?: {
    id: string;
    code: string;
    type: 'RECEIPT' | 'PAYMENT';
    category: string;
    amount: number;
    fundId?: string;
    fundType?: string;
    fundName?: string;
    date: string;
    partnerName?: string;
    partnerPhone?: string;
    status: string;
  } | null;
  tradeInDevice?: any | null;
  customerPartner?: any | null;
  financeCompanyPartner?: any | null;
  fundToUpdate?: any | null;
  idempotencyKey?: string;
}

export function validateCheckoutPayload(body: any): { isValid: boolean; error?: string; data?: CheckoutPayload } {
  if (!body || typeof body !== 'object') {
    return { isValid: false, error: 'Request body must be a valid JSON object.' };
  }

  const { invoice } = body;
  if (!invoice || typeof invoice !== 'object') {
    return { isValid: false, error: 'Thiếu đối tượng hóa đơn (invoice).' };
  }

  if (!invoice.id || typeof invoice.id !== 'string') {
    return { isValid: false, error: 'Mã hóa đơn (invoice.id) không hợp lệ.' };
  }

  if (typeof invoice.finalAmount !== 'number' || invoice.finalAmount < 0) {
    return { isValid: false, error: 'Tổng tiền thanh toán (finalAmount) không hợp lệ.' };
  }

  if (!invoice.paymentMethod || typeof invoice.paymentMethod !== 'string') {
    return { isValid: false, error: 'Phương thức thanh toán không được để trống.' };
  }

  return { isValid: true, data: body as CheckoutPayload };
}
