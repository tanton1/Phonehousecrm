import crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { AuthenticatedUser } from '../middleware/authenticateFirebase';
import { catalogPublicContentPatch, publicProductHighlights, publicProductImages, publicProductSpecifications } from '../../shared/catalogPublicContent';
import { WEBSITE_CONTENT_ISSUES, websiteContentDraft, websiteContentIssues, type WebsiteContentDetail, type WebsiteContentEditor, type WebsiteContentPage, type WebsiteContentTarget } from '../../shared/catalogWebsiteContent';
import { invalidateStorefrontSnapshot, isPublicStorefrontMaster, loadStorefrontSnapshot, projectStorefront, storefrontSearchKey } from './storefrontService';
import { resolveStorefrontModel } from './storefrontContentService';

type Row = Record<string, any> & { id: string };
const digest = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const modelActive = (row: Row) => row.active !== false && row.isActive !== false && row.isArchived !== true && !['inactive', 'INACTIVE'].includes(row.status) && !['ARCHIVED', 'INACTIVE'].includes(row.lifecycleStatus);
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 100) : [];

export function websiteContentReference(target: string, id: string) {
  if (!['items', 'models'].includes(target) || !id || id.length > 160 || id.includes('/') || id === '.' || id === '..') throw new Error('CATALOG_WEBSITE_TARGET_INVALID');
  return target === 'items' ? 'catalogItems' : 'catalogModels';
}
export function websiteContentRevision(row: Row) {
  return digest([row.imageUrl ?? '', row.imageUrls ?? [], row.publicDescription ?? '', row.publicHighlights ?? [], row.publicSpecifications ?? [], row.compatibleModelIds ?? [], row.compatibleModelCodes ?? [], row.compatibleModels ?? []]);
}
function editor(row: Row, target: WebsiteContentTarget, affectedProducts: number): WebsiteContentEditor {
  return {
    target, id: row.id, name: String(row.displayName || row.name || row.modelName || row.id),
    revision: websiteContentRevision(row), affectedProducts,
    content: websiteContentDraft({
      imageUrl: publicProductImages({ imageUrl: row.imageUrl })[0] || '',
      imageUrls: publicProductImages({ imageUrls: row.imageUrls }),
      publicDescription: typeof row.publicDescription === 'string' ? row.publicDescription.slice(0, 6000) : '',
      publicHighlights: publicProductHighlights(row.publicHighlights), publicSpecifications: publicProductSpecifications(row.publicSpecifications)
    }),
    compatibleModelIds: strings(row.compatibleModelIds), compatibleModels: strings(row.compatibleModels)
  };
}

/** Global catalogue content, authorized with the existing catalogue staff roles. */
export async function listWebsiteContent(db: Firestore, input: Record<string, unknown>): Promise<WebsiteContentPage> {
  const snapshot = await loadStorefrontSnapshot(db);
  const all = projectStorefront(snapshot);
  const search = storefrontSearchKey(input.search).slice(0, 150);
  const kind = typeof input.kind === 'string' ? input.kind : '';
  const issue = typeof input.issue === 'string' ? input.issue : '';
  if (kind && !['DEVICE', 'ACCESSORY', 'PART'].includes(kind) || issue && !Object.hasOwn(WEBSITE_CONTENT_ISSUES, issue)) throw new Error('CATALOG_WEBSITE_FILTER_INVALID');
  const counts = { IMAGE: 0, DESCRIPTION: 0, SPECIFICATIONS: 0, COMPATIBILITY: 0, PRICE: 0 };
  const rows = all.map(product => ({ product, issues: websiteContentIssues(product) })).filter(({ product }) =>
    (!kind || kind === product.kind) && search.split(' ').filter(Boolean).every(term => storefrontSearchKey([product.name, product.sku, product.model, product.brand].join(' ')).includes(term)));
  rows.forEach(row => row.issues.forEach(value => counts[value]++));
  const filtered = rows.filter(row => !issue || row.issues.some(value => value === issue)).sort((a, b) => a.product.id.localeCompare(b.product.id));
  // Bind pagination to content and filters, not offsets: edits cannot silently skip rows.
  const version = digest([search, kind, issue, filtered.map(row => [row.product.id, row.issues])]);
  let start = 0;
  if (input.cursor) {
    try {
      const cursor = JSON.parse(Buffer.from(String(input.cursor), 'base64url').toString());
      if (cursor.version !== version || typeof cursor.id !== 'string') throw new Error();
      const index = filtered.findIndex(row => row.product.id === cursor.id);
      if (index < 0) throw new Error();
      start = index + 1;
    } catch { throw new Error('CATALOG_WEBSITE_CURSOR_INVALID'); }
  }
  const items = filtered.slice(start, start + 40);
  return { items, total: filtered.length, catalogTotal: all.length, counts, generatedAt: snapshot.generatedAt,
    nextCursor: start + items.length < filtered.length ? Buffer.from(JSON.stringify({ version, id: items.at(-1)!.product.id })).toString('base64url') : null };
}

