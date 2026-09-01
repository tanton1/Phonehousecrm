import crypto from 'node:crypto';
import { raw, Request, Response, Router } from 'express';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { adminAuth, adminBucket } from '../firebaseAdmin';
import { authenticateCustomer, authenticateCustomerIdentity } from '../middleware/authenticateCustomer';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import { sensitiveRateLimit } from '../middleware/security';
import { processCreateWorkOrder } from '../services/technicalService';
import {
  answerPublicCustomerQuestion,
  changePromotionStatus,
  createCustomerConversation,
  createCustomerServiceRequest,
  createPromotion,
  createQuoteApprovalChallenge,
  customerRequestConversionInput,
  decideCustomerQuote,
  emitCustomerNotification,
  getCustomerRepair,
  handoffCustomerConversation,
  linkCustomerAccount,
  listCustomerConversationMessages,
  listCustomerDevices,
  listCustomerNotifications,
  listCustomerRepairs,
  listCustomerServiceRequests,
  listPersonalizedPromotions,
  listPublicPromotions,
  listStaffCustomerRequests,
  listStaffPromotions,
  postCustomerMessage,
  projectCustomerAccount,
  publicBootstrap,
  reviewCustomerRequest,
  savePushSubscription,
  syncCustomerWorkOrderNotification,
  updateCustomerProfile,
  updatePromotion
} from '../services/customerPortalService';

function errorCode(error: any): string {
  return String(error?.message || error?.code || 'CUSTOMER_PORTAL_ERROR').split(':')[0].trim();
}

function sendError(res: Response, error: any) {
  const code = errorCode(error);
  const status = /UNAUTHENTICATED|TOKEN_INVALID/.test(code) ? 401
    : /DENIED|FORBIDDEN|ACCESS_|MISMATCH|BLOCKED/.test(code) ? 403
      : /NOT_FOUND/.test(code) ? 404
        : /ALREADY|CONFLICT|VERSION_CHANGED|IDEMPOTENCY/.test(code) ? 409
          : /DATABASE_UNAVAILABLE|ACCOUNT_LOOKUP_FAILED|PUSH_DELIVERY_FAILED|EVIDENCE_UPLOAD_FAILED/.test(code) ? 503
            : 400;
  return res.status(status).json({ success: false, code, error: code, message: publicMessage(code), requestId: (res.req as Request).requestId });
}

function publicMessage(code: string) {
  const messages: Record<string, string> = {
    CUSTOMER_IDENTITY_ADDITIONAL_VERIFICATION_REQUIRED: 'Có nhiều hồ sơ trùng số điện thoại. Vui lòng nhập mã hóa đơn hoặc IMEI đã mua để liên kết chính xác.',
    CUSTOMER_IDENTITY_VERIFICATION_FAILED: 'Mã hóa đơn hoặc IMEI chưa khớp với hồ sơ khách hàng.',
    CUSTOMER_ACCOUNT_ALREADY_LINKED: 'Hồ sơ này đã được liên kết với một tài khoản khác. Vui lòng liên hệ CSKH để xác minh.',
    CUSTOMER_ACCOUNT_RELINK_REQUIRES_SUPPORT: 'Số điện thoại tài khoản đã thay đổi. Vui lòng liên hệ CSKH để liên kết lại an toàn.',
    CUSTOMER_QUOTE_FRESH_OTP_REQUIRED: 'Vui lòng xác nhận lại OTP mới trước khi đồng ý báo giá.',
    CUSTOMER_QUOTE_VERSION_CHANGED: 'Báo giá đã thay đổi. Vui lòng tải lại và kiểm tra phiên bản mới.',
    CUSTOMER_REQUEST_REQUIRED_FIELDS: 'Vui lòng nhập đầy đủ thiết bị, IMEI, chi nhánh và mô tả lỗi.',
    CUSTOMER_CHAT_ACCESS_DENIED: 'Bạn không có quyền truy cập cuộc trò chuyện này.',
    CUSTOMER_REPAIR_ACCESS_DENIED: 'Bạn không có quyền xem phiếu sửa chữa này.',
    PROMOTION_REQUIRED_FIELDS_INVALID: 'Thông tin chiến dịch hoặc thời gian hiệu lực chưa hợp lệ.'
  };
  return messages[code] || 'Không thể xử lý yêu cầu. Vui lòng kiểm tra thông tin và thử lại.';
}

function customerAuthority(req: Request) {
  return {
    uid: req.customer!.uid,
    phoneNormalized: req.customer!.phoneNormalized,
    account: req.customer!.account
  };
}

