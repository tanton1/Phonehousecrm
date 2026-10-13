import { describe, expect, it } from 'vitest';
import { normalizeStorefrontCart } from '../shared/storefront';
import { getStorefrontProduct, listStorefrontProducts, loadStorefrontSnapshot, paginateStorefront, projectStorefront, publicStorefrontImage, storefrontPrice, type StorefrontSnapshot } from '../server/services/storefrontService';
import { createStorefrontOrder, listStorefrontOrders, normalizeStorefrontOrder, updateStorefrontOrder } from '../server/services/storefrontOrderService';
import { parseStorefrontIntent } from '../server/services/storefrontAssistantService';
import { storefrontMemoryDb } from './helpers/storefrontMemoryDb';

const master = (id: string, overrides = {}) => ({ id, sku: `SKU-${id}`, name: `Điện thoại ${id}`, category: 'DEVICE', model: 'iPhone 13', storage: '128GB', color: 'Xanh', condition: '99%', defaultRetailPrice: 8_000_000, status: 'active', ...overrides });
const seed = () => ({
  catalogItems: { A: master('A', { imageUrl: 'https://example.com/a.png', notes: 'private supplier data', defaultImportPrice: 6_000_000 }), B: master('B', { defaultRetailPrice: 0, color: 'Đen' }) },
  branches: { CN1: { name: 'Chi nhánh 1', isActive: true }, CN2: { name: 'Chi nhánh 2', isActive: true }, CLOSED: { isActive: false } },
  devices: { D1: { catalogItemId: 'A', status: 'in_stock', branchId: 'CN1', imei: 'PRIVATE_IMEI', costPrice: 5_000_000 }, RESERVED: { catalogItemId: 'A', status: 'reserved', branchId: 'CN2' }, SOLD: { catalogItemId: 'B', status: 'sold', branchId: 'CN1' } }
});
const order = (extra = {}) => ({ idempotencyKey: 'order-key-123456789', branchId: 'CN1', customerName: 'Khách kiểm thử', customerPhone: '0901234567', fulfillment: 'PICKUP', address: '', note: '', contactConsent: true, website: '', lines: [{ productId: 'A', quantity: 1, expectedPrice: 8_000_000 }], ...extra });

