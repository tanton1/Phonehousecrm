import { describe, expect, it } from 'vitest';
import {
  calculateTechnicalTaskQuote,
  deriveInterBranchStatus,
  getCanonicalDeviceLocation,
  getDeviceCostSnapshot,
  processAcceptTechnicalTransfer,
  processCreateInterBranchTransfer,
  processCreateTechnicalTransfer,
  processReceiveInterBranchTransfer
} from '../server/services/inventoryTransferService';

type Ref = { col: string; id: string };

function createFirestoreMock(seed: Record<string, Record<string, any>>) {
  const data = new Map<string, any>();
  Object.entries(seed).forEach(([collection, docs]) => Object.entries(docs).forEach(([id, value]) => data.set(`${collection}/${id}`, { ...value })));
  const makeRef = (col: string, id: string): Ref => ({ col, id });
  const makeSnap = (ref: Ref) => ({
    id: ref.id,
    ref,
    exists: data.has(`${ref.col}/${ref.id}`),
    data: () => data.get(`${ref.col}/${ref.id}`)
  });
  const db: any = {
    collection: (col: string) => ({
      doc: (id: string) => makeRef(col, id),
      get: async () => {
        const docs = [...data.entries()].filter(([key]) => key.startsWith(`${col}/`)).map(([key]) => makeSnap(makeRef(col, key.slice(col.length + 1))));
        return { empty: docs.length === 0, docs };
      }
    }),
    runTransaction: async (callback: any) => callback({
      get: async (ref: Ref) => makeSnap(ref),
      set: (ref: Ref, value: any) => data.set(`${ref.col}/${ref.id}`, { ...value }),
      update: (ref: Ref, patch: any) => data.set(`${ref.col}/${ref.id}`, { ...(data.get(`${ref.col}/${ref.id}`) || {}), ...patch })
    })
  };
  return { db, get: (collection: string, id: string) => data.get(`${collection}/${id}`), values: (collection: string) => [...data.entries()].filter(([key]) => key.startsWith(`${collection}/`)).map(([, value]) => value) };
}

const admin = { uid: 'ADMIN_01', name: 'Admin Tổng', role: 'ADMIN', branchId: 'CN_TONG' };

describe('Inventory transfer domain helpers', () => {
  it('uses canonical currentLocationId before legacy warehouse fields', () => {
    expect(getCanonicalDeviceLocation({ currentLocationId: 'LOC_A', warehouseId: 'OLD_A', warehouse: 'OLD_B' })).toBe('LOC_A');
  });

  it('snapshots currentCost instead of trusting a transfer form value', () => {
    expect(getDeviceCostSnapshot({ imei: '111', currentCost: 15_000_000, buyPrice: 10_000_000, costVersion: 'V4' }, '2026-08-21T00:00:00.000Z')).toEqual({
      costAtTransfer: 15_000_000,
      costVersion: 'V4',
      costCalculatedAt: '2026-08-21T00:00:00.000Z'
    });
  });

  it('calculates commission and deadline from versioned server task configuration', () => {
    const config = {
      id: 'BATTERY_REPLACE', taskType: 'BATTERY_REPLACE', name: 'Thay pin', taskCode: 'TP',
      baseCommission: 80_000, normalSlaHours: 24, prioritySlaHours: 12, urgentSlaHours: 6,
      priorityMultiplier: { NORMAL: 1, PRIORITY: 1.25, URGENT: 1.5 }, requiresQc: true, isActive: true, version: 'V1'
    };
    const quote = calculateTechnicalTaskQuote(config, 'URGENT', '2026-08-21T00:00:00.000Z');
    expect(quote.commissionAmount).toBe(Math.round(config.baseCommission * config.priorityMultiplier.URGENT));
    expect(quote.slaHours).toBe(config.urgentSlaHours);
    expect(quote.deadlineAt).toBe('2026-08-21T06:00:00.000Z');
  });

  it('marks missing, wrong, or damaged receipt lines as a dispute', () => {
    expect(deriveInterBranchStatus([{ receiptStatus: 'RECEIVED' }, { receiptStatus: 'MISSING' }])).toBe('DISPUTED');
    expect(deriveInterBranchStatus([{ receiptStatus: 'RECEIVED' }, { receiptStatus: 'PENDING' }])).toBe('PARTIALLY_RECEIVED');
    expect(deriveInterBranchStatus([{ receiptStatus: 'RECEIVED' }, { receiptStatus: 'RECEIVED' }])).toBe('RECEIVED');
  });
});

