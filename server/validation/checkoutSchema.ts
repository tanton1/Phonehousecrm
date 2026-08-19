/**
 * POS Checkout Payload Validator - Server Truth Edition V3
 * Validates and sanitizes checkout intents from client.
 */

export interface SplitPaymentLine {
  method: 'CASH' | 'BANK' | 'CARD' | 'INSTALLMENT' | 'DEBT';
  amount: number;
  fundId?: string;
  bankName?: string;
  accountNumber?: string;
  note?: string;
}

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
  payment?: {
    method: 'CASH' | 'BANK' | 'INSTALLMENT' | 'CARD' | 'SPLIT';
    fundId?: string;
    downPayment?: number;
    installmentFinancePartnerId?: string;
    installmentContractCode?: string;
  };
  payments?: SplitPaymentLine[];
  voucherCode?: string;
  tradeInAppraisalId?: string;
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

  // 1. Pure Intent Format (Standard in V3)
  if (Array.isArray(body.deviceIds) && (body.payment || Array.isArray(body.payments)) && body.branchId) {
    if (!body.idempotencyKey || typeof body.idempotencyKey !== 'string') {
      return { isValid: false, error: 'Thiếu idempotencyKey để đảm bảo an toàn giao dịch.' };
    }

    // Check empty cart
    const deviceIds: string[] = body.deviceIds;
    const accessoryLines = Array.isArray(body.accessoryLines) ? body.accessoryLines : [];

    if (deviceIds.length === 0 && accessoryLines.length === 0) {
      return { isValid: false, error: 'Giỏ hàng không được để trống (phải có ít nhất 1 máy hoặc phụ kiện).' };
    }

    // Check duplicate device IDs
    if (new Set(deviceIds).size !== deviceIds.length) {
      return { isValid: false, error: 'Phát hiện mã thiết bị trùng lặp trong giỏ hàng.' };
    }

    // Check accessory quantity invariants (Must be finite positive integer >= 1 and <= 100)
    for (const acc of accessoryLines) {
      if (!acc || typeof acc !== 'object') {
        return { isValid: false, error: 'Dữ liệu dòng phụ kiện không hợp lệ.' };
      }
      if (!acc.productId || typeof acc.productId !== 'string') {
        return { isValid: false, error: 'Thiếu mã sản phẩm phụ kiện (productId).' };
      }
      if (!Number.isInteger(acc.quantity) || acc.quantity < 1 || acc.quantity > 100) {
        return { isValid: false, error: `Số lượng phụ kiện "${acc.productId}" không hợp lệ (${acc.quantity}). Phải là số nguyên từ 1 đến 100.` };
      }
    }

    // Multi-Payment (Split Tender) Validation
    if (Array.isArray(body.payments) && body.payments.length > 0) {
      for (const p of body.payments) {
        if (!p || typeof p !== 'object') {
          return { isValid: false, error: 'Khoản thanh toán trong mảng payments không hợp lệ.' };
        }
        if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount < 0) {
          return { isValid: false, error: 'Số tiền thanh toán phải là số dương hợp lệ.' };
        }
        const requiresFund = p.method !== 'DEBT' && p.method !== 'INSTALLMENT';
        if (p.amount > 0 && requiresFund && (!p.fundId || typeof p.fundId !== 'string')) {
          return { isValid: false, error: `Khoản thanh toán "${p.method}" (${p.amount.toLocaleString('vi-VN')} đ) bắt buộc phải chọn tài khoản/két nhận tiền.` };
        }
      }
    } else if (body.payment) {
      // Single Payment Method Validation
      const { method, fundId, downPayment } = body.payment;

      if (downPayment !== undefined) {
        if (typeof downPayment !== 'number' || !Number.isFinite(downPayment) || downPayment < 0) {
          return { isValid: false, error: 'Số tiền trả trước (downPayment) không hợp lệ.' };
        }
      }

      const requiresFund = method !== 'INSTALLMENT' || (typeof downPayment === 'number' && downPayment > 0);
      if (requiresFund && (!fundId || typeof fundId !== 'string')) {
        return { isValid: false, error: 'Bắt buộc chọn Quỹ tiền / Tài khoản ngân hàng nhận tiền (payment.fundId).' };
      }
    }

    return { isValid: true, data: body as PureIntentCheckoutPayload };
  }

  // 2. Legacy Format (Backward compatibility for non-production environments)
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

