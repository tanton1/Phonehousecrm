import crypto from 'crypto';
import { Firestore } from 'firebase-admin/firestore';
import { AuthenticatedUser } from '../middleware/authenticateFirebase';
import { getIphoneCatalogSeed, IPHONE_SEED_VERSION } from '../data/iphoneCatalogSeed';

/**
 * Product Master is deliberately separate from physical stock.  This service
 * owns only catalogModels, catalogDictionaries, catalogItems and their SKU
 * registries.  `products`, `spareParts` and serialized `devices` remain
 * inventory projections and are never created here.
 */
export type CatalogCategory = 'DEVICE' | 'PART' | 'ACCESSORY';
export type CatalogCatalogKind = CatalogCategory | 'SERVICE';
export type CatalogDictionaryType = 'BRAND' | 'FAMILY' | 'CATEGORY' | 'ATTRIBUTE' | 'TEMPLATE';

export interface CatalogModelRecord {
  id: string;
  brandCode: string;
  brandName: string;
  seriesCode?: string;
  seriesName?: string;
  /** Product family is setup data. It is independent from the Brand. */
  familyId?: string;
  familyCode?: string;
  familyName?: string;
  modelCode: string;
  modelName: string;
  releaseYear?: number;
  aliases: string[];
  searchTokens: string[];
  active: boolean;
  lifecycleStatus?: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  createdByUid: string;
  updatedByUid: string;
}

export interface CatalogDictionaryRecord {
  id: string;
  dictionaryType: CatalogDictionaryType;
  key: string;
  code: string;
  name: string;
  parentId?: string;
  kind?: CatalogCatalogKind;
  familyId?: string;
  familyCode?: string;
  groupId?: string;
  groupCode?: string;
  /** Simple screen configuration, e.g. group kind or template attributes. */
  config?: Record<string, unknown>;
  aliases: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUid: string;
  updatedByUid: string;
}

export interface CatalogSkuSegment {
  /** A setup-owned stable code, for example GX, OLED, 256, TTN. */
  code: string;
  /** Human label used only for the product name and aliases. */
  label?: string;
  /** Optional attribute key, for example technology, color or storage. */
  key?: string;
}

export interface CatalogVariantInput {
  id?: string;
  skuSegments: CatalogSkuSegment[];
  /** A deliberate per-cell display name; SKU is still generated from codes. */
  name?: string;
  nameSegments?: string[];
  posShortName?: string;
  aliases?: string[];
  attributes?: Record<string, string | number | boolean | null | undefined>;
  defaultImportPrice?: number;
  defaultRetailPrice?: number;
  wholesalePrice?: number;
  barcode?: string;
  imageUrl?: string;
  warrantyPeriodMonths?: number;
  vatRate?: number;
  minStockLevel?: number;
  maxStockLevel?: number;
  notes?: string;
}

export interface CatalogBulkInput {
  /** Required only for a write; lets retrying a browser request be safe. */
  operationKey?: string;
  category: CatalogCategory;
  /** Code selected from setup, such as IP, MH, PIN or CL. Never inferred. */
  categoryCode: string;
  /** Setup-owned display label for the selected category. */
  categoryName?: string;
  subCategoryId?: string;
  subCategoryName?: string;
  subCategoryCode?: string;
  brandName?: string;
  brandCode?: string;
  unit?: string;
  /** Required setup code for the unit dictionary entry (ATTRIBUTE / UNIT). */
  unitCode?: string;
  modelIds?: string[];
  /** Legacy import identifier; it is resolved to an existing Model Master. */
  modelScope?: { code: string; name: string; id?: string };
  /** Each selected matrix cell is one variant; server creates model x variant. */
  variants: CatalogVariantInput[];
  compatibleModelIds?: string[];
  defaultAttributes?: Record<string, string | number | boolean | null | undefined>;
  status?: 'active' | 'inactive';
}

export interface CatalogImportRow extends Omit<CatalogBulkInput, 'variants' | 'modelIds'> {
  rowNumber?: number;
  modelId?: string;
  modelIds?: string[];
  variant?: CatalogVariantInput;
  variants?: CatalogVariantInput[];
}

export interface CatalogCloneInput {
  operationKey?: string;
  sourceModelId?: string;
  targetModelId?: string;
  category?: CatalogCategory;
  /** Preview draft.id values, generated target SKU values, or source item ids. */
  selectedClientKeys?: string[];
  selectedSkus?: string[];
}

/**
 * Compatibility shape used by the catalog UI matrix. It is deliberately code
 * driven: labels may improve names/search but never determine a SKU segment.
 */
export interface CatalogCandidateInput {
  clientKey?: string;
  kind?: CatalogCategory;
  category?: CatalogCategory;
  categoryCode: string;
  categoryName?: string;
  subCategoryId?: string;
  subCategoryName?: string;
  subCategoryCode?: string;
  brandCode?: string;
  brandName?: string;
  manufacturerCode?: string;
  manufacturerName?: string;
  qualityCode?: string;
  qualityName?: string;
  storageCode?: string;
  storageName?: string;
  colorCode?: string;
  colorName?: string;
  conditionCode?: string;
  conditionName?: string;
  variantCode?: string;
  variantName?: string;
  modelId?: string;
  modelCode?: string;
  modelName?: string;
  unit?: string;
  unitCode?: string;
  skuSegments?: CatalogSkuSegment[];
  attributes?: Record<string, string | number | boolean | null | undefined>;
  aliases?: string[];
  name?: string;
  posShortName?: string;
  defaultImportPrice?: number;
  defaultRetailPrice?: number;
  wholesalePrice?: number;
  barcode?: string;
  imageUrl?: string;
  warrantyPeriodMonths?: number;
  vatRate?: number;
  minStockLevel?: number;
  maxStockLevel?: number;
  notes?: string;
  status?: 'active' | 'inactive';
  compatibleModelIds?: string[];
}

type ResolvedModel = Pick<CatalogModelRecord, 'id' | 'modelCode' | 'modelName'> & {
  brandCode?: string;
  brandName?: string;
  /** Setup-owned short names such as 15PM; never participate in the SKU. */
  aliases?: string[];
};

export interface CatalogDraft {
  id: string;
  sku: string;
  skuNormalized: string;
  name: string;
  displayName: string;
  posShortName: string;
  aliases: string[];
  searchTokens: string[];
  category: CatalogCategory;
  parentCategoryId: CatalogCategory;
  categoryCode: string;
  categoryName: string;
  subCategory?: string;
  subCategoryId?: string;
  subCategoryCode?: string;
  brand?: string;
  brandCode?: string;
  unit: string;
  unitCode: string;
  model?: string;
  modelId?: string;
  modelCode?: string;
  compatibleModels: string[];
  compatibleModelIds: string[];
  compatibleModelCodes: string[];
  skuSegments: CatalogSkuSegment[];
  attributes: Record<string, string | number | boolean | null | undefined>;
  storage?: string;
  color?: string;
  condition?: string;
  region?: string;
  barcode?: string;
  imageUrl?: string;
  defaultImportPrice: number;
  defaultRetailPrice: number;
  wholesalePrice?: number;
  minStockLevel?: number;
  maxStockLevel?: number;
  warrantyPeriodMonths?: number;
  vatRate?: number;
  notes?: string;
  status: 'active' | 'inactive';
  masterVersion: 2;
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

export interface CatalogPreviewResult {
  candidates: CatalogDraft[];
  totalCount: number;
  newCount: number;
  existingCount: number;
  duplicateCount: number;
  invalid: Array<{ index: number; error: string; rowNumber?: number }>;
  existing: Array<{ sku: string; catalogItemId?: string; reason: 'EXISTING_SKU' | 'DUPLICATE_IN_REQUEST' }>;
  nearDuplicates: Array<{ sku: string; name: string; similarTo: string }>;
}

const MAX_BULK_CANDIDATES = 300;
const MAX_IMPORT_ROWS = 500;
const CATALOG_COLLECTION = 'catalogItems';
const SKU_REGISTRY_COLLECTION = 'catalogSkuRegistry';
const MODELS_COLLECTION = 'catalogModels';
const MODEL_REGISTRY_COLLECTION = 'catalogModelCodeRegistry';
const DICTIONARIES_COLLECTION = 'catalogDictionaries';
const OPERATIONS_COLLECTION = 'catalogBulkOperations';

/**
 * Read-model contract for the Product Master browser.  Inventory must not be
 * consulted here: this endpoint describes catalog definitions only.
 */
export interface CatalogListOptions {
  limit?: number;
  cursor?: string;
  search?: string;
  kind?: CatalogCategory;
  includeArchived?: boolean;
  /** Operational selectors (POS/receiving) must not receive disabled SKU definitions. */
  activeOnly?: boolean;
}

export interface CatalogListSummary {
  /** Visible records across all three Product Master groups. */
  total: number;
  DEVICE: number;
  PART: number;
  ACCESSORY: number;
  /** Archived records are never included in total unless explicitly requested. */
  archived: number;
  /** Records matching the current kind/search filters. */
  matching: number;
}

export interface CatalogListResult {
  items: any[];
  nextCursor?: string;
  hasMore: boolean;
  summary: CatalogListSummary;
}

function nowIso() {
  return new Date().toISOString();
}

function asString(value: unknown) {
  return String(value ?? '').trim();
}

/**
 * Firestore rejects an `undefined` value at any depth. Optional catalog
 * fields are intentionally omitted instead of enabling the global
 * ignoreUndefinedProperties switch, which would hide accidental bad writes
 * in unrelated modules.
 */
function compactFirestoreData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter(item => item !== undefined).map(item => compactFirestoreData(item)) as T;
  }
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      const compacted: Record<string, unknown> = {};
      Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        if (item !== undefined) compacted[key] = compactFirestoreData(item);
      });
      return compacted as T;
    }
  }
  return value;
}

function setCatalogDocument(transaction: any, ref: any, data: Record<string, unknown>, options?: any) {
  const compacted = compactFirestoreData(data);
  if (options === undefined) transaction.set(ref, compacted);
  else transaction.set(ref, compacted, options);
}

/** Converts a configured code to its canonical representation. */
export function normalizeCatalogCode(value: unknown): string {
  const code = asString(value).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!code || code.length > 48 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code)) {
    throw new Error('CATALOG_CODE_INVALID');
  }
  return code;
}

export function normalizeCatalogSku(value: unknown): string {
  return normalizeCatalogCode(value);
}

function normalizeText(value: unknown): string {
  return asString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function uniqueStrings(values: Array<unknown>, limit = 40): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach(value => {
    const item = asString(value);
    const normalized = normalizeText(item);
    if (!item || !normalized || seen.has(normalized) || result.length >= limit) return;
    seen.add(normalized);
    result.push(item);
  });
  return result;
}

export function buildCatalogAliases(values: Array<unknown>): string[] {
  const direct = uniqueStrings(values, 30);
  const variants = direct.flatMap(value => {
    const normalized = normalizeText(value);
    const compact = normalized.replace(/\s+/g, '');
    const tokens = normalized.split(' ').filter(Boolean);
    // Index contiguous phrases, not just whole labels. This keeps catalog
    // search deterministic while allowing configured aliases such as
    // “15PM GX” to resolve through Firestore array-contains.
    const phrases = tokens.flatMap((_, start) => {
      const maxLength = Math.min(4, tokens.length - start);
      return Array.from({ length: maxLength }, (_unused, offset) => tokens.slice(start, start + offset + 1).join(' '));
    });
    return [normalized, compact, ...phrases];
  });
  return uniqueStrings([...direct, ...variants], 60);
}

function requireNonEmpty(value: unknown, error: string): string {
  const result = asString(value);
  if (!result) throw new Error(error);
  return result;
}

function requirePositiveNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error('CATALOG_NUMBER_INVALID');
  return result;
}

function assertCatalogCategory(value: unknown): CatalogCategory {
  const category = asString(value).toUpperCase();
  if (!['DEVICE', 'PART', 'ACCESSORY'].includes(category)) throw new Error('CATALOG_CATEGORY_INVALID');
  return category as CatalogCategory;
}

function normalizeCatalogKind(value: unknown): CatalogCatalogKind | undefined {
  const kind = asString(value).toUpperCase();
  if (!kind) return undefined;
  if (!['DEVICE', 'PART', 'ACCESSORY', 'SERVICE'].includes(kind)) throw new Error('CATALOG_GROUP_KIND_INVALID');
  return kind as CatalogCatalogKind;
}

function safeDocId(prefix: string, source: string) {
  return `${prefix}_${crypto.createHash('sha1').update(source).digest('hex').slice(0, 22)}`;
}

function operationId(operationKey: string) {
  return safeDocId('OP', normalizeCatalogCode(operationKey));
}

