import { Firestore, FieldValue, DocumentReference } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { imeiRegistryId, normalizeImei } from './inventoryDeviceService';
import { normalizeOperationalPolicyVersions, selectEffectiveOperationalPolicy } from './operationalPolicyService';

export interface CheckoutResult {
  success: boolean;
  invoiceId: string;
  invoice?: any;
  finalAmount?: number;
  alreadyProcessed?: boolean;
  idempotencyKey?: string;
}

export interface InvoiceRefundResult {
  invoiceId: string;
  refundTransaction: any | null;
  restoredDeviceIds: string[];
}

export async function processUpdateInvoiceNote(
  db: Firestore,
  invoiceIdRaw: string,
  noteRaw: unknown,
  actor: { uid: string; role?: string; name?: string; branchId?: string; assignedBranchIds?: string[] }
): Promise<any> {
  const invoiceId = String(invoiceIdRaw || '').trim();
  const notes = String(noteRaw || '').trim();
  if (!invoiceId) throw new Error('INVOICE_ID_REQUIRED');
  if (notes.length > 2000) throw new Error('INVOICE_NOTE_TOO_LONG');
  const invoiceRef = db.collection('invoices').doc(invoiceId);
  return db.runTransaction(async transaction => {
    const invoiceSnap = await transaction.get(invoiceRef);
    if (!invoiceSnap.exists) throw new Error('INVOICE_NOT_FOUND');
    const invoice = invoiceSnap.data()!;
    const branchId = String(invoice.branchId || '').trim();
    const role = String(actor.role || '').toUpperCase();
    const canAccess = role === 'ADMIN' || actor.branchId === branchId || (actor.assignedBranchIds || []).includes(branchId);
    if (!branchId || branchId === 'ALL' || !canAccess) throw new Error('INVOICE_BRANCH_FORBIDDEN');
    const now = new Date().toISOString();
    const history = [
      ...(Array.isArray(invoice.history) ? invoice.history : []),
      { time: now, action: 'Cập nhật ghi chú hóa đơn', note: notes, user: actor.name || actor.uid, actorUid: actor.uid }
    ].slice(-200);
    const updated = { ...invoice, id: invoiceSnap.id, notes, history, updatedAt: now };
    transaction.update(invoiceRef, { notes, history, updatedAt: now });
    transaction.set(db.collection('invoiceEvents').doc(), {
      invoiceId,
      invoiceCode: invoice.invoiceCode || invoiceId,
      branchId,
      eventType: 'NOTE_UPDATED',
      note: notes,
      actorUid: actor.uid,
      actorName: actor.name || actor.uid,
      occurredAt: now
    });
    return updated;
  });
}

const ALLOWED_FUND_TYPES_BY_METHOD: Record<string, string[]> = {
  CASH: ['CASH', 'TIỀN MẶT', 'KÉT TIỀN', 'TIEN_MAT'],
  BANK: ['BANK', 'VIETQR', 'NGÂN HÀNG', 'TÀI KHOẢN NGÂN HÀNG', 'NGAN_HANG'],
  CARD: ['CARD', 'POS_CARD', 'QUẸT THẺ POS', 'CÀ THẺ', 'POS_MACHINE', 'QUET_THE'],
  INSTALLMENT: ['CASH', 'BANK', 'VIETQR', 'KÉT TIỀN', 'NGÂN HÀNG', 'TIỀN MẶT', 'TIEN_MAT'] // Cho khoản trả trước (Down payment)
};

const normalizePriceKey = (value: unknown) => String(value || '').trim().toUpperCase();
const devicePriceVariantKey = (device: any) => [device?.model, device?.storage, device?.condition].map(normalizePriceKey).join('|');

