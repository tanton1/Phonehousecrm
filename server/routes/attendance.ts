import { Router, Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { processServerCheckIn, processServerCheckOut } from '../services/attendanceService';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireBranchAccess } from '../middleware/requireBranchAccess';

export function createAttendanceRouter(db: Firestore | null): Router {
  const router = Router();

  // Helper to extract client IP safely
  const getClientIp = (req: Request) => {
    const forwarded = req.headers['x-forwarded-for'];
    let ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '127.0.0.1';
    if (ip.startsWith('::ffff:')) {
      ip = ip.replace('::ffff:', '');
    }
    return ip;
  };

  // 1. Network & IP Verification Endpoint (Requires Auth)
  router.post('/network-check', authenticateFirebase, async (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const branchId = req.body?.branchId || req.user?.branchId;
    const isLocal = ip === '127.0.0.1' || ip === '::1';

    let isAllowed = isLocal;

    // Read authoritative allowedPublicIps from Firestore Branch document
    if (db && branchId && !isLocal) {
      try {
        const branchSnap = await db.collection('branches').doc(branchId).get();
        if (branchSnap.exists) {
          const allowedIps: string[] = branchSnap.data()?.allowedPublicIps || [];
          isAllowed = allowedIps.includes(ip);
        }
      } catch (err) {
        console.warn('[Network Check] Failed to read branch IP allowlist:', err);
      }
    }

    const now = new Date();
    const serverTimeIso = now.toISOString();
    const serverTimeFormatted = now.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh'
    });
    const serverDateFormatted = now.toLocaleDateString('vi-VN', {
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh'
    });

    res.json({
      success: true,
      data: {
        clientIp: ip,
        isAllowed,
        branchId,
        verifiedAt: serverTimeIso,
        serverTimeIso,
        serverTimeFormatted,
        serverDateFormatted,
        serverTimestamp: now.getTime(),
        networkSignature: isLocal ? 'STORE_INTRANET_LAN' : (isAllowed ? 'STORE_PUBLIC_GATEWAY' : 'CELLULAR_CARRIER_IP')
      }
    });
  });

  // 2. Authoritative Check-In Endpoint (Requires Firebase Auth Token & Branch Access)
  router.post('/check-in', authenticateFirebase, requireBranchAccess(), async (req: Request, res: Response) => {
    try {
      const ip = getClientIp(req);
      const bodyWithAuth = {
        ...req.body,
        staffId: req.user?.uid || req.body.staffId,
        staffUid: req.user?.uid,
        branchId: req.body.branchId || req.user?.branchId,
        clientIp: ip
      };
      const result = await processServerCheckIn(db, bodyWithAuth);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Attendance CheckIn Error]:', error);
      const isConflict = error?.message?.includes('ALREADY_CHECKED_IN');
      const isConfigError = error?.message?.includes('BRANCH_GPS_NOT_CONFIGURED') || error?.message?.includes('BRANCH_NOT_FOUND');
      const statusCode = isConflict ? 409 : (isConfigError ? 422 : 400);
      return res.status(statusCode).json({
        success: false,
        error: error?.message || 'Lỗi xử lý điểm danh vào ca.'
      });
    }
  });

  // 3. Authoritative Check-Out Endpoint (Requires Firebase Auth Token & Branch Access)
  router.post('/check-out', authenticateFirebase, requireBranchAccess(), async (req: Request, res: Response) => {
    try {
      const bodyWithAuth = {
        ...req.body,
        staffId: req.user?.uid || req.body.staffId,
        staffUid: req.user?.uid,
        branchId: req.body.branchId || req.user?.branchId
      };
      const result = await processServerCheckOut(db, bodyWithAuth);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Attendance CheckOut Error]:', error);
      return res.status(400).json({
        success: false,
        error: error?.message || 'Lỗi xử lý kết thúc ca làm việc.'
      });
    }
  });

  // 4. Authoritative Attendance Review Endpoint (Requires Manager/Admin)
  router.post('/review', authenticateFirebase, async (req: Request, res: Response) => {
    try {
      const { attendanceId, decision, reason } = req.body;

      if (!attendanceId || !decision) {
        return res.status(400).json({
          success: false,
          error: 'Thiếu thông tin attendanceId hoặc decision phê duyệt.'
        });
      }

      const reviewerUid = req.user?.uid;
      const reviewerName = req.user?.name || req.user?.email || reviewerUid;
      const reviewerRole = req.user?.role;
      const reviewerBranchId = req.user?.branchId;
      const reviewerAssignedBranches = req.user?.assignedBranchIds || [];

      if (!reviewerUid || !reviewerRole || !reviewerBranchId) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHENTICATED: Không xác thực được danh tính hoặc chi nhánh người phê duyệt.'
        });
      }

      const { processAttendanceReview } = await import('../services/attendanceService');
      const result = await processAttendanceReview(db, {
        attendanceId,
        decision,
        reviewerUid,
        reviewerName,
        reviewerRole,
        reviewerBranchId,
        reviewerAssignedBranches,
        reason
      });

      return res.json({
        success: true,
        data: result,
        message: `Đã ${decision === 'APPROVE' ? 'phê duyệt' : 'từ chối'} bản ghi chấm công ${attendanceId}.`
      });
    } catch (error: any) {
      console.error('[Attendance Review Error]:', error);
      const isForbidden = error?.message?.includes('PERMISSION_DENIED') || error?.message?.includes('BRANCH_FORBIDDEN');
      return res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: error?.message || 'Lỗi xử lý phê duyệt chấm công.'
      });
    }
  });

  return router;
}
