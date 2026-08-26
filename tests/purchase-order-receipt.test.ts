import { describe, expect, it } from 'vitest';
import { allocatePurchaseLandedCosts, assertPurchaseDeviceCanBeCancelled, processCancelPurchaseOrderReceipt, processPayPurchaseOrderDebt, processPurchaseOrderReceipt, validatePurchaseReceiptInput } from '../server/services/purchaseOrderReceiptService';
import { imeiRegistryId } from '../server/services/inventoryDeviceService';

const actor = { uid: 'ADMIN_01', name: 'Admin', role: 'ADMIN', branchId: 'CN01' };

function validOrder(overrides: Record<string, any> = {}) {
  return {
    id: 'PO_01', code: 'PN-000001', branchId: 'CN01', warehouseId: 'KHO_CN01',
    supplierId: 'SUP_01', fundId: 'FUND_CN01', status: 'COMPLETED', paymentMethod: 'Tiền mặt tại két',
    totalAmount: 20_000_000, subTotal: 20_000_000, paidAmount: 20_000_000, debtAmount: 0,
    items: [{ id: 'ITEM_01', type: 'device', modelOrName: 'iPhone 15 Pro', quantity: 1,
      importPrice: 20_000_000, expectedSellPrice: 22_000_000, totalAmount: 20_000_000,
      imeiList: ['356789012345678'] }],
    ...overrides
  };
}

