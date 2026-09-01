import { Router, Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { validateCheckoutPayload } from '../validation/checkoutSchema';
import { executeAtomicCheckout, executeAtomicInvoiceRefund, processUpdateInvoiceNote } from '../services/checkoutService';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requirePermission } from '../middleware/requirePermission';
import { requireBranchAccess } from '../middleware/requireBranchAccess';

export function createPOSCheckoutRouter(db: Firestore): Router {
  const router = Router();

  router.post(
    '/checkout',
    authenticateFirebase,
    requirePermission('POS_CHECKOUT'),
    requireBranchAccess(),
    async (req: Request, res: Response) => {
      const validation = validateCheckoutPayload(req.body);
      if (!validation.isValid || !validation.data) {
        return res.status(400).json({ success: false, error: validation.error || 'Dữ liệu đơn hàng không hợp lệ.' });
      }

      try {
        const result = await executeAtomicCheckout(db, validation.data, req.user);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[POS Checkout Error]:', error);
        const statusCode =
          error?.message?.includes('DEVICE_ALREADY_SOLD') ||
          error?.message?.includes('INSUFFICIENT_STOCK') ||
          error?.message?.includes('IDEMPOTENCY_')
            ? 409
            : 400;
        return res.status(statusCode).json({
          success: false,
          error: error?.message || 'Lỗi xử lý giao dịch thanh toán.'
        });
      }
    }
  );

  router.patch(
    '/invoices/:invoiceId/notes',
    authenticateFirebase,
    requirePermission('POS_CHECKOUT'),
    async (req: Request, res: Response) => {
      try {
        const invoice = await processUpdateInvoiceNote(db, req.params.invoiceId, req.body?.notes, req.user!);
        return res.json({ success: true, data: { invoice } });
      } catch (error: any) {
        const message = error?.message || 'INVOICE_NOTE_UPDATE_FAILED';
        return res.status(message.includes('FORBIDDEN') ? 403 : 400).json({ success: false, error: message });
      }
    }
  );

  router.post(
    '/refund',
    authenticateFirebase,
    requirePermission('INVOICE_REFUND'),
    requireBranchAccess(),
    async (req: Request, res: Response) => {
      try {
        const result = await executeAtomicInvoiceRefund(db, req.body, req.user);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[POS Refund Error]:', error);
        const conflict = /ALREADY_CANCELLED|IDEMPOTENCY_/.test(String(error?.message || ''));
        return res.status(conflict ? 409 : 400).json({
          success: false,
          error: error?.message || 'Lỗi xử lý hủy hóa đơn và hoàn tiền.'
        });
      }
    }
  );

  return router;
}
