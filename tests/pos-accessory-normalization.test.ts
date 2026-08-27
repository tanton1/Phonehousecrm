import { describe, expect, it } from 'vitest';
import { executeAtomicCheckout } from '../server/services/checkoutService';
import {
  normalizeCheckoutAccessoryLines,
  validateCheckoutPayload
} from '../server/validation/checkoutSchema';

describe('POS accessory canonicalization', () => {
  it('merges repeated productId values into one canonical invoice line', () => {
    expect(normalizeCheckoutAccessoryLines([
      { productId: 'PK-001', quantity: 2 },
      { productId: 'PK-001', quantity: 3 },
      { productId: 'PK-002', quantity: 1 }
    ])).toEqual([
      { productId: 'PK-001', quantity: 5 },
      { productId: 'PK-002', quantity: 1 }
    ]);

    const validated = validateCheckoutPayload({
      idempotencyKey: 'POS-ACCESSORY-MERGE-001',
      branchId: 'CN01',
      warehouseId: 'KHO01',
      deviceIds: [],
      accessoryLines: [
        { productId: 'PK-001', quantity: 2 },
        { productId: 'PK-001', quantity: 3 }
      ],
      payment: { method: 'CASH', fundId: 'FUND-01' }
    });
    expect(validated.isValid).toBe(true);
    expect(validated.data.accessoryLines).toEqual([{ productId: 'PK-001', quantity: 5 }]);
  });

  it('rejects a repeated SKU when its aggregated quantity exceeds the per-SKU limit', () => {
    const result = validateCheckoutPayload({
      idempotencyKey: 'POS-ACCESSORY-LIMIT-001',
      branchId: 'CN01',
      warehouseId: 'KHO01',
      deviceIds: [],
      accessoryLines: [
        { productId: 'PK-001', quantity: 60 },
        { productId: 'PK-001', quantity: 60 }
      ],
      payment: { method: 'CASH', fundId: 'FUND-01' }
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('không được vượt 100');
  });

  it('checks duplicate lines against stock once using their aggregated quantity', async () => {
    let balanceReads = 0;
    const mockDb: any = {
      collection: (col: string) => ({ doc: (docId: string) => ({ col, docId }) }),
      runTransaction: async (callback: any) => callback({
        get: async (ref: any) => {
          if (ref.col === 'checkoutRequests') return { exists: false };
          if (ref.col === 'warehouses') return { exists: true, data: () => ({ branchId: 'CN01', isActive: true }) };
          if (ref.col === 'branches') return { exists: true, data: () => ({ name: 'CN01', isActive: true }) };
          if (ref.col === 'funds') return { exists: true, data: () => ({ name: 'Quỹ', type: 'CASH', branchId: 'CN01', isActive: true }) };
          if (ref.col === 'products') return { exists: true, data: () => ({ name: 'Cáp sạc', retailPrice: 100_000 }) };
          if (ref.col === 'inventoryBalances') {
            balanceReads += 1;
            return { exists: true, data: () => ({ onHand: 5, available: 5 }) };
          }
          return { exists: false };
        },
        set: () => undefined,
        update: () => undefined
      })
    };

    await expect(executeAtomicCheckout(mockDb, {
      idempotencyKey: 'POS-DUP-STOCK-001',
      branchId: 'CN01',
      warehouseId: 'KHO01',
      deviceIds: [],
      accessoryLines: [
        { productId: 'PK-001', quantity: 4 },
        { productId: 'PK-001', quantity: 4 }
      ],
      payment: { method: 'CASH', fundId: 'FUND-01' }
    })).rejects.toThrow('INSUFFICIENT_STOCK');
    expect(balanceReads).toBe(1);
  });
});
