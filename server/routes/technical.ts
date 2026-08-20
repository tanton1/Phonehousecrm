import { Router, Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import { requireBranchAccess } from '../middleware/requireBranchAccess';
import {
  processCreateWorkOrder,
  processAcceptCustody,
  processStartTaskLine,
  processCompleteTaskLine,
  processQCInspection,
  processReturnToStock,
  processDeliverToCustomer,
  processIssueSparePart
} from '../services/technicalService';

export function createTechnicalRouter(db: Firestore | null): Router {
  const router = Router();

  // All endpoints require authentication and active user verification
  router.use(authenticateFirebase);

  /**
   * 1. POST /api/technical/work-orders
   * Create Work Order with multiple task lines (LV, EK, TP, etc.)
   */
  router.post(
    '/work-orders',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'INVENTORY_MANAGER'),
    requireBranchAccess(),
    async (req: Request, res: Response) => {
      if (!db) {
        return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      }

      try {
        const result = await processCreateWorkOrder(db, req.body, req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[Create WorkOrder Error]:', error);
        return res.status(400).json({ success: false, error: error?.message || 'Lỗi tạo phiếu kỹ thuật.' });
      }
    }
  );

  /**
   * 2. POST /api/technical/work-orders/:id/accept
   * KTV physically scans IMEI to accept custody & begin responsibility
   */
  router.post(
    '/work-orders/:id/accept',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'),
    async (req: Request, res: Response) => {
      if (!db) {
        return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      }

      try {
        const { scannedImei } = req.body;
        const result = await processAcceptCustody(db, req.params.id, scannedImei || '', req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[Accept Custody Error]:', error);
        return res.status(400).json({ success: false, error: error?.message || 'Lỗi xác nhận nhận máy.' });
      }
    }
  );

  /**
   * 3. POST /api/technical/work-orders/:id/start-task
   * KTV starts working on a task line
   */
  router.post(
    '/work-orders/:id/start-task',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'),
    async (req: Request, res: Response) => {
      if (!db) {
        return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      }

      try {
        const { lineId } = req.body;
        if (!lineId) {
          return res.status(400).json({ success: false, error: 'MISSING_LINE_ID' });
        }
        const result = await processStartTaskLine(db, req.params.id, lineId, req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[Start Task Error]:', error);
        return res.status(400).json({ success: false, error: error?.message || 'Lỗi bắt đầu công việc.' });
      }
    }
  );

  /**
   * 4. POST /api/technical/work-orders/:id/complete-task
   * KTV reports task line completed with evidence photos
   */
  router.post(
    '/work-orders/:id/complete-task',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'),
    async (req: Request, res: Response) => {
      if (!db) {
        return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      }

      try {
        const { lineId, evidencePhotoUrls, notes } = req.body;
        if (!lineId) {
          return res.status(400).json({ success: false, error: 'MISSING_LINE_ID' });
        }
        const result = await processCompleteTaskLine(db, req.params.id, lineId, evidencePhotoUrls, notes, req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[Complete Task Error]:', error);
        return res.status(400).json({ success: false, error: error?.message || 'Lỗi báo hoàn thành công việc.' });
      }
    }
  );

  /**
   * 5. POST /api/technical/work-orders/:id/parts/issue
   * Deduct spare part stock atomically
   */
  router.post(
    '/work-orders/:id/parts/issue',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN', 'INVENTORY_MANAGER'),
    async (req: Request, res: Response) => {
      if (!db) {
        return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      }

      try {
        const { lineId, partId, quantity = 1 } = req.body;
        if (!partId) {
          return res.status(400).json({ success: false, error: 'MISSING_PART_ID' });
        }
        const result = await processIssueSparePart(db, req.params.id, lineId || '', partId, Number(quantity), req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[Issue Spare Part Error]:', error);
        return res.status(400).json({ success: false, error: error?.message || 'Lỗi xuất linh kiện.' });
      }
    }
  );

  /**
   * 6. POST /api/technical/work-orders/:id/qc
   * Independent QC Inspection (Pass / Fail Rework)
   */
  router.post(
    '/work-orders/:id/qc',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD'),
    async (req: Request, res: Response) => {
      if (!db) {
        return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      }

      try {
        const result = await processQCInspection(db, req.params.id, req.body, req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[QC Inspection Error]:', error);
        const isForbidden = error?.message?.includes('QC_SELF_INSPECTION_FORBIDDEN') || error?.message?.includes('BRANCH_FORBIDDEN');
        return res.status(isForbidden ? 403 : 400).json({ success: false, error: error?.message || 'Lỗi nghiệm thu KCS.' });
      }
    }
  );

  /**
   * 7. POST /api/technical/work-orders/:id/return-to-stock
   * Main Warehouse Reception after QC PASS (Internal Prep & Refurb Only)
   */
  router.post(
    '/work-orders/:id/return-to-stock',
    requireRole('ADMIN', 'MANAGER', 'INVENTORY_MANAGER'),
    async (req: Request, res: Response) => {
      if (!db) {
        return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      }

      try {
        const { targetWarehouseId = 'KHO_TONG' } = req.body;
        const result = await processReturnToStock(db, req.params.id, targetWarehouseId, req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[Return to Stock Error]:', error);
        return res.status(400).json({ success: false, error: error?.message || 'Lỗi nhập kho thành phẩm.' });
      }
    }
  );

  /**
   * 8. POST /api/technical/work-orders/:id/deliver-customer
   * Deliver Repaired/Warranted Device to Customer
   */
  router.post(
    '/work-orders/:id/deliver-customer',
    requireRole('ADMIN', 'MANAGER', 'SALES', 'SALE', 'TECH_LEAD'),
    async (req: Request, res: Response) => {
      if (!db) {
        return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      }

      try {
        const { notes } = req.body;
        const result = await processDeliverToCustomer(db, req.params.id, notes || '', req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[Deliver Customer Error]:', error);
        return res.status(400).json({ success: false, error: error?.message || 'Lỗi bàn giao máy cho khách hàng.' });
      }
    }
  );

  /**
   * 9. GET /api/technical/my-work
   * Get all task lines assigned to authenticated technician
   */
  router.get('/my-work', async (req: Request, res: Response) => {
    if (!db) {
      return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    }

    try {
      const snap = await db.collection('technicalWorkOrderLines')
        .where('assigneeUid', '==', req.user!.uid)
        .limit(100)
        .get();

      const lines = snap.docs.map(doc => doc.data());
      return res.json({ success: true, data: lines });
    } catch (error: any) {
      console.error('[Get My Work Error]:', error);
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi tải danh sách công việc.' });
    }
  });

  return router;
}