function fingerprint(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function applyLegacyAttributeFields(attributes: Record<string, any>) {
  const lookup = (key: string) => attributes[key] ?? attributes[key.toUpperCase()] ?? attributes[key.toLowerCase()];
  return {
    storage: typeof lookup('storage') === 'string' ? lookup('storage') : undefined,
    color: typeof lookup('color') === 'string' ? lookup('color') : undefined,
    condition: typeof lookup('condition') === 'string' ? lookup('condition') : undefined,
    region: typeof lookup('region') === 'string' ? lookup('region') : undefined
  };
}

async function getDocument(db: any, collection: string, id: string) {
  return db.collection(collection).doc(id).get();
}

async function listCollection(db: any, collection: string): Promise<any[]> {
  const snapshot = await db.collection(collection).get();
  return Array.isArray(snapshot?.docs)
    ? snapshot.docs.map((doc: any) => ({ id: doc.id, ...(doc.data?.() || {}) }))
    : [];
}

function isArchivedCatalogItem(item: any) {
  return String(item?.lifecycleStatus || '').toUpperCase() === 'ARCHIVED';
}

function parseCatalogListKind(value: unknown): CatalogCategory | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  return assertCatalogCategory(raw);
}

function parseCatalogListLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(Math.floor(parsed), 100));
}

function parseCatalogListSearch(value: unknown) {
  const normalized = normalizeText(value);
  if (normalized.length > 120) throw new Error('CATALOG_SEARCH_TOO_LONG');
  return normalized;
}

/** The cursor is opaque so clients cannot turn it into an unbounded query. */
function encodeCatalogCursor(itemId: string) {
  return Buffer.from(JSON.stringify({ id: itemId }), 'utf8').toString('base64url');
}

function decodeCatalogCursor(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  if (raw.length > 512) throw new Error('CATALOG_CURSOR_INVALID');
  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const id = asString(decoded?.id);
    if (!id || id.length > 256) throw new Error('CATALOG_CURSOR_INVALID');
    return id;
  } catch {
    throw new Error('CATALOG_CURSOR_INVALID');
  }
}

function catalogItemSearchText(item: any) {
  return normalizeText([
    item?.sku,
    item?.skuNormalized,
    item?.name,
    item?.displayName,
    item?.posShortName,
    item?.brand,
    item?.model,
    item?.modelCode,
    item?.subCategory,
    ...(Array.isArray(item?.aliases) ? item.aliases : []),
    ...(Array.isArray(item?.searchTokens) ? item.searchTokens : []),
    ...(Array.isArray(item?.compatibleModels) ? item.compatibleModels : [])
  ].filter(Boolean).join(' '));
}

function itemMatchesCatalogList(item: any, options: Required<Pick<CatalogListOptions, 'includeArchived' | 'activeOnly'>> & { kind?: CatalogCategory; search: string }) {
  if (!options.includeArchived && isArchivedCatalogItem(item)) return false;
  if (options.activeOnly && (String(item?.lifecycleStatus || '').toUpperCase() !== 'ACTIVE' || String(item?.status || '').toLowerCase() !== 'active')) return false;
  if (options.kind && item?.category !== options.kind) return false;
  return !options.search || catalogItemSearchText(item).includes(options.search);
}

function catalogListBaseQuery(db: any, options: { kind?: CatalogCategory; search: string; activeOnly?: boolean }) {
  let query: any = db.collection(CATALOG_COLLECTION);
  if (options.search) query = query.where('searchTokens', 'array-contains', options.search);
  if (options.kind) query = query.where('category', '==', options.kind);
  if (options.activeOnly) query = query.where('lifecycleStatus', '==', 'ACTIVE');
  return query;
}

async function countCatalogQuery(query: any): Promise<number> {
  if (typeof query?.count === 'function') {
    const aggregate = await query.count().get();
    const count = Number(aggregate?.data?.()?.count);
    if (Number.isFinite(count)) return count;
  }
  const snapshot = await query.get();
  return Array.isArray(snapshot?.docs) ? snapshot.docs.length : 0;
}

async function countVisibleCatalogQuery(query: any, includeArchived: boolean, activeOnly = false) {
  const all = await countCatalogQuery(query);
  if (includeArchived || activeOnly) return all;
  const archived = await countCatalogQuery(query.where('lifecycleStatus', '==', 'ARCHIVED'));
  return Math.max(0, all - archived);
}

async function getCatalogListSummary(db: any, options: { kind?: CatalogCategory; search: string; includeArchived: boolean; activeOnly: boolean }): Promise<CatalogListSummary> {
  const allBase = catalogListBaseQuery(db, { search: '', activeOnly: options.activeOnly });
  const matchingBase = catalogListBaseQuery(db, { kind: options.kind, search: options.search, activeOnly: options.activeOnly });
  const [total, DEVICE, PART, ACCESSORY, archived, matching] = await Promise.all([
    countVisibleCatalogQuery(allBase, options.includeArchived, options.activeOnly),
    countVisibleCatalogQuery(catalogListBaseQuery(db, { kind: 'DEVICE', search: '', activeOnly: options.activeOnly }), options.includeArchived, options.activeOnly),
    countVisibleCatalogQuery(catalogListBaseQuery(db, { kind: 'PART', search: '', activeOnly: options.activeOnly }), options.includeArchived, options.activeOnly),
    countVisibleCatalogQuery(catalogListBaseQuery(db, { kind: 'ACCESSORY', search: '', activeOnly: options.activeOnly }), options.includeArchived, options.activeOnly),
    countCatalogQuery(catalogListBaseQuery(db, { search: '' }).where('lifecycleStatus', '==', 'ARCHIVED')),
    countVisibleCatalogQuery(matchingBase, options.includeArchived, options.activeOnly)
  ]);
  return { total, DEVICE, PART, ACCESSORY, archived, matching };
}

/**
 * Lists Product Master records through the server rather than a browser-wide
 * Firestore subscription. Search is backed by the deterministic
 * `searchTokens` index; the cursor is a document snapshot cursor, not a SKU
 * supplied by the client.
 */
export async function listCatalogItems(db: Firestore | any, rawOptions: CatalogListOptions = {}): Promise<CatalogListResult> {
  const options = {
    limit: parseCatalogListLimit(rawOptions.limit),
    cursorId: decodeCatalogCursor(rawOptions.cursor),
    search: parseCatalogListSearch(rawOptions.search),
    kind: parseCatalogListKind(rawOptions.kind),
    includeArchived: rawOptions.includeArchived === true,
    activeOnly: rawOptions.activeOnly === true
  };
  const collection = db.collection(CATALOG_COLLECTION);

  // The fallback keeps unit-test fakes and local adapters compatible. Real
  // Firestore always follows the ordered, bounded query path below.
  if (typeof collection?.orderBy !== 'function') {
    const all = await listCollection(db, CATALOG_COLLECTION);
    const visible = all
      .filter(item => itemMatchesCatalogList(item, options))
      .sort((left, right) => asString(left?.sku).localeCompare(asString(right?.sku)) || asString(left?.id).localeCompare(asString(right?.id)));
    const cursorIndex = options.cursorId ? visible.findIndex(item => item.id === options.cursorId) : -1;
    if (options.cursorId && cursorIndex < 0) throw new Error('CATALOG_CURSOR_INVALID');
    const candidates = visible.slice(cursorIndex + 1, cursorIndex + 1 + options.limit + 1);
    const items = candidates.slice(0, options.limit);
    const hasMore = candidates.length > items.length;
    const summary: CatalogListSummary = {
      total: all.filter(item => itemMatchesCatalogList(item, { ...options, kind: undefined, search: '' })).length,
      DEVICE: all.filter(item => itemMatchesCatalogList(item, { ...options, kind: 'DEVICE', search: '' })).length,
      PART: all.filter(item => itemMatchesCatalogList(item, { ...options, kind: 'PART', search: '' })).length,
      ACCESSORY: all.filter(item => itemMatchesCatalogList(item, { ...options, kind: 'ACCESSORY', search: '' })).length,
      archived: all.filter(isArchivedCatalogItem).length,
      matching: visible.length
    };
    return {
      items,
      nextCursor: hasMore && items.length ? encodeCatalogCursor(items[items.length - 1].id) : undefined,
      hasMore,
      summary
    };
  }

  let query: any = catalogListBaseQuery(db, options).orderBy('sku', 'asc');
  if (options.cursorId) {
    const cursorSnap = await getDocument(db, CATALOG_COLLECTION, options.cursorId);
    if (!cursorSnap?.exists) throw new Error('CATALOG_CURSOR_INVALID');
    query = query.startAfter(cursorSnap);
  }

  // Archived Product Master rows remain in the SKU registry for audit and
  // duplicate prevention. They are filtered during a bounded server scan so
  // inactive records remain visible without treating them as archived.
  const scanLimit = Math.max(options.limit + 1, Math.min(500, options.limit * 5));
  const snapshot = await query.limit(scanLimit).get();
  const scanned = Array.isArray(snapshot?.docs)
    ? snapshot.docs.map((doc: any) => ({ id: doc.id, ...(doc.data?.() || {}), __cursorId: doc.id }))
    : [];
  const visible = scanned.filter(item => itemMatchesCatalogList(item, options));
  const items = visible.slice(0, options.limit).map(({ __cursorId, ...item }) => item);
  const firstNotReturned = visible[options.limit];
  const rawMayContinue = scanned.length === scanLimit;
  const hasMore = Boolean(firstNotReturned || rawMayContinue);
  const cursorSource = firstNotReturned
    ? visible[Math.max(0, options.limit - 1)]
    : (rawMayContinue ? scanned[scanned.length - 1] : undefined);
  const summary = await getCatalogListSummary(db, options);
  return {
    items,
    nextCursor: hasMore && cursorSource?.__cursorId ? encodeCatalogCursor(cursorSource.__cursorId) : undefined,
    hasMore,
    summary
  };
}

async function resolveModels(db: Firestore | any, input: CatalogBulkInput): Promise<ResolvedModel[]> {
  const ids = [...new Set((Array.isArray(input.modelIds) ? input.modelIds : []).map(value => asString(value)).filter(Boolean))];
  if (ids.length > 0) {
    const docs = await Promise.all(ids.map(id => getDocument(db, MODELS_COLLECTION, id)));
    return docs.map((snap: any, index: number) => {
      if (!snap?.exists) throw new Error(`CATALOG_MODEL_NOT_FOUND:${ids[index]}`);
      const model = snap.data();
      if (model?.active === false) throw new Error(`CATALOG_MODEL_INACTIVE:${ids[index]}`);
      return {
        id: snap.id,
        modelCode: normalizeCatalogCode(model?.modelCode),
        modelName: requireNonEmpty(model?.modelName, 'CATALOG_MODEL_NAME_REQUIRED'),
        brandCode: normalizeCatalogCode(model?.brandCode),
        brandName: requireNonEmpty(model?.brandName, 'CATALOG_BRAND_NAME_REQUIRED'),
        aliases: uniqueStrings(Array.isArray(model?.aliases) ? model.aliases : [])
      };
    });
  }

  const scope = input.modelScope;
  if (!scope) throw new Error('CATALOG_MODEL_REQUIRED');
  const modelCode = normalizeCatalogCode(scope.code);
  const modelName = requireNonEmpty(scope.name, 'CATALOG_MODEL_SCOPE_NAME_REQUIRED');
  const models = await listCollection(db, MODELS_COLLECTION);
  const found = models.find(model =>
    model?.active !== false &&
    asString(model?.modelCode).toUpperCase() === modelCode &&
    normalizeText(model?.modelName) === normalizeText(modelName)
  );
  if (!found) throw new Error(`CATALOG_MODEL_NOT_FOUND:${modelCode}`);
  return [{
    id: asString(found.id),
    modelCode: normalizeCatalogCode(found.modelCode),
    modelName: requireNonEmpty(found.modelName, 'CATALOG_MODEL_NAME_REQUIRED'),
    brandCode: normalizeCatalogCode(found.brandCode),
    brandName: requireNonEmpty(found.brandName, 'CATALOG_BRAND_NAME_REQUIRED'),
    aliases: uniqueStrings(Array.isArray(found.aliases) ? found.aliases : [])
  }];
}

async function resolveCompatibleModels(db: Firestore | any, selectedModels: ResolvedModel[], compatibleIds: unknown): Promise<ResolvedModel[]> {
  const ids = [...new Set((Array.isArray(compatibleIds) ? compatibleIds : []).map(value => asString(value)).filter(Boolean))];
  if (!ids.length) return selectedModels;
  const selectedById = new Map(selectedModels.filter(model => model.id).map(model => [model.id, model]));
  const remaining = ids.filter(id => !selectedById.has(id));
  const docs = await Promise.all(remaining.map(id => getDocument(db, MODELS_COLLECTION, id)));
  docs.forEach((snap: any, index: number) => {
    if (!snap?.exists) throw new Error(`CATALOG_COMPATIBLE_MODEL_NOT_FOUND:${remaining[index]}`);
    const model = snap.data();
    selectedById.set(snap.id, {
      id: snap.id,
      modelCode: normalizeCatalogCode(model?.modelCode),
      modelName: requireNonEmpty(model?.modelName, 'CATALOG_MODEL_NAME_REQUIRED'),
      brandCode: normalizeCatalogCode(model?.brandCode),
      brandName: requireNonEmpty(model?.brandName, 'CATALOG_BRAND_NAME_REQUIRED'),
      aliases: uniqueStrings(Array.isArray(model?.aliases) ? model.aliases : [])
    });
  });
  return [...selectedById.values()];
}

