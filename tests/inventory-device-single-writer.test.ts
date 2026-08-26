import { describe, expect, it } from 'vitest';
import {
  buildInventoryAuditReport,
  decodeInventoryCursor,
  encodeInventoryCursor,
  ImportInventoryDevicesInput,
  processImportInventoryDevices,
  processUpdateInventoryDeviceMetadata
} from '../server/services/inventoryDeviceService';

type Ref = { kind: 'ref'; col: string; id: string };
type Query = { kind: 'query'; col: string; field: string; value: unknown; max: number };

function createInventoryDb(seed: Record<string, Record<string, any>>) {
  const data = new Map<string, any>();
  let autoId = 0;
  Object.entries(seed).forEach(([collection, documents]) => {
    Object.entries(documents).forEach(([id, value]) => data.set(`${collection}/${id}`, { ...value }));
  });

  const ref = (col: string, id: string): Ref => ({ kind: 'ref', col, id });
  const snap = (documentRef: Ref) => ({
    id: documentRef.id,
    ref: documentRef,
    exists: data.has(`${documentRef.col}/${documentRef.id}`),
    data: () => data.get(`${documentRef.col}/${documentRef.id}`)
  });
  const querySnapshot = (query: Query) => {
    const docs = [...data.entries()]
      .filter(([key, value]) => key.startsWith(`${query.col}/`) && value?.[query.field] === query.value)
      .slice(0, query.max)
      .map(([key]) => snap(ref(query.col, key.slice(query.col.length + 1))));
    return { empty: docs.length === 0, docs };
  };
  const collectionSnapshot = (col: string, max = Number.MAX_SAFE_INTEGER) => {
    const docs = [...data.keys()]
      .filter(key => key.startsWith(`${col}/`))
      .slice(0, max)
      .map(key => snap(ref(col, key.slice(col.length + 1))));
    return { empty: docs.length === 0, docs };
  };

  const db: any = {
    collection: (col: string) => ({
      doc: (id?: string) => ref(col, id || `AUTO_${++autoId}`),
      where: (field: string, _operator: string, value: unknown) => ({
        limit: (max: number) => ({ kind: 'query', col, field, value, max } as Query)
      }),
      limit: (max: number) => ({ get: async () => collectionSnapshot(col, max) }),
      get: async () => collectionSnapshot(col)
    }),
    runTransaction: async (callback: any) => callback({
      get: async (target: Ref | Query) => target.kind === 'query' ? querySnapshot(target) : snap(target),
      set: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...value }),
      create: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...value }),
      update: (target: Ref, value: any) => data.set(`${target.col}/${target.id}`, { ...(data.get(`${target.col}/${target.id}`) || {}), ...value })
    })
  };

  return {
    db,
    get: (collection: string, id: string) => data.get(`${collection}/${id}`),
    values: (collection: string) => [...data.entries()].filter(([key]) => key.startsWith(`${collection}/`)).map(([, value]) => value)
  };
}

const actor = { uid: 'INV_01', name: 'Thủ kho', role: 'INVENTORY_MANAGER', branchId: 'CN01' };

