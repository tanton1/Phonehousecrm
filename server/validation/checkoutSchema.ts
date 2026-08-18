/**
 * POS Checkout Payload Validator - Server Truth Edition
 * Validates and sanitizes checkout intents from client.
 */

export interface PureIntentCheckoutPayload {
  idempotencyKey: string;
  branchId: string;
  warehouseId?: string;
  deviceIds: string[];
  accessoryLines?: Array<{
    productId: string;
    quantity: number;
  }>;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  payment: {
    method: 'CASH' | 'BANK' | 'INSTALLMENT' | 'CARD';
    fundId: string;
    downPayment?: number;
    installmentFinancePartnerId?: string;
    installmentContractCode?: string;
  };
  voucherCode?: string;
  tradeInAppraisalId?: string;
  tradeInDeduction?: number;
  notes?: string;
  creatorUid?: string;
  creatorName?: string;
}

export interface LegacyCheckoutPayload {
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
  cashTx?: any | null;
  tradeInDevice?: any | null;
  customerPartner?: any | null;
  financeCompanyPartner?: any | null;
  fundToUpdate?: any | null;
  idempotencyKey?: string;
}

export type CheckoutPayload = LegacyCheckoutPayload | (PureIntentCheckoutPayload & { invoice?: any });

export function validateCheckoutPayload(body: any): { isValid: boolean; error?: string; data?: any } {
  if (!body || typeof body !== 'object') {
    return { isValid: false, error: 'Request body must be a valid JSON object.' };
  }

  // 1. Pure Intent Format
  if (Array.isArray(body.deviceIds) && body.payment && body.branchId) {
    if (!body.idempotencyKey || typeof body.idempotencyKey !== 'string') {
      return { isValid: false, error: 'Thiếu idempotencyKey để đảm bảo an toàn giao dịch.' };
    }
    if (!body.payment.fundId || typeof body.payment.fundId !== 'string') {
      return { isValid: false, error: 'Thiếu thông tin Quỹ tiền thực hiện (payment.fundId).' };
    }
    return { isValid: true, data: body as PureIntentCheckoutPayload };
  }

  // 2. Legacy Format (Backward compatibility)
  const { invoice } = body;
  if (!invoice || typeof invoice !== 'object') {
    return { isValid: false, error: 'Thiếu đối tượng hóa đơn (invoice) hoặc cấu trúc intent thanh toán.' };
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

  return { isValid: true, data: body as LegacyCheckoutPayload };
}
