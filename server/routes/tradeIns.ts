import { Router, Request, Response } from 'express';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import { normalizeRole } from '../../shared/permissions';

const BODY_CONDITIONS = new Set(['Keng Không Vết Xước', 'Trầy Nhẹ Lông Mèo', 'Cấn Móp Góc', 'Cong Vỏ']);
const SCREEN_CONDITIONS = new Set(['Màn Zin Đẹp', 'Màn Trầy Xước', 'Màn Đã Ép Kính', 'Màn Lô / Mực / Sọc']);
const STATUSES = new Set(['pending', 'accepted', 'rejected', 'completed']);

const text = (value: unknown, max = 500) => String(value || '').trim().slice(0, max);
const money = (value: unknown, field: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10_000_000_000) throw new Error(`${field}_INVALID`);
  return Math.round(parsed);
};

export function validateTradeInDraft(input: any) {
  const customerName = text(input?.customerName, 160);
  const phone = text(input?.phone || input?.customerPhone, 30).replace(/\s+/g, '');
  const oldModel = text(input?.oldModel, 200);
  const storage = text(input?.storage, 50);
  const color = text(input?.color, 80);
  const imei = text(input?.imei, 20).replace(/\D/g, '');
  const receiveWarehouseId = text(input?.receiveWarehouseId || input?.warehouseId, 100);
  const batteryPercent = Number(input?.batteryPercent);
  const bodyCondition = text(input?.bodyCondition, 80);
  const screenCondition = text(input?.screenCondition, 80);
  if (!customerName || !/^\+?\d{8,15}$/.test(phone) || !oldModel || !storage) throw new Error('TRADE_IN_REQUIRED_FIELDS');
  if (!Number.isFinite(batteryPercent) || batteryPercent < 0 || batteryPercent > 100) throw new Error('TRADE_IN_BATTERY_INVALID');
  if (!BODY_CONDITIONS.has(bodyCondition) || !SCREEN_CONDITIONS.has(screenCondition)) throw new Error('TRADE_IN_CONDITION_INVALID');
  if (imei && !/^\d{5,15}$/.test(imei)) throw new Error('TRADE_IN_IMEI_INVALID');
  const estimatedValue = money(input?.estimatedValue, 'TRADE_IN_ESTIMATED_VALUE');
  const targetNewModelPrice = money(input?.targetNewModelPrice || 0, 'TRADE_IN_TARGET_PRICE');
  return {
    customerName,
    phone,
    oldModel,
    storage,
    color,
    ...(imei ? { imei } : {}),
    ...(receiveWarehouseId ? { receiveWarehouseId } : {}),
    batteryPercent,
    bodyCondition,
    screenCondition,
    faceIdWorking: input?.faceIdWorking === true,
    cameraWorking: input?.cameraWorking === true,
    icloudUnlocked: input?.icloudUnlocked === true,
    truetoneWorking: input?.truetoneWorking === true,
    speakersWorking: input?.speakersWorking === true,
    estimatedValue,
    targetNewModel: text(input?.targetNewModel, 200),
    targetNewModelPrice,
    upgradeDiffPrice: Math.max(0, targetNewModelPrice - estimatedValue),
    aiSuggestedPrice: input?.aiSuggestedPrice == null ? null : money(input.aiSuggestedPrice, 'TRADE_IN_AI_PRICE'),
    aiReasoning: text(input?.aiReasoning, 2000),
    baseValue: input?.baseValue == null ? null : money(input.baseValue, 'TRADE_IN_BASE_VALUE'),
    subsidyBonus: input?.subsidyBonus == null ? null : money(input.subsidyBonus, 'TRADE_IN_SUBSIDY'),
    totalDeduction: input?.totalDeduction == null ? null : money(input.totalDeduction, 'TRADE_IN_DEDUCTION'),
    deductionDetails: Array.isArray(input?.deductionDetails) ? input.deductionDetails.slice(0, 30).map((item: any) => ({
      step: Number(item?.step || 0),
      name: text(item?.name, 160),
      amount: money(item?.amount || 0, 'TRADE_IN_DEDUCTION_LINE'),
      note: text(item?.note, 500)
    })) : []
  };
}

