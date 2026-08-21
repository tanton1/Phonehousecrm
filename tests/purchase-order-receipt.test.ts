import { describe, expect, it } from 'vitest';
import { validatePurchaseReceiptInput } from '../server/services/purchaseOrderReceiptService';

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
});