describe('Atomic supplier purchase receipt validation', () => {
  it('requires one concrete warehouse instead of a system-wide fallback', () => {
    expect(() => validatePurchaseReceiptInput({ order: validOrder({ warehouseId: 'ALL' }) }, actor)).toThrow('PURCHASE_WAREHOUSE_REQUIRED');
    expect(() => validatePurchaseReceiptInput({ order: validOrder({ warehouseId: 'KHO_TONG' }) }, actor)).toThrow('PURCHASE_WAREHOUSE_REQUIRED');
  });

  it('requires a fund whenever money is paid immediately', () => {
    expect(() => validatePurchaseReceiptInput({ order: validOrder({ fundId: '' }) }, actor)).toThrow('PURCHASE_FUND_REQUIRED');
  });

  it('allows a fully unpaid supplier debt receipt without a cashbook account', () => {
    const receipt = validatePurchaseReceiptInput({ order: validOrder({ fundId: '', paidAmount: 0, debtAmount: 20_000_000, paymentMethod: 'Ghi nhận công nợ NCC' }) }, actor);
    expect(receipt).toMatchObject({ branchId: 'CN01', warehouseId: 'KHO_CN01', fundId: '', paidAmount: 0, debtAmount: 20_000_000 });
    expect(receipt.devices[0].imei).toBe('356789012345678');
  });

  it('rejects duplicate IMEIs before starting a database transaction', () => {
    const item = validOrder().items[0];
    expect(() => validatePurchaseReceiptInput({ order: validOrder({
      items: [{ ...item, quantity: 2, imeiList: ['356789012345678', '356789012345678'] }],
      totalAmount: 40_000_000, subTotal: 40_000_000, paidAmount: 40_000_000
    }) }, actor)).toThrow('DUPLICATE_IMEI_IN_REQUEST');
  });

  it('accepts catalog-linked parts and accessories as quantity-based receipt lines', () => {
    const receipt = validatePurchaseReceiptInput({ order: validOrder({
      totalAmount: 800_000,
      subTotal: 800_000,
      paidAmount: 800_000,
      items: [{
        id: 'ITEM_PART', type: 'product', catalogItemId: 'CAT_PIN_IP15PM', catalogCategory: 'PART',
        sku: 'PIN-IP15PM-PIS', modelOrName: 'Pin iPhone 15 Pro Max Pisen', quantity: 2,
        importPrice: 400_000, expectedSellPrice: 600_000, totalAmount: 800_000
      }]
    }) }, actor);
    expect(receipt.devices).toHaveLength(0);
    expect(receipt.stockItems[0]).toMatchObject({ catalogItemId: 'CAT_PIN_IP15PM', category: 'PART', quantity: 2, unitCost: 400_000 });
  });

  it('rejects a quantity item unless it is linked to a part or accessory master', () => {
    expect(() => validatePurchaseReceiptInput({ order: validOrder({
      totalAmount: 100, subTotal: 100, paidAmount: 100,
      items: [{ id: 'ITEM_BAD', type: 'product', modelOrName: 'Hàng không rõ', quantity: 1, importPrice: 100, totalAmount: 100 }]
    }) }, actor)).toThrow('PURCHASE_STOCK_ITEM_CATALOG_REQUIRED');
  });

  it('accepts numeric IMEI/serial identifiers from 5 through 15 digits', () => {
    const shortItem = { ...validOrder().items[0], imeiList: ['12345'] };
    expect(validatePurchaseReceiptInput({ order: validOrder({ items: [shortItem] }) }, actor).devices[0].imei).toBe('12345');
    expect(() => validatePurchaseReceiptInput({ order: validOrder({ items: [{ ...shortItem, imeiList: ['1234'] }] }) }, actor)).toThrow('IMEI_INVALID');
    expect(() => validatePurchaseReceiptInput({ order: validOrder({ items: [{ ...shortItem, imeiList: ['1234567890123456'] }] }) }, actor)).toThrow('IMEI_INVALID');
  });

  it('normalizes harmless floating-point artifacts in the suggested retail price', () => {
    const item = validOrder().items[0];
    const receipt = validatePurchaseReceiptInput({ order: validOrder({
      totalAmount: 6_200,
      subTotal: 6_200,
      paidAmount: 6_200,
      debtAmount: 0,
      items: [{ ...item, importPrice: 6_200, expectedSellPrice: 6_200 * 1.1, totalAmount: 6_200 }]
    }) }, actor);

    expect(receipt.devices[0]).toMatchObject({ buyPrice: 6_200, sellPrice: 6_820 });
  });

  it('preserves optional Product Master references for each received device', () => {
    const receipt = validatePurchaseReceiptInput({ order: validOrder({
      items: [{
        ...validOrder().items[0],
        catalogItemId: 'CAT_IP15PM_256_NAT',
        catalogModelId: 'MODEL_IP15PM',
        catalogModelCode: 'IP15PM',
        productFamilyCode: 'IPHONE',
        catalogGroupCode: 'PHONE_USED'
      }]
    }) }, actor);

    expect(receipt.devices[0]).toMatchObject({
      catalogItemId: 'CAT_IP15PM_256_NAT',
      catalogModelId: 'MODEL_IP15PM',
      catalogModelCode: 'IP15PM',
      productFamilyCode: 'IPHONE',
      catalogGroupCode: 'PHONE_USED'
    });
  });

  it('persists Product Master references from the purchase order onto the created device', async () => {
    type Ref = { kind: 'ref'; col: string; id: string };
    type Query = { kind: 'query' };
    const data = new Map<string, any>();
    const ref = (col: string, id: string): Ref => ({ kind: 'ref', col, id });
    const snap = (target: Ref) => ({ id: target.id, ref: target, exists: data.has(`${target.col}/${target.id}`), data: () => data.get(`${target.col}/${target.id}`) });
    const db: any = {
      collection: (col: string) => ({
        doc: (id: string) => ref(col, id),
        where: () => ({ kind: 'query', limit: () => ({ kind: 'query' } as Query) } as Query & { limit: () => Query })
      }),
      runTransaction: async (callback: any) => callback({
        get: async (target: Ref | Query) => target.kind === 'query' ? { empty: true, docs: [] } : snap(target),
        set: (target: Ref, value: any, options?: { merge?: boolean }) => {
          const key = `${target.col}/${target.id}`;
          data.set(key, options?.merge ? { ...data.get(key), ...value } : { ...value });
        },
        update: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...data.get(`${target.col}/${target.id}`), ...value })
      })
    };
    data.set('warehouses/KHO_CN01', { id: 'KHO_CN01', branchId: 'CN01', name: 'Kho CN01', isActive: true });
    data.set('partners/SUP_01', { id: 'SUP_01', branchId: 'CN01', type: 'SUPPLIER', name: 'NCC 01', phone: '0905000001', outstandingDebt: 0, totalPurchasedFrom: 0, debtTransactions: [] });
    data.set('funds/FUND_CN01', { id: 'FUND_CN01', name: 'Tiền mặt CN01', branchId: 'CN01', type: 'CASH', currentBalance: 30_000_000, totalExpense: 0, isActive: true });

    await processPurchaseOrderReceipt(db, {
      order: validOrder({
        items: [{
          ...validOrder().items[0],
          catalogItemId: 'CAT_IP15PM_256_NAT',
          catalogModelId: 'MODEL_IP15PM',
          catalogModelCode: 'IP15PM',
          productFamilyCode: 'IPHONE',
          catalogGroupCode: 'PHONE_USED'
        }]
      })
    }, actor);

    const createdDevice = [...data.entries()].find(([key]) => key.startsWith('devices/'))?.[1];
    expect(createdDevice).toMatchObject({
      catalogItemId: 'CAT_IP15PM_256_NAT',
      catalogModelId: 'MODEL_IP15PM',
      catalogModelCode: 'IP15PM',
      productFamilyCode: 'IPHONE',
      catalogGroupCode: 'PHONE_USED',
      model: 'iPhone 15 Pro'
    });
    expect(data.get('purchaseOrders/PO_01').items[0]).toMatchObject({ catalogItemId: 'CAT_IP15PM_256_NAT', catalogModelCode: 'IP15PM' });
  });

  it('posts a part receipt with its purchase order, supplier ledger and part lot in one transaction', async () => {
    type Ref = { kind: 'ref'; col: string; id: string };
    type Query = { kind: 'query' };
    const data = new Map<string, any>();
    const ref = (col: string, id: string): Ref => ({ kind: 'ref', col, id });
    const snap = (target: Ref) => ({ id: target.id, ref: target, exists: data.has(`${target.col}/${target.id}`), data: () => data.get(`${target.col}/${target.id}`) });
    const db: any = {
      collection: (col: string) => ({
        doc: (id: string) => ref(col, id),
        where: () => ({ kind: 'query', limit: () => ({ kind: 'query' } as Query) } as Query & { limit: () => Query })
      }),
      runTransaction: async (callback: any) => callback({
        get: async (target: Ref | Query) => target.kind === 'query' ? { empty: true, docs: [] } : snap(target),
        set: (target: Ref, value: any, options?: { merge?: boolean }) => {
          const key = `${target.col}/${target.id}`;
          data.set(key, options?.merge ? { ...data.get(key), ...value } : { ...value });
        },
        update: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...data.get(`${target.col}/${target.id}`), ...value })
      })
    };
    data.set('warehouses/KHO_CN01', { id: 'KHO_CN01', branchId: 'CN01', name: 'Kho tổng CN01', isActive: true, type: 'CENTRAL' });
    data.set('partners/SUP_01', { id: 'SUP_01', branchId: 'CN01', type: 'SUPPLIER', name: 'NCC 01', phone: '0905000001', outstandingDebt: 0, totalPurchasedFrom: 0, debtTransactions: [] });
    data.set('funds/FUND_CN01', { id: 'FUND_CN01', name: 'Tiền mặt CN01', branchId: 'CN01', type: 'CASH', currentBalance: 1_000_000, totalExpense: 0, isActive: true });
    data.set('catalogItems/CAT_PIN_IP15PM', { id: 'CAT_PIN_IP15PM', sku: 'PIN-IP15PM-PIS', name: 'Pin iPhone 15 Pro Max Pisen', category: 'PART', catalogGroupCode: 'PIN', compatibleModels: ['iPhone 15 Pro Max'], defaultImportPrice: 400_000 });

    const order = validOrder({
      id: 'PO_PART_01', totalAmount: 800_000, subTotal: 800_000, paidAmount: 800_000, debtAmount: 0,
      items: [{ id: 'PART_LINE', type: 'product', catalogItemId: 'CAT_PIN_IP15PM', catalogCategory: 'PART', sku: 'PIN-IP15PM-PIS', modelOrName: 'Pin iPhone 15 Pro Max Pisen', quantity: 2, importPrice: 400_000, expectedSellPrice: 600_000, totalAmount: 800_000 }]
    });
    const result = await processPurchaseOrderReceipt(db, { order }, actor);
    expect(result).toMatchObject({ importedCount: 2, stockItemCount: 2 });
    expect([...data.entries()].find(([key]) => key.startsWith('spareParts/'))?.[1]).toMatchObject({ stockQuantity: 2, sku: 'PIN-IP15PM-PIS', category: 'PIN' });
    expect([...data.entries()].find(([key]) => key.startsWith('sparePartLots/'))?.[1]).toMatchObject({ stockQuantity: 2, unitCost: 400_000 });
    expect(data.get('purchaseOrders/PO_PART_01')).toMatchObject({ receiptKind: 'STOCK_ITEM', inventoryPostingStatus: 'POSTED', totalQuantity: 2 });
    expect(data.get('partners/SUP_01')).toMatchObject({ totalPurchasedFrom: 800_000 });
    expect([...data.entries()].find(([key]) => key.startsWith('branchPartyAccounts/'))?.[1]).toMatchObject({
      branchId: 'CN01', type: 'SUPPLIER', payableBalance: 0, totalPurchases: 800_000
    });
    expect(data.get('debtLedgerEntries/DLE_PO_PO_PART_01_PURCHASE')).toMatchObject({ debitIncrease: 800_000, direction: 'PAYABLE' });
    expect(data.get('debtLedgerEntries/DLE_PO_PO_PART_01_INITIAL_PAYMENT')).toMatchObject({ creditDecrease: 800_000, direction: 'PAYABLE' });
  });

  it('rejects a total that does not equal IMEI cost minus discount plus fees', () => {
    expect(() => validatePurchaseReceiptInput({ order: validOrder({
      totalAmount: 1,
      paidAmount: 1,
      debtAmount: 0
    }) }, actor)).toThrow('PURCHASE_TOTAL_MISMATCH');
    const validAdjusted = validatePurchaseReceiptInput({ order: validOrder({
      discountAmount: 1_000_000,
      shippingFee: 500_000,
      totalAmount: 19_500_000,
      paidAmount: 19_500_000,
      debtAmount: 0
    }) }, actor);
    expect(validAdjusted.totalAmount).toBe(19_500_000);
    expect(validAdjusted.devices[0]).toMatchObject({
      buyPrice: 20_000_000,
      allocatedDiscountAmount: 1_000_000,
      allocatedShippingFee: 500_000,
      acquisitionCost: 19_500_000
    });
  });

  it('allocates every landed-cost component to IMEIs and preserves the exact order total', () => {
    const allocations = allocatePurchaseLandedCosts([
      { imei: '12345', buyPrice: 10_000_000 },
      { imei: '12346', buyPrice: 20_000_000 },
      { imei: '12347', buyPrice: 30_000_000 }
    ], {
      discountAmount: 3_000_001,
      shippingFee: 1_000_001,
      vatAmount: 600_001,
      otherFees: 300_001
    });
    expect(allocations.reduce((sum, item) => sum + item.discountAmount, 0)).toBe(3_000_001);
    expect(allocations.reduce((sum, item) => sum + item.shippingFee, 0)).toBe(1_000_001);
    expect(allocations.reduce((sum, item) => sum + item.vatAmount, 0)).toBe(600_001);
    expect(allocations.reduce((sum, item) => sum + item.otherFees, 0)).toBe(300_001);
    expect(allocations.reduce((sum, item) => sum + item.acquisitionCost, 0)).toBe(58_900_002);
    expect(allocations.map(item => item.supplierUnitPrice)).toEqual([10_000_000, 20_000_000, 30_000_000]);
  });

  it('shares landed fees deterministically when all supplier unit prices are zero', () => {
    const allocations = allocatePurchaseLandedCosts([
      { imei: '12345', buyPrice: 0 },
      { imei: '12346', buyPrice: 0 }
    ], { discountAmount: 0, shippingFee: 101, vatAmount: 0, otherFees: 0 });
    expect(allocations.map(item => item.acquisitionCost)).toEqual([51, 50]);
  });
});

