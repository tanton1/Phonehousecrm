import { Request, Response, Router } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import {
  completeMetaOAuth,
  disconnectChannelConnection,
  getMetaOAuthSession,
  importMetaOAuthPages,
  listChannelConnectionEvents,
  listChannelConnections,
  saveManualMetaConnection,
  saveManualZaloConnection,
  startMetaOAuth,
  testMetaConnection,
  updateChannelConnection
} from '../services/channelConnectionService';
import { testZaloConnection } from '../services/zaloOaService';

function actor(req: Request) {
  return {
    uid: req.user!.uid,
    role: req.user!.role,
    branchId: req.user!.branchId,
    assignedBranchIds: req.user!.assignedBranchIds,
    name: req.user!.name || req.user!.email || req.user!.uid
  };
}
function statusFor(error: any): number {
  const message = String(error?.message || 'CHANNEL_CONNECTION_REQUEST_FAILED');
  if (message.includes('FORBIDDEN') || message.includes('ADMIN_REQUIRED')) return 403;
  if (message.includes('NOT_FOUND')) return 404;
  if (message.includes('ALREADY') || message.includes('USED')) return 409;
  if (message.includes('EXPIRED')) return 410;
  if (message.includes('NOT_CONFIGURED')) return 503;
  if (message.includes('META_API_FAILED_190')) return 401;
  if (message.includes('META_API_FAILED_10') || message.includes('META_API_FAILED_200')) return 403;
  if (message.includes('ZALO_API_FAILED_-216') || message.includes('ZALO_API_FAILED_-220') || message.includes('ZALO_API_FAILED_-124')) return 401;
  if (message.includes('ZALO_TOKEN_REFRESH_IN_PROGRESS') || message.includes('ALREADY_PROCESSING')) return 409;
  return 400;
}

function sendError(res: Response, error: any) {
  const message = String(error?.message || 'CHANNEL_CONNECTION_REQUEST_FAILED');
  return res.status(statusFor(error)).json({ success: false, error: message });
}

function requestOrigin(req: Request): string {
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const forwardedProtocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  return forwardedHost ? `${forwardedProtocol}://${forwardedHost}` : '';
}

export function createChannelConnectionsRouter(db: Firestore | null): Router {
  const router = Router();
  const managers = requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER');
  const admins = requireRole('ADMIN');

  router.get('/', authenticateFirebase, managers, async (req, res) => {
    try {
      return res.json({ success: true, data: { items: await listChannelConnections(db, actor(req)) } });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/', authenticateFirebase, admins, async (req, res) => {
    try {
      return res.status(201).json({ success: true, data: await saveManualMetaConnection(db, req.body || {}, actor(req)) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/zalo', authenticateFirebase, admins, async (req, res) => {
    try {
      return res.status(201).json({ success: true, data: await saveManualZaloConnection(db, req.body || {}, actor(req)) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.patch('/:connectionId', authenticateFirebase, admins, async (req, res) => {
    try {
      return res.json({
        success: true,
        data: await updateChannelConnection(db, req.params.connectionId, req.body || {}, actor(req))
      });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.delete('/:connectionId', authenticateFirebase, admins, async (req, res) => {
    try {
      return res.json({
        success: true,
        data: await disconnectChannelConnection(db, req.params.connectionId, actor(req))
      });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/:connectionId/test', authenticateFirebase, admins, async (req, res) => {
    try {
      const snapshot = db
        ? await db.collection('channelConnections').doc(req.params.connectionId).get()
        : null;
      const provider = String(snapshot?.data()?.provider || '');
      return res.json({
        success: true,
        data: provider === 'ZALO_OA'
          ? await testZaloConnection(db, req.params.connectionId, actor(req))
          : await testMetaConnection(db, req.params.connectionId, actor(req), req.body?.subscribe === true)
      });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.get('/meta/oauth/start', authenticateFirebase, admins, async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.json({ success: true, data: await startMetaOAuth(db, actor(req), requestOrigin(req)) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.get('/meta/oauth/callback', async (req, res) => {
    try {
      if (req.query.error) throw new Error(`META_OAUTH_CANCELLED: ${String(req.query.error_description || req.query.error)}`);
      const result = await completeMetaOAuth(db, {
        state: String(req.query.state || ''),
        code: String(req.query.code || '')
      });
      const targetOrigin = JSON.stringify(result.origin);
      const sessionId = JSON.stringify(result.sessionId);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Đã kết nối Meta</title></head><body style="font-family:system-ui;padding:32px;text-align:center"><h2>Đã nhận danh sách Facebook Page</h2><p>Bạn có thể đóng cửa sổ này và quay lại PhoneHouse CRM.</p><script>try{if(window.opener){window.opener.postMessage({type:'PHONEHOUSE_META_OAUTH_COMPLETE',sessionId:${sessionId}},${targetOrigin});}setTimeout(()=>window.close(),800);}catch(e){}</script></body></html>`);
    } catch (error: any) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(statusFor(error)).send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Kết nối Meta thất bại</title></head><body style="font-family:system-ui;padding:32px;text-align:center"><h2>Không thể kết nối Meta</h2><p>${String(error?.message || 'META_OAUTH_FAILED').replace(/[<>&]/g, '')}</p></body></html>`);
    }
  });

  router.get('/meta/oauth/sessions/:sessionId', authenticateFirebase, admins, async (req, res) => {
    try {
      return res.json({
        success: true,
        data: await getMetaOAuthSession(db, req.params.sessionId, actor(req))
      });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/meta/oauth/sessions/:sessionId/import', authenticateFirebase, admins, async (req, res) => {
    try {
      return res.json({
        success: true,
        data: await importMetaOAuthPages(db, req.params.sessionId, req.body?.pages, actor(req))
      });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.get('/events/list', authenticateFirebase, managers, async (req, res) => {
    try {
      return res.json({
        success: true,
        data: {
          items: await listChannelConnectionEvents(
            db,
            actor(req),
            typeof req.query.connectionId === 'string' ? req.query.connectionId : ''
          )
        }
      });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  return router;
}
