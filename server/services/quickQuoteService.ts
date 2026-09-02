import crypto from 'node:crypto';
import { FieldValue, Firestore, Transaction } from 'firebase-admin/firestore';
import { buildCrmSearchPrefixes, chooseCrmAssignee, normalizeCrmPhone, prepareCrmPreSaleAssignment } from './crmOperationsService';
import { normalizeOperationalPolicyVersions, selectEffectiveOperationalPolicy } from './operationalPolicyService';
import { getVietnamDateString } from '../../shared/vietnamTime';
import {
  canonicalDeviceModelName,
  canonicalDeviceVariantKey,
  deviceRetailPriceVnd,
  deviceVariantKeyCandidates,
  MIN_DEVICE_RETAIL_PRICE_VND,
  normalizeRetailPriceKey
} from '../../shared/retailPricing';
import { createQuickQuoteUnassignedTelegramOutboxRecord, dispatchTelegramOutboxEvent, loadTelegramConfig, quickQuoteUnassignedOutboxId, telegramIsConfigured } from './telegramService';

export type QuickQuoteType = 'DEVICE' | 'REPAIR' | 'ACCESSORY';
export type QuickQuoteStatus = 'NEW' | 'ASSIGNED' | 'CONTACTED' | 'QUOTED' | 'CONVERTED' | 'CLOSED' | 'SPAM';

export type QuickQuoteStaffActor = {
  uid: string;
  name?: string;
  role?: string;
  branchId?: string;
  assignedBranchIds?: string[];
};

type SelectionPayload = {
  v: 1;
  kind: QuickQuoteType;
  sourceId: string;
  branchId?: string;
  displayedPrice: number;
  policyVersion?: string | null;
  expiresAt: number;
};

type ResolvedLine = {
  sourceType: QuickQuoteType;
  sourceId: string;
  name: string;
  description?: string;
  model?: string;
  storage?: string;
  color?: string;
  condition?: string;
  brand?: string;
  category?: string;
  durationMinutes?: number;
  warrantyPeriodMonths?: number;
  inspectionRequired?: boolean;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  pricePolicyId?: string | null;
  pricePolicyVersion?: string | null;
};

function refreshedPublicLine(line: ResolvedLine, selectionToken: string) {
  return {
    selectionToken,
    name: line.name,
    description: line.description || '',
    model: line.model || '',
    storage: line.storage || '',
    color: line.color || '',
    condition: line.condition || '',
    brand: line.brand || '',
    category: line.category || '',
    durationMinutes: line.durationMinutes || 0,
    warrantyPeriodMonths: line.warrantyPeriodMonths || 0,
    inspectionRequired: line.inspectionRequired === true,
    price: line.inspectionRequired ? null : line.unitPrice,
    quantity: line.quantity,
    lineTotal: line.lineTotal
  };
}

export class QuickQuoteError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, details?: Record<string, unknown>) {
    super(code);
    this.name = 'QuickQuoteError';
    this.code = code;
    this.details = details;
  }
}

const QUOTE_TYPES = new Set<QuickQuoteType>(['DEVICE', 'REPAIR', 'ACCESSORY']);
const MANAGER_ROLES = new Set(['ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'STORE_MANAGER']);
const STAFF_STATUSES = new Set<QuickQuoteStatus>(['ASSIGNED', 'CONTACTED', 'CLOSED', 'SPAM']);
const TOKEN_TTL_MS = 15 * 60_000;
const PUBLIC_ANALYTICS_EVENTS = new Set([
  'PAGE_VIEW', 'CATEGORY_SELECTED', 'OFFER_SELECTED', 'FORM_OPENED',
  'SUBMIT_SUCCESS', 'PRICE_CHANGED', 'OFFER_UNAVAILABLE'
]);
const DEFAULT_SETTINGS = {
  enabled: true,
  validityHours: 24,
  responseSlaMinutes: 15,
  disclaimer: 'Giá được ghi nhận tại thời điểm gửi yêu cầu, chưa bao gồm giữ hàng và có thể thay đổi khi tình trạng tồn kho thay đổi.',
  maxDeviceLines: 1,
  maxRepairLines: 10,
  maxAccessoryLines: 20,
  fallbackBranchId: ''
};

function text(value: unknown, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function safePositiveInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalize(value: unknown) {
  return text(value, 500)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizePriceKey(value: unknown) {
  return normalizeRetailPriceKey(text(value, 500));
}

function serialize(value: any): any {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.toMillis === 'function') return new Date(value.toMillis()).toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serialize(nested)]).filter(([, nested]) => nested !== undefined));
}

function hash(parts: unknown[]) {
  return crypto.createHash('sha256').update(parts.map(item => String(item || '')).join('|')).digest('hex');
}

