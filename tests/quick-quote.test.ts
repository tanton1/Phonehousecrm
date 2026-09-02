import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { requireCustomerAppCheck } from '../server/middleware/authenticateCustomer';
import {
  createPublicQuickQuoteRequest,
  createQuickQuoteSelectionToken,
  decodeQuickQuoteSelectionToken,
  deviceVariantId,
  listPublicQuickQuoteAccessories,
  listPublicQuickQuoteDevices,
  updateStaffQuickQuoteCatalogItem
} from '../server/services/quickQuoteService';

type Row = Record<string, any>;

function fakeFirestore(seed: Record<string, Row> = {}) {
  const documents = new Map<string, Row>(Object.entries(seed).map(([path, value]) => [path, { ...value }]));
  let sequence = 0;

  const snapshot = (reference: any) => ({
    id: reference.id,
    ref: reference,
    exists: documents.has(reference.path),
    data: () => documents.get(reference.path)
  });

  const querySnapshot = (query: any) => {
    const prefix = `${query.collectionName}/`;
    const rows = [...documents.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, value]) => ({ path, id: path.slice(prefix.length), value }))
      .filter(row => query.filters.every(([field, operator, expected]: [string, string, any]) => {
        const actual = row.value[field];
        if (operator === '==') return actual === expected;
        if (operator === 'in') return Array.isArray(expected) && expected.includes(actual);
        throw new Error(`Unsupported operator ${operator}`);
      }))
      .slice(0, query.maximum || Number.MAX_SAFE_INTEGER)
      .map(row => ({ id: row.id, ref: reference(row.path.split('/')[0], row.id), exists: true, data: () => row.value }));
    return { docs: rows, size: rows.length, empty: rows.length === 0 };
  };

  const query = (collectionName: string, filters: any[] = [], maximum?: number): any => ({
    collectionName,
    filters,
    maximum,
    where(field: string, operator: string, value: any) { return query(collectionName, [...filters, [field, operator, value]], maximum); },
    limit(value: number) { return query(collectionName, filters, value); },
    async get() { return querySnapshot(this); }
  });

  const reference = (collectionName: string, id: string): any => ({
    collectionName,
    id,
    path: `${collectionName}/${id}`,
    async get() { return snapshot(this); },
    async set(value: Row, options?: { merge?: boolean }) {
      documents.set(this.path, options?.merge ? { ...(documents.get(this.path) || {}), ...value } : { ...value });
    },
    async update(value: Row) { documents.set(this.path, { ...(documents.get(this.path) || {}), ...value }); }
  });

  const db: any = {
    documents,
    collection(name: string) {
      return {
        doc(id?: string) { return reference(name, id || `AUTO_${String(++sequence).padStart(5, '0')}`); },
        where(field: string, operator: string, value: any) { return query(name).where(field, operator, value); },
        limit(value: number) { return query(name).limit(value); }
      };
    },
    async getAll(...references: any[]) { return references.map(snapshot); },
    async runTransaction(handler: (transaction: any) => Promise<any>) {
      const transaction = {
        async get(target: any) { return target.collectionName && target.filters ? querySnapshot(target) : snapshot(target); },
        create(target: any, value: Row) {
          if (documents.has(target.path)) throw new Error('already-exists');
          documents.set(target.path, { ...value });
        },
        set(target: any, value: Row, options?: { merge?: boolean }) {
          documents.set(target.path, options?.merge ? { ...(documents.get(target.path) || {}), ...value } : { ...value });
        },
        update(target: any, value: Row) {
          if (!documents.has(target.path)) throw new Error(`not-found: ${target.path}`);
          documents.set(target.path, { ...documents.get(target.path), ...value });
        }
      };
      return handler(transaction);
    }
  };
  return db;
}