function isManager(role: unknown) {
  return ['ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'STORE_MANAGER'].includes(normalizeRole(role));
}

function canAccessBranch(user: Request['user'], branchId: string) {
  const role = normalizeRole(user?.role);
  return role === 'ADMIN' || role === 'REGIONAL_MANAGER' || user?.branchId === branchId || (user?.assignedBranchIds || []).includes(branchId);
}

export function createTradeInsRouter(db: Firestore | null): Router {
  const router = Router();
  router.use(authenticateFirebase);

  router.post('/', requireRole('MANAGER', 'STORE_MANAGER', 'SALES', 'SALE_ONLINE', 'TECHNICIAN', 'TECH_LEAD'), async (req: Request, res: Response) => {
    try {
      if (!db) throw new Error('DATABASE_UNAVAILABLE');
      const branchId = text(req.body?.branchId || req.user?.branchId, 80);
      if (!branchId || branchId === 'ALL') throw new Error('BRANCH_REQUIRED');
      if (!canAccessBranch(req.user, branchId)) throw new Error('TRADE_IN_BRANCH_FORBIDDEN');
      const draft = validateTradeInDraft(req.body);
      const branchSnap = await db.collection('branches').doc(branchId).get();
      if (!branchSnap.exists || branchSnap.data()?.isActive === false) throw new Error('BRANCH_NOT_ACTIVE');
      if (draft.receiveWarehouseId) {
        const warehouseSnap = await db.collection('warehouses').doc(draft.receiveWarehouseId).get();
        if (!warehouseSnap.exists || warehouseSnap.data()?.isActive === false || warehouseSnap.data()?.isArchived === true) throw new Error('TRADE_IN_WAREHOUSE_NOT_ACTIVE');
        if (String(warehouseSnap.data()?.branchId || '') !== branchId) throw new Error('TRADE_IN_WAREHOUSE_BRANCH_MISMATCH');
      }
      const ref = db.collection('tradeInAppraisals').doc();
      const legacyRef = db.collection('tradeIns').doc(ref.id);
      const now = new Date().toISOString();
      const manager = isManager(req.user?.role);
      const requestedStatus = text(req.body?.status, 20).toLowerCase();
      const status = manager && requestedStatus === 'accepted' ? 'accepted' : 'pending';
      if (status === 'accepted' && (!draft.imei || !draft.receiveWarehouseId)) throw new Error('TRADE_IN_INVENTORY_FIELDS_REQUIRED');
      const approvedPrice = status === 'accepted' ? draft.estimatedValue : null;
      const record = {
        id: ref.id,
        branchId,
        branchName: text(branchSnap.data()?.name, 160),
        ...draft,
        status,
        approvedPrice,
        finalApprovedPrice: approvedPrice,
        createdDate: now.slice(0, 10),
        inspectedBy: req.user?.name || req.user?.email || req.user?.uid,
        createdByUid: req.user?.uid,
        createdAt: now,
        updatedAt: now,
        ...(status === 'accepted' ? { approvedByUid: req.user?.uid, approvedAt: now } : {})
      };
      await db.runTransaction(async transaction => {
        transaction.create(ref, { ...record, createdAtServer: FieldValue.serverTimestamp(), updatedAtServer: FieldValue.serverTimestamp() });
        transaction.create(legacyRef, { ...record, canonicalAppraisalId: ref.id, createdAtServer: FieldValue.serverTimestamp(), updatedAtServer: FieldValue.serverTimestamp() });
      });
      return res.status(201).json({ success: true, data: record });
    } catch (error: any) {
      const code = String(error?.message || 'TRADE_IN_CREATE_FAILED');
      const status = code.includes('FORBIDDEN') ? 403 : code.includes('DATABASE') ? 503 : 400;
      return res.status(status).json({ success: false, error: code });
    }
  });

  router.patch('/:id', requireRole('MANAGER', 'STORE_MANAGER', 'SALES', 'SALE_ONLINE', 'TECHNICIAN', 'TECH_LEAD'), async (req: Request, res: Response) => {
    try {
      if (!db) throw new Error('DATABASE_UNAVAILABLE');
      const canonicalRef = db.collection('tradeInAppraisals').doc(req.params.id);
      const legacyRef = db.collection('tradeIns').doc(req.params.id);
      let result: any;
      await db.runTransaction(async transaction => {
        const [canonicalSnap, legacySnap] = await Promise.all([transaction.get(canonicalRef), transaction.get(legacyRef)]);
        const source = canonicalSnap.exists ? canonicalSnap : legacySnap;
        if (!source.exists) throw new Error('TRADE_IN_NOT_FOUND');
        const current = source.data()!;
        const branchId = text(current.branchId, 80);
        if (!branchId || !canAccessBranch(req.user, branchId)) throw new Error('TRADE_IN_BRANCH_FORBIDDEN');
        if (current.usedByInvoiceId || String(current.status).toUpperCase() === 'CONSUMED') throw new Error('TRADE_IN_ALREADY_USED');
        const draft = validateTradeInDraft({ ...current, ...req.body });
        if (draft.receiveWarehouseId) {
          const warehouseSnap = await transaction.get(db.collection('warehouses').doc(draft.receiveWarehouseId));
          if (!warehouseSnap.exists || warehouseSnap.data()?.isActive === false || warehouseSnap.data()?.isArchived === true) throw new Error('TRADE_IN_WAREHOUSE_NOT_ACTIVE');
          if (String(warehouseSnap.data()?.branchId || '') !== branchId) throw new Error('TRADE_IN_WAREHOUSE_BRANCH_MISMATCH');
        }
        const manager = isManager(req.user?.role);
        const requestedStatus = text(req.body?.status ?? current.status, 20).toLowerCase();
        if (!STATUSES.has(requestedStatus)) throw new Error('TRADE_IN_STATUS_INVALID');
        if (!manager && requestedStatus !== String(current.status || 'pending').toLowerCase()) throw new Error('TRADE_IN_STATUS_MANAGER_REQUIRED');
        if (!manager && current.createdByUid && current.createdByUid !== req.user?.uid) throw new Error('TRADE_IN_OWNER_FORBIDDEN');
        if (requestedStatus === 'accepted' && (!draft.imei || !draft.receiveWarehouseId)) throw new Error('TRADE_IN_INVENTORY_FIELDS_REQUIRED');
        const approvedPrice = requestedStatus === 'accepted'
          ? money(req.body?.approvedPrice ?? req.body?.finalApprovedPrice ?? draft.estimatedValue, 'TRADE_IN_APPROVED_PRICE')
          : (current.approvedPrice ?? null);
        const now = new Date().toISOString();
        result = {
          ...current,
          ...draft,
          id: req.params.id,
          branchId,
          status: requestedStatus,
          approvedPrice,
          finalApprovedPrice: approvedPrice,
          updatedAt: now,
          updatedByUid: req.user?.uid,
          ...(manager && requestedStatus === 'accepted' ? { approvedByUid: req.user?.uid, approvedAt: now } : {})
        };
        transaction.set(canonicalRef, { ...result, updatedAtServer: FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(legacyRef, { ...result, canonicalAppraisalId: req.params.id, updatedAtServer: FieldValue.serverTimestamp() }, { merge: true });
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      const code = String(error?.message || 'TRADE_IN_UPDATE_FAILED');
      const status = code.includes('FORBIDDEN') || code.includes('MANAGER_REQUIRED') ? 403 : code.includes('NOT_FOUND') ? 404 : code.includes('DATABASE') ? 503 : 400;
      return res.status(status).json({ success: false, error: code });
    }
  });

  return router;
}
