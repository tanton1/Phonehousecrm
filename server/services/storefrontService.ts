import crypto from 'node:crypto';
import { FieldPath, Firestore, Query } from 'firebase-admin/firestore';
import { canonicalDeviceModelName, deviceRetailPriceVnd, deviceVariantKeyCandidates, normalizeRetailPriceKey } from '../../shared/retailPricing';
import { STOREFRONT_KIND_NAMES, StorefrontKind, StorefrontPage, StorefrontProduct } from '../../shared/storefront';
import { normalizeOperationalPolicyVersions, selectEffectiveOperationalPolicy } from './operationalPolicyService';
import { publicProductImageUrl } from '../../shared/catalogPublicContent';
import { createStorefrontContentResolver, storefrontAccessoryMatches } from './storefrontContentService';

type Row = Record<string, any> & { id: string };
export type StorefrontSnapshot = { catalog: Row[]; models: Row[]; variantContent: Row[]; devices: Row[]; products: Row[]; balances: Row[]; parts: Row[]; branches: Row[]; policy: any; generatedAt: string };
const text = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);
export const storefrontSearchKey = (value: unknown) => text(value, 2000).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const active = (row: Row) => row.status !== 'inactive' && row.isArchived !== true && row.isActive !== false && row.active !== false && !['ARCHIVED', 'INACTIVE'].includes(row.lifecycleStatus);
export const isPublicStorefrontMaster = (row: Row) => active(row) && ['DEVICE', 'ACCESSORY', 'PART'].includes(row.category);
export const isPublicStorefrontBranch = (row: Row) => row.isActive === true && active(row);
const hash = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** No stock-dependent limit: page through every document, including zero-stock master items. */
export async function readStorefrontRows(query: Query): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor: string | null = null;
  for (;;) {
    let page = query.orderBy(FieldPath.documentId()).limit(500);
    if (cursor) page = page.startAfter(cursor);
    const snapshot = await page.get();
    rows.push(...snapshot.docs.map(document => ({ ...document.data(), id: document.id })));
    if (snapshot.docs.length < 500) break;
    cursor = snapshot.docs.at(-1)!.id;
  }
  return rows;
}

const cache = new WeakMap<Firestore, { expiresAt: number; promise: Promise<StorefrontSnapshot> }>();
export function invalidateStorefrontSnapshot(db: Firestore) { cache.delete(db); }
export function loadStorefrontSnapshot(db: Firestore, fresh = false): Promise<StorefrontSnapshot> {
  const cached = cache.get(db);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = Promise.all([
    readStorefrontRows(db.collection('catalogItems')),
    readStorefrontRows(db.collection('devices').where('status', '==', 'in_stock')),
    readStorefrontRows(db.collection('products')),
    readStorefrontRows(db.collection('inventoryBalances')),
    readStorefrontRows(db.collection('spareParts')),
    readStorefrontRows(db.collection('branches')),
    db.collection('operationalConfigs').doc('retailPricing').get(),
    readStorefrontRows(db.collection('catalogModels')),
    readStorefrontRows(db.collection('quickQuoteDeviceVariants'))
  ]).then(([catalog, devices, products, balances, parts, branches, pricing, models, variantContent]) => ({
    catalog: catalog.filter(isPublicStorefrontMaster),
    models: models.filter(active), variantContent,
    devices, products, balances, parts, branches: branches.filter(isPublicStorefrontBranch),
    policy: selectEffectiveOperationalPolicy(normalizeOperationalPolicyVersions('retailPricing', pricing.data())),
    generatedAt: new Date().toISOString()
  }));
  // A checkout refresh also replaces the public cache, so a PRICE_CHANGED
  // response can be resolved immediately by reloading the cart.
  const entry = { expiresAt: Date.now() + 30_000, promise };
  cache.set(db, entry);
  void promise.catch(() => { if (cache.get(db) === entry) cache.delete(db); });
  return promise;
}

export const publicStorefrontImage = publicProductImageUrl;

