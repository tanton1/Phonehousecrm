import crypto from 'crypto';
import { Firestore } from 'firebase-admin/firestore';
import { imeiRegistryId, normalizeImei, InventoryActor } from './inventoryDeviceService';

interface ReceiptDeviceDraft {
  imei: string;
  model: string;
  storage?: string;
  color?: string;
  region?: string;
  condition?: string;
  batteryHealth?: number;
  buyPrice: number;
  sellPrice: number;
  allocatedDiscountAmount: number;
  allocatedShippingFee: number;
  allocatedVatAmount: number;
  allocatedOtherFees: number;
  acquisitionCost: number;
}

export interface PurchaseCostAdjustments {
  discountAmount: number;
  shippingFee: number;
  vatAmount: number;
  otherFees: number;
}

export function assertPurchaseDeviceCanBeCancelled(
  device: any,
  warehouseId: string,
  orderId: string,
  movements: any[] = [],
  costEvents: any[] = []
): void {
  const locationId = String(device.currentLocationId || device.warehouseId || device.warehouse || '');
  if (device.status !== 'in_stock' || locationId !== warehouseId || device.activeTransferId || device.activeWorkOrderId) {
    throw new Error(`PURCHASE_CANCEL_DEVICE_ALREADY_USED: IMEI ${device.imei || device.id || ''} đã di chuyển, bán hoặc phát sinh nghiệp vụ khác.`);
  }
  const hasLaterMovement = movements.some(movement =>
    !(movement.sourceType === 'PURCHASE_ORDER' && movement.sourceId === orderId && movement.movementType === 'STOCK_RECEIPT')
  );
  const hasLaterCostEvent = costEvents.some(event =>
    !(event.eventType === 'ACQUISITION' && event.sourceType === 'PURCHASE_ORDER' && event.sourceId === orderId)
  );
  const acquisitionCost = Number(device.acquisitionCost);
  const currentCost = Number(device.currentCost);
  const costChanged = Number.isFinite(acquisitionCost) && Number.isFinite(currentCost) && Math.abs(acquisitionCost - currentCost) > 0.5;
  const costVersionChanged = Boolean(device.costVersion && device.costVersion !== 'PURCHASE_LANDED_COST_V1');
  if (hasLaterMovement || hasLaterCostEvent || costChanged || costVersionChanged) {
    throw new Error(`PURCHASE_CANCEL_DEVICE_HAS_LIFECYCLE: IMEI ${device.imei || device.id || ''} đã có lịch sử chuyển kho, kỹ thuật hoặc biến động giá vốn.`);
  }
}

export interface AllocatedPurchaseDeviceCost extends PurchaseCostAdjustments {
  imei: string;
  supplierUnitPrice: number;
  acquisitionCost: number;
}

export interface ValidatedPurchaseReceipt {
  order: any;
  branchId: string;
  warehouseId: string;
  supplierId: string;
  fundId: string;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  adjustments: PurchaseCostAdjustments;
  devices: ReceiptDeviceDraft[];
  payloadHash: string;
}

export interface PurchasePaymentAllocationInput {
  fundId: string;
  method: 'CASH' | 'BANK_TRANSFER';
  amount: number;
}

function canAccessBranch(actor: InventoryActor, branchId: string): boolean {
  const role = String(actor.role || '').toUpperCase();
  return role === 'ADMIN' || role === 'REGIONAL_MANAGER' || actor.branchId === branchId || (actor.assignedBranchIds || []).includes(branchId);
}

