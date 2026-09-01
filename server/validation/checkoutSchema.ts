/**
 * POS Checkout Payload Validator - Server Truth Edition V3.1
 * Strictly validates and sanitizes checkout intents from client.
 */

export const ALLOWED_PAYMENT_METHODS = ['CASH', 'BANK', 'CARD', 'INSTALLMENT', 'DEBT'] as const;
export type PaymentMethodType = typeof ALLOWED_PAYMENT_METHODS[number];

export const MAX_POS_DEVICES = 50;
export const MAX_POS_ACCESSORY_SKUS = 50;
export const MAX_POS_ACCESSORY_QUANTITY_PER_SKU = 100;
export const MAX_POS_PAYMENT_LINES = 10;
export const MAX_POS_PAYMENT_AMOUNT = 100_000_000_000;
export const MAX_POS_PRICE_ADJUSTMENTS = MAX_POS_DEVICES + MAX_POS_ACCESSORY_SKUS;

export interface CanonicalAccessoryLine {
  productId: string;
  quantity: number;
}

export function normalizeCheckoutAccessoryLines(lines: unknown): CanonicalAccessoryLine[] {
  if (!Array.isArray(lines)) return [];
  const quantities = new Map<string, number>();
  for (const rawLine of lines) {
    if (!rawLine || typeof rawLine !== 'object') throw new Error('POS_ACCESSORY_LINE_INVALID');
    const line = rawLine as Record<string, any>;
    const productId = String(line.productId || line.product?.id || '').trim();
    const quantity = Number(line.quantity);
    if (!productId) throw new Error('POS_ACCESSORY_PRODUCT_REQUIRED');
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('POS_ACCESSORY_QUANTITY_INVALID');
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  if (quantities.size > MAX_POS_ACCESSORY_SKUS) throw new Error('POS_CART_TOO_MANY_ACCESSORY_SKUS');
  return [...quantities.entries()]
    .map(([productId, quantity]) => {
      if (quantity > MAX_POS_ACCESSORY_QUANTITY_PER_SKU) throw new Error('POS_ACCESSORY_QUANTITY_LIMIT_EXCEEDED');
      return { productId, quantity };
    })
    .sort((left, right) => left.productId.localeCompare(right.productId));
}

export function normalizeCheckoutPaymentMethod(value: unknown): PaymentMethodType | null {
  const method = String(value || '').trim().toUpperCase();
  if (ALLOWED_PAYMENT_METHODS.includes(method as PaymentMethodType)) return method as PaymentMethodType;
  if (['TIỀN MẶT', 'TIEN MAT', 'KÉT TIỀN', 'KET TIEN'].includes(method)) return 'CASH';
  if (method.startsWith('CHUYỂN KHOẢN') || method.startsWith('CHUYEN KHOAN') || method.includes('VIETQR')) return 'BANK';
  if (method.includes('QUẸT THẺ') || method.includes('QUET THE') || method.includes('POS')) return 'CARD';
  if (method.includes('GHI NỢ') || method.includes('GHI NO')) return 'DEBT';
  if (method.includes('TRẢ GÓP') || method.includes('TRA GOP')) return 'INSTALLMENT';
  return null;
}

export interface SplitPaymentLine {
  method: PaymentMethodType;
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
  commissionTagSelections?: Array<{
    itemType: 'DEVICE' | 'ACCESSORY';
    itemId: string;
    tagIds: string[];
  }>;
  priceAdjustments?: Array<{
    itemType: 'DEVICE' | 'ACCESSORY';
    itemId: string;
    unitPrice: number;
    reason: string;
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
  installmentFinancePartnerId?: string;
  installmentContractCode?: string;
  voucherCode?: string;
  tradeInAppraisalId?: string;
  tradeInDevice?: any | null;
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
    if (!body.warehouseId || typeof body.warehouseId !== 'string' || body.warehouseId === 'ALL') {
      return { isValid: false, error: 'Bắt buộc chọn kho bán hàng cụ thể (warehouseId).' };
    }
    if (Boolean(body.tradeInAppraisalId) !== Boolean(body.tradeInDevice)) {
      return { isValid: false, error: 'Phiếu thu cũ và thông tin IMEI máy nhận phải được gửi cùng nhau.' };
    }
    if (body.tradeInDevice) {
      const imei = String(body.tradeInDevice.imei || '').replace(/\D/g, '');
      const locationId = String(body.tradeInDevice.currentLocationId || body.tradeInDevice.warehouseId || body.tradeInDevice.warehouse || '');
      if (!/^\d{5,15}$/.test(imei) || !locationId) {
        return { isValid: false, error: 'Máy thu cũ phải có IMEI từ 5–15 số và kho nhận hợp lệ.' };
      }
    }

    // Check empty cart
    const deviceIds: string[] = body.deviceIds;
    const rawAccessoryLines = Array.isArray(body.accessoryLines) ? body.accessoryLines : [];
    let accessoryLines: CanonicalAccessoryLine[] = [];
    try {
      accessoryLines = normalizeCheckoutAccessoryLines(rawAccessoryLines);
    } catch (error: any) {
      const code = String(error?.message || 'POS_ACCESSORY_LINE_INVALID');
      const messages: Record<string, string> = {
        POS_ACCESSORY_LINE_INVALID: 'Dữ liệu dòng phụ kiện không hợp lệ.',
        POS_ACCESSORY_PRODUCT_REQUIRED: 'Thiếu mã sản phẩm phụ kiện (productId).',
        POS_ACCESSORY_QUANTITY_INVALID: 'Số lượng phụ kiện phải là số nguyên dương.',
        POS_ACCESSORY_QUANTITY_LIMIT_EXCEEDED: `Tổng số lượng của một SKU phụ kiện không được vượt ${MAX_POS_ACCESSORY_QUANTITY_PER_SKU}.`,
        POS_CART_TOO_MANY_ACCESSORY_SKUS: `Một hóa đơn không được vượt ${MAX_POS_ACCESSORY_SKUS} SKU phụ kiện.`
      };
      return { isValid: false, error: messages[code] || code };
    }

    if (deviceIds.length === 0 && accessoryLines.length === 0) {
      return { isValid: false, error: 'Giỏ hàng không được để trống (phải có ít nhất 1 máy hoặc phụ kiện).' };
    }

    // Check duplicate device IDs
    if (new Set(deviceIds).size !== deviceIds.length) {
      return { isValid: false, error: 'Phát hiện mã thiết bị trùng lặp trong giỏ hàng.' };
    }

    if (deviceIds.length > MAX_POS_DEVICES) {
      return { isValid: false, error: `Một hóa đơn không được vượt ${MAX_POS_DEVICES} máy.` };
    }

    // The canonical lines above have already merged repeated productId values.
    for (const acc of accessoryLines) {
      if (!Number.isSafeInteger(acc.quantity) || acc.quantity < 1 || acc.quantity > MAX_POS_ACCESSORY_QUANTITY_PER_SKU) {
        return { isValid: false, error: `Số lượng phụ kiện "${acc.productId}" không hợp lệ (${acc.quantity}). Phải là số nguyên từ 1 đến 100.` };
      }
    }

    const commissionTagSelections = Array.isArray(body.commissionTagSelections) ? body.commissionTagSelections : [];
    const selectionKeys = new Set<string>();
    const cartDeviceIds = new Set(deviceIds);
    const cartAccessoryIds = new Set(accessoryLines.map((line: any) => line.productId));
    for (const selection of commissionTagSelections) {
      if (!selection || !['DEVICE', 'ACCESSORY'].includes(selection.itemType) || typeof selection.itemId !== 'string' || !selection.itemId.trim()) {
        return { isValid: false, error: 'Dữ liệu tag hoa hồng theo dòng hàng không hợp lệ.' };
      }
      if (!Array.isArray(selection.tagIds) || selection.tagIds.length !== 1 || selection.tagIds.some((id: any) => typeof id !== 'string' || !id.trim())) {
        return { isValid: false, error: `Mỗi dòng hàng "${selection.itemId}" phải chọn đúng một tag hoa hồng.` };
      }
      if (new Set(selection.tagIds).size !== selection.tagIds.length) {
        return { isValid: false, error: `Tag hoa hồng của dòng "${selection.itemId}" bị trùng.` };
      }
      const key = `${selection.itemType}:${selection.itemId}`;
      if (selectionKeys.has(key)) return { isValid: false, error: `Dòng chọn tag "${key}" bị trùng.` };
      if ((selection.itemType === 'DEVICE' && !cartDeviceIds.has(selection.itemId)) || (selection.itemType === 'ACCESSORY' && !cartAccessoryIds.has(selection.itemId))) {
        return { isValid: false, error: `Dòng chọn tag "${key}" không có trong giỏ hàng.` };
      }
      selectionKeys.add(key);
    }

    const priceAdjustments = Array.isArray(body.priceAdjustments) ? body.priceAdjustments : [];
    if (priceAdjustments.length > MAX_POS_PRICE_ADJUSTMENTS) {
      return { isValid: false, error: 'Số dòng điều chỉnh giá vượt giới hạn của hóa đơn.' };
    }
    const adjustmentKeys = new Set<string>();
    for (const adjustment of priceAdjustments) {
      const itemType = String(adjustment?.itemType || '').toUpperCase();
      const itemId = String(adjustment?.itemId || '').trim();
      const unitPrice = adjustment?.unitPrice;
      const reason = String(adjustment?.reason || '').trim();
      const key = `${itemType}:${itemId}`;
      if (
        !['DEVICE', 'ACCESSORY'].includes(itemType)
        || !itemId
        || !Number.isSafeInteger(unitPrice)
        || unitPrice <= 0
        || unitPrice > MAX_POS_PAYMENT_AMOUNT
        || !reason
        || reason.length > 500
        || adjustmentKeys.has(key)
      ) {
        return { isValid: false, error: 'Dữ liệu điều chỉnh giá bán không hợp lệ.' };
      }
      if (
        (itemType === 'DEVICE' && !cartDeviceIds.has(itemId))
        || (itemType === 'ACCESSORY' && !cartAccessoryIds.has(itemId))
      ) {
        return { isValid: false, error: `Dòng điều chỉnh giá "${key}" không có trong giỏ hàng.` };
      }
      adjustmentKeys.add(key);
    }

    // Multi-Payment (Split Tender) Validation
    if (Array.isArray(body.payments) && body.payments.length > 0) {
      if (body.payments.length > MAX_POS_PAYMENT_LINES) {
        return { isValid: false, error: `Một hóa đơn không được vượt ${MAX_POS_PAYMENT_LINES} nguồn thanh toán.` };
      }
      let installmentCount = 0;
      let debtCount = 0;
      let totalPaymentAmount = 0;

      for (const p of body.payments) {
        if (!p || typeof p !== 'object') {
          return { isValid: false, error: 'Khoản thanh toán trong mảng payments không hợp lệ.' };
        }
        // Strict runtime enum check for payment method (P0 fix)
        const normalizedMethod = normalizeCheckoutPaymentMethod(p.method);
        if (!normalizedMethod) {
          return { 
            isValid: false, 
            error: `Phương thức thanh toán "${p.method}" không hợp lệ. Chỉ chấp nhận: ${ALLOWED_PAYMENT_METHODS.join(', ')}.` 
          };
        }
        p.method = normalizedMethod;
        if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || !Number.isSafeInteger(p.amount) || p.amount < 0 || p.amount > MAX_POS_PAYMENT_AMOUNT) {
          return { isValid: false, error: 'Số tiền thanh toán phải là số nguyên VNĐ hợp lệ.' };
        }
        totalPaymentAmount += p.amount;
        if (!Number.isSafeInteger(totalPaymentAmount) || totalPaymentAmount > MAX_POS_PAYMENT_AMOUNT) {
          return { isValid: false, error: 'Tổng tiền thanh toán vượt giới hạn giao dịch.' };
        }

        if (p.method === 'INSTALLMENT') installmentCount++;
        if (p.method === 'DEBT') debtCount++;

        const requiresFund = p.method !== 'DEBT' && p.method !== 'INSTALLMENT';
        if (p.amount > 0 && requiresFund && (!p.fundId || typeof p.fundId !== 'string')) {
          return { isValid: false, error: `Khoản thanh toán "${p.method}" (${p.amount.toLocaleString('vi-VN')} đ) bắt buộc phải chọn tài khoản/két nhận tiền.` };
        }
      }

      // Invariant: Max 1 Installment contract and Max 1 Debt line per invoice
      if (installmentCount > 1) {
        return { isValid: false, error: 'Mỗi đơn hàng chỉ được phép có tối đa 1 khoản vay trả góp qua công ty tài chính.' };
      }
      if (debtCount > 1) {
        return { isValid: false, error: 'Mỗi đơn hàng chỉ được phép có tối đa 1 khoản ghi nợ khách hàng.' };
      }

      // Invariant: Installment in multi-payment requires finance partner (P1 fix)
      if (installmentCount > 0) {
        const financePartnerId = body.installmentFinancePartnerId || body.payment?.installmentFinancePartnerId;
        if (!financePartnerId || typeof financePartnerId !== 'string') {
          return { isValid: false, error: 'Bắt buộc chọn Đối tác tài chính giải ngân cho khoản vay trả góp (installmentFinancePartnerId).' };
        }
      }
    } else if (body.payment) {
      // Single Payment Method Validation
      const { method, fundId, downPayment, installmentFinancePartnerId } = body.payment;

      if (!method || (!ALLOWED_PAYMENT_METHODS.includes(method as any) && method !== 'SPLIT')) {
        return { 
          isValid: false, 
          error: `Phương thức thanh toán "${method}" không hợp lệ. Chỉ chấp nhận: ${ALLOWED_PAYMENT_METHODS.join(', ')} hoặc SPLIT.` 
        };
      }

      if (downPayment !== undefined) {
        if (typeof downPayment !== 'number' || !Number.isFinite(downPayment) || !Number.isSafeInteger(downPayment) || downPayment < 0 || downPayment > MAX_POS_PAYMENT_AMOUNT) {
          return { isValid: false, error: 'Số tiền trả trước phải là số nguyên VNĐ hợp lệ.' };
        }
      }

      if (method === 'INSTALLMENT') {
        if (!installmentFinancePartnerId && !body.installmentFinancePartnerId) {
          return { isValid: false, error: 'Bắt buộc chọn Đối tác tài chính giải ngân cho đơn trả góp.' };
        }
      }

      const requiresFund = method !== 'INSTALLMENT' || (typeof downPayment === 'number' && downPayment > 0);
      if (requiresFund && (!fundId || typeof fundId !== 'string')) {
        return { isValid: false, error: 'Bắt buộc chọn Quỹ tiền / Tài khoản ngân hàng nhận tiền (payment.fundId).' };
      }
    }

    return { isValid: true, data: { ...body, accessoryLines, priceAdjustments } as PureIntentCheckoutPayload };
  }

  // 2. Legacy Format (Backward compatibility for non-production environments)
  if (process.env.NODE_ENV === 'production') {
    return {
      isValid: false,
      error: 'LEGACY_CHECKOUT_DISABLED: Production chỉ nhận checkout intent do server tự định giá và hạch toán.'
    };
  }
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
