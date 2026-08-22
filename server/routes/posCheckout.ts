import { Router, Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { validateCheckoutPayload } from '../validation/checkoutSchema';
import { executeAtomicCheckout, executeAtomicInvoiceRefund, processUpdateInvoiceNote } from '../services/checkoutService';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import { requireBranchAccess } from '../middleware/requireBranchAccess';

export function createPOSCheckoutRouter(db: Firestore): Router {
  const router = Router();

  router.post(
    '/checkout',
    authenticateFirebase,
    requireRole('ADMIN', 'MANAGER', 'SALES', 'SALE', 'ACCOUNTANT'),
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
          error?.message?.includes('INSUFFICIENT_STOCK')
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
    requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'SALE'),
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
    requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'),
    requireBranchAccess(),
    async (req: Request, res: Response) => {
      try {
        const result = await executeAtomicInvoiceRefund(db, req.body, req.user);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        console.error('[POS Refund Error]:', error);
        const conflict = String(error?.message || '').includes('ALREADY_CANCELLED');
        return res.status(conflict ? 409 : 400).json({
          success: false,
          error: error?.message || 'Lỗi xử lý hủy hóa đơn và hoàn tiền.'
        });
      }
    }
  );

  return router;
}