export async function getWebsiteContentDetail(db: Firestore, id: string): Promise<WebsiteContentDetail> {
  websiteContentReference('items', id);
  const snapshot = await loadStorefrontSnapshot(db, true);
  const master = snapshot.catalog.find(row => row.id === id);
  if (!master) throw new Error('CATALOG_ITEM_NOT_FOUND');
  const model = master.category === 'DEVICE' ? resolveStorefrontModel(master, snapshot.models) : undefined;
  return {
    product: projectStorefront(snapshot).find(row => row.id === id)!, item: editor(master, 'items', 1),
    model: model ? editor(model, 'models', snapshot.catalog.filter(row => row.category === 'DEVICE' && resolveStorefrontModel(row, snapshot.models)?.id === model.id).length) : null,
    models: snapshot.models.filter(modelActive).map(row => ({ id: row.id, name: String(row.modelName || row.id) })).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  };
}

/** Content-only transaction: cannot change stock, prices, identities or private fields. */
export async function updateWebsiteContent(db: Firestore, target: string, id: string, input: any, actor: AuthenticatedUser) {
  if (!['ADMIN', 'MANAGER', 'INVENTORY_MANAGER'].includes(actor.role)) throw new Error('CATALOG_WEBSITE_FORBIDDEN');
  const collection = websiteContentReference(target, id);
  if (input?.confirmed !== true || typeof input.expectedRevision !== 'string' || !input.content || typeof input.content !== 'object' || Array.isArray(input.content)) throw new Error('CATALOG_WEBSITE_CONFIRMATION_REQUIRED');
  const patch = catalogPublicContentPatch(input.content);
  if (!Object.keys(patch).length) throw new Error('CATALOG_WEBSITE_CONTENT_REQUIRED');
  const ids = input.compatibleModelIds;
  if (ids !== undefined && (target !== 'items' || !Array.isArray(ids) || ids.length > 100 || ids.some(value => typeof value !== 'string' || !value || value.length > 160 || value.includes('/')))) throw new Error('CATALOG_COMPATIBILITY_INVALID');
  const ref = db.collection(collection).doc(id);
  await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error('CATALOG_WEBSITE_NOT_FOUND');
    const row = { ...snap.data(), id } as Row;
    if (target === 'items' ? !isPublicStorefrontMaster(row) : !modelActive(row)) throw new Error('CATALOG_WEBSITE_INACTIVE');
    if (websiteContentRevision(row) !== input.expectedRevision) throw new Error('CATALOG_WEBSITE_CONTENT_CONFLICT');
    const compatibility: Record<string, string[]> = {};
    if (ids !== undefined) {
      if (!['ACCESSORY', 'PART'].includes(row.category)) throw new Error('CATALOG_COMPATIBILITY_INVALID');
      const unique = [...new Set<string>(ids)];
      const models = await Promise.all(unique.map(modelId => transaction.get(db.collection('catalogModels').doc(modelId))));
      if (models.some(model => !model.exists || !modelActive({ ...model.data(), id: model.id }))) throw new Error('CATALOG_COMPATIBILITY_INVALID');
      compatibility.compatibleModelIds = unique;
      compatibility.compatibleModelCodes = models.map(model => String(model.data()?.modelCode || '')).filter(Boolean);
      compatibility.compatibleModels = models.map(model => String(model.data()?.modelName || '')).filter(Boolean);
    }
    transaction.update(ref, { ...patch, ...compatibility, updatedAt: new Date().toISOString(), updatedByUid: actor.uid });
  });
  invalidateStorefrontSnapshot(db);
  return { id, target };
}
