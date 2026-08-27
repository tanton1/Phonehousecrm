import { Router, Request, Response } from 'express';
import { Firestore, FieldPath, FieldValue, Query } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import {
  ensureBranchPartner,
  newBranchPartyAccountRecord,
  newPartyMasterRecord,
  normalizePartyPhone,
  normalizePartyTaxCode,
  resolvePartyIdentity
} from '../services/branchPartyService';

const PARTNER_TYPES = new Set(['CUSTOMER', 'SUPPLIER', 'BOTH', 'STAFF']);
const CUSTOMER_TIERS = new Set(['STANDARD', 'SILVER', 'GOLD', 'DIAMOND', 'WHOLESALE']);
const SUPPLIER_CATEGORIES = new Set(['OFFICIAL_DISTRIBUTOR', 'LIKE_NEW_WHOLESALER', 'COMPONENTS', 'FINANCE_PARTNER']);
export const PARTNER_OPERATION_ROLES = [
  'ADMIN',
  'REGIONAL_MANAGER',
  'MANAGER',
  'STORE_MANAGER',
  'INVENTORY_MANAGER',
  'WAREHOUSE',
  'ACCOUNTANT',
  'CASHIER',
  'SALES',
  'CUSTOMER_CARE'
] as const;

function text(value: unknown, maxLength = 500): string {
  return String(value || '').trim().slice(0, maxLength);
}

function canAccessBranch(user: Request['user'], branchId: string): boolean {
  if (!user || !branchId || branchId === 'ALL') return false;
  return user.role === 'ADMIN' || user.branchId === branchId || (user.assignedBranchIds || []).includes(branchId);
}

function editablePartnerFields(input: any) {
  const type = text(input?.type, 30).toUpperCase();
  const name = text(input?.name, 200);
  const phone = text(input?.phone, 30);
  if (!PARTNER_TYPES.has(type) || !name || !phone) throw new Error('PARTNER_REQUIRED_FIELDS');
  const customerTier = text(input?.customerTier, 30).toUpperCase();
  const supplierCategory = text(input?.supplierCategory, 30).toUpperCase();
  const qualityRating = input?.qualityRating == null || input?.qualityRating === '' ? null : Number(input.qualityRating);
  const warrantyPolicyDays = input?.warrantyPolicyDays == null || input?.warrantyPolicyDays === '' ? null : Number(input.warrantyPolicyDays);
  const creditLimit = input?.creditLimit == null || input?.creditLimit === '' ? null : Number(input.creditLimit);
  if (customerTier && !CUSTOMER_TIERS.has(customerTier)) throw new Error('PARTNER_CUSTOMER_TIER_INVALID');
  if (supplierCategory && !SUPPLIER_CATEGORIES.has(supplierCategory)) throw new Error('PARTNER_SUPPLIER_CATEGORY_INVALID');
  if (qualityRating !== null && (!Number.isFinite(qualityRating) || qualityRating < 1 || qualityRating > 5)) throw new Error('PARTNER_QUALITY_RATING_INVALID');
  if (warrantyPolicyDays !== null && (!Number.isFinite(warrantyPolicyDays) || warrantyPolicyDays < 0 || warrantyPolicyDays > 3650)) throw new Error('PARTNER_WARRANTY_DAYS_INVALID');
  if (creditLimit !== null && (!Number.isFinite(creditLimit) || creditLimit < 0)) throw new Error('PARTNER_CREDIT_LIMIT_INVALID');
  return {
    type, name, phone,
    email: text(input?.email, 160),
    address: text(input?.address, 500),
    taxCode: text(input?.taxCode, 60),
    ...(customerTier ? { customerTier } : {}),
    ...(supplierCategory ? { supplierCategory } : {}),
    ...(qualityRating === null ? {} : { qualityRating }),
    ...(warrantyPolicyDays === null ? {} : { warrantyPolicyDays }),
    ...(creditLimit === null ? {} : { creditLimit }),
    favoriteModel: text(input?.favoriteModel, 160),
    notes: text(input?.notes, 2000),
    tags: Array.isArray(input?.tags) ? [...new Set(input.tags.map((item: unknown) => text(item, 60)).filter(Boolean))].slice(0, 30) : []
  };
}

