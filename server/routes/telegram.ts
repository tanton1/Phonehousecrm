import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import {
  answerTelegramQuery,
  deleteTelegramConfiguration,
  dispatchPendingTelegramOutbox,
  getTelegramAdminConfiguration,
  getTelegramRuntimeStatus,
  loadTelegramConfig,
  registerTelegramWebhook,
  saveTelegramConfiguration,
  scanMissingAttendanceAlerts,
  sendTelegramMessage,
  telegramHelpText,
  telegramIsConfigured,
  unregisterTelegramWebhook
} from '../services/telegramService';

function constantTimeEqual(expectedValue: string, suppliedValue: string): boolean {
  const expected = Buffer.from(expectedValue);
  const supplied = Buffer.from(suppliedValue);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function internalSecretValid(req: Request): boolean {
  const expected = String(process.env.ATTENDANCE_ALERT_CRON_SECRET || process.env.CRON_SECRET || '').trim();
  const supplied = String(req.headers['x-cron-secret'] || req.headers.authorization?.replace(/^Bearer\s+/i, '') || '').trim();
  return Boolean(expected && supplied && constantTimeEqual(expected, supplied));
}

function senderFingerprint(senderId: string): string {
  return crypto.createHash('sha256').update(senderId).digest('hex').slice(0, 14);
}

function errorResponse(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ success: false, code, message, requestId: (res.req as any)?.requestId });
}

function publicBaseUrl(req: Request): string {
  const configuredUrl = String(process.env.PHONEHOUSE_PUBLIC_URL || process.env.APP_URL || '').trim();
  const vercelUrl = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  const requestUrl = `${req.protocol}://${req.get('host')}`;
  return configuredUrl || (vercelUrl ? `https://${vercelUrl}` : requestUrl);
}