describe('catalog-first storefront', () => {
  it('shows every active master even if unpriced or out of stock, excluding inactive/archived', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('catalogItems', 'C', master('C', { lifecycleStatus: 'ARCHIVED' }));
    store.set('catalogItems', 'D', master('D', { status: 'inactive' }));
    const result = await listStorefrontProducts(store.db, {});
    expect(result.total).toBe(2);
    expect(result.items.find(item => item.id === 'A')).toMatchObject({ inStock: true, price: 8_000_000, availableBranchIds: ['CN1'] });
    expect(result.items.find(item => item.id === 'B')).toMatchObject({ inStock: false, price: null });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_IMEI|private supplier|costPrice|defaultImportPrice|notes|stockQuantity/);
  });
  it('loads beyond old 1000-row limits and traverses the entire public catalogue', async () => {
    const store = storefrontMemoryDb({ branches: seed().branches, catalogItems: Object.fromEntries(Array.from({ length: 1031 }, (_, index) => [`P${String(index).padStart(4, '0')}`, master(`P${String(index).padStart(4, '0')}`)])) });
    const seen = new Set<string>(); let cursor = '';
    do {
      const page = await listStorefrontProducts(store.db, { cursor, limit: 48 });
      page.items.forEach(item => { expect(seen.has(item.id)).toBe(false); seen.add(item.id); });
      cursor = page.nextCursor || '';
    } while (cursor);
    expect(seen.size).toBe(1031);
    expect(store.readCount()).toBeLessThan(20); // Single-flight cached snapshot, not a full read per page.
  });
  it('scopes stock by active branch without removing products from the catalogue', async () => {
    const store = storefrontMemoryDb(seed());
    expect((await listStorefrontProducts(store.db, { branchId: 'CN2' })).items.every(item => !item.inStock)).toBe(true);
    expect((await listStorefrontProducts(store.db, { branchId: 'CN2' })).total).toBe(2);
    expect((await listStorefrontProducts(store.db, { branchId: 'CN2', inStock: 'true' })).total).toBe(0);
    await expect(listStorefrontProducts(store.db, { branchId: 'CLOSED' })).rejects.toThrow('STOREFRONT_BRANCH_INVALID');
  });
  it('never matches ambiguous or explicitly conflicting legacy stock', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('catalogItems', 'C', master('C'));
    store.set('devices', 'LEGACY', { model: 'iPhone 13', storage: '128GB', color: 'Xanh', condition: '99%', status: 'in_stock', branchId: 'CN2' });
    store.set('devices', 'BAD_LINK', { catalogItemId: 'DELETED', sku: 'SKU-B', status: 'in_stock', branchId: 'CN2' });
    const all = await listStorefrontProducts(store.db, {});
    expect(all.items.find(item => item.id === 'C')?.inStock).toBe(false);
    expect(all.items.find(item => item.id === 'B')?.inStock).toBe(false);
  });
  it('uses balance availability, subtracts reservations and ignores product quantity projections', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('catalogItems', 'ACC', master('ACC', { category: 'ACCESSORY', defaultRetailPrice: 150_000 }));
    store.set('products', 'P1', { productMasterId: 'ACC', stockQuantity: 500 });
    store.set('inventoryBalances', 'BAL', { productId: 'P1', branchId: 'CN1', onHand: 3, reserved: 3, available: 3 });
    expect((await getStorefrontProduct(store.db, 'ACC')).product.inStock).toBe(false);
    store.set('inventoryBalances', 'BAL', { productId: 'P1', branchId: 'CN1', onHand: 3, reserved: 1, available: 2 });
    expect(projectStorefront(await loadStorefrontSnapshot(store.db, true)).find(item => item.id === 'ACC')?.inStock).toBe(true);
  });
  it('honors active policy branch/match priority and normalizes legacy device prices', () => {
    const item = master('A');
    const entry = { isActive: true, itemType: 'DEVICE', branchId: 'ALL', matchType: 'SKU', itemKey: item.sku, retailPrice: 7000000 };
    const policy = { entries: [entry, { ...entry, branchId: 'CN1', matchType: 'MODEL_VARIANT', itemKey: 'IPHONE 13|128GB|99%', retailPrice: 7500000 }] };
    expect(storefrontPrice(policy, 'CN1', item)).toBe(7500000);
    expect(storefrontPrice(policy, 'CN2', item)).toBe(7000000);
    expect(storefrontPrice({}, 'CN1', master('A', { defaultRetailPrice: 4950 }))).toBe(4950000);
  });
  it('keeps accessory product-id pricing even with no stock balance', async () => {
    const store = storefrontMemoryDb(seed());
    store.set('catalogItems', 'ACC', master('ACC', { category: 'ACCESSORY', defaultRetailPrice: 0 }));
    store.set('products', 'P1', { productMasterId: 'ACC', status: 'active' });
    const snapshot = await loadStorefrontSnapshot(store.db);
    snapshot.policy = { entries: [{ isActive: true, itemType: 'ACCESSORY', branchId: 'ALL', matchType: 'ITEM_ID', itemKey: 'P1', retailPrice: 150000 }] };
    expect(projectStorefront(snapshot).find(item => item.id === 'ACC')).toMatchObject({ inStock: false, price: 150000 });
  });
  it('does not advertise a cheaper out-of-stock branch as the available starting price', async () => {
    const snapshot = await loadStorefrontSnapshot(storefrontMemoryDb(seed()).db);
    snapshot.policy = { entries: [{ isActive: true, itemType: 'DEVICE', branchId: 'CN2', matchType: 'ITEM_ID', itemKey: 'A', retailPrice: 6_000_000 }] };
    expect(projectStorefront(snapshot).find(item => item.id === 'A')?.price).toBe(8_000_000);
    expect(projectStorefront(snapshot, 'CN2').find(item => item.id === 'A')).toMatchObject({ price: 6_000_000, inStock: false });
  });
  it('supports accent-insensitive search and binds cursors to filters', async () => {
    const store = storefrontMemoryDb(seed());
    const snapshot = await loadStorefrontSnapshot(store.db);
    expect(paginateStorefront(snapshot, { search: 'dien thoai' }).total).toBe(2);
    const first = paginateStorefront(snapshot, { limit: 1 });
    expect(() => paginateStorefront(snapshot, { limit: 1, cursor: first.nextCursor, kind: 'DEVICE' })).toThrow('STOREFRONT_CURSOR_INVALID');
    expect(paginateStorefront(snapshot, { minPrice: '1' }).total).toBe(1);
    expect(paginateStorefront(snapshot, { sort: 'price-desc' }).items.at(-1)?.price).toBeNull();
  });
  it('allowlists safe image URLs', () => {
    expect(publicStorefrontImage('javascript:alert(1)')).toBeNull();
    expect(publicStorefrontImage('//evil.test/a')).toBeNull();
    expect(publicStorefrontImage('/\\evil.test/a')).toBeNull();
    expect(publicStorefrontImage('https://user:pass@example.com/a')).toBeNull();
    expect(publicStorefrontImage('/catalog/a.webp')).toBe('/catalog/a.webp');
  });
});