async function getActiveCatalogDictionaries(db: Firestore | any): Promise<CatalogDictionaryRecord[]> {
  const records = await listCollection(db, DICTIONARIES_COLLECTION);
  return records.filter(record => record?.active !== false) as CatalogDictionaryRecord[];
}

/**
 * SKU codes belong to setup, not to the browser. Every category, brand and
 * variant segment used in a new master must already exist in an active
 * dictionary record. This is what prevents near-duplicate ad-hoc codes.
 */
function assertDictionarySelection(
  dictionaries: CatalogDictionaryRecord[],
  input: CatalogBulkInput,
  models: ResolvedModel[],
  variants: Array<CatalogVariantInput & { skuSegments: CatalogSkuSegment[] }>
) {
  const active = dictionaries.filter(item => item?.active !== false);
  const hasCode = (dictionaryType: CatalogDictionaryType, code: string) => active.some(item =>
    item.dictionaryType === dictionaryType && normalizeCatalogCode(item.code) === code
  );
  const categoryCode = normalizeCatalogCode(input.categoryCode);
  if (!hasCode('CATEGORY', categoryCode)) throw new Error(`CATALOG_CATEGORY_CODE_NOT_CONFIGURED:${categoryCode}`);
  if (!asString(input.unitCode)) throw new Error('CATALOG_UNIT_CODE_REQUIRED');
  const unitCode = normalizeCatalogCode(input.unitCode);
  const unit = active.find(item =>
    item.dictionaryType === 'ATTRIBUTE' &&
    normalizeCatalogCode(item.code) === unitCode &&
    normalizeText(item.key) === 'unit'
  );
  if (!unit) throw new Error(`CATALOG_UNIT_CODE_NOT_CONFIGURED:${unitCode}`);
  const brandCodes = [asString(input.brandCode), ...models.map(model => asString(model.brandCode))]
    .filter(Boolean)
    .map(normalizeCatalogCode);
  for (const brandCode of new Set(brandCodes)) {
    if (!hasCode('BRAND', brandCode)) throw new Error(`CATALOG_BRAND_CODE_NOT_CONFIGURED:${brandCode}`);
  }
  for (const variant of variants) {
    for (const segment of variant.skuSegments) {
      const dictionaryType: CatalogDictionaryType = ['manufacturer', 'brand'].includes(asString(segment.key).toLowerCase()) ? 'BRAND' : 'ATTRIBUTE';
      if (!hasCode(dictionaryType, segment.code)) {
        throw new Error(`${dictionaryType === 'BRAND' ? 'CATALOG_BRAND_CODE_NOT_CONFIGURED' : 'CATALOG_ATTRIBUTE_CODE_NOT_CONFIGURED'}:${segment.code}`);
      }
    }
  }
  return { unit, category: active.find(item => item.dictionaryType === 'CATEGORY' && normalizeCatalogCode(item.code) === categoryCode)! };
}

function normalizeVariant(input: CatalogVariantInput): CatalogVariantInput & { skuSegments: CatalogSkuSegment[] } {
  const rawSegments = Array.isArray(input?.skuSegments) ? input.skuSegments : [];
  if (!rawSegments.length) throw new Error('CATALOG_VARIANT_SEGMENT_REQUIRED');
  return {
    ...input,
    skuSegments: rawSegments.map(segment => ({
      code: normalizeCatalogCode(segment?.code),
      label: asString(segment?.label),
      key: asString(segment?.key)
    }))
  };
}

/**
 * Turns selected model(s) and matrix cells into immutable Product Master
 * drafts. It uses only explicit setup codes; nothing is guessed from a name.
 */
export async function generateCatalogDrafts(
  db: Firestore | any,
  rawInput: CatalogBulkInput,
  dictionaryRecords?: CatalogDictionaryRecord[]
): Promise<CatalogDraft[]> {
  const input: CatalogBulkInput = rawInput || ({} as CatalogBulkInput);
  const category = assertCatalogCategory(input.category);
  const categoryCode = normalizeCatalogCode(input.categoryCode);
  const selectedModels = await resolveModels(db, input);
  const compatibleModels = await resolveCompatibleModels(db, selectedModels, input.compatibleModelIds);
  const variants = (Array.isArray(input.variants) ? input.variants : []).map(normalizeVariant);
  if (!variants.length) throw new Error('CATALOG_VARIANT_REQUIRED');
  if (selectedModels.length * variants.length > MAX_BULK_CANDIDATES) throw new Error('CATALOG_BULK_LIMIT_EXCEEDED');
  const dictionaries = dictionaryRecords || await getActiveCatalogDictionaries(db);
  const dictionarySelection = assertDictionarySelection(dictionaries, input, selectedModels, variants);
  const categoryName = dictionarySelection.category.name;
  const canonicalVariants = variants.map(variant => ({
    ...variant,
    skuSegments: variant.skuSegments.map(segment => {
      const type: CatalogDictionaryType = ['manufacturer', 'brand'].includes(asString(segment.key).toLowerCase()) ? 'BRAND' : 'ATTRIBUTE';
      const configured = dictionaries.find(item => item.dictionaryType === type && normalizeCatalogCode(item.code) === segment.code);
      return { ...segment, label: configured?.name || segment.label };
    })
  }));

  const brandCode = asString(input.brandCode) ? normalizeCatalogCode(input.brandCode) : undefined;
  const commonAttributes = { ...(input.defaultAttributes || {}) };
  const commonAliasInputs = [categoryName, input.subCategoryName];

  return selectedModels.flatMap(model => canonicalVariants.map(variant => {
    const skuSegments = [
      { code: categoryCode, label: categoryName, key: 'category' },
      { code: model.modelCode, label: model.modelName, key: 'model' },
      ...variant.skuSegments
    ];
    const sku = skuSegments.map(segment => segment.code).join('-');
    const nameSegments = [
      categoryName,
      model.modelName,
      ...variant.skuSegments.map(segment => asString(segment.label)).filter(Boolean)
    ];
    const name = asString(variant.name) || uniqueStrings(nameSegments, 40).join(' ') || sku;
    const posShortName = asString(variant.posShortName) || [model.modelName, ...variant.skuSegments.map(segment => segment.label).filter(Boolean)].join(' ').trim() || name;
    const attributes = { ...commonAttributes, ...(variant.attributes || {}) };
    const prices = {
      defaultImportPrice: requirePositiveNumber(variant.defaultImportPrice, 0),
      defaultRetailPrice: requirePositiveNumber(variant.defaultRetailPrice, 0),
      wholesalePrice: variant.wholesalePrice === undefined ? undefined : requirePositiveNumber(variant.wholesalePrice),
      minStockLevel: variant.minStockLevel === undefined ? undefined : requirePositiveNumber(variant.minStockLevel),
      maxStockLevel: variant.maxStockLevel === undefined ? undefined : requirePositiveNumber(variant.maxStockLevel),
      warrantyPeriodMonths: variant.warrantyPeriodMonths === undefined ? undefined : requirePositiveNumber(variant.warrantyPeriodMonths),
      vatRate: variant.vatRate === undefined ? undefined : requirePositiveNumber(variant.vatRate)
    };
    const resolvedBrandCode = brandCode || model.brandCode || undefined;
    const resolvedBrandName = resolvedBrandCode
      ? dictionaries.find(item => item.dictionaryType === 'BRAND' && normalizeCatalogCode(item.code) === resolvedBrandCode)?.name
      : undefined;
    // Explicit Model Master aliases are the most useful POS search phrases,
    // so reserve index space for them before canonical long names/codes.
    const modelSearchAliases = uniqueStrings([...(model.aliases || []), model.modelCode, model.modelName], 12);
    const variantSearchLabels = variant.skuSegments.map(segment => segment.label || segment.code).filter(Boolean);
    const variantSearchCodes = variant.skuSegments.map(segment => segment.code).filter(Boolean);
    // SKU stays exactly category-model-variant. These phrases only enrich the
    // search index using aliases explicitly configured on Model Master.
    const combinedSearchAliases = modelSearchAliases.flatMap(modelAlias => [
      [categoryName, modelAlias, ...variantSearchLabels].filter(Boolean).join(' '),
      [categoryCode, modelAlias, ...variantSearchCodes].filter(Boolean).join(' '),
      [modelAlias, ...variantSearchLabels].filter(Boolean).join(' ')
    ]);
    const aliases = buildCatalogAliases([
      // Keep the raw server-issued SKU in the first search-token slots.
      // Normalized phrases are useful, but must not displace exact SKU lookup.
      sku,
      ...combinedSearchAliases,
      name,
      posShortName,
      ...modelSearchAliases,
      categoryName,
      resolvedBrandName,
      ...commonAliasInputs,
      ...variant.skuSegments.map(segment => segment.label || segment.code),
      ...(variant.aliases || [])
    ]);
    const legacy = applyLegacyAttributeFields(attributes);
    return {
      id: safeDocId('CAT', sku),
      sku,
      skuNormalized: normalizeCatalogSku(sku),
      name,
      displayName: name,
      posShortName,
      aliases,
      searchTokens: buildCatalogAliases(aliases),
      category,
      parentCategoryId: category,
      categoryCode,
      categoryName,
      subCategory: asString(input.subCategoryName) || undefined,
      subCategoryId: asString(input.subCategoryId) || undefined,
      subCategoryCode: asString(input.subCategoryCode) ? normalizeCatalogCode(input.subCategoryCode) : undefined,
      brand: resolvedBrandName || model.brandName || undefined,
      brandCode: resolvedBrandCode,
      unit: dictionarySelection.unit.name,
      unitCode: normalizeCatalogCode(dictionarySelection.unit.code),
      model: model.modelName,
      modelId: model.id || undefined,
      modelCode: model.modelCode,
      compatibleModels: compatibleModels.map(item => item.modelName),
      compatibleModelIds: compatibleModels.map(item => item.id).filter(Boolean),
      compatibleModelCodes: compatibleModels.map(item => item.modelCode),
      skuSegments,
      attributes,
      ...legacy,
      barcode: asString(variant.barcode) || undefined,
      imageUrl: asString(variant.imageUrl) || undefined,
      ...prices,
      notes: asString(variant.notes) || undefined,
      status: input.status === 'inactive' ? 'inactive' : 'active',
      masterVersion: 2,
      lifecycleStatus: input.status === 'inactive' ? 'INACTIVE' : 'ACTIVE'
    };
  }));
}

