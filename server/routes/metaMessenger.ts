import { Request, Response, Router } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import {
  getMetaMessengerConfig,
  processMetaMessengerWebhook,
  verifyMetaWebhookSignature,
  verifyMetaWebhookToken
} from '../services/metaMessengerService';

type RequestWithRawBody = Request & { rawBody?: Buffer };

export function createMetaMessengerRouter(db: Firestore | null): Router {
  const router = Router();

  router.get('/webhook', (req: Request, res: Response) => {
    const config = getMetaMessengerConfig();
    const mode = req.query['hub.mode'];
    const providedToken = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (!config.verifyToken) return res.status(503).send('META_WEBHOOK_VERIFY_TOKEN_NOT_CONFIGURED');
    if (mode !== 'subscribe' || !verifyMetaWebhookToken(providedToken, config.verifyToken)) {
      return res.status(403).send('META_WEBHOOK_VERIFICATION_FAILED');
    }
    return res.status(200).send(String(challenge || ''));
  });

  router.post('/webhook', async (req: RequestWithRawBody, res: Response) => {
    const config = getMetaMessengerConfig();
    if (!config.appSecret) return res.status(503).send('META_APP_SECRET_NOT_CONFIGURED');
    const rawBody = req.rawBody || Buffer.alloc(0);
    if (!verifyMetaWebhookSignature(rawBody, req.headers['x-hub-signature-256'], config.appSecret)) {
      return res.status(401).send('META_WEBHOOK_SIGNATURE_INVALID');
    }
    if (!db) return res.status(503).send('DATABASE_UNAVAILABLE');
    try {
      const result = await processMetaMessengerWebhook(db, req.body || {});
      console.info('[Meta Messenger webhook]', result);
      return res.status(200).send('EVENT_RECEIVED');
    } catch (error: any) {
      console.error('[Meta Messenger webhook]', error?.message || error);
      return res.status(500).send('META_WEBHOOK_PROCESSING_FAILED');
    }
  });

  return router;
}
