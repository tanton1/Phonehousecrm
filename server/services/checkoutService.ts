import { Firestore, doc, runTransaction, increment } from 'firebase/firestore';
import { PureIntentCheckoutPayload, LegacyCheckoutPayload } from '../validation/checkoutSchema';

export interface CheckoutResult {
  success: boolean;
  invoiceId: string;
  finalAmount?: number;
  alreadyProcessed?: boolean;
  idempotencyKey?: string;
}

export async function executeAtomicCheckout(
  db: Firestore,
  payload: any,
  authenticatedStaff?: { uid: string; role?: string; name?: string }
): Promise<CheckoutResult> {
  const isPureIntent = Array.isArray(payload.deviceIds);
  const idempotencyKey = payload.idempotencyKey || payload.invoice?.idempotencyKey || payload.invoice?.id;

  return await runTransaction(db, async (transaction) => {
    // 1. Real Idempotency Check via checkoutRequests/{idempotencyKey}
    if (idempotencyKey) {
      const idemRef = doc(db, 'checkoutRequests', idempotencyKey);
      const idemSnap = await transaction.get(idemRef);
      if (idemSnap.exists()) {
        const data = idemSnap.data();
        if (data.status === 'COMPLETED') {
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

    // 2. Fetch & Validate Fund Authoritatively
    const targetFundId = isPureIntent ? payload.payment.fundId : (payload.fundToUpdate?.id || payload.invoice?.paymentFundId);
    let fundData: any = null;
    let fundRef: any = null;

    if (targetFundId) {
      fundRef = doc(db, 'funds', targetFundId);
      const fundSnap = await transaction.get(fundRef);
      if (!fundSnap.exists()) {
        throw new Error(`INVALID_FUND: Quỹ tiền ID "${targetFundId}" không tồn tại trên hệ thống.`);
      }
      fundData = fundSnap.data();
      if (fundData.status === 'INACTIVE' || fundData.active === false) {
        throw new Error(`INACTIVE_FUND: Quỹ tiền "${fundData.name}" đang bị khóa, không thể giao dịch.`);
      }
    }

    // 3. Fetch & Validate Devices (Authoritative Status & Pricing)
    const deviceIds: string[] = isPureIntent
      ? payload.deviceIds
      : (payload.devicesToSell?.map((d: any) => d.id) || []);

    const loadedDevices: any[] = [];
    let authoritativeDeviceSubtotal = 0;

    for (const devId of deviceIds) {
      if (!devId) continue;
      const devRef = doc(db, 'devices', devId);
      const devSnap = await transaction.get(devRef);
      if (!devSnap.exists()) {
        throw new Error(`DEVICE_NOT_FOUND: Không tìm thấy thiết bị ID "${devId}" trong cơ sở dữ liệu.`);
      }
      const devData = devSnap.data();

      // Ensure device is in stock and matches branch
      if (devData.status !== 'in_stock') {
        throw new Error(`DEVICE_ALREADY_SOLD: Thiết bị ${devData.model} (IMEI: ${devData.imei || devId}) đang ở trạng thái "${devData.status}", không thể bán.`);
      }

      if (payload.branchId && devData.branchId && devData.branchId !== payload.branchId) {
        throw new Error(`DEVICE_BRANCH_MISMATCH: Thiết bị ${devData.model} thuộc chi nhánh "${devData.branchId}", không thuộc chi nhánh bán "${payload.branchId}".`);
      }

      const price = typeof devData.sellPrice === 'number' ? devData.sellPrice : 0;
      authoritativeDeviceSubtotal += price;
      loadedDevices.push({ id: devId, ref: devRef, data: devData, authoritativePrice: price });
    }

    // 4. Fetch & Validate Accessories
    const accessoryLines: any[] = isPureIntent
      ? (payload.accessoryLines || [])
      : (payload.accessoriesToSell || []);

    const loadedAccessories: any[] = [];
    let authoritativeAccessorySubtotal = 0;

    for (const acc of accessoryLines) {
      const prodId = acc.productId || acc.product?.id;
      const quantity = acc.quantity || 1;
      if (!prodId) continue;

      const prodRef = doc(db, 'products', prodId);
      const prodSnap = await transaction.get(prodRef);
      if (!prodSnap.exists()) {
        throw new Error(`PRODUCT_NOT_FOUND: Không tìm thấy phụ kiện ID "${prodId}".`);
      }
      const prodData = prodSnap.data();
      const currentStock = typeof prodData.stockQuantity === 'number' ? prodData.stockQuantity : 0;

      if (currentStock < quantity) {
        throw new Error(`INSUFFICIENT_STOCK: Phụ kiện "${prodData.name}" chỉ còn ${currentStock} cái (yêu cầu ${quantity}).`);
      }

      const price = typeof prodData.retailPrice === 'number' ? prodData.retailPrice : (prodData.sellPrice || 0);
      authoritativeAccessorySubtotal += price * quantity;
      loadedAccessories.push({ id: prodId, ref: prodRef, data: prodData, quantity, authoritativePrice: price });
    }

    // 5. Compute Authoritative Invoice Amounts
    const tradeInDeduction = payload.tradeInDeduction || payload.invoice?.tradeInDeduction || 0;
    const discountAmount = payload.discountAmount || payload.invoice?.discountAmount || 0;
    const subTotal = isPureIntent ? (authoritativeDeviceSubtotal + authoritativeAccessorySubtotal) : (payload.invoice?.totalAmount || authoritativeDeviceSubtotal + authoritativeAccessorySubtotal);
    const finalAmount = Math.max(0, subTotal - discountAmount - tradeInDeduction);

    const invoiceId = payload.invoice?.id || `INV-${Date.now()}`;
    const invoiceCode = payload.invoice?.invoiceCode || `HD-${Date.now().toString().slice(-6)}`;
    const branchId = payload.branchId || payload.invoice?.branchId || 'CN01';
    const paymentMethod = isPureIntent ? payload.payment.method : payload.invoice?.paymentMethod;

    // 6. Mark Devices as Sold
    for (const dev of loadedDevices) {
      transaction.update(dev.ref, {
        status: 'sold',
        soldDate: new Date().toISOString(),
        soldInvoiceId: invoiceId,
        customerName: payload.customerName || payload.invoice?.customerName || null,
        customerPhone: payload.customerPhone || payload.invoice?.customerPhone || null
      });
    }

    // 7. Deduct Accessories Stock
    for (const acc of loadedAccessories) {
      transaction.update(acc.ref, {
        stockQuantity: increment(-acc.quantity)
      });
    }

    // 8. Construct & Save Authoritative Invoice
    const invRef = doc(db, 'invoices', invoiceId);
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
      discountAmount,
      tradeInDeduction,
      finalAmount,
      paymentMethod,
      paymentFundId: targetFundId,
      idempotencyKey,
      creatorUid: authenticatedStaff?.uid || 'SYSTEM',
      creatorName: authenticatedStaff?.name || 'Thu Ngân',
      createdAt: new Date().toISOString(),
      status: 'completed'
    };

    transaction.set(invRef, invoiceRecord);

    // 9. Write Cash Transaction & Increment Fund
    if (fundRef && finalAmount > 0 && paymentMethod !== 'INSTALLMENT') {
      const txId = `TX-${Date.now()}`;
      const txRef = doc(db, 'cashTransactions', txId);
      const cashTxRecord = {
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
      };

      transaction.set(txRef, cashTxRecord);
      transaction.update(fundRef, {
        currentBalance: increment(finalAmount),
        totalIncome: increment(finalAmount)
      });
    }

    // 10. Commit Idempotency Record
    if (idempotencyKey) {
      const idemRef = doc(db, 'checkoutRequests', idempotencyKey);
      transaction.set(idemRef, {
        id: idempotencyKey,
        status: 'COMPLETED',
        invoiceId,
        finalAmount,
        staffUid: authenticatedStaff?.uid || 'SYSTEM',
        createdAt: new Date().toISOString()
      });
    }

    // 11. Write Audit Trail Event
    const auditId = `AUDIT-${Date.now()}`;
    const auditRef = doc(db, 'auditEvents', auditId);
    transaction.set(auditRef, {
      id: auditId,
      action: 'POS_CHECKOUT',
      staffUid: authenticatedStaff?.uid || 'SYSTEM',
      staffName: authenticatedStaff?.name || 'Thu Ngân',
      targetResource: `invoices/${invoiceId}`,
      details: {
        invoiceCode,
        finalAmount,
        deviceCount: loadedDevices.length,
        accessoryCount: loadedAccessories.length,
        paymentMethod
      },
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      invoiceId,
      finalAmount,
      idempotencyKey
    };
  });
}