function uniqueIndex(rows: Row[], key: (row: Row) => string) {
  const index = new Map<string, string | null>();
  rows.forEach(row => { const value = key(row); if (value) index.set(value, index.has(value) ? null : row.id); });
  return index;
}
const deviceIdentity = (row: Row) => [canonicalDeviceModelName(row), row.storage || row.attributes?.storage, row.color || row.attributes?.color, row.condition || row.attributes?.condition].map(storefrontSearchKey).join('|');

export function storefrontPrice(policy: any, branchId: string, master: Row, source?: Row): number | null {
  const kind = master.category;
  const ids = [master.id, source?.id].filter(Boolean).map(normalizeRetailPriceKey);
  const skus = [master.sku, source?.sku].filter(Boolean).map(normalizeRetailPriceKey);
  const variants = [...deviceVariantKeyCandidates(master), ...(source ? deviceVariantKeyCandidates(source) : [])];
  const valid = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null;
    const amount = kind === 'DEVICE' ? deviceRetailPriceVnd(value) : Number(value);
    return Number.isSafeInteger(amount) && amount >= (kind === 'DEVICE' ? 100_000 : 1) ? amount : null;
  };
  const rank = (entry: any) => (entry.branchId === branchId ? 100 : 0) + (entry.matchType === 'ITEM_ID' ? 30 : entry.matchType === 'SKU' ? 20 : 10);
  const matches = (Array.isArray(policy?.entries) ? policy.entries : []).filter((entry: any) => {
    if (entry.isActive !== true || entry.itemType !== kind || !['ALL', branchId].includes(entry.branchId || 'ALL')) return false;
    const key = normalizeRetailPriceKey(entry.itemKey);
    return entry.matchType === 'ITEM_ID' ? ids.includes(key) : entry.matchType === 'SKU' ? skus.includes(key) : entry.matchType === 'MODEL_VARIANT' && kind === 'DEVICE' && variants.includes(key);
  }).sort((a: any, b: any) => rank(b) - rank(a));
  for (const entry of matches) { const price = valid(entry.retailPrice); if (price !== null) return price; }
  // The master is authoritative; physical inventory price is a legacy fallback only.
  return valid(master.defaultRetailPrice) ?? valid(source?.retailPrice ?? source?.sellPrice);
}

