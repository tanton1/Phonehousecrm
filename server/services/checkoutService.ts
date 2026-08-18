import { Firestore, FieldValue, DocumentReference } from 'firebase-admin/firestore';
import { PureIntentCheckoutPayload } from '../validation/checkoutSchema';

export interface CheckoutResult {
  success: boolean;
  invoiceId: string;
  finalAmount?: number;
  alreadyProcessed?: boolean;
  idempotencyKey?: string;
}

const ALLOWED_FUND_TYPES_BY_METHOD: Record<string, string[]> = {
  CASH: ['CASH', 'TIỀN MẶT', 'KÉT TIỀN'],
  BANK: ['BANK', 'VIETQR', 'NGÂN HÀNG', 'TÀI KHOẢN NGÂN HÀNG'],
  CARD: ['CARD', 'POS_CARD', 'QUẸT THẺ POS', 'CÀ THẺ'],
  INSTALLMENT: ['CASH', 'BANK', 'VIETQR', 'KÉT TIỀN', 'NGÂN HÀNG'] // Cho khoản trả trước (Down payment)
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

  return await db.runTransaction(async (transaction) => {
    // 1. Real Idempotency Check via checkoutRequests/{idempotencyKey}
    if (idempotencyKey) {
      const idemRef: DocumentReference = db.collection('checkoutRequests').doc(idempotencyKey);
      const idemSnap = await transaction.get(idemRef);
      if (idemSnap.exists) {
        const data = idemSnap.data();
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
    const paymentMethod = isPureIntent ? payload.payment.method : payload.invoice?.paymentMethod;
    const targetFundId = isPureIntent ? payload.payment.fundId : (payload.fundToUpdate?.id || payload.invoice?.paymentFundId);

    // 2. Fetch & Validate Fund Authoritatively (Branch match & Type compatibility)
    let fundData: any = null;
    let fundRef: DocumentReference | null = null;

    if (targetFundId) {
      fundRef = db.collection('funds').doc(targetFundId);
      const fundSnap = await transaction.get(fundRef);
      if (!fundSnap.exists) {
        throw new Error(`INVALID_FUND: Quỹ tiền ID "${targetFundId}" không tồn tại trên hệ thống.`);
      }
      fundData = fundSnap.data();
      if (fundData.status === 'INACTIVE' || fundData.active === false) {
        throw new Error(`INACTIVE_FUND: Quỹ tiền "${fundData.name}" đang bị khóa, không thể thực hiện thanh toán.`);
      }

      // Validate branch match
      if (fundData.branchId && fundData.branchId !== 'ALL' && fundData.branchId !== branchId) {
        throw new Error(`FUND_BRANCH_MISMATCH: Quỹ tiền "${fundData.name}" thuộc chi nhánh "${fundData.branchId}", không khớp chi nhánh bán "${branchId}".`);
      }

      // Validate payment method compatibility
      const allowedTypes = ALLOWED_FUND_TYPES_BY_METHOD[paymentMethod] || [];
      const fundTypeUpper = (fundData.type || '').toUpperCase();
      const isTypeCompatible = allowedTypes.length === 0 || allowedTypes.some(t => fundTypeUpper.includes(t));
      if (!isTypeCompatible) {
        throw new Error(`INVALID_FUND_TYPE: Phương thức "${paymentMethod}" không tương thích với loại quỹ "${fundData.type}".`);
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
      const devRef = db.collection('devices').doc(devId);
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

    // 4. Fetch & Validate Accessories (Authoritative Stock & Pricing from DB)
    const accessoryLines: any[] = isPureIntent
      ? (payload.accessoryLines || [])
      : (payload.accessoriesToSell || []);

    const loadedAccessories: any[] = [];
    let authoritativeAccessorySubtotal = 0;

    for (const acc of accessoryLines) {
      const prodId = acc.productId || acc.product?.id;
      const quantity = acc.quantity || 1;
      if (!prodId) continue;

      const prodRef = db.collection('products').doc(prodId);
      const prodSnap = await transaction.get(prodRef);
      if (!prodSnap.exists) {
        throw new Error(`PRODUCT_NOT_FOUND: Không tìm thấy phụ kiện ID "${prodId}".`);
      }
      const prodData = prodSnap.data()!;
      const currentStock = typeof prodData.stockQuantity === 'number' ? prodData.stockQuantity : 0;

      if (currentStock < quantity) {
        throw new Error(`INSUFFICIENT_STOCK: Phụ kiện "${prodData.name}" chỉ còn ${currentStock} cái (yêu cầu ${quantity}).`);
      }

      const price = typeof prodData.retailPrice === 'number' ? prodData.retailPrice : (prodData.sellPrice || 0);
      authoritativeAccessorySubtotal += price * quantity;
      loadedAccessories.push({ id: prodId, ref: prodRef, data: prodData, quantity, authoritativePrice: price });
    }

    const subTotal = authoritativeDeviceSubtotal + authoritativeAccessorySubtotal;

    // 5. Server Truth: Resolve Discount via DB Voucher
    let authoritativeDiscount = 0;
    if (payload.voucherCode) {
      const voucherRef = db.collection('vouchers').doc(payload.voucherCode.trim().toUpperCase());
      const voucherSnap = await transaction.get(voucherRef);
      if (voucherSnap.exists) {
        const vData = voucherSnap.data()!;
        const now = new Date();
        const isValidDate = (!vData.expiryDate || new Date(vData.expiryDate) >= now) &&
                            (!vData.startDate || new Date(vData.startDate) <= now);
        const meetsMinOrder = !vData.minOrderAmount || subTotal >= vData.minOrderAmount;

        if (isValidDate && meetsMinOrder && vData.active !== false) {
          if (vData.discountType === 'PERCENT') {
            authoritativeDiscount = Math.round((subTotal * (vData.discountValue || 0)) / 100);
            if (vData.maxDiscountAmount && authoritativeDiscount > vData.maxDiscountAmount) {
              authoritativeDiscount = vData.maxDiscountAmount;
            }
          } else {
            authoritativeDiscount = vData.discountValue || 0;
          }
        }
      }
    }

    // 6. Server Truth: Resolve Trade-in Valuation from DB
    let authoritativeTradeInDeduction = 0;
    if (payload.tradeInAppraisalId) {
      const appraisalRef = db.collection('tradeInAppraisals').doc(payload.tradeInAppraisalId);
      const appraisalSnap = await transaction.get(appraisalRef);
      if (!appraisalSnap.exists) {
        throw new Error(`TRADE_IN_NOT_FOUND: Phiếu thẩm định thu cũ "${payload.tradeInAppraisalId}" không tồn tại.`);
      }
      const appData = appraisalSnap.data()!;
      if (appData.status !== 'accepted' && appData.status !== 'approved' && appData.status !== 'completed') {
        throw new Error(`TRADE_IN_NOT_APPROVED: Phiếu thẩm định thu cũ "${payload.tradeInAppraisalId}" chưa được phê duyệt.`);
      }
      authoritativeTradeInDeduction = typeof appData.estimatedValue === 'number' ? appData.estimatedValue : 0;
    }

    const finalAmount = Math.max(0, subTotal - authoritativeDiscount - authoritativeTradeInDeduction);
    const invoiceId = payload.invoice?.id || `INV-${Date.now()}`;
    const invoiceCode = payload.invoice?.invoiceCode || `HD-${Date.now().toString().slice(-6)}`;

    // 7. Mark Devices as Sold
    for (const dev of loadedDevices) {
      transaction.update(dev.ref, {
        status: 'sold',
        soldDate: FieldValue.serverTimestamp(),
        soldInvoiceId: invoiceId,
        customerName: payload.customerName || payload.invoice?.customerName || null,
        customerPhone: payload.customerPhone || payload.invoice?.customerPhone || null
      });
    }

    // 8. Deduct Accessory Stock
    for (const acc of loadedAccessories) {
      transaction.update(acc.ref, {
        stockQuantity: FieldValue.increment(-acc.quantity)
      });
    }

    // 9. Save Authoritative Invoice Record
    const invRef = db.collection('invoices').doc(invoiceId);
    const invoiceRecord = {
      id: invoiceId,
      invoiceCode,
      branchId,
      customerName: payload.customerName || payload.invoice?.customerName || 'Khách vãng lai',
      customerPhone: payload.customerPhone || payload.invoice?.customerPhone || '',
      devices: loadedDevices.map(d => ({
        id: d.id,
        imei: d.data.imei,
        model: d.data.model,
        sellPrice: d.authoritativePrice
      })),
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
      paymentMethod,
      paymentFundId: targetFundId,
      idempotencyKey,
      creatorUid: authenticatedStaff?.uid || 'SYSTEM',
      creatorName: authenticatedStaff?.name || 'Thu Ngân',
      createdAt: FieldValue.serverTimestamp(),
      status: 'completed'
    };

    transaction.set(invRef, invoiceRecord);

    // 10. Installment Accounting & Fund Reconciliation
    if (paymentMethod === 'INSTALLMENT') {
      const downPayment = payload.payment?.downPayment || 0;
      const financeAmount = Math.max(0, finalAmount - downPayment);

      // Down payment into Fund
      if (fundRef && downPayment > 0) {
        const txId = `TX-${Date.now()}`;
        const txRef = db.collection('cashTransactions').doc(txId);
        transaction.set(txRef, {
          id: txId,
          code: `PT-${Date.now().toString().slice(-6)}`,
          type: 'RECEIPT',
          category: 'SALES_REVENUE',
          categoryName: 'Thu tiền trả trước đơn trả góp POS',
          amount: downPayment,
          fundId: targetFundId,
          fundName: fundData.name,
          fundType: fundData.type,
          date: new Date().toISOString().split('T')[0],
          partnerName: invoiceRecord.customerName,
          partnerPhone: invoiceRecord.customerPhone,
          referenceCode: invoiceCode,
          status: 'COMPLETED',
          creator: authenticatedStaff?.name || 'Thu Ngân'
        });

        transaction.update(fundRef, {
          currentBalance: FieldValue.increment(downPayment),
          totalIncome: FieldValue.increment(downPayment)
        });
      }

      // Finance Company Receivable
      const financePartnerId = payload.payment?.installmentFinancePartnerId || payload.financeCompanyPartner?.id;
      if (financeAmount > 0 && financePartnerId) {
        const partnerRef = db.collection('partners').doc(financePartnerId);
        const partnerSnap = await transaction.get(partnerRef);
        if (partnerSnap.exists) {
          transaction.update(partnerRef, {
            outstandingDebt: FieldValue.increment(financeAmount)
          });
        }
      }
    } else {
      // Standard Payment: Full finalAmount into Fund
      if (fundRef && finalAmount > 0) {
        const txId = `TX-${Date.now()}`;
        const txRef = db.collection('cashTransactions').doc(txId);
        transaction.set(txRef, {
          id: txId,
          code: `PT-${Date.now().toString().slice(-6)}`,
          type: 'RECEIPT',
          category: 'SALES_REVENUE',
          categoryName: 'Thu tiền bán hàng POS',
          amount: finalAmount,
          fundId: targetFundId,
          fundName: fundData.name,
          fundType: fundData.type,
          date: new Date().toISOString().split('T')[0],
          partnerName: invoiceRecord.customerName,
          partnerPhone: invoiceRecord.customerPhone,
          referenceCode: invoiceCode,
          status: 'COMPLETED',
          creator: authenticatedStaff?.name || 'Thu Ngân'
        });

        transaction.update(fundRef, {
          currentBalance: FieldValue.increment(finalAmount),
          totalIncome: FieldValue.increment(finalAmount)
        });
      }
    }

    // 11. Customer CRM Lifetime Value (LTV) Update
    const customerId = payload.customerId || payload.customerPartner?.id;
    if (customerId) {
      const custRef = db.collection('partners').doc(customerId);
      const custSnap = await transaction.get(custRef);
      if (custSnap.exists) {
        transaction.update(custRef, {
          totalSpent: FieldValue.increment(finalAmount),
          lastInvoiceId: invoiceId,
          lastPurchaseDate: FieldValue.serverTimestamp()
        });
      }
    }

    // 12. Commit Idempotency Record
    if (idempotencyKey) {
      const idemRef = db.collection('checkoutRequests').doc(idempotencyKey);
      transaction.set(idemRef, {
        id: idempotencyKey,
        status: 'COMPLETED',
        invoiceId,
        finalAmount,
        staffUid: authenticatedStaff?.uid || 'SYSTEM',
        createdAt: FieldValue.serverTimestamp()
      });
    }

    // 13. Write Audit Trail Event
    const auditId = `AUDIT-${Date.now()}`;
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
      finalAmount,
      idempotencyKey
    };
  });
}