function deviceSeed(extra: Record<string, Row> = {}) {
  return {
    'customerPortalConfigs/quickQuote': { enabled: true, validityHours: 24, responseSlaMinutes: 15 },
    'branches/CN01': { id: 'CN01', name: 'PhoneHouse Hải Châu', isActive: true },
    'devices/DEV-1': {
      id: 'DEV-1', branchId: 'CN01', status: 'in_stock', publicVisible: true,
      model: 'iPhone 15 Pro', storage: '256GB', color: 'Titan tự nhiên', condition: '99%',
      sellPrice: 20_000_000, imei: '356789012345678', buyPrice: 15_000_000,
      minimumPrice: 19_000_000, warehouseId: 'PRIVATE-WAREHOUSE', supplierId: 'PRIVATE-SUPPLIER'
    },
    ...extra
  };
}

async function publicDeviceToken(db: any) {
  const result = await listPublicQuickQuoteDevices(db, { branchId: 'CN01' });
  return result.items[0].selectionToken;
}

function requestInput(token: string, patch: Row = {}) {
  return {
    quoteType: 'DEVICE', branchId: 'CN01', customerName: 'Nguyễn Văn A', customerPhone: '0905000001',
    contactChannel: 'CALL', contactConsent: true, marketingConsent: false, note: 'Gọi sau 18 giờ',
    idempotencyKey: 'quick-quote-operation-0001', selections: [{ selectionToken: token, quantity: 1 }],
    utm: { source: 'facebook', campaign: 'iphone-15' }, ...patch
  };
}

