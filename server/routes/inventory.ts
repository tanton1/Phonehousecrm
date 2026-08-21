import { Request, Response, Router } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import { buildInventoryAuditReport, listInventoryDevicesForActor, processImportInventoryDevices } from '../services/inventoryDeviceService';
import { processPurchaseOrderReceipt } from '../services/purchaseOrderReceiptService';

function sendInventoryError(res: Response, error: any) {
  const message = error?.message || 'Lỗi xử lý dữ liệu kho.';
  const forbidden = /FORBIDDEN/.test(message);
  const conflict = /ALREADY_EXISTS|DUPLICATE|IDEMPOTENCY_PAYLOAD_MISMATCH/.test(message);
  return res.status(forbidden ? 403 : conflict ? 409 : 400).json({ success: false, error: message });
}

export function createInventoryRouter(db: Firestore | null): Router {
  const router = Router();
  router.use(authenticateFirebase);

  router.get('/devices', async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const devices = await listInventoryDevicesForActor(db, req.user!);
      return res.json({ success: true, data: { devices, snapshotAt: new Date().toISOString() } });
    } catch (error: any) {
      return sendInventoryError(res, error);
    }
  });

  router.post('/devices/import', requireRole('ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'TECH_LEAD'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processImportInventoryDevices(db, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return sendInventoryError(res, error);
    }
  });

  router.post('/purchase-orders/receive', requireRole('ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processPurchaseOrderReceipt(db, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return sendInventoryError(res, error);
    }
  });

  router.get('/audit', requireRole('ADMIN'), async (_req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const report = await buildInventoryAuditReport(db);
      return res.json({ success: true, data: report });
    } catch (error: any) {
      return sendInventoryError(res, error);
    }
  });

  return router;
}
