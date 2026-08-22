import { Request, Response, Router } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import {
  listTechnicalTaskTypes,
  processCancelTechnicalTransfer,
  processCompleteInterBranchTransfer,
  processCreateInterBranchTransfer,
  processCreateTechnicalTransfer,
  processReceiveInterBranchTransfer
} from '../services/inventoryTransferService';

function sendTransferError(res: Response, error: any) {
  const message = error?.message || 'Lỗi xử lý điều chuyển hàng hóa.';
  const forbidden = /FORBIDDEN|NOT_ASSIGNED/.test(message);
  const notFound = /NOT_FOUND/.test(message);
  return res.status(forbidden ? 403 : notFound ? 404 : 400).json({ success: false, error: message });
}

export function createInventoryTransfersRouter(db: Firestore | null): Router {
  const router = Router();
  router.use(authenticateFirebase);

  router.get('/metadata', async (_req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const taskTypes = await listTechnicalTaskTypes(db);
      return res.json({ success: true, data: { taskTypes } });
    } catch (error: any) {
      return sendTransferError(res, error);
    }
  });

  router.put('/metadata/task-types/:taskType', requireRole('ADMIN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const taskType = String(req.params.taskType || '').trim().toUpperCase();
      const body = req.body || {};
      const multipliers = body.priorityMultiplier || {};
      const numericValues = [body.baseCommission, body.laborCostToDevice ?? body.baseCommission, body.normalSlaHours, body.prioritySlaHours, body.urgentSlaHours, multipliers.NORMAL, multipliers.PRIORITY, multipliers.URGENT];
      if (numericValues.some(value => typeof value !== 'number')) {
        return res.status(400).json({ success: false, error: 'TASK_TYPE_CONFIG_INVALID' });
      }
      const numbers = [body.baseCommission, body.laborCostToDevice ?? body.baseCommission, body.normalSlaHours, body.prioritySlaHours, body.urgentSlaHours, multipliers.NORMAL, multipliers.PRIORITY, multipliers.URGENT].map(Number);
      if (!/^[A-Z0-9_]{2,50}$/.test(taskType) || !body.name || !body.taskCode || numbers.some(value => !Number.isFinite(value) || value < 0) || !body.version) {
        return res.status(400).json({ success: false, error: 'TASK_TYPE_CONFIG_INVALID' });
      }
      const now = new Date().toISOString();
      const record = {
        id: taskType,
        taskType,
        name: String(body.name),
        taskCode: String(body.taskCode),
        baseCommission: Number(body.baseCommission),
        laborCostToDevice: Number(body.laborCostToDevice ?? body.baseCommission),
        capitalizeLaborCost: body.capitalizeLaborCost !== false,
        reworkCommissionPolicy: ['NO_EXTRA_COMMISSION', 'REPEAT_COMMISSION', 'MANAGER_APPROVAL'].includes(body.reworkCommissionPolicy) ? body.reworkCommissionPolicy : 'NO_EXTRA_COMMISSION',
        requiredEvidenceTypes: Array.isArray(body.requiredEvidenceTypes) ? body.requiredEvidenceTypes.filter((value: unknown) => typeof value === 'string') : [],
        requiredPartTemplates: Array.isArray(body.requiredPartTemplates) ? body.requiredPartTemplates : [],
        qcChecklistTemplateId: body.qcChecklistTemplateId ? String(body.qcChecklistTemplateId) : null,
        normalSlaHours: Number(body.normalSlaHours),
        prioritySlaHours: Number(body.prioritySlaHours),
        urgentSlaHours: Number(body.urgentSlaHours),
        priorityMultiplier: { NORMAL: Number(multipliers.NORMAL), PRIORITY: Number(multipliers.PRIORITY), URGENT: Number(multipliers.URGENT) },
        requiresQc: body.requiresQc !== false,
        isActive: body.isActive !== false,
        version: String(body.version),
        updatedAt: now,
        updatedByUid: req.user!.uid
      };
      await db.collection('technicalTaskTypes').doc(taskType).set(record, { merge: true });
      return res.json({ success: true, data: { taskType: record } });
    } catch (error: any) {
      return sendTransferError(res, error);
    }
  });

  router.get('/', async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const role = String(req.user!.role || '').toUpperCase();
      let docs: any[] = [];
      if (role === 'ADMIN' || role === 'REGIONAL_MANAGER') {
        docs = (await db.collection('transfers').limit(250).get()).docs;
      } else {
        const branchIds = [...new Set([req.user!.branchId, ...(req.user!.assignedBranchIds || [])].filter(Boolean))] as string[];
        const snapshots = await Promise.all(branchIds.flatMap(branchId => [
          db.collection('transfers').where('sourceBranchId', '==', branchId).limit(150).get(),
          db.collection('transfers').where('destinationBranchId', '==', branchId).limit(150).get()
        ]));
        const byId = new Map<string, any>();
        snapshots.forEach(snapshot => snapshot.docs.forEach(doc => byId.set(doc.id, doc)));
        docs = [...byId.values()];
      }
      const transfers = docs
        .map(doc => doc.data())
        .sort((left, right) => String(right.createdDate || right.createdAt || '').localeCompare(String(left.createdDate || left.createdAt || '')));
      return res.json({ success: true, data: { transfers } });
    } catch (error: any) {
      return sendTransferError(res, error);
    }
  });

  router.post(
    '/technical',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'INVENTORY_MANAGER'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const data = await processCreateTechnicalTransfer(db, req.body, req.user!);
        return res.json({ success: true, data });
      } catch (error: any) {
        return sendTransferError(res, error);
      }
    }
  );

  router.post(
    '/technical/:id/accept',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'),
    async (req: Request, res: Response) => {
      return res.status(409).json({
        success: false,
        error: 'ACCEPT_VIA_TECH_DESK_REQUIRED: KTV phải mở Bàn kỹ thuật, quét từng IMEI, hoàn tất checklist và ảnh tình trạng để nhận máy.'
      });
    }
  );

  router.post(
    '/technical/:id/cancel',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'INVENTORY_MANAGER'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const data = await processCancelTechnicalTransfer(db, req.params.id, req.body.reason || '', req.user!);
        return res.json({ success: true, data });
      } catch (error: any) {
        return sendTransferError(res, error);
      }
    }
  );

  router.post(
    '/inter-branch',
    requireRole('ADMIN', 'MANAGER', 'INVENTORY_MANAGER'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const data = await processCreateInterBranchTransfer(db, req.body, req.user!);
        return res.json({ success: true, data });
      } catch (error: any) {
        return sendTransferError(res, error);
      }
    }
  );

  router.post(
    '/inter-branch/:id/receive',
    requireRole('ADMIN', 'MANAGER', 'INVENTORY_MANAGER'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const data = await processReceiveInterBranchTransfer(db, req.params.id, req.body, req.user!);
        return res.json({ success: true, data });
      } catch (error: any) {
        return sendTransferError(res, error);
      }
    }
  );

  router.post(
    '/inter-branch/:id/complete',
    requireRole('ADMIN', 'MANAGER', 'INVENTORY_MANAGER'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const data = await processCompleteInterBranchTransfer(db, req.params.id, req.user!);
        return res.json({ success: true, data });
      } catch (error: any) {
        return sendTransferError(res, error);
      }
    }
  );

  return router;
}