describe('Purchase receipt cancellation rollback', () => {
  it('does not delete an IMEI that returned to its original warehouse after technical or transfer activity', () => {
    const device = {
      id: 'DEV_01', imei: '12345', status: 'in_stock', currentLocationId: 'KHO_CN01',
      acquisitionCost: 10_000_000, currentCost: 10_000_000, costVersion: 'PURCHASE_LANDED_COST_V1'
    };
    const receiptMovement = { movementType: 'STOCK_RECEIPT', sourceType: 'PURCHASE_ORDER', sourceId: 'PO_01' };
    expect(() => assertPurchaseDeviceCanBeCancelled(device, 'KHO_CN01', 'PO_01', [receiptMovement], [
      { eventType: 'ACQUISITION', sourceType: 'PURCHASE_ORDER', sourceId: 'PO_01' }
    ])).not.toThrow();
    expect(() => assertPurchaseDeviceCanBeCancelled(device, 'KHO_CN01', 'PO_01', [receiptMovement, {
      movementType: 'TECHNICAL_RETURN', sourceType: 'TECHNICAL_WORK_ORDER', sourceId: 'WO_01'
    }], [])).toThrow('PURCHASE_CANCEL_DEVICE_HAS_LIFECYCLE');
    expect(() => assertPurchaseDeviceCanBeCancelled({ ...device, currentCost: 10_500_000 }, 'KHO_CN01', 'PO_01', [receiptMovement], [])).toThrow('PURCHASE_CANCEL_DEVICE_HAS_LIFECYCLE');
  });

  it('removes untouched received devices and reverses supplier/fund ledgers atomically', async () => {
    type Ref = { kind: 'ref'; col: string; id: string };
    type Query = { kind: 'query'; col: string; field: string; value: unknown };
    const data = new Map<string, any>();
    const seed: Record<string, Record<string, any>> = {
      purchaseOrders: { PO_01: { ...validOrder(), inventoryPostingStatus: 'POSTED' } },
      devices: { DEV_01: { id: 'DEV_01', imei: '12345', status: 'in_stock', currentLocationId: 'KHO_CN01', inventorySourceId: 'PO_01' } },
      imeiRegistry: { [imeiRegistryId('12345')]: { imei: '12345', deviceId: 'DEV_01' } },
      inventoryMovements: { MOV_01: { id: 'MOV_01', sourceId: 'PO_01', movementType: 'STOCK_RECEIPT' } },
      partners: { SUP_01: { id: 'SUP_01', branchId: 'CN01', type: 'SUPPLIER', name: 'NCC 01', phone: '0905000001', outstandingDebt: 0, totalPurchasedFrom: 20_000_000, debtTransactions: [{ referenceId: 'PO_01' }] } },
      funds: {
        FUND_CN01: { id: 'FUND_CN01', currentBalance: 95_000_000, totalExpense: 5_000_000 },
        BANK_CN01: { id: 'BANK_CN01', currentBalance: 85_000_000, totalExpense: 15_000_000 }
      },
      cashTransactions: {
        PAY_01: { id: 'PAY_01', referenceCode: 'PN-000001', fundId: 'FUND_CN01', amount: 5_000_000, status: 'COMPLETED' },
        PAY_02: { id: 'PAY_02', referenceCode: 'PN-000001', fundId: 'BANK_CN01', amount: 15_000_000, status: 'COMPLETED' }
      }
    };
    Object.entries(seed).forEach(([collection, docs]) => Object.entries(docs).forEach(([id, value]) => data.set(`${collection}/${id}`, { ...value })));
    const ref = (col: string, id: string): Ref => ({ kind: 'ref', col, id });
    const snap = (target: Ref) => ({ id: target.id, ref: target, exists: data.has(`${target.col}/${target.id}`), data: () => data.get(`${target.col}/${target.id}`) });
    const querySnap = (target: Query) => {
      const docs = [...data.entries()].filter(([key, value]) => key.startsWith(`${target.col}/`) && value?.[target.field] === target.value).map(([key]) => snap(ref(target.col, key.slice(target.col.length + 1))));
      return { docs, empty: docs.length === 0 };
    };
    const db: any = {
      collection: (col: string) => ({
        doc: (id: string) => ref(col, id),
        where: (field: string, _operator: string, value: unknown) => ({ kind: 'query', col, field, value } as Query)
      }),
      runTransaction: async (callback: any) => callback({
        get: async (target: Ref | Query) => target.kind === 'query' ? querySnap(target) : snap(target),
        set: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...value }),
        update: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...data.get(`${target.col}/${target.id}`), ...value }),
        delete: (target: Ref) => data.delete(`${target.col}/${target.id}`)
      })
    };

    const result = await processCancelPurchaseOrderReceipt(db, 'PO_01', actor, 'Nhập nhầm');
    expect(result.removedDeviceIds).toEqual(['DEV_01']);
    expect(data.has('devices/DEV_01')).toBe(false);
    expect(data.has(`imeiRegistry/${imeiRegistryId('12345')}`)).toBe(false);
    expect(data.get('inventoryMovements/MOV_01')).toMatchObject({ movementType: 'STOCK_RECEIPT_CANCELLED', reversed: true });
    expect(data.get('funds/FUND_CN01')).toMatchObject({ currentBalance: 100_000_000, totalExpense: 0 });
    expect(data.get('funds/BANK_CN01')).toMatchObject({ currentBalance: 100_000_000, totalExpense: 0 });
    expect(data.get('partners/SUP_01')).toMatchObject({ outstandingDebt: 0, totalPurchasedFrom: 0, debtTransactions: [] });
    expect(data.get('cashTransactions/PAY_01').status).toBe('CANCELLED');
    expect(data.get('cashTransactions/PAY_02').status).toBe('CANCELLED');
    expect(data.get('purchaseOrders/PO_01')).toMatchObject({ status: 'CANCELLED', inventoryPostingStatus: 'REVERSED' });
  });
});

