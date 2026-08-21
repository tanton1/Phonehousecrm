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
import { processAcceptTechnicalTransfer } from '../services/inventoryTransferService';
import crypto from 'crypto';

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
        const { scannedImei, preRepairInspection } = req.body;
        const workOrderSnap = await db.collection('technicalWorkOrders').doc(req.params.id).get();
        if (!workOrderSnap.exists) {
          return res.status(404).json({ success: false, error: `WORK_ORDER_NOT_FOUND: Không tìm thấy phiếu kỹ thuật "${req.params.id}".` });
        }
        const workOrder = workOrderSnap.data()!;
        if (workOrder.transferId) {
          const normalizedImei = String(scannedImei || '').trim();
          const stableKey = `tech-work-order-accept:${req.params.id}:${req.user!.uid}:${crypto.createHash('sha256').update(normalizedImei).digest('hex').slice(0, 16)}`;
          await processAcceptTechnicalTransfer(db, workOrder.transferId, [normalizedImei], stableKey, req.user!, { preRepairInspection });
          return res.json({ success: true, data: { success: true, workOrderId: req.params.id } });
        }
        const result = await processAcceptCustody(db, req.params.id, scannedImei || '', req.user!, preRepairInspection);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[Accept Custody Error]:', error);
        return res.status(400).json({ success: false, error: error?.message || 'Lỗi xác nhận nhận máy.' });
      }
    }
  );

  /**
   * Quick acknowledgement for a device explicitly dispatched from inventory
   * to the authenticated technician. The expected IMEI is read from the
   * authoritative work order, so the technician only needs to tick confirm.
   */
  router.post(
    '/work-orders/:id/quick-accept',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const workOrderSnap = await db.collection('technicalWorkOrders').doc(req.params.id).get();
        if (!workOrderSnap.exists) return res.status(404).json({ success: false, error: 'WORK_ORDER_NOT_FOUND' });
        const workOrder = workOrderSnap.data()!;
        if (!workOrder.transferId) throw new Error('QUICK_ACCEPT_ONLY_FOR_INVENTORY_TRANSFER');

        const workOrderLines = await db.collection('technicalWorkOrderLines')
          .where('workOrderId', '==', req.params.id)
          .get();
        const elevated = ['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(String(req.user!.role || '').toUpperCase());
        const isAssigned = workOrderLines.docs.some(line => line.data().assigneeUid === req.user!.uid);
        if (!isAssigned && !elevated) throw new Error('TECHNICIAN_NOT_ASSIGNED');

        const expectedImei = String(workOrder.imei || '').trim();
        if (!expectedImei) throw new Error('WORK_ORDER_IMEI_MISSING');
        const stableKey = `tech-quick-accept:${req.params.id}:${req.user!.uid}`;
        await processAcceptTechnicalTransfer(db, workOrder.transferId, [expectedImei], stableKey, req.user!, {
          preRepairInspection: req.body?.preRepairInspection
        });
        return res.json({ success: true, data: { success: true, workOrderId: req.params.id } });
      } catch (error: any) {
        console.error('[Quick Accept Custody Error]:', error);
        return res.status(400).json({ success: false, error: error?.message || 'Lỗi xác nhận nhanh nhận máy.' });
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
      const role = String(req.user!.role || '').toUpperCase();
      const canSeeQcQueue = ['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(role);
      const snap = canSeeQcQueue
        ? await db.collection('technicalWorkOrderLines').limit(200).get()
        : await db.collection('technicalWorkOrderLines').where('assigneeUid', '==', req.user!.uid).limit(100).get();

      const workOrderIds = [...new Set(snap.docs.map(doc => String(doc.data().workOrderId || '')).filter(Boolean))];
      const workOrderSnaps = workOrderIds.length > 0
        ? await db.getAll(...workOrderIds.map(id => db.collection('technicalWorkOrders').doc(id)))
        : [];
      const workOrders = new Map(workOrderSnaps.filter(item => item.exists).map(item => [item.id, item.data()!]));
      const assignedBranches = new Set([req.user!.branchId, ...(req.user!.assignedBranchIds || [])].filter(Boolean));
      const lines = snap.docs.filter(doc => {
        const line = doc.data();
        return line.status !== 'CANCELLED' && (role === 'ADMIN' || !canSeeQcQueue || assignedBranches.has(line.branchId));
      }).map(doc => {
        const line = doc.data();
        const workOrder = workOrders.get(String(line.workOrderId || '')) || {};
        return {
          id: doc.id,
          ...line,
          workOrderId: line.workOrderId,
          workOrderCode: workOrder.code || line.workOrderId,
          workOrderStatus: workOrder.status || line.status,
          workOrderType: workOrder.workOrderType,
          sourceWarehouseId: workOrder.sourceWarehouseId,
          transferId: workOrder.transferId || line.transferId,
          customerName: workOrder.customerName || '',
          customerPhone: workOrder.customerPhone || '',
          issueDescription: workOrder.notes || line.taskName || '',
          currentLocationId: workOrder.currentLocationId,
          currentCustodianUid: workOrder.currentCustodianUid
        };
      }).sort((a: any, b: any) => String(a.deadlineAt || a.createdAt || '').localeCompare(String(b.deadlineAt || b.createdAt || '')));
      return res.json({ success: true, data: lines });
    } catch (error: any) {
      console.error('[Get My Work Error]:', error);
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi tải danh sách công việc.' });
    }
  });

  return router;
}