function allocateWholeVndAmount(totalAmount: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(totalAmount) || totalAmount < 0) throw new Error('PURCHASE_MONEY_MUST_BE_WHOLE_VND');
  if (weights.length === 0) return [];
  if (totalAmount === 0) return weights.map(() => 0);
  const safeWeights = weights.map(weight => Number.isFinite(weight) && weight > 0 ? weight : 0);
  const totalWeight = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const denominator = totalWeight > 0 ? totalWeight : safeWeights.length;
  const rawShares = safeWeights.map(weight => totalAmount * (totalWeight > 0 ? weight : 1) / denominator);
  const shares = rawShares.map(Math.floor);
  let remainder = totalAmount - shares.reduce((sum, amount) => sum + amount, 0);
  const remainderOrder = rawShares
    .map((rawShare, index) => ({ index, fraction: rawShare - Math.floor(rawShare) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let cursor = 0; remainder > 0; cursor++, remainder--) {
    shares[remainderOrder[cursor % remainderOrder.length].index] += 1;
  }
  return shares;
}

export function allocatePurchaseLandedCosts(
  devices: Array<{ imei: string; buyPrice: number }>,
  adjustments: PurchaseCostAdjustments
): AllocatedPurchaseDeviceCost[] {
  if (devices.length === 0) throw new Error('PURCHASE_ITEMS_REQUIRED');
  const weights = devices.map(device => Number(device.buyPrice));
  if (weights.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('PURCHASE_MONEY_MUST_BE_WHOLE_VND');
  const discountShares = allocateWholeVndAmount(adjustments.discountAmount, weights);
  const shippingShares = allocateWholeVndAmount(adjustments.shippingFee, weights);
  const vatShares = allocateWholeVndAmount(adjustments.vatAmount, weights);
  const otherFeeShares = allocateWholeVndAmount(adjustments.otherFees, weights);
  const allocations = devices.map((device, index) => {
    const acquisitionCost = device.buyPrice
      - discountShares[index]
      + shippingShares[index]
      + vatShares[index]
      + otherFeeShares[index];
    if (!Number.isSafeInteger(acquisitionCost) || acquisitionCost < 0) throw new Error('PURCHASE_DEVICE_ACQUISITION_COST_INVALID');
    return {
      imei: device.imei,
      supplierUnitPrice: device.buyPrice,
      discountAmount: discountShares[index],
      shippingFee: shippingShares[index],
      vatAmount: vatShares[index],
      otherFees: otherFeeShares[index],
      acquisitionCost
    };
  });
  const expectedTotal = weights.reduce((sum, value) => sum + value, 0)
    - adjustments.discountAmount
    + adjustments.shippingFee
    + adjustments.vatAmount
    + adjustments.otherFees;
  if (allocations.reduce((sum, item) => sum + item.acquisitionCost, 0) !== expectedTotal) {
    throw new Error('PURCHASE_COST_ALLOCATION_MISMATCH');
  }
  return allocations;
}

export function validatePurchaseReceiptInput(input: any, actor: InventoryActor): ValidatedPurchaseReceipt {
  const order = input?.order || input;
  const branchId = String(order?.branchId || '').trim();
  const warehouseId = String(order?.warehouseId || '').trim();
  const supplierId = String(order?.supplierId || '').trim();
  const fundId = String(order?.fundId || '').trim();
  if (!order?.id) throw new Error('PURCHASE_ORDER_ID_REQUIRED');
  if (!branchId || branchId === 'ALL') throw new Error('PURCHASE_BRANCH_REQUIRED');
  if (!warehouseId || warehouseId === 'ALL' || warehouseId === 'KHO_TONG') throw new Error('PURCHASE_WAREHOUSE_REQUIRED');
  if (!canAccessBranch(actor, branchId)) throw new Error('PURCHASE_BRANCH_FORBIDDEN');
  if (!supplierId) throw new Error('PURCHASE_SUPPLIER_REQUIRED');
  if (order.status !== 'COMPLETED') throw new Error('PURCHASE_RECEIPT_STATUS_INVALID');

  const totalAmount = Number(order.totalAmount);
  const paidAmount = Number(order.paidAmount || 0);
  const debtAmount = Number(order.debtAmount || 0);
  if (![totalAmount, paidAmount, debtAmount].every(Number.isFinite) || totalAmount < 0 || paidAmount < 0 || paidAmount > totalAmount || Math.abs(totalAmount - paidAmount - debtAmount) > 1) {
    throw new Error('PURCHASE_TOTALS_INVALID');
  }
  if (paidAmount > 0 && !fundId) throw new Error('PURCHASE_FUND_REQUIRED');
  if (paidAmount > 0 && !['Tiền mặt tại két', 'Chuyển khoản VietQR'].includes(String(order.paymentMethod || ''))) {
    throw new Error('PURCHASE_PAYMENT_METHOD_INVALID');
  }

  const deviceDrafts: Array<Omit<ReceiptDeviceDraft,
    'allocatedDiscountAmount' | 'allocatedShippingFee' | 'allocatedVatAmount' | 'allocatedOtherFees' | 'acquisitionCost'>> = [];
  if (!Array.isArray(order.items) || order.items.length === 0) throw new Error('PURCHASE_ITEMS_REQUIRED');
  for (const item of order.items) {
    if (item.type !== 'device') throw new Error('PURCHASE_ITEM_TYPE_UNSUPPORTED');
    const imeis = Array.isArray(item.imeiList) ? item.imeiList.map(normalizeImei).filter(Boolean) : [];
    if (imeis.length !== Number(item.quantity || 0)) throw new Error('PURCHASE_ITEM_QUANTITY_MISMATCH');
    for (const imei of imeis) {
      deviceDrafts.push({
        imei,
        model: String(item.modelOrName || '').trim(),
        storage: item.storage || '',
        color: item.color || '',
        region: item.region || '',
        condition: item.condition || 'Like New 99%',
        batteryHealth: Number(item.batteryHealth ?? 100),
        buyPrice: Number(item.importPrice),
        sellPrice: Number(item.expectedSellPrice ?? item.importPrice)
      });
    }
  }
  if (deviceDrafts.length === 0 || deviceDrafts.length > 100) throw new Error('PURCHASE_DEVICE_COUNT_INVALID');
  if (deviceDrafts.some(device => !/^\d{5,15}$/.test(device.imei))) throw new Error('IMEI_INVALID: Mã IMEI/Serial phải gồm từ 5 đến 15 chữ số.');
  if (new Set(deviceDrafts.map(device => device.imei)).size !== deviceDrafts.length) throw new Error('DUPLICATE_IMEI_IN_REQUEST');
  if (deviceDrafts.some(device =>
    !device.model ||
    !Number.isSafeInteger(device.buyPrice) || device.buyPrice < 0 ||
    !Number.isSafeInteger(device.sellPrice) || device.sellPrice < 0 ||
    !Number.isFinite(device.batteryHealth) || Number(device.batteryHealth) < 0 || Number(device.batteryHealth) > 100
  )) throw new Error('PURCHASE_DEVICE_DATA_INVALID');
  const calculatedTotal = deviceDrafts.reduce((sum, device) => sum + device.buyPrice, 0);
  if (Math.abs(calculatedTotal - Number(order.subTotal ?? calculatedTotal)) > 1) throw new Error('PURCHASE_ITEM_TOTAL_MISMATCH');
  const discountAmount = Number(order.discountAmount || 0);
  const shippingFee = Number(order.shippingFee || 0);
  const vatAmount = Number(order.vatAmount || 0);
  const otherFees = Number(order.otherFees || 0);
  if (![discountAmount, shippingFee, vatAmount, otherFees].every(value => Number.isFinite(value) && value >= 0) || discountAmount > calculatedTotal) {
    throw new Error('PURCHASE_ADJUSTMENTS_INVALID');
  }
  if (![totalAmount, paidAmount, debtAmount, discountAmount, shippingFee, vatAmount, otherFees].every(Number.isSafeInteger)) {
    throw new Error('PURCHASE_MONEY_MUST_BE_WHOLE_VND');
  }
  const calculatedNetTotal = calculatedTotal - discountAmount + shippingFee + vatAmount + otherFees;
  if (Math.abs(calculatedNetTotal - totalAmount) > 1) throw new Error('PURCHASE_TOTAL_MISMATCH');
  const adjustments = { discountAmount, shippingFee, vatAmount, otherFees };
  const allocatedCosts = allocatePurchaseLandedCosts(deviceDrafts, adjustments);
  const devices: ReceiptDeviceDraft[] = deviceDrafts.map((device, index) => ({
    ...device,
    allocatedDiscountAmount: allocatedCosts[index].discountAmount,
    allocatedShippingFee: allocatedCosts[index].shippingFee,
    allocatedVatAmount: allocatedCosts[index].vatAmount,
    allocatedOtherFees: allocatedCosts[index].otherFees,
    acquisitionCost: allocatedCosts[index].acquisitionCost
  }));

  const payloadHash = crypto.createHash('sha256').update(JSON.stringify({
    id: order.id, branchId, warehouseId, supplierId, fundId,
    totalAmount, paidAmount, debtAmount, adjustments,
    devices: devices.map(device => ({
      imei: device.imei,
      model: device.model,
      storage: device.storage,
      color: device.color,
      region: device.region,
      condition: device.condition,
      batteryHealth: device.batteryHealth,
      buyPrice: device.buyPrice,
      sellPrice: device.sellPrice,
      acquisitionCost: device.acquisitionCost
    }))
  })).digest('hex');
  return { order, branchId, warehouseId, supplierId, fundId, totalAmount, paidAmount, debtAmount, adjustments, devices, payloadHash };
}

export async function processPurchaseOrderReceipt(db: Firestore, input: any, actor: InventoryActor): Promise<{
  order: any;
  devices: any[];
  importedCount: number;
  idempotentReplay?: boolean;
}> {
  const receipt = validatePurchaseReceiptInput(input, actor);
  const orderRef = db.collection('purchaseOrders').doc(String(receipt.order.id));
  const postingDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const dateKey = postingDate.replace(/\D/g, '');
  const branchCode = receipt.branchId.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'CN';
  const sequenceRef = db.collection('purchaseOrderSequences').doc(`${receipt.branchId}_${dateKey}`);

  return db.runTransaction(async transaction => {
    const orderSnap = await transaction.get(orderRef);
    if (orderSnap.exists) {
      if (orderSnap.data()?.receiptPayloadHash !== receipt.payloadHash) throw new Error('PURCHASE_ORDER_ALREADY_EXISTS');
      return { order: { id: orderSnap.id, ...orderSnap.data() }, devices: [], importedCount: Number(orderSnap.data()?.totalQuantity || 0), idempotentReplay: true };
    }
    const sequenceSnap = await transaction.get(sequenceRef);

    const warehouseRef = db.collection('warehouses').doc(receipt.warehouseId);
    const supplierRef = db.collection('partners').doc(receipt.supplierId);
    const warehouseSnap = await transaction.get(warehouseRef);
    const supplierSnap = await transaction.get(supplierRef);
    if (!warehouseSnap.exists) throw new Error('PURCHASE_WAREHOUSE_NOT_FOUND');
    const warehouse = warehouseSnap.data()!;
    if (warehouse.isActive === false || warehouse.active === false || warehouse.isArchived === true) throw new Error('PURCHASE_WAREHOUSE_INACTIVE');
    if (String(warehouse.branchId || '') !== receipt.branchId) throw new Error('PURCHASE_WAREHOUSE_BRANCH_MISMATCH');
    if (!supplierSnap.exists) throw new Error('PURCHASE_SUPPLIER_NOT_FOUND');

    let fund: any = null;
    let fundRef: any = null;
    if (receipt.paidAmount > 0) {
      fundRef = db.collection('funds').doc(receipt.fundId);
      const fundSnap: any = await transaction.get(fundRef as any);
      if (!fundSnap.exists) throw new Error('PURCHASE_FUND_NOT_FOUND');
      fund = fundSnap.data()!;
      if (fund.isActive === false || fund.active === false || fund.isArchived === true) throw new Error('PURCHASE_FUND_INACTIVE');
      if (String(fund.branchId || '') !== receipt.branchId) throw new Error('PURCHASE_FUND_BRANCH_MISMATCH');
      if (Number(fund.currentBalance || 0) < receipt.paidAmount) throw new Error(`INSUFFICIENT_FUNDS: Số dư quỹ "${fund.name || receipt.fundId}" không đủ để thanh toán phiếu nhập.`);
      const expectedFundType = receipt.order.paymentMethod === 'Tiền mặt tại két' ? 'CASH' : 'BANK';
      if (fund.type !== expectedFundType) throw new Error('PURCHASE_FUND_TYPE_MISMATCH');
    }

    const registrySnaps: any[] = [];
    const deviceSnaps: any[] = [];
    const normalizedQueries: any[] = [];
    const legacyQueries: any[] = [];
    for (const device of receipt.devices) {
      const deviceId = `DEV_${imeiRegistryId(device.imei).slice(0, 20).toUpperCase()}`;
      deviceSnaps.push(await transaction.get(db.collection('devices').doc(deviceId)));
      registrySnaps.push(await transaction.get(db.collection('imeiRegistry').doc(imeiRegistryId(device.imei))));
      normalizedQueries.push(await transaction.get(db.collection('devices').where('imeiNormalized', '==', device.imei).limit(1)));
      legacyQueries.push(await transaction.get(db.collection('devices').where('imei', '==', device.imei).limit(1)));
    }
    receipt.devices.forEach((device, index) => {
      if (deviceSnaps[index].exists || registrySnaps[index].exists || !normalizedQueries[index].empty || !legacyQueries[index].empty) {
        throw new Error(`IMEI_ALREADY_EXISTS: ${device.imei}`);
      }
    });

    const now = new Date().toISOString();
    const nextSequence = Number(sequenceSnap.data()?.lastSequence || 0) + 1;
    const serverOrderCode = `PN-${branchCode}-${dateKey}-${String(nextSequence).padStart(4, '0')}`;
    const normalizedOrder = {
      ...receipt.order,
      code: serverOrderCode,
      branchId: receipt.branchId,
      branchName: receipt.order.branchName || '',
      warehouseId: receipt.warehouseId,
      warehouseName: warehouse.name || receipt.order.warehouseName || '',
      supplierId: receipt.supplierId,
      supplierName: supplierSnap.data()?.name || receipt.order.supplierName || '',
      fundId: receipt.paidAmount > 0 ? receipt.fundId : null,
      fundName: receipt.paidAmount > 0 ? fund.name || '' : null,
      totalAmount: receipt.totalAmount,
      subTotal: receipt.devices.reduce((sum, device) => sum + device.buyPrice, 0),
      discountAmount: receipt.adjustments.discountAmount,
      shippingFee: receipt.adjustments.shippingFee,
      vatAmount: receipt.adjustments.vatAmount,
      otherFees: receipt.adjustments.otherFees,
      costAllocationMethod: 'PROPORTIONAL_SUPPLIER_UNIT_PRICE',
      costAllocationVersion: 'PURCHASE_LANDED_COST_V1',
      allocatedDeviceCosts: receipt.devices.map(device => ({
        imei: device.imei,
        supplierUnitPrice: device.buyPrice,
        allocatedDiscountAmount: device.allocatedDiscountAmount,
        allocatedShippingFee: device.allocatedShippingFee,
        allocatedVatAmount: device.allocatedVatAmount,
        allocatedOtherFees: device.allocatedOtherFees,
        acquisitionCost: device.acquisitionCost
      })),
      paidAmount: receipt.paidAmount,
      debtAmount: receipt.debtAmount,
      paymentStatus: receipt.debtAmount <= 1 ? 'PAID' : receipt.paidAmount > 0 ? 'PARTIAL' : 'UNPAID',
      paymentAllocations: receipt.paidAmount > 0 ? [{
        id: `INITIAL_${receipt.order.id}`,
        fundId: receipt.fundId,
        fundName: fund.name || '',
        method: fund.type === 'CASH' ? 'CASH' : 'BANK_TRANSFER',
        amount: receipt.paidAmount,
        createdAt: now,
        createdByUid: actor.uid
      }] : [],
      totalQuantity: receipt.devices.length,
      receiptPayloadHash: receipt.payloadHash,
      inventoryPostingStatus: 'POSTED',
      createdAt: now,
      createdByUid: actor.uid,
      updatedAt: now
    };
    transaction.set(sequenceRef, {
      branchId: receipt.branchId,
      dateKey,
      lastSequence: nextSequence,
      updatedAt: now
    }, { merge: true });

    const createdDevices: any[] = [];
    receipt.devices.forEach((draft, index) => {
      const deviceId = `DEV_${imeiRegistryId(draft.imei).slice(0, 20).toUpperCase()}`;
      const device = {
        id: deviceId,
        imei: draft.imei,
        imeiNormalized: draft.imei,
        serialNo: draft.imei,
        model: draft.model,
        storage: draft.storage || '',
        color: draft.color || '',
        region: draft.region || '',
        batteryHealth: draft.batteryHealth || 100,
        condition: draft.condition || 'Like New 99%',
        buyPrice: draft.buyPrice,
        supplierUnitPrice: draft.buyPrice,
        acquisitionCost: draft.acquisitionCost,
        allocatedDiscountAmount: draft.allocatedDiscountAmount,
        allocatedShippingFee: draft.allocatedShippingFee,
        allocatedVatAmount: draft.allocatedVatAmount,
        allocatedOtherFees: draft.allocatedOtherFees,
        currentCost: draft.acquisitionCost,
        costVersion: 'PURCHASE_LANDED_COST_V1',
        costCalculatedAt: now,
        sellPrice: draft.sellPrice,
        status: 'in_stock',
        branchId: receipt.branchId,
        currentLocationId: receipt.warehouseId,
        warehouseId: receipt.warehouseId,
        warehouse: receipt.warehouseId,
        supplier: normalizedOrder.supplierName,
        supplierId: receipt.supplierId,
        receivedDate: receipt.order.orderDate || now.slice(0, 10),
        warrantyPeriodMonths: 12,
        icloudStatus: 'Chưa Check',
        screenStatus: 'Trầy Phẩy',
        notes: `Nhập từ phiếu ${serverOrderCode}`,
        inventorySourceType: 'PURCHASE_ORDER',
        inventorySourceId: receipt.order.id,
        stateVersion: 1,
        createdAt: now,
        updatedAt: now
      };
      transaction.set(db.collection('devices').doc(deviceId), device);
      transaction.set(db.collection('deviceFinancials').doc(deviceId), {
        deviceId,
        imei: draft.imei,
        branchId: receipt.branchId,
        supplierUnitPrice: draft.buyPrice,
        allocatedDiscountAmount: draft.allocatedDiscountAmount,
        allocatedShippingFee: draft.allocatedShippingFee,
        allocatedVatAmount: draft.allocatedVatAmount,
        allocatedOtherFees: draft.allocatedOtherFees,
        acquisitionCost: draft.acquisitionCost,
        technicalAddedCost: 0,
        currentCost: draft.acquisitionCost,
        costVersion: 'PURCHASE_LANDED_COST_V1',
        calculatedAt: now,
        createdAt: now,
        updatedAt: now
      });
      transaction.set(db.collection('deviceCostEvents').doc(`DCE_ACQ_${deviceId}`), {
        id: `DCE_ACQ_${deviceId}`,
        deviceId,
        imei: draft.imei,
        branchId: receipt.branchId,
        eventType: 'ACQUISITION',
        sourceType: 'PURCHASE_ORDER',
        sourceId: receipt.order.id,
        costBefore: 0,
        amount: draft.acquisitionCost,
        costAfter: draft.acquisitionCost,
        supplierUnitPrice: draft.buyPrice,
        allocatedDiscountAmount: draft.allocatedDiscountAmount,
        allocatedShippingFee: draft.allocatedShippingFee,
        allocatedVatAmount: draft.allocatedVatAmount,
        allocatedOtherFees: draft.allocatedOtherFees,
        costVersion: 'PURCHASE_LANDED_COST_V1',
        createdByUid: actor.uid,
        createdAt: now
      });
      transaction.set(db.collection('imeiRegistry').doc(imeiRegistryId(draft.imei)), {
        imei: draft.imei, deviceId, branchId: receipt.branchId, createdAt: now, createdByUid: actor.uid
      });
      transaction.set(db.collection('inventoryMovements').doc(`MOV_STOCK_IN_${receipt.order.id}_${index + 1}`), {
        id: `MOV_STOCK_IN_${receipt.order.id}_${index + 1}`,
        deviceId,
        imei: draft.imei,
        branchId: receipt.branchId,
        movementType: 'STOCK_RECEIPT',
        fromLocationId: null,
        toLocationId: receipt.warehouseId,
        sourceType: 'PURCHASE_ORDER',
        sourceId: receipt.order.id,
        performedByUid: actor.uid,
        occurredAt: now,
        createdAt: now
      });
      createdDevices.push(device);
    });

    const supplier = supplierSnap.data()!;
    const debtTransactions = [
      ...(receipt.paidAmount > 0 ? [{ id: `TX_PAY_${receipt.order.id}`, date: receipt.order.orderDate || now.slice(0, 10), type: 'PAYMENT', amount: receipt.paidAmount, note: `Thanh toán ngay phiếu nhập ${serverOrderCode}`, referenceId: receipt.order.id, referenceCode: serverOrderCode, referenceType: 'PURCHASE_ORDER', fundId: receipt.fundId }] : []),
      { id: `TX_BUY_${receipt.order.id}`, date: receipt.order.orderDate || now.slice(0, 10), type: 'DEBT_INCREASE', amount: receipt.totalAmount, note: `Nhập hàng phiếu ${serverOrderCode}`, referenceId: receipt.order.id, referenceCode: serverOrderCode, referenceType: 'PURCHASE_ORDER' },
      ...(Array.isArray(supplier.debtTransactions) ? supplier.debtTransactions : [])
    ];
    transaction.update(supplierRef, {
      outstandingDebt: Number(supplier.outstandingDebt || 0) + receipt.debtAmount,
      totalPurchasedFrom: Number(supplier.totalPurchasedFrom || 0) + receipt.totalAmount,
      debtTransactions,
      lastInteraction: now.slice(0, 10)
    });

    if (receipt.paidAmount > 0) {
      transaction.update(fundRef, {
        currentBalance: Number(fund.currentBalance || 0) - receipt.paidAmount,
        totalExpense: Number(fund.totalExpense || 0) + receipt.paidAmount,
        updatedAt: now
      });
      transaction.set(db.collection('cashTransactions').doc(`PURCHASE_PAYMENT_${receipt.order.id}`), {
        id: `PURCHASE_PAYMENT_${receipt.order.id}`,
        branchId: receipt.branchId,
        fundId: receipt.fundId,
        code: `PC-${serverOrderCode.replace(/^PN-/, '')}`,
        type: 'PAYMENT',
        category: 'INVENTORY_PURCHASE',
        categoryName: 'Chi nhập hàng nhà cung cấp',
        amount: receipt.paidAmount,
        fundType: fund.type,
        fundName: fund.name,
        date: now,
        partnerId: receipt.supplierId,
        partnerName: normalizedOrder.supplierName,
        partnerType: 'SUPPLIER',
        referenceId: receipt.order.id,
        referenceCode: serverOrderCode,
        purchaseOrderId: receipt.order.id,
        paymentAllocationId: `INITIAL_${receipt.order.id}`,
        creator: actor.name || actor.uid,
        notes: `Thanh toán phiếu nhập ${serverOrderCode}`,
        status: 'COMPLETED',
        isPLAccounted: false,
        createdAt: now,
        createdByUid: actor.uid
      });
    }

    transaction.set(orderRef, normalizedOrder);
    return { order: normalizedOrder, devices: createdDevices, importedCount: createdDevices.length };
  });
}

export async function processPayPurchaseOrderDebt(
  db: Firestore,
  orderId: string,
  input: { paymentAllocations: PurchasePaymentAllocationInput[]; note?: string; idempotencyKey: string },
  actor: InventoryActor
): Promise<{ order: any; paymentTransactionIds: string[]; idempotentReplay?: boolean }> {
  const normalizedOrderId = String(orderId || '').trim();
  const idempotencyKey = String(input?.idempotencyKey || '').trim();
  if (!normalizedOrderId) throw new Error('PURCHASE_ORDER_ID_REQUIRED');
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  if (!Array.isArray(input?.paymentAllocations) || input.paymentAllocations.length < 1 || input.paymentAllocations.length > 5) {
    throw new Error('PURCHASE_PAYMENT_ALLOCATIONS_REQUIRED');
  }
  const allocations = input.paymentAllocations.map((allocation, index) => ({
    id: `PPA_${crypto.createHash('sha256').update(`${idempotencyKey}:${index}`).digest('hex').slice(0, 20).toUpperCase()}`,
    fundId: String(allocation?.fundId || '').trim(),
    method: String(allocation?.method || '') as PurchasePaymentAllocationInput['method'],
    amount: Number(allocation?.amount)
  }));
  if (allocations.some(allocation => !allocation.fundId || !['CASH', 'BANK_TRANSFER'].includes(allocation.method) || !Number.isFinite(allocation.amount) || allocation.amount <= 0)) {
    throw new Error('PURCHASE_PAYMENT_ALLOCATION_INVALID');
  }
  if (new Set(allocations.map(allocation => allocation.fundId)).size !== allocations.length) {
    throw new Error('PURCHASE_PAYMENT_FUND_DUPLICATE');
  }
  const paymentAmount = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  const idempotencyId = crypto.createHash('sha256').update(`PURCHASE_PAYMENT:${normalizedOrderId}:${idempotencyKey}`).digest('hex');
  const idemRef = db.collection('purchasePaymentIdempotency').doc(idempotencyId);
  const orderRef = db.collection('purchaseOrders').doc(normalizedOrderId);

  return db.runTransaction(async transaction => {
    const idemSnap = await transaction.get(idemRef);
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) throw new Error('PURCHASE_ORDER_NOT_FOUND');
    if (idemSnap.exists) {
      return {
        order: { id: orderSnap.id, ...orderSnap.data() },
        paymentTransactionIds: idemSnap.data()?.paymentTransactionIds || [],
        idempotentReplay: true
      };
    }
    const order = orderSnap.data()!;
    const branchId = String(order.branchId || '');
    if (!canAccessBranch(actor, branchId)) throw new Error('PURCHASE_BRANCH_FORBIDDEN');
    if (order.status !== 'COMPLETED' || order.inventoryPostingStatus !== 'POSTED') throw new Error('PURCHASE_ORDER_NOT_PAYABLE');
    const currentDebt = Number(order.debtAmount || 0);
    if (!Number.isFinite(currentDebt) || paymentAmount > currentDebt + 1) throw new Error('PURCHASE_PAYMENT_EXCEEDS_DEBT');

    const supplierRef = db.collection('partners').doc(String(order.supplierId || ''));
    const supplierSnap = await transaction.get(supplierRef);
    if (!supplierSnap.exists) throw new Error('PURCHASE_SUPPLIER_NOT_FOUND');
    const fundSnapshots = new Map<string, any>();
    for (const allocation of allocations) {
      fundSnapshots.set(allocation.fundId, await transaction.get(db.collection('funds').doc(allocation.fundId)));
    }
    allocations.forEach(allocation => {
      const fundSnap = fundSnapshots.get(allocation.fundId);
      if (!fundSnap?.exists) throw new Error(`PURCHASE_FUND_NOT_FOUND: ${allocation.fundId}`);
      const fund = fundSnap.data();
      if (fund.isActive === false || fund.active === false || fund.isArchived === true) throw new Error(`PURCHASE_FUND_INACTIVE: ${allocation.fundId}`);
      if (String(fund.branchId || '') !== branchId) throw new Error(`PURCHASE_FUND_BRANCH_MISMATCH: ${allocation.fundId}`);
      const expectedType = allocation.method === 'CASH' ? 'CASH' : 'BANK';
      if (fund.type !== expectedType) throw new Error(`PURCHASE_FUND_TYPE_MISMATCH: ${allocation.fundId}`);
      if (Number(fund.currentBalance || 0) < allocation.amount) throw new Error(`INSUFFICIENT_FUNDS: ${allocation.fundId}`);
    });

    const now = new Date().toISOString();
    const nextPaidAmount = Number(order.paidAmount || 0) + paymentAmount;
    const nextDebtAmount = Math.max(0, Number(order.totalAmount || 0) - nextPaidAmount);
    const paymentTransactionIds: string[] = [];
    const paymentSnapshots = allocations.map((allocation, index) => {
      const fund = fundSnapshots.get(allocation.fundId).data();
      const transactionId = `PURCHASE_PAYMENT_${idempotencyId.slice(0, 20).toUpperCase()}_${index + 1}`;
      paymentTransactionIds.push(transactionId);
      transaction.update(db.collection('funds').doc(allocation.fundId), {
        currentBalance: Number(fund.currentBalance || 0) - allocation.amount,
        totalExpense: Number(fund.totalExpense || 0) + allocation.amount,
        updatedAt: now
      });
      transaction.set(db.collection('cashTransactions').doc(transactionId), {
        id: transactionId,
        branchId,
        fundId: allocation.fundId,
        code: `PC-${String(order.code || normalizedOrderId).replace(/^PN-/, '')}-${idempotencyId.slice(0, 6).toUpperCase()}-${index + 1}`,
        type: 'PAYMENT',
        category: 'SUPPLIER_DEBT_PAY',
        categoryName: 'Chi thanh toán công nợ nhà cung cấp',
        amount: allocation.amount,
        fundType: fund.type,
        fundName: fund.name,
        date: now,
        partnerId: order.supplierId,
        partnerName: order.supplierName,
        partnerType: 'SUPPLIER',
        purchaseOrderId: normalizedOrderId,
        referenceId: normalizedOrderId,
        referenceCode: order.code,
        paymentAllocationId: allocation.id,
        creator: actor.name || actor.uid,
        notes: String(input.note || `Thanh toán công nợ phiếu ${order.code || normalizedOrderId}`),
        status: 'COMPLETED',
        isPLAccounted: false,
        createdAt: now,
        createdByUid: actor.uid
      });
      return { ...allocation, fundName: fund.name || '', createdAt: now, createdByUid: actor.uid };
    });

    const supplier = supplierSnap.data()!;
    const supplierOutstandingDebt = Number(supplier.outstandingDebt || 0);
    if (!Number.isFinite(supplierOutstandingDebt) || supplierOutstandingDebt + 1 < paymentAmount) {
      throw new Error('PURCHASE_SUPPLIER_DEBT_MISMATCH');
    }
    const debtTransaction = {
      id: `TX_PAY_${idempotencyId.slice(0, 24).toUpperCase()}`,
      date: now.slice(0, 10),
      type: 'PAYMENT',
      amount: paymentAmount,
      note: String(input.note || `Thanh toán công nợ phiếu ${order.code || normalizedOrderId}`),
      referenceId: normalizedOrderId,
      referenceCode: order.code || normalizedOrderId,
      referenceType: 'PURCHASE_ORDER',
      paymentAllocationIds: allocations.map(allocation => allocation.id)
    };
    transaction.update(supplierRef, {
      outstandingDebt: Math.max(0, supplierOutstandingDebt - paymentAmount),
      debtTransactions: [debtTransaction, ...(Array.isArray(supplier.debtTransactions) ? supplier.debtTransactions : [])],
      lastInteraction: now.slice(0, 10)
    });
    const updatedOrder = {
      ...order,
      id: orderSnap.id,
      paidAmount: nextPaidAmount,
      debtAmount: nextDebtAmount,
      paymentStatus: nextDebtAmount <= 1 ? 'PAID' : 'PARTIAL',
      paymentAllocations: [...(Array.isArray(order.paymentAllocations) ? order.paymentAllocations : []), ...paymentSnapshots],
      updatedAt: now
    };
    transaction.update(orderRef, {
      paidAmount: updatedOrder.paidAmount,
      debtAmount: updatedOrder.debtAmount,
      paymentStatus: updatedOrder.paymentStatus,
      paymentAllocations: updatedOrder.paymentAllocations,
      updatedAt: now
    });
    transaction.set(idemRef, { orderId: normalizedOrderId, paymentTransactionIds, paymentAmount, createdAt: now });
    return { order: updatedOrder, paymentTransactionIds };
  });
}

export async function processCancelPurchaseOrderReceipt(
  db: Firestore,
  orderId: string,
  actor: InventoryActor,
  reason = ''
): Promise<{ order: any; removedDeviceIds: string[]; idempotentReplay?: boolean }> {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) throw new Error('PURCHASE_ORDER_ID_REQUIRED');
  const orderRef = db.collection('purchaseOrders').doc(normalizedOrderId);

  return db.runTransaction(async transaction => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) throw new Error('PURCHASE_ORDER_NOT_FOUND');
    const order = orderSnap.data()!;
    const branchId = String(order.branchId || '').trim();
    if (!canAccessBranch(actor, branchId)) throw new Error('PURCHASE_BRANCH_FORBIDDEN');
    if (order.status === 'CANCELLED' && order.inventoryPostingStatus === 'REVERSED') {
      return { order: { id: orderSnap.id, ...order }, removedDeviceIds: [], idempotentReplay: true };
    }
    if (Array.isArray(order.debtSettlementIds) && order.debtSettlementIds.length > 0) {
      throw new Error('PURCHASE_CANCEL_HAS_PARTNER_DEBT_SETTLEMENT');
    }

    const devicesSnap = await transaction.get(db.collection('devices').where('inventorySourceId', '==', normalizedOrderId));
    const movementsSnap = await transaction.get(db.collection('inventoryMovements').where('sourceId', '==', normalizedOrderId));
    const paymentTransactionsByOrderSnap = await transaction.get(db.collection('cashTransactions').where('purchaseOrderId', '==', normalizedOrderId));
    const legacyPaymentsSnap = paymentTransactionsByOrderSnap.empty
      ? await transaction.get(db.collection('cashTransactions').where('referenceCode', '==', String(order.code || normalizedOrderId)))
      : null;
    const activePaymentDocs = (paymentTransactionsByOrderSnap.empty ? legacyPaymentsSnap?.docs || [] : paymentTransactionsByOrderSnap.docs)
      .filter(doc => doc.data().status !== 'CANCELLED');
    const supplierRef = order.supplierId ? db.collection('partners').doc(String(order.supplierId)) : null;
    const supplierSnap: any = supplierRef ? await transaction.get(supplierRef) : null;
    const refundByFund = new Map<string, number>();
    activePaymentDocs.forEach(paymentDoc => {
      const fundId = String(paymentDoc.data()?.fundId || '');
      if (fundId) refundByFund.set(fundId, (refundByFund.get(fundId) || 0) + Number(paymentDoc.data()?.amount || 0));
    });
    const fundSnapshots = new Map<string, any>();
    for (const fundId of refundByFund.keys()) {
      fundSnapshots.set(fundId, await transaction.get(db.collection('funds').doc(fundId)));
    }

    const lifecycleMovements = new Map<string, any>();
    const lifecycleCostEvents = new Map<string, any>();
    for (const deviceDoc of devicesSnap.docs) {
      lifecycleMovements.set(deviceDoc.id, await transaction.get(db.collection('inventoryMovements').where('deviceId', '==', deviceDoc.id)));
      lifecycleCostEvents.set(deviceDoc.id, await transaction.get(db.collection('deviceCostEvents').where('deviceId', '==', deviceDoc.id)));
    }

    const warehouseId = String(order.warehouseId || '');
    for (const deviceDoc of devicesSnap.docs) {
      const device = deviceDoc.data();
      assertPurchaseDeviceCanBeCancelled(
        { id: deviceDoc.id, ...device },
        warehouseId,
        normalizedOrderId,
        (lifecycleMovements.get(deviceDoc.id)?.docs || []).map((item: any) => item.data()),
        (lifecycleCostEvents.get(deviceDoc.id)?.docs || []).map((item: any) => item.data())
      );
    }
    if ([...fundSnapshots.values()].some(snapshot => !snapshot.exists)) {
      throw new Error('PURCHASE_CANCEL_FINANCE_LINK_MISSING');
    }

    const now = new Date().toISOString();
    const removedDeviceIds: string[] = [];
    for (const deviceDoc of devicesSnap.docs) {
      const device = deviceDoc.data();
      transaction.delete(deviceDoc.ref);
      transaction.delete(db.collection('deviceFinancials').doc(deviceDoc.id));
      if (device.imei) transaction.delete(db.collection('imeiRegistry').doc(imeiRegistryId(device.imei)));
      transaction.set(db.collection('deviceCostEvents').doc(`DCE_REV_${normalizedOrderId}_${deviceDoc.id}`), {
        id: `DCE_REV_${normalizedOrderId}_${deviceDoc.id}`,
        deviceId: deviceDoc.id,
        imei: device.imei,
        branchId,
        eventType: 'REVERSAL',
        sourceType: 'PURCHASE_ORDER',
        sourceId: normalizedOrderId,
        reversalOf: `DCE_ACQ_${deviceDoc.id}`,
        costBefore: Number(device.currentCost ?? device.buyPrice ?? 0),
        amount: -Number(device.currentCost ?? device.buyPrice ?? 0),
        costAfter: 0,
        createdByUid: actor.uid,
        createdAt: now
      });
      removedDeviceIds.push(deviceDoc.id);
    }
    movementsSnap.docs.forEach(movementDoc => transaction.update(movementDoc.ref, {
      movementType: 'STOCK_RECEIPT_CANCELLED',
      reversed: true,
      reversedAt: now,
      reversedByUid: actor.uid,
      reversalReason: reason || 'Hủy phiếu nhập hàng'
    }));

    if (supplierRef && supplierSnap?.exists) {
      const supplier = supplierSnap.data();
      const orderDebt = Number(order.debtAmount || 0);
      const supplierOutstandingDebt = Number(supplier.outstandingDebt || 0);
      if (!Number.isFinite(supplierOutstandingDebt) || supplierOutstandingDebt + 1 < orderDebt) {
        throw new Error('PURCHASE_CANCEL_SUPPLIER_DEBT_MISMATCH');
      }
      const referenceIds = new Set([normalizedOrderId, String(order.code || '')]);
      transaction.update(supplierRef, {
        outstandingDebt: Math.max(0, supplierOutstandingDebt - orderDebt),
        totalPurchasedFrom: Math.max(0, Number(supplier.totalPurchasedFrom || 0) - Number(order.totalAmount || 0)),
        debtTransactions: (Array.isArray(supplier.debtTransactions) ? supplier.debtTransactions : []).filter((item: any) => !referenceIds.has(String(item.referenceId || ''))),
        lastInteraction: now.slice(0, 10)
      });
    }
    for (const [fundId, refundAmount] of refundByFund) {
      const fundSnap = fundSnapshots.get(fundId);
      const fund = fundSnap.data();
      transaction.update(db.collection('funds').doc(fundId), {
        currentBalance: Number(fund.currentBalance || 0) + refundAmount,
        totalExpense: Math.max(0, Number(fund.totalExpense || 0) - refundAmount),
        updatedAt: now
      });
    }
    activePaymentDocs.forEach(paymentDoc => transaction.update(paymentDoc.ref, {
      status: 'CANCELLED',
      cancelledAt: now,
      cancelledByUid: actor.uid,
      cancellationReason: reason || 'Hủy phiếu nhập hàng'
    }));

    const cancelledOrder = {
      ...order,
      id: orderSnap.id,
      status: 'CANCELLED',
      inventoryPostingStatus: 'REVERSED',
      cancelledAt: now,
      cancelledByUid: actor.uid,
      cancellationReason: reason || 'Hủy phiếu nhập hàng',
      updatedAt: now
    };
    transaction.update(orderRef, {
      status: 'CANCELLED',
      inventoryPostingStatus: 'REVERSED',
      cancelledAt: now,
      cancelledByUid: actor.uid,
      cancellationReason: reason || 'Hủy phiếu nhập hàng',
      updatedAt: now
    });
    return { order: cancelledOrder, removedDeviceIds };
  });
}
