import crypto from 'crypto';
import { Router, Request, Response, raw } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { adminBucket } from '../firebaseAdmin';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';

type EvidenceType = 'CRM' | 'TECHNICAL' | 'ATTENDANCE';

function actorCanAccessBranch(req: Request, branchId: string) {
  const role = String(req.user?.role || '').toUpperCase();
  return role === 'ADMIN' || role === 'REGIONAL_MANAGER' || req.user?.branchId === branchId || (req.user?.assignedBranchIds || []).includes(branchId);
}

function imageLimit(type: EvidenceType) {
  if (type === 'CRM') return 8 * 1024 * 1024;
  if (type === 'ATTENDANCE') return 12 * 1024 * 1024;
  return 20 * 1024 * 1024;
}

function vietnamDateString() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function sha256StorageObject(file: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = file.createReadStream();
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function issueEvidenceReadUrl(objectPath: string) {
  const expiresAtMs = Date.now() + 5 * 60_000;
  const [url] = await adminBucket.file(objectPath).getSignedUrl({ version: 'v4', action: 'read', expires: expiresAtMs });
  return { url, expiresAt: new Date(expiresAtMs).toISOString() };
}

function inlineEvidenceBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value && typeof (value as any).toBuffer === 'function') return Buffer.from((value as any).toBuffer());
  if ((value as any)?.type === 'Buffer' && Array.isArray((value as any).data)) return Buffer.from((value as any).data);
  return null;
}

async function resolveResource(db: Firestore, req: Request, input: any) {
  const type = String(input.resourceType || '').toUpperCase() as EvidenceType;
  const resourceId = String(input.resourceId || '').trim();
  if (!['CRM', 'TECHNICAL', 'ATTENDANCE'].includes(type) || !resourceId) throw new Error('EVIDENCE_RESOURCE_REQUIRED');
  if (type === 'ATTENDANCE') {
    const branchId = String(input.branchId || '').trim();
    if (!branchId || !actorCanAccessBranch(req, branchId)) throw new Error('BRANCH_ACCESS_DENIED');
    const snap = await db.collection('attendance').doc(resourceId).get();
    if (snap.exists) {
      const data = snap.data() || {};
      const actualBranchId = String(data.branchId || '');
      const role = String(req.user?.role || '').toUpperCase();
      const mayReview = ['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'].includes(role);
      if (!actualBranchId || !actorCanAccessBranch(req, actualBranchId)) throw new Error('BRANCH_ACCESS_DENIED');
      if (String(data.staffId || '') !== req.user?.uid && !mayReview) throw new Error('EVIDENCE_ASSIGNMENT_DENIED');
      return { type, resourceId, branchId: actualBranchId };
    }
    const expectedId = `ATT_${req.user!.uid}_${vietnamDateString().replace(/-/g, '')}`;
    if (resourceId !== expectedId) throw new Error('ATTENDANCE_EVIDENCE_RESOURCE_INVALID');
    return { type, resourceId, branchId };
  }
  const collection = type === 'CRM' ? 'leads' : 'technicalWorkOrders';
  const snap = await db.collection(collection).doc(resourceId).get();
  if (!snap.exists) {
    const intakeAllowed = type === 'TECHNICAL' && String(input.contextId || '') === 'INTAKE' && String(input.branchId || '');
    if (!intakeAllowed) throw new Error('EVIDENCE_RESOURCE_NOT_FOUND');
    const branchId = String(input.branchId || '');
    if (!actorCanAccessBranch(req, branchId)) throw new Error('BRANCH_ACCESS_DENIED');
    return { type, resourceId, branchId };
  }
  const data = snap.data() || {};
  const branchId = String(data.branchId || '');
  if (!branchId || !actorCanAccessBranch(req, branchId)) throw new Error('BRANCH_ACCESS_DENIED');
  const role = String(req.user?.role || '').toUpperCase();
  if (type === 'CRM' && !['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER'].includes(role)) {
    const assigned = String(data.assignedStaffId || data.assignedUserId || data.staffId || '');
    if (assigned && assigned !== req.user?.uid) throw new Error('EVIDENCE_ASSIGNMENT_DENIED');
  }
  if (type === 'TECHNICAL' && ['TECH', 'TECHNICIAN'].includes(role)) {
    const assigned = [data.currentCustodianUid, data.technicianUid, ...(Array.isArray(data.assignedTechnicianUids) ? data.assignedTechnicianUids : [])].filter(Boolean);
    if (assigned.length && !assigned.includes(req.user?.uid)) throw new Error('EVIDENCE_ASSIGNMENT_DENIED');
  }
  return { type, resourceId, branchId };
}