async function queryFirstCatalogItem(db: any, field: string, value: string) {
  try {
    const baseQuery = db.collection(CATALOG_COLLECTION).where(field, '==', value);
    const query = typeof baseQuery?.limit === 'function' ? baseQuery.limit(1) : baseQuery;
    const snapshot = await query.get();
    const doc = Array.isArray(snapshot?.docs) ? snapshot.docs[0] : undefined;
    return doc ? { id: doc.id, ...(doc.data?.() || {}) } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Look up just the candidate SKUs. The legacy exact-SKU query remains a
 * compatibility guard until the older catalog is gradually indexed, while the
 * registry provides the race-safe authoritative uniqueness guarantee.
 */
async function getCatalogSkuIndex(db: Firestore | any, candidateSkus?: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const requested = [...new Set((candidateSkus || []).map(value => {
    try { return normalizeCatalogSku(value); } catch { return ''; }
  }).filter(Boolean))];

  if (!requested.length) {
    const documents = await listCollection(db, CATALOG_COLLECTION);
    documents.forEach(item => {
      try {
        const sku = normalizeCatalogSku(item?.skuNormalized || item?.sku);
        result.set(sku, asString(item?.id));
      } catch {
        // Legacy incomplete documents are intentionally ignored, never rewritten.
      }
    });
    return result;
  }

  await mapConcurrent(requested, 16, async sku => {
    const registrySnap = await getDocument(db, SKU_REGISTRY_COLLECTION, sku);
    if (registrySnap?.exists) {
      result.set(sku, asString(registrySnap.data()?.catalogItemId));
      return;
    }
    // New records use skuNormalized; older records only expose sku.
    const [canonical, legacy] = await Promise.all([
      queryFirstCatalogItem(db, 'skuNormalized', sku),
      queryFirstCatalogItem(db, 'sku', sku)
    ]);
    const match = canonical || legacy;
    if (match?.id) result.set(sku, match.id);
  });
  return result;
}

function nearDuplicateSignature(draft: CatalogDraft) {
  return normalizeText([draft.category, draft.modelCode, draft.name].join(' '));
}

/** Preview is side-effect free and is the same deterministic calculation used by create. */
export async function previewCatalogBulk(db: Firestore | any, input: CatalogBulkInput): Promise<CatalogPreviewResult> {
  const drafts = await generateCatalogDrafts(db, input);
  const existingSkus = await getCatalogSkuIndex(db, drafts.map(draft => draft.skuNormalized));
  const seen = new Set<string>();
  const existing: CatalogPreviewResult['existing'] = [];
  const candidates: CatalogDraft[] = [];
  let duplicateCount = 0;

  drafts.forEach(draft => {
    if (seen.has(draft.skuNormalized)) {
      duplicateCount += 1;
      existing.push({ sku: draft.sku, reason: 'DUPLICATE_IN_REQUEST' });
      return;
    }
    seen.add(draft.skuNormalized);
    const existingItemId = existingSkus.get(draft.skuNormalized);
    if (existingItemId) {
      existing.push({ sku: draft.sku, catalogItemId: existingItemId, reason: 'EXISTING_SKU' });
      return;
    }
    candidates.push(draft);
  });

  const signatures = new Map<string, CatalogDraft>();
  const nearDuplicates: CatalogPreviewResult['nearDuplicates'] = [];
  candidates.forEach(candidate => {
    const signature = nearDuplicateSignature(candidate);
    const earlier = signatures.get(signature);
    if (earlier && earlier.sku !== candidate.sku) {
      nearDuplicates.push({ sku: candidate.sku, name: candidate.name, similarTo: earlier.sku });
    } else {
      signatures.set(signature, candidate);
    }
  });

  return {
    candidates,
    totalCount: drafts.length,
    newCount: candidates.length,
    existingCount: existing.filter(item => item.reason === 'EXISTING_SKU').length,
    duplicateCount,
    invalid: [],
    existing,
    nearDuplicates
  };
}

function resolveOperationKey(value: unknown, payload: unknown, actor: AuthenticatedUser) {
  // If UI did not supply a key yet, derive a stable key from actor + payload.
  // A retry of the same request is therefore safe; UI can retain the returned
  // key for explicit retry/status handling later.
  const supplied = asString(value);
  const operationKey = normalizeCatalogCode(supplied || `AUTO-${fingerprint({ actorUid: actor.uid, payload }).slice(0, 20)}`);
  if (operationKey.length < 8) throw new Error('CATALOG_OPERATION_KEY_REQUIRED');
  return operationKey;
}

async function initializeOperation(db: Firestore | any, operationKey: string, payloadFingerprint: string, actor: AuthenticatedUser) {
  const ref = db.collection(OPERATIONS_COLLECTION).doc(operationId(operationKey));
  let result: any;
  await db.runTransaction(async (transaction: any) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const data = existing.data();
      if (data?.payloadFingerprint !== payloadFingerprint) throw new Error('CATALOG_IDEMPOTENCY_PAYLOAD_MISMATCH');
      result = { replay: ['COMPLETED', 'ROLLED_BACK', 'ROLLBACK_PARTIAL'].includes(String(data?.status || '')), data: { id: existing.id, ...data } };
      return;
    }
    const createdAt = nowIso();
    const data = {
      operationKey,
      payloadFingerprint,
      status: 'PROCESSING',
      createdAt,
      updatedAt: createdAt,
      createdByUid: actor.uid
    };
    setCatalogDocument(transaction, ref, data);
    result = { replay: false, data: { id: ref.id, ...data } };
  });
  return { ref, ...result };
}

async function finishOperation(db: Firestore | any, ref: any, result: any, actor: AuthenticatedUser) {
  await db.runTransaction(async (transaction: any) => {
    const current = await transaction.get(ref);
    if (!current.exists) return;
    setCatalogDocument(transaction, ref, {
      ...current.data(),
      status: 'COMPLETED',
      result,
      completedAt: nowIso(),
      updatedAt: nowIso(),
      updatedByUid: actor.uid
    }, { merge: false });
  });
}

async function createCatalogDraft(
  db: Firestore | any,
  draft: CatalogDraft,
  legacySkuIndex: Map<string, string>,
  actor: AuthenticatedUser,
  sourceOperation?: { id: string; operationKey: string }
) {
  const itemRef = db.collection(CATALOG_COLLECTION).doc(draft.id);
  const registryRef = db.collection(SKU_REGISTRY_COLLECTION).doc(draft.skuNormalized);
  let result: any;
  await db.runTransaction(async (transaction: any) => {
    // All reads intentionally happen before any write, matching Firestore transaction rules.
    const [registrySnap, itemSnap] = await Promise.all([transaction.get(registryRef), transaction.get(itemRef)]);
    if (registrySnap.exists) {
      const registry = registrySnap.data();
      result = { status: 'EXISTING', sku: draft.sku, catalogItemId: registry?.catalogItemId || itemSnap?.id || draft.id };
      return;
    }
    const legacyItemId = legacySkuIndex.get(draft.skuNormalized);
    if (legacyItemId) {
      setCatalogDocument(transaction, registryRef, {
        sku: draft.sku,
        skuNormalized: draft.skuNormalized,
        catalogItemId: legacyItemId,
        registeredFrom: 'LEGACY_CATALOG',
        createdAt: nowIso(),
        createdByUid: actor.uid
      });
      result = { status: 'EXISTING', sku: draft.sku, catalogItemId: legacyItemId };
      return;
    }
    if (itemSnap.exists) {
      const current = itemSnap.data();
      if (normalizeCatalogSku(current?.sku || '') !== draft.skuNormalized) throw new Error('CATALOG_ITEM_ID_COLLISION');
      setCatalogDocument(transaction, registryRef, {
        sku: draft.sku,
        skuNormalized: draft.skuNormalized,
        catalogItemId: itemSnap.id,
        createdAt: nowIso(),
        createdByUid: actor.uid
      });
      result = { status: 'EXISTING', sku: draft.sku, catalogItemId: itemSnap.id };
      return;
    }
    const timestamp = nowIso();
    const item = {
      ...draft,
      sourceOperationId: sourceOperation?.id,
      sourceOperationKey: sourceOperation?.operationKey,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdByUid: actor.uid,
      updatedByUid: actor.uid
    };
    setCatalogDocument(transaction, itemRef, item);
    setCatalogDocument(transaction, registryRef, {
      sku: draft.sku,
      skuNormalized: draft.skuNormalized,
      catalogItemId: draft.id,
      createdAt: timestamp,
      createdByUid: actor.uid
    });
    result = { status: 'CREATED', sku: draft.sku, catalogItemId: draft.id, item };
  });
  return result;
}

