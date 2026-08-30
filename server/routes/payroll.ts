import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import { approvePayrollRun, calculateAndSavePayrollRun, getMyPayrollSlip, getPayrollRun, payPayrollRun } from '../services/payrollService';
import { listEmploymentCompensations, saveEmploymentCompensation } from '../services/compensationService';
import { createPayrollAdjustment, listPayrollAdjustments, reviewPayrollAdjustment } from '../services/payrollAdjustmentService';

export function createPayrollRouter(db: Firestore | null) {
  const router = Router();
  const actor = (req: Request) => ({
    uid: req.user!.uid,
    role: req.user!.role,
    branchId: req.user?.branchId,
    assignedBranchIds: req.user?.assignedBranchIds || [],
    name: req.user?.name || req.user?.email || req.user!.uid
  });
  const statusFor = (error: any) => {
    const text = String(error?.message || error || '');
    if (text.includes('FORBIDDEN')) return 403;
    if (text.includes('NOT_FOUND')) return 404;
    if (text.includes('FIRESTORE_NOT_CONFIGURED')) return 503;
    if (text.includes('LOCKED') || text.includes('PAID') || text.includes('IDEMPOTENCY') || text.includes('ALREADY')) return 409;
    return 400;
  };

  router.get('/my-slip', authenticateFirebase, async (req: Request, res: Response) => {
    try {
      const data = await getMyPayrollSlip(db, actor(req), String(req.query.period || ''));
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(statusFor(error)).json({ success: false, error: error?.message || 'Không tải được phiếu lương cá nhân.' });
    }
  });

  router.get('/runs/current', authenticateFirebase, requireRole('MANAGER', 'STORE_MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    try {
      const data = await getPayrollRun(db, actor(req), { period: String(req.query.period || ''), branchId: String(req.query.branchId || '') });
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(statusFor(error)).json({ success: false, error: error?.message || 'Không tải được kỳ lương.' });
    }
  });

  router.post('/runs/calculate', authenticateFirebase, requireRole('MANAGER', 'STORE_MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    try {
      const data = await calculateAndSavePayrollRun(db, actor(req), { period: String(req.body?.period || ''), branchId: String(req.body?.branchId || '') });
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(statusFor(error)).json({ success: false, error: error?.message || 'Không tính được kỳ lương.' });
    }
  });

  router.post('/runs/:runId/approve', authenticateFirebase, requireRole('MANAGER', 'STORE_MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    try {
      const data = await approvePayrollRun(db, actor(req), String(req.params.runId || ''));
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(statusFor(error)).json({ success: false, error: error?.message || 'Không duyệt được kỳ lương.' });
    }
  });

  router.post('/runs/:runId/pay', authenticateFirebase, requireRole('ACCOUNTANT'), async (req: Request, res: Response) => {
    try {
      const data = await payPayrollRun(db, actor(req), String(req.params.runId || ''), {
        fundId: String(req.body?.fundId || ''),
        idempotencyKey: String(req.body?.idempotencyKey || req.headers['x-idempotency-key'] || ''),
        note: String(req.body?.note || '')
      });
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(statusFor(error)).json({ success: false, error: error?.message || 'Không chi được kỳ lương.' });
    }
  });

  router.get('/compensations', authenticateFirebase, requireRole('ACCOUNTANT'), async (req: Request, res: Response) => {
    try {
      const data = await listEmploymentCompensations(db, actor(req), {
        staffUid: String(req.query.staffUid || ''),
        branchId: String(req.query.branchId || '')
      });
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(statusFor(error)).json({ success: false, error: error?.message || 'Không tải được cấu hình lương.' });
    }
  });

  router.post('/compensations/:staffUid', authenticateFirebase, requireRole('ACCOUNTANT'), async (req: Request, res: Response) => {
    try {
      const data = await saveEmploymentCompensation(db, actor(req), String(req.params.staffUid || ''), req.body || {});
      return res.status(201).json({ success: true, data });
    } catch (error: any) {
      return res.status(statusFor(error)).json({ success: false, error: error?.message || 'Không lưu được cấu hình lương.' });
    }
  });

  router.get('/adjustments', authenticateFirebase, requireRole('MANAGER', 'STORE_MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    try {
      const data = await listPayrollAdjustments(db, actor(req), {
        period: String(req.query.period || ''),
        branchId: String(req.query.branchId || ''),
        staffUid: String(req.query.staffUid || '') || undefined
      });
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(statusFor(error)).json({ success: false, error: error?.message || 'Không tải được điều chỉnh lương.' });
    }
  });

  router.post('/adjustments', authenticateFirebase, requireRole('MANAGER', 'STORE_MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    try {
      const data = await createPayrollAdjustment(db, actor(req), req.body || {});
      return res.status(201).json({ success: true, data });
    } catch (error: any) {
      return res.status(statusFor(error)).json({ success: false, error: error?.message || 'Không tạo được điều chỉnh lương.' });
    }
  });

  router.post('/adjustments/:adjustmentId/review', authenticateFirebase, requireRole('ACCOUNTANT'), async (req: Request, res: Response) => {
    try {
      const data = await reviewPayrollAdjustment(db, actor(req), String(req.params.adjustmentId || ''), {
        decision: String(req.body?.decision || ''),
        reason: String(req.body?.reason || '')
      });
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(statusFor(error)).json({ success: false, error: error?.message || 'Không duyệt được điều chỉnh lương.' });
    }
  });

  return router;
}