function resolveRetailPriceEntry(policy: any, branchId: string, itemType: 'DEVICE' | 'ACCESSORY', itemId: string, data: any): any | undefined {
  const entries = Array.isArray(policy?.entries) ? policy.entries : [];
  const matches = entries.filter((entry: any) => {
    if (entry?.isActive !== true || entry.itemType !== itemType || !['ALL', branchId].includes(String(entry.branchId || 'ALL'))) return false;
    const key = normalizePriceKey(entry.itemKey);
    if (entry.matchType === 'ITEM_ID') return key === normalizePriceKey(itemId);
    if (entry.matchType === 'SKU') return key === normalizePriceKey(data?.sku);
    return itemType === 'DEVICE' && entry.matchType === 'MODEL_VARIANT' && key === devicePriceVariantKey(data);
  });
  const priority = (entry: any) =>
    (entry.branchId === branchId ? 100 : 0) + (entry.matchType === 'ITEM_ID' ? 30 : entry.matchType === 'SKU' ? 20 : 10);
  return matches.sort((left: any, right: any) => priority(right) - priority(left))[0];
}

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
    commissionTagSelections: (payload.commissionTagSelections || []).map((selection: any) => ({
      itemType: selection.itemType,
      itemId: selection.itemId,
      tagIds: [...(selection.tagIds || [])].sort()
    })).sort((a: any, b: any) => `${a.itemType}:${a.itemId}`.localeCompare(`${b.itemType}:${b.itemId}`)),
    priceAdjustments: (payload.priceAdjustments || []).map((adjustment: any) => ({
      itemType: adjustment.itemType,
      itemId: adjustment.itemId,
      unitPrice: adjustment.unitPrice,
      reason: String(adjustment.reason || '').trim()
    })).sort((a: any, b: any) => `${a.itemType}:${a.itemId}`.localeCompare(`${b.itemType}:${b.itemId}`)),
    payments: payload.payments,
    payment: payload.payment,
    branchId: payload.branchId || payload.invoice?.branchId,
    voucherCode: payload.voucherCode?.trim().toUpperCase(),
    tradeInAppraisalId: payload.tradeInAppraisalId,
    tradeInDevice: payload.tradeInDevice ? {
      imei: normalizeImei(payload.tradeInDevice.imei),
      model: payload.tradeInDevice.model,
      buyPrice: payload.tradeInDevice.buyPrice,
      warehouseId: payload.tradeInDevice.currentLocationId || payload.tradeInDevice.warehouseId || payload.tradeInDevice.warehouse
    } : null
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
      if (fData.status === 'INACTIVE' || fData.active === false || fData.isActive === false || fData.isArchived === true) {
        throw new Error(`INACTIVE_FUND: Quỹ tiền "${fData.name}" đang bị khóa, không thể thực hiện thanh toán.`);
      }
      if (!fData.branchId || fData.branchId === 'ALL' || fData.branchId !== branchId) {
        throw new Error(`FUND_BRANCH_MISMATCH: Quỹ tiền "${fData.name}" thuộc chi nhánh "${fData.branchId}", không khớp chi nhánh bán "${branchId}".`);
      }
      fundMap.set(fId, { ref: fRef, data: fData });
    }

    // Strict Runtime Verification of ALLOWED_FUND_TYPES_BY_METHOD for each payment line
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

    // 3. Fetch & Validate Devices (Authoritative Status & Pricing from DB, with Lead Reservation support)
    const deviceIds: string[] = isPureIntent
      ? payload.deviceIds
      : (payload.devicesToSell?.map((d: any) => d.id) || []);

    const loadedDevices: any[] = [];
    const checkoutLeadId = payload.leadId || payload.invoice?.leadId;

    for (const devId of deviceIds) {
      if (!devId) continue;
      const devRef: DocumentReference = db.collection('devices').doc(devId);
      const devSnap = await transaction.get(devRef);
      if (!devSnap.exists) {
        throw new Error(`DEVICE_NOT_FOUND: Không tìm thấy thiết bị ID "${devId}" trong cơ sở dữ liệu.`);
      }
      const devData = devSnap.data()!;

      // Concurrency & Reservation checks
      const isReservedForThisLead = devData.status === 'reserved' &&
        checkoutLeadId &&
        devData.reservedForLeadId === checkoutLeadId &&
        (!devData.reservedUntil || new Date(devData.reservedUntil).getTime() > Date.now());

      if (devData.status !== 'in_stock' && !isReservedForThisLead) {
        throw new Error(`DEVICE_ALREADY_SOLD: Thiết bị ${devData.model} (IMEI: ${devData.imei || devId}) đang ở trạng thái "${devData.status}", không thể bán.`);
      }

      if (devData.branchId && devData.branchId !== branchId) {
        throw new Error(`DEVICE_BRANCH_MISMATCH: Thiết bị ${devData.model} thuộc chi nhánh "${devData.branchId}", không thuộc chi nhánh bán "${branchId}".`);
      }

      const price = typeof devData.sellPrice === 'number' ? devData.sellPrice : 0;
      loadedDevices.push({ id: devId, ref: devRef, data: devData, listPrice: price, authoritativePrice: price, wasReserved: isReservedForThisLead });
    }

    // 4. Fetch & Validate Accessories (Authoritative Multi-Branch Stock & Pricing from DB - Fail Closed if not initialized)
    const accessoryLines: any[] = isPureIntent
      ? (payload.accessoryLines || [])
      : (payload.accessoriesToSell || []);

    const loadedAccessories: any[] = [];
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

      if (!balanceSnap.exists) {
        throw new Error(`BRANCH_STOCK_NOT_INITIALIZED: Phụ kiện "${prodData.name}" chưa được khởi tạo tồn kho tại chi nhánh "${branchId}".`);
      }

      const balData = balanceSnap.data()!;
      const availableStock = typeof balData.available === 'number' ? balData.available : (balData.onHand || 0);

      if (availableStock < quantity) {
        throw new Error(`INSUFFICIENT_STOCK: Phụ kiện "${prodData.name}" tại chi nhánh ${branchId} chỉ còn ${availableStock} cái (yêu cầu ${quantity}).`);
      }

      const price = typeof prodData.retailPrice === 'number' ? prodData.retailPrice : (prodData.sellPrice || 0);
      loadedAccessories.push({
        id: prodId,
        ref: prodRef,
        balanceRef,
        data: prodData,
        quantity,
        listPrice: price,
        authoritativePrice: price
      });
    }

    // Resolve the dated retail price policy and any audited POS line-price adjustment.
    const retailPricingRef = db.collection('operationalConfigs').doc('retailPricing');
    const retailPricingSnap = await transaction.get(retailPricingRef);
    const retailPricing = selectEffectiveOperationalPolicy(normalizeOperationalPolicyVersions('retailPricing', retailPricingSnap.exists ? retailPricingSnap.data() : null));
    const adjustmentMap = new Map<string, any>();
    for (const adjustment of (payload.priceAdjustments || [])) {
      const itemType = String(adjustment?.itemType || '').toUpperCase();
      const itemId = String(adjustment?.itemId || '').trim();
      const key = `${itemType}:${itemId}`;
      const unitPrice = Number(adjustment?.unitPrice);
      if (!['DEVICE', 'ACCESSORY'].includes(itemType) || !itemId || !Number.isFinite(unitPrice) || unitPrice <= 0 || adjustmentMap.has(key)) {
        throw new Error('POS_PRICE_ADJUSTMENT_INVALID: Giá điều chỉnh trên phiếu bán không hợp lệ.');
      }
      adjustmentMap.set(key, { unitPrice: Math.round(unitPrice), reason: String(adjustment?.reason || '').trim() });
    }
    const applyRetailPrice = (itemType: 'DEVICE' | 'ACCESSORY', item: any) => {
      const entry = resolveRetailPriceEntry(retailPricing, branchId, itemType, item.id, item.data);
      const fallbackPrice = Number(item.listPrice || 0);
      const listPrice = entry ? Number(entry.retailPrice) : fallbackPrice;
      if (!Number.isFinite(listPrice) || listPrice <= 0) throw new Error(`RETAIL_PRICE_REQUIRED: Chưa có giá bán lẻ hợp lệ cho "${item.data?.model || item.data?.name || item.id}".`);
      const adjustment = adjustmentMap.get(`${itemType}:${item.id}`);
      const authoritativePrice = adjustment ? adjustment.unitPrice : listPrice;
      const priceAdjusted = authoritativePrice !== listPrice;
      if (priceAdjusted && !adjustment.reason) throw new Error('POS_PRICE_ADJUSTMENT_REASON_REQUIRED: Bắt buộc nhập lý do khi sửa giá bán trên phiếu.');
      const minimumPrice = entry && Number.isFinite(Number(entry.minimumPrice)) ? Number(entry.minimumPrice) : null;
      const role = String(authenticatedStaff?.role || '').toUpperCase();
      const canOverrideFloor = ['ADMIN', 'MANAGER', 'STORE_MANAGER'].includes(role);
      if (minimumPrice !== null && authoritativePrice < minimumPrice && !canOverrideFloor) {
        throw new Error(`POS_PRICE_BELOW_FLOOR: Giá bán ${authoritativePrice.toLocaleString('vi-VN')}đ thấp hơn giá sàn ${minimumPrice.toLocaleString('vi-VN')}đ.`);
      }
      Object.assign(item, {
        listPrice,
        authoritativePrice,
        minimumPrice,
        priceAdjusted,
        priceAdjustmentReason: priceAdjusted ? adjustment.reason : '',
        pricePolicyId: retailPricing?.policyId || null,
        pricePolicyVersion: retailPricing?.version || null
      });
    };
    loadedDevices.forEach(device => applyRetailPrice('DEVICE', device));
    loadedAccessories.forEach(accessory => applyRetailPrice('ACCESSORY', accessory));
    const selectedLineKeys = new Set([
      ...loadedDevices.map(item => `DEVICE:${item.id}`),
      ...loadedAccessories.map(item => `ACCESSORY:${item.id}`)
    ]);
    if ([...adjustmentMap.keys()].some(key => !selectedLineKeys.has(key))) throw new Error('POS_PRICE_ADJUSTMENT_ITEM_NOT_IN_CART');

    // Resolve every selected commission tag from the active policy. Client values are never trusted.
    const salesConfigRef = db.collection('operationalConfigs').doc('sales');
    const salesConfigSnap = await transaction.get(salesConfigRef);
    const salesConfig = selectEffectiveOperationalPolicy(normalizeOperationalPolicyVersions('sales', salesConfigSnap.exists ? salesConfigSnap.data() : null));
    if (!salesConfig || !Array.isArray(salesConfig.commissionTags)) {
      throw new Error('SALES_CONFIG_REQUIRED: Chưa có chính sách Sales và tag hoa hồng được kích hoạt.');
    }
    const activeCommissionTags = salesConfig.commissionTags.filter((tag: any) => tag?.isActive === true);
    const commissionTagMap = new Map(activeCommissionTags.map((tag: any) => [String(tag.id), tag]));
    const selectionMap = new Map((payload.commissionTagSelections || []).map((selection: any) => [`${selection.itemType}:${selection.itemId}`, selection.tagIds || []]));
    const resolveCommissionTags = (itemType: 'DEVICE' | 'ACCESSORY', itemId: string) => {
      const eligibleTags = activeCommissionTags.filter((tag: any) => tag.appliesTo === itemType);
      const selectedIds = selectionMap.get(`${itemType}:${itemId}`) as string[] | undefined;
      if (eligibleTags.length > 0 && (!selectedIds || selectedIds.length === 0)) {
        throw new Error(`COMMISSION_TAG_REQUIRED: Bắt buộc chọn tag hoa hồng cho ${itemType === 'DEVICE' ? 'máy' : 'phụ kiện'} "${itemId}".`);
      }
      if ((selectedIds || []).length > 1) throw new Error(`COMMISSION_TAG_MULTIPLE_NOT_ALLOWED: Mỗi dòng hàng chỉ được chọn một tag hoa hồng.`);
      return (selectedIds || []).map(tagId => {
        const tag: any = commissionTagMap.get(tagId);
        if (!tag || tag.appliesTo !== itemType) throw new Error(`COMMISSION_TAG_INVALID: Tag "${tagId}" không hợp lệ cho dòng hàng "${itemId}".`);
        return {
          id: String(tag.id), name: String(tag.name), appliesTo: itemType,
          calculationType: tag.calculationType, value: Number(tag.value),
          description: String(tag.description || ''), isActive: true,
          policyId: String(salesConfig.policyId || 'sales'), policyVersion: String(salesConfig.version)
        };
      });
    };
    loadedDevices.forEach(device => { device.commissionTags = resolveCommissionTags('DEVICE', device.id); });
    loadedAccessories.forEach(accessory => { accessory.commissionTags = resolveCommissionTags('ACCESSORY', accessory.id); });

    const subTotal = loadedDevices.reduce((sum, item) => sum + item.authoritativePrice, 0)
      + loadedAccessories.reduce((sum, item) => sum + item.authoritativePrice * item.quantity, 0);

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

      const approvedPrice = appData.approvedPrice ?? appData.finalApprovedPrice;
      if (typeof approvedPrice !== 'number') {
        throw new Error(`TRADE_IN_FINAL_PRICE_REQUIRED: Phiếu thu cũ "${payload.tradeInAppraisalId}" chưa có giá thu mua được quản lý phê duyệt.`);
      }

      authoritativeTradeInDeduction = approvedPrice;
    }

    // A trade-in device is inventory received as part of checkout and must be written
    // in the same transaction as the sold device and invoice.
    let loadedTradeIn: { id: string; ref: DocumentReference; registryRef: DocumentReference; movementRef: DocumentReference; data: any } | null = null;
    if (payload.tradeInDevice) {
      const draft = payload.tradeInDevice;
      const normalizedImei = normalizeImei(draft.imei);
      if (!/^\d{5,15}$/.test(normalizedImei)) {
        throw new Error('TRADE_IN_IMEI_INVALID: IMEI máy thu cũ phải gồm từ 5 đến 15 chữ số.');
      }
      if (!draft.model || !String(draft.model).trim()) {
        throw new Error('TRADE_IN_MODEL_REQUIRED: Thiếu model máy thu cũ.');
      }
      const tradeInCost = authoritativeTradeInDeduction || Number(draft.buyPrice || 0);
      if (!Number.isFinite(tradeInCost) || tradeInCost <= 0) {
        throw new Error('TRADE_IN_COST_INVALID: Giá thu máy cũ không hợp lệ.');
      }
      if (!authoritativeTradeInDeduction) authoritativeTradeInDeduction = tradeInCost;

      const tradeInLocationId = String(draft.currentLocationId || draft.warehouseId || draft.warehouse || warehouseId || '');
      const locationRef = db.collection('warehouses').doc(tradeInLocationId);
      const locationSnap = await transaction.get(locationRef);
      if (!locationSnap.exists || locationSnap.data()?.isActive === false) {
        throw new Error('TRADE_IN_LOCATION_INVALID: Kho nhận máy thu cũ không tồn tại hoặc đã ngưng hoạt động.');
      }
      if (locationSnap.data()?.branchId && String(locationSnap.data()?.branchId) !== branchId) {
        throw new Error('TRADE_IN_LOCATION_BRANCH_MISMATCH: Kho nhận máy thu cũ không thuộc chi nhánh bán.');
      }

      const registryRef = db.collection('imeiRegistry').doc(imeiRegistryId(normalizedImei));
      const registrySnap = await transaction.get(registryRef);
      const normalizedMatch = await transaction.get(db.collection('devices').where('imeiNormalized', '==', normalizedImei).limit(1));
      const legacyMatch = await transaction.get(db.collection('devices').where('imei', '==', normalizedImei).limit(1));
      if (registrySnap.exists || !normalizedMatch.empty || !legacyMatch.empty) {
        throw new Error(`TRADE_IN_IMEI_ALREADY_EXISTS: IMEI ${normalizedImei} đã có trong kho.`);
      }

      const tradeInId = String(draft.id || `DEV_${imeiRegistryId(normalizedImei).slice(0, 20).toUpperCase()}`);
      const tradeInRef = db.collection('devices').doc(tradeInId);
      const tradeInIdSnap = await transaction.get(tradeInRef);
      if (tradeInIdSnap.exists) {
        throw new Error(`TRADE_IN_DEVICE_ID_ALREADY_EXISTS: Mã thiết bị ${tradeInId} đã tồn tại.`);
      }
      loadedTradeIn = {
        id: tradeInId,
        ref: tradeInRef,
        registryRef,
        movementRef: db.collection('inventoryMovements').doc(),
        data: {
          ...draft,
          id: tradeInId,
          imei: normalizedImei,
          imeiNormalized: normalizedImei,
          serialNo: draft.serialNo || normalizedImei,
          model: String(draft.model).trim(),
          buyPrice: tradeInCost,
          currentCost: tradeInCost,
          costVersion: payload.tradeInAppraisalId ? 'POS_TRADE_IN_APPROVED_V1' : 'POS_TRADE_IN_LEGACY_V1',
          sellPrice: Number(draft.sellPrice || tradeInCost),
          status: 'in_stock',
          branchId,
          currentLocationId: tradeInLocationId,
          warehouseId: tradeInLocationId,
          warehouse: tradeInLocationId
        }
      };
    }

    const finalAmount = Math.max(0, subTotal - authoritativeDiscount - authoritativeTradeInDeduction);

    // 7. Settlement Model: Fix Installment Debt Double-Counting
    let downPayment = 0;
    let financeAmount = 0;
    let financePartnerRef: DocumentReference | null = null;
    let customerDebtAmount = 0;

    if (isMultiPayment) {
      const totalPaymentsSum = payload.payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
      if (totalPaymentsSum !== finalAmount) {
        throw new Error(`PAYMENT_AMOUNT_MISMATCH: Tổng các khoản thanh toán (${totalPaymentsSum.toLocaleString('vi-VN')} đ) không khớp với giá trị đơn hàng (${finalAmount.toLocaleString('vi-VN')} đ).`);
      }

      // Customer only owes genuine customer DEBT, NOT installment financed by bank
      const debtLines = payload.payments.filter((p: any) => p.method === 'DEBT');
      customerDebtAmount = debtLines.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

      // Verify Installment Line
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

        if (String(partnerData.branchId || '') !== branchId) throw new Error('FINANCE_PARTNER_BRANCH_MISMATCH');
        const partnerType = `${partnerData.type || ''} ${partnerData.category || ''} ${partnerData.supplierCategory || ''}`.toUpperCase();
        if (!partnerType.includes('FINANCE') && !partnerType.includes('TRẢ GÓP') && !partnerType.includes('TRA_GOP')) {
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
      customerDebtAmount = 0; // Customer does not directly owe PhoneHouse for bank installment!

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

        if (String(partnerData.branchId || '') !== branchId) throw new Error('FINANCE_PARTNER_BRANCH_MISMATCH');
        const partnerType = `${partnerData.type || ''} ${partnerData.category || ''} ${partnerData.supplierCategory || ''}`.toUpperCase();
        if (!partnerType.includes('FINANCE') && !partnerType.includes('TRẢ GÓP') && !partnerType.includes('TRA_GOP')) {
          throw new Error(`INVALID_FINANCE_PARTNER_TYPE: Đối tác "${partnerData.name}" không phải là công ty tài chính trả góp.`);
        }
      }
    } else if (paymentMethod === 'DEBT') {
      customerDebtAmount = finalAmount;
    }

    // Firestore requires every transaction read to finish before the first write.
    // Preload optional CRM documents here; the remaining transaction is write-only.
    const customerId = payload.customerId || payload.customerPartner?.id;
    const customerRef: DocumentReference | null = customerId ? db.collection('partners').doc(customerId) : null;
    const customerSnap = customerRef ? await transaction.get(customerRef) : null;
    const leadRef: DocumentReference | null = checkoutLeadId ? db.collection('leads').doc(checkoutLeadId) : null;
    const leadSnap = leadRef ? await transaction.get(leadRef) : null;

    // Secure Non-Colliding ID Generation
    const newInvRef = db.collection('invoices').doc();
    const invoiceId = payload.invoice?.id || newInvRef.id;
    const invoiceCode = payload.invoice?.invoiceCode || `HD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // 8. Single Writer: Mark Devices as Sold in POS Transaction & Release/Consume Reservations
    for (const dev of loadedDevices) {
      transaction.update(dev.ref, {
        status: 'sold',
        soldDate: FieldValue.serverTimestamp(),
        soldInvoiceId: invoiceId,
        customerName: payload.customerName || payload.invoice?.customerName || null,
        customerPhone: payload.customerPhone || payload.invoice?.customerPhone || null,
        reservedForLeadId: FieldValue.delete(),
        reservedUntil: FieldValue.delete(),
        reservedByStaffId: FieldValue.delete()
      });

      if (dev.wasReserved && checkoutLeadId) {
        const resId = `RES_${dev.id}_${checkoutLeadId}`;
        const resRef = db.collection('deviceReservations').doc(resId);
        transaction.set(resRef, {
          id: resId,
          deviceId: dev.id,
          leadId: checkoutLeadId,
          status: 'CONSUMED',
          consumedInvoiceId: invoiceId,
          consumedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
    }

    if (loadedTradeIn) {
      transaction.set(loadedTradeIn.ref, {
        ...loadedTradeIn.data,
        sourceType: 'POS_TRADE_IN',
        sourceId: invoiceId,
        receivedDate: loadedTradeIn.data.receivedDate || new Date().toISOString().slice(0, 10),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        costCalculatedAt: FieldValue.serverTimestamp(),
        stateVersion: 1
      });
      transaction.set(loadedTradeIn.registryRef, {
        imei: loadedTradeIn.data.imei,
        deviceId: loadedTradeIn.id,
        branchId,
        currentLocationId: loadedTradeIn.data.currentLocationId,
        sourceType: 'POS_TRADE_IN',
        sourceId: invoiceId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.set(loadedTradeIn.movementRef, {
        id: loadedTradeIn.movementRef.id,
        movementType: 'STOCK_RECEIPT',
        deviceId: loadedTradeIn.id,
        imei: loadedTradeIn.data.imei,
        branchId,
        fromLocationId: null,
        toLocationId: loadedTradeIn.data.currentLocationId,
        sourceType: 'POS_TRADE_IN',
        sourceId: invoiceId,
        actorUid: authenticatedStaff?.uid || 'SYSTEM',
        actorName: authenticatedStaff?.name || 'Thu Ngân',
        createdAt: FieldValue.serverTimestamp()
      });
    }

    // 9. Deduct Accessory Stock (Global & Branch specific)
    for (const acc of loadedAccessories) {
      transaction.update(acc.ref, {
        stockQuantity: FieldValue.increment(-acc.quantity)
      });

      transaction.update(acc.balanceRef, {
        onHand: FieldValue.increment(-acc.quantity),
        available: FieldValue.increment(-acc.quantity),
        updatedAt: FieldValue.serverTimestamp()
      });
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
      customerId: payload.customerId || payload.customerPartner?.id || null,
      leadId: checkoutLeadId || null,
      quoteId: payload.quoteId || null,
      customerName: payload.customerName || payload.invoice?.customerName || 'Khách vãng lai',
      customerPhone: payload.customerPhone || payload.invoice?.customerPhone || '',
      devices: loadedDevices.map(d => ({
        id: d.id,
        imei: d.data.imei,
        model: d.data.model,
        sellPrice: d.authoritativePrice,
        listPrice: d.listPrice,
        priceAdjusted: d.priceAdjusted,
        priceAdjustmentReason: d.priceAdjustmentReason,
        color: d.data.color,
        storage: d.data.storage
      })),
      items: [
        ...loadedDevices.map(d => ({
          model: d.data.model,
          name: d.data.model,
          imei: d.data.imei,
          price: d.authoritativePrice,
          unitPrice: d.authoritativePrice,
          quantity: 1,
          totalPrice: d.authoritativePrice,
          type: 'device',
          color: d.data.color,
          storage: d.data.storage
        })),
        ...loadedAccessories.map(a => ({
          model: a.data.name,
          name: a.data.name,
          imei: '',
          price: a.authoritativePrice,
          unitPrice: a.authoritativePrice,
          quantity: a.quantity,
          totalPrice: a.authoritativePrice * a.quantity,
          type: 'accessory',
          color: '',
          storage: ''
        }))
      ],
      accessories: loadedAccessories.map(a => ({
        productId: a.id,
        name: a.data.name,
        quantity: a.quantity,
        price: a.authoritativePrice,
        listPrice: a.listPrice,
        priceAdjusted: a.priceAdjusted,
        priceAdjustmentReason: a.priceAdjustmentReason
      })),
      detailedItems: [
        ...loadedDevices.map(d => ({
          sku: d.data.sku || d.id, name: d.data.model, quantity: 1,
          unitPrice: d.authoritativePrice, totalPrice: d.authoritativePrice,
          imei: d.data.imei, type: 'device', color: d.data.color, storage: d.data.storage,
          commissionTags: d.commissionTags, listPrice: d.listPrice, priceAdjusted: d.priceAdjusted,
          priceAdjustmentReason: d.priceAdjustmentReason, pricePolicyId: d.pricePolicyId,
          pricePolicyVersion: d.pricePolicyVersion, priceAdjustedByUid: d.priceAdjusted ? (authenticatedStaff?.uid || 'SYSTEM') : null
        })),
        ...loadedAccessories.map(a => ({
          sku: a.data.sku || a.id, name: a.data.name, quantity: a.quantity,
          unitPrice: a.authoritativePrice, totalPrice: a.authoritativePrice * a.quantity,
          type: 'accessory', commissionTags: a.commissionTags, listPrice: a.listPrice, priceAdjusted: a.priceAdjusted,
          priceAdjustmentReason: a.priceAdjustmentReason, pricePolicyId: a.pricePolicyId,
          pricePolicyVersion: a.pricePolicyVersion, priceAdjustedByUid: a.priceAdjusted ? (authenticatedStaff?.uid || 'SYSTEM') : null
        }))
      ],
      priceList: retailPricing ? `${retailPricing.name || retailPricing.policyId} · ${retailPricing.version}` : 'Giá trên mặt hàng (chưa có bảng giá hiệu lực)',
      retailPricePolicyId: retailPricing?.policyId || null,
      retailPricePolicyVersion: retailPricing?.version || null,
      totalAmount: subTotal,
      subTotal,
      discountAmount: authoritativeDiscount,
      tradeInDeduction: authoritativeTradeInDeduction,
      tradeInDeviceId: loadedTradeIn?.id || null,
      finalAmount,
      paidAmount: finalAmount - customerDebtAmount - financeAmount,
      debtAmount: customerDebtAmount,
      financeAmount,
      paymentMethod,
      paymentFundId: isMultiPayment ? null : (payload.payment?.fundId || payload.fundToUpdate?.id || payload.invoice?.paymentFundId || null),
      ...(isMultiPayment ? { splitPayments: payload.payments } : {}),
      installmentDownPayment: downPayment,
      installmentFinanceAmount: financeAmount,
      installmentFinancePartnerId: payload.installmentFinancePartnerId || payload.payment?.installmentFinancePartnerId || null,
      installmentDisbursementStatus: financeAmount > 0 ? 'PENDING' : null,
      installmentExpectedAmount: financeAmount,
      installmentContractCode: payload.invoice?.installmentContractCode || null,
      installmentCompany: payload.invoice?.installmentCompany || payload.invoice?.installmentDetails?.financeCompany || null,
      installmentDetails: payload.invoice?.installmentDetails || null,
      idempotencyKey,
      creatorUid: authenticatedStaff?.uid || 'SYSTEM',
      creatorName: authenticatedStaff?.name || 'Thu Ngân',
      createdAt: FieldValue.serverTimestamp(),
      status: 'completed'
    };

    transaction.set(invRef, invoiceRecord);

    // 13. Standardized Cash Transactions (Full Branch, InvoiceId & Creator Linkage)
    if (isMultiPayment) {
      for (const p of payload.payments) {
        if (p.amount > 0 && p.fundId && p.method !== 'DEBT' && p.method !== 'INSTALLMENT') {
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
              branchId,
              invoiceId,
              sourceType: 'POS_INVOICE',
              sourceId: invoiceId,
              creatorUid: authenticatedStaff?.uid || 'SYSTEM',
              creatorName: authenticatedStaff?.name || 'Thu Ngân',
              creator: authenticatedStaff?.name || 'Thu Ngân',
              idempotencyKey: `${idempotencyKey}_${txId}`,
              date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
              partnerName: invoiceRecord.customerName,
              partnerPhone: invoiceRecord.customerPhone,
              referenceCode: invoiceCode,
              status: 'COMPLETED',
              createdAt: FieldValue.serverTimestamp()
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
          outstandingDebt: FieldValue.increment(financeAmount),
          debtTransactions: FieldValue.arrayUnion({
            id: `FINANCE_DEBT_${invoiceId}`,
            date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
            type: 'DEBT_INCREASE',
            amount: financeAmount,
            note: `Chờ giải ngân hóa đơn ${invoiceCode}`,
            referenceId: invoiceId,
            referenceCode: invoiceCode,
            referenceType: 'INVOICE'
          })
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
          branchId,
          invoiceId,
          sourceType: 'POS_INVOICE',
          sourceId: invoiceId,
          creatorUid: authenticatedStaff?.uid || 'SYSTEM',
          creatorName: authenticatedStaff?.name || 'Thu Ngân',
          creator: authenticatedStaff?.name || 'Thu Ngân',
          idempotencyKey: `${idempotencyKey}_${txId}`,
          date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
          partnerName: invoiceRecord.customerName,
          partnerPhone: invoiceRecord.customerPhone,
          referenceCode: invoiceCode,
          status: 'COMPLETED',
          createdAt: FieldValue.serverTimestamp()
        });

        transaction.update(fundInfo.ref, {
          currentBalance: FieldValue.increment(downPayment),
          totalIncome: FieldValue.increment(downPayment)
        });
      }

      if (financePartnerRef && financeAmount > 0) {
        transaction.update(financePartnerRef, {
          outstandingDebt: FieldValue.increment(financeAmount),
          debtTransactions: FieldValue.arrayUnion({
            id: `FINANCE_DEBT_${invoiceId}`,
            date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
            type: 'DEBT_INCREASE',
            amount: financeAmount,
            note: `Chờ giải ngân hóa đơn ${invoiceCode}`,
            referenceId: invoiceId,
            referenceCode: invoiceCode,
            referenceType: 'INVOICE'
          })
        });
      }
    } else if (paymentMethod !== 'DEBT') {
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
          branchId,
          invoiceId,
          sourceType: 'POS_INVOICE',
          sourceId: invoiceId,
          creatorUid: authenticatedStaff?.uid || 'SYSTEM',
          creatorName: authenticatedStaff?.name || 'Thu Ngân',
          creator: authenticatedStaff?.name || 'Thu Ngân',
          idempotencyKey: `${idempotencyKey}_${txId}`,
          date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
          partnerName: invoiceRecord.customerName,
          partnerPhone: invoiceRecord.customerPhone,
          referenceCode: invoiceCode,
          status: 'COMPLETED',
          createdAt: FieldValue.serverTimestamp()
        });

        transaction.update(fundInfo.ref, {
          currentBalance: FieldValue.increment(finalAmount),
          totalIncome: FieldValue.increment(finalAmount)
        });
      }
    }

    // 14. Customer CRM Lifetime Value (LTV) Update (Increments ONLY customer debt)
    if (customerId && customerRef && customerSnap) {
      const debtTransaction = customerDebtAmount > 0 ? {
        id: `DEBT_${invoiceId}`,
        date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
        type: 'DEBT_INCREASE',
        amount: customerDebtAmount,
        note: `Công nợ hóa đơn ${invoiceCode}`,
        referenceId: invoiceId,
        referenceCode: invoiceCode,
        referenceType: 'INVOICE'
      } : null;
      if (customerSnap.exists) {
        transaction.update(customerRef, {
          totalSpent: FieldValue.increment(finalAmount),
          outstandingDebt: FieldValue.increment(customerDebtAmount),
          lastInvoiceId: invoiceId,
          lastPurchaseDate: FieldValue.serverTimestamp(),
          ...(debtTransaction ? { debtTransactions: FieldValue.arrayUnion(debtTransaction) } : {})
        });
      } else {
        const profile = payload.customerPartner || {};
        transaction.set(customerRef, {
          id: customerId,
          branchId,
          type: 'CUSTOMER',
          name: String(payload.customerName || profile.name || invoiceRecord.customerName || '').trim() || `Khách ${customerId}`,
          phone: String(payload.customerPhone || profile.phone || invoiceRecord.customerPhone || '').trim(),
          email: String(profile.email || '').trim(),
          address: String(profile.address || '').trim(),
          customerTier: profile.customerTier || 'STANDARD',
          loyaltyPoints: Number(profile.loyaltyPoints || 0),
          totalSpent: finalAmount,
          outstandingDebt: customerDebtAmount,
          debtTransactions: debtTransaction ? [debtTransaction] : [],
          createdAt: new Date().toISOString(),
          lastInteraction: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
          lastInvoiceId: invoiceId,
          lastPurchaseDate: FieldValue.serverTimestamp()
        });
      }
    }

    // 15. If LeadId attached, update Lead status to WON
    if (checkoutLeadId && leadRef && leadSnap) {
      if (leadSnap.exists) {
        transaction.update(leadRef, {
          status: 'won',
          wonInvoiceId: invoiceId,
          wonAt: new Date().toISOString(),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    // 16. Commit Idempotency Record (Includes Canonical Payload Hash)
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

    // 17. Write Audit Trail Event
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
        paymentMethod,
        branchId
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

export async function executeAtomicInvoiceRefund(
  db: Firestore,
  payload: { invoiceId: string; branchId: string; fundId?: string; reason: string; idempotencyKey: string },
  authenticatedStaff?: { uid: string; role?: string; name?: string; branchId?: string }
): Promise<InvoiceRefundResult> {
  const invoiceId = String(payload.invoiceId || '').trim();
  const branchId = String(payload.branchId || '').trim();
  const fundId = String(payload.fundId || '').trim();
  const reason = String(payload.reason || '').trim();
  const idempotencyKey = String(payload.idempotencyKey || '').trim();
  if (!invoiceId || !branchId || branchId === 'ALL' || !reason || !idempotencyKey) {
    throw new Error('REFUND_REQUIRED_FIELDS');
  }

  return db.runTransaction(async transaction => {
    const idemRef = db.collection('invoiceRefundRequests').doc(idempotencyKey);
    const idemSnap = await transaction.get(idemRef);
    if (idemSnap.exists && idemSnap.data()?.status === 'COMPLETED') {
      return idemSnap.data()!.result as InvoiceRefundResult;
    }

    const invoiceRef = db.collection('invoices').doc(invoiceId);
    const invoiceSnap = await transaction.get(invoiceRef);
    if (!invoiceSnap.exists) throw new Error('INVOICE_NOT_FOUND');
    const invoice = invoiceSnap.data()!;
    if (String(invoice.branchId || '') !== branchId) throw new Error('INVOICE_BRANCH_MISMATCH');
    if (String(invoice.status || '').toLowerCase() === 'cancelled') throw new Error('INVOICE_ALREADY_CANCELLED');
    if (Array.isArray(invoice.debtSettlementIds) && invoice.debtSettlementIds.length > 0) {
      throw new Error('INVOICE_REFUND_HAS_PARTNER_DEBT_SETTLEMENT');
    }
    if (invoice.installmentDisbursementStatus === 'DISBURSED') {
      throw new Error('INVOICE_REFUND_REQUIRES_INSTALLMENT_REVERSAL');
    }

    const refundAmount = Number(invoice.paidAmount ?? invoice.finalAmount ?? 0);
    const splitPayments = Array.isArray(invoice.splitPayments) ? invoice.splitPayments.filter((line: any) =>
      Number(line.amount || 0) > 0 && line.fundId && !['DEBT', 'INSTALLMENT'].includes(String(line.method || '').toUpperCase())
    ) : [];
    if (splitPayments.length > 1) throw new Error('MULTI_FUND_REFUND_REQUIRES_ALLOCATION');
    const originalFundId = String(invoice.paymentFundId || splitPayments[0]?.fundId || '').trim();
    if (originalFundId && fundId !== originalFundId) throw new Error('REFUND_MUST_USE_ORIGINAL_FUND');
    if (refundAmount > 0 && !fundId) throw new Error('REFUND_FUND_REQUIRED');

    let fundRef: DocumentReference | null = null;
    let fund: any = null;
    if (refundAmount > 0) {
      fundRef = db.collection('funds').doc(fundId);
      const fundSnap = await transaction.get(fundRef);
      if (!fundSnap.exists) throw new Error('REFUND_FUND_NOT_FOUND');
      fund = fundSnap.data()!;
      if (!fund.branchId || fund.branchId === 'ALL' || fund.branchId !== branchId) throw new Error('REFUND_FUND_BRANCH_MISMATCH');
      if (fund.isArchived === true || fund.isActive === false || fund.active === false) throw new Error('REFUND_FUND_INACTIVE');
      if (Number(fund.currentBalance || 0) < refundAmount) throw new Error('REFUND_FUND_INSUFFICIENT_BALANCE');
    }

    const deviceSnapshots = new Map<string, any>();
    const soldDevices = await transaction.get(db.collection('devices').where('soldInvoiceId', '==', invoiceId));
    soldDevices.docs.forEach(item => deviceSnapshots.set(item.id, item));
    if (deviceSnapshots.size === 0) {
      const imeis = [...new Set([
        ...(Array.isArray(invoice.imeiList) ? invoice.imeiList : []),
        ...(Array.isArray(invoice.devices) ? invoice.devices.map((item: any) => item.imei) : []),
        ...(Array.isArray(invoice.items) ? invoice.items.map((item: any) => item.imei) : [])
      ].filter(Boolean))];
      for (const imei of imeis) {
        const matches = await transaction.get(db.collection('devices').where('imei', '==', imei).limit(1));
        matches.docs.forEach(item => deviceSnapshots.set(item.id, item));
      }
    }

    const accessoryRestores: Array<{ ref: DocumentReference; quantity: number }> = [];
    for (const line of Array.isArray(invoice.accessories) ? invoice.accessories : []) {
      const quantity = Math.max(0, Number(line.quantity || 1));
      if (!line.name || quantity <= 0) continue;
      const matches = await transaction.get(db.collection('products').where('name', '==', line.name).limit(1));
      if (!matches.empty) accessoryRestores.push({ ref: matches.docs[0].ref, quantity });
    }

    let customerRef: DocumentReference | null = null;
    let customerData: any = null;
    if (invoice.customerId) {
      const candidate = db.collection('partners').doc(String(invoice.customerId));
      const candidateSnap = await transaction.get(candidate);
      if (candidateSnap.exists) {
        customerRef = candidate;
        customerData = candidateSnap.data();
      }
    } else if (invoice.customerPhone || invoice.phone) {
      const matches = await transaction.get(db.collection('partners').where('phone', '==', invoice.customerPhone || invoice.phone).limit(1));
      if (!matches.empty) {
        customerRef = matches.docs[0].ref;
        customerData = matches.docs[0].data();
      }
    }

    const pendingFinanceAmount = invoice.installmentDisbursementStatus === 'PENDING'
      ? Number(invoice.installmentExpectedAmount ?? invoice.installmentFinanceAmount ?? invoice.financeAmount ?? 0)
      : 0;
    let financePartnerRef: DocumentReference | null = null;
    let financePartnerData: any = null;
    if (pendingFinanceAmount > 0) {
      const financePartnerId = String(invoice.installmentFinancePartnerId || '').trim();
      if (!financePartnerId) throw new Error('REFUND_FINANCE_PARTNER_REQUIRED');
      financePartnerRef = db.collection('partners').doc(financePartnerId);
      const financePartnerSnap = await transaction.get(financePartnerRef);
      if (!financePartnerSnap.exists) throw new Error('REFUND_FINANCE_PARTNER_NOT_FOUND');
      financePartnerData = financePartnerSnap.data();
      if (String(financePartnerData.branchId || '') !== branchId) throw new Error('REFUND_FINANCE_PARTNER_BRANCH_MISMATCH');
      if (Number(financePartnerData.outstandingDebt || 0) < pendingFinanceAmount) throw new Error('REFUND_FINANCE_PARTNER_DEBT_MISMATCH');
    }

    const now = new Date().toISOString();
    const refundTxId = refundAmount > 0 ? `TX_REFUND_${Date.now()}` : '';
    const refundTransaction = refundAmount > 0 ? {
      id: refundTxId,
      code: `PC-REFUND-${Date.now().toString().slice(-6)}`,
      type: 'PAYMENT',
      category: 'CUSTOMER_REFUND',
      categoryName: 'Chi hoàn tiền đổi trả cho khách',
      amount: refundAmount,
      branchId,
      fundId,
      fundType: fund.type,
      fundName: fund.name,
      date: now,
      partnerName: invoice.customerName || '',
      partnerPhone: invoice.customerPhone || invoice.phone || '',
      creator: authenticatedStaff?.name || authenticatedStaff?.uid || 'Nhân viên',
      creatorUid: authenticatedStaff?.uid,
      notes: `Hoàn tiền hủy hóa đơn ${invoice.invoiceCode || invoiceId}: ${reason}`,
      referenceCode: invoice.invoiceCode || invoiceId,
      isPLAccounted: false,
      status: 'COMPLETED'
    } : null;

    transaction.update(invoiceRef, {
      status: 'cancelled', cancellationReason: reason,
      cancelledBy: authenticatedStaff?.name || authenticatedStaff?.uid || '',
      cancelledByUid: authenticatedStaff?.uid || '', cancelledAt: now,
      debtAmount: 0,
      ...(pendingFinanceAmount > 0 ? { installmentDisbursementStatus: 'CANCELLED' } : {})
    });
    deviceSnapshots.forEach(item => transaction.update(item.ref, {
      status: 'in_stock', soldDate: FieldValue.delete(), soldInvoiceId: FieldValue.delete(),
      customerName: FieldValue.delete(), customerPhone: FieldValue.delete(), updatedAt: now
    }));
    accessoryRestores.forEach(item => transaction.update(item.ref, { stockQuantity: FieldValue.increment(item.quantity), updatedAt: now }));
    if (fundRef && refundTransaction) {
      transaction.update(fundRef, {
        currentBalance: Number(fund.currentBalance || 0) - refundAmount,
        totalExpense: Number(fund.totalExpense || 0) + refundAmount,
        updatedAt: now
      });
      transaction.set(db.collection('cashTransactions').doc(refundTxId), refundTransaction);
    }
    if (customerRef && customerData) {
      const customerDebtToReverse = Number(invoice.debtAmount || 0);
      const customerOutstandingDebt = Number(customerData.outstandingDebt || 0);
      if (customerDebtToReverse > 0 && customerOutstandingDebt < customerDebtToReverse) throw new Error('REFUND_CUSTOMER_DEBT_MISMATCH');
      transaction.update(customerRef, {
        totalSpent: Math.max(0, Number(customerData.totalSpent || 0) - Number(invoice.finalAmount || 0)),
        outstandingDebt: Math.max(0, customerOutstandingDebt - customerDebtToReverse),
        debtTransactions: (Array.isArray(customerData.debtTransactions) ? customerData.debtTransactions : [])
          .filter((item: any) => String(item.referenceId || '') !== invoiceId),
        updatedAt: now
      });
    }
    if (financePartnerRef && financePartnerData && pendingFinanceAmount > 0) {
      transaction.update(financePartnerRef, {
        outstandingDebt: Number(financePartnerData.outstandingDebt || 0) - pendingFinanceAmount,
        debtTransactions: (Array.isArray(financePartnerData.debtTransactions) ? financePartnerData.debtTransactions : [])
          .filter((item: any) => String(item.referenceId || '') !== invoiceId),
        updatedAt: now
      });
    }

    const result = { invoiceId, refundTransaction, restoredDeviceIds: [...deviceSnapshots.keys()] };
    transaction.set(idemRef, { status: 'COMPLETED', result, invoiceId, createdAt: now, actorUid: authenticatedStaff?.uid || '' });
    return result;
  });
}