function staffActor(req: Request) {
  return {
    uid: req.user!.uid,
    name: req.user!.name,
    role: req.user!.role,
    branchId: req.user!.branchId,
    assignedBranchIds: req.user!.assignedBranchIds
  };
}

const CUSTOMER_EVIDENCE_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm'
]);

function evidenceLimit(contentType: string) {
  return contentType.startsWith('video/') ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
}

async function sha256Object(file: any) {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = file.createReadStream();
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function customerEvidenceReadUrl(objectPath: string) {
  const expiresAt = Date.now() + 5 * 60_000;
  const [url] = await adminBucket.file(objectPath).getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt });
  return { url, expiresAt: new Date(expiresAt).toISOString() };
}

export function createCustomerPortalRouter(db: Firestore | null): Router {
  const router = Router();

  const staffRouter = Router();
  staffRouter.use(authenticateFirebase);
  staffRouter.use(requireRole('ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'STORE_MANAGER', 'SALES', 'SALE', 'CUSTOMER_CARE', 'CSKH'));

  staffRouter.get('/service-requests', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await listStaffCustomerRequests(db, staffActor(req), {
        branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined
      });
      return res.json({ success: true, data });
    } catch (error) { return sendError(res, error); }
  });

  staffRouter.patch('/service-requests/:id/review', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      return res.json({ success: true, data: await reviewCustomerRequest(db, staffActor(req), req.params.id, req.body || {}) });
    } catch (error) { return sendError(res, error); }
  });

  staffRouter.post('/service-requests/:id/convert', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const requestSnapshot = await db.collection('customerServiceRequests').doc(req.params.id).get();
      if (!requestSnapshot.exists) throw new Error('CUSTOMER_REQUEST_NOT_FOUND');
      const request = { id: requestSnapshot.id, ...requestSnapshot.data() };
      const conversion = customerRequestConversionInput(request, req.body || {});
      const result = await processCreateWorkOrder(db, conversion as any, req.user!);
      void syncCustomerWorkOrderNotification(db, result.workOrderId, 'REQUEST_CONVERTED').catch(error => console.warn('[Customer conversion notification]', error));
      return res.status(201).json({ success: true, data: result });
    } catch (error) { return sendError(res, error); }
  });

  staffRouter.get('/promotions', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.json({ success: true, data: await listStaffPromotions(db, staffActor(req)) }); }
    catch (error) { return sendError(res, error); }
  });

  staffRouter.post('/promotions', requireRole('ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'STORE_MANAGER'), async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.status(201).json({ success: true, data: await createPromotion(db, staffActor(req), req.body || {}) }); }
    catch (error) { return sendError(res, error); }
  });

  staffRouter.put('/promotions/:id', requireRole('ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'STORE_MANAGER'), async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.json({ success: true, data: await updatePromotion(db, staffActor(req), req.params.id, req.body || {}) }); }
    catch (error) { return sendError(res, error); }
  });

  staffRouter.post('/promotions/:id/status', requireRole('ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'STORE_MANAGER'), async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.json({ success: true, data: await changePromotionStatus(db, staffActor(req), req.params.id, req.body?.status) }); }
    catch (error) { return sendError(res, error); }
  });

  staffRouter.get('/evidence/:id/url', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const snapshot = await db.collection('customerEvidenceRecords').doc(req.params.id).get();
      if (!snapshot.exists || snapshot.data()?.status !== 'ACTIVE') throw new Error('CUSTOMER_EVIDENCE_NOT_FOUND');
      const requestSnapshot = await db.collection('customerServiceRequests').doc(String(snapshot.data()?.requestId || '')).get();
      const branchId = String(requestSnapshot.data()?.branchId || '');
      const actor = staffActor(req);
      if (actor.role !== 'ADMIN' && actor.role !== 'REGIONAL_MANAGER' && actor.branchId !== branchId && !(actor.assignedBranchIds || []).includes(branchId)) throw new Error('CUSTOMER_EVIDENCE_ACCESS_DENIED');
      return res.json({ success: true, data: await customerEvidenceReadUrl(String(snapshot.data()?.objectPath || '')) });
    } catch (error) { return sendError(res, error); }
  });

  router.use('/staff', staffRouter);

  router.get('/public/bootstrap', async (_req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return res.json({ success: true, data: await publicBootstrap(db) });
    } catch (error) { return sendError(res, error); }
  });

  router.get('/public/promotions', async (_req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return res.json({ success: true, data: await listPublicPromotions(db) });
    } catch (error) { return sendError(res, error); }
  });

  router.get('/public/branches', async (_req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const bootstrap = await publicBootstrap(db);
      res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
      return res.json({ success: true, data: bootstrap.branches });
    } catch (error) { return sendError(res, error); }
  });

  router.post('/public/chat', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.json({ success: true, data: await answerPublicCustomerQuestion(db, req.body?.message) }); }
    catch (error) { return sendError(res, error); }
  });

  router.post('/auth/link-account', sensitiveRateLimit, authenticateCustomerIdentity, async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await linkCustomerAccount(db, req.customerIdentity!, req.body || {});
      return res.json({ success: true, data });
    } catch (error) { return sendError(res, error); }
  });

  router.use(authenticateCustomer);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  router.get('/me', async (req, res) => {
    return res.json({ success: true, data: projectCustomerAccount(req.customer!.uid, req.customer!.account) });
  });

  router.patch('/me', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.json({ success: true, data: await updateCustomerProfile(db, customerAuthority(req), req.body || {}) }); }
    catch (error) { return sendError(res, error); }
  });

  router.get('/devices', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.json({ success: true, data: await listCustomerDevices(db, customerAuthority(req)) }); }
    catch (error) { return sendError(res, error); }
  });

  router.get('/devices/:id', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const devices = await listCustomerDevices(db, customerAuthority(req));
      const device = devices.find(item => item.id === req.params.id);
      if (!device) throw new Error('CUSTOMER_DEVICE_NOT_FOUND');
      const repairs = (await listCustomerRepairs(db, customerAuthority(req))).filter(item => item.customerDeviceId === device.id);
      return res.json({ success: true, data: { ...device, repairHistory: repairs } });
    } catch (error) { return sendError(res, error); }
  });

  router.get('/repairs', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const [items, requests] = await Promise.all([
        listCustomerRepairs(db, customerAuthority(req)),
        listCustomerServiceRequests(db, customerAuthority(req))
      ]);
      return res.json({ success: true, data: { items, requests } });
    } catch (error) { return sendError(res, error); }
  });

  router.get('/repairs/:id', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.json({ success: true, data: await getCustomerRepair(db, customerAuthority(req), req.params.id) }); }
    catch (error) { return sendError(res, error); }
  });

  router.post('/service-requests', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await createCustomerServiceRequest(db, customerAuthority(req), req.body || {}) as any;
      await emitCustomerNotification(db, {
        customerAccountUid: req.customer!.uid,
        idempotencyKey: `REQUEST_CREATED:${data.id}`,
        type: 'SERVICE_REQUEST_SUBMITTED',
        title: 'Đã gửi yêu cầu tới PhoneHouse',
        body: `${data.model} · Nhân viên sẽ sớm xác nhận với bạn.`,
        url: '/khach-hang/sua-chua',
        branchId: data.branchId
      });
      return res.status(201).json({ success: true, data });
    } catch (error) { return sendError(res, error); }
  });

  router.post('/service-requests/:id/evidence', sensitiveRateLimit, async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const requestSnapshot = await db.collection('customerServiceRequests').doc(req.params.id).get();
      if (!requestSnapshot.exists || requestSnapshot.data()?.customerAccountUid !== req.customer!.uid) throw new Error('CUSTOMER_EVIDENCE_ACCESS_DENIED');
      if (!['SUBMITTED', 'UNDER_REVIEW'].includes(String(requestSnapshot.data()?.status || ''))) throw new Error('CUSTOMER_EVIDENCE_REQUEST_CLOSED');
      if (Array.isArray(requestSnapshot.data()?.evidenceIds) && requestSnapshot.data()!.evidenceIds.length >= 12) throw new Error('CUSTOMER_EVIDENCE_LIMIT_REACHED');
      const contentType = String(req.body?.contentType || '').toLowerCase();
      const size = Number(req.body?.size || 0);
      if (!CUSTOMER_EVIDENCE_MIME_TYPES.has(contentType) || !Number.isFinite(size) || size <= 0 || size > evidenceLimit(contentType)) throw new Error('CUSTOMER_EVIDENCE_FILE_INVALID');
      const sessionId = `CEUS_${crypto.randomBytes(18).toString('hex')}`;
      const evidenceId = `CEVD_${crypto.randomBytes(18).toString('hex')}`;
      const extension = (contentType.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '').slice(0, 10);
      const objectPath = `customer-evidence/${req.customer!.uid}/${req.params.id}/${evidenceId}.${extension}`;
      const expiresAtMs = Date.now() + 5 * 60_000;
      const [uploadUrl] = await adminBucket.file(objectPath).getSignedUrl({ version: 'v4', action: 'write', expires: expiresAtMs, contentType });
      await db.collection('customerEvidenceUploadSessions').doc(sessionId).create({
        id: sessionId, evidenceId, objectPath, requestId: req.params.id, customerAccountUid: req.customer!.uid,
        branchId: requestSnapshot.data()?.branchId, contentType, expectedSize: size, status: 'OPEN', expiresAtMs,
        createdAt: FieldValue.serverTimestamp()
      });
      return res.status(201).json({ success: true, data: {
        sessionId, evidenceId, uploadUrl,
        contentUploadUrl: `/api/customer-portal/service-requests/evidence-upload-sessions/${encodeURIComponent(sessionId)}/content`,
        completeUrl: `/api/customer-portal/service-requests/evidence-upload-sessions/${encodeURIComponent(sessionId)}/complete`,
        expiresAt: new Date(expiresAtMs).toISOString(), headers: { 'Content-Type': contentType }
      } });
    } catch (error) { return sendError(res, error); }
  });

  router.put('/service-requests/evidence-upload-sessions/:id/content', sensitiveRateLimit, raw({ type: [...CUSTOMER_EVIDENCE_MIME_TYPES], limit: '26mb' }), async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const reference = db.collection('customerEvidenceUploadSessions').doc(req.params.id);
      const snapshot = await reference.get();
      if (!snapshot.exists || snapshot.data()?.customerAccountUid !== req.customer!.uid) throw new Error('CUSTOMER_EVIDENCE_ACCESS_DENIED');
      const session = snapshot.data()!;
      if (session.status === 'UPLOADED' || session.status === 'COMPLETED') return res.json({ success: true, data: { status: session.status } });
      if (session.status !== 'OPEN' || Number(session.expiresAtMs || 0) < Date.now()) throw new Error('CUSTOMER_EVIDENCE_SESSION_EXPIRED');
      const body = Buffer.isBuffer(req.body) ? req.body : req.body instanceof Uint8Array ? Buffer.from(req.body) : null;
      if (!body?.length || body.length !== Number(session.expectedSize || 0)) throw new Error('CUSTOMER_EVIDENCE_SIZE_MISMATCH');
      const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (contentType !== session.contentType) throw new Error('CUSTOMER_EVIDENCE_CONTENT_TYPE_MISMATCH');
      await adminBucket.file(session.objectPath).save(body, { resumable: false, validation: 'crc32c', metadata: { contentType, cacheControl: 'private, no-store, max-age=0' } });
      await reference.set({ status: 'UPLOADED', uploadedAt: FieldValue.serverTimestamp(), uploadedSize: body.length }, { merge: true });
      return res.json({ success: true, data: { status: 'UPLOADED' } });
    } catch (error) { return sendError(res, error); }
  });

  router.post('/service-requests/evidence-upload-sessions/:id/complete', sensitiveRateLimit, async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const sessionRef = db.collection('customerEvidenceUploadSessions').doc(req.params.id);
      const sessionSnapshot = await sessionRef.get();
      if (!sessionSnapshot.exists || sessionSnapshot.data()?.customerAccountUid !== req.customer!.uid) throw new Error('CUSTOMER_EVIDENCE_ACCESS_DENIED');
      const session = sessionSnapshot.data()!;
      if (session.status === 'COMPLETED') return res.json({ success: true, data: { id: session.evidenceId, status: 'ACTIVE' } });
      if (!['OPEN', 'UPLOADED'].includes(String(session.status || '')) || Number(session.expiresAtMs || 0) < Date.now()) throw new Error('CUSTOMER_EVIDENCE_SESSION_EXPIRED');
      const file = adminBucket.file(String(session.objectPath || ''));
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size || 0) !== Number(session.expectedSize || 0) || String(metadata.contentType || '') !== String(session.contentType || '')) throw new Error('CUSTOMER_EVIDENCE_UPLOAD_MISMATCH');
      const sha256 = await sha256Object(file);
      const record = {
        id: session.evidenceId,
        requestId: session.requestId,
        customerAccountUid: req.customer!.uid,
        branchId: session.branchId,
        objectPath: session.objectPath,
        contentType: session.contentType,
        size: Number(metadata.size || 0),
        sha256,
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      };
      await db.runTransaction(async transaction => {
        const latestSession = await transaction.get(sessionRef);
        if (latestSession.data()?.status === 'COMPLETED') return;
        const requestRef = db.collection('customerServiceRequests').doc(session.requestId);
        const requestSnapshot = await transaction.get(requestRef);
        if (!requestSnapshot.exists || requestSnapshot.data()?.customerAccountUid !== req.customer!.uid) throw new Error('CUSTOMER_EVIDENCE_ACCESS_DENIED');
        if ((requestSnapshot.data()?.evidenceIds || []).length >= 12) throw new Error('CUSTOMER_EVIDENCE_LIMIT_REACHED');
        const evidenceIds = [...new Set([...(requestSnapshot.data()?.evidenceIds || []), record.id])].slice(0, 12);
        transaction.create(db.collection('customerEvidenceRecords').doc(record.id), record);
        transaction.update(requestRef, { evidenceIds, updatedAt: FieldValue.serverTimestamp() });
        transaction.update(sessionRef, { status: 'COMPLETED', completedAt: FieldValue.serverTimestamp(), sha256 });
      });
      return res.json({ success: true, data: { id: record.id, status: 'ACTIVE', contentType: record.contentType, size: record.size } });
    } catch (error) { return sendError(res, error); }
  });

  router.get('/evidence/:id/url', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const snapshot = await db.collection('customerEvidenceRecords').doc(req.params.id).get();
      if (!snapshot.exists || snapshot.data()?.status !== 'ACTIVE' || snapshot.data()?.customerAccountUid !== req.customer!.uid) throw new Error('CUSTOMER_EVIDENCE_ACCESS_DENIED');
      return res.json({ success: true, data: await customerEvidenceReadUrl(String(snapshot.data()?.objectPath || '')) });
    } catch (error) { return sendError(res, error); }
  });

  router.post('/repairs/:id/quote-approval-challenges', sensitiveRateLimit, async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.status(201).json({ success: true, data: await createQuoteApprovalChallenge(db, customerAuthority(req), req.params.id) }); }
    catch (error) { return sendError(res, error); }
  });

  router.post('/repairs/:id/quote-decisions', sensitiveRateLimit, async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const data = await decideCustomerQuote(db, customerAuthority(req), req.params.id, req.body || {});
      await emitCustomerNotification(db, {
        customerAccountUid: req.customer!.uid,
        idempotencyKey: `QUOTE_DECISION:${data.id}`,
        type: 'QUOTE_DECISION_RECORDED',
        title: data.decision === 'ACCEPT' ? 'Đã xác nhận báo giá' : data.decision === 'REJECT' ? 'Đã từ chối báo giá' : 'Đã yêu cầu tư vấn lại',
        body: `Phiếu ${req.params.id} · ${Number(data.approvedFinalAmount || 0).toLocaleString('vi-VN')}đ`,
        url: `/khach-hang/sua-chua?repair=${encodeURIComponent(req.params.id)}`,
        workOrderId: req.params.id
      });
      return res.json({ success: true, data });
    } catch (error) { return sendError(res, error); }
  });

  router.get('/promotions', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.json({ success: true, data: await listPersonalizedPromotions(db, customerAuthority(req)) }); }
    catch (error) { return sendError(res, error); }
  });

  router.post('/chat/conversations', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.status(201).json({ success: true, data: await createCustomerConversation(db, customerAuthority(req), req.body || {}) }); }
    catch (error) { return sendError(res, error); }
  });

  router.get('/chat/conversations/:id/messages', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.json({ success: true, data: await listCustomerConversationMessages(db, customerAuthority(req), req.params.id) }); }
    catch (error) { return sendError(res, error); }
  });

  router.post('/chat/conversations/:id/messages', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.json({ success: true, data: await postCustomerMessage(db, customerAuthority(req), req.params.id, req.body || {}) }); }
    catch (error) { return sendError(res, error); }
  });

  router.post('/chat/conversations/:id/handoff', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.json({ success: true, data: await handoffCustomerConversation(db, customerAuthority(req), req.params.id) }); }
    catch (error) { return sendError(res, error); }
  });

  router.get('/notifications', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.json({ success: true, data: await listCustomerNotifications(db, customerAuthority(req)) }); }
    catch (error) { return sendError(res, error); }
  });

  router.post('/notifications/:id/read', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try {
      const reference = db.collection('customerNotifications').doc(req.params.id);
      const snapshot = await reference.get();
      if (!snapshot.exists || snapshot.data()?.customerAccountUid !== req.customer!.uid) throw new Error('CUSTOMER_NOTIFICATION_ACCESS_DENIED');
      await reference.set({ read: true, readAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.json({ success: true, data: { id: req.params.id, read: true } });
    } catch (error) { return sendError(res, error); }
  });

  router.post('/push-subscriptions', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    try { return res.status(201).json({ success: true, data: await savePushSubscription(db, customerAuthority(req), req.body || {}) }); }
    catch (error) { return sendError(res, error); }
  });

  return router;
}
