import { Router, Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { 
  processCareActivityReview, 
  canTransitionLeadState, 
  processDeviceReservation, 
  processConvertQuoteToPOS 
} from '../services/crmService';
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
      const { activityId, status, note } = req.body;

      if (!activityId || !status) {
        return res.status(400).json({
          success: false,
          error: 'Thiếu thông tin activityId hoặc status kiểm duyệt.'
        });
      }

      const reviewerUid = req.user?.uid || 'QA_ADMIN';
      const reviewerName = req.user?.name || req.user?.email || 'Quản Lý QA';
      const reviewerRole = req.user?.role || 'MANAGER';
      const reviewerBranchId = req.user?.branchId || 'CN01';
      const reviewerAssignedBranches = req.user?.assignedBranchIds || [];

      const result = await processCareActivityReview(db, {
        activityId,
        status,
        reviewerUid,
        reviewerName,
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
   * 2. Authoritative Lead State Machine Transition
   * POST /api/crm/leads/transition
   */
  router.post('/leads/transition', authenticateFirebase, async (req: Request, res: Response) => {
    try {
      const { leadId, fromStatus, toStatus, context } = req.body;

      if (!leadId || !fromStatus || !toStatus) {
        return res.status(400).json({
          success: false,
          error: 'Thiếu thông tin leadId, fromStatus hoặc toStatus.'
        });
      }

      const transitionCheck = canTransitionLeadState(fromStatus, toStatus, context);
      if (!transitionCheck.allowed) {
        return res.status(400).json({
          success: false,
          error: transitionCheck.reason || 'Chuyển đổi trạng thái không hợp lệ.'
        });
      }

      if (db) {
        const leadRef = db.collection('leads').doc(leadId);
        await db.runTransaction(async (transaction) => {
          const lSnap = await transaction.get(leadRef);
          if (!lSnap.exists) {
            throw new Error(`LEAD_NOT_FOUND: Không tìm thấy Lead ID "${leadId}".`);
          }

          const lData = lSnap.data()!;
          const currentStatus = lData.status;

          // Re-validate against authoritative DB state
          const dbTransitionCheck = canTransitionLeadState(currentStatus, toStatus, context);
          if (!dbTransitionCheck.allowed) {
            throw new Error(dbTransitionCheck.reason || 'Trạng thái hiện tại trên máy chủ không cho phép chuyển đổi này.');
          }

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

          // Append to customer activity ledger
          const actId = `CUST_ACT_${Date.now()}`;
          const custActRef = db.collection('customerActivities').doc(actId);
          transaction.set(custActRef, {
            id: actId,
            customerId: lData.customerId || lData.phone || leadId,
            leadId,
            type: toStatus === 'won' ? 'INVOICE' : toStatus === 'lost' ? 'NOTE' : 'CARE',
            entityId: context?.invoiceId || context?.quoteId || leadId,
            staffId: req.user?.uid || 'STAFF',
            staffName: req.user?.name || req.user?.email || 'Chuyên viên',
            branchId: lData.branchId || req.user?.branchId || 'CN01',
            summary: `Chuyển trạng thái Lead từ "${fromStatus}" sang "${toStatus}"${context?.notes ? `: ${context.notes}` : ''}`,
            createdAt: new Date().toISOString()
          });
        });
      }

      return res.json({
        success: true,
        data: { leadId, status: toStatus },
        message: `Đã chuyển trạng thái Lead ${leadId} sang "${toStatus}".`
      });
    } catch (err: any) {
      console.error('[CRM Lead Transition Error]:', err);
      return res.status(400).json({
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
      const { deviceId, leadId, quoteId, customerId } = req.body;

      if (!deviceId || !leadId) {
        return res.status(400).json({
          success: false,
          error: 'Thiếu deviceId hoặc leadId.'
        });
      }

      const staffId = req.user?.uid || 'STAFF';
      const branchId = req.user?.branchId || 'CN01';

      const result = await processDeviceReservation(db, {
        deviceId,
        leadId,
        quoteId,
        customerId,
        staffId,
        branchId,
        reservationDurationMinutes: 30
      });

      return res.json({
        success: true,
        data: result,
        message: `Đã giữ máy ${result.model} (${result.imei}) cho khách hàng trong 30 phút.`
      });
    } catch (err: any) {
      console.error('[CRM Device Reservation Error]:', err);
      const isConflict = err.message?.includes('ALREADY_RESERVED') || err.message?.includes('ALREADY_SOLD');
      return res.status(isConflict ? 409 : 400).json({
        success: false,
        error: err.message || 'Lỗi đặt giữ máy tồn kho.'
      });
    }
  });

  /**
   * 4. Convert Quote to POS Order
   * POST /api/crm/quotes/convert-pos
   */
  router.post('/quotes/convert-pos', authenticateFirebase, async (req: Request, res: Response) => {
    try {
      const { quoteId, invoiceId } = req.body;

      if (!quoteId || !invoiceId) {
        return res.status(400).json({
          success: false,
          error: 'Thiếu quoteId hoặc invoiceId.'
        });
      }

      await processConvertQuoteToPOS(db, quoteId, invoiceId);

      return res.json({
        success: true,
        message: `Đã chuyển đổi báo giá ${quoteId} sang đơn hàng POS (${invoiceId}).`
      });
    } catch (err: any) {
      console.error('[CRM Quote to POS Error]:', err);
      return res.status(400).json({
        success: false,
        error: err.message || 'Lỗi chuyển đổi báo giá sang POS.'
      });
    }
  });

  return router;
}
