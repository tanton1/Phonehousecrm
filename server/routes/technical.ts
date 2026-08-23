import { Router, Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import { requireBranchAccess } from '../middleware/requireBranchAccess';
import {
  processCreateWorkOrder,
  processAttachIntakeEvidence,
  processAcceptCustody,
  processAcceptTechnicalHandoff,
  processStartTaskLine,
  processMarkTaskWaitingForParts,
  processCreateTechnicalTaskAdditionRequest,
  processDecideTechnicalTaskAdditionRequest,
  processCompleteTaskLine,
  processQCInspection,
  processReturnToStock,
  processRequestTechnicalHandoff,
  processDeliverToCustomer,
  isTechnicalEvidenceUrlForWorkOrder
} from '../services/technicalService';
import {
  getTechnicalCostBreakdown,
  listTechnicalSpareParts,
  processAddTechnicalExternalCost,
  processAddTechnicalRecovery,
  processApproveTechnicalExternalCost,
  processApproveTechnicalRecovery,
  processConsumeTechnicalPart,
  processCancelTechnicalPartReservation,
  processCancelTechnicalPartIssue,
  processCreateTechnicalPartException,
  processCreateTechnicalPartStockRequest,
  processDecideTechnicalPartException,
  processDecideTechnicalPartStockRequest,
  processFinalizeTechnicalCost,
  processIssueTechnicalPart,
  processReceiveTechnicalSparePart,
  processReserveTechnicalPart,
  processReturnTechnicalPart,
  processScrapTechnicalPart,
  listTechnicalPartStockRequests,
  getTechnicalSparePartTrace
} from '../services/technicalCostService';
import { processAcceptTechnicalTransfer } from '../services/inventoryTransferService';
import crypto from 'crypto';
import { revealTechnicalPasscode } from '../services/technicalSecretService';

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
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN', 'INVENTORY_MANAGER', 'WAREHOUSE', 'STORE_MANAGER', 'SALES', 'CASHIER', 'ACCOUNTANT'),
    requireBranchAccess(),
    async (req: Request, res: Response) => {
      if (!db) {
        return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      }

      try {
        const requestedType = String(req.body?.workOrderType || '').toUpperCase();
        const actorRole = String(req.user!.role || '').toUpperCase();
        const isCustomerRepair = ['CUSTOMER_SERVICE', 'WARRANTY'].includes(requestedType);
        if (isCustomerRepair && !['ADMIN', 'MANAGER', 'SALES', 'SALE', 'CASHIER'].includes(actorRole)) {
          return res.status(403).json({ success: false, error: 'RETAIL_REPAIR_SALES_ONLY: Phiếu sửa chữa lẻ và bảo hành phải do bộ phận bán hàng hoặc quản lý tiếp nhận.' });
        }
        const result = await processCreateWorkOrder(db, req.body, req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[Create WorkOrder Error]:', error);
        return res.status(400).json({ success: false, error: error?.message || 'Lỗi tạo phiếu kỹ thuật.' });
      }
    }
  );

  router.post(
    '/work-orders/:id/intake-evidence',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN', 'INVENTORY_MANAGER', 'WAREHOUSE', 'STORE_MANAGER', 'SALES', 'CASHIER', 'ACCOUNTANT'),
    requireBranchAccess(),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const result = await processAttachIntakeEvidence(db, req.params.id, req.body?.intakePhotoUrls, req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        return res.status(/FORBIDDEN/.test(error?.message || '') ? 403 : 400).json({ success: false, error: error?.message || 'Không thể lưu ảnh tiếp nhận.' });
      }
    }
  );

  router.get(
    '/work-orders/:id/passcode',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const result = await revealTechnicalPasscode(db, req.params.id, req.user!);
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        return res.json({ success: true, data: result });
      } catch (error: any) {
        return res.status(/DENIED|FORBIDDEN/.test(error?.message || '') ? 403 : 400).json({ success: false, error: error?.message || 'Không thể xem mật mã mở máy.' });
      }
    }
  );

  router.post('/work-orders/:id/handoffs', requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processRequestTechnicalHandoff(db, req.params.id, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(/FORBIDDEN/.test(error?.message || '') ? 403 : 400).json({ success: false, error: error?.message || 'Lỗi tạo bàn giao KTV.' });
    }
  });

  router.post('/handoffs/:handoffId/accept', requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processAcceptTechnicalHandoff(db, req.params.handoffId, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(/FORBIDDEN|TARGET_ONLY/.test(error?.message || '') ? 403 : 400).json({ success: false, error: error?.message || 'Lỗi nhận bàn giao KTV.' });
    }
  });

  router.get('/handoffs/pending', requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const snapshot = await db.collection('technicalCustodyHandovers')
        .where('targetTechnicianUid', '==', req.user!.uid)
        .where('status', '==', 'PENDING_ACCEPTANCE')
        .limit(50)
        .get();
      const handoffs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.json({ success: true, data: handoffs });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi tải bàn giao KTV đang chờ.' });
    }
  });

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
        const handoverPhotoUrls = Array.isArray(preRepairInspection?.handoverPhotoUrls) ? preRepairInspection.handoverPhotoUrls : [];
        if (!preRepairInspection || handoverPhotoUrls.length > 6 || handoverPhotoUrls.some((url: unknown) => !isTechnicalEvidenceUrlForWorkOrder(url, req.params.id))) {
          return res.status(400).json({ success: false, error: 'PRE_REPAIR_INSPECTION_INVALID: Checklist nhận máy không hợp lệ. Ảnh là tùy chọn.' });
        }
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

  /** Mark only one task as waiting for a part; other tasks on the same
   * device remain actionable in the Kanban. */
  router.post(
    '/work-orders/:id/waiting-parts',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const { lineId, reason, idempotencyKey } = req.body || {};
        if (!lineId) return res.status(400).json({ success: false, error: 'MISSING_LINE_ID' });
        const result = await processMarkTaskWaitingForParts(db, req.params.id, lineId, reason, req.user!, idempotencyKey);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        return res.status(400).json({ success: false, error: error?.message || 'Không thể chuyển task sang chờ linh kiện.' });
      }
    }
  );

  /** KTV reports an additional fault.  Approval is separate so no extra
   * commission, cost or customer amount can be inserted silently. */
  router.post(
    '/work-orders/:id/task-additions',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const result = await processCreateTechnicalTaskAdditionRequest(db, req.params.id, req.body || {}, req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        return res.status(400).json({ success: false, error: error?.message || 'Không thể gửi lỗi phát sinh.' });
      }
    }
  );

  router.post(
    '/work-orders/:id/task-additions/:requestId/decision',
    requireRole('ADMIN', 'MANAGER', 'TECH_LEAD'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const result = await processDecideTechnicalTaskAdditionRequest(db, req.params.id, req.params.requestId, req.body || {}, req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        return res.status(400).json({ success: false, error: error?.message || 'Không thể duyệt lỗi phát sinh.' });
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
        const { lineId, evidencePhotoUrls, notes, completionMetadata } = req.body;
        if (!lineId) {
          return res.status(400).json({ success: false, error: 'MISSING_LINE_ID' });
        }
        const result = await processCompleteTaskLine(db, req.params.id, lineId, evidencePhotoUrls, notes, req.user!, completionMetadata);
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
        const { lineId, partId, warehouseId, lotId, reservationId, exceptionApprovalId, quantity = 1, idempotencyKey } = req.body;
        const result = await processIssueTechnicalPart(db, req.params.id, {
          lineId, partId, warehouseId, lotId, reservationId, exceptionApprovalId, quantity: Number(quantity), idempotencyKey
        }, req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[Issue Spare Part Error]:', error);
        return res.status(400).json({ success: false, error: error?.message || 'Lỗi xuất linh kiện.' });
      }
    }
  );

  router.post('/work-orders/:id/parts/reserve', requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN', 'INVENTORY_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processReserveTechnicalPart(db, req.params.id, {
        ...req.body,
        quantity: Number(req.body?.quantity)
      }, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi giữ trước linh kiện.' });
    }
  });

  router.post('/work-orders/:id/parts/exceptions', requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN', 'INVENTORY_MANAGER', 'WAREHOUSE'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processCreateTechnicalPartException(db, req.params.id, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Không thể tạo yêu cầu ngoại lệ linh kiện.' });
    }
  });

  router.post('/work-orders/:id/parts/exceptions/:exceptionId/decision', requireRole('ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'WAREHOUSE'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processDecideTechnicalPartException(db, req.params.id, req.params.exceptionId, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Không thể duyệt ngoại lệ linh kiện.' });
    }
  });

  router.post('/work-orders/:id/parts/reservations/:reservationId/cancel', requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN', 'INVENTORY_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processCancelTechnicalPartReservation(db, req.params.id, req.params.reservationId, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi hủy giữ linh kiện.' });
    }
  });

  router.post('/work-orders/:id/parts/:issueId/consume', requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processConsumeTechnicalPart(db, req.params.id, req.params.issueId, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi xác nhận linh kiện đã dùng.' });
    }
  });

  router.post('/work-orders/:id/parts/:issueId/return', requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processReturnTechnicalPart(db, req.params.id, req.params.issueId, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi trả linh kiện về kho.' });
    }
  });

  router.post('/work-orders/:id/parts/:issueId/scrap', requireRole('ADMIN', 'MANAGER', 'TECH_LEAD'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processScrapTechnicalPart(db, req.params.id, req.params.issueId, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi ghi nhận linh kiện hỏng.' });
    }
  });

  router.post('/work-orders/:id/parts/:issueId/cancel', requireRole('ADMIN', 'MANAGER', 'TECH_LEAD'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processCancelTechnicalPartIssue(db, req.params.id, req.params.issueId, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi hủy phiếu xuất linh kiện.' });
    }
  });

  router.post('/work-orders/:id/external-costs', requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processAddTechnicalExternalCost(db, req.params.id, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi ghi nhận chi phí kỹ thuật.' });
    }
  });

  router.post('/work-orders/:id/external-costs/:costId/decision', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processApproveTechnicalExternalCost(db, req.params.id, req.params.costId, req.body?.decision, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi duyệt chi phí kỹ thuật.' });
    }
  });

  router.post('/work-orders/:id/recoveries', requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processAddTechnicalRecovery(db, req.params.id, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi ghi nhận khoản bồi hoàn kỹ thuật.' });
    }
  });

  router.post('/work-orders/:id/recoveries/:recoveryId/decision', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processApproveTechnicalRecovery(db, req.params.id, req.params.recoveryId, req.body?.decision, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi duyệt khoản bồi hoàn kỹ thuật.' });
    }
  });

  router.get('/work-orders/:id/cost-breakdown', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECH_LEAD', 'TECH', 'TECHNICIAN', 'INVENTORY_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await getTechnicalCostBreakdown(db, req.params.id, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi tải giá vốn kỹ thuật.' });
    }
  });

  router.post('/work-orders/:id/finalize-cost', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processFinalizeTechnicalCost(db, req.params.id, req.body?.idempotencyKey, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi chốt giá vốn kỹ thuật.' });
    }
  });

  router.get('/parts', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECH_LEAD', 'TECH', 'TECHNICIAN', 'INVENTORY_MANAGER', 'WAREHOUSE'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await listTechnicalSpareParts(db, req.user!, String(req.query.warehouseId || '') || undefined);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi tải kho linh kiện.' });
    }
  });

  router.get('/parts/:partId/trace', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECH_LEAD', 'TECH', 'TECHNICIAN', 'INVENTORY_MANAGER', 'WAREHOUSE'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await getTechnicalSparePartTrace(db, req.params.partId, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Không thể tải lịch sử linh kiện.' });
    }
  });

  router.post('/parts/receive', requireRole('ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'WAREHOUSE', 'TECH_LEAD'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processReceiveTechnicalSparePart(db, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Lỗi nhập kho linh kiện.' });
    }
  });

  router.get('/parts/requests', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'WAREHOUSE', 'TECH_LEAD', 'TECH', 'TECHNICIAN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await listTechnicalPartStockRequests(db, req.user!, String(req.query.status || '') || undefined);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Không thể tải yêu cầu cấp linh kiện.' });
    }
  });

  router.post('/parts/requests', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'WAREHOUSE', 'TECH_LEAD', 'TECH', 'TECHNICIAN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processCreateTechnicalPartStockRequest(db, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Không thể tạo yêu cầu cấp linh kiện.' });
    }
  });

  router.post('/parts/requests/:requestId/decision', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'WAREHOUSE'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processDecideTechnicalPartStockRequest(db, req.params.requestId, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Không thể duyệt yêu cầu cấp linh kiện.' });
    }
  });

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
        const { targetWarehouseId, scannedImei } = req.body;
        const result = await processReturnToStock(db, req.params.id, targetWarehouseId, scannedImei, req.user!);
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
        const { notes, payment } = req.body;
        const result = await processDeliverToCustomer(db, req.params.id, notes || '', req.user!, payment);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[Deliver Customer Error]:', error);
        return res.status(400).json({ success: false, error: error?.message || 'Lỗi bàn giao máy cho khách hàng.' });
      }
    }
  );

  /**
   * GET /api/technical/commissions?period=YYYY-MM
   * Server-redacted source of truth for technician wallets and payroll previews.
   */
  router.get('/commissions', async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const requestedPeriod = String(req.query.period || new Date().toISOString().slice(0, 7));
      if (!/^\d{4}-\d{2}$/.test(requestedPeriod)) {
        return res.status(400).json({ success: false, error: 'INVALID_PAYROLL_PERIOD' });
      }
      const snapshot = await db.collection('commissionLedger')
        .where('payrollPeriod', '==', requestedPeriod)
        .limit(1000)
        .get();
      const role = String(req.user!.role || '').toUpperCase();
      const canReviewBranch = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECH_LEAD'].includes(role);
      const allowedBranches = new Set([req.user!.branchId, ...(req.user!.assignedBranchIds || [])].filter(Boolean));
      const serializeDate = (value: any): string | null => {
        if (!value) return null;
        if (typeof value === 'string') return value;
        if (typeof value.toDate === 'function') return value.toDate().toISOString();
        return null;
      };
      const entries = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(entry => {
          if (!canReviewBranch) return entry.staffUid === req.user!.uid;
          if (role === 'ADMIN') return true;
          return allowedBranches.has(entry.branchId);
        })
        .map(entry => ({
          ...entry,
          createdAt: serializeDate(entry.createdAt),
          eligibleAt: serializeDate(entry.eligibleAt),
          paidAt: serializeDate(entry.paidAt),
          updatedAt: serializeDate(entry.updatedAt)
        }))
        .sort((left, right) => String(right.eligibleAt || right.createdAt || '').localeCompare(String(left.eligibleAt || left.createdAt || '')));
      return res.json({ success: true, data: entries });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Không thể tải sổ hoa hồng kỹ thuật.' });
    }
  });

  /**
   * GET /api/technical/reports/repair-revenue?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Revenue is recognized only when a customer-owned device has actually been
   * handed back. This keeps the report aligned with the receipt/fund ledger.
   */
  router.get('/reports/repair-revenue', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'SALE', 'CASHIER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const role = String(req.user!.role || '').toUpperCase();
      const allowedBranches = new Set([req.user!.branchId, ...(req.user!.assignedBranchIds || [])].filter(Boolean));
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? `${req.query.from}T00:00:00.000Z` : '';
      const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || '')) ? `${req.query.to}T23:59:59.999Z` : '';
      const serializeDate = (value: any): string => {
        if (!value) return '';
        if (typeof value === 'string') return value;
        if (typeof value.toDate === 'function') return value.toDate().toISOString();
        return '';
      };
      const snapshot = await db.collection('technicalWorkOrders').limit(1000).get();
      const items = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(item => {
          if (!['CUSTOMER_SERVICE', 'WARRANTY'].includes(String(item.workOrderType || ''))) return false;
          if (String(item.status || '') !== 'DELIVERED_TO_CUSTOMER') return false;
          if (role !== 'ADMIN' && !allowedBranches.has(item.branchId)) return false;
          const deliveredAt = serializeDate(item.deliveredAt);
          return (!from || deliveredAt >= from) && (!to || deliveredAt <= to);
        })
        .map(item => {
          const finalAmount = Number(item.finalServiceAmount ?? item.customerApprovedQuote ?? item.totalEstimatedCost ?? 0);
          const paidAmount = Number(item.paidAmount || 0);
          return {
            workOrderId: item.id,
            code: item.code || item.id,
            branchId: item.branchId || '',
            type: item.workOrderType,
            customerName: item.customerName || 'Khách lẻ',
            customerPhone: item.customerPhone || '',
            imei: item.imei || '',
            model: item.model || 'Thiết bị',
            deliveredAt: serializeDate(item.deliveredAt),
            finalAmount,
            paidAmount,
            balanceDue: Math.max(0, Number(item.balanceDue ?? finalAmount - paidAmount)),
            paymentStatus: item.paymentStatus || (paidAmount >= finalAmount ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID'),
            paymentMethod: item.paymentMethod || 'DEBT',
            deliveryNotes: item.deliveryNotes || ''
          };
        })
        .sort((left, right) => String(right.deliveredAt).localeCompare(String(left.deliveredAt)));
      const summary = items.reduce((total, item) => ({
        deliveredCount: total.deliveredCount + 1,
        warrantyCount: total.warrantyCount + (item.type === 'WARRANTY' ? 1 : 0),
        serviceRevenue: total.serviceRevenue + item.finalAmount,
        cashCollected: total.cashCollected + item.paidAmount,
        outstanding: total.outstanding + item.balanceDue
      }), { deliveredCount: 0, warrantyCount: 0, serviceRevenue: 0, cashCollected: 0, outstanding: 0 });
      return res.json({ success: true, data: { from: String(req.query.from || ''), to: String(req.query.to || ''), summary, items } });
    } catch (error: any) {
      console.error('[Repair Revenue Report Error]:', error);
      return res.status(400).json({ success: false, error: error?.message || 'Không thể tải báo cáo sửa chữa.' });
    }
  });

  /**
   * GET /api/technical/retail-repairs
   * Sales-facing branch queue. A repair is always a customer-owned technical
   * work order; task lines are returned only as progress, never as separate
   * sales cards.
   */
  router.get('/retail-repairs', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'SALE', 'CASHIER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const role = String(req.user!.role || '').toUpperCase();
      const allowedBranches = new Set([req.user!.branchId, ...(req.user!.assignedBranchIds || [])].filter(Boolean));
      const serializeDate = (value: any): string => {
        if (!value) return '';
        if (typeof value === 'string') return value;
        if (typeof value.toDate === 'function') return value.toDate().toISOString();
        return '';
      };
      const workOrderSnapshot = await db.collection('technicalWorkOrders').limit(1000).get();
      const workOrders = workOrderSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(item => ['CUSTOMER_SERVICE', 'WARRANTY'].includes(String(item.workOrderType || '')))
        .filter(item => role === 'ADMIN' || allowedBranches.has(String(item.branchId || '')))
        .filter(item => String(item.status || '') !== 'CANCELLED');
      const lineIds = [...new Set(workOrders.flatMap(item => Array.isArray(item.taskLineIds) ? item.taskLineIds : []).map(String).filter(Boolean))];
      const lineSnapshots = lineIds.length ? await db.getAll(...lineIds.map(id => db.collection('technicalWorkOrderLines').doc(id))) : [];
      const linesByOrder = new Map<string, any[]>();
      lineSnapshots.filter(snapshot => snapshot.exists).forEach(snapshot => {
        const line = { id: snapshot.id, ...snapshot.data() } as any;
        const key = String(line.workOrderId || '');
        linesByOrder.set(key, [...(linesByOrder.get(key) || []), line]);
      });
      const getStage = (workOrder: any, lines: any[]) => {
        const status = String(workOrder.status || 'ASSIGNED');
        const openLineStatuses = lines
          .map(line => String(line.status || 'ASSIGNED'))
          .filter(lineStatus => !['COMPLETED', 'VERIFIED'].includes(lineStatus));
        const allOpenTasksWaitingForParts = openLineStatuses.length > 0 && openLineStatuses.every(lineStatus => lineStatus === 'WAITING_PARTS');
        if (status === 'DELIVERED_TO_CUSTOMER') return 'COMPLETED';
        if (['QC_PASSED', 'CUSTOMER_READY'].includes(status)) return 'WAITING_DELIVERY';
        if (['TECH_COMPLETED', 'QC_PENDING'].includes(status)) return 'WAITING_QC';
        if (allOpenTasksWaitingForParts) return 'WAITING_PARTS';
        if (status === 'ASSIGNED' || lines.every(line => String(line.status || '') === 'ASSIGNED')) return 'WAITING_ACCEPTANCE';
        return 'IN_PROGRESS';
      };
      const items = workOrders.map(workOrder => {
        const lines = (linesByOrder.get(workOrder.id) || []).map(line => ({
          id: line.id,
          taskName: line.taskName || line.taskType || 'Việc kỹ thuật',
          status: line.status || 'ASSIGNED',
          assigneeUid: line.assigneeUid || '',
          assigneeName: line.assigneeName || '',
          deadlineAt: serializeDate(line.deadlineAt)
        }));
        const finalAmount = Number(workOrder.finalServiceAmount ?? workOrder.customerApprovedQuote ?? workOrder.totalEstimatedCost ?? 0);
        const paidAmount = Number(workOrder.paidAmount || 0);
        return {
          id: workOrder.id,
          code: workOrder.code || workOrder.id,
          branchId: workOrder.branchId || '',
          type: workOrder.workOrderType,
          status: workOrder.status || 'ASSIGNED',
          stage: getStage(workOrder, lines),
          customerName: workOrder.customerName || 'Khách lẻ',
          customerPhone: workOrder.customerPhone || '',
          imei: workOrder.imei || '',
          model: workOrder.model || 'Thiết bị',
          receivedAt: serializeDate(workOrder.receivedAt || workOrder.createdAt),
          expectedReturnDate: serializeDate(workOrder.expectedReturnDate),
          deliveredAt: serializeDate(workOrder.deliveredAt),
          finalAmount,
          paidAmount,
          balanceDue: Math.max(0, Number(workOrder.balanceDue ?? finalAmount - paidAmount)),
          paymentStatus: workOrder.paymentStatus || (paidAmount >= finalAmount ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID'),
          paymentMethod: workOrder.paymentMethod || 'DEBT',
          taskLines: lines
        };
      }).sort((left, right) => String(right.receivedAt || right.deliveredAt).localeCompare(String(left.receivedAt || left.deliveredAt)));
      const summary = items.reduce((total, item) => ({
        receivedCount: total.receivedCount + 1,
        inProgressCount: total.inProgressCount + (['WAITING_ACCEPTANCE', 'IN_PROGRESS', 'WAITING_PARTS', 'WAITING_QC'].includes(item.stage) ? 1 : 0),
        waitingDeliveryCount: total.waitingDeliveryCount + (item.stage === 'WAITING_DELIVERY' ? 1 : 0),
        deliveredCount: total.deliveredCount + (item.stage === 'COMPLETED' ? 1 : 0),
        serviceRevenue: total.serviceRevenue + (item.stage === 'COMPLETED' ? item.finalAmount : 0),
        cashCollected: total.cashCollected + (item.stage === 'COMPLETED' ? item.paidAmount : 0),
        outstanding: total.outstanding + (item.stage === 'COMPLETED' ? item.balanceDue : 0),
        warrantyCount: total.warrantyCount + (item.type === 'WARRANTY' ? 1 : 0)
      }), { receivedCount: 0, inProgressCount: 0, waitingDeliveryCount: 0, deliveredCount: 0, serviceRevenue: 0, cashCollected: 0, outstanding: 0, warrantyCount: 0 });
      return res.json({ success: true, data: { summary, items } });
    } catch (error: any) {
      console.error('[Retail Repair Queue Error]:', error);
      return res.status(400).json({ success: false, error: error?.message || 'Không thể tải danh sách sửa chữa lẻ.' });
    }
  });

  /**
   * GET /api/technical/my-work
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
      const mayViewCost = ['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(role);
      const lines = snap.docs.filter(doc => {
        const line = doc.data();
        return line.status !== 'CANCELLED' && (role === 'ADMIN' || !canSeeQcQueue || assignedBranches.has(line.branchId));
      }).map(doc => {
        const rawLine = doc.data();
        const line = mayViewCost ? rawLine : (() => {
          const {
            laborCostToDevice: _laborCostToDevice,
            capitalizeLaborCost: _capitalizeLaborCost,
            ...operationalLine
          } = rawLine;
          return operationalLine;
        })();
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