async function mapConcurrent<T, R>(items: T[], limit: number, operation: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await operation(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Server-authoritative write with an SKU registry to prevent races and retries. */
export async function processCatalogBulkCreate(db: Firestore | any, input: CatalogBulkInput, actor: AuthenticatedUser) {
  const operationKey = resolveOperationKey(input.operationKey, { ...input, operationKey: undefined }, actor);
  const payloadFingerprint = fingerprint({ ...input, operationKey: undefined });
  const operation = await initializeOperation(db, operationKey, payloadFingerprint, actor);
  if (operation.replay) return { ...(operation.data?.result || {}), idempotentReplay: true };

  const preview = await previewCatalogBulk(db, input);
  const legacySkuIndex = await getCatalogSkuIndex(db, preview.candidates.map(candidate => candidate.skuNormalized));
  const outcomes = await mapConcurrent(preview.candidates, 8, draft => createCatalogDraft(db, draft, legacySkuIndex, actor, {
    id: operation.data.id,
    operationKey
  }));
  const created = outcomes.filter(item => item.status === 'CREATED');
  const existing = outcomes.filter(item => item.status === 'EXISTING');
  const response = {
    operationKey,
    totalCount: preview.totalCount,
    createdCount: created.length,
    skippedExistingCount: preview.existing.length + existing.length,
    created: created.map(item => ({ sku: item.sku, catalogItemId: item.catalogItemId, item: item.item })),
    skipped: [...preview.existing, ...existing.map(item => ({ sku: item.sku, catalogItemId: item.catalogItemId, reason: 'EXISTING_SKU' }))],
    nearDuplicates: preview.nearDuplicates
  };
  await finishOperation(db, operation.ref, response, actor);
  return response;
}

function asSingleItemBulkInput(input: any): CatalogBulkInput {
  if (Array.isArray(input?.variants)) return input as CatalogBulkInput;
  const variant: CatalogVariantInput = input?.variant || {
    skuSegments: Array.isArray(input?.skuSegments) ? input.skuSegments : [],
    nameSegments: Array.isArray(input?.nameSegments) ? input.nameSegments : [],
    posShortName: input?.posShortName,
    aliases: input?.aliases,
    attributes: input?.attributes,
    defaultImportPrice: input?.defaultImportPrice,
    defaultRetailPrice: input?.defaultRetailPrice,
    wholesalePrice: input?.wholesalePrice,
    barcode: input?.barcode,
    imageUrl: input?.imageUrl,
    warrantyPeriodMonths: input?.warrantyPeriodMonths,
    vatRate: input?.vatRate,
    minStockLevel: input?.minStockLevel,
    maxStockLevel: input?.maxStockLevel,
    notes: input?.notes
  };
  return {
    ...input,
    modelIds: input?.modelIds || (input?.modelId ? [input.modelId] : []),
    variants: [variant]
  };
}

export async function processCreateCatalogItem(db: Firestore | any, input: any, actor: AuthenticatedUser) {
  return processCatalogBulkCreate(db, asSingleItemBulkInput(input), actor);
}

function candidateSegment(code: unknown, label: unknown, key: string): CatalogSkuSegment | null {
  return asString(code) ? { code: asString(code), label: asString(label), key } : null;
}

/** Converts one UI matrix cell into the strict server generation shape. */
export function catalogCandidateToImportRow(candidate: CatalogCandidateInput | any): CatalogImportRow {
  const explicitSegments = Array.isArray(candidate?.skuSegments)
    ? candidate.skuSegments.map((segment: any) => typeof segment === 'string' ? { code: segment } : segment)
    : [];
  const inferredSegments = [
    candidateSegment(candidate?.manufacturerCode, candidate?.manufacturerName, 'manufacturer'),
    candidateSegment(candidate?.qualityCode, candidate?.qualityName, 'quality'),
    candidateSegment(candidate?.storageCode, candidate?.storageName, 'storage'),
    candidateSegment(candidate?.colorCode, candidate?.colorName, 'color'),
    candidateSegment(candidate?.conditionCode, candidate?.conditionName, 'condition'),
    candidateSegment(candidate?.variantCode, candidate?.variantName, 'variant')
  ].filter((segment): segment is CatalogSkuSegment => Boolean(segment));
  const attributes = { ...(candidate?.attributes || {}) } as Record<string, string | number | boolean | null | undefined>;
  if (asString(candidate?.storageName)) attributes.storage = asString(candidate.storageName);
  if (asString(candidate?.colorName)) attributes.color = asString(candidate.colorName);
  if (asString(candidate?.conditionName)) attributes.condition = asString(candidate.conditionName);
  const nameSegments = [
    candidate?.manufacturerName,
    candidate?.qualityName,
    candidate?.storageName,
    candidate?.colorName,
    candidate?.conditionName,
    candidate?.variantName
  ].map(asString).filter(Boolean);
  return {
    category: (candidate?.kind || candidate?.category) as CatalogCategory,
    categoryCode: candidate?.categoryCode,
    categoryName: candidate?.categoryName,
    subCategoryId: candidate?.subCategoryId,
    subCategoryName: candidate?.subCategoryName,
    subCategoryCode: candidate?.subCategoryCode,
    // Parts/accessories are branded by their manufacturer. Device candidates
    // have no manufacturer override and therefore retain the model brand.
    brandCode: candidate?.manufacturerCode || candidate?.brandCode,
    brandName: candidate?.manufacturerName || candidate?.brandName,
    unit: candidate?.unit,
    unitCode: candidate?.unitCode,
    modelId: candidate?.modelId,
    modelScope: candidate?.modelId ? undefined : (asString(candidate?.modelCode) && asString(candidate?.modelName)
      ? { code: asString(candidate.modelCode), name: asString(candidate.modelName) }
      : undefined),
    compatibleModelIds: Array.isArray(candidate?.compatibleModelIds) ? candidate.compatibleModelIds : undefined,
    defaultAttributes: attributes,
    status: candidate?.status,
    variant: {
      skuSegments: explicitSegments.length ? explicitSegments : inferredSegments,
      name: candidate?.name,
      nameSegments,
      posShortName: candidate?.posShortName,
      aliases: candidate?.aliases,
      attributes,
      defaultImportPrice: candidate?.defaultImportPrice,
      defaultRetailPrice: candidate?.defaultRetailPrice,
      wholesalePrice: candidate?.wholesalePrice,
      barcode: candidate?.barcode,
      imageUrl: candidate?.imageUrl,
      warrantyPeriodMonths: candidate?.warrantyPeriodMonths,
      vatRate: candidate?.vatRate,
      minStockLevel: candidate?.minStockLevel,
      maxStockLevel: candidate?.maxStockLevel,
      notes: candidate?.notes
    }
  };
}

const IMPORT_HEADER_ALIASES: Record<string, string[]> = {
  kind: ['kind', 'category', 'nhom', 'nhom hang', 'nhom hang hoa'],
  categoryCode: ['categorycode', 'ma nhom', 'ma danh muc', 'ma loai'],
  categoryName: ['categoryname', 'ten nhom', 'ten danh muc'],
  modelId: ['modelid', 'ma id model'],
  modelCode: ['modelcode', 'ma model', 'ma dong may'],
  modelName: ['modelname', 'ten model', 'dong may', 'ten dong may'],
  manufacturerCode: ['manufacturercode', 'ma hang', 'ma nsx'],
  manufacturerName: ['manufacturername', 'hang', 'hang sx', 'nha san xuat'],
  qualityCode: ['qualitycode', 'ma cap', 'ma chat luong', 'ma cong nghe'],
  qualityName: ['qualityname', 'cap', 'chat luong', 'cong nghe'],
  storageCode: ['storagecode', 'ma dung luong'],
  storageName: ['storagename', 'dung luong'],
  colorCode: ['colorcode', 'ma mau'],
  colorName: ['colorname', 'mau'],
  conditionCode: ['conditioncode', 'ma tinh trang'],
  conditionName: ['conditionname', 'tinh trang'],
  unit: ['unit', 'don vi tinh'],
  unitCode: ['unitcode', 'ma don vi tinh'],
  defaultImportPrice: ['defaultimportprice', 'gia nhap', 'gia von'],
  defaultRetailPrice: ['defaultretailprice', 'gia ban le', 'gia ban'],
  name: ['name', 'ten hang', 'ten san pham'],
  posShortName: ['posshortname', 'ten ngan pos'],
  barcode: ['barcode', 'ma vach'],
  notes: ['notes', 'ghi chu']
};

function canonicalImportHeader(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return Object.entries(IMPORT_HEADER_ALIASES).find(([, aliases]) => aliases.some(alias => normalizeText(alias) === normalized))?.[0];
}

function spreadsheetRowsToCandidates(rows: string[][]): CatalogCandidateInput[] {
  if (!Array.isArray(rows) || rows.length < 2 || !Array.isArray(rows[0])) throw new Error('CATALOG_IMPORT_HEADER_REQUIRED');
  const headers = rows[0].map(canonicalImportHeader);
  if (!headers.includes('kind') || !headers.includes('categoryCode') || (!headers.includes('modelId') && !(headers.includes('modelCode') && headers.includes('modelName')))) {
    throw new Error('CATALOG_IMPORT_HEADER_REQUIRED');
  }
  return rows.slice(1).filter(row => row.some(cell => asString(cell))).map(row => {
    const candidate: Record<string, any> = {};
    headers.forEach((header, index) => {
      if (!header || !asString(row[index])) return;
      candidate[header] = row[index];
    });
    if (candidate.defaultImportPrice !== undefined) candidate.defaultImportPrice = Number(candidate.defaultImportPrice);
    if (candidate.defaultRetailPrice !== undefined) candidate.defaultRetailPrice = Number(candidate.defaultRetailPrice);
    return candidate as CatalogCandidateInput;
  });
}

/** Accepts legacy structured import rows, UI matrix cells, or explicit-header spreadsheet cells. */
export function normalizeCatalogImportRows(input: any): CatalogImportRow[] {
  if (Array.isArray(input?.items)) return input.items.map(catalogCandidateToImportRow);
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  if (rows.length && Array.isArray(rows[0])) return spreadsheetRowsToCandidates(rows as string[][]).map(catalogCandidateToImportRow);
  return rows.map((row: any) => {
    if (Array.isArray(row?.variants) || row?.variant) return row as CatalogImportRow;
    return catalogCandidateToImportRow(row);
  });
}

export async function previewCatalogCandidates(db: Firestore | any, input: any) {
  return previewCatalogImport(db, { rows: normalizeCatalogImportRows(input) });
}

export async function processCatalogCandidates(db: Firestore | any, input: any, actor: AuthenticatedUser) {
  return processCatalogImport(db, {
    operationKey: input?.operationKey,
    rows: normalizeCatalogImportRows(input)
  }, actor);
}

function allowedItemPatch(input: any) {
  const fields = [
    'name', 'displayName', 'posShortName', 'aliases', 'attributes', 'compatibleModelIds', 'compatibleModelCodes',
    'compatibleModels', 'unit', 'barcode', 'imageUrl', 'defaultImportPrice', 'defaultRetailPrice', 'wholesalePrice',
    'minStockLevel', 'maxStockLevel', 'warrantyPeriodMonths', 'vatRate', 'notes', 'status'
  ];
  const patch: Record<string, any> = {};
  fields.forEach(field => {
    if (input?.[field] !== undefined) patch[field] = input[field];
  });
  if (patch.status !== undefined && !['active', 'inactive'].includes(patch.status)) throw new Error('CATALOG_STATUS_INVALID');
  ['defaultImportPrice', 'defaultRetailPrice', 'wholesalePrice', 'minStockLevel', 'maxStockLevel', 'warrantyPeriodMonths', 'vatRate'].forEach(field => {
    if (patch[field] !== undefined) patch[field] = requirePositiveNumber(patch[field]);
  });
  if (patch.aliases !== undefined) patch.aliases = uniqueStrings(Array.isArray(patch.aliases) ? patch.aliases : []);
  if (patch.name !== undefined) patch.name = requireNonEmpty(patch.name, 'CATALOG_NAME_REQUIRED');
  if (patch.displayName !== undefined) patch.displayName = requireNonEmpty(patch.displayName, 'CATALOG_NAME_REQUIRED');
  if (patch.posShortName !== undefined) patch.posShortName = requireNonEmpty(patch.posShortName, 'CATALOG_POS_NAME_REQUIRED');
  return patch;
}

export async function processUpdateCatalogItem(db: Firestore | any, itemId: string, input: any, actor: AuthenticatedUser) {
  if (input?.sku !== undefined || input?.skuNormalized !== undefined || input?.modelId !== undefined || input?.modelCode !== undefined || input?.categoryCode !== undefined) {
    throw new Error('CATALOG_IDENTITY_IMMUTABLE');
  }
  const ref = db.collection(CATALOG_COLLECTION).doc(asString(itemId));
  let updated: any;
  await db.runTransaction(async (transaction: any) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error('CATALOG_ITEM_NOT_FOUND');
    const current = { id: snap.id, ...snap.data() };
    if (current.lifecycleStatus === 'ARCHIVED') throw new Error('CATALOG_ITEM_ARCHIVED');
    const patch = allowedItemPatch(input);
    const name = patch.displayName || patch.name || current.displayName || current.name;
    const aliases = buildCatalogAliases([name, patch.posShortName || current.posShortName, current.sku, ...(patch.aliases || current.aliases || [])]);
    updated = {
      ...current,
      ...patch,
      name: patch.name || current.name,
      displayName: name,
      aliases,
      searchTokens: buildCatalogAliases(aliases),
      lifecycleStatus: patch.status === 'inactive' ? 'INACTIVE' : (current.lifecycleStatus || 'ACTIVE'),
      updatedAt: nowIso(),
      updatedByUid: actor.uid
    };
    setCatalogDocument(transaction, ref, updated, { merge: false });
  });
  return updated;
}

export async function processArchiveCatalogItem(db: Firestore | any, itemId: string, reason: unknown, actor: AuthenticatedUser) {
  const ref = db.collection(CATALOG_COLLECTION).doc(asString(itemId));
  let archived: any;
  await db.runTransaction(async (transaction: any) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error('CATALOG_ITEM_NOT_FOUND');
    const current = { id: snap.id, ...snap.data() };
    archived = {
      ...current,
      status: 'inactive',
      lifecycleStatus: 'ARCHIVED',
      archivedAt: nowIso(),
      archivedByUid: actor.uid,
      archiveReason: asString(reason),
      updatedAt: nowIso(),
      updatedByUid: actor.uid
    };
    setCatalogDocument(transaction, ref, archived, { merge: false });
  });
  return archived;
}

function rollbackDependencyQueries(db: any, itemId: string, sku: string) {
  return [
    { label: 'devices.catalogItemId', query: db.collection('devices').where('catalogItemId', '==', itemId) },
    { label: 'spareParts.catalogItemId', query: db.collection('spareParts').where('catalogItemId', '==', itemId) },
    { label: 'spareParts.sku', query: db.collection('spareParts').where('sku', '==', sku) },
    { label: 'products.catalogItemId', query: db.collection('products').where('catalogItemId', '==', itemId) },
    { label: 'products.sku', query: db.collection('products').where('sku', '==', sku) }
  ];
}

/**
 * Archive (never delete) only Product Master rows created by one completed
 * operation. SKU registries stay intact and linked inventory blocks rollback;
 * no stock, lots, IMEIs or financial documents are mutated here.
 */
export async function processRollbackCatalogOperation(db: Firestore | any, rawOperationKey: unknown, actor: AuthenticatedUser) {
  const operationKey = normalizeCatalogCode(rawOperationKey);
  const operationRef = db.collection(OPERATIONS_COLLECTION).doc(operationId(operationKey));
  const operationSnap = await operationRef.get();
  if (!operationSnap.exists) throw new Error('CATALOG_OPERATION_NOT_FOUND');
  const operation = { id: operationSnap.id, ...operationSnap.data() } as any;
  if (!['COMPLETED', 'ROLLBACK_PARTIAL', 'ROLLED_BACK'].includes(String(operation.status || ''))) {
    throw new Error('CATALOG_OPERATION_NOT_COMPLETED');
  }
  if (operation.status === 'ROLLED_BACK' && operation.rollbackResult) {
    return { ...operation.rollbackResult, idempotentReplay: true };
  }

  const createdItemIds = Array.from(new Set<string>(
    (Array.isArray(operation?.result?.created) ? operation.result.created : [])
      .map((item: any): string => asString(item?.catalogItemId))
      .filter((itemId: string): itemId is string => Boolean(itemId))
  ));
  const results = await mapConcurrent(createdItemIds, 8, async itemId => {
    const itemRef = db.collection(CATALOG_COLLECTION).doc(itemId);
    let outcome: any;
    await db.runTransaction(async (transaction: any) => {
      const itemSnap = await transaction.get(itemRef);
      if (!itemSnap.exists) {
        outcome = { itemId, status: 'BLOCKED', reason: 'CATALOG_ITEM_NOT_FOUND' };
        return;
      }
      const item = { id: itemSnap.id, ...itemSnap.data() };
      if (item.sourceOperationId !== operation.id || item.sourceOperationKey !== operationKey) {
        outcome = { itemId, sku: item.sku, status: 'BLOCKED', reason: 'CATALOG_OPERATION_OWNERSHIP_MISMATCH' };
        return;
      }
      if (item.lifecycleStatus === 'ARCHIVED') {
        outcome = { itemId, sku: item.sku, status: 'ARCHIVED' };
        return;
      }
      const dependencies = rollbackDependencyQueries(db, itemId, asString(item.sku));
      // Firestore requires all reads (including linked-inventory queries) to
      // complete before the archive write begins.
      const dependencySnapshots = await Promise.all(dependencies.map(entry => transaction.get(entry.query)));
      const linkedTo = dependencies
        .filter((_entry, index) => !dependencySnapshots[index]?.empty && (dependencySnapshots[index]?.docs?.length || 0) > 0)
        .map(entry => entry.label);
      if (linkedTo.length) {
        outcome = { itemId, sku: item.sku, status: 'BLOCKED', reason: 'CATALOG_ITEM_HAS_INVENTORY_LINKS', linkedTo };
        return;
      }
      const archivedAt = nowIso();
      setCatalogDocument(transaction, itemRef, {
        ...item,
        status: 'inactive',
        lifecycleStatus: 'ARCHIVED',
        archivedAt,
        archivedByUid: actor.uid,
        archiveReason: `ROLLBACK:${operationKey}`,
        rollbackOperationId: operation.id,
        updatedAt: archivedAt,
        updatedByUid: actor.uid
      }, { merge: false });
      outcome = { itemId, sku: item.sku, status: 'ARCHIVED' };
    });
    return outcome;
  });
  const archived = results.filter(result => result.status === 'ARCHIVED');
  const blocked = results.filter(result => result.status === 'BLOCKED');
  const response = {
    operationKey,
    archivedCount: archived.length,
    blockedCount: blocked.length,
    archived,
    blocked
  };
  await db.runTransaction(async (transaction: any) => {
    const current = await transaction.get(operationRef);
    if (!current.exists) throw new Error('CATALOG_OPERATION_NOT_FOUND');
    setCatalogDocument(transaction, operationRef, {
      ...current.data(),
      status: blocked.length ? 'ROLLBACK_PARTIAL' : 'ROLLED_BACK',
      rollbackResult: response,
      rolledBackAt: nowIso(),
      rolledBackByUid: actor.uid,
      updatedAt: nowIso(),
      updatedByUid: actor.uid
    }, { merge: false });
  });
  return response;
}

