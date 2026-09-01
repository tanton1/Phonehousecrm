import { Router, Request, Response } from 'express';
import { FieldPath, Firestore } from 'firebase-admin/firestore';
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
  processRequestTechnicalQuoteAdjustment,
  processDecideTechnicalQuoteAdjustment,
  processDeliverToCustomer,
  processCollectTechnicalDebtPayment,
  deriveTechnicalBoardStage,
  deriveTechnicalAllowedActions,
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
import { getVietnamDayUtcRange, getVietnamMonthString } from '../../shared/vietnamTime';
import { syncCustomerWorkOrderNotification } from '../services/customerPortalService';

function notifyCustomerRepair(db: Firestore, workOrderId: string, eventHint: string) {
  void syncCustomerWorkOrderNotification(db, workOrderId, eventHint)
    .catch(error => console.warn('[Customer repair notification]', { workOrderId, eventHint, error: error?.message || error }));
}

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
        notifyCustomerRepair(db, req.params.id, `TASK_STARTED:${lineId}`);
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
        notifyCustomerRepair(db, req.params.id, `WAITING_PARTS:${lineId}`);
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
        notifyCustomerRepair(db, req.params.id, `TASK_COMPLETED:${lineId}`);
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

  router.post('/parts/receive', requireRole('ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'WAREHOUSE'), async (req: Request, res: Response) => {
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
        notifyCustomerRepair(db, req.params.id, `QC:${String(req.body?.overallResult || '')}`);
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
    '/work-orders/:id/quote-adjustments',
    requireRole('ADMIN', 'MANAGER', 'SALES', 'SALE', 'CASHIER'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        return res.json({ success: true, data: await processRequestTechnicalQuoteAdjustment(db, req.params.id, req.body || {}, req.user!) });
      } catch (error: any) {
        return res.status(400).json({ success: false, error: error?.message || 'Không thể gửi duyệt báo giá.' });
      }
    }
  );

  router.post(
    '/work-orders/:id/quote-adjustments/:adjustmentId/decision',
    requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const result = await processDecideTechnicalQuoteAdjustment(db, req.params.id, req.params.adjustmentId, req.body || {}, req.user!);
        notifyCustomerRepair(db, req.params.id, `QUOTE:${String(req.body?.decision || '')}`);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        return res.status(400).json({ success: false, error: error?.message || 'Không thể duyệt báo giá.' });
      }
    }
  );

  router.post(
    '/work-orders/:id/deliver-customer',
    requireRole('ADMIN', 'MANAGER', 'SALES', 'SALE', 'CASHIER'),
    async (req: Request, res: Response) => {
      if (!db) {
        return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      }

      try {
        const { notes, payment } = req.body;
        const result = await processDeliverToCustomer(db, req.params.id, notes || '', req.user!, payment);
        notifyCustomerRepair(db, req.params.id, 'DELIVERED');
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[Deliver Customer Error]:', error);
        return res.status(400).json({ success: false, error: error?.message || 'Lỗi bàn giao máy cho khách hàng.' });
      }
    }
  );

  router.post(
    '/work-orders/:id/payments',
    requireRole('ADMIN', 'MANAGER', 'SALES', 'SALE', 'CASHIER'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        return res.json({ success: true, data: await processCollectTechnicalDebtPayment(db, req.params.id, req.body || {}, req.user!) });
      } catch (error: any) {
        return res.status(400).json({ success: false, error: error?.message || 'Không thể thu công nợ sửa chữa.' });
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
      const requestedPeriod = String(req.query.period || getVietnamMonthString());
      if (!/^\d{4}-\d{2}$/.test(requestedPeriod)) {
        return res.status(400).json({ success: false, error: 'INVALID_PAYROLL_PERIOD' });
      }
      const [eligibleSnapshot, pendingSnapshot] = await Promise.all([
        db.collection('commissionLedger').where('payrollPeriod', '==', requestedPeriod).limit(1000).get(),
        db.collection('commissionLedger').where('assignedPeriod', '==', requestedPeriod).where('status', '==', 'PENDING').limit(1000).get()
      ]);
      const role = String(req.user!.role || '').toUpperCase();
      const canReviewBranch = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECH_LEAD'].includes(role);
      const allowedBranches = new Set([req.user!.branchId, ...(req.user!.assignedBranchIds || [])].filter(Boolean));
      const serializeDate = (value: any): string | null => {
        if (!value) return null;
        if (typeof value === 'string') return value;
        if (typeof value.toDate === 'function') return value.toDate().toISOString();
        return null;
      };
      const uniqueDocs = new Map([...eligibleSnapshot.docs, ...pendingSnapshot.docs].map(doc => [doc.id, doc]));
      const entries = [...uniqueDocs.values()]
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
      const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? String(req.query.from) : '';
      const toDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || '')) ? String(req.query.to) : '';
      const from = fromDate ? getVietnamDayUtcRange(fromDate).startUtc : '';
      const to = toDate ? getVietnamDayUtcRange(toDate).endUtc : '';
      const serializeDate = (value: any): string => {
        if (!value) return '';
        if (typeof value === 'string') return value;
        if (typeof value.toDate === 'function') return value.toDate().toISOString();
        return '';
      };
      const requestedBranchId = String(req.query.branchId || req.user!.branchId || '').trim();
      if (!requestedBranchId) throw new Error('BRANCH_REQUIRED');
      if (role !== 'ADMIN' && !allowedBranches.has(requestedBranchId)) throw new Error('BRANCH_FORBIDDEN');
      let reportQuery: FirebaseFirestore.Query = db.collection('technicalWorkOrders')
        .where('branchId', '==', requestedBranchId)
        .where('status', '==', 'DELIVERED_TO_CUSTOMER');
      if (from) reportQuery = reportQuery.where('deliveredAt', '>=', from);
      if (to) reportQuery = reportQuery.where('deliveredAt', '<=', to);
      const snapshot = await reportQuery.orderBy('deliveredAt', 'desc').limit(500).get();
      const items = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(item => {
          if (!['CUSTOMER_SERVICE', 'WARRANTY'].includes(String(item.workOrderType || ''))) return false;
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
      const requestedBranchId = String(req.query.branchId || req.user!.branchId || '').trim();
      if (!requestedBranchId) throw new Error('BRANCH_REQUIRED');
      if (role !== 'ADMIN' && !allowedBranches.has(requestedBranchId)) throw new Error('BRANCH_FORBIDDEN');
      const workOrderSnapshot = await db.collection('technicalWorkOrders')
        .where('branchId', '==', requestedBranchId)
        .where('workOrderType', 'in', ['CUSTOMER_SERVICE', 'WARRANTY'])
        .orderBy('receivedAt', 'desc')
        .limit(500)
        .get();
      const workOrders = workOrderSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(item => String(item.status || '') !== 'CANCELLED');
      const lineIds = [...new Set(workOrders.flatMap(item => Array.isArray(item.taskLineIds) ? item.taskLineIds : []).map(String).filter(Boolean))];
      const lineSnapshots = lineIds.length ? await db.getAll(...lineIds.map(id => db.collection('technicalWorkOrderLines').doc(id))) : [];
      const linesByOrder = new Map<string, any[]>();
      lineSnapshots.filter(snapshot => snapshot.exists).forEach(snapshot => {
        const line = { id: snapshot.id, ...snapshot.data() } as any;
        const key = String(line.workOrderId || '');
        linesByOrder.set(key, [...(linesByOrder.get(key) || []), line]);
      });
      const items = workOrders.map(workOrder => {
        const lines = (linesByOrder.get(workOrder.id) || []).map(line => ({
          id: line.id,
          taskName: line.taskName || line.taskType || 'Việc kỹ thuật',
          status: line.status || 'ASSIGNED',
          assigneeUid: line.assigneeUid || '',
          assigneeName: line.assigneeName || '',
          deadlineAt: serializeDate(line.deadlineAt)
        }));
        const finalAmount = Number(workOrder.approvedFinalAmount ?? (workOrder.workOrderType === 'WARRANTY' ? 0 : 0));
        const paidAmount = Number(workOrder.paidAmount || 0);
        return {
          id: workOrder.id,
          code: workOrder.code || workOrder.id,
          branchId: workOrder.branchId || '',
          type: workOrder.workOrderType,
          status: workOrder.status || 'ASSIGNED',
          stage: deriveTechnicalBoardStage(workOrder, lines),
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
          quoteStatus: workOrder.quoteStatus || (workOrder.workOrderType === 'WARRANTY' ? 'NOT_REQUIRED' : 'PENDING_APPROVAL'),
          approvedFinalAmount: workOrder.approvedFinalAmount ?? null,
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
   * GET /api/technical/workspace
   * Canonical, branch-scoped Kanban projection. Frontend receives the next
   * action and allowed actions from the server instead of rebuilding policy.
   */
  router.get('/workspace', async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const role = String(req.user!.role || '').toUpperCase();
      const scope = String(req.query.scope || 'mine') === 'branch' ? 'branch' : 'mine';
      const branchId = String(req.query.branchId || req.user!.branchId || '').trim();
      const branchRoles = ['ADMIN', 'MANAGER', 'TECH_LEAD', 'INVENTORY_MANAGER', 'WAREHOUSE'];
      if (scope === 'branch' && !branchRoles.includes(role)) throw new Error('TECHNICAL_WORKSPACE_BRANCH_FORBIDDEN');
      if (!branchId) throw new Error('BRANCH_REQUIRED');
      const allowedBranches = new Set([req.user!.branchId, ...(req.user!.assignedBranchIds || [])].filter(Boolean));
      if (role !== 'ADMIN' && !allowedBranches.has(branchId)) throw new Error('BRANCH_FORBIDDEN');
      const activeStatuses = ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'REWORK_REQUIRED'];
      const pageSize = Math.min(50, Math.max(10, Number(req.query.pageSize || 30)));
      let lineQuery: FirebaseFirestore.Query = scope === 'mine'
        ? db.collection('technicalWorkOrderLines').where('assigneeUid', '==', req.user!.uid).where('status', 'in', activeStatuses)
        : db.collection('technicalWorkOrderLines').where('branchId', '==', branchId).where('status', 'in', activeStatuses);
      lineQuery = lineQuery.orderBy('deadlineAt', 'asc').orderBy(FieldPath.documentId(), 'asc');
      const cursor = String(req.query.cursor || '').trim();
      if (cursor) {
        try {
          const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
          if (!parsed || typeof parsed.deadlineAt !== 'string' || typeof parsed.id !== 'string') throw new Error('CURSOR_INVALID');
          lineQuery = lineQuery.startAfter(parsed.deadlineAt, parsed.id);
        } catch {
          throw new Error('CURSOR_INVALID');
        }
      }
      const lineSnap = await lineQuery.limit(pageSize + 1).get();
      const pageDocs = lineSnap.docs.slice(0, pageSize);
      const hasMore = lineSnap.docs.length > pageSize;
      const workOrderIds = [...new Set(pageDocs.map(doc => String(doc.data().workOrderId || '')).filter(Boolean))];
      const woSnaps = workOrderIds.length ? await db.getAll(...workOrderIds.map(id => db.collection('technicalWorkOrders').doc(id))) : [];
      const woMap = new Map(woSnaps.filter(snap => snap.exists).map(snap => [snap.id, { id: snap.id, ...snap.data() } as any]));
      const completeLineIds = [...new Set(woSnaps.flatMap(snap => {
        const data = snap.exists ? snap.data() : null;
        return Array.isArray(data?.taskLineIds) ? data.taskLineIds.map(String) : [];
      }).filter(Boolean))];
      const completeLineSnaps = completeLineIds.length
        ? await db.getAll(...completeLineIds.map(id => db.collection('technicalWorkOrderLines').doc(id)))
        : [];
      const projectionDocsById = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      pageDocs.forEach(doc => projectionDocsById.set(doc.id, doc));
      completeLineSnaps.filter(snap => snap.exists).forEach(doc => projectionDocsById.set(doc.id, doc));
      const projectionDocs = [...projectionDocsById.values()];
      const linesByWo = new Map<string, any[]>();
      projectionDocs.forEach(doc => {
        const line = { id: doc.id, ...doc.data() } as any;
        const key = String(line.workOrderId || '');
        linesByWo.set(key, [...(linesByWo.get(key) || []), line]);
      });
      const nowMs = Date.now();
      const items = [...linesByWo.entries()].map(([workOrderId, lines]) => {
        const wo = woMap.get(workOrderId) || { id: workOrderId, branchId };
        const deadlineAt = lines.map(line => String(line.deadlineAt || '')).filter(Boolean).sort()[0] || '';
        const minutesRemaining = deadlineAt ? Math.round((Date.parse(deadlineAt) - nowMs) / 60_000) : null;
        const stage = deriveTechnicalBoardStage(wo, lines);
        const allowedActions = deriveTechnicalAllowedActions(wo, lines, req.user!);
        const blockers = [
          ...(wo.activeHandoffId ? ['Đang chờ bàn giao KTV'] : []),
          ...(stage === 'WAITING_PARTS' ? ['Chờ linh kiện'] : []),
          ...(String(wo.workOrderType || '') === 'CUSTOMER_SERVICE' && String(wo.quoteStatus || '') !== 'APPROVED' ? ['Chờ duyệt báo giá'] : [])
        ];
        return {
          workOrderId, code: wo.code || workOrderId, status: wo.status || 'ASSIGNED', imei: wo.imei || '', model: wo.model || 'Thiết bị',
          workOrderType: wo.workOrderType, branchId: wo.branchId, stage,
          currentCustodianUid: wo.currentCustodianUid || null, currentCustodianName: wo.currentCustodianName || null,
          sla: { deadlineAt: deadlineAt || null, minutesRemaining, risk: minutesRemaining == null ? 'NONE' : minutesRemaining < 0 ? 'OVERDUE' : minutesRemaining <= 120 ? 'HIGH' : 'NORMAL', isOverdue: minutesRemaining != null && minutesRemaining < 0 },
          blockers, nextAction: allowedActions[0] || null, allowedActions,
          taskLines: lines.map(line => ({ id: line.id, taskName: line.taskName, status: line.status, assigneeUid: line.assigneeUid, assigneeName: line.assigneeName, deadlineAt: line.deadlineAt || null, reworkCycle: Number(line.reworkCycle || 0) }))
        };
      });
      const summary = items.reduce((acc, item) => {
        acc.workOrdersOpen += 1;
        if (item.stage === 'WAITING_ACCEPTANCE') acc.waitingAcceptance += 1;
        if (item.stage === 'WAITING_PARTS') acc.waitingParts += 1;
        if (item.stage === 'WAITING_QC') acc.waitingQc += 1;
        if (item.stage === 'REWORK') acc.rework += 1;
        if (item.sla.risk === 'HIGH') acc.dueSoon += 1;
        if (item.sla.isOverdue) acc.overdue += 1;
        if (item.currentCustodianUid) acc.devicesInCustody += 1;
        return acc;
      }, { workOrdersOpen: 0, devicesInCustody: 0, waitingAcceptance: 0, dueSoon: 0, overdue: 0, waitingParts: 0, waitingQc: 0, rework: 0 });
      const lastDoc = pageDocs.at(-1);
      const nextCursor = hasMore && lastDoc
        ? Buffer.from(JSON.stringify({ deadlineAt: String(lastDoc.data()?.deadlineAt || ''), id: lastDoc.id })).toString('base64url')
        : null;
      return res.json({ success: true, data: { summary, alerts: items.filter(item => item.sla.isOverdue || item.blockers.length).slice(0, 20), items, hasMore, nextCursor } });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Không thể tải bàn kỹ thuật.' });
    }
  });

  router.get('/kpi', requireRole('ADMIN', 'MANAGER', 'TECH_LEAD', 'ACCOUNTANT', 'TECH', 'TECHNICIAN'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const role = String(req.user!.role || '').toUpperCase();
      const branchId = String(req.query.branchId || req.user!.branchId || '').trim();
      const fromDate = String(req.query.from || '');
      const toDate = String(req.query.to || '');
      if (!branchId || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) throw new Error('KPI_RANGE_REQUIRED');
      const allowedBranches = new Set([req.user!.branchId, ...(req.user!.assignedBranchIds || [])].filter(Boolean));
      if (role !== 'ADMIN' && !allowedBranches.has(branchId)) throw new Error('BRANCH_FORBIDDEN');
      const requestedStaffUid = String(req.query.staffUid || '').trim();
      const staffUid = ['TECH', 'TECHNICIAN'].includes(role) ? req.user!.uid : requestedStaffUid;
      const rangeStart = getVietnamDayUtcRange(fromDate).startUtc;
      const rangeEnd = getVietnamDayUtcRange(toDate).endUtc;
      let assignedQuery: FirebaseFirestore.Query = db.collection('technicalWorkOrderLines').where('branchId', '==', branchId).where('assignedAt', '>=', rangeStart).where('assignedAt', '<=', rangeEnd);
      if (staffUid) assignedQuery = assignedQuery.where('assigneeUid', '==', staffUid);
      let verifiedQuery: FirebaseFirestore.Query = db.collection('technicalWorkOrderLines').where('branchId', '==', branchId).where('qcVerifiedAt', '>=', rangeStart).where('qcVerifiedAt', '<=', rangeEnd);
      if (staffUid) verifiedQuery = verifiedQuery.where('assigneeUid', '==', staffUid);
      let commissionQuery: FirebaseFirestore.Query = db.collection('commissionLedger').where('branchId', '==', branchId).where('eligibleAt', '>=', rangeStart).where('eligibleAt', '<=', rangeEnd);
      if (staffUid) commissionQuery = commissionQuery.where('staffUid', '==', staffUid);
      let pendingCommissionQuery: FirebaseFirestore.Query = db.collection('commissionLedger').where('branchId', '==', branchId).where('status', '==', 'PENDING').where('assignedAt', '>=', rangeStart).where('assignedAt', '<=', rangeEnd);
      if (staffUid) pendingCommissionQuery = pendingCommissionQuery.where('staffUid', '==', staffUid);
      let sessionQuery: FirebaseFirestore.Query = db.collection('technicalTaskSessions').where('branchId', '==', branchId).where('startedAt', '>=', rangeStart).where('startedAt', '<=', rangeEnd);
      if (staffUid) sessionQuery = sessionQuery.where('technicianUid', '==', staffUid);
      const [assignedSnap, verifiedSnap, commissionSnap, pendingCommissionSnap, sessionSnap] = await Promise.all([
        assignedQuery.limit(4000).get(), verifiedQuery.limit(4000).get(), commissionQuery.limit(4000).get(),
        pendingCommissionQuery.limit(4000).get(), sessionQuery.limit(8000).get()
      ]);
      const staff = new Map<string, any>();
      const ensure = (uid: string, name?: string) => {
        if (!staff.has(uid)) staff.set(uid, { staffUid: uid, staffName: name || uid, assignedTaskCount: 0, verifiedTaskCount: 0, completedWorkOrderIds: new Set<string>(), onTimeCount: 0, overdueCount: 0, qcFirstPassCount: 0, qcFailedCount: 0, reworkCount: 0, activeWorkMinutes: 0, waitingPartsMinutes: 0, commissionPending: 0, commissionEligible: 0, commissionPaid: 0 });
        return staff.get(uid);
      };
      assignedSnap.docs.forEach(doc => { const line = doc.data(); ensure(String(line.assigneeUid || ''), line.assigneeName).assignedTaskCount += 1; });
      verifiedSnap.docs.forEach(doc => { const line = doc.data(); const row = ensure(String(line.assigneeUid || ''), line.assigneeName); if (!line.assignedAt) row.assignedTaskCount += 1; row.verifiedTaskCount += 1; row.completedWorkOrderIds.add(String(line.workOrderId || '')); row.reworkCount += Number(line.reworkCycle || 0); if (line.deadlineAt && String(line.qcVerifiedAt) <= String(line.deadlineAt)) row.onTimeCount += 1; else row.overdueCount += 1; if (Number(line.reworkCycle || 0) === 0) row.qcFirstPassCount += 1; else row.qcFailedCount += 1; row.waitingPartsMinutes += Number(line.waitingPartsMinutes || 0); });
      sessionSnap.docs.forEach(doc => { const session = doc.data(); ensure(String(session.technicianUid || '')).activeWorkMinutes += Number(session.durationMinutes || 0); });
      commissionSnap.docs.forEach(doc => { const entry = doc.data(); const row = ensure(String(entry.staffUid || ''), entry.staffName); const amount = Number(entry.commissionPayable ?? entry.amount ?? 0); if (entry.status === 'PAID') row.commissionPaid += amount; else if (entry.status === 'ELIGIBLE') row.commissionEligible += amount; else if (entry.status === 'PENDING') row.commissionPending += amount; });
      pendingCommissionSnap.docs.forEach(doc => { const entry = doc.data(); ensure(String(entry.staffUid || ''), entry.staffName).commissionPending += Number(entry.commissionPayable ?? entry.amount ?? 0); });
      const items = [...staff.values()].filter(row => row.staffUid).map(row => ({ ...row, completedWorkOrderCount: row.completedWorkOrderIds.size, completedWorkOrderIds: undefined, onTimeRate: row.verifiedTaskCount ? Math.round(row.onTimeCount * 10000 / row.verifiedTaskCount) / 100 : 0, firstPassRate: row.verifiedTaskCount ? Math.round(row.qcFirstPassCount * 10000 / row.verifiedTaskCount) / 100 : 0, averageActiveMinutes: row.verifiedTaskCount ? Math.round(row.activeWorkMinutes / row.verifiedTaskCount) : 0 }));
      return res.json({ success: true, data: { from: fromDate, to: toDate, branchId, items, coverage: { assignedCapped: assignedSnap.size >= 4000, verifiedCapped: verifiedSnap.size >= 4000, commissionCapped: commissionSnap.size >= 4000 || pendingCommissionSnap.size >= 4000, sessionsCapped: sessionSnap.size >= 8000 } } });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Không thể tải KPI kỹ thuật.' });
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
      const requestedBranchId = String(req.query.branchId || req.user!.branchId || '').trim();
      if (!requestedBranchId) throw new Error('BRANCH_REQUIRED');
      const assignedBranches = new Set([req.user!.branchId, ...(req.user!.assignedBranchIds || [])].filter(Boolean));
      if (role !== 'ADMIN' && !assignedBranches.has(requestedBranchId)) throw new Error('BRANCH_FORBIDDEN');
      const snap = canSeeQcQueue
        ? await db.collection('technicalWorkOrderLines').where('branchId', '==', requestedBranchId).limit(200).get()
        : await db.collection('technicalWorkOrderLines').where('assigneeUid', '==', req.user!.uid).where('branchId', '==', requestedBranchId).limit(100).get();

      const workOrderIds = [...new Set(snap.docs.map(doc => String(doc.data().workOrderId || '')).filter(Boolean))];
      const workOrderSnaps = workOrderIds.length > 0
        ? await db.getAll(...workOrderIds.map(id => db.collection('technicalWorkOrders').doc(id)))
        : [];
      const workOrders = new Map(workOrderSnaps.filter(item => item.exists).map(item => [item.id, item.data()!]));
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