export function createEvidenceRouter(db: Firestore | null): Router {
  const router = Router();
  router.use(authenticateFirebase);

  router.post('/upload-sessions', async (req, res) => {
    try {
      if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
      const resource = await resolveResource(db, req, req.body || {});
      const contentType = String(req.body?.contentType || '').toLowerCase();
      const size = Number(req.body?.size || 0);
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(contentType)) throw new Error('EVIDENCE_IMAGE_TYPE_NOT_ALLOWED');
      if (!Number.isFinite(size) || size <= 0 || size > imageLimit(resource.type)) throw new Error('EVIDENCE_FILE_SIZE_INVALID');
      const sessionId = `EUS_${crypto.randomBytes(18).toString('hex')}`;
      const evidenceId = `EVD_${crypto.randomBytes(18).toString('hex')}`;
      const extension = contentType.split('/')[1]?.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'jpg';
      const objectPath = `evidence/${resource.branchId}/${resource.type.toLowerCase()}/${resource.resourceId}/${evidenceId}.${extension}`;
      const expiresAtMs = Date.now() + 5 * 60_000;
      const [uploadUrl] = await adminBucket.file(objectPath).getSignedUrl({ version: 'v4', action: 'write', expires: expiresAtMs, contentType });
      await db.collection('evidenceUploadSessions').doc(sessionId).create({
        id: sessionId, evidenceId, objectPath, ...resource,
        contextId: String(req.body?.contextId || ''), contentType, expectedSize: size,
        actorUid: req.user!.uid, status: 'OPEN', expiresAtMs, createdAt: FieldValue.serverTimestamp()
      });
      return res.status(201).json({
        success: true,
        data: {
          sessionId,
          evidenceId,
          uploadUrl,
          contentUploadUrl: `/api/evidence/upload-sessions/${encodeURIComponent(sessionId)}/content`,
          expiresAt: new Date(expiresAtMs).toISOString(),
          headers: { 'Content-Type': contentType }
        }
      });
    } catch (error: any) {
      return res.status(String(error?.message || '').includes('DENIED') ? 403 : 400).json({ success: false, code: String(error?.message || 'EVIDENCE_UPLOAD_SESSION_FAILED').split(':')[0], message: 'Không thể cấp phiên tải bằng chứng.' });
    }
  });

  router.put('/upload-sessions/:id/content', raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    limit: '4mb'
  }), async (req, res) => {
    try {
      if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
      const sessionRef = db.collection('evidenceUploadSessions').doc(req.params.id);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) throw new Error('EVIDENCE_SESSION_NOT_FOUND');
      const session = sessionSnap.data()!;
      if (session.actorUid !== req.user!.uid) throw new Error('EVIDENCE_SESSION_FORBIDDEN');
      if (session.status === 'COMPLETED' || session.status === 'UPLOADED') {
        return res.json({ success: true, data: { sessionId: req.params.id, status: session.status } });
      }
      if (session.status !== 'OPEN' || Number(session.expiresAtMs || 0) <= Date.now()) throw new Error('EVIDENCE_SESSION_EXPIRED');
      const uploadBody = Buffer.isBuffer(req.body)
        ? req.body
        : req.body instanceof Uint8Array
          ? Buffer.from(req.body)
          : req.body?.type === 'Buffer' && Array.isArray(req.body?.data)
            ? Buffer.from(req.body.data)
            : null;
      if (!uploadBody || uploadBody.length <= 0) throw new Error('EVIDENCE_UPLOAD_BODY_REQUIRED');
      const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (contentType !== String(session.contentType || '')) throw new Error('EVIDENCE_UPLOAD_CONTENT_TYPE_MISMATCH');
      if (uploadBody.length !== Number(session.expectedSize || 0)) throw new Error('EVIDENCE_UPLOAD_SIZE_MISMATCH');

      if (String(session.type || '') === 'ATTENDANCE') {
        if (uploadBody.length > 450 * 1024) throw new Error('ATTENDANCE_EVIDENCE_TOO_LARGE');
        const sha256 = crypto.createHash('sha256').update(uploadBody).digest('hex');
        const record = {
          id: session.evidenceId,
          resourceType: session.type,
          resourceId: session.resourceId,
          contextId: session.contextId || '',
          branchId: session.branchId,
          objectPath: '',
          storageMode: 'INLINE_FIRESTORE',
          inlineData: uploadBody,
          sha256,
          contentType: session.contentType,
          size: uploadBody.length,
          createdByUid: req.user!.uid,
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        };
        await db.runTransaction(async transaction => {
          const latest = await transaction.get(sessionRef);
          if (latest.data()?.status === 'COMPLETED') return;
          transaction.create(db.collection('evidenceRecords').doc(record.id), {
            ...record,
            createdAtServer: FieldValue.serverTimestamp()
          });
          transaction.update(sessionRef, {
            status: 'COMPLETED',
            completedAt: FieldValue.serverTimestamp(),
            uploadedSize: uploadBody.length,
            sha256,
            storageMode: record.storageMode
          });
        });
        return res.json({ success: true, data: { sessionId: req.params.id, status: 'COMPLETED' } });
      }

      const file = adminBucket.file(String(session.objectPath || ''));
      await file.save(uploadBody, {
        resumable: false,
        validation: 'crc32c',
        metadata: { contentType, cacheControl: 'private, max-age=0, no-store' }
      });
      await sessionRef.update({
        status: 'UPLOADED',
        uploadedAt: FieldValue.serverTimestamp(),
        uploadedSize: uploadBody.length
      });
      return res.json({ success: true, data: { sessionId: req.params.id, status: 'UPLOADED' } });
    } catch (error: any) {
      const code = String(error?.message || 'EVIDENCE_CONTENT_UPLOAD_FAILED').split(':')[0];
      console.error('[Evidence Content Upload Error]', {
        requestId: req.requestId,
        code,
        providerCode: error?.code,
        errorName: error?.name
      });
      const status = code.includes('FORBIDDEN') ? 403 : code.includes('TOO_LARGE') ? 413 : 400;
      return res.status(status).json({ success: false, code, message: 'Không thể tải ảnh bằng chứng lên máy chủ.' });
    }
  });

  router.post('/upload-sessions/:id/complete', async (req, res) => {
    try {
      if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
      const sessionRef = db.collection('evidenceUploadSessions').doc(req.params.id);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) throw new Error('EVIDENCE_SESSION_NOT_FOUND');
      const session = sessionSnap.data()!;
      if (session.actorUid !== req.user!.uid) throw new Error('EVIDENCE_SESSION_FORBIDDEN');
      if (session.status === 'COMPLETED') {
        const existing = await db.collection('evidenceRecords').doc(session.evidenceId).get();
        if (!existing.exists || existing.data()?.status !== 'ACTIVE') throw new Error('EVIDENCE_NOT_ACTIVE');
        const existingData = existing.data()!;
        const { inlineData: _inlineData, ...publicRecord } = existingData;
        if (existingData.storageMode === 'INLINE_FIRESTORE') {
          return res.json({ success: true, data: { ...publicRecord, url: '', urlExpiresAt: null } });
        }
        const access = await issueEvidenceReadUrl(String(existingData.objectPath || session.objectPath));
        return res.json({ success: true, data: { ...publicRecord, ...access, urlExpiresAt: access.expiresAt } });
      }
      if (!['OPEN', 'UPLOADED'].includes(String(session.status || '')) || Number(session.expiresAtMs || 0) <= Date.now()) throw new Error('EVIDENCE_SESSION_EXPIRED');
      const file = adminBucket.file(session.objectPath);
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size || 0) !== Number(session.expectedSize) || String(metadata.contentType || '') !== String(session.contentType)) throw new Error('EVIDENCE_UPLOAD_MISMATCH');
      const sha256 = await sha256StorageObject(file);
      const record = {
        id: session.evidenceId, resourceType: session.type, resourceId: session.resourceId,
        contextId: session.contextId || '', branchId: session.branchId, objectPath: session.objectPath,
        sha256, contentType: session.contentType, size: Number(metadata.size || 0),
        createdByUid: req.user!.uid, status: 'ACTIVE', createdAt: new Date().toISOString()
      };
      await db.runTransaction(async transaction => {
        const latest = await transaction.get(sessionRef);
        if (latest.data()?.status === 'COMPLETED') return;
        transaction.create(db.collection('evidenceRecords').doc(record.id), { ...record, createdAtServer: FieldValue.serverTimestamp() });
        transaction.update(sessionRef, { status: 'COMPLETED', completedAt: FieldValue.serverTimestamp(), sha256 });
      });
      const access = await issueEvidenceReadUrl(record.objectPath);
      return res.json({ success: true, data: { ...record, ...access, urlExpiresAt: access.expiresAt } });
    } catch (error: any) {
      return res.status(String(error?.message || '').includes('FORBIDDEN') ? 403 : 400).json({ success: false, code: String(error?.message || 'EVIDENCE_COMPLETE_FAILED').split(':')[0], message: 'Không thể xác nhận ảnh bằng chứng.' });
    }
  });

  router.get('/:id/url', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'FIRESTORE_NOT_CONFIGURED' });
    const snap = await db.collection('evidenceRecords').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ success: false, code: 'EVIDENCE_NOT_FOUND' });
    const record = snap.data()!;
    if (record.status !== 'ACTIVE' || !actorCanAccessBranch(req, String(record.branchId || ''))) return res.status(403).json({ success: false, code: 'EVIDENCE_ACCESS_DENIED' });
    try {
      await resolveResource(db, req, {
        resourceType: record.resourceType,
        resourceId: record.resourceId,
        contextId: record.contextId,
        branchId: record.branchId
      });
    } catch {
      return res.status(403).json({ success: false, code: 'EVIDENCE_RESOURCE_ACCESS_DENIED' });
    }
    if (record.storageMode === 'INLINE_FIRESTORE') {
      return res.json({
        success: true,
        data: {
          url: `/api/evidence/${encodeURIComponent(req.params.id)}/content`,
          expiresAt: null,
          requiresAuthorization: true
        }
      });
    }
    const access = await issueEvidenceReadUrl(record.objectPath);
    return res.json({ success: true, data: access });
  });

  // Authenticated same-origin content endpoint. This supports the compact
  // Firestore-backed attendance photos as well as Storage-backed evidence
  // without exposing a long-lived public URL.
  router.get('/:id/content', async (req, res) => {
    if (!db) return res.status(503).json({ success: false, code: 'FIRESTORE_NOT_CONFIGURED' });
    const snap = await db.collection('evidenceRecords').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ success: false, code: 'EVIDENCE_NOT_FOUND' });
    const record = snap.data()!;
    if (record.status !== 'ACTIVE' || !actorCanAccessBranch(req, String(record.branchId || ''))) {
      return res.status(403).json({ success: false, code: 'EVIDENCE_ACCESS_DENIED' });
    }
    try {
      await resolveResource(db, req, {
        resourceType: record.resourceType,
        resourceId: record.resourceId,
        contextId: record.contextId,
        branchId: record.branchId
      });
      res.setHeader('Content-Type', String(record.contentType || 'image/jpeg'));
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (record.storageMode === 'INLINE_FIRESTORE') {
        const content = inlineEvidenceBuffer(record.inlineData);
        if (!content?.length) throw new Error('EVIDENCE_INLINE_CONTENT_MISSING');
        res.setHeader('Content-Length', String(content.length));
        return res.status(200).send(content);
      }
      const objectPath = String(record.objectPath || '');
      if (!objectPath) throw new Error('EVIDENCE_OBJECT_PATH_MISSING');
      return adminBucket.file(objectPath).createReadStream()
        .on('error', () => {
          if (!res.headersSent) res.status(404).json({ success: false, code: 'EVIDENCE_CONTENT_NOT_FOUND' });
          else res.end();
        })
        .pipe(res);
    } catch (error: any) {
      if (res.headersSent) return res.end();
      const code = String(error?.message || 'EVIDENCE_CONTENT_FAILED').split(':')[0];
      return res.status(code.includes('DENIED') ? 403 : 400).json({ success: false, code, message: 'Không thể mở ảnh bằng chứng.' });
    }
  });

  router.post('/:id/revoke', requireRole('MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, code: 'FIRESTORE_NOT_CONFIGURED' });
    const ref = db.collection('evidenceRecords').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ success: false, code: 'EVIDENCE_NOT_FOUND' });
    if (!actorCanAccessBranch(req, String(snap.data()?.branchId || ''))) return res.status(403).json({ success: false, code: 'EVIDENCE_ACCESS_DENIED' });
    await ref.update({ status: 'REVOKED', revokedAt: FieldValue.serverTimestamp(), revokedByUid: req.user!.uid, revokeReason: String(req.body?.reason || '') });
    return res.json({ success: true, data: { id: req.params.id, status: 'REVOKED' } });
  });

  return router;
}
