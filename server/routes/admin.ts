import { Router, Request, Response } from 'express';
import { Firestore, FieldPath, FieldValue } from 'firebase-admin/firestore';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  let ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '127.0.0.1';
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  return ip;
}

const OPERATIONAL_SNAPSHOT_COLLECTIONS = [
  'leads',
  'tradeIns',
  'invoices',
  'partners',
  'funds',
  'cashTransactions',
  'transfers',
  'purchaseOrders',
  'attendance',
  'leaveRequests',
  'users'
] as const;

type OperationalSnapshotCollection = typeof OPERATIONAL_SNAPSHOT_COLLECTIONS[number];

export function normalizeOperationalSnapshotLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 150;
  return Math.min(200, Math.max(25, Math.floor(parsed)));
}

function serializeFirestoreValue(value: any): any {
  if (value == null) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serializeFirestoreValue(nested)]));
  }
  return value;
}

export function redactOperationalUser(input: Record<string, any>): Record<string, any> {
  const redacted = { ...input };
  [
    'password',
    'temporaryPassword',
    'passcode',
    'faceEmbedding',
    'liveEmbedding',
    'faceFeatureVector',
    'facePhotoUrl',
    'biometricProfile',
    'accessToken',
    'refreshToken',
    'secret'
  ].forEach(field => delete redacted[field]);
  return redacted;
}

export function operationalDocumentProjection(document: { id: string; data: () => Record<string, any> }): Record<string, any> {
  // Never let an old embedded `id` override the actual Firestore path. Doing
  // so can make ADMIN/ALL select one row while financial APIs load another.
  return { ...document.data(), id: document.id };
}

async function readOperationalSnapshotCollection(
  db: Firestore,
  collectionName: OperationalSnapshotCollection,
  limit: number
) {
  const collectionRef = db.collection(collectionName);
  const [pageSnapshot, countSnapshot] = await Promise.all([
    collectionRef.orderBy(FieldPath.documentId(), 'desc').limit(limit).get(),
    collectionRef.count().get()
  ]);
  const total = Number(countSnapshot.data().count || 0);
  const items = pageSnapshot.docs
    .map(document => {
      const raw = operationalDocumentProjection(document);
      const safe = collectionName === 'users' ? redactOperationalUser(raw) : raw;
      return serializeFirestoreValue(safe);
    })
    .filter(item => collectionName !== 'partners' || (item.isActive !== false && item.isArchived !== true));
  return {
    items,
    summary: {
      total,
      loaded: items.length,
      partial: total > items.length
    }
  };
}

export function createAdminRouter(db: Firestore | null): Router {
  const router = Router();

  router.use(authenticateFirebase);

  /**
   * Bounded replacement for the old ADMIN-only collection listeners. It is
   * intentionally a recent/page projection, not an unrestricted data export.
   * Feature pages can progressively replace this snapshot with their own
   * cursor APIs without reopening browser-wide Firestore reads.
   */
  router.get(
    '/operational-snapshot',
    requireRole('ADMIN'),
    async (req: Request, res: Response) => {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      try {
        const limit = normalizeOperationalSnapshotLimit(req.query.limit);
        const entries = await Promise.all(
          OPERATIONAL_SNAPSHOT_COLLECTIONS.map(async collectionName => [
            collectionName,
            await readOperationalSnapshotCollection(db, collectionName, limit)
          ] as const)
        );
        const data = Object.fromEntries(entries);
        return res.json({
          success: true,
          data: {
            limit,
            generatedAt: new Date().toISOString(),
            collections: Object.fromEntries(
              Object.entries(data).map(([name, result]) => [name, result.items])
            ),
            summary: Object.fromEntries(
              Object.entries(data).map(([name, result]) => [name, result.summary])
            )
          }
        });
      } catch (error: any) {
        return res.status(500).json({
          success: false,
          error: error?.message || 'OPERATIONAL_SNAPSHOT_FAILED'
        });
      }
    }
  );

  /**
   * POST /api/admin/branches/:branchId/network-enroll
   * Authoritatively enrolls the router's current observed public IP into branch.allowedPublicIps
   * Restricted to ADMIN role
   */
  router.post(
    '/branches/:branchId/network-enroll',
    requireRole('ADMIN'),
    async (req: Request, res: Response) => {
      if (!db) {
        return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      }

      const { branchId } = req.params;
      const clientIp = getClientIp(req);

      if (!clientIp || clientIp === '127.0.0.1' || clientIp === '::1') {
        return res.status(400).json({
          success: false,
          error: `IP_LOCAL_INVALID: Không thể đăng ký IP nội bộ localhost (${clientIp}). Vui lòng kết nối vào mạng Wi-Fi thực tế của cửa hàng.`
        });
      }

      try {
        const branchRef = db.collection('branches').doc(branchId);
        const branchSnap = await branchRef.get();
        if (!branchSnap.exists) {
          return res.status(404).json({
            success: false,
            error: `BRANCH_NOT_FOUND: Không tìm thấy chi nhánh ID "${branchId}".`
          });
        }

        // Add IP to allowedPublicIps array and update legacy storePublicIp
        await branchRef.update({
          allowedPublicIps: FieldValue.arrayUnion(clientIp),
          storePublicIp: clientIp,
          updatedAt: FieldValue.serverTimestamp()
        });

        // Record Audit Log
        await db.collection('auditLogs').add({
          action: 'BRANCH_NETWORK_IP_ENROLLED',
          branchId,
          enrolledIp: clientIp,
          enrolledByUid: req.user!.uid,
          enrolledByName: req.user!.name || 'Admin',
          userAgent: req.headers['user-agent'] || '',
          timestamp: new Date().toISOString(),
          createdAt: FieldValue.serverTimestamp()
        });

        return res.json({
          success: true,
          data: {
            branchId,
            enrolledIp: clientIp,
            message: `Đã đăng ký địa chỉ IP "${clientIp}" vào danh sách mạng được phép của chi nhánh thành công.`
          }
        });
      } catch (err: any) {
        console.error('[Network Enroll Error]:', err);
        return res.status(500).json({
          success: false,
          error: err?.message || 'Lỗi đăng ký IP chi nhánh.'
        });
      }
    }
  );

  return router;
}