function normalizeModelInput(input: any) {
  const brandCode = normalizeCatalogCode(input?.brandCode);
  const modelCode = normalizeCatalogCode(input?.modelCode);
  const brandName = requireNonEmpty(input?.brandName, 'CATALOG_BRAND_NAME_REQUIRED');
  const modelName = requireNonEmpty(input?.modelName, 'CATALOG_MODEL_NAME_REQUIRED');
  const releaseYear = input?.releaseYear === undefined || input?.releaseYear === '' ? undefined : Number(input.releaseYear);
  if (releaseYear !== undefined && (!Number.isInteger(releaseYear) || releaseYear < 1970 || releaseYear > 2100)) throw new Error('CATALOG_RELEASE_YEAR_INVALID');
  return {
    id: asString(input?.id) || safeDocId('MODEL', `${brandCode}-${modelCode}`),
    brandCode,
    brandName,
    seriesCode: asString(input?.seriesCode) ? normalizeCatalogCode(input.seriesCode) : undefined,
    seriesName: asString(input?.seriesName) || undefined,
    familyId: asString(input?.familyId) || undefined,
    familyCode: asString(input?.familyCode) ? normalizeCatalogCode(input.familyCode) : undefined,
    familyName: asString(input?.familyName) || undefined,
    modelCode,
    modelName,
    releaseYear,
    aliases: uniqueStrings([modelName, brandName, ...(Array.isArray(input?.aliases) ? input.aliases : [])]),
    active: input?.active !== false
  };
}

export async function processCreateCatalogModel(db: Firestore | any, input: any, actor: AuthenticatedUser) {
  const draft = normalizeModelInput(input);
  const dictionaries = await getActiveCatalogDictionaries(db);
  if (!dictionaries.some(item => item.dictionaryType === 'BRAND' && normalizeCatalogCode(item.code) === draft.brandCode)) {
    throw new Error(`CATALOG_BRAND_CODE_NOT_CONFIGURED:${draft.brandCode}`);
  }
  const ref = db.collection(MODELS_COLLECTION).doc(draft.id);
  const registryRef = db.collection(MODEL_REGISTRY_COLLECTION).doc(`${draft.brandCode}__${draft.modelCode}`);
  let result: any;
  await db.runTransaction(async (transaction: any) => {
    const [registrySnap, modelSnap] = await Promise.all([transaction.get(registryRef), transaction.get(ref)]);
    if (registrySnap.exists) {
      const current = registrySnap.data();
      if (current?.modelId !== draft.id) throw new Error('CATALOG_MODEL_CODE_DUPLICATE');
      result = { model: { id: draft.id, ...(modelSnap.data?.() || {}) }, idempotentReplay: true };
      return;
    }
    if (modelSnap.exists) throw new Error('CATALOG_MODEL_ID_DUPLICATE');
    const timestamp = nowIso();
    const model = {
      ...draft,
      searchTokens: buildCatalogAliases(draft.aliases),
      createdAt: timestamp,
      updatedAt: timestamp,
      createdByUid: actor.uid,
      updatedByUid: actor.uid
    };
    setCatalogDocument(transaction, ref, model);
    setCatalogDocument(transaction, registryRef, { brandCode: draft.brandCode, modelCode: draft.modelCode, modelId: draft.id, createdAt: timestamp, createdByUid: actor.uid });
    result = { model, idempotentReplay: false };
  });
  return result;
}

export async function processUpdateCatalogModel(db: Firestore | any, modelId: string, input: any, actor: AuthenticatedUser) {
  if (input?.modelCode !== undefined || input?.brandCode !== undefined) throw new Error('CATALOG_MODEL_CODE_IMMUTABLE');
  const ref = db.collection(MODELS_COLLECTION).doc(asString(modelId));
  let updated: any;
  await db.runTransaction(async (transaction: any) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error('CATALOG_MODEL_NOT_FOUND');
    const current = { id: snap.id, ...snap.data() };
    const modelName = input?.modelName === undefined ? current.modelName : requireNonEmpty(input.modelName, 'CATALOG_MODEL_NAME_REQUIRED');
    const brandName = input?.brandName === undefined ? current.brandName : requireNonEmpty(input.brandName, 'CATALOG_BRAND_NAME_REQUIRED');
    const releaseYear = input?.releaseYear === undefined ? current.releaseYear : Number(input.releaseYear);
    if (releaseYear !== undefined && (!Number.isInteger(releaseYear) || releaseYear < 1970 || releaseYear > 2100)) throw new Error('CATALOG_RELEASE_YEAR_INVALID');
    const aliases = uniqueStrings([modelName, brandName, ...(Array.isArray(input?.aliases) ? input.aliases : current.aliases || [])]);
    updated = {
      ...current,
      modelName,
      brandName,
      seriesName: input?.seriesName === undefined ? current.seriesName : asString(input.seriesName),
      seriesCode: input?.seriesCode === undefined ? current.seriesCode : normalizeCatalogCode(input.seriesCode),
      familyId: input?.familyId === undefined ? current.familyId : asString(input.familyId) || undefined,
      familyCode: input?.familyCode === undefined ? current.familyCode : (asString(input.familyCode) ? normalizeCatalogCode(input.familyCode) : undefined),
      familyName: input?.familyName === undefined ? current.familyName : asString(input.familyName) || undefined,
      releaseYear,
      aliases,
      searchTokens: buildCatalogAliases(aliases),
      active: input?.active === undefined ? current.active !== false : input.active === true,
      updatedAt: nowIso(),
      updatedByUid: actor.uid
    };
    setCatalogDocument(transaction, ref, updated, { merge: false });
  });
  return updated;
}

function normalizeDictionaryInput(input: any) {
  const dictionaryType = asString(input?.dictionaryType).toUpperCase() as CatalogDictionaryType;
  if (!['BRAND', 'FAMILY', 'CATEGORY', 'ATTRIBUTE', 'TEMPLATE'].includes(dictionaryType)) throw new Error('CATALOG_DICTIONARY_TYPE_INVALID');
  const code = normalizeCatalogCode(input?.code);
  const key = asString(input?.key) || code;
  const name = requireNonEmpty(input?.name, 'CATALOG_DICTIONARY_NAME_REQUIRED');
  const parentId = asString(input?.parentId);
  const kind = normalizeCatalogKind(input?.kind);
  const familyId = asString(input?.familyId);
  const familyCode = asString(input?.familyCode) ? normalizeCatalogCode(input.familyCode) : undefined;
  const groupId = asString(input?.groupId);
  const groupCode = asString(input?.groupCode) ? normalizeCatalogCode(input.groupCode) : undefined;
  return {
    id: asString(input?.id) || safeDocId('DICT', `${dictionaryType}-${key}-${code}`),
    dictionaryType,
    key,
    code,
    name,
    ...(parentId ? { parentId } : {}),
    ...(kind ? { kind } : {}),
    ...(familyId ? { familyId } : {}),
    ...(familyCode ? { familyCode } : {}),
    ...(groupId ? { groupId } : {}),
    ...(groupCode ? { groupCode } : {}),
    ...(input?.config && typeof input.config === 'object' && !Array.isArray(input.config) ? { config: compactFirestoreData(input.config) } : {}),
    aliases: uniqueStrings([name, code, ...(Array.isArray(input?.aliases) ? input.aliases : [])]),
    active: input?.active !== false
  };
}

export async function processCreateCatalogDictionary(db: Firestore | any, input: any, actor: AuthenticatedUser) {
  const draft = normalizeDictionaryInput(input);
  const ref = db.collection(DICTIONARIES_COLLECTION).doc(draft.id);
  let dictionary: any;
  await db.runTransaction(async (transaction: any) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      dictionary = { id: existing.id, ...existing.data() };
      return;
    }
    const timestamp = nowIso();
    dictionary = {
      ...draft,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdByUid: actor.uid,
      updatedByUid: actor.uid
    };
    setCatalogDocument(transaction, ref, dictionary);
  });
  return dictionary;
}

export async function processUpdateCatalogDictionary(db: Firestore | any, dictionaryId: string, input: any, actor: AuthenticatedUser) {
  if (input?.code !== undefined || input?.dictionaryType !== undefined || input?.key !== undefined) throw new Error('CATALOG_DICTIONARY_CODE_IMMUTABLE');
  const ref = db.collection(DICTIONARIES_COLLECTION).doc(asString(dictionaryId));
  let updated: any;
  await db.runTransaction(async (transaction: any) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error('CATALOG_DICTIONARY_NOT_FOUND');
    const current = { id: snap.id, ...snap.data() };
    const {
      parentId: _currentParentId,
      config: currentConfig,
      kind: currentKind,
      familyId: currentFamilyId,
      familyCode: currentFamilyCode,
      groupId: currentGroupId,
      groupCode: currentGroupCode,
      ...currentWithoutParentId
    } = current;
    const name = input?.name === undefined ? current.name : requireNonEmpty(input.name, 'CATALOG_DICTIONARY_NAME_REQUIRED');
    const parentId = input?.parentId === undefined ? asString(current.parentId) : asString(input.parentId);
    const aliases = uniqueStrings([name, current.code, ...(Array.isArray(input?.aliases) ? input.aliases : current.aliases || [])]);
    const config = input?.config === undefined
      ? currentConfig
      : (input.config && typeof input.config === 'object' && !Array.isArray(input.config) ? compactFirestoreData(input.config) : undefined);
    const kind = input?.kind === undefined ? currentKind : normalizeCatalogKind(input.kind);
    const familyId = input?.familyId === undefined ? currentFamilyId : asString(input.familyId) || undefined;
    const familyCode = input?.familyCode === undefined ? currentFamilyCode : (asString(input.familyCode) ? normalizeCatalogCode(input.familyCode) : undefined);
    const groupId = input?.groupId === undefined ? currentGroupId : asString(input.groupId) || undefined;
    const groupCode = input?.groupCode === undefined ? currentGroupCode : (asString(input.groupCode) ? normalizeCatalogCode(input.groupCode) : undefined);
    updated = {
      ...currentWithoutParentId,
      name,
      ...(parentId ? { parentId } : {}),
      ...(kind ? { kind } : {}),
      ...(familyId ? { familyId } : {}),
      ...(familyCode ? { familyCode } : {}),
      ...(groupId ? { groupId } : {}),
      ...(groupCode ? { groupCode } : {}),
      ...(config ? { config } : {}),
      aliases,
      active: input?.active === undefined ? current.active !== false : input.active === true,
      updatedAt: nowIso(),
      updatedByUid: actor.uid
    };
    setCatalogDocument(transaction, ref, updated, { merge: false });
  });
  return updated;
}

export async function previewCatalogImport(db: Firestore | any, input: { rows?: CatalogImportRow[] }) {
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  if (!rows.length) throw new Error('CATALOG_IMPORT_ROWS_REQUIRED');
  if (rows.length > MAX_IMPORT_ROWS) throw new Error('CATALOG_IMPORT_LIMIT_EXCEEDED');
  const [dictionaries, modelRecords] = await Promise.all([
    getActiveCatalogDictionaries(db),
    listCollection(db, MODELS_COLLECTION)
  ]);
  const invalid: CatalogPreviewResult['invalid'] = [];
  const generated: CatalogDraft[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    try {
      const rawRowInput: CatalogBulkInput = {
        ...row,
        modelIds: row.modelIds || (row.modelId ? [row.modelId] : []),
        variants: row.variants || (row.variant ? [row.variant] : [])
      };
      const scope = rawRowInput.modelScope;
      const resolvedImportModel = (!rawRowInput.modelIds?.length && scope)
        ? modelRecords.find(model => model?.active !== false && asString(model?.modelCode).toUpperCase() === normalizeCatalogCode(scope.code) && normalizeText(model?.modelName) === normalizeText(scope.name))
        : undefined;
      const rowInput: CatalogBulkInput = resolvedImportModel
        ? { ...rawRowInput, modelIds: [resolvedImportModel.id], modelScope: undefined }
        : rawRowInput;
      const drafts = await generateCatalogDrafts(db, rowInput, dictionaries);
      generated.push(...drafts);
    } catch (error: any) {
      invalid.push({ index, rowNumber: row?.rowNumber, error: error?.message || 'CATALOG_IMPORT_ROW_INVALID' });
    }
  }
  const existingSkus = await getCatalogSkuIndex(db, generated.map(draft => draft.skuNormalized));
  const seen = new Set<string>();
  const existing: CatalogPreviewResult['existing'] = [];
  const candidates: CatalogDraft[] = [];
  generated.forEach(draft => {
    if (seen.has(draft.skuNormalized)) {
      existing.push({ sku: draft.sku, reason: 'DUPLICATE_IN_REQUEST' });
      return;
    }
    seen.add(draft.skuNormalized);
    const existingItemId = existingSkus.get(draft.skuNormalized);
    if (existingItemId) existing.push({ sku: draft.sku, catalogItemId: existingItemId, reason: 'EXISTING_SKU' });
    else candidates.push(draft);
  });
  return {
    candidates,
    totalCount: generated.length,
    newCount: candidates.length,
    existingCount: existing.filter(item => item.reason === 'EXISTING_SKU').length,
    duplicateCount: existing.filter(item => item.reason === 'DUPLICATE_IN_REQUEST').length,
    invalid,
    existing,
    nearDuplicates: []
  } satisfies CatalogPreviewResult;
}

