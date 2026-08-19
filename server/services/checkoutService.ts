import { Firestore, FieldValue, DocumentReference } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { PureIntentCheckoutPayload } from '../validation/checkoutSchema';

export interface CheckoutResult {
  success: boolean;
  invoiceId: string;
  invoice?: any;
  finalAmount?: number;
  alreadyProcessed?: boolean;
  idempotencyKey?: string;
}

const ALLOWED_FUND_TYPES_BY_METHOD: Record<string, string[]> = {
  CASH: ['CASH', 'TIỀN MẶT', 'KÉT TIỀN', 'TIEN_MAT'],
  BANK: ['BANK', 'VIETQR', 'NGÂN HÀNG', 'TÀI KHOẢN NGÂN HÀNG', 'NGAN_HANG'],
  CARD: ['CARD', 'POS_CARD', 'QUẸT THẺ POS', 'CÀ THẺ', 'POS_MACHINE', 'QUET_THE'],
  INSTALLMENT: ['CASH', 'BANK', 'VIETQR', 'KÉT TIỀN', 'NGÂN HÀNG', 'TIỀN MẶT', 'TIEN_MAT'] // Cho khoản trả trước (Down payment)
};

export async function executeAtomicCheckout(
  db: Firestore,
  payload: any,
  authenticatedStaff?: { uid: string; role?: string; name?: string; branchId?: string }
): Promise<CheckoutResult> {
  const isPureIntent = Array.isArray(payload.deviceIds);

  // In production, reject legacy checkout format to enforce complete Server Truth
  if (process.env.NODE_ENV === 'production' && !isPureIntent) {
    throw new Error('LEGACY_CHECKOUT_DISABLED: Hệ thống đã chuyển sang chế độ Server Truth bắt buộc.');
  }

  const idempotencyKey = payload.idempotencyKey || payload.invoice?.idempotencyKey || payload.invoice?.id;

  // Canonical Payload Hash Calculation (Protects against same idempotencyKey with altered payload)
  const canonicalPayloadObj = {
    deviceIds: (payload.deviceIds || payload.devicesToSell?.map((d: any) => d.id) || []).sort(),
    accessoryLines: (payload.accessoryLines || payload.accessoriesToSell || []).map((a: any) => ({
      productId: a.productId || a.product?.id,
      quantity: a.quantity
    })).sort((a: any, b: any) => String(a.productId).localeCompare(String(b.productId))),
    payments: payload.payments,
    payment: payload.payment,
    branchId: payload.branchId || payload.invoice?.branchId,
    voucherCode: payload.voucherCode?.trim().toUpperCase(),
    tradeInAppraisalId: payload.tradeInAppraisalId
  };
  const currentPayloadHash = crypto.createHash('sha256').update(JSON.stringify(canonicalPayloadObj)).digest('hex');

  return await db.runTransaction(async (transaction) => {
    // 1. Real Idempotency Check with Payload Hash Verification
    if (idempotencyKey) {
      const idemRef: DocumentReference = db.collection('checkoutRequests').doc(idempotencyKey);
      const idemSnap = await transaction.get(idemRef);
      if (idemSnap.exists) {
        const data = idemSnap.data();
        if (data?.payloadHash && data.payloadHash !== currentPayloadHash) {
          throw new Error('IDEMPOTENCY_PAYLOAD_MISMATCH: Idempotency key này đã được sử dụng trước đó cho một giỏ hàng/thanh toán có nội dung khác.');
        }
        if (data?.status === 'COMPLETED') {
          return {
            success: true,
            invoiceId: data.invoiceId,
            finalAmount: data.finalAmount,
            alreadyProcessed: true,
            idempotencyKey
          };
        }
      }
    }

    const branchId = payload.branchId || payload.invoice?.branchId || authenticatedStaff?.branchId || 'CN01';
    const isMultiPayment = Array.isArray(payload.payments) && payload.payments.length > 0;
    const paymentMethod = isMultiPayment
      ? 'Đa phương thức'
      : isPureIntent
      ? payload.payment?.method || 'CASH'
      : payload.invoice?.paymentMethod || 'Tiền mặt';

    // 2. Fetch & Validate Funds Authoritatively (Including Runtime Method-to-Fund Type Matching)
    const fundMap = new Map<string, { ref: DocumentReference; data: any }>();
    const requiredFundIds = new Set<string>();

    if (isMultiPayment) {
      for (const p of payload.payments) {
        if (p.fundId && p.amount > 0) {
          requiredFundIds.add(p.fundId);
        }
      }
    } else {
      const targetFundId = isPureIntent ? payload.payment?.fundId : (payload.fundToUpdate?.id || payload.invoice?.paymentFundId);
      if (targetFundId) {
        requiredFundIds.add(targetFundId);
      }
    }

    for (const fId of requiredFundIds) {
      const fRef = db.collection('funds').doc(fId);
      const fSnap = await transaction.get(fRef);
      if (!fSnap.exists) {
        throw new Error(`INVALID_FUND: Quỹ tiền ID "${fId}" không tồn tại trên hệ thống.`);
      }
      const fData = fSnap.data()!;
      if (fData.status === 'INACTIVE' || fData.active === false) {
        throw new Error(`INACTIVE_FUND: Quỹ tiền "${fData.name}" đang bị khóa, không thể thực hiện thanh toán.`);
      }
      if (fData.branchId && fData.branchId !== 'ALL' && fData.branchId !== branchId) {
        throw new Error(`FUND_BRANCH_MISMATCH: Quỹ tiền "${fData.name}" thuộc chi nhánh "${fData.branchId}", không khớp chi nhánh bán "${branchId}".`);
      }
      fundMap.set(fId, { ref: fRef, data: fData });
    }

    // P0.2 Fix: Strict Runtime Verification of ALLOWED_FUND_TYPES_BY_METHOD for each payment line
    if (isMultiPayment) {
      for (const p of payload.payments) {
        if (p.fundId && p.amount > 0) {
          const fundInfo = fundMap.get(p.fundId);
          if (fundInfo) {
            const allowedTypes = ALLOWED_FUND_TYPES_BY_METHOD[p.method] || [];
            const fundTypeUpper = (fundInfo.data.type || '').toUpperCase();
            const fundNameUpper = (fundInfo.data.name || '').toUpperCase();
            const isMatch = allowedTypes.some(t => fundTypeUpper.includes(t) || fundNameUpper.includes(t));
            if (!isMatch) {
              throw new Error(`INVALID_FUND_TYPE: Phương thức "${p.method}" không thể nạp vào quỹ "${fundInfo.data.name}" (Loại quỹ: ${fundInfo.data.type || 'Không xác định'}).`);
            }
          }
        }
      }
    } else if (payload.payment?.fundId) {
      const fundInfo = fundMap.get(payload.payment.fundId);
      if (fundInfo) {
        const method = payload.payment.method || 'CASH';
        const allowedTypes = ALLOWED_FUND_TYPES_BY_METHOD[method] || [];
        const fundTypeUpper = (fundInfo.data.type || '').toUpperCase();
        const fundNameUpper = (fundInfo.data.name || '').toUpperCase();
        const isMatch = allowedTypes.some(t => fundTypeUpper.includes(t) || fundNameUpper.includes(t));
        if (!isMatch) {
          throw new Error(`INVALID_FUND_TYPE: Phương thức "${method}" không thể nạp vào quỹ "${fundInfo.data.name}" (Loại quỹ: ${fundInfo.data.type || 'Không xác định'}).`);
        }
      }
    }

    // 3. Fetch & Validate Devices (Authoritative Status & Pricing from DB)
    const deviceIds: string[] = isPureIntent
      ? payload.deviceIds
      : (payload.devicesToSell?.map((d: any) => d.id) || []);

    const loadedDevices: any[] = [];
    let authoritativeDeviceSubtotal = 0;

    for (const devId of deviceIds) {
      if (!devId) continue;
      const devRef: DocumentReference = db.collection('devices').doc(devId);
      const devSnap = await transaction.get(devRef);
      if (!devSnap.exists) {
        throw new Error(`DEVICE_NOT_FOUND: Không tìm thấy thiết bị ID "${devId}" trong cơ sở dữ liệu.`);
      }
      const devData = devSnap.data()!;

      // Concurrency checks
      if (devData.status !== 'in_stock') {
        throw new Error(`DEVICE_ALREADY_SOLD: Thiết bị ${devData.model} (IMEI: ${devData.imei || devId}) đang ở trạng thái "${devData.status}", không thể bán.`);
      }

      if (devData.branchId && devData.branchId !== branchId) {
        throw new Error(`DEVICE_BRANCH_MISMATCH: Thiết bị ${devData.model} thuộc chi nhánh "${devData.branchId}", không thuộc chi nhánh bán "${branchId}".`);
      }

      const price = typeof devData.sellPrice === 'number' ? devData.sellPrice : 0;
      authoritativeDeviceSubtotal += price;
      loadedDevices.push({ id: devId, ref: devRef, data: devData, authoritativePrice: price });
    }

    // 4. Fetch & Validate Accessories (Authoritative Multi-Branch Stock & Pricing from DB)
    const accessoryLines: any[] = isPureIntent
      ? (payload.accessoryLines || [])
      : (payload.accessoriesToSell || []);

    const loadedAccessories: any[] = [];
    let authoritativeAccessorySubtotal = 0;
    const warehouseId = payload.warehouseId || payload.invoice?.warehouseId || 'WH01';

    for (const acc of accessoryLines) {
      const prodId = acc.productId || acc.product?.id;
      const quantity = typeof acc.quantity === 'number' && Number.isInteger(acc.quantity) && acc.quantity > 0 ? acc.quantity : 1;
      if (!prodId) continue;

      const prodRef: DocumentReference = db.collection('products').doc(prodId);
      const prodSnap = await transaction.get(prodRef);
      if (!prodSnap.exists) {
        throw new Error(`PRODUCT_NOT_FOUND: Không tìm thấy phụ kiện ID "${prodId}".`);
      }
      const prodData = prodSnap.data()!;

      // Check Branch/Warehouse Specific Balance
      const balanceId = `${branchId}_${warehouseId}_${prodId}`;
      const balanceRef: DocumentReference = db.collection('inventoryBalances').doc(balanceId);
      const balanceSnap = await transaction.get(balanceRef);

      let availableStock = typeof prodData.stockQuantity === 'number' ? prodData.stockQuantity : 0;
      let hasSpecificBalance = false;

      if (balanceSnap.exists) {
        const balData = balanceSnap.data()!;
        availableStock = typeof balData.available === 'number' ? balData.available : balData.onHand || 0;
        hasSpecificBalance = true;
      }

      if (availableStock < quantity) {
        throw new Error(`INSUFFICIENT_STOCK: Phụ kiện "${prodData.name}" tại chi nhánh ${branchId} chỉ còn ${availableStock} cái (yêu cầu ${quantity}).`);
      }

      const price = typeof prodData.retailPrice === 'number' ? prodData.retailPrice : (prodData.sellPrice || 0);
      authoritativeAccessorySubtotal += price * quantity;
      loadedAccessories.push({
        id: prodId,
        ref: prodRef,
        balanceRef,
        hasSpecificBalance,
        data: prodData,
        quantity,
        authoritativePrice: price
      });
    }

    const subTotal = authoritativeDeviceSubtotal + authoritativeAccessorySubtotal;

    // 5. Server Truth: Resolve Discount via DB Voucher with Quota & Eligibility Guard
    let authoritativeDiscount = 0;
    let voucherRef: DocumentReference | null = null;
    let voucherApplied = false;

    if (payload.voucherCode) {
      const codeUpper = payload.voucherCode.trim().toUpperCase();
      voucherRef = db.collection('vouchers').doc(codeUpper);
      const voucherSnap = await transaction.get(voucherRef);
      if (!voucherSnap.exists) {
        throw new Error(`VOUCHER_NOT_FOUND: Mã giảm giá "${codeUpper}" không tồn tại trên hệ thống.`);
      }

      const vData = voucherSnap.data()!;
      const now = new Date();
      const isValidDate = (!vData.expiryDate || new Date(vData.expiryDate) >= now) &&
                          (!vData.startDate || new Date(vData.startDate) <= now);
      const meetsMinOrder = !vData.minOrderAmount || subTotal >= vData.minOrderAmount;

      if (vData.active === false) {
        throw new Error(`VOUCHER_INACTIVE: Mã giảm giá "${codeUpper}" hiện đang tạm khóa.`);
      }

      if (!isValidDate) {
        throw new Error(`VOUCHER_EXPIRED: Mã giảm giá "${codeUpper}" đã hết hạn sử dụng.`);
      }

      if (!meetsMinOrder) {
        throw new Error(`VOUCHER_MIN_ORDER_NOT_MET: Đơn hàng cần đạt tối thiểu ${vData.minOrderAmount?.toLocaleString('vi-VN')} đ để sử dụng voucher này.`);
      }

      // Check Voucher Quota
      if (typeof vData.usageLimit === 'number' && (vData.usedCount || 0) >= vData.usageLimit) {
        throw new Error(`VOUCHER_EXHAUSTED: Mã giảm giá "${codeUpper}" đã hết lượt sử dụng.`);
      }

      // Check Branch Eligibility
      if (Array.isArray(vData.applicableBranchIds) && vData.applicableBranchIds.length > 0 && !vData.applicableBranchIds.includes(branchId)) {
        throw new Error(`VOUCHER_BRANCH_INELIGIBLE: Mã giảm giá "${codeUpper}" không áp dụng cho chi nhánh "${branchId}".`);
      }

      if (vData.discountType === 'PERCENT') {
        authoritativeDiscount = Math.round((subTotal * (vData.discountValue || 0)) / 100);
        if (vData.maxDiscountAmount && authoritativeDiscount > vData.maxDiscountAmount) {
          authoritativeDiscount = vData.maxDiscountAmount;
        }
      } else {
        authoritativeDiscount = vData.discountValue || 0;
      }

      voucherApplied = true;
    }

    // 6. Server Truth: Resolve Trade-in Valuation from DB with Consumption Lock & Final Approved Price
    let authoritativeTradeInDeduction = 0;
    let appraisalRef: DocumentReference | null = null;

    if (payload.tradeInAppraisalId) {
      appraisalRef = db.collection('tradeInAppraisals').doc(payload.tradeInAppraisalId);
      const appraisalSnap = await transaction.get(appraisalRef);
      if (!appraisalSnap.exists) {
        throw new Error(`TRADE_IN_NOT_FOUND: Phiếu thẩm định thu cũ "${payload.tradeInAppraisalId}" không tồn tại.`);
      }
      const appData = appraisalSnap.data()!;

      // Anti-Reuse Lock: Verify appraisal has not been consumed by another invoice
      if (appData.status === 'CONSUMED' || appData.usedByInvoiceId) {
        throw new Error(`TRADE_IN_ALREADY_USED: Phiếu thu cũ "${payload.tradeInAppraisalId}" đã được sử dụng cho hóa đơn ${appData.usedByInvoiceId}.`);
      }

      if (appData.status !== 'accepted' && appData.status !== 'approved' && appData.status !== 'completed') {
        throw new Error(`TRADE_IN_NOT_APPROVED: Phiếu thẩm định thu cũ "${payload.tradeInAppraisalId}" chưa được phê duyệt.`);
      }

      // Mandatory Final Approved Price Check (Strict Production Invariant)
      const approvedPrice = appData.approvedPrice ?? appData.finalApprovedPrice;
      if (typeof approvedPrice !== 'number') {
        throw new Error(`TRADE_IN_FINAL_PRICE_REQUIRED: Phiếu thu cũ "${payload.tradeInAppraisalId}" chưa có giá thu mua được quản lý phê duyệt.`);
      }

      authoritativeTradeInDeduction = approvedPrice;
    }

    const finalAmount = Math.max(0, subTotal - authoritativeDiscount - authoritativeTradeInDeduction);

    // 7. Validate Payment Sum, Installment Partner & Multi-Debt Invariants
    let downPayment = 0;
    let financeAmount = 0;
    let financePartnerRef: DocumentReference | null = null;
    let debtAmount = 0;

    if (isMultiPayment) {
      const totalPaymentsSum = payload.payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
      if (totalPaymentsSum !== finalAmount) {
        throw new Error(`PAYMENT_AMOUNT_MISMATCH: Tổng các khoản thanh toán (${totalPaymentsSum.toLocaleString('vi-VN')} đ) không khớp với giá trị đơn hàng (${finalAmount.toLocaleString('vi-VN')} đ).`);
      }

      // P1.1 Fix: Calculate debtAmount via filter().reduce() over all DEBT & INSTALLMENT lines
      const debtLines = payload.payments.filter((p: any) => p.method === 'DEBT' || p.method === 'INSTALLMENT');
      debtAmount = debtLines.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

      // P1.1 Fix: Strict Verification for Multi-Payment Installment Line
      const installmentLine = payload.payments.find((p: any) => p.method === 'INSTALLMENT');
      if (installmentLine && installmentLine.amount > 0) {
        financeAmount = installmentLine.amount;
        const financePartnerId = payload.installmentFinancePartnerId || payload.payment?.installmentFinancePartnerId || payload.financeCompanyPartner?.id;
        if (!financePartnerId) {
          throw new Error('FINANCE_PARTNER_REQUIRED: Bắt buộc chọn Đối tác tài chính giải ngân cho khoản vay trả góp.');
        }
        financePartnerRef = db.collection('partners').doc(financePartnerId);
        const partnerSnap = await transaction.get(financePartnerRef);
        if (!partnerSnap.exists) {
          throw new Error(`FINANCE_PARTNER_NOT_FOUND: Công ty tài chính ID "${financePartnerId}" không tồn tại.`);
        }
        const partnerData = partnerSnap.data()!;
        if (partnerData.status === 'INACTIVE') {
          throw new Error(`FINANCE_PARTNER_INACTIVE: Đối tác tài chính "${partnerData.name}" đang tạm ngưng hợp tác.`);
        }

        const partnerType = (partnerData.type || partnerData.category || '').toUpperCase();
        if (partnerType && !partnerType.includes('FINANCE') && !partnerType.includes('TRẢ GÓP') && !partnerType.includes('TRA_GOP')) {
          throw new Error(`INVALID_FINANCE_PARTNER_TYPE: Đối tác "${partnerData.name}" không phải là công ty tài chính trả góp.`);
        }
      }
    } else if (paymentMethod === 'INSTALLMENT') {
      downPayment = typeof payload.payment?.downPayment === 'number' ? payload.payment.downPayment : 0;

      if (!Number.isFinite(downPayment) || downPayment < 0) {
        throw new Error('INVALID_DOWN_PAYMENT: Số tiền trả trước không hợp lệ (không được là số âm).');
      }

      if (downPayment > finalAmount) {
        throw new Error(`DOWN_PAYMENT_EXCEEDS_TOTAL: Số tiền trả trước (${downPayment.toLocaleString('vi-VN')} đ) không được lớn hơn tổng giá trị đơn hàng (${finalAmount.toLocaleString('vi-VN')} đ).`);
      }

      financeAmount = Math.max(0, finalAmount - downPayment);
      debtAmount = financeAmount;
      const financePartnerId = payload.installmentFinancePartnerId || payload.payment?.installmentFinancePartnerId || payload.financeCompanyPartner?.id;

      if (financeAmount > 0) {
        if (!financePartnerId) {
          throw new Error('FINANCE_PARTNER_REQUIRED: Bắt buộc chọn Đối tác tài chính giải ngân cho khoản vay trả góp.');
        }
        financePartnerRef = db.collection('partners').doc(financePartnerId);
        const partnerSnap = await transaction.get(financePartnerRef);
        if (!partnerSnap.exists) {
          throw new Error(`FINANCE_PARTNER_NOT_FOUND: Công ty tài chính ID "${financePartnerId}" không tồn tại.`);
        }
        const partnerData = partnerSnap.data()!;
        if (partnerData.status === 'INACTIVE') {
          throw new Error(`FINANCE_PARTNER_INACTIVE: Đối tác tài chính "${partnerData.name}" đang tạm ngưng hợp tác.`);
        }

        const partnerType = (partnerData.type || partnerData.category || '').toUpperCase();
        if (partnerType && !partnerType.includes('FINANCE') && !partnerType.includes('TRẢ GÓP') && !partnerType.includes('TRA_GOP')) {
          throw new Error(`INVALID_FINANCE_PARTNER_TYPE: Đối tác "${partnerData.name}" không phải là công ty tài chính trả góp.`);
        }
      }
    }

    // Secure Non-Colliding ID Generation
    const newInvRef = db.collection('invoices').doc();
    const invoiceId = payload.invoice?.id || newInvRef.id;
    const invoiceCode = payload.invoice?.invoiceCode || `HD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // 8. Mark Devices as Sold
    for (const dev of loadedDevices) {
      transaction.update(dev.ref, {
        status: 'sold',
        soldDate: FieldValue.serverTimestamp(),
        soldInvoiceId: invoiceId,
        customerName: payload.customerName || payload.invoice?.customerName || null,
        customerPhone: payload.customerPhone || payload.invoice?.customerPhone || null
      });
    }

    // 9. Deduct Accessory Stock (Global & Branch specific)
    for (const acc of loadedAccessories) {
      transaction.update(acc.ref, {
        stockQuantity: FieldValue.increment(-acc.quantity)
      });

      if (acc.hasSpecificBalance) {
        transaction.update(acc.balanceRef, {
          onHand: FieldValue.increment(-acc.quantity),
          available: FieldValue.increment(-acc.quantity),
          updatedAt: FieldValue.serverTimestamp()
        });
      } else {
        transaction.set(acc.balanceRef, {
          id: acc.balanceRef.id,
          branchId,
          warehouseId,
          productId: acc.id,
          productName: acc.data.name,
          onHand: Math.max(0, (acc.data.stockQuantity || 0) - acc.quantity),
          available: Math.max(0, (acc.data.stockQuantity || 0) - acc.quantity),
          reserved: 0,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    // 10. Lock Trade-in Appraisal as CONSUMED
    if (appraisalRef) {
      transaction.update(appraisalRef, {
        status: 'CONSUMED',
        usedByInvoiceId: invoiceId,
        consumedAt: FieldValue.serverTimestamp()
      });
    }

    // 11. Lock Voucher Quota Increment ONLY when voucher was genuinely applied
    if (voucherRef && voucherApplied) {
      transaction.update(voucherRef, {
        usedCount: FieldValue.increment(1)
      });
    }

    // 12. Save Authoritative Invoice Record
    const invRef = db.collection('invoices').doc(invoiceId);
    const invoiceRecord: any = {
      id: invoiceId,
      invoiceCode,
      branchId,
      customerName: payload.customerName || payload.invoice?.customerName || 'Khách vãng lai',
      customerPhone: payload.customerPhone || payload.invoice?.customerPhone || '',
      devices: loadedDevices.map(d => ({
        id: d.id,
        imei: d.data.imei,
        model: d.data.model,
        sellPrice: d.authoritativePrice,
        color: d.data.color,
        storage: d.data.storage
      })),
      items: [
        ...loadedDevices.map(d => ({
          model: d.data.model,
          imei: d.data.imei,
          price: d.authoritativePrice,
          color: d.data.color,
          storage: d.data.storage
        })),
        ...loadedAccessories.map(a => ({
          model: a.data.name,
          imei: '',
          price: a.authoritativePrice,
          color: '',
          storage: ''
        }))
      ],
      accessories: loadedAccessories.map(a => ({
        productId: a.id,
        name: a.data.name,
        quantity: a.quantity,
        price: a.authoritativePrice
      })),
      totalAmount: subTotal,
      discountAmount: authoritativeDiscount,
      tradeInDeduction: authoritativeTradeInDeduction,
      finalAmount,
      paidAmount: finalAmount - debtAmount,
      debtAmount,
      paymentMethod,
      splitPayments: isMultiPayment ? payload.payments : undefined,
      installmentDownPayment: downPayment,
      installmentFinanceAmount: financeAmount,
      installmentFinancePartnerId: payload.installmentFinancePartnerId || payload.payment?.installmentFinancePartnerId || null,
      idempotencyKey,
      creatorUid: authenticatedStaff?.uid || 'SYSTEM',
      creatorName: authenticatedStaff?.name || 'Thu Ngân',
      createdAt: FieldValue.serverTimestamp(),
      status: 'completed'
    };

    transaction.set(invRef, invoiceRecord);

    // 13. Atomic Ledger & Fund Allocations (Supports Multiple Funds Simultaneously)
    if (isMultiPayment) {
      for (const p of payload.payments) {
        if (p.amount > 0 && p.fundId) {
          const fundInfo = fundMap.get(p.fundId);
          if (fundInfo) {
            const txId = `TX-${crypto.randomUUID().slice(0, 8)}`;
            const txRef = db.collection('cashTransactions').doc(txId);
            transaction.set(txRef, {
              id: txId,
              code: `PT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
              type: 'RECEIPT',
              category: 'SALES_REVENUE',
              categoryName: `Thu bán hàng POS (${p.method || 'Đa kênh'})`,
              amount: p.amount,
              fundId: p.fundId,
              fundName: fundInfo.data.name || 'Quỹ tiền',
              fundType: fundInfo.data.type || 'CASH',
              date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
              partnerName: invoiceRecord.customerName,
              partnerPhone: invoiceRecord.customerPhone,
              referenceCode: invoiceCode,
              status: 'COMPLETED',
              creator: authenticatedStaff?.name || 'Thu Ngân'
            });

            transaction.update(fundInfo.ref, {
              currentBalance: FieldValue.increment(p.amount),
              totalIncome: FieldValue.increment(p.amount)
            });
          }
        }
      }

      if (financePartnerRef && financeAmount > 0) {
        transaction.update(financePartnerRef, {
          outstandingDebt: FieldValue.increment(financeAmount)
        });
      }
    } else if (paymentMethod === 'INSTALLMENT') {
      const targetFundId = isPureIntent ? payload.payment?.fundId : (payload.fundToUpdate?.id || payload.invoice?.paymentFundId);
      const fundInfo = targetFundId ? fundMap.get(targetFundId) : null;

      if (fundInfo && downPayment > 0) {
        const txId = `TX-${crypto.randomUUID().slice(0, 8)}`;
        const txRef = db.collection('cashTransactions').doc(txId);
        transaction.set(txRef, {
          id: txId,
          code: `PT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          type: 'RECEIPT',
          category: 'SALES_REVENUE',
          categoryName: 'Thu tiền trả trước đơn trả góp POS',
          amount: downPayment,
          fundId: targetFundId,
          fundName: fundInfo.data.name || 'Quỹ tiền',
          fundType: fundInfo.data.type || 'CASH',
          date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
          partnerName: invoiceRecord.customerName,
          partnerPhone: invoiceRecord.customerPhone,
          referenceCode: invoiceCode,
          status: 'COMPLETED',
          creator: authenticatedStaff?.name || 'Thu Ngân'
        });

        transaction.update(fundInfo.ref, {
          currentBalance: FieldValue.increment(downPayment),
          totalIncome: FieldValue.increment(downPayment)
        });
      }

      if (financePartnerRef && financeAmount > 0) {
        transaction.update(financePartnerRef, {
          outstandingDebt: FieldValue.increment(financeAmount)
        });
      }
    } else {
      const targetFundId = isPureIntent ? payload.payment?.fundId : (payload.fundToUpdate?.id || payload.invoice?.paymentFundId);
      const fundInfo = targetFundId ? fundMap.get(targetFundId) : null;

      if (fundInfo && finalAmount > 0) {
        const txId = `TX-${crypto.randomUUID().slice(0, 8)}`;
        const txRef = db.collection('cashTransactions').doc(txId);
        transaction.set(txRef, {
          id: txId,
          code: `PT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          type: 'RECEIPT',
          category: 'SALES_REVENUE',
          categoryName: 'Thu tiền bán hàng POS',
          amount: finalAmount,
          fundId: targetFundId,
          fundName: fundInfo.data.name || 'Quỹ tiền',
          fundType: fundInfo.data.type || 'CASH',
          date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
          partnerName: invoiceRecord.customerName,
          partnerPhone: invoiceRecord.customerPhone,
          referenceCode: invoiceCode,
          status: 'COMPLETED',
          creator: authenticatedStaff?.name || 'Thu Ngân'
        });

        transaction.update(fundInfo.ref, {
          currentBalance: FieldValue.increment(finalAmount),
          totalIncome: FieldValue.increment(finalAmount)
        });
      }
    }

    // 14. Customer CRM Lifetime Value (LTV) Update
    const customerId = payload.customerId || payload.customerPartner?.id;
    if (customerId) {
      const custRef = db.collection('partners').doc(customerId);
      const custSnap = await transaction.get(custRef);
      if (custSnap.exists) {
        transaction.update(custRef, {
          totalSpent: FieldValue.increment(finalAmount),
          outstandingDebt: FieldValue.increment(debtAmount),
          lastInvoiceId: invoiceId,
          lastPurchaseDate: FieldValue.serverTimestamp()
        });
      }
    }

    // 15. Commit Idempotency Record (Includes Canonical Payload Hash)
    if (idempotencyKey) {
      const idemRef = db.collection('checkoutRequests').doc(idempotencyKey);
      transaction.set(idemRef, {
        id: idempotencyKey,
        status: 'COMPLETED',
        invoiceId,
        payloadHash: currentPayloadHash,
        finalAmount,
        staffUid: authenticatedStaff?.uid || 'SYSTEM',
        createdAt: FieldValue.serverTimestamp()
      });
    }

    // 16. Write Audit Trail Event
    const auditId = `AUDIT-${crypto.randomUUID().slice(0, 8)}`;
    const auditRef = db.collection('auditEvents').doc(auditId);
    transaction.set(auditRef, {
      id: auditId,
      action: 'POS_CHECKOUT',
      staffUid: authenticatedStaff?.uid || 'SYSTEM',
      staffName: authenticatedStaff?.name || 'Thu Ngân',
      targetResource: `invoices/${invoiceId}`,
      details: {
        invoiceCode,
        subTotal,
        discount: authoritativeDiscount,
        tradeIn: authoritativeTradeInDeduction,
        finalAmount,
        paymentMethod
      },
      timestamp: FieldValue.serverTimestamp()
    });

    return {
      success: true,
      invoiceId,
      invoice: {
        ...invoiceRecord,
        createdAt: new Date().toISOString()
      },
      finalAmount,
      idempotencyKey
    };
  });
}