function payloadHash(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function tokenKey() {
  const configured = text(process.env.QUICK_QUOTE_TOKEN_KEY, 500);
  if (!configured) {
    if (process.env.NODE_ENV === 'production') throw new QuickQuoteError('QUICK_QUOTE_CONFIGURATION_REQUIRED');
    return crypto.createHash('sha256').update('phonehouse-quick-quote-development-key').digest();
  }
  if (configured.length < 32) throw new QuickQuoteError('QUICK_QUOTE_CONFIGURATION_REQUIRED');
  return crypto.createHash('sha256').update(configured).digest();
}

export function createQuickQuoteSelectionToken(input: Omit<SelectionPayload, 'v' | 'expiresAt'>, now = Date.now()) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const payload: SelectionPayload = { v: 1, ...input, expiresAt: now + TOKEN_TTL_MS };
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${Buffer.concat([iv, tag, encrypted]).toString('base64url')}`;
}

export function decodeQuickQuoteSelectionToken(token: unknown, now = Date.now()): SelectionPayload {
  try {
    const raw = text(token, 4_000);
    if (!raw.startsWith('v1.')) throw new Error('FORMAT');
    const packed = Buffer.from(raw.slice(3), 'base64url');
    if (packed.length < 30) throw new Error('FORMAT');
    const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    const parsed = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8')) as SelectionPayload;
    if (parsed.v !== 1 || !QUOTE_TYPES.has(parsed.kind) || !parsed.sourceId || parsed.expiresAt <= now) throw new Error('EXPIRED');
    return parsed;
  } catch (error) {
    if (error instanceof QuickQuoteError) throw error;
    throw new QuickQuoteError('QUICK_QUOTE_SELECTION_INVALID_OR_EXPIRED');
  }
}

function encodeCursor(offset: number) {
  return Buffer.from(JSON.stringify({ v: 1, offset }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: unknown) {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(text(cursor, 500), 'base64url').toString('utf8'));
    if (parsed?.v !== 1 || !Number.isInteger(parsed.offset) || parsed.offset < 0 || parsed.offset > 100_000) throw new Error('INVALID');
    return parsed.offset;
  } catch {
    throw new QuickQuoteError('QUICK_QUOTE_CURSOR_INVALID');
  }
}

function publicSettings(record: any) {
  return {
    enabled: record?.enabled !== false,
    validityHours: Math.max(1, Math.min(168, safePositiveInt(record?.validityHours, DEFAULT_SETTINGS.validityHours))),
    responseSlaMinutes: Math.max(1, Math.min(1_440, safePositiveInt(record?.responseSlaMinutes, DEFAULT_SETTINGS.responseSlaMinutes))),
    disclaimer: text(record?.disclaimer || DEFAULT_SETTINGS.disclaimer, 1_500),
    fallbackBranchId: text(record?.fallbackBranchId, 120)
  };
}

export async function loadQuickQuoteSettings(db: Firestore) {
  const snapshot = await db.collection('customerPortalConfigs').doc('quickQuote').get();
  return { ...DEFAULT_SETTINGS, ...(snapshot.exists ? snapshot.data() : {}), ...publicSettings(snapshot.data()) };
}

function actorRole(actor: QuickQuoteStaffActor) {
  return text(actor.role, 50).toUpperCase();
}

function actorCanAccessBranch(actor: QuickQuoteStaffActor, branchId: string) {
  return actorRole(actor) === 'ADMIN' || actorRole(actor) === 'REGIONAL_MANAGER'
    || actor.branchId === branchId || (actor.assignedBranchIds || []).includes(branchId);
}

async function activeBranch(db: Firestore, branchId: string) {
  if (!branchId) throw new QuickQuoteError('QUICK_QUOTE_BRANCH_REQUIRED');
  const snapshot = await db.collection('branches').doc(branchId).get();
  if (!snapshot.exists || snapshot.data()?.isActive === false) throw new QuickQuoteError('QUICK_QUOTE_BRANCH_NOT_ACTIVE');
  return { id: snapshot.id, ...snapshot.data() } as any;
}

type QuickQuoteReader = Pick<Transaction, 'get'>;

async function readQuickQuoteSnapshot(reference: any, reader?: QuickQuoteReader) {
  return reader ? reader.get(reference) : reference.get();
}

async function currentPricing(db: Firestore, reader?: QuickQuoteReader) {
  const snapshot = await readQuickQuoteSnapshot(db.collection('operationalConfigs').doc('retailPricing'), reader);
  return selectEffectiveOperationalPolicy(normalizeOperationalPolicyVersions('retailPricing', snapshot.exists ? snapshot.data() : null));
}

export function deviceVariantKey(data: any) {
  return canonicalDeviceVariantKey(data);
}

export function deviceVariantId(data: any) {
  const key = typeof data === 'string' ? normalizePriceKey(data) : deviceVariantKey(data);
  return `QDV_${hash(['QUICK_QUOTE_DEVICE_VARIANT', key]).slice(0, 24).toUpperCase()}`;
}

function resolvePrice(policy: any, branchId: string, kind: 'DEVICE' | 'ACCESSORY', sourceId: string, data: any) {
  const entries = Array.isArray(policy?.entries) ? policy.entries : [];
  const matching = entries.filter((entry: any) => {
    if (entry?.isActive !== true || entry.itemType !== kind || !['ALL', branchId].includes(String(entry.branchId || 'ALL'))) return false;
    const key = normalizePriceKey(entry.itemKey);
    if (entry.matchType === 'ITEM_ID') return key === normalizePriceKey(sourceId);
    if (entry.matchType === 'SKU') return key === normalizePriceKey(data?.sku);
    return kind === 'DEVICE' && entry.matchType === 'MODEL_VARIANT' && deviceVariantKeyCandidates(data).includes(key);
  });
  const priority = (entry: any) => (entry.branchId === branchId ? 100 : 0) + (entry.matchType === 'ITEM_ID' ? 30 : entry.matchType === 'SKU' ? 20 : 10);
  const normalizedPrice = (value: unknown) => kind === 'DEVICE' ? deviceRetailPriceVnd(value) : Number(value);
  const validPrice = (value: unknown) => Number.isSafeInteger(normalizedPrice(value))
    && normalizedPrice(value) >= (kind === 'DEVICE' ? MIN_DEVICE_RETAIL_PRICE_VND : 1);
  const entry = matching
    .sort((left: any, right: any) => priority(right) - priority(left))
    .find((candidate: any) => validPrice(candidate.retailPrice));
  const fallback = Number(kind === 'DEVICE' ? data?.sellPrice : (data?.retailPrice ?? data?.sellPrice));
  const price = normalizedPrice(entry?.retailPrice ?? fallback);
  if (!validPrice(price)) throw new QuickQuoteError('QUICK_QUOTE_PRICE_NOT_AVAILABLE');
  return { price, policyId: entry ? text(policy?.policyId || policy?.id, 120) || null : null, policyVersion: entry ? text(policy?.version, 80) || null : null };
}

function deviceVariantName(item: any) {
  const model = text(canonicalDeviceModelName(item), 160);
  const storage = text(item?.storage, 80);
  return [model, storage && !normalize(model).includes(normalize(storage)) ? storage : ''].filter(Boolean).join(' ');
}

function variantPresentation(config: any, branchId: string, items: any[]) {
  const scoped = config?.publicPresentationByBranch?.[branchId] || {};
  const fallback = items.find(item => item.publicName || item.imageUrl || item.images?.[0]) || items[0] || {};
  return {
    name: text(scoped.publicName || config?.publicName || fallback.publicName || deviceVariantName(fallback), 200),
    description: text(scoped.publicDescription || config?.publicDescription || fallback.publicDescription, 600),
    imageUrl: text(scoped.imageUrl || config?.imageUrl || fallback.imageUrl || fallback.images?.[0], 1_000) || null,
    publicSortOrder: safePositiveInt(scoped.publicSortOrder ?? config?.publicSortOrder, 9_999)
  };
}

function branchVariantIsPublic(config: any, branchId: string, items: any[]) {
  return Array.isArray(config?.publicBranchIds)
    ? config.publicBranchIds.includes(branchId)
    : items.some(item => item.publicVisible === true);
}

function groupDeviceVariants(items: any[]) {
  const groups = new Map<string, any[]>();
  items.forEach(item => {
    const id = deviceVariantId(item);
    groups.set(id, [...(groups.get(id) || []), item]);
  });
  return groups;
}

async function loadDeviceVariantConfigs(db: Firestore) {
  const snapshot = await db.collection('quickQuoteDeviceVariants').limit(1_500).get();
  return new Map(snapshot.docs.map(document => [document.id, { id: document.id, ...document.data() }]));
}

function chooseVariantPrice(policy: any, variantId: string, items: any[]) {
  return items
    .map(item => {
      try { return { item, pricing: resolvePrice(policy, text(item.branchId, 120), 'DEVICE', variantId, item) }; }
      catch (error) {
        if (error instanceof QuickQuoteError && error.code === 'QUICK_QUOTE_PRICE_NOT_AVAILABLE') return null;
        throw error;
      }
    })
    .filter(Boolean)
    .sort((left: any, right: any) => left.pricing.price - right.pricing.price)[0] as { item: any; pricing: ReturnType<typeof resolvePrice> } | undefined;
}

function page<T>(items: T[], cursor: unknown, limitInput: unknown) {
  const offset = decodeCursor(cursor);
  const limit = Math.max(1, Math.min(60, safePositiveInt(limitInput, 24)));
  const sliced = items.slice(offset, offset + limit);
  return { items: sliced, nextCursor: offset + limit < items.length ? encodeCursor(offset + limit) : null, hasMore: offset + limit < items.length };
}

export async function getPublicQuickQuoteBootstrap(db: Firestore) {
  const [settings, branches] = await Promise.all([
    loadQuickQuoteSettings(db),
    db.collection('branches').where('isActive', '==', true).limit(100).get()
  ]);
  return {
    settings: publicSettings(settings),
    branches: branches.docs.map(document => ({
      id: document.id,
      name: text(document.data().name, 160),
      address: text(document.data().address, 400),
      phone: text(document.data().phone, 30),
      openingHours: text(document.data().openingHours, 100)
    })),
    quoteTypes: ['DEVICE', 'REPAIR', 'ACCESSORY'] as QuickQuoteType[],
    generatedAt: new Date().toISOString()
  };
}

export async function recordPublicQuickQuoteAnalytics(db: Firestore, input: any) {
  const event = text(input.event, 50).toUpperCase();
  if (!PUBLIC_ANALYTICS_EVENTS.has(event)) throw new QuickQuoteError('QUICK_QUOTE_ANALYTICS_EVENT_INVALID');
  const quoteType = text(input.quoteType, 30).toUpperCase();
  if (quoteType && !QUOTE_TYPES.has(quoteType as QuickQuoteType)) throw new QuickQuoteError('QUICK_QUOTE_TYPE_INVALID');
  const sessionId = text(input.sessionId, 180);
  if (sessionId.length < 8) throw new QuickQuoteError('QUICK_QUOTE_ANALYTICS_SESSION_INVALID');
  const reference = db.collection('customerQuoteAnalytics').doc();
  await reference.create({
    id: reference.id,
    event,
    quoteType: quoteType || null,
    branchId: text(input.branchId, 120) || null,
    sessionFingerprint: hash([sessionId]),
    requestCode: event === 'SUBMIT_SUCCESS' ? text(input.requestCode, 40) || null : null,
    utm: {
      source: text(input.utm?.source, 120), medium: text(input.utm?.medium, 120),
      campaign: text(input.utm?.campaign, 160), content: text(input.utm?.content, 160)
    },
    createdAt: FieldValue.serverTimestamp()
  });
  return { accepted: true };
}

export async function listPublicQuickQuoteDevices(db: Firestore, input: any) {
  const settings = await loadQuickQuoteSettings(db);
  if (!settings.enabled) throw new QuickQuoteError('QUICK_QUOTE_DISABLED');
  if (input.branchId) await activeBranch(db, text(input.branchId, 120));
  const [snapshot, policy, activeBranches, variantConfigs] = await Promise.all([
    db.collection('devices').where('status', '==', 'in_stock').limit(1_000).get(),
    currentPricing(db),
    db.collection('branches').where('isActive', '==', true).limit(100).get(),
    loadDeviceVariantConfigs(db)
  ]);
  const activeBranchIds = new Set(activeBranches.docs.map(document => document.id));
  const branchNames = new Map(activeBranches.docs.map(document => [document.id, text(document.data().name, 160)]));
  const filters = { branch: text(input.branchId, 120), search: normalize(input.search), model: normalize(input.model), storage: normalize(input.storage), condition: normalize(input.condition), color: normalize(input.color) };
  const stock = snapshot.docs.map(document => ({ id: document.id, ...document.data() } as any))
    .filter(item => activeBranchIds.has(text(item.branchId, 120)) && (!filters.branch || item.branchId === filters.branch))
    .filter(item => !filters.model || normalize(canonicalDeviceModelName(item)) === filters.model)
    .filter(item => !filters.storage || normalize(item.storage) === filters.storage)
    .filter(item => !filters.condition || normalize(item.condition) === filters.condition)
    .filter(item => !filters.color || normalize(item.color) === filters.color);
  const items = [...groupDeviceVariants(stock).entries()]
    .map(([variantId, variantItems]) => {
      const config = variantConfigs.get(variantId);
      const publicItems = variantItems.filter(item => {
        const branchId = text(item.branchId, 120);
        const branchItems = variantItems.filter(candidate => text(candidate.branchId, 120) === branchId);
        return branchVariantIsPublic(config, branchId, branchItems);
      });
      if (!publicItems.length) return null;
      const choice = chooseVariantPrice(policy, variantId, publicItems);
      if (!choice) return null;
      const branchId = text(choice.item.branchId, 120);
      const presentation = variantPresentation(config, branchId, publicItems);
      const colors = [...new Set(publicItems.map(item => text(item.color, 100)).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'vi'));
      const regions = [...new Set(publicItems.map(item => text(item.region, 80)).filter(Boolean))];
      const branchIds = [...new Set(publicItems.map(item => text(item.branchId, 120)).filter(Boolean))];
      const availablePrices = new Set(publicItems.flatMap(item => {
        try { return [resolvePrice(policy, text(item.branchId, 120), 'DEVICE', variantId, item).price]; }
        catch (error) {
          if (error instanceof QuickQuoteError && error.code === 'QUICK_QUOTE_PRICE_NOT_AVAILABLE') return [];
          throw error;
        }
      }));
      const batteryValues = publicItems.map(item => safePositiveInt(item.batteryHealth)).filter(value => value > 0);
      const warrantyValues = publicItems.map(item => safePositiveInt(item.warrantyPeriodMonths)).filter(value => value > 0);
      return {
        selectionToken: createQuickQuoteSelectionToken({ kind: 'DEVICE', sourceId: variantId, branchId, displayedPrice: choice.pricing.price, policyVersion: choice.pricing.policyVersion }),
        name: presentation.name,
        description: presentation.description,
        model: text(canonicalDeviceModelName(choice.item), 160), storage: text(choice.item.storage, 80),
        color: colors.length === 1 ? colors[0] : `${colors.length} màu`, colors,
        condition: text(choice.item.condition, 120),
        region: regions.length === 1 ? regions[0] : regions.length > 1 ? 'Nhiều phiên bản' : '',
        batteryHealth: batteryValues.length ? Math.min(...batteryValues) : 0,
        warrantyPeriodMonths: warrantyValues.length ? Math.min(...warrantyValues) : 0,
        imageUrl: presentation.imageUrl,
        publicSortOrder: presentation.publicSortOrder,
        branchId, branchName: branchNames.get(branchId) || '',
        availableBranchIds: branchIds,
        availableBranchNames: branchIds.map(id => branchNames.get(id) || id),
        price: choice.pricing.price, priceIsStartingFrom: availablePrices.size > 1, inStock: true
      };
    })
    .filter(Boolean)
    .filter((item: any) => !filters.search || normalize([item.name, item.description, item.model, item.storage, item.colors.join(' '), item.condition].join(' ')).includes(filters.search))
    .sort((left: any, right: any) => left.publicSortOrder - right.publicSortOrder || left.price - right.price || left.name.localeCompare(right.name, 'vi'));
  const result = page(items, input.cursor, input.limit);
  return { ...result, coverageLimited: snapshot.size >= 1_000 };
}

function compatibleModels(value: any) {
  if (Array.isArray(value)) return value.map(item => text(item, 160)).filter(Boolean);
  return text(value, 2_000).split(/[,;\n]/).map(item => item.trim()).filter(Boolean).slice(0, 100);
}

function modelCompatible(serviceModels: string[], model: string) {
  if (!model || serviceModels.length === 0) return true;
  const target = normalize(model);
  return serviceModels.some(item => normalize(item).includes(target) || target.includes(normalize(item)));
}

function accessoryPublicPresentation(product: any, branchId: string) {
  const scoped = product?.publicPresentationByBranch?.[branchId] || {};
  return {
    name: text(scoped.publicName || product?.publicName || product?.name, 200),
    description: text(scoped.publicDescription || product?.publicDescription || product?.notes, 600),
    imageUrl: text(scoped.imageUrl || product?.imageUrl, 1_000) || null,
    publicSortOrder: safePositiveInt(scoped.publicSortOrder ?? product?.publicSortOrder, 9_999)
  };
}

export async function listPublicQuickQuoteRepairServices(db: Firestore, input: any) {
  const settings = await loadQuickQuoteSettings(db);
  if (!settings.enabled) throw new QuickQuoteError('QUICK_QUOTE_DISABLED');
  const snapshot = await db.collection('repairServices').limit(600).get();
  const model = text(input.model, 160);
  const search = normalize(input.search);
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() } as any))
    .filter(item => item.isActive !== false && item.isArchived !== true && item.publicVisible === true)
    .filter(item => modelCompatible(compatibleModels(item.compatibleModels), model))
    .filter(item => !search || normalize([item.publicName, item.name, item.categoryName, item.publicDescription].join(' ')).includes(search))
    .map(item => {
      const price = safePositiveInt(item.sellPrice);
      const inspectionRequired = item.quoteMode === 'INSPECTION_REQUIRED' || price <= 0;
      return {
        selectionToken: createQuickQuoteSelectionToken({ kind: 'REPAIR', sourceId: item.id, displayedPrice: inspectionRequired ? 0 : price, policyVersion: text(item.updatedAt, 80) || null }),
        name: text(item.publicName || item.name, 200), description: text(item.publicDescription || item.notes, 600), category: text(item.categoryName || item.category, 120),
        compatibleModels: compatibleModels(item.compatibleModels), price: inspectionRequired ? null : price, inspectionRequired,
        durationMinutes: safePositiveInt(item.durationMinutes), warrantyPeriodMonths: Math.min(120, safePositiveInt(item.warrantyPeriodMonths)),
        imageUrl: text(item.imageUrl, 1_000) || null,
        publicSortOrder: safePositiveInt(item.publicSortOrder, 9_999)
      };
    })
    .sort((left, right) => left.publicSortOrder - right.publicSortOrder || left.name.localeCompare(right.name, 'vi'));
}

async function productMap(db: Firestore, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const result = new Map<string, any>();
  for (let offset = 0; offset < unique.length; offset += 200) {
    const snapshots = await db.getAll(...unique.slice(offset, offset + 200).map(id => db.collection('products').doc(id)));
    snapshots.forEach(snapshot => { if (snapshot.exists) result.set(snapshot.id, { id: snapshot.id, ...snapshot.data() }); });
  }
  return result;
}

export async function listPublicQuickQuoteAccessories(db: Firestore, input: any) {
  const settings = await loadQuickQuoteSettings(db);
  if (!settings.enabled) throw new QuickQuoteError('QUICK_QUOTE_DISABLED');
  const branchId = text(input.branchId, 120);
  await activeBranch(db, branchId);
  const [balances, policy] = await Promise.all([
    db.collection('inventoryBalances').where('branchId', '==', branchId).limit(1_500).get(),
    currentPricing(db)
  ]);
  const availableByProduct = new Map<string, number>();
  balances.docs.forEach(document => {
    const data = document.data();
    const productId = text(data.productId, 160);
    const available = Number(data.available ?? data.onHand ?? 0);
    if (productId && Number.isFinite(available) && available > 0) availableByProduct.set(productId, (availableByProduct.get(productId) || 0) + available);
  });
  const products = await productMap(db, [...availableByProduct.keys()]);
  const filters = {
    search: normalize(input.search), model: text(input.model, 160), category: normalize(input.category), brand: normalize(input.brand),
    minPrice: safePositiveInt(input.minPrice), maxPrice: safePositiveInt(input.maxPrice)
  };
  const items = [...products.values()]
    .filter(product => product.publicVisible === true && Array.isArray(product.publicBranchIds) && product.publicBranchIds.includes(branchId) && product.status !== 'inactive' && availableByProduct.get(product.id)! > 0)
    .filter(product => modelCompatible(compatibleModels(product.compatibleModels), filters.model))
    .filter(product => !filters.search || normalize([product.publicName, product.name, product.sku, product.brand, product.category].join(' ')).includes(filters.search))
    .filter(product => !filters.category || normalize(product.category) === filters.category || normalize(product.catalogGroupCode) === filters.category)
    .filter(product => !filters.brand || normalize(product.brand) === filters.brand)
    .map(product => {
      const pricing = resolvePrice(policy, branchId, 'ACCESSORY', product.id, product);
      const presentation = accessoryPublicPresentation(product, branchId);
      return {
        selectionToken: createQuickQuoteSelectionToken({ kind: 'ACCESSORY', sourceId: product.id, branchId, displayedPrice: pricing.price, policyVersion: pricing.policyVersion }),
        name: presentation.name, description: presentation.description,
        category: text(product.category, 120), brand: text(product.brand, 120), compatibleModels: compatibleModels(product.compatibleModels),
        imageUrl: presentation.imageUrl, publicSortOrder: presentation.publicSortOrder, price: pricing.price, inStock: true, branchId
      };
    })
    .filter(product => (!filters.minPrice || product.price >= filters.minPrice) && (!filters.maxPrice || product.price <= filters.maxPrice))
    .sort((left, right) => left.publicSortOrder - right.publicSortOrder || left.price - right.price || left.name.localeCompare(right.name, 'vi'));
  const result = page(items, input.cursor, input.limit);
  return { ...result, coverageLimited: balances.size >= 1_500 };
}

async function resolveRequestSelections(db: Firestore, quoteType: QuickQuoteType, branchId: string, selections: any[], reader?: QuickQuoteReader, repairModel = '') {
  const policy = await currentPricing(db, reader);
  const lines: ResolvedLine[] = [];
  const refreshed: any[] = [];
  const seen = new Set<string>();
  let changed = false;
  for (const selection of selections) {
    const decoded = decodeQuickQuoteSelectionToken(selection?.selectionToken);
    if (decoded.kind !== quoteType || (decoded.branchId && decoded.branchId !== branchId) || seen.has(decoded.sourceId)) throw new QuickQuoteError('QUICK_QUOTE_SELECTION_INVALID');
    seen.add(decoded.sourceId);
    const quantity = quoteType === 'ACCESSORY' ? Math.max(1, Math.min(100, safePositiveInt(selection?.quantity, 1))) : 1;
    if (quoteType === 'DEVICE') {
      if (decoded.sourceId.startsWith('QDV_')) {
        const [stockSnapshot, configSnapshot] = await Promise.all([
          readQuickQuoteSnapshot(db.collection('devices').where('status', '==', 'in_stock').limit(1_000), reader),
          readQuickQuoteSnapshot(db.collection('quickQuoteDeviceVariants').doc(decoded.sourceId), reader)
        ]);
        const available = stockSnapshot.docs
          .map((document: any) => ({ id: document.id, ...document.data() }))
          .filter((item: any) => item.branchId === branchId && deviceVariantId(item) === decoded.sourceId);
        const config = configSnapshot.exists ? configSnapshot.data() : null;
        if (!available.length || !branchVariantIsPublic(config, branchId, available)) throw new QuickQuoteError('QUICK_QUOTE_OFFER_UNAVAILABLE');
        const choice = chooseVariantPrice(policy, decoded.sourceId, available);
        if (!choice) throw new QuickQuoteError('QUICK_QUOTE_PRICE_NOT_AVAILABLE');
        const presentation = variantPresentation(config, branchId, available);
        const colors = [...new Set<string>(available.map((item: any) => text(item.color, 100)).filter(Boolean))];
        const line: ResolvedLine = {
          sourceType: 'DEVICE', sourceId: decoded.sourceId, name: presentation.name,
          description: presentation.description, model: text(canonicalDeviceModelName(choice.item), 160), storage: text(choice.item.storage, 80),
          color: colors.length === 1 ? colors[0] : `${colors.length} màu`, condition: text(choice.item.condition, 120),
          warrantyPeriodMonths: safePositiveInt(choice.item.warrantyPeriodMonths), unitPrice: choice.pricing.price,
          quantity: 1, lineTotal: choice.pricing.price, pricePolicyId: choice.pricing.policyId, pricePolicyVersion: choice.pricing.policyVersion
        };
        lines.push(line);
        changed ||= choice.pricing.price !== decoded.displayedPrice;
        refreshed.push(refreshedPublicLine(line, createQuickQuoteSelectionToken({ kind: 'DEVICE', sourceId: decoded.sourceId, branchId, displayedPrice: choice.pricing.price, policyVersion: choice.pricing.policyVersion })));
      } else {
        // Keep legacy IMEI-bound tokens valid for their short 15-minute lifetime
        // during rollout. New offers never disclose or bind to a specific IMEI.
        const snapshot = await readQuickQuoteSnapshot(db.collection('devices').doc(decoded.sourceId), reader);
        const item = snapshot.data();
        if (!snapshot.exists || item?.publicVisible !== true || item.status !== 'in_stock' || item.branchId !== branchId) throw new QuickQuoteError('QUICK_QUOTE_OFFER_UNAVAILABLE');
        const pricing = resolvePrice(policy, branchId, 'DEVICE', snapshot.id, item);
        const line: ResolvedLine = { sourceType: 'DEVICE', sourceId: snapshot.id, name: text(item.publicName || deviceVariantName(item), 200), model: text(item.model, 160), storage: text(item.storage, 80), color: text(item.color, 100), condition: text(item.condition, 120), warrantyPeriodMonths: safePositiveInt(item.warrantyPeriodMonths), unitPrice: pricing.price, quantity: 1, lineTotal: pricing.price, pricePolicyId: pricing.policyId, pricePolicyVersion: pricing.policyVersion };
        lines.push(line);
        changed ||= pricing.price !== decoded.displayedPrice;
        refreshed.push(refreshedPublicLine(line, createQuickQuoteSelectionToken({ kind: 'DEVICE', sourceId: snapshot.id, branchId, displayedPrice: pricing.price, policyVersion: pricing.policyVersion })));
      }
    } else if (quoteType === 'ACCESSORY') {
      const [productSnapshot, balanceSnapshot] = await Promise.all([
        readQuickQuoteSnapshot(db.collection('products').doc(decoded.sourceId), reader),
        readQuickQuoteSnapshot(db.collection('inventoryBalances').where('branchId', '==', branchId).where('productId', '==', decoded.sourceId).limit(100), reader)
      ]);
      const product = productSnapshot.data();
      const available = balanceSnapshot.docs.reduce((sum, document) => sum + Number(document.data().available ?? document.data().onHand ?? 0), 0);
      if (!productSnapshot.exists || product?.publicVisible !== true || !Array.isArray(product.publicBranchIds) || !product.publicBranchIds.includes(branchId) || product.status === 'inactive' || available < quantity) throw new QuickQuoteError('QUICK_QUOTE_OFFER_UNAVAILABLE');
      const pricing = resolvePrice(policy, branchId, 'ACCESSORY', productSnapshot.id, product);
      const presentation = accessoryPublicPresentation(product, branchId);
      const line: ResolvedLine = { sourceType: 'ACCESSORY', sourceId: productSnapshot.id, name: presentation.name, description: presentation.description, brand: text(product.brand, 120), category: text(product.category, 120), unitPrice: pricing.price, quantity, lineTotal: pricing.price * quantity, pricePolicyId: pricing.policyId, pricePolicyVersion: pricing.policyVersion };
      lines.push(line);
      changed ||= pricing.price !== decoded.displayedPrice;
      refreshed.push(refreshedPublicLine(line, createQuickQuoteSelectionToken({ kind: 'ACCESSORY', sourceId: productSnapshot.id, branchId, displayedPrice: pricing.price, policyVersion: pricing.policyVersion })));
    } else {
      const snapshot = await readQuickQuoteSnapshot(db.collection('repairServices').doc(decoded.sourceId), reader);
      const service = snapshot.data();
      if (!snapshot.exists || service?.publicVisible !== true || service.isActive === false || service.isArchived === true) throw new QuickQuoteError('QUICK_QUOTE_OFFER_UNAVAILABLE');
      if (!repairModel || !modelCompatible(compatibleModels(service.compatibleModels), repairModel)) throw new QuickQuoteError('QUICK_QUOTE_REPAIR_MODEL_INCOMPATIBLE');
      const price = safePositiveInt(service.sellPrice);
      const inspectionRequired = service.quoteMode === 'INSPECTION_REQUIRED' || price <= 0;
      const currentPrice = inspectionRequired ? 0 : price;
      const line: ResolvedLine = { sourceType: 'REPAIR', sourceId: snapshot.id, name: text(service.publicName || service.name, 200), description: text(service.publicDescription || service.notes, 600), model: repairModel, category: text(service.categoryName || service.category, 120), durationMinutes: safePositiveInt(service.durationMinutes), warrantyPeriodMonths: safePositiveInt(service.warrantyPeriodMonths), inspectionRequired, unitPrice: currentPrice, quantity, lineTotal: currentPrice * quantity };
      lines.push(line);
      changed ||= currentPrice !== decoded.displayedPrice;
      refreshed.push(refreshedPublicLine(line, createQuickQuoteSelectionToken({ kind: 'REPAIR', sourceId: snapshot.id, displayedPrice: currentPrice, policyVersion: text(service.updatedAt, 80) || null })));
    }
  }
  if (changed) throw new QuickQuoteError('QUICK_QUOTE_PRICE_CHANGED', { items: refreshed, estimatedTotal: lines.reduce((sum, line) => sum + line.lineTotal, 0) });
  return lines;
}

export async function createPublicQuickQuoteRequest(db: Firestore, input: any) {
  const settings = await loadQuickQuoteSettings(db);
  if (!settings.enabled) throw new QuickQuoteError('QUICK_QUOTE_DISABLED');
  if (text(input.website, 200)) throw new QuickQuoteError('QUICK_QUOTE_SPAM_REJECTED');
  const operationKey = text(input.idempotencyKey, 180);
  if (operationKey.length < 8) throw new QuickQuoteError('QUICK_QUOTE_IDEMPOTENCY_REQUIRED');
  const quoteType = text(input.quoteType, 30).toUpperCase() as QuickQuoteType;
  if (!QUOTE_TYPES.has(quoteType)) throw new QuickQuoteError('QUICK_QUOTE_TYPE_INVALID');
  const branchId = text(input.branchId, 120);
  const repairModel = quoteType === 'REPAIR' ? text(input.repairModel, 160) : '';
  if (quoteType === 'REPAIR' && !repairModel) throw new QuickQuoteError('QUICK_QUOTE_REPAIR_MODEL_REQUIRED');
  await activeBranch(db, branchId);
  const name = text(input.customerName, 160);
  if (name.length < 2) throw new QuickQuoteError('QUICK_QUOTE_CUSTOMER_NAME_REQUIRED');
  const phoneNormalized = normalizeCrmPhone(input.customerPhone);
  const contactChannel = text(input.contactChannel, 20).toUpperCase();
  if (!['CALL', 'ZALO'].includes(contactChannel) || input.contactConsent !== true) throw new QuickQuoteError('QUICK_QUOTE_CONTACT_CONSENT_REQUIRED');
  const selections = Array.isArray(input.selections) ? input.selections : [];
  const maximum = quoteType === 'DEVICE' ? 1 : quoteType === 'REPAIR' ? Math.min(10, safePositiveInt(settings.maxRepairLines, 10)) : Math.min(20, safePositiveInt(settings.maxAccessoryLines, 20));
  if (!selections.length || selections.length > maximum || (quoteType === 'DEVICE' && selections.length !== 1)) throw new QuickQuoteError('QUICK_QUOTE_LINE_LIMIT_INVALID');
  const normalizedUtm = {
    source: text(input.utm?.source, 120), medium: text(input.utm?.medium, 120),
    campaign: text(input.utm?.campaign, 160), content: text(input.utm?.content, 160)
  };
  // Hash every material client field, including opaque tokens and consent.
  // The server price is still resolved independently from those tokens.
  const requestPayloadHash = payloadHash({
    quoteType, branchId, repairModel, phoneNormalized, name, contactChannel,
    contactConsent: true, marketingConsent: input.marketingConsent === true,
    note: text(input.note, 1_500), utm: normalizedUtm,
    selections: selections.map(selection => ({ selectionToken: text(selection?.selectionToken, 4_000), quantity: safePositiveInt(selection?.quantity, 1) }))
  });
  const assignmentContext = await prepareCrmPreSaleAssignment(db, branchId);
  const scheduledCandidates = assignmentContext.candidates.filter(candidate => candidate.scheduledNow === true);
  const telegramConfig = scheduledCandidates.length === 0 ? await loadTelegramConfig(db) : null;
  const shouldNotifyUnassigned = Boolean(telegramConfig && telegramConfig.alertsEnabled && telegramIsConfigured(telegramConfig));
  const now = new Date();
  const nowIso = now.toISOString();
  const validityHours = Math.max(1, Math.min(168, safePositiveInt(settings.validityHours, 24)));
  const responseSlaMinutes = Math.max(1, Math.min(1_440, safePositiveInt(settings.responseSlaMinutes, assignmentContext.responseSlaMinutes)));
  const expiresAt = new Date(now.getTime() + validityHours * 3_600_000).toISOString();
  const dueAt = new Date(now.getTime() + responseSlaMinutes * 60_000).toISOString();
  const operationRef = db.collection('customerQuoteRequestOperations').doc(`QREQ_${hash([operationKey]).slice(0, 32)}`);
  const phoneBucketRef = db.collection('customerQuoteRateLimits').doc(`PHONE_${hash([phoneNormalized, Math.floor(now.getTime() / 3_600_000)]).slice(0, 32)}`);
  const dedupeRef = db.collection('customerQuoteRequestDedup').doc(`DEDUP_${hash([phoneNormalized, branchId, quoteType, requestPayloadHash]).slice(0, 32)}`);
  const requestRef = db.collection('customerQuoteRequests').doc();
  const leadRef = db.collection('leads').doc();
  const taskRef = db.collection('crmTasks').doc(`TASK_${leadRef.id}_QUICK_QUOTE`);
  const phoneRef = db.collection('crmPhoneRegistry').doc(phoneNormalized);
  const customerId = `CUST_${phoneNormalized}`;
  const customerRef = db.collection('crmCustomerProfiles').doc(customerId);
  const counterRef = db.collection('crmAssignmentCounters').doc(`${branchId}_PRE_SALE`);
  const branchRef = db.collection('branches').doc(branchId);

  const result = await db.runTransaction(async transaction => {
    // Idempotent retries must work even after a 15-minute selection token has
    // expired, therefore inspect the operation and exact-payload dedupe first.
    const operationSnapshot = await transaction.get(operationRef);
    if (operationSnapshot.exists) {
      if (operationSnapshot.data()?.payloadHash !== requestPayloadHash) throw new QuickQuoteError('QUICK_QUOTE_IDEMPOTENCY_CONFLICT');
      return { ...operationSnapshot.data()?.result, idempotentReplay: true };
    }
    const dedupeSnapshot = await transaction.get(dedupeRef);
    const dedupe = dedupeSnapshot.data();
    if (dedupeSnapshot.exists && Date.parse(String(dedupe?.expiresAt || '')) > now.getTime()) return { ...dedupe?.result, duplicateReplay: true };
    const [lines, phoneBucketSnapshot, phoneSnapshot, customerSnapshot, counterSnapshot, branchSnapshot] = await Promise.all([
      resolveRequestSelections(db, quoteType, branchId, selections, transaction, repairModel),
      transaction.get(phoneBucketRef), transaction.get(phoneRef), transaction.get(customerRef), transaction.get(counterRef), transaction.get(branchRef)
    ]);
    if (!branchSnapshot.exists || branchSnapshot.data()?.isActive === false) throw new QuickQuoteError('QUICK_QUOTE_BRANCH_NOT_ACTIVE');
    const branch = branchSnapshot.data() || {};
    const estimatedTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const phoneCount = safePositiveInt(phoneBucketSnapshot.data()?.count);
    if (phoneCount >= 3) throw new QuickQuoteError('QUICK_QUOTE_PHONE_RATE_LIMITED');
    const rotation = safePositiveInt(counterSnapshot.data()?.rotation);
    // A public request may only be auto-assigned to a Sale who is currently
    // scheduled. If nobody is in shift, keep it visibly UNASSIGNED so a
    // manager can claim it; never manufacture ownership with a system user or
    // an off-shift fallback account.
    const assignee = chooseCrmAssignee(scheduledCandidates, rotation);
    const assigned = Boolean(assignee);
    const requestCode = `BG-${getVietnamDateString(now).slice(2).replace(/-/g, '')}-${requestRef.id.slice(-5).toUpperCase()}`;
    const publicResult = { requestCode, quoteType, estimatedTotal, expiresAt, responseSlaMinutes, branchName: text(branch.name, 160), status: assigned ? 'ASSIGNED' : 'NEW' };
    const internalLines = lines.map(line => ({ ...line }));
    const request = {
      id: requestRef.id, requestCode, quoteType, branchId, branchName: text(branch.name, 160), customerName: name,
      customerPhone: text(input.customerPhone, 30), phoneNormalized, contactChannel, contactConsent: true, marketingConsent: input.marketingConsent === true,
      note: text(input.note, 1_500), repairModel: repairModel || null, lines: internalLines, estimatedTotal,
      pricePolicyIds: [...new Set(lines.map(line => line.pricePolicyId).filter(Boolean))], pricePolicyVersions: [...new Set(lines.map(line => line.pricePolicyVersion).filter(Boolean))],
      status: assigned ? 'ASSIGNED' : 'NEW', leadId: leadRef.id, assignedStaffId: assignee?.id || '', assignedStaffName: assignee?.name || '',
      operationKey, payloadHash: requestPayloadHash, source: 'PHONEHOUSE_CARE_QUICK_QUOTE',
      utm: normalizedUtm,
      expiresAt, responseDueAt: dueAt, responseSlaMinutes, createdAt: nowIso, updatedAt: nowIso
    };
    const summary = lines.map(line => `${line.name} x${line.quantity}`).join(', ').slice(0, 1_000);
    const lead = {
      id: leadRef.id, customerId, branchId, name, phone: text(input.customerPhone, 30), phoneNormalized,
      zalo: contactChannel === 'ZALO' ? text(input.customerPhone, 30) : undefined, source: 'PhoneHouse Care · Báo giá nhanh',
      interestedModel: lines[0]?.model || lines[0]?.name || '', budget: estimatedTotal, status: 'new', careStatus: 'CARE_1_PENDING',
      careAttempts: 0, meaningfulCareCount: 0, careQualityScore: 0, assignedStaffId: assignee?.id || '', assignedStaff: assignee?.name || '',
      salesOwnerId: assignee?.id || '', salesOwnerName: assignee?.name || '', assignmentMode: assigned ? 'AUTO_SHIFT_LOAD' : 'UNASSIGNED',
      assignmentVersion: 1, currentTaskId: taskRef.id, firstResponseDueAt: dueAt, followUpDate: dueAt, nextActionAt: dueAt,
      nextAction: { type: 'SEND_QUOTE', dueAt, assignedTo: assignee?.name || 'Hàng chờ chi nhánh' }, nextActionNotes: `Xác nhận yêu cầu ${requestCode}`,
      notes: `${summary}${input.note ? ` · ${text(input.note, 1_000)}` : ''}`, quoteRequestId: requestRef.id, openTaskCount: 1, overdueTaskCount: 0,
      searchPrefixes: buildCrmSearchPrefixes(name, phoneNormalized, summary), createdAt: nowIso, updatedAt: nowIso
    };
    transaction.create(requestRef, { ...request, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.create(leadRef, { ...lead, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.create(taskRef, {
      id: taskRef.id, leadId: leadRef.id, customerId, type: 'QUICK_QUOTE_RESPONSE', scope: 'PRE_SALE', priority: 'P0', dueAt,
      assignedStaffId: assignee?.id || '', assignedStaffName: assignee?.name || 'Hàng chờ chi nhánh', branchId,
      title: `Phản hồi báo giá ${requestCode}: ${name}`, description: summary, sourceEntityType: 'CUSTOMER_QUOTE_REQUEST', sourceEntityId: requestRef.id,
      quoteRequestId: requestRef.id, status: 'PENDING', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    transaction.set(phoneRef, { phoneNormalized, customerId, lastLeadId: leadRef.id, updatedAt: FieldValue.serverTimestamp(), createdAt: phoneSnapshot.data()?.createdAt || FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(customerRef, { id: customerId, name, phone: text(input.customerPhone, 30), phoneNormalized, branchId, latestLeadId: leadRef.id, opportunityCount: FieldValue.increment(1), marketingConsent: input.marketingConsent === true, createdAt: customerSnapshot.data()?.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(db.collection('customerActivities').doc(`CUST_ACT_QREQ_${requestRef.id}`), { id: `CUST_ACT_QREQ_${requestRef.id}`, customerId, leadId: leadRef.id, type: 'QUICK_QUOTE_REQUESTED', entityId: requestRef.id, staffId: assignee?.id || '', staffName: assignee?.name || 'Hàng chờ chi nhánh', branchId, summary: `Khách gửi ${requestCode}: ${estimatedTotal.toLocaleString('vi-VN')}đ`, createdAt: FieldValue.serverTimestamp() });
    transaction.set(db.collection('leadAssignmentHistory').doc(`ASSIGN_${leadRef.id}_1`), { id: `ASSIGN_${leadRef.id}_1`, leadId: leadRef.id, fromStaffId: '', fromStaffName: 'Hàng chờ', toStaffId: assignee?.id || '', toStaffName: assignee?.name || 'Chưa phân công', changedBy: 'PHONEHOUSE_CARE', changedByName: 'PhoneHouse Care', branchId, reason: assigned ? 'AUTO_ASSIGN' : 'UNASSIGNED_QUEUE', notes: assigned ? '' : 'Không có Sale phù hợp trong ca', changedAt: FieldValue.serverTimestamp() });
    if (!assignee && shouldNotifyUnassigned) {
      transaction.set(
        db.collection('telegramOutboxEvents').doc(quickQuoteUnassignedOutboxId(requestRef.id)),
        createQuickQuoteUnassignedTelegramOutboxRecord({
          requestId: requestRef.id, requestCode, branchId, branchName: text(branch.name, 160),
          quoteType, customerName: name, estimatedTotal, responseDueAt: dueAt
        }),
        { merge: false }
      );
    }
    if (assignee) {
      transaction.set(counterRef, { rotation: rotation + 1, lastAssignedStaffId: assignee.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(db.collection('users').doc(assignee.id), { lastCrmAssignedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    transaction.set(phoneBucketRef, { count: phoneCount + 1, bucketExpiresAt: new Date(Math.ceil((now.getTime() + 1) / 3_600_000) * 3_600_000).toISOString(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(dedupeRef, { requestId: requestRef.id, result: publicResult, expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(), createdAt: FieldValue.serverTimestamp() });
    transaction.create(operationRef, { operationKey, payloadHash: requestPayloadHash, requestId: requestRef.id, result: publicResult, createdAt: FieldValue.serverTimestamp() });
    return publicResult;
  });
  if (shouldNotifyUnassigned && result.status === 'NEW' && !result.idempotentReplay && !result.duplicateReplay) {
    await dispatchTelegramOutboxEvent(db, quickQuoteUnassignedOutboxId(requestRef.id)).catch(error => {
      console.warn('[Quick quote Telegram alert]', error instanceof Error ? error.message : String(error));
    });
  }
  return result;
}

function assertStaffRequestAccess(actor: QuickQuoteStaffActor, request: any) {
  if (!actorCanAccessBranch(actor, text(request.branchId, 120))) throw new QuickQuoteError('QUICK_QUOTE_BRANCH_FORBIDDEN');
  if (!MANAGER_ROLES.has(actorRole(actor)) && request.assignedStaffId && request.assignedStaffId !== actor.uid) throw new QuickQuoteError('QUICK_QUOTE_OWNERSHIP_FORBIDDEN');
}

export async function listStaffQuickQuoteRequests(db: Firestore, actor: QuickQuoteStaffActor, input: any) {
  const branchId = text(input.branchId || actor.branchId, 120);
  if (!branchId || !actorCanAccessBranch(actor, branchId)) throw new QuickQuoteError('QUICK_QUOTE_BRANCH_FORBIDDEN');
  const snapshot = await db.collection('customerQuoteRequests').where('branchId', '==', branchId).limit(500).get();
  const status = text(input.status, 30).toUpperCase();
  const quoteType = text(input.quoteType, 30).toUpperCase();
  return snapshot.docs.map(document => serialize({ id: document.id, ...document.data() }))
    .filter((item: any) => !status || item.status === status)
    .filter((item: any) => !quoteType || item.quoteType === quoteType)
    .filter((item: any) => MANAGER_ROLES.has(actorRole(actor)) || !item.assignedStaffId || item.assignedStaffId === actor.uid)
    .sort((left: any, right: any) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
}

export async function updateStaffQuickQuoteRequest(db: Firestore, actor: QuickQuoteStaffActor, requestId: string, input: any) {
  const nextStatus = text(input.status, 30).toUpperCase() as QuickQuoteStatus;
  if (!STAFF_STATUSES.has(nextStatus)) throw new QuickQuoteError('QUICK_QUOTE_STATUS_INVALID');
  const reference = db.collection('customerQuoteRequests').doc(requestId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new QuickQuoteError('QUICK_QUOTE_REQUEST_NOT_FOUND');
    const request = snapshot.data()!;
    assertStaffRequestAccess(actor, request);
    if (['QUOTED', 'CONVERTED', 'CLOSED', 'SPAM'].includes(text(request.status, 30).toUpperCase())) throw new QuickQuoteError('QUICK_QUOTE_REQUEST_TERMINAL');
    const claim = !request.assignedStaffId && nextStatus !== 'SPAM';
    const patch: any = { status: nextStatus, staffNote: text(input.note, 1_500), updatedByUid: actor.uid, updatedByName: actor.name || actor.uid, updatedAt: FieldValue.serverTimestamp() };
    if (claim) Object.assign(patch, { assignedStaffId: actor.uid, assignedStaffName: actor.name || actor.uid, assignedAt: FieldValue.serverTimestamp() });
    if (nextStatus === 'CONTACTED') patch.contactedAt = FieldValue.serverTimestamp();
    if (nextStatus === 'CLOSED') patch.closedAt = FieldValue.serverTimestamp();
    if (nextStatus === 'SPAM') patch.spamAt = FieldValue.serverTimestamp();
    transaction.update(reference, patch);
    if (request.leadId) {
      const leadPatch: any = { updatedAt: FieldValue.serverTimestamp() };
      if (claim) Object.assign(leadPatch, { assignedStaffId: actor.uid, assignedStaff: actor.name || actor.uid, salesOwnerId: actor.uid, salesOwnerName: actor.name || actor.uid, assignmentMode: 'CLAIMED_FROM_QUEUE' });
      if (['CLOSED', 'SPAM'].includes(nextStatus)) Object.assign(leadPatch, { status: 'lost', openTaskCount: 0 });
      transaction.set(db.collection('leads').doc(request.leadId), leadPatch, { merge: true });
    }
    const taskId = request.leadId ? `TASK_${request.leadId}_QUICK_QUOTE` : '';
    if (taskId) transaction.set(db.collection('crmTasks').doc(taskId), { ...(claim ? { assignedStaffId: actor.uid, assignedStaffName: actor.name || actor.uid } : {}), ...(['CLOSED', 'SPAM'].includes(nextStatus) ? { status: 'CANCELLED', completedAt: FieldValue.serverTimestamp() } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { id: snapshot.id, ...serialize(request), ...serialize(patch) };
  });
}

async function revalidateStoredLines(db: Firestore, request: any) {
  const selections = (Array.isArray(request.lines) ? request.lines : []).map((line: any) => ({
    selectionToken: createQuickQuoteSelectionToken({ kind: line.sourceType, sourceId: line.sourceId, branchId: line.sourceType === 'REPAIR' ? undefined : request.branchId, displayedPrice: safePositiveInt(line.unitPrice), policyVersion: line.pricePolicyVersion || null }),
    quantity: line.quantity
  }));
  try {
    return await resolveRequestSelections(db, request.quoteType, request.branchId, selections, undefined, text(request.repairModel || request.lines?.[0]?.model, 160));
  } catch (error) {
    if (error instanceof QuickQuoteError && error.code === 'QUICK_QUOTE_PRICE_CHANGED') {
      const details = error.details as any;
      const refreshedSelections = (details?.items || []).map((line: any) => ({
        selectionToken: line.selectionToken,
        quantity: line.quantity
      }));
      return resolveRequestSelections(
        db,
        request.quoteType,
        request.branchId,
        refreshedSelections,
        undefined,
        text(request.repairModel || request.lines?.[0]?.model, 160)
      );
    }
    throw error;
  }
}

export async function confirmStaffQuickQuote(db: Firestore, actor: QuickQuoteStaffActor, requestId: string, input: any = {}) {
  const reference = db.collection('customerQuoteRequests').doc(requestId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new QuickQuoteError('QUICK_QUOTE_REQUEST_NOT_FOUND');
  const request = { id: snapshot.id, ...snapshot.data() } as any;
  assertStaffRequestAccess(actor, request);
  if (request.officialQuoteId) {
    const quote = await db.collection('leadQuotes').doc(request.officialQuoteId).get();
    return { request: serialize(request), quote: quote.exists ? serialize({ id: quote.id, ...quote.data() }) : null, idempotentReplay: true };
  }
  if (['CLOSED', 'SPAM', 'CONVERTED'].includes(text(request.status, 30).toUpperCase())) throw new QuickQuoteError('QUICK_QUOTE_REQUEST_TERMINAL');
  const lines = await revalidateStoredLines(db, request);
  if (lines.some((line: any) => line.inspectionRequired === true && safePositiveInt(line.unitPrice) === 0)) {
    throw new QuickQuoteError('QUICK_QUOTE_INSPECTION_REQUIRED');
  }
  const finalPrice = lines.reduce((sum: number, line: any) => sum + safePositiveInt(line.lineTotal), 0);
  const now = new Date();
  const validUntil = new Date(now.getTime() + Math.max(1, Math.min(168, safePositiveInt(input.validityHours, 24))) * 3_600_000).toISOString();
  const quoteRef = db.collection('leadQuotes').doc(`LQ_${requestId}`);
  return db.runTransaction(async transaction => {
    const [freshRequest, existingQuote] = await Promise.all([transaction.get(reference), transaction.get(quoteRef)]);
    if (!freshRequest.exists) throw new QuickQuoteError('QUICK_QUOTE_REQUEST_NOT_FOUND');
    if (existingQuote.exists) return { request: serialize({ id: freshRequest.id, ...freshRequest.data() }), quote: serialize({ id: existingQuote.id, ...existingQuote.data() }), idempotentReplay: true };
    const current = freshRequest.data()!;
    assertStaffRequestAccess(actor, current);
    const quoteCode = `QT-${getVietnamDateString(now).slice(2).replace(/-/g, '')}-${quoteRef.id.slice(-5).toUpperCase()}`;
    const quote = {
      id: quoteRef.id, quoteCode, leadId: current.leadId, customerId: `CUST_${current.phoneNormalized}`, customerName: current.customerName,
      customerPhone: current.customerPhone, staffId: actor.uid, staffName: actor.name || actor.uid, branchId: current.branchId,
      quoteType: current.quoteType, lines, sourceRequestId: reference.id, model: lines[0]?.model || lines[0]?.name || current.quoteType,
      unitPrice: finalPrice, accessoriesPrice: 0,
      finalPrice, validUntil, status: 'SENT', notes: text(input.note || current.staffNote, 1_500), createdAt: now.toISOString()
    };
    transaction.create(quoteRef, { ...quote, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(reference, { status: 'QUOTED', officialQuoteId: quoteRef.id, officialQuoteCode: quoteCode, assignedStaffId: current.assignedStaffId || actor.uid, assignedStaffName: current.assignedStaffName || actor.name || actor.uid, lines, estimatedTotal: finalPrice, quotedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (current.leadId) {
      transaction.set(db.collection('leads').doc(current.leadId), { status: 'negotiating', openTaskCount: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(db.collection('crmTasks').doc(`TASK_${current.leadId}_QUICK_QUOTE`), { status: 'COMPLETED', completedAt: FieldValue.serverTimestamp(), completedByUid: actor.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.create(db.collection('crmTasks').doc(`TASK_${quoteRef.id}_EXPIRY`), { id: `TASK_${quoteRef.id}_EXPIRY`, leadId: current.leadId, customerId: `CUST_${current.phoneNormalized}`, type: 'QUOTE_EXPIRY', scope: 'PRE_SALE', priority: 'P2', dueAt: validUntil, assignedStaffId: current.assignedStaffId || actor.uid, assignedStaffName: current.assignedStaffName || actor.name || actor.uid, branchId: current.branchId, title: `Theo dõi báo giá ${quoteCode}`, sourceEntityType: 'QUOTE', sourceEntityId: quoteRef.id, status: 'PENDING', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    return { request: serialize({ id: reference.id, ...current, status: 'QUOTED', officialQuoteId: quoteRef.id, estimatedTotal: finalPrice }), quote: serialize(quote) };
  });
}

export async function getStaffQuickQuoteSettings(db: Firestore, actor: QuickQuoteStaffActor) {
  if (!MANAGER_ROLES.has(actorRole(actor))) throw new QuickQuoteError('QUICK_QUOTE_SETTINGS_FORBIDDEN');
  return loadQuickQuoteSettings(db);
}

export async function saveStaffQuickQuoteSettings(db: Firestore, actor: QuickQuoteStaffActor, input: any) {
  if (!MANAGER_ROLES.has(actorRole(actor))) throw new QuickQuoteError('QUICK_QUOTE_SETTINGS_FORBIDDEN');
  const fallbackBranchId = text(input.fallbackBranchId, 120);
  if (fallbackBranchId) {
    if (!actorCanAccessBranch(actor, fallbackBranchId)) throw new QuickQuoteError('QUICK_QUOTE_BRANCH_FORBIDDEN');
    await activeBranch(db, fallbackBranchId);
  }
  const record = {
    enabled: input.enabled !== false,
    validityHours: Math.max(1, Math.min(168, safePositiveInt(input.validityHours, 24))),
    responseSlaMinutes: Math.max(1, Math.min(1_440, safePositiveInt(input.responseSlaMinutes, 15))),
    disclaimer: text(input.disclaimer || DEFAULT_SETTINGS.disclaimer, 1_500),
    maxRepairLines: Math.max(1, Math.min(10, safePositiveInt(input.maxRepairLines, 10))),
    maxAccessoryLines: Math.max(1, Math.min(20, safePositiveInt(input.maxAccessoryLines, 20))),
    fallbackBranchId,
    updatedByUid: actor.uid,
    updatedByName: actor.name || actor.uid,
    updatedAt: FieldValue.serverTimestamp()
  };
  await db.collection('customerPortalConfigs').doc('quickQuote').set(record, { merge: true });
  return serialize(record);
}

export async function listStaffQuickQuoteCatalog(db: Firestore, actor: QuickQuoteStaffActor, input: any) {
  const kind = text(input.kind, 30).toUpperCase() as QuickQuoteType;
  if (!QUOTE_TYPES.has(kind)) throw new QuickQuoteError('QUICK_QUOTE_TYPE_INVALID');
  const branchId = text(input.branchId || actor.branchId, 120);
  if (kind !== 'REPAIR' && (!branchId || !actorCanAccessBranch(actor, branchId))) throw new QuickQuoteError('QUICK_QUOTE_BRANCH_FORBIDDEN');
  if (kind === 'DEVICE') {
    const [snapshot, configs, policy] = await Promise.all([
      db.collection('devices').where('status', '==', 'in_stock').limit(1_500).get(),
      loadDeviceVariantConfigs(db),
      currentPricing(db)
    ]);
    const stock = snapshot.docs.map(document => ({ id: document.id, ...document.data() } as any)).filter(item => item.branchId === branchId);
    return [...groupDeviceVariants(stock).entries()].map(([variantId, items]) => {
      const config = configs.get(variantId);
      const choice = chooseVariantPrice(policy, variantId, items);
      const presentation = variantPresentation(config, branchId, items);
      const colors = [...new Set(items.map(item => text(item.color, 100)).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'vi'));
      return {
        id: variantId, kind, variantKey: deviceVariantKey(items[0]),
        name: deviceVariantName(items[0]),
        detail: `${colors.join(', ') || 'Chưa có màu'} · ${text(items[0].condition, 120)} · ${items.length} máy trong kho`,
        price: choice?.pricing.price || 0,
        stockCount: items.length,
        colors,
        configured: Boolean(config),
        publicVisible: branchVariantIsPublic(config, branchId, items),
        publicName: presentation.name,
        publicDescription: presentation.description,
        imageUrl: presentation.imageUrl,
        publicSortOrder: presentation.publicSortOrder
      };
    }).sort((left, right) => left.publicSortOrder - right.publicSortOrder || left.name.localeCompare(right.name, 'vi'));
  }
  if (kind === 'ACCESSORY') {
    const balances = await db.collection('inventoryBalances').where('branchId', '==', branchId).limit(1_000).get();
    const ids = [...new Set(balances.docs.filter(document => Number(document.data().available ?? document.data().onHand ?? 0) > 0).map(document => text(document.data().productId, 160)).filter(Boolean))];
    const products = await productMap(db, ids);
    return [...products.values()].map(item => {
      const presentation = accessoryPublicPresentation(item, branchId);
      return { id: item.id, kind, name: text(item.name, 200), detail: `${item.brand || ''} · ${item.category || ''}`, price: safePositiveInt(item.retailPrice ?? item.sellPrice), publicVisible: item.publicVisible === true && Array.isArray(item.publicBranchIds) && item.publicBranchIds.includes(branchId), publicName: presentation.name, publicDescription: presentation.description, imageUrl: presentation.imageUrl, publicSortOrder: presentation.publicSortOrder };
    });
  }
  const snapshot = await db.collection('repairServices').limit(500).get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() } as any)).filter(item => item.isArchived !== true).map(item => ({ id: item.id, kind, name: text(item.name, 200), detail: text(item.compatibleModels, 300), price: safePositiveInt(item.sellPrice), publicVisible: item.publicVisible === true, publicName: text(item.publicName, 200), publicDescription: text(item.publicDescription, 600), imageUrl: text(item.imageUrl, 1_000), quoteMode: text(item.quoteMode, 40) || 'FIXED' }));
}

export async function updateStaffQuickQuoteCatalogItem(db: Firestore, actor: QuickQuoteStaffActor, kindInput: unknown, sourceId: string, input: any) {
  if (!MANAGER_ROLES.has(actorRole(actor))) throw new QuickQuoteError('QUICK_QUOTE_SETTINGS_FORBIDDEN');
  const kind = text(kindInput, 30).toUpperCase() as QuickQuoteType;
  const collection = kind === 'ACCESSORY' ? 'products' : kind === 'REPAIR' ? 'repairServices' : '';
  if (kind === 'DEVICE') {
    const targetBranchId = text(input.branchId || actor.branchId, 120);
    if (!sourceId.startsWith('QDV_') || !targetBranchId || !actorCanAccessBranch(actor, targetBranchId)) throw new QuickQuoteError('QUICK_QUOTE_BRANCH_FORBIDDEN');
    const [stockSnapshot, currentSnapshot] = await Promise.all([
      db.collection('devices').where('status', '==', 'in_stock').limit(1_500).get(),
      db.collection('quickQuoteDeviceVariants').doc(sourceId).get()
    ]);
    const allVariantItems = stockSnapshot.docs
      .map(document => ({ id: document.id, ...document.data() } as any))
      .filter(item => deviceVariantId(item) === sourceId);
    const branchItems = allVariantItems.filter(item => item.branchId === targetBranchId);
    if (!branchItems.length) throw new QuickQuoteError('QUICK_QUOTE_OFFER_NOT_FOUND');
    const current = currentSnapshot.exists ? currentSnapshot.data()! : {};
    const legacyPublicBranches = [...new Set(allVariantItems.filter(item => item.publicVisible === true).map(item => text(item.branchId, 120)).filter(Boolean))];
    const publicBranchIds = new Set<string>(Array.isArray(current.publicBranchIds) ? current.publicBranchIds : legacyPublicBranches);
    if (input.publicVisible === true) publicBranchIds.add(targetBranchId);
    else publicBranchIds.delete(targetBranchId);
    const currentPresentation = current.publicPresentationByBranch?.[targetBranchId] || {};
    const patch = {
      id: sourceId,
      variantKey: deviceVariantKey(branchItems[0]),
      model: text(canonicalDeviceModelName(branchItems[0]), 160),
      storage: text(branchItems[0].storage, 80),
      condition: text(branchItems[0].condition, 120),
      publicBranchIds: [...publicBranchIds],
      publicPresentationByBranch: {
        ...(current.publicPresentationByBranch || {}),
        [targetBranchId]: {
          publicName: text(input.publicName || currentPresentation.publicName || current.publicName || deviceVariantName(branchItems[0]), 200),
          publicDescription: text(input.publicDescription ?? currentPresentation.publicDescription ?? current.publicDescription, 600),
          imageUrl: text(input.imageUrl ?? currentPresentation.imageUrl ?? current.imageUrl ?? branchItems[0].imageUrl ?? branchItems[0].images?.[0], 1_000),
          publicSortOrder: Math.min(10_000, safePositiveInt(input.publicSortOrder ?? currentPresentation.publicSortOrder ?? current.publicSortOrder, 0))
        }
      },
      updatedByUid: actor.uid,
      updatedAt: FieldValue.serverTimestamp()
    };
    await db.collection('quickQuoteDeviceVariants').doc(sourceId).set(patch, { merge: true });
    return {
      id: sourceId,
      kind,
      variantKey: patch.variantKey,
      publicVisible: publicBranchIds.has(targetBranchId),
      publicName: patch.publicPresentationByBranch[targetBranchId].publicName,
      publicDescription: patch.publicPresentationByBranch[targetBranchId].publicDescription,
      imageUrl: patch.publicPresentationByBranch[targetBranchId].imageUrl,
      publicSortOrder: patch.publicPresentationByBranch[targetBranchId].publicSortOrder
    };
  }
  if (!collection || !sourceId) throw new QuickQuoteError('QUICK_QUOTE_TYPE_INVALID');
  const reference = db.collection(collection).doc(sourceId);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new QuickQuoteError('QUICK_QUOTE_OFFER_NOT_FOUND');
  const record = snapshot.data()!;
  if (kind === 'REPAIR' && actorRole(actor) === 'STORE_MANAGER') throw new QuickQuoteError('QUICK_QUOTE_GLOBAL_CATALOG_FORBIDDEN');
  const targetBranchId = text(record.branchId || input.branchId || actor.branchId, 120);
  if (kind !== 'REPAIR' && (!targetBranchId || !actorCanAccessBranch(actor, targetBranchId))) throw new QuickQuoteError('QUICK_QUOTE_BRANCH_FORBIDDEN');
  const patch: any = {
    publicVisible: kind === 'ACCESSORY' ? (input.publicVisible === true || record.publicVisible === true) : input.publicVisible === true,
    updatedByUid: actor.uid,
    updatedAt: FieldValue.serverTimestamp()
  };
  if (kind === 'ACCESSORY') {
    patch.publicBranchIds = input.publicVisible === true ? FieldValue.arrayUnion(targetBranchId) : FieldValue.arrayRemove(targetBranchId);
    patch.publicPresentationByBranch = {
      [targetBranchId]: {
        publicName: text(input.publicName || record.publicPresentationByBranch?.[targetBranchId]?.publicName || record.publicName || record.name, 200),
        publicDescription: text(input.publicDescription ?? record.publicPresentationByBranch?.[targetBranchId]?.publicDescription ?? record.publicDescription, 600),
        imageUrl: text(input.imageUrl ?? record.publicPresentationByBranch?.[targetBranchId]?.imageUrl ?? record.imageUrl, 1_000),
        publicSortOrder: Math.min(10_000, safePositiveInt(input.publicSortOrder ?? record.publicPresentationByBranch?.[targetBranchId]?.publicSortOrder ?? record.publicSortOrder, 0))
      }
    };
  } else {
    patch.publicName = text(input.publicName || record.publicName || record.name || `${record.model || ''} ${record.storage || ''}`, 200);
    patch.publicDescription = text(input.publicDescription ?? record.publicDescription, 600);
    patch.imageUrl = text(input.imageUrl ?? record.imageUrl, 1_000);
    patch.publicSortOrder = Math.min(10_000, safePositiveInt(input.publicSortOrder ?? record.publicSortOrder, 0));
  }
  if (kind === 'REPAIR') patch.quoteMode = input.quoteMode === 'INSPECTION_REQUIRED' ? 'INSPECTION_REQUIRED' : 'FIXED';
  await reference.set(patch, { merge: true });
  return { id: snapshot.id, kind, ...serialize(patch) };
}