/** Allowlist public fields. Never serialize IMEI, costs, internal notes, staff or stock counts. */
export function projectStorefront(snapshot: StorefrontSnapshot, branchId = ''): StorefrontProduct[] {
  const branchIds = new Set(snapshot.branches.map(branch => branch.id));
  if (branchId && !branchIds.has(branchId)) throw new Error('STOREFRONT_BRANCH_INVALID');
  const masters = new Map(snapshot.catalog.map(row => [row.id, row]));
  const skuIndex = uniqueIndex(snapshot.catalog, row => normalizeRetailPriceKey(row.sku));
  const deviceIndex = uniqueIndex(snapshot.catalog.filter(row => row.category === 'DEVICE'), deviceIdentity);
  const linked = (row: Row, kind: StorefrontKind) => {
    const explicit = text(row.catalogItemId || row.productMasterId, 160);
    const id = explicit || skuIndex.get(normalizeRetailPriceKey(row.sku)) || (kind === 'DEVICE' && row.model && row.storage && row.color && row.condition ? deviceIndex.get(deviceIdentity(row)) : null);
    return id && masters.get(id)?.category === kind ? id : null;
  };
  const stock = new Map<string, Map<string, Row[]>>();
  const add = (id: string | null, branch: string, row: Row, available: number) => {
    if (!id || !branchIds.has(branch) || !Number.isFinite(available) || available <= 0) return;
    const branches = stock.get(id) || new Map<string, Row[]>();
    branches.set(branch, [...(branches.get(branch) || []), row]);
    stock.set(id, branches);
  };
  snapshot.devices.filter(row => row.status === 'in_stock').forEach(row => add(linked(row, 'DEVICE'), row.branchId, row, 1));
  const products = new Map(snapshot.products.filter(active).map(row => [row.id, row]));
  const productPricing = new Map<string, Row[]>();
  products.forEach(product => {
    const id = linked(product, 'ACCESSORY');
    if (id) productPricing.set(id, [...(productPricing.get(id) || []), product]);
  });
  snapshot.balances.forEach(balance => {
    const product = products.get(balance.productId);
    if (!product) return;
    const available = Math.max(0, Number(balance.onHand || 0) - Number(balance.reserved || 0));
    add(linked({ ...product, productMasterId: product.productMasterId || balance.productMasterId }, 'ACCESSORY'), balance.branchId, product, Math.min(available, Number(balance.available ?? available)));
  });
  // Parts have their own physical ledger; do not also count product projections.
  snapshot.parts.filter(active).forEach(row => add(linked(row, 'PART'), row.branchId, row, Number(row.stockQuantity || 0) - Number(row.reservedQuantity || 0)));
  const contentFor = createStorefrontContentResolver(snapshot, branchId, linked);

  return snapshot.catalog.map(master => {
    const content = contentFor(master);
    const byBranch = stock.get(master.id) || new Map<string, Row[]>();
    const scopes = branchId ? [branchId] : [...branchIds];
    // With no branch chosen, advertise prices actually available in stocked
    // branches first. An out-of-stock branch's cheaper price is not an offer.
    const priceScopes = !branchId && byBranch.size ? scopes.filter(scope => byBranch.has(scope)) : scopes;
    const priced: number[] = [];
    for (const scope of priceScopes.length ? priceScopes : ['ALL']) {
      const sources = byBranch.get(scope) || productPricing.get(master.id) || [];
      for (const source of sources.length ? sources : [undefined]) {
        const price = storefrontPrice(snapshot.policy, scope, master, source);
        if (price !== null) priced.push(price);
      }
    }
    return {
      id: master.id, sku: text(master.sku), name: text(master.displayName || master.name || master.model || master.sku),
      kind: master.category as StorefrontKind, category: text(master.categoryName || STOREFRONT_KIND_NAMES[master.category as StorefrontKind]),
      brand: text(master.brand || content.model?.brandName),
      // For accessories/parts, legacy `model` fields frequently contain the
      // phone model they fit. It is compatibility metadata, not the product's
      // own model; expose it only through compatibleModels below.
      model: master.category === 'DEVICE' ? text(master.model || content.model?.modelName || master.attributes?.model) : '',
      modelId: master.category === 'DEVICE' ? text(master.modelId || content.model?.id) : '',
      storage: text(master.storage || master.attributes?.storage), color: text(master.color || master.attributes?.color),
      condition: text(master.condition || master.attributes?.condition), region: text(master.region),
      imageUrl: content.images[0] || null, images: content.images, imageNote: content.imageNote,
      description: content.description, highlights: content.highlights, specifications: content.specifications, compatibleModels: content.compatibleModels,
      warrantyMonths: Number(master.warrantyPeriodMonths) > 0 ? Number(master.warrantyPeriodMonths) : null,
      price: priced.length ? Math.min(...priced) : null, priceIsStartingFrom: new Set(priced).size > 1,
      inStock: scopes.some(scope => byBranch.has(scope)), availableBranchIds: [...byBranch.keys()].sort()
    };
  });
}

