import { describe, expect, it } from 'vitest';
import { processCancelPurchaseOrderReceipt, validatePurchaseReceiptInput } from '../server/services/purchaseOrderReceiptService';
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

  it('accepts numeric IMEI/serial identifiers from 5 through 15 digits', () => {
    const shortItem = { ...validOrder().items[0], imeiList: ['12345'] };
    expect(validatePurchaseReceiptInput({ order: validOrder({ items: [shortItem] }) }, actor).devices[0].imei).toBe('12345');
    expect(() => validatePurchaseReceiptInput({ order: validOrder({ items: [{ ...shortItem, imeiList: ['1234'] }] }) }, actor)).toThrow('IMEI_INVALID');
    expect(() => validatePurchaseReceiptInput({ order: validOrder({ items: [{ ...shortItem, imeiList: ['1234567890123456'] }] }) }, actor)).toThrow('IMEI_INVALID');
  });
});

describe('Purchase receipt cancellation rollback', () => {
  it('removes untouched received devices and reverses supplier/fund ledgers atomically', async () => {
    type Ref = { kind: 'ref'; col: string; id: string };
    type Query = { kind: 'query'; col: string; field: string; value: unknown };
    const data = new Map<string, any>();
    const seed: Record<string, Record<string, any>> = {
      purchaseOrders: { PO_01: { ...validOrder(), inventoryPostingStatus: 'POSTED' } },
      devices: { DEV_01: { id: 'DEV_01', imei: '12345', status: 'in_stock', currentLocationId: 'KHO_CN01', inventorySourceId: 'PO_01' } },
      imeiRegistry: { [imeiRegistryId('12345')]: { imei: '12345', deviceId: 'DEV_01' } },
      inventoryMovements: { MOV_01: { id: 'MOV_01', sourceId: 'PO_01', movementType: 'STOCK_RECEIPT' } },
      partners: { SUP_01: { id: 'SUP_01', outstandingDebt: 0, totalPurchasedFrom: 20_000_000, debtTransactions: [{ referenceId: 'PO_01' }] } },
      funds: { FUND_CN01: { id: 'FUND_CN01', currentBalance: 80_000_000, totalExpense: 20_000_000 } },
      cashTransactions: { PAY_01: { id: 'PAY_01', referenceCode: 'PN-000001', fundId: 'FUND_CN01', amount: 20_000_000, status: 'COMPLETED' } }
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
    expect(data.get('partners/SUP_01')).toMatchObject({ outstandingDebt: 0, totalPurchasedFrom: 0, debtTransactions: [] });
    expect(data.get('cashTransactions/PAY_01').status).toBe('CANCELLED');
    expect(data.get('purchaseOrders/PO_01')).toMatchObject({ status: 'CANCELLED', inventoryPostingStatus: 'REVERSED' });
  });
});