describe('Inventory device canonical single writer', () => {
  it('uses an opaque versioned cursor and rejects malformed pagination state', () => {
    const cursor = encodeInventoryCursor('DEV_000500');
    expect(decodeInventoryCursor(cursor)).toBe('DEV_000500');
    expect(() => decodeInventoryCursor('not-a-valid-cursor')).toThrow('INVENTORY_CURSOR_INVALID');
  });

  it('creates device, IMEI registry and stock receipt with one canonical branch/location', async () => {
    const store = createInventoryDb({
      warehouses: { KHO_CN01: { id: 'KHO_CN01', branchId: 'CN01', isActive: true, name: 'Kho CN01' } }
    });

    const input: ImportInventoryDevicesInput = {
      branchId: 'CN01',
      locationId: 'KHO_CN01',
      sourceType: 'PURCHASE_ORDER',
      sourceId: 'PO_01',
      idempotencyKey: 'purchase-order:PO_01',
      devices: [{ id: 'DEV_01', imei: '356789012345678', model: 'iPhone 15 Pro', buyPrice: 20_000_000 }]
    };
    const result = await processImportInventoryDevices(store.db, input, actor);

    expect(result.importedCount).toBe(1);
    expect(store.get('devices', 'DEV_01')).toMatchObject({
      imei: '356789012345678',
      imeiNormalized: '356789012345678',
      branchId: 'CN01',
      currentLocationId: 'KHO_CN01',
      warehouseId: 'KHO_CN01',
      warehouse: 'KHO_CN01',
      status: 'in_stock',
      currentCost: 20_000_000
    });
    expect(store.values('imeiRegistry')).toHaveLength(1);
    expect(store.values('inventoryMovements')[0]).toMatchObject({
      movementType: 'STOCK_RECEIPT', deviceId: 'DEV_01', branchId: 'CN01', toLocationId: 'KHO_CN01'
    });
    const replay = await processImportInventoryDevices(store.db, input, actor);
    expect(replay).toMatchObject({ importedCount: 1, idempotentReplay: true });
    expect(store.values('inventoryMovements')).toHaveLength(1);
  });

  it('rejects an IMEI that already exists even when the new document id differs', async () => {
    const store = createInventoryDb({
      warehouses: { KHO_CN01: { id: 'KHO_CN01', branchId: 'CN01', isActive: true } },
      devices: { LEGACY_01: { id: 'LEGACY_01', imei: '356789012345678', model: 'iPhone cũ' } }
    });

    await expect(processImportInventoryDevices(store.db, {
      branchId: 'CN01', locationId: 'KHO_CN01', sourceType: 'MANUAL_IMPORT', sourceId: 'MANUAL_01',
      idempotencyKey: 'manual-import:0001',
      devices: [{ id: 'NEW_01', imei: '356789012345678', model: 'iPhone 15 Pro', buyPrice: 20_000_000 }]
    }, actor)).rejects.toThrow('IMEI_ALREADY_EXISTS');
  });

  it('reports drift in dry-run mode without changing any device', async () => {
    const store = createInventoryDb({
      warehouses: { KHO_CN01: { id: 'KHO_CN01', branchId: 'CN01' } },
      devices: { DEV_BAD: { id: 'DEV_BAD', imei: '111111111111111', warehouse: 'KHO_CN01', activeTransferId: 'TR_DONE' } },
      transfers: { TR_DONE: { id: 'TR_DONE', status: 'COMPLETED', items: [] } },
      technicalWorkOrders: {}
    });

    const before = { ...store.get('devices', 'DEV_BAD') };
    const report = await buildInventoryAuditReport(store.db);

    expect(report.dryRun).toBe(true);
    expect(report.counts.DEVICE_BRANCH_MISSING).toBe(1);
    expect(report.counts.DEVICE_STALE_TRANSFER_LOCK).toBe(1);
    expect(store.get('devices', 'DEV_BAD')).toEqual(before);
  });

  it('updates only sale/display metadata and preserves canonical IMEI, cost and location', async () => {
    const store = createInventoryDb({ devices: { DEV_01: {
      id: 'DEV_01', imei: '12345', branchId: 'CN01', currentLocationId: 'KHO_CN01',
      currentCost: 12_000_000, buyPrice: 12_000_000, model: 'iPhone 12', sellPrice: 13_000_000, status: 'in_stock'
    } } });
    await processUpdateInventoryDeviceMetadata(store.db, 'DEV_01', {
      model: 'iPhone 12 Pro', sellPrice: 14_000_000, currentCost: 1, currentLocationId: 'KHO_KHAC', imei: '99999'
    }, actor);
    expect(store.get('devices', 'DEV_01')).toMatchObject({
      model: 'iPhone 12 Pro', sellPrice: 14_000_000, imei: '12345',
      currentCost: 12_000_000, buyPrice: 12_000_000, currentLocationId: 'KHO_CN01', status: 'in_stock'
    });
    expect(store.values('inventoryAuditEvents')).toHaveLength(1);
  });

  it('rejects metadata edits from another branch', async () => {
    const store = createInventoryDb({ devices: { DEV_02: { id: 'DEV_02', imei: '54321', branchId: 'CN02', model: 'iPhone 13' } } });
    await expect(processUpdateInventoryDeviceMetadata(store.db, 'DEV_02', { notes: 'Sai chi nhánh' }, actor)).rejects.toThrow('INVENTORY_BRANCH_FORBIDDEN');
  });
});
