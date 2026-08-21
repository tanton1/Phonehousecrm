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
  devices: ReceiptDeviceDraft[];
  payloadHash: string;
}

function canAccessBranch(actor: InventoryActor, branchId: string): boolean {
  const role = String(actor.role || '').toUpperCase();
  return role === 'ADMIN' || role === 'REGIONAL_MANAGER' || actor.branchId === branchId || (actor.assignedBranchIds || []).includes(branchId);
}

export function validatePurchaseReceiptInput(input: any, actor: InventoryActor): ValidatedPurchaseReceipt {
  const order = input?.order || input;
  const branchId = String(order?.branchId || '').trim();
  const warehouseId = String(order?.warehouseId || '').trim();
  const supplierId = String(order?.supplierId || '').trim();
  const fundId = String(order?.fundId || '').trim();
  if (!order?.id || !order?.code) throw new Error('PURCHASE_ORDER_ID_REQUIRED');
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

  const devices: ReceiptDeviceDraft[] = [];
  if (!Array.isArray(order.items) || order.items.length === 0) throw new Error('PURCHASE_ITEMS_REQUIRED');
  for (const item of order.items) {
    if (item.type !== 'device') throw new Error('PURCHASE_ITEM_TYPE_UNSUPPORTED');
    const imeis = Array.isArray(item.imeiList) ? item.imeiList.map(normalizeImei).filter(Boolean) : [];
    if (imeis.length !== Number(item.quantity || 0)) throw new Error('PURCHASE_ITEM_QUANTITY_MISMATCH');
    for (const imei of imeis) {
      devices.push({
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
  if (devices.length === 0 || devices.length > 100) throw new Error('PURCHASE_DEVICE_COUNT_INVALID');
  if (devices.some(device => !/^\d{15}$/.test(device.imei))) throw new Error('IMEI_INVALID: IMEI phải gồm đúng 15 chữ số.');
  if (new Set(devices.map(device => device.imei)).size !== devices.length) throw new Error('DUPLICATE_IMEI_IN_REQUEST');
  if (devices.some(device => !device.model || !Number.isFinite(device.buyPrice) || device.buyPrice < 0)) throw new Error('PURCHASE_DEVICE_DATA_INVALID');
  const calculatedTotal = devices.reduce((sum, device) => sum + device.buyPrice, 0);
  if (Math.abs(calculatedTotal - Number(order.subTotal ?? calculatedTotal)) > 1) throw new Error('PURCHASE_ITEM_TOTAL_MISMATCH');

  const payloadHash = crypto.createHash('sha256').update(JSON.stringify({
    id: order.id, code: order.code, branchId, warehouseId, supplierId, fundId,
    totalAmount, paidAmount, debtAmount,
    devices: devices.map(device => ({ imei: device.imei, model: device.model, buyPrice: device.buyPrice }))
  })).digest('hex');
  return { order, branchId, warehouseId, supplierId, fundId, totalAmount, paidAmount, debtAmount, devices, payloadHash };
}

export async function processPurchaseOrderReceipt(db: Firestore, input: any, actor: InventoryActor): Promise<{
  order: any;
  devices: any[];
  importedCount: number;
  idempotentReplay?: boolean;
}> {
  const receipt = validatePurchaseReceiptInput(input, actor);
  const orderRef = db.collection('purchaseOrders').doc(String(receipt.order.id));

  return db.runTransaction(async transaction => {
    const orderSnap = await transaction.get(orderRef);
    if (orderSnap.exists) {
      if (orderSnap.data()?.receiptPayloadHash !== receipt.payloadHash) throw new Error('PURCHASE_ORDER_ALREADY_EXISTS');
      return { order: { id: orderSnap.id, ...orderSnap.data() }, devices: [], importedCount: Number(orderSnap.data()?.totalQuantity || 0), idempotentReplay: true };
    }

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
    const normalizedOrder = {
      ...receipt.order,
      branchId: receipt.branchId,
      branchName: receipt.order.branchName || '',
      warehouseId: receipt.warehouseId,
      warehouseName: warehouse.name || receipt.order.warehouseName || '',
      supplierId: receipt.supplierId,
      supplierName: supplierSnap.data()?.name || receipt.order.supplierName || '',
      fundId: receipt.paidAmount > 0 ? receipt.fundId : null,
      fundName: receipt.paidAmount > 0 ? fund.name || '' : null,
      totalAmount: receipt.totalAmount,
      paidAmount: receipt.paidAmount,
      debtAmount: receipt.debtAmount,
      totalQuantity: receipt.devices.length,
      receiptPayloadHash: receipt.payloadHash,
      inventoryPostingStatus: 'POSTED',
      createdAt: now,
      createdByUid: actor.uid,
      updatedAt: now
    };

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
        currentCost: draft.buyPrice,
        costVersion: 'PURCHASE_ORDER_V1',
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
        notes: `Nhập từ phiếu ${receipt.order.code}`,
        inventorySourceType: 'PURCHASE_ORDER',
        inventorySourceId: receipt.order.id,
        stateVersion: 1,
        createdAt: now,
        updatedAt: now
      };
      transaction.set(db.collection('devices').doc(deviceId), device);
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
      ...(receipt.paidAmount > 0 ? [{ id: `TX_PAY_${receipt.order.id}`, date: receipt.order.orderDate || now.slice(0, 10), type: 'PAYMENT', amount: receipt.paidAmount, note: `Thanh toán ngay phiếu nhập ${receipt.order.code}`, referenceId: receipt.order.id }] : []),
      { id: `TX_BUY_${receipt.order.id}`, date: receipt.order.orderDate || now.slice(0, 10), type: 'DEBT_INCREASE', amount: receipt.totalAmount, note: `Nhập hàng phiếu ${receipt.order.code}`, referenceId: receipt.order.id },
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
        code: `PC-${String(receipt.order.code).replace(/^PN-/, '')}`,
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
        referenceCode: receipt.order.code,
        creator: actor.name || actor.uid,
        notes: `Thanh toán phiếu nhập ${receipt.order.code}`,
        status: 'COMPLETED',
        isPLAccounted: true,
        createdAt: now,
        createdByUid: actor.uid
      });
    }

    transaction.set(orderRef, normalizedOrder);
    return { order: normalizedOrder, devices: createdDevices, importedCount: createdDevices.length };
  });
}
