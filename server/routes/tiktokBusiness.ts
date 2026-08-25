import { Request, Response, Router } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { getStoredTikTokBusinessConnection } from '../services/channelConnectionService';
import {
  extractTikTokBusinessId,
  processTikTokBusinessWebhook,
  verifyTikTokWebhookSignature
} from '../services/tiktokBusinessService';

type RequestWithRawBody = Request & { rawBody?: Buffer };

export function createTikTokBusinessRouter(db: Firestore | null): Router {
  const router = Router();

  router.get('/webhook', (_req: Request, res: Response) => {
    return res.status(200).json({ success: true, provider: 'TIKTOK_BUSINESS', webhook: 'READY' });
  });

  router.post('/webhook', async (req: RequestWithRawBody, res: Response) => {
    if (!db) return res.status(503).send('DATABASE_UNAVAILABLE');
    const businessId = extractTikTokBusinessId(req.body || {});
    if (!businessId) return res.status(400).send('TIKTOK_BUSINESS_ID_MISSING');
    try {
      const connection = await getStoredTikTokBusinessConnection(db, businessId);
      if (!connection) return res.status(404).send('TIKTOK_CONNECTION_NOT_FOUND');
      if (!connection.appSecret) return res.status(503).send('TIKTOK_APP_SECRET_NOT_CONFIGURED');
      const rawBody = req.rawBody || Buffer.alloc(0);
      if (!verifyTikTokWebhookSignature(rawBody, req.headers['tiktok-signature'], connection.appSecret)) {
        return res.status(401).send('TIKTOK_WEBHOOK_SIGNATURE_INVALID');
      }
      const result = await processTikTokBusinessWebhook(db, req.body || {});
      console.info('[TikTok Business webhook]', { businessId, ...result });
      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('[TikTok Business webhook]', error?.message || error);
      return res.status(500).send('TIKTOK_WEBHOOK_PROCESSING_FAILED');
    }
  });

  return router;
}