describe('PhoneHouse Care quick quote invariants', () => {
  it('encrypts selection identity, rejects tampering and enforces the 15-minute expiry', () => {
    const now = Date.now();
    const token = createQuickQuoteSelectionToken({ kind: 'DEVICE', sourceId: 'DEV-SECRET', branchId: 'CN01', displayedPrice: 20_000_000 }, now);
    expect(token).not.toContain('DEV-SECRET');
    expect(decodeQuickQuoteSelectionToken(token, now + 14 * 60_000)).toMatchObject({ kind: 'DEVICE', sourceId: 'DEV-SECRET', branchId: 'CN01' });
    const packed = Buffer.from(token.slice(3), 'base64url');
    packed[packed.length - 2] ^= 0xff;
    const tampered = `v1.${packed.toString('base64url')}`;
    expect(() => decodeQuickQuoteSelectionToken(tampered, now)).toThrow('QUICK_QUOTE_SELECTION_INVALID_OR_EXPIRED');
    expect(() => decodeQuickQuoteSelectionToken(token, now + 16 * 60_000)).toThrow('QUICK_QUOTE_SELECTION_INVALID_OR_EXPIRED');
  });

  it('returns a strict public device projection without IMEI, cost, stock count or source document ID', async () => {
    const db = fakeFirestore(deviceSeed());
    const result = await listPublicQuickQuoteDevices(db, { branchId: 'CN01' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ model: 'iPhone 15 Pro', price: 20_000_000, inStock: true });
    const serialized = JSON.stringify(result.items[0]);
    for (const forbidden of ['356789012345678', 'buyPrice', 'minimumPrice', 'warehouseId', 'supplierId', 'DEV-1', 'stockQuantity']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('groups every IMEI and colour of the same model variant into one public offer', async () => {
    const first = {
      ...deviceSeed()['devices/DEV-1'],
      model: 'Máy iPhone iPhone 15 Pro 256GB Titan tự nhiên'
    };
    const db = fakeFirestore(deviceSeed({
      'devices/DEV-1': first,
      'devices/DEV-2': {
        ...first,
        id: 'DEV-2',
        imei: '356789012345679',
        model: 'Máy iPhone iPhone 15 Pro 256GB Xanh',
        color: 'Xanh'
      }
    }));

    const result = await listPublicQuickQuoteDevices(db, { branchId: 'CN01' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      name: 'iPhone 15 Pro 256GB',
      model: 'iPhone 15 Pro',
      colors: ['Titan tự nhiên', 'Xanh']
    });
    const decoded = decodeQuickQuoteSelectionToken(result.items[0].selectionToken);
    expect(decoded.sourceId).toMatch(/^QDV_[A-F0-9]{24}$/);
    expect(decoded.sourceId).not.toMatch(/DEV-1|DEV-2/);
  });

  it('publishes a whole variant from its branch config even when no IMEI has the legacy flag', async () => {
    const device = { ...deviceSeed()['devices/DEV-1'], publicVisible: false };
    const variantId = deviceVariantId(device);
    const db = fakeFirestore(deviceSeed({
      'devices/DEV-1': device,
      [`quickQuoteDeviceVariants/${variantId}`]: {
        id: variantId,
        publicBranchIds: ['CN01'],
        publicPresentationByBranch: { CN01: { publicName: 'iPhone 15 Pro giá tốt' } }
      }
    }));

    const result = await listPublicQuickQuoteDevices(db, { branchId: 'CN01' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('iPhone 15 Pro giá tốt');
  });

  it('lets a manager enable one variant without mutating individual IMEI documents', async () => {
    const device = { ...deviceSeed()['devices/DEV-1'], publicVisible: false };
    const variantId = deviceVariantId(device);
    const db = fakeFirestore(deviceSeed({ 'devices/DEV-1': device }));

    await updateStaffQuickQuoteCatalogItem(
      db,
      { uid: 'ADMIN-1', role: 'ADMIN', branchId: 'CN01' },
      'DEVICE',
      variantId,
      { branchId: 'CN01', publicVisible: true, publicName: 'iPhone 15 Pro 256GB' }
    );

    expect(db.documents.get(`quickQuoteDeviceVariants/${variantId}`)).toMatchObject({ publicBranchIds: ['CN01'] });
    expect(db.documents.get('devices/DEV-1')).toMatchObject({ publicVisible: false });
    expect((await listPublicQuickQuoteDevices(db, { branchId: 'CN01' })).items).toHaveLength(1);
  });

  it('does not leak a variant into a branch that was not enabled', async () => {
    const first = { ...deviceSeed()['devices/DEV-1'], publicVisible: false };
    const second = { ...first, id: 'DEV-2', imei: '356789012345679', branchId: 'CN02' };
    const variantId = deviceVariantId(first);
    const db = fakeFirestore(deviceSeed({
      'branches/CN02': { id: 'CN02', name: 'PhoneHouse Thanh Khê', isActive: true },
      'devices/DEV-1': first,
      'devices/DEV-2': second,
      [`quickQuoteDeviceVariants/${variantId}`]: { id: variantId, publicBranchIds: ['CN01'] }
    }));

    expect((await listPublicQuickQuoteDevices(db, { branchId: 'CN01' })).items).toHaveLength(1);
    expect((await listPublicQuickQuoteDevices(db, { branchId: 'CN02' })).items).toHaveLength(0);
  });

  it('keeps a variant selection valid when one IMEI sells but another equivalent IMEI remains', async () => {
    const first = deviceSeed()['devices/DEV-1'];
    const db = fakeFirestore(deviceSeed({
      'devices/DEV-2': { ...first, id: 'DEV-2', imei: '356789012345679', color: 'Xanh' }
    }));
    const token = await publicDeviceToken(db);
    db.documents.set('devices/DEV-1', { ...db.documents.get('devices/DEV-1'), status: 'sold' });

    const result = await createPublicQuickQuoteRequest(db, requestInput(token));
    expect(result).toMatchObject({ quoteType: 'DEVICE', estimatedTotal: 20_000_000 });
  });

  it('applies a MODEL_VARIANT price to imported model text with repeated storage and colour', async () => {
    const dirtyDevice = {
      ...deviceSeed()['devices/DEV-1'],
      model: 'Máy iPhone iPhone 15 Pro 256GB Titan tự nhiên'
    };
    const db = fakeFirestore(deviceSeed({
      'devices/DEV-1': dirtyDevice,
      'operationalConfigs/retailPricing': {
        name: 'Giá Mini App', version: '1', policyId: 'RETAIL_PUBLIC', effectiveFrom: '2020-01-01', isActive: true,
        entries: [{
          id: 'IP15P', itemType: 'DEVICE', matchType: 'MODEL_VARIANT',
          itemKey: 'IPHONE 15 PRO|256GB|99%', itemName: 'iPhone 15 Pro 256GB',
          branchId: 'ALL', retailPrice: 21_500_000, minimumPrice: 20_000_000, isActive: true
        }]
      }
    }));

    const result = await listPublicQuickQuoteDevices(db, { branchId: 'CN01' });
    expect(result.items[0]).toMatchObject({ model: 'iPhone 15 Pro', price: 21_500_000 });
  });

  it('revalidates price inside the atomic creation transaction and creates no CRM record after a price change', async () => {
    const db = fakeFirestore(deviceSeed());
    const token = await publicDeviceToken(db);
    db.documents.set('devices/DEV-1', { ...db.documents.get('devices/DEV-1'), sellPrice: 20_500_000 });
    await expect(createPublicQuickQuoteRequest(db, requestInput(token))).rejects.toMatchObject({ code: 'QUICK_QUOTE_PRICE_CHANGED' });
    expect([...db.documents.keys()].filter((path: string) => path.startsWith('customerQuoteRequests/'))).toHaveLength(0);
    expect([...db.documents.keys()].filter((path: string) => path.startsWith('leads/'))).toHaveLength(0);
    expect([...db.documents.keys()].filter((path: string) => path.startsWith('crmTasks/'))).toHaveLength(0);
  });

  it('rejects a device that is sold after viewing and never creates a Lead', async () => {
    const db = fakeFirestore(deviceSeed());
    const token = await publicDeviceToken(db);
    db.documents.set('devices/DEV-1', { ...db.documents.get('devices/DEV-1'), status: 'sold' });
    await expect(createPublicQuickQuoteRequest(db, requestInput(token))).rejects.toMatchObject({ code: 'QUICK_QUOTE_OFFER_UNAVAILABLE' });
    expect([...db.documents.keys()].some((path: string) => path.startsWith('leads/'))).toBe(false);
  });

  it('cannot reuse a device token in the repair flow or mix quote types', async () => {
    const db = fakeFirestore(deviceSeed());
    const token = await publicDeviceToken(db);
    await expect(createPublicQuickQuoteRequest(db, requestInput(token, {
      quoteType: 'REPAIR', repairModel: 'iPhone 15 Pro'
    }))).rejects.toMatchObject({ code: 'QUICK_QUOTE_SELECTION_INVALID' });
  });

  it('rejects a repair service that is not compatible with the submitted iPhone model', async () => {
    const db = fakeFirestore(deviceSeed({
      'repairServices/RS-1': { id: 'RS-1', name: 'Thay pin', publicVisible: true, isActive: true, compatibleModels: ['iPhone 15 Pro'], sellPrice: 1_200_000 }
    }));
    const token = createQuickQuoteSelectionToken({ kind: 'REPAIR', sourceId: 'RS-1', displayedPrice: 1_200_000 });
    await expect(createPublicQuickQuoteRequest(db, requestInput(token, {
      quoteType: 'REPAIR', repairModel: 'iPhone 11'
    }))).rejects.toMatchObject({ code: 'QUICK_QUOTE_REPAIR_MODEL_INCOMPATIBLE' });
  });

  it('hides actual accessory stock and rejects submit when available stock disappears', async () => {
    const db = fakeFirestore(deviceSeed({
      'products/ACC-1': { id: 'ACC-1', name: 'Cáp sạc USB-C', publicVisible: true, publicBranchIds: ['CN01'], status: 'active', retailPrice: 300_000 },
      'inventoryBalances/CN01_ACC-1': { branchId: 'CN01', productId: 'ACC-1', available: 2, onHand: 9 }
    }));
    const offers = await listPublicQuickQuoteAccessories(db, { branchId: 'CN01' });
    expect(offers.items).toHaveLength(1);
    expect(JSON.stringify(offers.items[0])).not.toMatch(/available|onHand|stockQuantity|ACC-1/);
    db.documents.set('inventoryBalances/CN01_ACC-1', { branchId: 'CN01', productId: 'ACC-1', available: 0, onHand: 9 });
    await expect(createPublicQuickQuoteRequest(db, requestInput(offers.items[0].selectionToken, {
      quoteType: 'ACCESSORY', selections: [{ selectionToken: offers.items[0].selectionToken, quantity: 1 }]
    }))).rejects.toMatchObject({ code: 'QUICK_QUOTE_OFFER_UNAVAILABLE' });
  });

  it('publishes an accessory only in branches explicitly enabled by a manager', async () => {
    const db = fakeFirestore(deviceSeed({
      'branches/CN02': { id: 'CN02', name: 'PhoneHouse Thanh Khê', isActive: true },
      'products/ACC-1': { id: 'ACC-1', name: 'Cáp sạc USB-C', publicVisible: true, publicBranchIds: ['CN01'], status: 'active', retailPrice: 300_000 },
      'inventoryBalances/CN01_ACC-1': { branchId: 'CN01', productId: 'ACC-1', available: 2 },
      'inventoryBalances/CN02_ACC-1': { branchId: 'CN02', productId: 'ACC-1', available: 5 }
    }));
    const enabledBranch = await listPublicQuickQuoteAccessories(db, { branchId: 'CN01' });
    const disabledBranch = await listPublicQuickQuoteAccessories(db, { branchId: 'CN02' });
    expect(enabledBranch.items).toHaveLength(1);
    expect(disabledBranch.items).toHaveLength(0);
  });

  it('creates request, Lead and P0 CRM task together; no on-shift Sale leaves an explicit unassigned queue item', async () => {
    const db = fakeFirestore(deviceSeed());
    const token = await publicDeviceToken(db);
    const result = await createPublicQuickQuoteRequest(db, requestInput(token));
    expect(result).toMatchObject({ quoteType: 'DEVICE', estimatedTotal: 20_000_000, responseSlaMinutes: 15, status: 'NEW' });
    expect(result.requestCode).toMatch(/^BG-\d{6}-[A-Z0-9]{5}$/);
    const requests = [...db.documents.entries()].filter(([path]: [string, Row]) => path.startsWith('customerQuoteRequests/'));
    const leads = [...db.documents.entries()].filter(([path]: [string, Row]) => path.startsWith('leads/'));
    const tasks = [...db.documents.entries()].filter(([path]: [string, Row]) => path.startsWith('crmTasks/'));
    expect(requests).toHaveLength(1);
    expect(leads).toHaveLength(1);
    expect(tasks).toHaveLength(1);
    expect(requests[0][1]).toMatchObject({ status: 'NEW', assignedStaffId: '' });
    expect(leads[0][1]).toMatchObject({ assignmentMode: 'UNASSIGNED', source: 'PhoneHouse Care · Báo giá nhanh' });
    expect(tasks[0][1]).toMatchObject({ priority: 'P0', status: 'PENDING', type: 'QUICK_QUOTE_RESPONSE' });
    const validityMs = Date.parse(result.expiresAt) - Date.now();
    expect(validityMs).toBeGreaterThan(23.9 * 60 * 60_000);
    expect(validityMs).toBeLessThanOrEqual(24 * 60 * 60_000);
  });

  it('assigns the request to an active on-shift Sale in the selected branch', async () => {
    const db = fakeFirestore(deviceSeed({
      'users/SALE-1': { id: 'SALE-1', active: true, role: 'SALES', branchId: 'CN01', displayName: 'Sale ca hiện tại' }
    }));
    const token = await publicDeviceToken(db);
    const result = await createPublicQuickQuoteRequest(db, requestInput(token));
    expect(result.status).toBe('ASSIGNED');
    const request = [...db.documents.entries()].find(([path]: [string, Row]) => path.startsWith('customerQuoteRequests/'))?.[1];
    const lead = [...db.documents.entries()].find(([path]: [string, Row]) => path.startsWith('leads/'))?.[1];
    const task = [...db.documents.entries()].find(([path]: [string, Row]) => path.startsWith('crmTasks/'))?.[1];
    expect(request).toMatchObject({ status: 'ASSIGNED', assignedStaffId: 'SALE-1', assignedStaffName: 'Sale ca hiện tại' });
    expect(lead).toMatchObject({ assignmentMode: 'AUTO_SHIFT_LOAD', assignedStaffId: 'SALE-1' });
    expect(task).toMatchObject({ assignedStaffId: 'SALE-1', priority: 'P0', status: 'PENDING' });
  });

  it('replays the same operation but rejects the same idempotency key with changed material payload', async () => {
    const db = fakeFirestore(deviceSeed());
    const token = await publicDeviceToken(db);
    const input = requestInput(token);
    const first = await createPublicQuickQuoteRequest(db, input);
    const replay = await createPublicQuickQuoteRequest(db, input);
    expect(replay).toMatchObject({ requestCode: first.requestCode, idempotentReplay: true });
    await expect(createPublicQuickQuoteRequest(db, { ...input, note: 'Nội dung khác' })).rejects.toMatchObject({ code: 'QUICK_QUOTE_IDEMPOTENCY_CONFLICT' });
    expect([...db.documents.keys()].filter((path: string) => path.startsWith('customerQuoteRequests/'))).toHaveLength(1);
  });

  it('enforces three public requests per phone per hour after exact-payload dedupe', async () => {
    const db = fakeFirestore(deviceSeed());
    const token = await publicDeviceToken(db);
    for (let index = 0; index < 3; index += 1) {
      await createPublicQuickQuoteRequest(db, requestInput(token, {
        idempotencyKey: `quick-quote-rate-${index}-0001`,
        note: `Nhu cầu số ${index}`
      }));
    }
    await expect(createPublicQuickQuoteRequest(db, requestInput(token, {
      idempotencyKey: 'quick-quote-rate-fourth-0001',
      note: 'Nhu cầu thứ tư'
    }))).rejects.toMatchObject({ code: 'QUICK_QUOTE_PHONE_RATE_LIMITED' });
  });

  it('requires App Check for the public mutation in production even when global rollout enforcement is off', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousEnforcement = process.env.APP_CHECK_ENFORCED;
    process.env.NODE_ENV = 'production';
    process.env.APP_CHECK_ENFORCED = 'false';
    let nextCalled = false;
    let responseStatus = 0;
    let responseBody: any = null;
    const response: any = {
      status(value: number) { responseStatus = value; return this; },
      json(value: any) { responseBody = value; return this; }
    };
    try {
      await requireCustomerAppCheck({ headers: {} } as any, response, () => { nextCalled = true; });
      expect(nextCalled).toBe(false);
      expect(responseStatus).toBe(401);
      expect(responseBody).toMatchObject({ code: 'APP_CHECK_REQUIRED' });
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousEnforcement === undefined) delete process.env.APP_CHECK_ENFORCED;
      else process.env.APP_CHECK_ENFORCED = previousEnforcement;
    }
  });

  it('keeps private and mutation responses out of the PhoneHouse Care service-worker cache', () => {
    const worker = fs.readFileSync('public/customer-sw.js', 'utf8');
    expect(worker).toContain("if (request.method !== 'GET') return;");
    expect(worker).toContain("const PUBLIC_API_PREFIX = '/api/customer-portal/public/'");
    expect(worker).toContain('PUBLIC_API_MAX_AGE_MS = 30_000');
    expect(worker).toContain("'Cache-Control': 'no-store'");
  });
});