describe('Technical custody transfer transaction', () => {
  it('reserves an IMEI without changing branch or physical location until KTV accepts', async () => {
    const store = createFirestoreMock({
      technicalTaskTypes: {
        GENERAL_CHECK: { id: 'GENERAL_CHECK', taskType: 'GENERAL_CHECK', name: 'Kiểm tra tổng thể', taskCode: 'KCS', baseCommission: 50_000, normalSlaHours: 12, prioritySlaHours: 8, urgentSlaHours: 4, priorityMultiplier: { NORMAL: 1, PRIORITY: 1.25, URGENT: 1.5 }, requiresQc: true, isActive: true, version: 'V1' }
      },
      warehouses: {
        KHO_TONG: { id: 'KHO_TONG', branchId: 'CN_TONG', type: 'CENTRAL', isMain: true, isActive: true, name: 'Kho Tổng' },
        KHO_KTV_TRONG: { id: 'KHO_KTV_TRONG', branchId: 'CN_TONG', type: 'TECHNICIAN_SUB', parentWarehouseId: 'KHO_TONG', custodianUid: 'STAFF_004', custodianName: 'KTV Trọng', isActive: true, name: 'Kho KTV Trọng' }
      },
      devices: {
        DEV_01: { id: 'DEV_01', imei: '356789012345678', model: 'iPhone 15 Pro', storage: '256GB', color: 'Titan', condition: 'Like New 99%', branchId: 'CN_TONG', currentLocationId: 'KHO_TONG', status: 'in_stock', currentCost: 15_000_000 }
      }
    });
    const created = await processCreateTechnicalTransfer(store.db, {
      sourceBranchId: 'CN_TONG', sourceLocationId: 'KHO_TONG', destinationLocationId: 'KHO_KTV_TRONG',
      items: [{ deviceId: 'DEV_01', tasks: [{ taskType: 'GENERAL_CHECK', priority: 'NORMAL' }] }],
      idempotencyKey: 'technical-create-test-0001'
    }, admin);

    expect(created.transfer.status).toBe('WAITING_KTV_ACCEPT');
    expect(created.transfer.sourceBranchId).toBe(created.transfer.destinationBranchId);
    expect(store.get('devices', 'DEV_01')).toMatchObject({ branchId: 'CN_TONG', currentLocationId: 'KHO_TONG', status: 'reserved', activeTransferId: created.transferId });
    expect(store.values('commissionLedger')[0]).toMatchObject({ status: 'PENDING', eligibilityRequiresStockReturn: true });

    const accepted = await processAcceptTechnicalTransfer(store.db, created.transferId, ['356789012345678'], 'technical-accept-test-0001', {
      uid: 'STAFF_004', name: 'KTV Trọng', role: 'TECHNICIAN', branchId: 'CN_TONG'
    });
    expect(accepted.transfer.status).toBe('IN_PROGRESS');
    expect(store.get('devices', 'DEV_01')).toMatchObject({ branchId: 'CN_TONG', currentLocationId: 'KHO_KTV_TRONG', status: 'in_repair' });
  });
});

describe('Inter-branch transfer and balanced ledger transaction', () => {
  it('creates issue, pending receipt, transit movement and one provisional ledger atomically', async () => {
    const store = createFirestoreMock({
      branches: { CN_TONG: { id: 'CN_TONG', name: 'Chi nhánh Tổng' }, CN_PHONEHOUSE: { id: 'CN_PHONEHOUSE', name: 'PhoneHouse' } },
      warehouses: {
        KHO_TONG: { id: 'KHO_TONG', branchId: 'CN_TONG', type: 'CENTRAL', isActive: true, name: 'Kho Tổng' },
        KHO_PHONEHOUSE: { id: 'KHO_PHONEHOUSE', branchId: 'CN_PHONEHOUSE', type: 'RETAIL_STORE', isActive: true, name: 'Kho PhoneHouse' }
      },
      devices: {
        DEV_01: { id: 'DEV_01', imei: '111111111111111', model: 'iPhone 15', branchId: 'CN_TONG', currentLocationId: 'KHO_TONG', status: 'in_stock', currentCost: 15_000_000, buyPrice: 12_000_000 },
        DEV_02: { id: 'DEV_02', imei: '222222222222222', model: 'iPhone 14', branchId: 'CN_TONG', currentLocationId: 'KHO_TONG', status: 'in_stock', currentCost: 10_000_000 }
      }
    });
    const created = await processCreateInterBranchTransfer(store.db, {
      sourceBranchId: 'CN_TONG', destinationBranchId: 'CN_PHONEHOUSE', sourceLocationId: 'KHO_TONG', destinationLocationId: 'KHO_PHONEHOUSE',
      deviceIds: ['DEV_01', 'DEV_02'], idempotencyKey: 'inter-branch-create-test-0001'
    }, admin);

    expect(created.transfer.status).toBe('IN_TRANSIT');
    expect(created.transfer.totalValue).toBe(25_000_000);
    expect(store.values('stockIssues')).toHaveLength(1);
    expect(store.values('stockReceipts')[0].status).toBe('PENDING_RECEIPT');
    expect(store.values('interBranchLedger')).toHaveLength(1);
    expect(store.values('interBranchLedger')[0]).toMatchObject({ status: 'PROVISIONAL', provisionalAmount: 25_000_000, postedAmount: 0 });
    expect(store.get('devices', 'DEV_01')).toMatchObject({ branchId: 'CN_TONG', currentLocationId: 'IN_TRANSIT', status: 'in_transit' });

    const received = await processReceiveInterBranchTransfer(store.db, created.transferId, {
      idempotencyKey: 'inter-branch-receive-test-0001',
      results: [
        { imei: '111111111111111', result: 'RECEIVED', scannedImei: '111111111111111' },
        { imei: '222222222222222', result: 'MISSING' }
      ]
    }, { uid: 'RECEIVER_01', name: 'Thủ kho nhận', role: 'MANAGER', branchId: 'CN_PHONEHOUSE' });

    expect(received.transfer.status).toBe('DISPUTED');
    expect(received.postedAmount).toBe(15_000_000);
    expect(store.get('devices', 'DEV_01')).toMatchObject({ branchId: 'CN_PHONEHOUSE', currentLocationId: 'KHO_PHONEHOUSE', status: 'in_stock' });
    expect(store.get('devices', 'DEV_02')).toMatchObject({ branchId: 'CN_TONG', currentLocationId: 'IN_TRANSIT', status: 'in_transit' });
    expect(store.values('interBranchLedger')[0]).toMatchObject({ status: 'POSTED', postedAmount: 15_000_000 });
  });
});
