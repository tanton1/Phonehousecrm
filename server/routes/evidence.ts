import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { adminBucket } from '../firebaseAdmin';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';

type EvidenceType = 'CRM' | 'TECHNICAL';

function actorCanAccessBranch(req: Request, branchId: string) {
  const role = String(req.user?.role || '').toUpperCase();
  return role === 'ADMIN' || role === 'REGIONAL_MANAGER' || req.user?.branchId === branchId || (req.user?.assignedBranchIds || []).includes(branchId);
}

function imageLimit(type: EvidenceType) {
  return type === 'CRM' ? 8 * 1024 * 1024 : 20 * 1024 * 1024;
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

async function resolveResource(db: Firestore, req: Request, input: any) {
  const type = String(input.resourceType || '').toUpperCase() as EvidenceType;
  const resourceId = String(input.resourceId || '').trim();
  if (!['CRM', 'TECHNICAL'].includes(type) || !resourceId) throw new Error('EVIDENCE_RESOURCE_REQUIRED');
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
      return res.status(201).json({ success: true, data: { sessionId, evidenceId, uploadUrl, expiresAt: new Date(expiresAtMs).toISOString(), headers: { 'Content-Type': contentType } } });
    } catch (error: any) {
      return res.status(String(error?.message || '').includes('DENIED') ? 403 : 400).json({ success: false, code: String(error?.message || 'EVIDENCE_UPLOAD_SESSION_FAILED').split(':')[0], message: 'Không thể cấp phiên tải bằng chứng.' });
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
        const access = await issueEvidenceReadUrl(String(existing.data()?.objectPath || session.objectPath));
        return res.json({ success: true, data: { ...existing.data(), ...access, urlExpiresAt: access.expiresAt } });
      }
      if (session.status !== 'OPEN' || Number(session.expiresAtMs || 0) <= Date.now()) throw new Error('EVIDENCE_SESSION_EXPIRED');
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
    const access = await issueEvidenceReadUrl(record.objectPath);
    return res.json({ success: true, data: access });
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
