import crypto from 'node:crypto';
import { FieldPath, Firestore } from 'firebase-admin/firestore';
import type { StorefrontOrderInput, StorefrontOrderReceipt } from '../../shared/storefront';
import { normalizeCrmPhone } from './crmOperationsService';
import { isPublicStorefrontBranch, isPublicStorefrontMaster, loadStorefrontSnapshot, projectStorefront } from './storefrontService';
import { normalizeOperationalPolicyVersions, selectEffectiveOperationalPolicy } from './operationalPolicyService';

const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
const digest = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validId = (value: string) => /^[^/\r\n]{1,160}$/.test(value);
export function normalizeStorefrontOrder(input: any): StorefrontOrderInput {
  let phone: string;
  try { phone = normalizeCrmPhone(input?.customerPhone); }
  catch { throw new Error('STOREFRONT_ORDER_INVALID'); }
  const value: StorefrontOrderInput = {
    idempotencyKey: clean(input?.idempotencyKey, 160), branchId: clean(input?.branchId, 160),
    customerName: clean(input?.customerName, 120), customerPhone: phone,
    fulfillment: input?.fulfillment === 'DELIVERY' ? 'DELIVERY' : 'PICKUP', address: clean(input?.address, 500),
    note: clean(input?.note, 1000), contactConsent: input?.contactConsent === true, website: clean(input?.website, 100),
    lines: Array.isArray(input?.lines) ? input.lines.map((line: any) => ({ productId: clean(line?.productId, 160), quantity: Number(line?.quantity), expectedPrice: line?.expectedPrice === null ? null : Number(line?.expectedPrice) })) : []
  };
  if (value.website || value.customerName.length < 2 || !/^0\d{9}$/.test(value.customerPhone) || !validId(value.branchId)
    || !/^[a-zA-Z0-9_-]{16,160}$/.test(value.idempotencyKey) || !value.contactConsent
    || (value.fulfillment === 'DELIVERY' && value.address.length < 12)
    || !value.lines.length || value.lines.length > 20 || new Set(value.lines.map(line => line.productId)).size !== value.lines.length
    || value.lines.some(line => !validId(line.productId) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 10 || (line.expectedPrice !== null && (!Number.isSafeInteger(line.expectedPrice) || line.expectedPrice < 1)))) {
    throw new Error('STOREFRONT_ORDER_INVALID');
  }
  value.lines.sort((a, b) => a.productId.localeCompare(b.productId));
  return value;
}

/** This is a purchase REQUEST, never a sale, payment, stock hold or promise of fulfillment. */
export async function createStorefrontOrder(db: Firestore, raw: any): Promise<StorefrontOrderReceipt> {
  const input = normalizeStorefrontOrder(raw);
  const payloadHash = digest(input);
  const ref = db.collection('storefrontOrders').doc(digest(input.idempotencyKey));
  const existing = await ref.get();
  if (existing.exists) {
    if (existing.data()?.payloadHash !== payloadHash) throw new Error('STOREFRONT_IDEMPOTENCY_CONFLICT');
    return existing.data()!.receipt;
  }
  const snapshot = await loadStorefrontSnapshot(db, true);
  const phoneBucket = db.collection('storefrontOrderRateLimits').doc(digest([input.customerPhone, Math.floor(Date.now() / 3_600_000)]));
  return db.runTransaction(async tx => {
    const [prior, rate, branch, pricing, ...masters] = await Promise.all([
      tx.get(ref), tx.get(phoneBucket), tx.get(db.collection('branches').doc(input.branchId)),
      tx.get(db.collection('operationalConfigs').doc('retailPricing')),
      ...input.lines.map(line => tx.get(db.collection('catalogItems').doc(line.productId)))
    ]);
    if (prior.exists) {
      if (prior.data()?.payloadHash !== payloadHash) throw new Error('STOREFRONT_IDEMPOTENCY_CONFLICT');
      return prior.data()!.receipt as StorefrontOrderReceipt;
    }
    if (Number(rate.data()?.count || 0) >= 5) throw new Error('STOREFRONT_ORDER_RATE_LIMITED');
    if (!branch.exists || !isPublicStorefrontBranch({ ...branch.data(), id: branch.id })) throw new Error('STOREFRONT_BRANCH_INVALID');
    // Keep the full catalogue when resolving legacy inventory. A cart subset must
    // not turn an ambiguous SKU/configuration into a seemingly unique stock link.
    const refreshedIds = new Set(masters.map(master => master.id));
    const catalog = [...snapshot.catalog.filter(master => !refreshedIds.has(master.id)), ...masters.map(master => ({ ...master.data(), id: master.id }))].filter(isPublicStorefrontMaster);
    const products = projectStorefront({ ...snapshot, catalog, policy: selectEffectiveOperationalPolicy(normalizeOperationalPolicyVersions('retailPricing', pricing.data())) }, input.branchId);
    const lines = input.lines.map(line => {
      const product = products.find(item => item.id === line.productId);
      if (!product) throw new Error('STOREFRONT_PRODUCT_NOT_FOUND');
      if (product.price !== line.expectedPrice) throw new Error('STOREFRONT_PRICE_CHANGED');
      return { productId: product.id, sku: product.sku, name: product.name, quantity: line.quantity, unitPrice: product.price, inStockAtRequest: product.inStock };
    });
    const receipt: StorefrontOrderReceipt = {
      code: `WEB-${crypto.randomBytes(6).toString('hex').toUpperCase()}`, status: 'NEW',
      estimatedTotal: lines.reduce((sum, line) => sum + (line.unitPrice || 0) * line.quantity, 0),
      hasUnpricedItems: lines.some(line => line.unitPrice === null)
    };
    const now = new Date().toISOString();
    tx.set(ref, {
      id: ref.id, ...receipt, receipt, payloadHash, branchId: input.branchId, branchName: clean(branch.data()?.name, 160),
      customerName: input.customerName, customerPhone: input.customerPhone, fulfillment: input.fulfillment,
      address: input.fulfillment === 'DELIVERY' ? input.address : '', note: input.note, lines,
      source: 'STOREFRONT', contactConsentAt: now, createdAt: now, updatedAt: now,
      paymentStatus: 'NOT_REQUESTED', shippingStatus: 'NOT_REQUESTED', stockReserved: false
    });
    tx.set(phoneBucket, { count: Number(rate.data()?.count || 0) + 1, expiresAt: new Date(Date.now() + 7_200_000) });
    return receipt;
  });
}

