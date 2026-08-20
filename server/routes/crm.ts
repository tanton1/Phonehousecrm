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

export function createCrmRouter(db: Firestore | null): Router {
  const router = Router();

  /**
   * 1. Authoritative QA Review Endpoint (Requires Admin or Manager)
   * POST /api/crm/care/review
   */
  router.post('/care/review', authenticateFirebase, requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response) => {
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

        if (toStatus === 'won' && context?.invoiceId) {
          updatePayload.wonInvoiceId = context.invoiceId;
          updatePayload.wonAt = new Date().toISOString();
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
