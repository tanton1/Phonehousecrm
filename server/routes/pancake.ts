import { Request, Response, Router } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import {
  getPancakeChannels,
  getPancakeChatSummary,
  getPancakeWebhookSetup,
  listPancakeChatStaff,
  listPancakeConversations,
  listPancakeMessages,
  markPancakeConversationRead,
  PancakeActor,
  processPancakeWebhook,
  repairPancakeEmptyMessages,
  sendPancakeMessage,
  setPancakeBranchMapping,
  syncPancakeConversations,
  updatePancakeConversationWorkflow,
  verifyPancakeWebhookSecret
} from '../services/pancakeService';

function actor(req: Request): PancakeActor {
  return {
    uid: req.user!.uid,
    role: req.user!.role,
    branchId: req.user!.branchId,
    assignedBranchIds: req.user!.assignedBranchIds,
    name: req.user!.name || req.user!.email || req.user!.uid
  };
}

function errorStatus(error: any): number {
  const message = String(error?.message || 'PANCAKE_REQUEST_FAILED');
  if (message.includes('FORBIDDEN')) return 403;
  if (message.includes('NOT_FOUND')) return 404;
  if (message.includes('RATE_LIMITED')) return 429;
  if (message.includes('TIMEOUT')) return 504;
  if (message.includes('TOKEN_NOT_CONFIGURED') || message.includes('BRANCH_AMBIGUOUS')) return 503;
  if (message.includes('ALREADY_PROCESSING')) return 409;
  return 400;
}

function sendError(res: Response, error: any) {
  const message = String(error?.message || 'PANCAKE_REQUEST_FAILED');
  return res.status(errorStatus(error)).json({ success: false, error: message });
}

export function createPancakeRouter(db: Firestore | null): Router {
  const router = Router();

  router.get('/webhook', (req: Request, res: Response) => {
    const configured = process.env.PANCAKE_WEBHOOK_SECRET;
    const provided = req.query.secret || req.query['hub.verify_token'];
    const challenge = req.query.challenge || req.query['hub.challenge'];
    if (!configured) return res.status(503).json({ success: false, error: 'PANCAKE_WEBHOOK_SECRET_NOT_CONFIGURED' });
    if (!verifyPancakeWebhookSecret(provided, configured)) {
      return res.status(403).json({ success: false, error: 'PANCAKE_WEBHOOK_SECRET_INVALID' });
    }
    return res.status(200).send(challenge ? String(challenge) : 'OK');
  });

  router.post('/webhook', async (req: Request, res: Response) => {
    const configured = process.env.PANCAKE_WEBHOOK_SECRET;
    const provided = req.headers['x-pancake-secret'] || req.headers['x-webhook-secret'] || req.query.secret;
    if (!configured) return res.status(503).json({ success: false, error: 'PANCAKE_WEBHOOK_SECRET_NOT_CONFIGURED' });
    if (!verifyPancakeWebhookSecret(provided, configured)) {
      return res.status(401).json({ success: false, error: 'PANCAKE_WEBHOOK_SECRET_INVALID' });
    }
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const result = await processPancakeWebhook(
        db,
        req.body || {},
        typeof req.query.page_id === 'string' ? req.query.page_id : ''
      );
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Pancake webhook]', error?.message || error);
      return sendError(res, error);
    }
  });

  router.get('/channels', authenticateFirebase, async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await getPancakeChannels(db, actor(req)) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/channels/:pageId/branch', authenticateFirebase, requireRole(
    'ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'
  ), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await setPancakeBranchMapping(db, {
        pageId: req.params.pageId,
        branchId: req.body?.branchId
      }, actor(req));
      return res.json({ success: true, data });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.get('/channels/:pageId/webhook-setup', authenticateFirebase, requireRole(
    'ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'
  ), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
      const forwardedProtocol = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
      const origin = forwardedHost ? `${forwardedProtocol}://${forwardedHost}` : '';
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.json({
        success: true,
        data: await getPancakeWebhookSetup(db, req.params.pageId, actor(req), origin)
      });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.get('/conversations', authenticateFirebase, async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await listPancakeConversations(db, {
        branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined
      }, actor(req));
      return res.json({ success: true, data });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.get('/staff', authenticateFirebase, async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await listPancakeChatStaff(
        db,
        typeof req.query.branchId === 'string' ? req.query.branchId : '',
        actor(req)
      );
      return res.json({ success: true, data });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.get('/summary', authenticateFirebase, async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await getPancakeChatSummary(
        db,
        typeof req.query.branchId === 'string' ? req.query.branchId : '',
        actor(req),
        req.query.periodDays ? Number(req.query.periodDays) : 30
      );
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.json({ success: true, data });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.patch('/conversations/:conversationId/workflow', authenticateFirebase, requireRole(
    'ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER', 'CUSTOMER_CARE', 'CSKH', 'SALE_ONLINE', 'SALES', 'SALE'
  ), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await updatePancakeConversationWorkflow(db, req.params.conversationId, {
        assignedStaffId: req.body?.assignedStaffId,
        workflowStatus: req.body?.workflowStatus,
        priority: req.body?.priority,
        nextFollowUpAt: req.body?.nextFollowUpAt,
        outcomeNote: req.body?.outcomeNote
      }, actor(req));
      return res.json({ success: true, data });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.get('/conversations/:conversationId/messages', authenticateFirebase, async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await listPancakeMessages(
        db,
        req.params.conversationId,
        actor(req),
        req.query.refresh !== 'false'
      );
      return res.json({ success: true, data });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/conversations/:conversationId/send', authenticateFirebase, requireRole(
    'ADMIN', 'MANAGER', 'STORE_MANAGER', 'SALES', 'SALE', 'SALE_ONLINE', 'CUSTOMER_CARE', 'CSKH'
  ), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await sendPancakeMessage(db, {
        conversationId: req.params.conversationId,
        text: req.body?.text,
        operationKey: req.body?.operationKey
      }, actor(req));
      return res.json({ success: true, data });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/conversations/:conversationId/read', authenticateFirebase, async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await markPancakeConversationRead(db, req.params.conversationId, actor(req)) });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/sync', authenticateFirebase, requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await syncPancakeConversations(db, {
        pageId: req.body?.pageId,
        cursor: req.body?.cursor
      }, actor(req));
      return res.json({ success: true, data });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  router.post('/repair-messages', authenticateFirebase, requireRole(
    'ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'
  ), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await repairPancakeEmptyMessages(db, {
        pageId: req.body?.pageId,
        limit: req.body?.limit
      }, actor(req));
      return res.json({ success: true, data });
    } catch (error: any) {
      return sendError(res, error);
    }
  });

  return router;
}
