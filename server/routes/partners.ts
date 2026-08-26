import { Router, Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';

const PARTNER_TYPES = new Set(['CUSTOMER', 'SUPPLIER', 'BOTH', 'STAFF']);
const CUSTOMER_TIERS = new Set(['STANDARD', 'SILVER', 'GOLD', 'DIAMOND', 'WHOLESALE']);
const SUPPLIER_CATEGORIES = new Set(['OFFICIAL_DISTRIBUTOR', 'LIKE_NEW_WHOLESALER', 'COMPONENTS', 'FINANCE_PARTNER']);

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

  router.post('/', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER', 'SALES', 'CUSTOMER_CARE'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const id = text(req.body?.id, 100);
      const branchId = text(req.body?.branchId, 100);
      if (!id || !canAccessBranch(req.user, branchId)) throw new Error('PARTNER_BRANCH_FORBIDDEN');
      const details = editablePartnerFields(req.body);
      const partnerRef = db.collection('partners').doc(id);
      const branchRef = db.collection('branches').doc(branchId);
      const partner = {
        id, branchId, ...details,
        outstandingDebt: 0,
        totalPurchasedFrom: 0,
        totalSalesTo: 0,
        totalSpent: 0,
        loyaltyPoints: 0,
        debtTransactions: [],
        createdAt: new Date().toISOString(),
        createdByUid: req.user?.uid,
        isActive: true
      };
      await db.runTransaction(async transaction => {
        const [existing, branch] = await Promise.all([transaction.get(partnerRef), transaction.get(branchRef)]);
        if (existing.exists) throw new Error('PARTNER_ID_DUPLICATE');
        if (!branch.exists || branch.data()?.isActive === false) throw new Error('BRANCH_NOT_ACTIVE');
        transaction.create(partnerRef, { ...partner, createdAtServer: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      });
      return res.status(201).json({ success: true, partner });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'PARTNER_CREATE_FAILED' });
    }
  });

  router.patch('/:partnerId', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER', 'SALES', 'CUSTOMER_CARE'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const partnerRef = db.collection('partners').doc(req.params.partnerId);
      let partner: any;
      await db.runTransaction(async transaction => {
        const current = await transaction.get(partnerRef);
        if (!current.exists) throw new Error('PARTNER_NOT_FOUND');
        const currentData = current.data()!;
        if (!canAccessBranch(req.user, String(currentData.branchId || ''))) throw new Error('PARTNER_BRANCH_FORBIDDEN');
        const details = editablePartnerFields({ ...currentData, ...req.body, branchId: currentData.branchId });
        partner = { ...currentData, ...details, id: current.id, branchId: currentData.branchId, updatedByUid: req.user?.uid };
        transaction.update(partnerRef, { ...details, updatedByUid: req.user?.uid, updatedAt: FieldValue.serverTimestamp() });
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
        transaction.update(partnerRef, { isActive: false, isArchived: true, archivedByUid: req.user?.uid, archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'PARTNER_ARCHIVE_FAILED' });
    }
  });

  return router;
}