export function paginateStorefront(snapshot: StorefrontSnapshot, input: Record<string, any>): StorefrontPage {
  const branchId = text(input.branchId, 160);
  const all = projectStorefront(snapshot, branchId);
  const search = storefrontSearchKey(input.search).slice(0, 150);
  const kind = text(input.kind, 30), brand = storefrontSearchKey(input.brand);
  const condition = ['used', 'new'].includes(input.condition) ? input.condition : '';
  const min = Math.max(0, Number(input.minPrice) || 0), max = Math.max(0, Number(input.maxPrice) || 0);
  const sort = ['price-asc', 'price-desc', 'name'].includes(input.sort) ? input.sort : 'name';
  const filterKey = hash([branchId, search, kind, brand, condition, min, max, input.inStock === 'true', sort]);
  const rawById = new Map(snapshot.catalog.map(row => [row.id, row]));
  let filtered = all.filter(item => {
    const raw = rawById.get(item.id);
    const haystack = storefrontSearchKey([item.name, item.sku, item.model, item.brand, ...(raw?.aliases || []), ...(raw?.searchTokens || [])].join(' '));
    const state = storefrontSearchKey(item.condition);
    const isUsed = /\b(cu|used|like new|likenew|da qua su dung|9[0-9])\b/.test(state);
    const isNew = !isUsed && /\b(new|moi|nguyen seal|100)\b/.test(state);
    return (!kind || item.kind === kind) && (!brand || storefrontSearchKey(item.brand) === brand)
      && (!condition || (condition === 'used' ? isUsed : isNew))
      && search.split(' ').filter(Boolean).every(term => haystack.includes(term))
      && (!min || item.price !== null && item.price >= min) && (!max || item.price !== null && item.price <= max)
      && (input.inStock !== 'true' || item.inStock);
  });
  filtered = filtered.sort((a, b) => {
    if (sort !== 'name') {
      if (a.price === null && b.price !== null) return 1;
      if (b.price === null && a.price !== null) return -1;
      const delta = (a.price || 0) - (b.price || 0);
      if (delta) return sort === 'price-asc' ? delta : -delta;
    }
    return a.name.localeCompare(b.name, 'vi') || a.id.localeCompare(b.id);
  });
  let offset = 0;
  if (input.cursor) {
    try {
      const value = JSON.parse(Buffer.from(text(input.cursor, 600), 'base64url').toString());
      if (value.key !== filterKey || !Number.isSafeInteger(value.offset) || value.offset < 0) throw new Error();
      offset = value.offset;
    } catch { throw new Error('STOREFRONT_CURSOR_INVALID'); }
  }
  const limit = Math.max(1, Math.min(48, Math.floor(Number(input.limit) || 24)));
  return {
    items: filtered.slice(offset, offset + limit), total: filtered.length, catalogTotal: all.length,
    nextCursor: offset + limit < filtered.length ? Buffer.from(JSON.stringify({ key: filterKey, offset: offset + limit })).toString('base64url') : null,
    facets: { kinds: (Object.keys(STOREFRONT_KIND_NAMES) as StorefrontKind[]).map(id => ({ id, name: STOREFRONT_KIND_NAMES[id], count: all.filter(item => item.kind === id).length })), brands: [...new Set(all.filter(item => !kind || item.kind === kind).map(item => item.brand).filter(Boolean))].sort() },
    generatedAt: snapshot.generatedAt
  };
}

export async function listStorefrontProducts(db: Firestore, input: Record<string, any>) {
  return paginateStorefront(await loadStorefrontSnapshot(db), input);
}
export async function getStorefrontProduct(db: Firestore, id: string, branchId = '') {
  const snapshot = await loadStorefrontSnapshot(db);
  const all = projectStorefront(snapshot, branchId);
  const product = all.find(item => item.id === id);
  if (!product) throw new Error('STOREFRONT_PRODUCT_NOT_FOUND');
  const master = snapshot.catalog.find(item => item.id === id)!;
  const matches = (row: Row) => product.kind === 'DEVICE' ? row.category === 'ACCESSORY' && storefrontAccessoryMatches(master, row, snapshot.models) : storefrontAccessoryMatches(row, master, snapshot.models);
  const relatedIds = new Set(snapshot.catalog.filter(matches).map(item => item.id));
  const related = all.filter(item => item.id !== id && relatedIds.has(item.id)).sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.name.localeCompare(b.name, 'vi') || a.id.localeCompare(b.id)).slice(0, 12);
  return {
    product,
    // A part/accessory's model reference is compatibility, not its own identity.
    variants: product.kind === 'DEVICE' ? all.filter(item => item.kind === 'DEVICE' && (product.modelId ? item.modelId === product.modelId : item.model && item.model === product.model && item.brand === product.brand)) : [product],
    relatedAccessories: product.kind === 'DEVICE' ? related : [],
    compatibleDevices: product.kind !== 'DEVICE' ? related : []
  };
}
