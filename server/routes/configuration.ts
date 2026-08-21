import { Router, Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';

function requiredBranchId(value: unknown): string {
  const branchId = String(value || '').trim();
  if (!branchId || branchId === 'ALL') throw new Error('WAREHOUSE_BRANCH_REQUIRED');
  return branchId;
}

export function validateWarehouseDraft(input: any) {
  const id = String(input?.id || '').trim();
  const branchId = requiredBranchId(input?.branchId);
  const code = String(input?.code || '').trim().toUpperCase();
  const name = String(input?.name || '').trim();
  const shortName = String(input?.shortName || name).trim();
  const type = String(input?.type || 'RETAIL_STORE').trim().toUpperCase();
  const isMain = input?.isMain === true;
  const parentWarehouseId = String(input?.parentWarehouseId || '').trim();
  const custodianUid = String(input?.custodianUid || input?.technicianId || '').trim();
  const isChild = Boolean(parentWarehouseId) || type === 'TECHNICIAN_SUB';

  if (!id || !code || !name || !shortName) throw new Error('WAREHOUSE_REQUIRED_FIELDS');
  if (isMain && parentWarehouseId) throw new Error('MAIN_WAREHOUSE_CANNOT_HAVE_PARENT');
  if (isChild && !parentWarehouseId) throw new Error('CHILD_WAREHOUSE_PARENT_REQUIRED');
  if (isChild && !custodianUid) throw new Error('CHILD_WAREHOUSE_CUSTODIAN_REQUIRED');
  if (parentWarehouseId === id) throw new Error('WAREHOUSE_PARENT_SELF_REFERENCE');

  return {
    id,
    branchId,
    code,
    name,
    shortName,
    type,
    isMain,
    parentWarehouseId: isChild ? parentWarehouseId : '',
    custodianUid: isChild ? custodianUid : '',
    isChild
  };
}

async function assertBranchActive(transaction: any, db: Firestore, branchId: string) {
  const branchSnap = await transaction.get(db.collection('branches').doc(branchId));
  if (!branchSnap.exists || branchSnap.data()?.isActive === false) throw new Error('BRANCH_NOT_ACTIVE');
}

async function assertCustodian(transaction: any, db: Firestore, uid: string, branchId: string) {
  const userSnap = await transaction.get(db.collection('users').doc(uid));
  if (!userSnap.exists || userSnap.data()?.active !== true) throw new Error('CUSTODIAN_NOT_ACTIVE');
  const user = userSnap.data()!;
  const assigned = Array.isArray(user.assignedBranchIds) ? user.assignedBranchIds : [];
  if (user.role !== 'ADMIN' && user.branchId !== branchId && !assigned.includes(branchId)) {
    throw new Error('CUSTODIAN_BRANCH_MISMATCH');
  }
  return user.displayName || user.name || user.email || uid;
}

async function assertParentWarehouse(transaction: any, db: Firestore, parentId: string, branchId: string) {
  const parentSnap = await transaction.get(db.collection('warehouses').doc(parentId));
  if (!parentSnap.exists) throw new Error('PARENT_WAREHOUSE_NOT_FOUND');
  const parent = parentSnap.data()!;
  if (parent.isMain !== true || parent.isActive === false) throw new Error('PARENT_MUST_BE_ACTIVE_MAIN_WAREHOUSE');
  if (requiredBranchId(parent.branchId) !== branchId) throw new Error('PARENT_WAREHOUSE_BRANCH_MISMATCH');
}

export function createConfigurationRouter(db: Firestore | null): Router {
  const router = Router();
  router.use(authenticateFirebase);

  router.post('/warehouses', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const draft = validateWarehouseDraft(req.body);
      let result: any;
      await db.runTransaction(async (transaction) => {
        const warehouseRef = db.collection('warehouses').doc(draft.id);
        const existing = await transaction.get(warehouseRef);
        if (existing.exists) throw new Error('WAREHOUSE_ID_DUPLICATE');
        await assertBranchActive(transaction, db, draft.branchId);

        const sameBranch = await transaction.get(db.collection('warehouses').where('branchId', '==', draft.branchId));
        if (sameBranch.docs.some((item) => item.data().code === draft.code && item.data().isActive !== false)) {
          throw new Error('WAREHOUSE_CODE_DUPLICATE');
        }

        let custodianName = '';
        if (draft.isChild) {
          await assertParentWarehouse(transaction, db, draft.parentWarehouseId, draft.branchId);
          custodianName = await assertCustodian(transaction, db, draft.custodianUid, draft.branchId);
        }

        result = {
          ...req.body,
          ...draft,
          parentWarehouseId: draft.parentWarehouseId || null,
          custodianUid: draft.custodianUid || null,
          custodianName: custodianName || null,
          technicianId: draft.custodianUid || null,
          technicianName: custodianName || null,
          isActive: req.body.isActive !== false,
          createdByUid: req.user?.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        };
        transaction.set(warehouseRef, result);
      });
      return res.status(201).json({ success: true, warehouse: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'WAREHOUSE_CREATE_FAILED' });
    }
  });

  router.patch('/warehouses/:warehouseId', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      let result: any;
      await db.runTransaction(async (transaction) => {
        const warehouseRef = db.collection('warehouses').doc(req.params.warehouseId);
        const currentSnap = await transaction.get(warehouseRef);
        if (!currentSnap.exists) throw new Error('WAREHOUSE_NOT_FOUND');
        const current = currentSnap.data()!;
        const draft = validateWarehouseDraft({ ...current, ...req.body, id: req.params.warehouseId });
        if (draft.branchId !== current.branchId) throw new Error('WAREHOUSE_BRANCH_IMMUTABLE');
        await assertBranchActive(transaction, db, draft.branchId);

        const children = await transaction.get(db.collection('warehouses').where('parentWarehouseId', '==', req.params.warehouseId));
        if (current.isMain === true && draft.isMain === false && !children.empty) {
          throw new Error('WAREHOUSE_HAS_CHILDREN');
        }

        let custodianName = '';
        if (draft.isChild) {
          await assertParentWarehouse(transaction, db, draft.parentWarehouseId, draft.branchId);
          custodianName = await assertCustodian(transaction, db, draft.custodianUid, draft.branchId);
        }
        result = {
          ...current,
          ...req.body,
          ...draft,
          parentWarehouseId: draft.parentWarehouseId || null,
          custodianUid: draft.custodianUid || null,
          custodianName: custodianName || null,
          technicianId: draft.custodianUid || null,
          technicianName: custodianName || null,
          updatedByUid: req.user?.uid,
          updatedAt: FieldValue.serverTimestamp()
        };
        transaction.set(warehouseRef, result, { merge: true });
      });
      return res.json({ success: true, warehouse: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'WAREHOUSE_UPDATE_FAILED' });
    }
  });

  router.post('/warehouses/:warehouseId/archive', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const warehouseRef = db.collection('warehouses').doc(req.params.warehouseId);
      await db.runTransaction(async (transaction) => {
        const currentSnap = await transaction.get(warehouseRef);
        if (!currentSnap.exists) throw new Error('WAREHOUSE_NOT_FOUND');
        const devices = await transaction.get(db.collection('devices').where('currentLocationId', '==', req.params.warehouseId).limit(1));
        if (!devices.empty) throw new Error('WAREHOUSE_HAS_DEVICES');
        const children = await transaction.get(db.collection('warehouses').where('parentWarehouseId', '==', req.params.warehouseId).limit(1));
        if (!children.empty) throw new Error('WAREHOUSE_HAS_CHILDREN');
        const sourceTransfers = await transaction.get(db.collection('transfers').where('sourceLocationId', '==', req.params.warehouseId));
        const destinationTransfers = await transaction.get(db.collection('transfers').where('destinationLocationId', '==', req.params.warehouseId));
        const openStatuses = new Set(['PENDING', 'WAITING_KTV_ACCEPT', 'IN_PROGRESS', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'DISPUTED']);
        if ([...sourceTransfers.docs, ...destinationTransfers.docs].some((item) => openStatuses.has(item.data().status))) {
          throw new Error('WAREHOUSE_HAS_OPEN_TRANSFERS');
        }
        transaction.update(warehouseRef, {
          isActive: false,
          archivedAt: FieldValue.serverTimestamp(),
          archivedByUid: req.user?.uid
        });
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error.message || 'WAREHOUSE_ARCHIVE_FAILED' });
    }
  });

  return router;
}