function importDraftToBulkInput(draft: CatalogDraft, operationKey: string): CatalogBulkInput {
  return {
    operationKey,
    category: draft.category,
    categoryCode: draft.categoryCode,
    categoryName: draft.categoryName,
    subCategoryId: draft.subCategoryId,
    subCategoryName: draft.subCategory,
    subCategoryCode: draft.subCategoryCode,
    brandName: draft.brand,
    brandCode: draft.brandCode,
    unit: draft.unit,
    unitCode: draft.unitCode,
    modelIds: draft.modelId ? [draft.modelId] : [],
    modelScope: draft.modelId ? undefined : (draft.modelCode && draft.model ? { code: draft.modelCode, name: draft.model } : undefined),
    compatibleModelIds: draft.compatibleModelIds,
    defaultAttributes: draft.attributes,
    status: draft.status,
    variants: [{
      skuSegments: draft.skuSegments.slice(2),
      nameSegments: [],
      posShortName: draft.posShortName,
      aliases: draft.aliases,
      defaultImportPrice: draft.defaultImportPrice,
      defaultRetailPrice: draft.defaultRetailPrice,
      wholesalePrice: draft.wholesalePrice,
      barcode: draft.barcode,
      imageUrl: draft.imageUrl,
      warrantyPeriodMonths: draft.warrantyPeriodMonths,
      vatRate: draft.vatRate,
      minStockLevel: draft.minStockLevel,
      maxStockLevel: draft.maxStockLevel,
      notes: draft.notes
    }]
  };
}

export async function processCatalogImport(db: Firestore | any, input: { operationKey?: string; rows?: CatalogImportRow[] }, actor: AuthenticatedUser) {
  const operationKey = resolveOperationKey(input?.operationKey, { rows: input?.rows }, actor);
  const preview = await previewCatalogImport(db, input);
  const legacySkuIndex = await getCatalogSkuIndex(db, preview.candidates.map(candidate => candidate.skuNormalized));
  const operation = await initializeOperation(db, operationKey, fingerprint({ rows: input.rows }), actor);
  if (operation.replay) return { ...(operation.data?.result || {}), idempotentReplay: true };
  const outcomes = await mapConcurrent(preview.candidates, 8, draft => createCatalogDraft(db, draft, legacySkuIndex, actor, {
    id: operation.data.id,
    operationKey
  }));
  const created = outcomes.filter(item => item.status === 'CREATED');
  const existing = outcomes.filter(item => item.status === 'EXISTING');
  const response = {
    operationKey,
    totalCount: preview.totalCount,
    createdCount: created.length,
    skippedExistingCount: preview.existing.length + existing.length,
    invalid: preview.invalid,
    created: created.map(item => ({ sku: item.sku, catalogItemId: item.catalogItemId, item: item.item })),
    skipped: [...preview.existing, ...existing.map(item => ({ sku: item.sku, catalogItemId: item.catalogItemId, reason: 'EXISTING_SKU' }))]
  };
  await finishOperation(db, operation.ref, response, actor);
  return response;
}

function cloneTargetSku(sourceItem: any, target: CatalogModelRecord) {
  const tail = Array.isArray(sourceItem?.skuSegments)
    ? sourceItem.skuSegments.slice(2).map((segment: any) => asString(segment?.code)).filter(Boolean)
    : [];
  if (!asString(sourceItem?.categoryCode) || !target?.modelCode || !tail.length) return '';
  return [normalizeCatalogCode(sourceItem.categoryCode), normalizeCatalogCode(target.modelCode), ...tail.map(normalizeCatalogCode)].join('-');
}

function cloneSourceIsSelected(sourceItem: any, target: CatalogModelRecord, selectedClientKeys?: unknown, selectedSkus?: unknown) {
  const selected = new Set([
    ...(Array.isArray(selectedClientKeys) ? selectedClientKeys : []),
    ...(Array.isArray(selectedSkus) ? selectedSkus : [])
  ].map(value => asString(value)).filter(Boolean));
  if (!selected.size) return true;
  const targetSku = cloneTargetSku(sourceItem, target);
  const candidateId = targetSku ? safeDocId('CAT', targetSku) : '';
  return selected.has(asString(sourceItem?.id)) || selected.has(asString(sourceItem?.sku)) || selected.has(targetSku) || selected.has(candidateId);
}

export async function previewCatalogClone(db: Firestore | any, input: CatalogCloneInput) {
  const sourceModelId = requireNonEmpty(input?.sourceModelId, 'CATALOG_CLONE_SOURCE_MODEL_REQUIRED');
  const targetModelId = requireNonEmpty(input?.targetModelId, 'CATALOG_CLONE_TARGET_MODEL_REQUIRED');
  if (sourceModelId === targetModelId) throw new Error('CATALOG_CLONE_SAME_MODEL');
  const [sourceSnap, targetSnap, sourceItems] = await Promise.all([
    getDocument(db, MODELS_COLLECTION, sourceModelId),
    getDocument(db, MODELS_COLLECTION, targetModelId),
    listCollection(db, CATALOG_COLLECTION)
  ]);
  if (!sourceSnap.exists || !targetSnap.exists) throw new Error('CATALOG_MODEL_NOT_FOUND');
  const source = { id: sourceSnap.id, ...sourceSnap.data() } as CatalogModelRecord;
  const target = { id: targetSnap.id, ...targetSnap.data() } as CatalogModelRecord;
  const category = input?.category ? assertCatalogCategory(input.category) : undefined;
  const items = sourceItems.filter(item =>
    item?.modelId === source.id &&
    item?.masterVersion === 2 &&
    item?.lifecycleStatus !== 'ARCHIVED' &&
    (!category || item?.category === category) &&
    cloneSourceIsSelected(item, target, input?.selectedClientKeys, input?.selectedSkus)
  );
  const cloneRows: CatalogImportRow[] = items.map(item => ({
    category: item.category,
    categoryCode: item.categoryCode,
    categoryName: item.categoryName,
    subCategoryId: item.subCategoryId,
    subCategoryName: item.subCategory,
    subCategoryCode: item.subCategoryCode,
    brandName: item.brand,
    brandCode: item.brandCode,
    unit: item.unit,
    unitCode: item.unitCode,
    modelId: target.id,
    compatibleModelIds: Array.isArray(item.compatibleModelIds)
      ? Array.from(new Set<string>((item.compatibleModelIds as unknown[])
        .map((id: unknown): string => asString(id) === source.id ? target.id : asString(id))
        .filter((id: string): id is string => Boolean(id))))
      : [target.id],
    defaultAttributes: item.attributes || {},
    status: item.status,
    variant: {
      skuSegments: Array.isArray(item.skuSegments) ? item.skuSegments.slice(2) : [],
      nameSegments: [],
      posShortName: String(item.posShortName || '').replace(source.modelName, target.modelName),
      aliases: Array.isArray(item.aliases) ? item.aliases.map((alias: string) => alias.replace(source.modelName, target.modelName)) : [],
      defaultImportPrice: item.defaultImportPrice,
      defaultRetailPrice: item.defaultRetailPrice,
      wholesalePrice: item.wholesalePrice,
      barcode: '',
      imageUrl: item.imageUrl,
      warrantyPeriodMonths: item.warrantyPeriodMonths,
      vatRate: item.vatRate,
      minStockLevel: item.minStockLevel,
      maxStockLevel: item.maxStockLevel,
      notes: item.notes
    }
  }));
  return previewCatalogImport(db, { rows: cloneRows });
}

export async function processCatalogClone(db: Firestore | any, input: CatalogCloneInput, actor: AuthenticatedUser) {
  const operationKey = resolveOperationKey(input?.operationKey, { ...input, operationKey: undefined }, actor);
  const sourceModelId = requireNonEmpty(input?.sourceModelId, 'CATALOG_CLONE_SOURCE_MODEL_REQUIRED');
  const targetModelId = requireNonEmpty(input?.targetModelId, 'CATALOG_CLONE_TARGET_MODEL_REQUIRED');
  const sourceItems = await listCollection(db, CATALOG_COLLECTION);
  const source = await getDocument(db, MODELS_COLLECTION, sourceModelId);
  const target = await getDocument(db, MODELS_COLLECTION, targetModelId);
  if (!source.exists || !target.exists) throw new Error('CATALOG_MODEL_NOT_FOUND');
  const sourceData = { id: source.id, ...source.data() } as CatalogModelRecord;
  const targetData = { id: target.id, ...target.data() } as CatalogModelRecord;
  const category = input?.category ? assertCatalogCategory(input.category) : undefined;
  const rows: CatalogImportRow[] = sourceItems.filter(item =>
    item?.modelId === sourceModelId && item?.masterVersion === 2 && item?.lifecycleStatus !== 'ARCHIVED' && (!category || item?.category === category) &&
    cloneSourceIsSelected(item, targetData, input?.selectedClientKeys, input?.selectedSkus)
  ).map(item => ({
    category: item.category,
    categoryCode: item.categoryCode,
    categoryName: item.categoryName,
    subCategoryId: item.subCategoryId,
    subCategoryName: item.subCategory,
    subCategoryCode: item.subCategoryCode,
    brandName: item.brand,
    brandCode: item.brandCode,
    unit: item.unit,
    unitCode: item.unitCode,
    modelId: targetData.id,
    compatibleModelIds: Array.isArray(item.compatibleModelIds)
      ? Array.from(new Set<string>((item.compatibleModelIds as unknown[])
        .map((id: unknown): string => asString(id) === sourceData.id ? targetData.id : asString(id))
        .filter((id: string): id is string => Boolean(id))))
      : [targetData.id],
    defaultAttributes: item.attributes || {},
    status: item.status,
    variant: {
      skuSegments: Array.isArray(item.skuSegments) ? item.skuSegments.slice(2) : [],
      nameSegments: [],
      posShortName: String(item.posShortName || '').replace(sourceData.modelName, targetData.modelName),
      aliases: Array.isArray(item.aliases) ? item.aliases.map((alias: string) => alias.replace(sourceData.modelName, targetData.modelName)) : [],
      defaultImportPrice: item.defaultImportPrice,
      defaultRetailPrice: item.defaultRetailPrice,
      wholesalePrice: item.wholesalePrice,
      imageUrl: item.imageUrl,
      warrantyPeriodMonths: item.warrantyPeriodMonths,
      vatRate: item.vatRate,
      minStockLevel: item.minStockLevel,
      maxStockLevel: item.maxStockLevel,
      notes: item.notes
    }
  }));
  return processCatalogImport(db, { operationKey, rows }, actor);
}

type SeedSection = 'brand' | 'family' | 'group' | 'attribute' | 'template' | 'model';

function catalogDictionaryIdentity(record: any) {
  let code: string;
  try { code = normalizeCatalogCode(record?.code); } catch { code = `RAW-${normalizeText(record?.code) || 'EMPTY'}`; }
  return [
    asString(record?.dictionaryType).toUpperCase(),
    asString(record?.key).toUpperCase(),
    code
  ].join('::');
}

function catalogModelIdentity(record: any) {
  let brandCode: string;
  let modelCode: string;
  try { brandCode = normalizeCatalogCode(record?.brandCode); } catch { brandCode = `RAW-${normalizeText(record?.brandCode) || 'EMPTY'}`; }
  try { modelCode = normalizeCatalogCode(record?.modelCode); } catch { modelCode = `RAW-${normalizeText(record?.modelCode) || 'EMPTY'}`; }
  return [brandCode, modelCode].join('::');
}

function assertCatalogAdmin(actor: AuthenticatedUser) {
  if (asString(actor?.role).toUpperCase() !== 'ADMIN') throw new Error('CATALOG_ADMIN_REQUIRED');
}

function seedSectionForDictionary(record: any): SeedSection {
  const type = asString(record?.dictionaryType).toUpperCase();
  if (type === 'BRAND') return 'brand';
  if (type === 'FAMILY') return 'family';
  if (type === 'CATEGORY') return 'group';
  if (type === 'TEMPLATE') return 'template';
  return 'attribute';
}

function makeSeedSummary() {
  return {
    brand: { total: 0, existing: 0, create: 0 },
    family: { total: 0, existing: 0, create: 0 },
    group: { total: 0, existing: 0, create: 0 },
    attribute: { total: 0, existing: 0, create: 0 },
    template: { total: 0, existing: 0, create: 0 },
    model: { total: 0, existing: 0, create: 0 }
  } satisfies Record<SeedSection, { total: number; existing: number; create: number }>;
}

function remapSeedReferences(value: any, idMap: Map<string, string>, key?: string): any {
  if (Array.isArray(value)) return value.map(item => remapSeedReferences(item, idMap));
  if (!value || typeof value !== 'object') {
    const referenceKeys = new Set(['parentId', 'familyId', 'groupId', 'parentGroupId', 'attributeId', 'templateId']);
    return key && referenceKeys.has(key) && typeof value === 'string' ? (idMap.get(value) || value) : value;
  }
  const mapped: Record<string, unknown> = {};
  Object.entries(value).forEach(([childKey, childValue]) => {
    mapped[childKey] = remapSeedReferences(childValue, idMap, childKey);
  });
  return mapped;
}