type Staff = { uid: string; role?: string; branchId?: string; assignedBranchIds?: string[] };
const globalStaff = (actor: Staff) => ['ADMIN', 'REGIONAL_MANAGER'].includes(String(actor.role).toUpperCase());
const allowedBranches = (actor: Staff) => [...new Set([actor.branchId, ...(actor.assignedBranchIds || [])].filter(Boolean))];
export async function listStorefrontOrders(db: Firestore, actor: Staff, input: any) {
  let query: any = db.collection('storefrontOrders');
  if (!globalStaff(actor)) {
    const branches = allowedBranches(actor);
    if (!branches.length) return { items: [], nextCursor: null };
    if (branches.length > 30) throw new Error('STOREFRONT_SCOPE_INVALID');
    query = query.where('branchId', 'in', branches);
  }
  // Document-id paging avoids a new composite index and never silently drops older requests.
  query = query.orderBy(FieldPath.documentId());
  if (input.cursor) {
    if (!/^[a-f0-9]{64}$/.test(input.cursor)) throw new Error('STOREFRONT_CURSOR_INVALID');
    query = query.startAfter(input.cursor);
  }
  const result = await query.limit(101).get();
  return { items: result.docs.slice(0, 100).map((doc: any) => {
    const { payloadHash: _hash, receipt: _receipt, ...data } = doc.data();
    return { ...data, id: doc.id };
  }), nextCursor: result.docs.length > 100 ? result.docs[99].id : null };
}
export async function updateStorefrontOrder(db: Firestore, actor: Staff, id: string, input: any) {
  if (!/^[a-f0-9]{64}$/.test(id) || !['CONTACTED', 'CLOSED', 'CANCELLED'].includes(input?.status)) throw new Error('STOREFRONT_ORDER_INVALID');
  return db.runTransaction(async tx => {
    const ref = db.collection('storefrontOrders').doc(id), document = await tx.get(ref);
    if (!document.exists) throw new Error('STOREFRONT_ORDER_NOT_FOUND');
    const row = document.data()!;
    if (!globalStaff(actor) && !allowedBranches(actor).includes(row.branchId)) throw new Error('STOREFRONT_FORBIDDEN');
    if (row.status !== input.expectedStatus || ['CLOSED', 'CANCELLED'].includes(row.status)) throw new Error('STOREFRONT_STATUS_CONFLICT');
    tx.update(ref, { status: input.status, updatedAt: new Date().toISOString(), updatedBy: actor.uid });
    return { id, status: input.status };
  });
}
