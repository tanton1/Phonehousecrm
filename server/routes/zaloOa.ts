import { Request, Response, Router } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { getStoredZaloOaConnection } from '../services/channelConnectionService';
import {
  extractZaloOaId,
  processZaloOaWebhook,
  verifyZaloWebhookSignature
} from '../services/zaloOaService';

type RequestWithRawBody = Request & { rawBody?: Buffer };

export function createZaloOaRouter(db: Firestore | null): Router {
  const router = Router();

  router.get('/webhook', (_req: Request, res: Response) => {
    return res.status(200).json({ success: true, provider: 'ZALO_OA', webhook: 'READY' });
  });

  router.post('/webhook', async (req: RequestWithRawBody, res: Response) => {
    if (!db) return res.status(503).send('DATABASE_UNAVAILABLE');
    const oaId = extractZaloOaId(req.body || {});
    if (!oaId) return res.status(400).send('ZALO_OA_ID_MISSING');
    try {
      const connection = await getStoredZaloOaConnection(db, oaId);
      if (!connection) return res.status(404).send('ZALO_CONNECTION_NOT_FOUND');
      if (!connection.webhookSecret) return res.status(503).send('ZALO_WEBHOOK_SECRET_NOT_CONFIGURED');
      const rawBody = req.rawBody || Buffer.alloc(0);
      if (!verifyZaloWebhookSignature(rawBody, req.body || {}, req.headers['x-zevent-signature'], connection.webhookSecret)) {
        return res.status(401).send('ZALO_WEBHOOK_SIGNATURE_INVALID');
      }
      const result = await processZaloOaWebhook(db, req.body || {});
      console.info('[Zalo OA webhook]', { oaId, ...result });
      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('[Zalo OA webhook]', error?.message || error);
      return res.status(500).send('ZALO_WEBHOOK_PROCESSING_FAILED');
    }
  });

  return router;
}