/**
 * Shows exactly what the Admin confirmation will add. The seed is intentionally
 * definitions-only: catalogItems, products, spareParts, devices and IMEI are
 * never read or written here.
 */
export async function previewIphoneCatalogSeed(db: Firestore | any) {
  const seed = getIphoneCatalogSeed();
  const [existingDictionaries, existingModels] = await Promise.all([
    listCollection(db, DICTIONARIES_COLLECTION),
    listCollection(db, MODELS_COLLECTION)
  ]);
  const dictionaryIndex = new Map(existingDictionaries.map(item => [catalogDictionaryIdentity(item), item]));
  const modelIndex = new Map(existingModels.map(item => [catalogModelIdentity(item), item]));
  const summary = makeSeedSummary();
  const records: Array<{ section: SeedSection; id: string; code: string; name: string; status: 'EXISTS' | 'CREATE' }> = [];

  seed.dictionaries.forEach(record => {
    const section = seedSectionForDictionary(record);
    const existing = dictionaryIndex.get(catalogDictionaryIdentity(record));
    summary[section].total += 1;
    summary[section][existing ? 'existing' : 'create'] += 1;
    records.push({ section, id: existing?.id || record.id, code: record.code, name: record.name, status: existing ? 'EXISTS' : 'CREATE' });
  });
  seed.models.forEach(model => {
    const existing = modelIndex.get(catalogModelIdentity(model));
    summary.model.total += 1;
    summary.model[existing ? 'existing' : 'create'] += 1;
    records.push({ section: 'model', id: existing?.id || model.id, code: model.modelCode, name: model.modelName, status: existing ? 'EXISTS' : 'CREATE' });
  });

  const total = Object.values(summary).reduce((result, section) => result + section.total, 0);
  const create = Object.values(summary).reduce((result, section) => result + section.create, 0);
  return {
    version: IPHONE_SEED_VERSION,
    title: 'Danh mục iPhone chuẩn',
    records,
    summary,
    total,
    create,
    existing: total - create,
    alreadyInitialized: create === 0,
    guarantees: {
      createsInventory: false,
      createsImei: false,
      createsSku: false,
      preservesExisting: true
    }
  };
}

/** Admin confirmation for the iPhone starter catalog. It is safe to retry. */
export async function processIphoneCatalogSeed(db: Firestore | any, input: any, actor: AuthenticatedUser) {
  assertCatalogAdmin(actor);
  if (input?.confirmed !== true) throw new Error('CATALOG_IPHONE_SEED_CONFIRMATION_REQUIRED');

  const seed = getIphoneCatalogSeed();
  const [existingDictionaries, existingModels, existingModelRegistries] = await Promise.all([
    listCollection(db, DICTIONARIES_COLLECTION),
    listCollection(db, MODELS_COLLECTION),
    listCollection(db, MODEL_REGISTRY_COLLECTION)
  ]);
  const dictionaryIndex = new Map(existingDictionaries.map(item => [catalogDictionaryIdentity(item), item]));
  const dictionaryIdIndex = new Map(existingDictionaries.map(item => [asString(item.id), item]));
  const modelIndex = new Map(existingModels.map(item => [catalogModelIdentity(item), item]));
  const modelIdIndex = new Map(existingModels.map(item => [asString(item.id), item]));
  const modelRegistryIndex = new Map(existingModelRegistries.map(item => [catalogModelIdentity(item), item]));
  const idMap = new Map<string, string>();
  seed.dictionaries.forEach(record => {
    const existing = dictionaryIndex.get(catalogDictionaryIdentity(record)) || dictionaryIdIndex.get(record.id);
    idMap.set(record.id, existing?.id || record.id);
  });

  const created = makeSeedSummary();
  const existing = makeSeedSummary();
  const dictionaryCreates: any[] = [];
  const modelCreates: any[] = [];

  seed.dictionaries.forEach(record => {
    const section = seedSectionForDictionary(record);
    const duplicate = dictionaryIndex.get(catalogDictionaryIdentity(record)) || dictionaryIdIndex.get(record.id);
    if (duplicate) {
      existing[section].total += 1;
      return;
    }
    dictionaryCreates.push(remapSeedReferences(record, idMap));
    created[section].total += 1;
  });

  seed.models.forEach(model => {
    const registryKey = catalogModelIdentity(model);
    const duplicate = modelIndex.get(catalogModelIdentity(model)) || modelIdIndex.get(model.id) || modelRegistryIndex.get(registryKey);
    if (duplicate) {
      existing.model.total += 1;
      return;
    }
    modelCreates.push({
      ...model,
      familyId: idMap.get('CAT_FAMILY_IPHONE') || 'CAT_FAMILY_IPHONE',
      familyCode: 'IPHONE',
      familyName: 'iPhone'
    });
    created.model.total += 1;
  });

  // A starter catalog contains hundreds of setup rows. Writing each row in a
  // separate transaction can exceed the browser's normal API timeout. All
  // records are pre-read above, then committed as one Firestore batch; this is
  // fast, keeps all optional values clean, and still leaves inventory untouched.
  if (typeof db.batch === 'function' && (dictionaryCreates.length || modelCreates.length)) {
    const batch = db.batch();
    const timestamp = nowIso();
    dictionaryCreates.forEach(seedRecord => {
      const draft = normalizeDictionaryInput(seedRecord);
      setCatalogDocument(batch, db.collection(DICTIONARIES_COLLECTION).doc(draft.id), {
        ...draft,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdByUid: actor.uid,
        updatedByUid: actor.uid
      });
    });
    modelCreates.forEach(seedModel => {
      const draft = normalizeModelInput(seedModel);
      const model = {
        ...draft,
        searchTokens: buildCatalogAliases(draft.aliases),
        createdAt: timestamp,
        updatedAt: timestamp,
        createdByUid: actor.uid,
        updatedByUid: actor.uid
      };
      setCatalogDocument(batch, db.collection(MODELS_COLLECTION).doc(draft.id), model);
      setCatalogDocument(batch, db.collection(MODEL_REGISTRY_COLLECTION).doc(`${draft.brandCode}__${draft.modelCode}`), {
        brandCode: draft.brandCode,
        modelCode: draft.modelCode,
        modelId: draft.id,
        createdAt: timestamp,
        createdByUid: actor.uid
      });
    });
    await batch.commit();
  } else {
    // The small in-memory test adapter has no WriteBatch. Retain the exact
    // server-side validation path as a compatibility fallback.
    for (const seedRecord of dictionaryCreates) await processCreateCatalogDictionary(db, seedRecord, actor);
    for (const seedModel of modelCreates) await processCreateCatalogModel(db, seedModel, actor);
  }

  const totalCreated = Object.values(created).reduce((result, section) => result + section.total, 0);
  const totalExisting = Object.values(existing).reduce((result, section) => result + section.total, 0);
  return {
    version: IPHONE_SEED_VERSION,
    created,
    existing,
    totalCreated,
    totalExisting,
    idempotentReplay: totalCreated === 0,
    guarantees: {
      createsInventory: false,
      createsImei: false,
      createsSku: false,
      preservesExisting: true
    }
  };
}

function hasIdInValue(value: unknown, id: string): boolean {
  if (value === id) return true;
  if (Array.isArray(value)) return value.some(item => hasIdInValue(item, id));
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some(item => hasIdInValue(item, id));
  return false;
}

async function catalogDictionaryLinks(db: Firestore | any, dictionary: any) {
  const [dictionaries, models, items] = await Promise.all([
    listCollection(db, DICTIONARIES_COLLECTION),
    listCollection(db, MODELS_COLLECTION),
    listCollection(db, CATALOG_COLLECTION)
  ]);
  const linkedGroups = dictionaries.filter(item => item.id !== dictionary.id && (item.parentId === dictionary.id || hasIdInValue(item.config, dictionary.id)));
  const code = asString(dictionary.code);
  const modelLinks = asString(dictionary.dictionaryType).toUpperCase() === 'BRAND'
    ? models.filter(model => asString(model.brandCode) === code)
    : [];
  const itemLinks = items.filter(item =>
    item.categoryCode === code || item.brandCode === code || item.unitCode === code || item.subCategoryId === dictionary.id ||
    (Array.isArray(item.skuSegments) && item.skuSegments.some((segment: any) => asString(segment?.code) === code))
  );
  return [
    { collection: 'catalogDictionaries', count: linkedGroups.length },
    { collection: 'catalogModels', count: modelLinks.length },
    { collection: 'catalogItems', count: itemLinks.length }
  ].filter(link => link.count > 0);
}

/** Deletes an unused setup row. Used rows are safely changed to Ngừng dùng. */
export async function processDeleteCatalogDictionary(db: Firestore | any, dictionaryId: string, actor: AuthenticatedUser) {
  assertCatalogAdmin(actor);
  const ref = db.collection(DICTIONARIES_COLLECTION).doc(asString(dictionaryId));
  const currentSnap = await ref.get();
  if (!currentSnap.exists) throw new Error('CATALOG_DICTIONARY_NOT_FOUND');
  const current = { id: currentSnap.id, ...currentSnap.data() };
  const links = await catalogDictionaryLinks(db, current);
  let result: any;
  await db.runTransaction(async (transaction: any) => {
    const latest = await transaction.get(ref);
    if (!latest.exists) throw new Error('CATALOG_DICTIONARY_NOT_FOUND');
    if (links.length) {
      const archived = {
        id: latest.id,
        ...latest.data(),
        active: false,
        lifecycleStatus: 'ARCHIVED',
        archivedAt: nowIso(),
        archivedByUid: actor.uid,
        updatedAt: nowIso(),
        updatedByUid: actor.uid
      };
      setCatalogDocument(transaction, ref, archived, { merge: false });
      result = { id: latest.id, deleted: false, archived: true, links };
      return;
    }
    if (typeof transaction.delete !== 'function') throw new Error('CATALOG_DELETE_UNAVAILABLE');
    transaction.delete(ref);
    result = { id: latest.id, deleted: true, archived: false, links: [] };
  });
  return result;
}

async function catalogModelLinks(db: Firestore | any, modelId: string) {
  const [items, registry] = await Promise.all([
    listCollection(db, CATALOG_COLLECTION),
    listCollection(db, MODEL_REGISTRY_COLLECTION)
  ]);
  return {
    itemLinks: items.filter(item => item.modelId === modelId || (Array.isArray(item.compatibleModelIds) && item.compatibleModelIds.includes(modelId))),
    registry: registry.filter(item => item.modelId === modelId)
  };
}

/** Deletes an unused Model. A model used by a SKU is kept as Ngừng dùng. */
export async function processDeleteCatalogModel(db: Firestore | any, modelId: string, actor: AuthenticatedUser) {
  assertCatalogAdmin(actor);
  const ref = db.collection(MODELS_COLLECTION).doc(asString(modelId));
  const currentSnap = await ref.get();
  if (!currentSnap.exists) throw new Error('CATALOG_MODEL_NOT_FOUND');
  const links = await catalogModelLinks(db, asString(modelId));
  let result: any;
  await db.runTransaction(async (transaction: any) => {
    const latest = await transaction.get(ref);
    if (!latest.exists) throw new Error('CATALOG_MODEL_NOT_FOUND');
    if (links.itemLinks.length) {
      setCatalogDocument(transaction, ref, {
        id: latest.id,
        ...latest.data(),
        active: false,
        lifecycleStatus: 'ARCHIVED',
        archivedAt: nowIso(),
        archivedByUid: actor.uid,
        updatedAt: nowIso(),
        updatedByUid: actor.uid
      }, { merge: false });
      result = { id: latest.id, deleted: false, archived: true, links: [{ collection: 'catalogItems', count: links.itemLinks.length }] };
      return;
    }
    if (typeof transaction.delete !== 'function') throw new Error('CATALOG_DELETE_UNAVAILABLE');
    transaction.delete(ref);
    links.registry.forEach(entry => transaction.delete(db.collection(MODEL_REGISTRY_COLLECTION).doc(entry.id)));
    result = { id: latest.id, deleted: true, archived: false, links: [] };
  });
  return result;
}

export async function getCatalogBootstrap(db: Firestore | any, options?: { limit?: number }) {
  // The catalog grid has its own cursor API. Bootstrap intentionally loads
  // only a tiny compatibility slice so opening setup never reads every SKU.
  const [models, dictionaries, catalogPage] = await Promise.all([
    listCollection(db, MODELS_COLLECTION),
    listCollection(db, DICTIONARIES_COLLECTION),
    listCatalogItems(db, { limit: Math.max(1, Math.min(Number(options?.limit || 1), 100)) })
  ]);
  return {
    models: models.sort((left, right) => asString(left?.modelName).localeCompare(asString(right?.modelName))),
    dictionaries: dictionaries.sort((left, right) => asString(left?.name).localeCompare(asString(right?.name))),
    items: catalogPage.items,
    itemCount: catalogPage.summary.total,
    hasMoreItems: catalogPage.hasMore
  };
}