describe('Purchase supplier-debt payment transaction', () => {
  it('updates the order, supplier, two funds and cash ledger once', async () => {
    type Ref = { kind: 'ref'; col: string; id: string };
    const data = new Map<string, any>();
    const seed: Record<string, Record<string, any>> = {
      purchaseOrders: { PO_01: { ...validOrder({ paidAmount: 0, debtAmount: 20_000_000, fundId: '' }), inventoryPostingStatus: 'POSTED' } },
      partners: { SUP_01: { id: 'SUP_01', branchId: 'CN01', type: 'SUPPLIER', name: 'NCC 01', phone: '0905000001', outstandingDebt: 20_000_000, debtTransactions: [] } },
      funds: {
        FUND_CN01: { id: 'FUND_CN01', branchId: 'CN01', type: 'CASH', name: 'TM CN01', currentBalance: 50_000_000, totalExpense: 0, isActive: true },
        BANK_CN01: { id: 'BANK_CN01', branchId: 'CN01', type: 'BANK', name: 'NH CN01', currentBalance: 30_000_000, totalExpense: 0, isActive: true }
      }
    };
    Object.entries(seed).forEach(([collection, docs]) => Object.entries(docs).forEach(([id, value]) => data.set(`${collection}/${id}`, { ...value })));
    const ref = (col: string, id: string): Ref => ({ kind: 'ref', col, id });
    const snap = (target: Ref) => ({ id: target.id, ref: target, exists: data.has(`${target.col}/${target.id}`), data: () => data.get(`${target.col}/${target.id}`) });
    const db: any = {
      collection: (col: string) => ({ doc: (id: string) => ref(col, id) }),
      runTransaction: async (callback: any) => callback({
        get: async (target: Ref) => snap(target),
        set: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...value }),
        update: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...data.get(`${target.col}/${target.id}`), ...value })
      })
    };
    const input = {
      idempotencyKey: 'PAYMENT-REQUEST-01',
      note: 'Thanh toán đợt 2',
      paymentAllocations: [
        { fundId: 'FUND_CN01', method: 'CASH' as const, amount: 5_000_000 },
        { fundId: 'BANK_CN01', method: 'BANK_TRANSFER' as const, amount: 10_000_000 }
      ]
    };

    const result = await processPayPurchaseOrderDebt(db, 'PO_01', input, actor);
    expect(result.order).toMatchObject({ paidAmount: 15_000_000, debtAmount: 5_000_000, paymentStatus: 'PARTIAL' });
    expect(data.get('partners/SUP_01').outstandingDebt).toBe(5_000_000);
    expect(data.get('funds/FUND_CN01')).toMatchObject({ currentBalance: 45_000_000, totalExpense: 5_000_000 });
    expect(data.get('funds/BANK_CN01')).toMatchObject({ currentBalance: 20_000_000, totalExpense: 10_000_000 });
    expect(result.paymentTransactionIds).toHaveLength(2);
    result.paymentTransactionIds.forEach(id => expect(data.get(`cashTransactions/${id}`)).toMatchObject({ purchaseOrderId: 'PO_01', status: 'COMPLETED' }));

    const replay = await processPayPurchaseOrderDebt(db, 'PO_01', input, actor);
    expect(replay.idempotentReplay).toBe(true);
    expect(data.get('partners/SUP_01').outstandingDebt).toBe(5_000_000);
    expect(data.get('funds/FUND_CN01').currentBalance).toBe(45_000_000);
  });
});
