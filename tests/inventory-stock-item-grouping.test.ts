import { describe, expect, it } from 'vitest';
import { getAccessoryStockTrace, listAccessoryStockBalances } from '../server/services/inventoryStockItemService';

type Ref = { col: string; id: string };

function createReadDb(seed: Record<string, Record<string, any>>) {
  const data = new Map<string, any>();
  Object.entries(seed).forEach(([collection, documents]) => Object.entries(documents)
    .forEach(([id, value]) => data.set(`${collection}/${id}`, { ...value })));
  const ref = (col: string, id: string): Ref => ({ col, id });
  const snap = (target: Ref) => ({
    id: target.id,
    ref: target,
    exists: data.has(`${target.col}/${target.id}`),
    data: () => data.get(`${target.col}/${target.id}`)
  });
  const docsFor = (col: string, filters: Array<{ field: string; value: unknown }> = [], max = Number.MAX_SAFE_INTEGER) => [...data.entries()]
    .filter(([key, value]) => key.startsWith(`${col}/`) && filters.every(filter => value?.[filter.field] === filter.value))
    .slice(0, max)
    .map(([key]) => snap(ref(col, key.slice(col.length + 1))));
  const query = (col: string, filters: Array<{ field: string; value: unknown }> = [], max = Number.MAX_SAFE_INTEGER): any => ({
    where: (field: string, _operator: string, value: unknown) => query(col, [...filters, { field, value }], max),
    limit: (nextMax: number) => query(col, filters, nextMax),
    get: async () => {
      const docs = docsFor(col, filters, max);
      return { docs, empty: docs.length === 0 };
    }
  });
  const db: any = {
    collection: (col: string) => ({
      doc: (id: string) => ({ ...ref(col, id), get: async () => snap(ref(col, id)) }),
      where: (field: string, operator: string, value: unknown) => query(col).where(field, operator, value),
      limit: (max: number) => query(col).limit(max),
      get: async () => query(col).get()
    }),
    getAll: async (...refs: Ref[]) => refs.map(snap)
  };
  return db;
}

const db = createReadDb({
  products: {
    PRD_ACC: { id: 'PRD_ACC', productMasterId: 'CAT_ACC', sku: 'CL-IP15PM', name: 'Cường lực iPhone 15 Pro Max', category: 'Phụ kiện', catalogGroupCode: 'CL', brand: 'PhoneHouse', buyPrice: 50_000, sellPrice: 150_000, status: 'active' }
  },
  inventoryBalances: {
    CN01_KHO01_PRD_ACC: { id: 'CN01_KHO01_PRD_ACC', productId: 'PRD_ACC', productMasterId: 'CAT_ACC', sku: 'CL-IP15PM', name: 'Cường lực iPhone 15 Pro Max', branchId: 'CN01', warehouseId: 'KHO01', onHand: 10, available: 8 },
    CN02_KHO02_PRD_ACC: { id: 'CN02_KHO02_PRD_ACC', productId: 'PRD_ACC', productMasterId: 'CAT_ACC', sku: 'CL-IP15PM', name: 'Cường lực iPhone 15 Pro Max', branchId: 'CN02', warehouseId: 'KHO02', onHand: 5, available: 5 }
  },
  warehouses: {
    KHO01: { id: 'KHO01', name: 'Kho PhoneHouse', branchId: 'CN01' },
    KHO02: { id: 'KHO02', name: 'Kho XStore', branchId: 'CN02' }
  },
  inventoryMovements: {
    MOV_IN: { id: 'MOV_IN', productId: 'PRD_ACC', branchId: 'CN01', warehouseId: 'KHO01', movementType: 'STOCK_RECEIPT', quantity: 10, sourceType: 'PURCHASE_ORDER', sourceId: 'PO01', occurredAt: '2026-08-20T08:00:00.000Z' }
  },
  purchaseOrders: {
    PO01: { id: 'PO01', code: 'PN-CN01-0001' }
  },
  invoices: {
    INV01: { id: 'INV01', invoiceCode: 'HD-CN01-0001', branchId: 'CN01', warehouseId: 'KHO01', createdAt: '2026-08-21T08:00:00.000Z', accessories: [{ productId: 'PRD_ACC', name: 'Cường lực iPhone 15 Pro Max', quantity: 2 }] },
    INV02: { id: 'INV02', invoiceCode: 'HD-CN02-0001', branchId: 'CN02', warehouseId: 'KHO02', createdAt: '2026-08-22T08:00:00.000Z', accessories: [{ productId: 'PRD_ACC', name: 'Cường lực iPhone 15 Pro Max', quantity: 1 }] }
  }
});

describe('Grouped accessory stock and trace', () => {
  it('returns only branch balances and hides cost from sales staff', async () => {
    const rows = await listAccessoryStockBalances(db, { uid: 'SALE01', role: 'SALES', branchId: 'CN01' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ productId: 'PRD_ACC', warehouseId: 'KHO01', stockQuantity: 10, reservedQuantity: 2, availableQuantity: 8 });
    expect(rows[0]).not.toHaveProperty('currentCost');
  });

  it('returns all location balances and cost to an admin', async () => {
    const rows = await listAccessoryStockBalances(db, { uid: 'ADMIN01', role: 'ADMIN' });
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.currentCost === 50_000)).toBe(true);
  });

  it('links receipt codes and reconstructs legacy sale history within branch scope', async () => {
    const trace = await getAccessoryStockTrace(db, 'PRD_ACC', { uid: 'SALE01', role: 'SALES', branchId: 'CN01' });
    expect(trace.movements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'STOCK_RECEIPT', sourceCode: 'PN-CN01-0001', warehouseName: 'Kho PhoneHouse' }),
      expect.objectContaining({ type: 'STOCK_SALE', sourceCode: 'HD-CN01-0001', quantity: 2 })
    ]));
    expect(trace.movements.some((movement: any) => movement.sourceCode === 'HD-CN02-0001')).toBe(false);
    expect(trace.notice).toContain('hóa đơn cũ');
  });
});
