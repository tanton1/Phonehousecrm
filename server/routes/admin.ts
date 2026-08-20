import { Router, Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
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

export function createAdminRouter(db: Firestore | null): Router {
  const router = Router();

  router.use(authenticateFirebase);

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
