import { Router, Request, Response } from 'express';
import { Firestore } from 'firebase/firestore';
import { validateCheckoutPayload } from '../validation/checkoutSchema';
import { executeAtomicCheckout } from '../services/checkoutService';

export function createPOSCheckoutRouter(db: Firestore): Router {
  const router = Router();

  router.post('/checkout', async (req: Request, res: Response) => {
    const validation = validateCheckoutPayload(req.body);
    if (!validation.isValid || !validation.data) {
      return res.status(400).json({ success: false, error: validation.error || 'Dữ liệu đơn hàng không hợp lệ.' });
    }

    try {
      const result = await executeAtomicCheckout(db, validation.data);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('[POS Checkout Error]:', error);
      const statusCode = error?.message?.includes('DEVICE_ALREADY_SOLD') || error?.message?.includes('INSUFFICIENT_STOCK') ? 409 : 400;
      return res.status(statusCode).json({
        success: false,
        error: error?.message || 'Lỗi xử lý giao dịch thanh toán.'
      });
    }
  });

  return router;
}