describe('purchase request safety', () => {
  it('creates one idempotent request without reserving stock or posting financial records', async () => {
    const store = storefrontMemoryDb(seed());
    const results = await Promise.all([createStorefrontOrder(store.db, order()), createStorefrontOrder(store.db, order())]);
    expect(results[0]).toEqual(results[1]);
    expect(store.rows('storefrontOrders')).toHaveLength(1);
    expect(store.rows('storefrontOrders')[0]).toMatchObject({ stockReserved: false, paymentStatus: 'NOT_REQUESTED', shippingStatus: 'NOT_REQUESTED' });
    expect(store.get('devices', 'D1').status).toBe('in_stock');
    expect(store.rows('invoices')).toHaveLength(0);
    expect(JSON.stringify(results)).not.toMatch(/0901234567|Khách kiểm thử|payloadHash/);
    await expect(createStorefrontOrder(store.db, order({ customerName: 'Đã thay đổi' }))).rejects.toThrow('STOREFRONT_IDEMPOTENCY_CONFLICT');
  });
  it('rejects stale/client-tampered prices, even after the public cache is warm', async () => {
    const store = storefrontMemoryDb(seed());
    await listStorefrontProducts(store.db, {});
    store.set('catalogItems', 'A', master('A', { defaultRetailPrice: 9_000_000 }));
    await expect(createStorefrontOrder(store.db, order())).rejects.toThrow('STOREFRONT_PRICE_CHANGED');
    expect(store.rows('storefrontOrders')).toHaveLength(0);
    expect((await getStorefrontProduct(store.db, 'A')).product.price).toBe(9_000_000);
  });
  it('allows unpriced/no-stock enquiry while accurately flagging the estimate', async () => {
    const store = storefrontMemoryDb(seed());
    const result = await createStorefrontOrder(store.db, order({ lines: [{ productId: 'B', quantity: 1, expectedPrice: null }] }));
    expect(result).toMatchObject({ estimatedTotal: 0, hasUnpricedItems: true, status: 'NEW' });
    expect(store.rows('storefrontOrders')[0].lines[0].inStockAtRequest).toBe(false);
  });
  it('preserves ambiguous legacy links when rechecking a subset of the catalogue', async () => {
    const store = storefrontMemoryDb({
      branches: seed().branches,
      catalogItems: { A: master('A', { defaultRetailPrice: 0 }), C: master('C', { defaultRetailPrice: 0 }) },
      devices: { LEGACY: { model: 'iPhone 13', storage: '128GB', color: 'Xanh', condition: '99%', status: 'in_stock', branchId: 'CN1', retailPrice: 9_000_000 } }
    });
    expect((await getStorefrontProduct(store.db, 'A')).product).toMatchObject({ inStock: false, price: null });
    await expect(createStorefrontOrder(store.db, order({ lines: [{ productId: 'A', quantity: 1, expectedPrice: null }] }))).resolves.toMatchObject({ estimatedTotal: 0, hasUnpricedItems: true });
    expect(store.rows('storefrontOrders')[0].lines[0].inStockAtRequest).toBe(false);
  });
  it.each([{ isActive: false }, {}, { isActive: true, status: 'inactive' }])('rejects a branch withdrawn while the request is being prepared: %j', async branch => {
    const store = storefrontMemoryDb(seed());
    const transact = store.db.runTransaction;
    store.db.runTransaction = (callback: any) => {
      store.set('branches', 'CN1', branch);
      return transact(callback);
    };
    await expect(createStorefrontOrder(store.db, order())).rejects.toThrow('STOREFRONT_BRANCH_INVALID');
    expect(store.rows('storefrontOrders')).toHaveLength(0);
  });
  it('validates consent, contact, quantity, repeated lines, address and honeypot', () => {
    for (const extra of [{ contactConsent: false }, { customerPhone: '123' }, { website: 'bot' }, { lines: [] }, { lines: [{ productId: 'A', quantity: -1, expectedPrice: 8_000_000 }] }, { lines: [...order().lines, ...order().lines] }, { fulfillment: 'DELIVERY', address: 'short' }]) {
      expect(() => normalizeStorefrontOrder(order(extra))).toThrow('STOREFRONT_ORDER_INVALID');
    }
    expect(normalizeStorefrontOrder(order({ customerPhone: '+84901234567' })).customerPhone).toBe('0901234567');
  });
  it('throttles requests per phone in a transaction', async () => {
    const store = storefrontMemoryDb(seed());
    for (let index = 0; index < 5; index++) await createStorefrontOrder(store.db, order({ idempotencyKey: `order-key-0000000${index}` }));
    await expect(createStorefrontOrder(store.db, order({ idempotencyKey: 'order-key-00000006' }))).rejects.toThrow('STOREFRONT_ORDER_RATE_LIMITED');
  });
  it('scopes staff read/write and rejects stale or terminal state changes', async () => {
    const store = storefrontMemoryDb(seed());
    await createStorefrontOrder(store.db, order());
    const local = { uid: 'U1', role: 'SALE', branchId: 'CN1' }, other = { uid: 'U2', role: 'SALE', branchId: 'CN2' };
    const list = await listStorefrontOrders(store.db, local, {}), id = list.items[0].id;
    expect((await listStorefrontOrders(store.db, other, {})).items).toHaveLength(0);
    await expect(updateStorefrontOrder(store.db, other, id, { status: 'CLOSED', expectedStatus: 'NEW' })).rejects.toThrow('STOREFRONT_FORBIDDEN');
    await updateStorefrontOrder(store.db, local, id, { status: 'CONTACTED', expectedStatus: 'NEW' });
    await expect(updateStorefrontOrder(store.db, local, id, { status: 'CLOSED', expectedStatus: 'NEW' })).rejects.toThrow('STOREFRONT_STATUS_CONFLICT');
    await updateStorefrontOrder(store.db, local, id, { status: 'CLOSED', expectedStatus: 'CONTACTED' });
    await expect(updateStorefrontOrder(store.db, local, id, { status: 'CANCELLED', expectedStatus: 'CLOSED' })).rejects.toThrow('STOREFRONT_STATUS_CONFLICT');
  });
});

describe('storefront client and AI boundaries', () => {
  it('persists identifiers/quantities only and bounds corrupt storage', () => {
    expect(normalizeStorefrontCart([{ productId: 'A', quantity: 2, price: 1 }, { productId: 'A', quantity: 3 }, { productId: 'B', quantity: -1 }, { productId: '../../secret', quantity: 1 }])).toEqual([{ productId: 'A', quantity: 5 }]);
    expect(normalizeStorefrontCart('bad')).toEqual([]);
  });
  it('only accepts a bounded search intent, never model-authored prices, links or execution tools', () => {
    expect(parseStorefrontIntent('```json\n{"search":"iPhone 13","kind":"DEVICE","intent":"PRODUCT","maxPrice":10000000,"paymentUrl":"https://evil.test","tool":"sell"}\n```')).toEqual({ search: 'iPhone 13', kind: 'DEVICE', condition: '', intent: 'PRODUCT', minPrice: '', maxPrice: '10000000' });
    expect(parseStorefrontIntent('{"intent":"ADMIN","kind":"users","maxPrice":-1}')).toMatchObject({ intent: 'OTHER', kind: '', maxPrice: '' });
  });
});
