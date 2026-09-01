import { Request, Response, Router } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import { buildInventoryAuditReport, listInventoryDevicesForActor, processImportInventoryDevices, processUpdateInventoryDeviceMetadata } from '../services/inventoryDeviceService';
import { getAccessoryStockTrace, listAccessoryStockBalancePage } from '../services/inventoryStockItemService';
import { processCancelPurchaseOrderReceipt, processPayPurchaseOrderDebt, processPurchaseOrderReceipt } from '../services/purchaseOrderReceiptService';
import { getDeviceLifecycleTimeline, processAddDeviceLifecycleNote } from '../services/deviceLifecycleService';

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
      const result = await listInventoryDevicesForActor(db, req.user!, {
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        cursor: String(req.query.cursor || '') || undefined,
        branchId: String(req.query.branchId || '') || undefined,
        locationId: String(req.query.locationId || '') || undefined,
        status: String(req.query.status || '') || undefined,
        search: String(req.query.search || '') || undefined,
        includeSummary: String(req.query.includeSummary || 'true') !== 'false'
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return sendInventoryError(res, error);
    }
  });

  /**
   * One authoritative event timeline for an IMEI. The response is projected
   * from immutable stock, technical, QC, part, cost and sales ledgers; it does
   * not create a second inventory or accounting source of truth.
   */
  router.get('/device-timeline', async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await getDeviceLifecycleTimeline(db, {
        deviceId: String(req.query.deviceId || '') || undefined,
        imei: String(req.query.imei || '') || undefined,
        workOrderId: String(req.query.workOrderId || '') || undefined
      }, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return sendInventoryError(res, error);
    }
  });

  router.get('/devices/:deviceId/timeline', async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await getDeviceLifecycleTimeline(db, {
        deviceId: req.params.deviceId,
        imei: String(req.query.imei || '') || undefined,
        workOrderId: String(req.query.workOrderId || '') || undefined
      }, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return sendInventoryError(res, error);
    }
  });

  router.post(
    '/devices/:deviceId/timeline-notes',
    requireRole('ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'WAREHOUSE', 'TECH_LEAD', 'TECH', 'TECHNICIAN', 'SALES', 'SALE'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const result = await processAddDeviceLifecycleNote(db, {
          deviceId: req.params.deviceId,
          imei: String(req.body?.imei || '') || undefined,
          workOrderId: String(req.body?.workOrderId || '') || undefined
        }, req.body || {}, req.user!);
        return res.json({ success: true, data: result });
      } catch (error: any) {
        return sendInventoryError(res, error);
      }
    }
  );

  router.get('/stock-items/accessories', async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await listAccessoryStockBalancePage(db, req.user!, {
        warehouseId: String(req.query.warehouseId || '') || undefined,
        cursor: String(req.query.cursor || '') || undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return sendInventoryError(res, error);
    }
  });

  router.get('/stock-items/accessories/:productId/trace', async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await getAccessoryStockTrace(db, req.params.productId, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return sendInventoryError(res, error);
    }
  });

  router.post('/devices/import', requireRole('ADMIN', 'INVENTORY_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processImportInventoryDevices(db, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return sendInventoryError(res, error);
    }
  });

  router.patch('/devices/:deviceId/metadata', requireRole('ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'TECH_LEAD'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const device = await processUpdateInventoryDeviceMetadata(db, req.params.deviceId, req.body || {}, req.user!);
      return res.json({ success: true, data: { device } });
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

  router.post('/purchase-orders/:orderId/cancel', requireRole('ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processCancelPurchaseOrderReceipt(db, req.params.orderId, req.user!, String(req.body?.reason || ''));
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return sendInventoryError(res, error);
    }
  });

  router.post('/purchase-orders/:orderId/payments', requireRole('ADMIN', 'MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processPayPurchaseOrderDebt(db, req.params.orderId, req.body, req.user!);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return sendInventoryError(res, error);
    }
  });

  router.patch('/purchase-orders/:orderId/note', requireRole('ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTANT'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const note = String(req.body?.note || '').trim().slice(0, 3000);
      const orderRef = db.collection('purchaseOrders').doc(req.params.orderId);
      let order: any;
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(orderRef);
        if (!snapshot.exists) throw new Error('PURCHASE_ORDER_NOT_FOUND');
        const current = snapshot.data()!;
        const branches = new Set([req.user?.branchId, ...(req.user?.assignedBranchIds || [])].filter(Boolean));
        if (req.user?.role !== 'ADMIN' && !branches.has(String(current.branchId || ''))) throw new Error('PURCHASE_ORDER_BRANCH_FORBIDDEN');
        const eventRef = db.collection('purchaseOrderEvents').doc();
        order = { ...current, id: snapshot.id, notes: note, updatedAt: new Date().toISOString() };
        transaction.update(orderRef, { notes: note, updatedByUid: req.user?.uid, updatedAt: FieldValue.serverTimestamp() });
        transaction.create(eventRef, {
          eventType: 'NOTE_UPDATED', purchaseOrderId: snapshot.id, purchaseOrderCode: current.code,
          branchId: current.branchId, note, actorUid: req.user?.uid,
          actorName: req.user?.name || req.user?.email || req.user?.uid,
          createdAt: FieldValue.serverTimestamp()
        });
      });
      return res.json({ success: true, data: { order } });
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
