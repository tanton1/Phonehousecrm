import { Router, Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { 
  processCareActivityReview, 
  canTransitionLeadState, 
  processDeviceReservation, 
  processConvertQuoteToPOS 
} from '../services/crmService';
import { emitCrmEvent, normalizeCustomerId } from '../services/crmEventService';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import {
  getCrmCustomer360,
  getCrmDashboard,
  getCrmDispatchBoard,
  getCrmWorkQueue,
  listCrmCareActivities,
  listCrmLeads,
  processAssignCrmLead,
  processCreateCrmAppointment,
  processCreateCrmLead,
  processCreateCrmQuote,
  processCrmCare,
  processUpdateCrmAppointment
} from '../services/crmOperationsService';

function crmActor(req: Request) {
  return {
    uid: req.user!.uid,
    role: req.user!.role,
    branchId: req.user!.branchId,
    assignedBranchIds: req.user!.assignedBranchIds,
    name: req.user!.name || req.user!.email || req.user!.uid
  };
}

function crmErrorStatus(error: any) {
  const message = String(error?.message || 'CRM_REQUEST_FAILED');
  if (/FORBIDDEN|OWNERSHIP/.test(message)) return 403;
  if (/NOT_FOUND/.test(message)) return 404;
  if (/DUPLICATE|ALREADY|IDEMPOTENCY|CONFLICT/.test(message)) return 409;
  return 400;
}

function sendCrmError(res: Response, error: any) {
  return res.status(crmErrorStatus(error)).json({ success: false, error: error?.message || 'CRM_REQUEST_FAILED' });
}

export function createCrmRouter(db: Firestore | null): Router {
  const router = Router();

  /** CRM Hub lists only the requested branch/owner page; it never streams the whole collection. */
  router.get('/leads', authenticateFirebase, async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await listCrmLeads(db, {
        branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
        ownerId: typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        source: typeof req.query.source === 'string' ? req.query.source : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      }, crmActor(req));
      return res.json({ success: true, data });
    } catch (error: any) {
      return sendCrmError(res, error);
    }
  });

  router.post('/leads', authenticateFirebase, requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER', 'SALES', 'SALE', 'SALE_ONLINE', 'CUSTOMER_CARE', 'CSKH'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await processCreateCrmLead(db, req.body || {}, crmActor(req)) });
    } catch (error: any) {
      return sendCrmError(res, error);
    }
  });

  router.get('/work-queue', authenticateFirebase, async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await getCrmWorkQueue(db, {
        branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
        ownerId: typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      }, crmActor(req));
      return res.json({ success: true, data });
    } catch (error: any) {
      return sendCrmError(res, error);
    }
  });

  router.get('/care/activities', authenticateFirebase, async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await listCrmCareActivities(db, {
        branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
        staffId: typeof req.query.staffId === 'string' ? req.query.staffId : undefined,
        verificationStatus: typeof req.query.verificationStatus === 'string' ? req.query.verificationStatus : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      }, crmActor(req)) });
    } catch (error: any) {
      return sendCrmError(res, error);
    }
  });

  router.post('/leads/:leadId/assign', authenticateFirebase, requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await processAssignCrmLead(db, { ...req.body, leadId: req.params.leadId }, crmActor(req)) });
    } catch (error: any) {
      return sendCrmError(res, error);
    }
  });

  router.post('/leads/:leadId/care', authenticateFirebase, requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER', 'SALES', 'SALE', 'SALE_ONLINE', 'CUSTOMER_CARE', 'CSKH'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await processCrmCare(db, { ...req.body, leadId: req.params.leadId }, crmActor(req)) });
    } catch (error: any) {
      return sendCrmError(res, error);
    }
  });

  router.post('/appointments', authenticateFirebase, requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER', 'SALES', 'SALE', 'SALE_ONLINE', 'CUSTOMER_CARE', 'CSKH'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await processCreateCrmAppointment(db, req.body || {}, crmActor(req)) });
    } catch (error: any) {
      return sendCrmError(res, error);
    }
  });

  router.patch('/appointments/:appointmentId', authenticateFirebase, async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await processUpdateCrmAppointment(db, req.params.appointmentId, req.body || {}, crmActor(req)) });
    } catch (error: any) {
      return sendCrmError(res, error);
    }
  });

  router.post('/quotes', authenticateFirebase, requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER', 'SALES', 'SALE', 'SALE_ONLINE'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await processCreateCrmQuote(db, req.body || {}, crmActor(req)) });
    } catch (error: any) {
      return sendCrmError(res, error);
    }
  });

  router.get('/customers/:leadId/360', authenticateFirebase, async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await getCrmCustomer360(db, req.params.leadId, crmActor(req)) });
    } catch (error: any) {
      return sendCrmError(res, error);
    }
  });

  router.get('/dashboard', authenticateFirebase, requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await getCrmDashboard(db, {
        branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
        dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined
      }, crmActor(req)) });
    } catch (error: any) {
      return sendCrmError(res, error);
    }
  });

  router.get('/dispatch', authenticateFirebase, requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const branchId = String(req.query.branchId || req.user?.branchId || '');
      return res.json({ success: true, data: await getCrmDispatchBoard(db, branchId, crmActor(req)) });
    } catch (error: any) {
      return sendCrmError(res, error);
    }
  });

  /**
   * 1. Authoritative QA Review Endpoint (Requires Admin or Manager)
   * POST /api/crm/care/review
   */
  router.post('/care/review', authenticateFirebase, requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    try {
      if (!db) {
        return res.status(503).json({
          success: false,
          error: 'DATABASE_UNAVAILABLE: Cơ sở dữ liệu máy chủ chưa sẵn sàng.'
        });
      }

      const { activityId, status, note } = req.body;

      if (!activityId || !status) {
        return res.status(400).json({
          success: false,
          error: 'Thiếu thông tin activityId hoặc status kiểm duyệt.'
        });
      }

      // Strict runtime validation for QA statuses
      const allowedQAStatuses = ['MANAGER_VERIFIED', 'NEEDS_EVIDENCE', 'FLAGGED'];
      if (!allowedQAStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `INVALID_QA_STATUS: Trạng thái QA không hợp lệ (${status}). Chỉ chấp nhận: ${allowedQAStatuses.join(', ')}.`
        });
      }

      const reviewerUid = req.user?.uid;
      const reviewerName = req.user?.name || req.user?.email;
      const reviewerRole = req.user?.role;
      const reviewerBranchId = req.user?.branchId;
      const reviewerAssignedBranches = req.user?.assignedBranchIds || [];

      if (!reviewerUid || !reviewerRole || !reviewerBranchId) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHENTICATED: Không xác thực được danh tính hoặc chi nhánh của người kiểm duyệt.'
        });
      }

      const result = await processCareActivityReview(db, {
        activityId,
        status,
        reviewerUid,
        reviewerName: reviewerName || reviewerUid,
        reviewerRole,
        reviewerBranchId,
        reviewerAssignedBranches,
        note
      });

      return res.json({
        success: true,
        data: result,
        message: `Đã cập nhật trạng thái kiểm duyệt "${status}" cho hoạt động ${activityId}.`
      });
    } catch (err: any) {
      console.error('[CRM QA Review Error]:', err);
      const isForbidden = err.message?.includes('PERMISSION_DENIED') || err.message?.includes('BRANCH_FORBIDDEN');
      return res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: err.message || 'Lỗi xử lý kiểm duyệt QA.'
      });
    }
  });

  /**
   * 2. Authoritative Lead State Machine Transition with Ownership & Branch Guard
   * POST /api/crm/leads/transition
   */
  router.post('/leads/transition', authenticateFirebase, async (req: Request, res: Response) => {
    try {
      if (!db) {
        return res.status(503).json({
          success: false,
          error: 'DATABASE_UNAVAILABLE: Cơ sở dữ liệu máy chủ chưa sẵn sàng.'
        });
      }

      const { leadId, fromStatus, toStatus, context } = req.body;

      if (!leadId || !fromStatus || !toStatus) {
        return res.status(400).json({
          success: false,
          error: 'Thiếu thông tin leadId, fromStatus hoặc toStatus.'
        });
      }

      const userUid = req.user?.uid;
      const userRole = req.user?.role;
      const userBranchId = req.user?.branchId;
      const userAssignedBranches = req.user?.assignedBranchIds || [];
      const userName = req.user?.name || req.user?.email || userUid;

      if (!userUid || !userRole || !userBranchId) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHENTICATED: Không xác thực được danh tính, vai trò hoặc chi nhánh nhân viên.'
        });
      }

      const transitionCheck = canTransitionLeadState(fromStatus, toStatus, context);
      if (!transitionCheck.allowed) {
        return res.status(400).json({
          success: false,
          error: transitionCheck.reason || 'Chuyển đổi trạng thái không hợp lệ.'
        });
      }

      const leadRef = db.collection('leads').doc(leadId);
      let authCustomerId = '';

      await db.runTransaction(async (transaction) => {
        const lSnap = await transaction.get(leadRef);
        if (!lSnap.exists) {
          throw new Error(`LEAD_NOT_FOUND: Không tìm thấy Lead ID "${leadId}".`);
        }

        const lData = lSnap.data()!;
        const currentStatus = lData.status;

        if (!lData.branchId) {
          throw new Error('LEAD_BRANCH_MISSING: Dữ liệu Lead trên hệ thống thiếu thông tin chi nhánh.');
        }

        // 2A. Branch Isolation Guard
        if (userRole !== 'ADMIN') {
          const allowedBranches = [userBranchId, ...userAssignedBranches];
          if (!allowedBranches.includes(lData.branchId)) {
            throw new Error(`BRANCH_FORBIDDEN: Bạn không có quyền thao tác trên Lead thuộc chi nhánh "${lData.branchId}".`);
          }
        }

        // 2B. Ownership & Role Guard: Only SALES can transition their own leads; ADMIN/MANAGER can transition any lead in their branch
        const canManageAllLeads = userRole === 'ADMIN' || userRole === 'MANAGER';
        if (!canManageAllLeads) {
          if (userRole !== 'SALES') {
            throw new Error(`PERMISSION_DENIED: Vai trò "${userRole}" không có quyền quản trị phễu bán hàng (Chỉ dành cho SALES hoặc Quản lý).`);
          }
          if (!lData.assignedStaffId || lData.assignedStaffId !== userUid) {
            throw new Error(`LEAD_OWNERSHIP_FORBIDDEN: Lead này do ${lData.assignedStaff || lData.assignedStaffId || 'nhân viên khác'} phụ trách.`);
          }
        }

        // 2C. Authoritative DB State Validation
        const dbTransitionCheck = canTransitionLeadState(currentStatus, toStatus, context);
        if (!dbTransitionCheck.allowed) {
          throw new Error(dbTransitionCheck.reason || 'Trạng thái hiện tại trên máy chủ không cho phép chuyển đổi này.');
        }

        authCustomerId = lData.customerId || normalizeCustomerId(undefined, lData.phone);

        const updatePayload: Record<string, any> = {
          status: toStatus,
          updatedAt: FieldValue.serverTimestamp()
        };

        if (toStatus === 'won') {
          if (!context?.invoiceId) {
            throw new Error('INVOICE_REQUIRED: Chuyển sang WON yêu cầu phải có mã hóa đơn POS hợp lệ.');
          }
          const invRef = db.collection('invoices').doc(context.invoiceId);
          const invSnap = await transaction.get(invRef);
          if (!invSnap.exists) {
            throw new Error(`INVOICE_NOT_FOUND: Không tìm thấy hóa đơn POS "${context.invoiceId}" trên hệ thống.`);
          }
          const invData = invSnap.data()!;
          if (invData.status !== 'completed') {
            throw new Error(`INVOICE_NOT_COMPLETED: Hóa đơn "${context.invoiceId}" đang ở trạng thái "${invData.status}", chưa hoàn tất thanh toán.`);
          }
          if (invData.branchId && invData.branchId !== lData.branchId) {
            throw new Error(`INVOICE_BRANCH_MISMATCH: Hóa đơn thuộc chi nhánh "${invData.branchId}", không khớp chi nhánh của Lead "${lData.branchId}".`);
          }

          // Verify Customer / Phone Match to prevent attributing unrelated sales
          const leadPhoneClean = (lData.phone || '').replace(/[^0-9]/g, '');
          const invPhoneClean = (invData.customerPhone || '').replace(/[^0-9]/g, '');
          const isCustomerMatched = (lData.customerId && invData.customerId && lData.customerId === invData.customerId) ||
            (leadPhoneClean && invPhoneClean && (leadPhoneClean === invPhoneClean || leadPhoneClean.slice(-9) === invPhoneClean.slice(-9))) ||
            (invData.leadId === leadId);

          if (!isCustomerMatched) {
            throw new Error(`INVOICE_CUSTOMER_MISMATCH: Hóa đơn "${context.invoiceId}" thuộc khách hàng khác (${invData.customerName || invData.customerPhone || 'Không xác định'}), không khớp thông tin của Lead này.`);
          }

          updatePayload.wonInvoiceId = context.invoiceId;
          updatePayload.wonAt = new Date().toISOString();
          transaction.update(invRef, {
            leadId,
            updatedAt: FieldValue.serverTimestamp()
          });
        }

        if (toStatus === 'lost' && context?.lostReason) {
          updatePayload.lostReason = context.lostReason;
          updatePayload.lostAt = new Date().toISOString();
        }

        transaction.update(leadRef, updatePayload);
      });

      // 2D. Record to Customer Activity Ledger via CRM Event Bus
      await emitCrmEvent(db, {
        type: toStatus === 'won' ? 'INVOICE_COMPLETED' : toStatus === 'lost' ? 'LEAD_LOST' : 'LEAD_STAGE_CHANGED',
        customerId: authCustomerId,
        leadId,
        entityId: context?.invoiceId || context?.quoteId || leadId,
        staffId: userUid,
        staffName: userName,
        branchId: userBranchId,
        summary: `Chuyển trạng thái Lead từ "${fromStatus}" sang "${toStatus}"${context?.notes ? `: ${context.notes}` : ''}`,
        details: {
          fromStatus,
          toStatus,
          context
        }
      });

      return res.json({
        success: true,
        data: { leadId, status: toStatus },
        message: `Đã chuyển trạng thái Lead ${leadId} sang "${toStatus}".`
      });
    } catch (err: any) {
      console.error('[CRM Lead Transition Error]:', err);
      const isForbidden = err.message?.includes('FORBIDDEN') || err.message?.includes('PERMISSION');
      return res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: err.message || 'Lỗi cập nhật trạng thái Lead.'
      });
    }
  });

  /**
   * 3. Authoritative Device Reservation Endpoint
   * POST /api/crm/quotes/reserve
   */
  router.post('/quotes/reserve', authenticateFirebase, async (req: Request, res: Response) => {
    try {
      if (!db) {
        return res.status(503).json({
          success: false,
          error: 'DATABASE_UNAVAILABLE: Cơ sở dữ liệu máy chủ chưa sẵn sàng.'
        });
      }

      const { deviceId, leadId, quoteId, customerId } = req.body;

      if (!deviceId || !leadId) {
        return res.status(400).json({
          success: false,
          error: 'Thiếu deviceId hoặc leadId.'
        });
      }

      const staffId = req.user?.uid;
      const branchId = req.user?.branchId;
      const userAssignedBranches = req.user?.assignedBranchIds || [];

      if (!staffId || !branchId) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHENTICATED: Không xác thực được nhân viên hoặc chi nhánh yêu cầu giữ máy.'
        });
      }

      const result = await processDeviceReservation(db, {
        deviceId,
        leadId,
        quoteId,
        customerId,
        staffId,
        branchId,
        reservationDurationMinutes: 30
      });

      // Emit CRM Event
      await emitCrmEvent(db, {
        type: 'DEVICE_RESERVED',
        customerId: normalizeCustomerId(customerId, undefined),
        leadId,
        entityId: deviceId,
        staffId,
        staffName: req.user?.name || req.user?.email || staffId,
        branchId,
        summary: `Giữ máy tồn kho ${result.model} (${result.imei}) cho Lead trong 30 phút.`,
        details: {
          deviceId,
          expiresAt: result.expiresAt
        }
      });

      return res.json({
        success: true,
        data: result,
        message: `Đã giữ máy ${result.model} (${result.imei}) cho khách hàng trong 30 phút.`
      });
    } catch (err: any) {
      console.error('[CRM Device Reservation Error]:', err);
      const isConflict = err.message?.includes('ALREADY_RESERVED') || err.message?.includes('ALREADY_SOLD');
      const isForbidden = err.message?.includes('FORBIDDEN');
      const statusCode = isForbidden ? 403 : (isConflict ? 409 : 400);
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Lỗi đặt giữ máy tồn kho.'
      });
    }
  });

  /**
   * 4. Convert Quote to POS Order (Idempotent with Invoice Verification)
   * POST /api/crm/quotes/convert-pos
   */
  router.post('/quotes/convert-pos', authenticateFirebase, async (req: Request, res: Response) => {
    try {
      if (!db) {
        return res.status(503).json({
          success: false,
          error: 'DATABASE_UNAVAILABLE: Cơ sở dữ liệu máy chủ chưa sẵn sàng.'
        });
      }

      const { quoteId, invoiceId } = req.body;

      if (!quoteId || !invoiceId) {
        return res.status(400).json({
          success: false,
          error: 'Thiếu quoteId hoặc invoiceId.'
        });
      }

      const convertResult = await processConvertQuoteToPOS(db, quoteId, invoiceId);

      return res.json({
        success: true,
        alreadyConverted: convertResult.alreadyConverted || false,
        message: convertResult.alreadyConverted
          ? `Báo giá ${quoteId} đã được liên kết với hóa đơn ${invoiceId} trước đó.`
          : `Đã chuyển đổi báo giá ${quoteId} sang đơn hàng POS (${invoiceId}).`
      });
    } catch (err: any) {
      console.error('[CRM Quote to POS Error]:', err);
      const isConflict = err.message?.includes('ALREADY_CONVERTED');
      const isNotFound = err.message?.includes('NOT_FOUND');
      const statusCode = isConflict ? 409 : (isNotFound ? 404 : 400);
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Lỗi chuyển đổi báo giá sang POS.'
      });
    }
  });

  return router;
}