export function createTelegramRouter(db: Firestore | null): Router {
  const router = Router();

  router.get('/status', authenticateFirebase, requireRole('ADMIN', 'MANAGER'), async (_req, res) => {
    try {
      const data = await getTelegramRuntimeStatus(db);
      return res.json({ success: true, data });
    } catch (error: any) {
      return errorResponse(res, 500, String(error?.message || 'TELEGRAM_STATUS_FAILED'), 'Không đọc được cấu hình Telegram đã bảo vệ.');
    }
  });

  router.get('/configuration', authenticateFirebase, requireRole('ADMIN', 'MANAGER'), async (_req, res) => {
    try {
      const data = await getTelegramAdminConfiguration(db);
      return res.json({ success: true, data });
    } catch (error: any) {
      return errorResponse(res, 500, String(error?.message || 'TELEGRAM_CONFIGURATION_READ_FAILED'), 'Không đọc được cấu hình Telegram.');
    }
  });

  router.post('/configuration', authenticateFirebase, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    if (!db) return errorResponse(res, 503, 'DATABASE_UNAVAILABLE', 'Máy chủ dữ liệu chưa sẵn sàng.');
    try {
      const configuration = await saveTelegramConfiguration(db, req.body || {}, {
        uid: req.user!.uid,
        name: req.user?.name || req.user?.email || req.user!.uid
      });
      const config = await loadTelegramConfig(db, true);
      const webhook = await registerTelegramWebhook(publicBaseUrl(req), config);
      return res.json({ success: true, data: { configuration, webhook } });
    } catch (error: any) {
      const code = String(error?.message || 'TELEGRAM_CONFIGURATION_SAVE_FAILED').split(':')[0];
      const status = code.startsWith('TELEGRAM_PROVIDER_') ? 422 : code.includes('INVALID') || code.includes('REQUIRED') ? 400 : 500;
      return errorResponse(res, status, code, 'Không lưu được cấu hình. Hãy kiểm tra Bot Token, Chat ID nhóm và quyền gửi tin của Bot.');
    }
  });

  router.delete('/configuration', authenticateFirebase, requireRole('ADMIN', 'MANAGER'), async (_req, res) => {
    if (!db) return errorResponse(res, 503, 'DATABASE_UNAVAILABLE', 'Máy chủ dữ liệu chưa sẵn sàng.');
    try {
      const config = await loadTelegramConfig(db, true);
      if (config.source === 'DATABASE') await unregisterTelegramWebhook(config).catch(() => null);
      await deleteTelegramConfiguration(db);
      return res.json({ success: true, data: { deleted: true } });
    } catch (error: any) {
      return errorResponse(res, 500, String(error?.message || 'TELEGRAM_CONFIGURATION_DELETE_FAILED'), 'Không xóa được cấu hình Telegram.');
    }
  });

  router.post('/test', authenticateFirebase, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    if (!db) return errorResponse(res, 503, 'DATABASE_UNAVAILABLE', 'Máy chủ dữ liệu chưa sẵn sàng.');
    try {
      const config = await loadTelegramConfig(db, true);
      const provider = await sendTelegramMessage([
        '<b>✅ PHONEHOUSE TELEGRAM ĐÃ KẾT NỐI</b>',
        `Người kiểm tra: ${String(req.user?.name || req.user?.uid || 'Quản lý').replace(/[<>&]/g, '')}`,
        `Thời gian: <code>${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</code>`
      ].join('\n'), { config });
      return res.json({ success: true, data: { messageId: provider?.message_id || null } });
    } catch (error: any) {
      return errorResponse(res, 502, String(error?.message || 'TELEGRAM_TEST_FAILED'), 'Không gửi được tin kiểm tra tới group Telegram.');
    }
  });

  router.post('/register-webhook', authenticateFirebase, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    try {
      const config = await loadTelegramConfig(db, true);
      const data = await registerTelegramWebhook(publicBaseUrl(req), config);
      return res.json({ success: true, data });
    } catch (error: any) {
      return errorResponse(res, 502, String(error?.message || 'TELEGRAM_WEBHOOK_REGISTER_FAILED'), 'Không đăng ký được webhook Telegram.');
    }
  });

  router.post('/webhook', async (req, res) => {
    if (!db) return errorResponse(res, 503, 'DATABASE_UNAVAILABLE', 'Máy chủ dữ liệu chưa sẵn sàng.');
    const config = await loadTelegramConfig(db);
    if (!telegramIsConfigured(config)) return errorResponse(res, 503, 'TELEGRAM_NOT_CONFIGURED', 'Telegram chưa được cấu hình.');
    const suppliedSecret = String(req.headers['x-telegram-bot-api-secret-token'] || '');
    if (!constantTimeEqual(config.webhookSecret, suppliedSecret)) return errorResponse(res, 401, 'TELEGRAM_WEBHOOK_UNAUTHORIZED', 'Webhook Telegram không hợp lệ.');
    const update = req.body || {};
    const message = update.message || update.edited_message;
    if (!message) return res.status(200).send('OK');
    const chatId = String(message.chat?.id || '');
    if (chatId !== config.chatId) return res.status(200).send('OK');
    const updateId = String(update.update_id || '');
    if (!updateId) return errorResponse(res, 400, 'TELEGRAM_UPDATE_ID_REQUIRED', 'Thiếu update ID.');

    const updateRef = db.collection('telegramWebhookUpdates').doc(updateId);
    try {
      await updateRef.create({ receivedAt: FieldValue.serverTimestamp(), receivedAtIso: new Date().toISOString(), chatFingerprint: senderFingerprint(chatId) });
    } catch (error: any) {
      const messageText = String(error?.code || error?.message || '').toLowerCase();
      if (messageText.includes('already') || Number(error?.code) === 6) return res.status(200).send('OK');
      return errorResponse(res, 503, 'TELEGRAM_DEDUPE_FAILED', 'Tạm thời chưa thể xử lý tin Telegram.');
    }

    const senderId = String(message.from?.id || '');
    const minuteKey = new Date().toISOString().slice(0, 16);
    const rateId = crypto.createHash('sha256').update(`${chatId}:${senderId}:${minuteKey}`).digest('hex');
    try {
      await db.runTransaction(async transaction => {
        const ref = db.collection('telegramRateLimits').doc(rateId);
        const snapshot = await transaction.get(ref);
        const count = Number(snapshot.data()?.count || 0) + 1;
        if (count > 30) throw new Error('TELEGRAM_RATE_LIMITED');
        transaction.set(ref, { count, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
    } catch (error: any) {
      if (String(error?.message || '').includes('TELEGRAM_RATE_LIMITED')) return errorResponse(res, 429, 'TELEGRAM_RATE_LIMITED', 'Đã gửi quá nhiều lệnh trong một phút.');
      return errorResponse(res, 503, 'TELEGRAM_RATE_LIMIT_UNAVAILABLE', 'Tạm thời chưa thể kiểm tra giới hạn lệnh.');
    }

    if (!config.queriesEnabled) {
      await sendTelegramMessage('⏸ Chức năng tra cứu dữ liệu Telegram hiện chưa được bật.', { chatId, replyToMessageId: message.message_id, config }).catch(() => null);
      return res.status(200).send('OK');
    }
    const text = String(message.text || message.caption || '').trim();
    if (!text) return res.status(200).send('OK');
    const addressedToBot = text.startsWith('/')
      || (Array.isArray(message.entities) && message.entities.some((entity: any) => ['bot_command', 'mention'].includes(String(entity?.type || ''))))
      || message.reply_to_message?.from?.is_bot === true;
    if (!addressedToBot) return res.status(200).send('OK');
    try {
      const answer = await answerTelegramQuery(db, text, senderId);
      await db.collection('telegramQueryAudit').add({
        intent: answer.intent,
        senderFingerprint: senderFingerprint(senderId),
        chatFingerprint: senderFingerprint(chatId),
        createdAt: FieldValue.serverTimestamp()
      });
      await sendTelegramMessage(answer.reply, { chatId, replyToMessageId: message.message_id, config });
    } catch (error: any) {
      console.error(JSON.stringify({ level: 'error', code: 'TELEGRAM_QUERY_FAILED', requestId: req.requestId, sender: senderFingerprint(senderId) }));
      await sendTelegramMessage('⚠️ Bot chưa thể tải dữ liệu lúc này. Vui lòng thử lại sau.', { chatId, replyToMessageId: message.message_id, config }).catch(() => null);
    }
    return res.status(200).send('OK');
  });

  const handleDispatch = async (req: Request, res: Response) => {
    if (!internalSecretValid(req)) return errorResponse(res, 401, 'CRON_UNAUTHORIZED', 'Lịch chạy không hợp lệ.');
    if (!db) return errorResponse(res, 503, 'DATABASE_UNAVAILABLE', 'Máy chủ dữ liệu chưa sẵn sàng.');
    await loadTelegramConfig(db, true);
    const result = await dispatchPendingTelegramOutbox(db, Number(req.body?.limit || 25));
    return res.json({ success: true, data: result });
  };
  router.post('/dispatch', handleDispatch);
  router.get('/dispatch', handleDispatch);

  const handleAttendanceScan = async (req: Request, res: Response) => {
    if (!internalSecretValid(req)) return errorResponse(res, 401, 'CRON_UNAUTHORIZED', 'Lịch chạy không hợp lệ.');
    if (!db) return errorResponse(res, 503, 'DATABASE_UNAVAILABLE', 'Máy chủ dữ liệu chưa sẵn sàng.');
    await loadTelegramConfig(db, true);
    const scan = await scanMissingAttendanceAlerts(db);
    const dispatch = await dispatchPendingTelegramOutbox(db, 50);
    return res.json({ success: true, data: { scan, dispatch } });
  };
  router.post('/scan-attendance', handleAttendanceScan);
  router.get('/scan-attendance', handleAttendanceScan);

  router.get('/help', (_req, res) => res.json({ success: true, data: { html: telegramHelpText() } }));

  return router;
}
