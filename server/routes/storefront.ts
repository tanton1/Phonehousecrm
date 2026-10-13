import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import { requireCustomerAppCheck } from '../middleware/authenticateCustomer';
import { createRateLimit } from '../middleware/security';
import { getStorefrontProduct, listStorefrontProducts } from '../services/storefrontService';
import { createStorefrontOrder, listStorefrontOrders, updateStorefrontOrder } from '../services/storefrontOrderService';
import { answerStorefrontQuestion } from '../services/storefrontAssistantService';

const messages: Record<string, string> = {
  STOREFRONT_BRANCH_INVALID: 'Chi nhánh không còn hoạt động. Vui lòng chọn lại.',
  STOREFRONT_CURSOR_INVALID: 'Danh sách đã thay đổi. Vui lòng tải lại.',
  STOREFRONT_PRODUCT_NOT_FOUND: 'Sản phẩm đã ngừng kinh doanh. Vui lòng bỏ khỏi giỏ hàng.',
  STOREFRONT_ORDER_INVALID: 'Vui lòng kiểm tra tên, số điện thoại, chi nhánh, địa chỉ và đồng ý liên hệ.',
  STOREFRONT_PRICE_CHANGED: 'Giá vừa thay đổi. Vui lòng làm mới giỏ hàng, kiểm tra giá rồi gửi lại.',
  STOREFRONT_IDEMPOTENCY_CONFLICT: 'Thông tin yêu cầu đã thay đổi. Vui lòng mở lại giỏ hàng.',
  STOREFRONT_ORDER_RATE_LIMITED: 'Số điện thoại đã gửi nhiều yêu cầu. Vui lòng thử lại sau một giờ.',
  STOREFRONT_AI_UNAVAILABLE: 'Trợ lý AI chưa sẵn sàng. Bạn vẫn có thể tìm sản phẩm bằng thanh tìm kiếm hoặc liên hệ nhân viên.',
  STOREFRONT_FORBIDDEN: 'Bạn không có quyền truy cập yêu cầu ở chi nhánh này.',
  STOREFRONT_STATUS_CONFLICT: 'Yêu cầu đã được xử lý. Vui lòng làm mới danh sách.'
};
export function createStorefrontRouter(db: Firestore | null) {
  const router = Router();
  const handle = (run: (req: any) => Promise<any>) => async (req: any, res: any) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE', message: 'Chưa kết nối được dữ liệu cửa hàng.' });
    try { return res.json({ success: true, data: await run(req) }); }
    catch (error) {
      const raw = error instanceof Error ? error.message : '';
      const known = raw.startsWith('STOREFRONT_');
      const code = known ? raw : 'STOREFRONT_UNAVAILABLE';
      if (!known) console.error('[Storefront] request failed', { requestId: req.requestId, name: error instanceof Error ? error.name : 'Error' });
      const status = /NOT_FOUND/.test(code) ? 404 : /FORBIDDEN/.test(code) ? 403 : /CONFLICT|CHANGED/.test(code) ? 409 : /RATE_LIMITED/.test(code) ? 429 : /UNAVAILABLE/.test(code) ? 503 : 400;
      return res.status(status).json({ success: false, code, message: messages[code] || 'Không tải được dữ liệu cửa hàng. Vui lòng thử lại.' });
    }
  };
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/products', handle(req => listStorefrontProducts(db!, req.query)));
  router.get('/products/:id', handle(req => getStorefrontProduct(db!, req.params.id, String(req.query.branchId || ''))));
  router.post('/orders', requireCustomerAppCheck, createRateLimit({ prefix: 'storefront-orders', windowMs: 600_000, maxRequests: 10 }), handle(req => createStorefrontOrder(db!, req.body)));
  router.post('/assistant', requireCustomerAppCheck, createRateLimit({ prefix: 'storefront-assistant', windowMs: 600_000, maxRequests: 20 }), handle(req => answerStorefrontQuestion(db!, req.body)));
  const staff = Router();
  staff.use(authenticateFirebase, requireRole('ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'STORE_MANAGER', 'SALES', 'SALE', 'SALE_ONLINE', 'CUSTOMER_CARE', 'CSKH'));
  staff.get('/orders', handle(req => listStorefrontOrders(db!, req.user, req.query)));
  staff.patch('/orders/:id', handle(req => updateStorefrontOrder(db!, req.user, req.params.id, req.body)));
  router.use('/staff', staff);
  return router;
}
