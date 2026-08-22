import { describe, expect, it } from 'vitest';
import { executeAtomicCheckout } from '../server/services/checkoutService';
import { validateOperationalConfig } from '../server/routes/configuration';

function checkoutDb() {
  let writeStarted = false;
  const get = async (ref: any) => {
    if (writeStarted) throw new Error('FIRESTORE_READ_AFTER_WRITE');
    if (ref.col === 'checkoutRequests') return { exists: false };
    if (ref.col === 'funds') return { exists: true, data: () => ({ id: ref.docId, name: 'TM Chi nhánh', type: 'CASH', branchId: 'CN01', isActive: true }) };
    if (ref.col === 'devices') return { exists: true, data: () => ({ id: ref.docId, model: 'iPhone 15 Pro', storage: '256GB', condition: 'Like New 99%', imei: '123456789', sellPrice: 27000000, status: 'in_stock', branchId: 'CN01' }) };
    if (ref.col === 'operationalConfigs' && ref.docId === 'sales') return { exists: true, data: () => ({ name: 'Sales', version: '1', isActive: true, commissionTags: [] }) };
    if (ref.col === 'operationalConfigs' && ref.docId === 'retailPricing') return { exists: true, data: () => ({
      name: 'Giá tháng 8', version: '2026.08', policyId: 'RETAIL_2026_08', effectiveFrom: '2026-08-01', isActive: true,
      entries: [{ id: 'IP15P', itemType: 'DEVICE', matchType: 'MODEL_VARIANT', itemKey: 'IPHONE 15 PRO|256GB|LIKE NEW 99%', itemName: 'iPhone 15 Pro 256GB', branchId: 'ALL', retailPrice: 28000000, minimumPrice: 26000000, isActive: true }]
    }) };
    if (ref.col === 'partners') return { exists: true, data: () => ({ id: ref.docId, type: 'CUSTOMER', branchId: 'CN01' }) };
    if (ref.col === 'leads') return { exists: true, data: () => ({ id: ref.docId, branchId: 'CN01' }) };
    return { exists: false };
  };
  const transaction = {
    get,
    set: () => { writeStarted = true; },
    update: () => { writeStarted = true; },
    delete: () => { writeStarted = true; }
  };
  const db: any = {
    collection: (col: string) => ({ doc: (docId?: string) => ({ col, docId: docId || `${col}-generated` }) }),
    runTransaction: async (callback: any) => callback(transaction)
  };
  return db;
}

describe('Retail pricing and Firestore POS transaction order', () => {
  it('validates a dated retail price policy with branch-scoped price and floor', () => {
    expect(validateOperationalConfig('retailPricing', {
      policyId: 'RETAIL_2026_08', name: 'Giá tháng 8', version: '2026.08', effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31', isActive: true,
      entries: [{ id: 'IP15P', itemType: 'DEVICE', matchType: 'MODEL_VARIANT', itemKey: 'IPHONE 15 PRO|256GB|LIKE NEW 99%', itemName: 'iPhone 15 Pro', branchId: 'CN01', retailPrice: 28000000, minimumPrice: 26000000, isActive: true }]
    })).toMatchObject({ id: 'retailPricing', policyId: 'RETAIL_2026_08', entries: [{ retailPrice: 28000000, minimumPrice: 26000000 }] });
  });

  it('completes all reads before writes and snapshots a POS-adjusted retail price', async () => {
    const result = await executeAtomicCheckout(checkoutDb(), {
      deviceIds: ['DEV-01'], branchId: 'CN01', customerId: 'CUST-01', leadId: 'LEAD-01',
      payment: { method: 'CASH', fundId: 'FUND-01' },
      priceAdjustments: [{ itemType: 'DEVICE', itemId: 'DEV-01', unitPrice: 27500000, reason: 'Khách thân thiết' }]
    }, { uid: 'SALE-01', role: 'SALES', name: 'Sale 01', branchId: 'CN01' });

    expect(result.success).toBe(true);
    expect(result.finalAmount).toBe(27500000);
    expect(result.invoice.detailedItems[0]).toMatchObject({
      listPrice: 28000000,
      unitPrice: 27500000,
      priceAdjusted: true,
      priceAdjustmentReason: 'Khách thân thiết',
      pricePolicyId: 'RETAIL_2026_08',
      pricePolicyVersion: '2026.08'
    });
  });

  it('rejects a non-manager price below the configured floor', async () => {
    await expect(executeAtomicCheckout(checkoutDb(), {
      deviceIds: ['DEV-01'], branchId: 'CN01', payment: { method: 'CASH', fundId: 'FUND-01' },
      priceAdjustments: [{ itemType: 'DEVICE', itemId: 'DEV-01', unitPrice: 25000000, reason: 'Xin giảm sâu' }]
    }, { uid: 'SALE-01', role: 'SALES', branchId: 'CN01' })).rejects.toThrow('POS_PRICE_BELOW_FLOOR');
  });
});