export function createPartnersRouter(db: Firestore | null): Router {
  const router = Router();
  router.use(authenticateFirebase);

  router.get('/accounts', requireRole(...PARTNER_OPERATION_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const branchId = text(req.query.branchId, 100);
      const requestedType = text(req.query.type, 30).toUpperCase();
      if (!canAccessBranch(req.user, branchId)) throw new Error('PARTNER_BRANCH_FORBIDDEN');
      const snapshot = await db.collection('branchPartyAccounts').where('branchId', '==', branchId).limit(300).get();
      const accounts = snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id }))
        .filter((account: any) => account.status === 'ACTIVE')
        .filter((account: any) => !requestedType || account.type === requestedType || account.type === 'BOTH');
      return res.json({ success: true, accounts });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'PARTNER_ACCOUNT_LIST_FAILED' });
    }
  });

  /** Temporary migration bridge: only ADMIN can see unassigned legacy rows.
   * Posting still performs the authoritative history check before adoption. */
  router.get('/legacy-unassigned', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const requestedType = text(req.query.type, 30).toUpperCase();
      const limit = Math.min(200, Math.max(25, Number(req.query.limit) || 100));
      if (requestedType && !PARTNER_TYPES.has(requestedType)) throw new Error('PARTNER_TYPE_INVALID');
      const snapshots = requestedType
        ? await Promise.all([...new Set([requestedType, 'BOTH'])].map(type => (
          db.collection('partners').where('type', '==', type).limit(limit).get()
        )))
        : [await db.collection('partners').orderBy(FieldPath.documentId()).limit(limit).get()];
      const docs = [...new Map(snapshots.flatMap(snapshot => snapshot.docs).map(doc => [doc.id, doc])).values()];
      const partners = docs
        .map(doc => ({ ...doc.data(), id: doc.id } as any))
        .filter(partner => !String(partner.branchId || '').trim() || partner.branchId === 'ALL')
        .filter(partner => partner.isActive !== false && partner.isArchived !== true)
        .filter(partner => !requestedType || partner.type === requestedType || partner.type === 'BOTH');
      return res.json({
        success: true,
        partners,
        scanned: docs.length,
        partial: snapshots.some(snapshot => snapshot.size === limit)
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'PARTNER_LEGACY_LIST_FAILED' });
    }
  });

  router.get('/masters/search', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const taxCodeNormalized = normalizePartyTaxCode(req.query.taxCode);
      const phoneNormalized = normalizePartyPhone(req.query.phone);
      if (!taxCodeNormalized && !phoneNormalized) throw new Error('PARTY_SEARCH_IDENTITY_REQUIRED');
      const field = taxCodeNormalized ? 'taxCodeNormalized' : 'phoneNormalized';
      const value = taxCodeNormalized || phoneNormalized;
      const snapshot = await db.collection('partyMasters').where(field, '==', value).limit(10).get();
      return res.json({ success: true, masters: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'PARTY_MASTER_SEARCH_FAILED' });
    }
  });

  router.post('/accounts/backfill', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const branchId = text(req.body?.branchId, 100);
      const afterPartnerId = text(req.body?.afterPartnerId, 100);
      if (!canAccessBranch(req.user, branchId)) throw new Error('PARTNER_BRANCH_FORBIDDEN');
      let query: Query = db.collection('partners').where('branchId', '==', branchId).orderBy(FieldPath.documentId()).limit(100);
      if (afterPartnerId) query = query.startAfter(afterPartnerId);
      const snapshot = await query.get();
      const candidates = snapshot.docs.flatMap(doc => {
        try {
          const partner = { id: doc.id, ...doc.data() } as any;
          const identity = resolvePartyIdentity(partner, branchId);
          return [{ doc, partner, identity }];
        } catch {
          return [];
        }
      });
      const related = await Promise.all(candidates.map(async candidate => ({
        ...candidate,
        master: await db.collection('partyMasters').doc(candidate.identity.partyMasterId).get(),
        account: await db.collection('branchPartyAccounts').doc(candidate.identity.branchPartyAccountId).get()
      })));
      const batch = db.batch();
      const now = new Date().toISOString();
      let createdMasters = 0;
      let createdAccounts = 0;
      related.forEach(({ doc, partner, identity, master, account }) => {
        const masterRef = db!.collection('partyMasters').doc(identity.partyMasterId);
        const accountRef = db!.collection('branchPartyAccounts').doc(identity.branchPartyAccountId);
        if (!master.exists) {
          batch.create(masterRef, newPartyMasterRecord(partner, identity, req.user?.uid || '', now));
          createdMasters += 1;
        }
        if (!account.exists) {
          const type = String(partner.type || '').toUpperCase();
          const debt = Number(partner.outstandingDebt || 0);
          const supplierSide = type === 'SUPPLIER' || (type === 'BOTH' && Boolean(partner.supplierCategory));
          batch.create(accountRef, newBranchPartyAccountRecord(partner, branchId, identity, req.user?.uid || '', now, {
            payableBalance: supplierSide ? debt : 0,
            receivableBalance: supplierSide ? 0 : debt
          }));
          createdAccounts += 1;
        }
        batch.update(doc.ref, {
          partyMasterId: identity.partyMasterId,
          branchPartyAccountId: identity.branchPartyAccountId,
          updatedAt: FieldValue.serverTimestamp()
        });
      });
      if (related.length > 0) await batch.commit();
      return res.json({
        success: true,
        branchId,
        scanned: snapshot.size,
        migrated: related.length,
        skippedInvalidIdentity: snapshot.size - related.length,
        createdMasters,
        createdAccounts,
        hasMore: snapshot.size === 100,
        nextCursor: snapshot.docs.at(-1)?.id || null
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'PARTNER_ACCOUNT_BACKFILL_FAILED' });
    }
  });

  router.post('/accounts/activate', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const partyMasterId = text(req.body?.partyMasterId, 100);
      const branchId = text(req.body?.branchId, 100);
      const type = text(req.body?.type, 30).toUpperCase();
      if (!partyMasterId || !canAccessBranch(req.user, branchId)) throw new Error('PARTNER_BRANCH_FORBIDDEN');
      if (!PARTNER_TYPES.has(type)) throw new Error('PARTNER_TYPE_INVALID');
      const identity = resolvePartyIdentity({ partyMasterId, phone: '0' }, branchId);
      const masterRef = db.collection('partyMasters').doc(partyMasterId);
      const accountRef = db.collection('branchPartyAccounts').doc(identity.branchPartyAccountId);
      const partnerId = text(req.body?.partnerId, 100) || `BP_${identity.branchPartyAccountId.slice(4)}`;
      const partnerRef = db.collection('partners').doc(partnerId);
      let partner: any;
      await db.runTransaction(async transaction => {
        const [masterSnap, accountSnap, partnerSnap] = await Promise.all([
          transaction.get(masterRef), transaction.get(accountRef), transaction.get(partnerRef)
        ]);
        if (!masterSnap.exists) throw new Error('PARTY_MASTER_NOT_FOUND');
        if (accountSnap.exists || partnerSnap.exists) throw new Error('PARTNER_ALREADY_ACTIVE_IN_BRANCH');
        const master = masterSnap.data()!;
        const now = new Date().toISOString();
        partner = {
          id: partnerId,
          branchId,
          partyMasterId,
          branchPartyAccountId: identity.branchPartyAccountId,
          type,
          name: String(master.displayName || master.legalName || ''),
          phone: String(master.phoneNormalized || ''),
          email: String(master.email || ''),
          address: String(master.address || ''),
          taxCode: String(master.taxCodeNormalized || ''),
          outstandingDebt: 0,
          totalPurchasedFrom: 0,
          totalSalesTo: 0,
          totalSpent: 0,
          loyaltyPoints: 0,
          debtTransactions: [],
          createdAt: now,
          createdByUid: req.user?.uid,
          isActive: true
        };
        transaction.create(accountRef, newBranchPartyAccountRecord(partner, branchId, identity, req.user?.uid || '', now));
        transaction.create(partnerRef, { ...partner, createdAtServer: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      });
      return res.status(201).json({ success: true, partner });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'PARTNER_ACCOUNT_ACTIVATE_FAILED' });
    }
  });

  router.patch('/masters/:partyMasterId', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const masterRef = db.collection('partyMasters').doc(req.params.partyMasterId);
      const updates = {
        ...(text(req.body?.displayName, 200) ? { displayName: text(req.body.displayName, 200), legalName: text(req.body.displayName, 200) } : {}),
        ...(req.body?.email !== undefined ? { email: text(req.body.email, 160) } : {}),
        ...(req.body?.address !== undefined ? { address: text(req.body.address, 500) } : {}),
        updatedByUid: req.user?.uid,
        updatedAt: FieldValue.serverTimestamp()
      };
      await db.runTransaction(async transaction => {
        const current = await transaction.get(masterRef);
        if (!current.exists) throw new Error('PARTY_MASTER_NOT_FOUND');
        transaction.update(masterRef, updates);
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'PARTY_MASTER_UPDATE_FAILED' });
    }
  });

  router.post('/', requireRole(...PARTNER_OPERATION_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const id = text(req.body?.id, 100);
      const branchId = text(req.body?.branchId, 100);
      if (!id || !canAccessBranch(req.user, branchId)) throw new Error('PARTNER_BRANCH_FORBIDDEN');
      const details = editablePartnerFields(req.body);
      const result = await ensureBranchPartner(db, { id, branchId, details }, req.user?.uid || '');
      return res.status(result.created ? 201 : 200).json({ success: true, partner: result.partner, repaired: result.repaired });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'PARTNER_CREATE_FAILED' });
    }
  });

  router.patch('/:partnerId', requireRole(...PARTNER_OPERATION_ROLES), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const partnerRef = db.collection('partners').doc(req.params.partnerId);
      let partner: any;
      await db.runTransaction(async transaction => {
        const current = await transaction.get(partnerRef);
        if (!current.exists) throw new Error('PARTNER_NOT_FOUND');
        const currentData = current.data()!;
        if (!canAccessBranch(req.user, String(currentData.branchId || ''))) throw new Error('PARTNER_BRANCH_FORBIDDEN');
        if (req.body?.branchId !== undefined && String(req.body.branchId) !== String(currentData.branchId)) throw new Error('PARTNER_BRANCH_IMMUTABLE');
        const details = editablePartnerFields({ ...currentData, ...req.body, branchId: currentData.branchId });
        const identity = resolvePartyIdentity({ ...currentData, ...details }, String(currentData.branchId));
        const masterRef = db.collection('partyMasters').doc(identity.partyMasterId);
        const accountRef = db.collection('branchPartyAccounts').doc(identity.branchPartyAccountId);
        const [masterSnap, accountSnap] = await Promise.all([transaction.get(masterRef), transaction.get(accountRef)]);
        const now = new Date().toISOString();
        partner = {
          ...currentData, ...details, id: current.id, branchId: currentData.branchId,
          partyMasterId: identity.partyMasterId, branchPartyAccountId: identity.branchPartyAccountId,
          updatedByUid: req.user?.uid
        };
        if (!masterSnap.exists) transaction.create(masterRef, newPartyMasterRecord(partner, identity, req.user?.uid || '', now));
        if (!accountSnap.exists) {
          const isSupplier = ['SUPPLIER', 'BOTH'].includes(String(partner.type));
          transaction.create(accountRef, newBranchPartyAccountRecord(partner, partner.branchId, identity, req.user?.uid || '', now, {
            payableBalance: isSupplier ? Number(partner.outstandingDebt || 0) : 0,
            receivableBalance: isSupplier ? 0 : Number(partner.outstandingDebt || 0)
          }));
        } else {
          transaction.update(accountRef, {
            type: partner.type,
            creditLimit: Number(partner.creditLimit || 0),
            status: 'ACTIVE',
            updatedByUid: req.user?.uid,
            updatedAt: now
          });
        }
        transaction.update(partnerRef, {
          ...details,
          partyMasterId: identity.partyMasterId,
          branchPartyAccountId: identity.branchPartyAccountId,
          updatedByUid: req.user?.uid,
          updatedAt: FieldValue.serverTimestamp()
        });
      });
      return res.json({ success: true, partner });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'PARTNER_UPDATE_FAILED' });
    }
  });

  router.post('/:partnerId/archive', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const partnerRef = db.collection('partners').doc(req.params.partnerId);
      await db.runTransaction(async transaction => {
        const current = await transaction.get(partnerRef);
        if (!current.exists) throw new Error('PARTNER_NOT_FOUND');
        const data = current.data()!;
        if (!canAccessBranch(req.user, String(data.branchId || ''))) throw new Error('PARTNER_BRANCH_FORBIDDEN');
        if (Number(data.outstandingDebt || 0) !== 0) throw new Error('PARTNER_HAS_OUTSTANDING_DEBT');
        const identity = resolvePartyIdentity(data, String(data.branchId));
        const accountRef = db.collection('branchPartyAccounts').doc(identity.branchPartyAccountId);
        const accountSnap = await transaction.get(accountRef);
        if (accountSnap.exists && (Number(accountSnap.data()?.receivableBalance || 0) !== 0 || Number(accountSnap.data()?.payableBalance || 0) !== 0)) {
          throw new Error('PARTNER_HAS_OUTSTANDING_DEBT');
        }
        if (accountSnap.exists) transaction.update(accountRef, { status: 'ARCHIVED', archivedByUid: req.user?.uid, archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        transaction.update(partnerRef, { isActive: false, isArchived: true, archivedByUid: req.user?.uid, archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'PARTNER_ARCHIVE_FAILED' });
    }
  });

  return router;
}
