import { Router, Request, Response } from 'express';
import { Firestore } from 'firebase/firestore';
import { processServerCheckIn, processServerCheckOut } from '../services/attendanceService';

export function createAttendanceRouter(db: Firestore | null): Router {
  const router = Router();

  // 1. Network & IP Verification Endpoint
  router.post('/network-check', (req: Request, res: Response) => {
    const forwarded = req.headers['x-forwarded-for'];
    let ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '127.0.0.1';
    if (ip.startsWith('::ffff:')) {
      ip = ip.replace('::ffff:', '');
    }

    const { branchId } = req.body || {};
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.');
    const isAllowed = isLocal || ip.startsWith('113.161.') || ip.startsWith('14.232.') || ip.startsWith('171.244.');

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

  // 2. Authoritative Check-In Endpoint
  router.post('/check-in', async (req: Request, res: Response) => {
    try {
      const result = await processServerCheckIn(db, req.body);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Attendance CheckIn Error]:', error);
      const isConflict = error?.message?.includes('ALREADY_CHECKED_IN');
      return res.status(isConflict ? 409 : 400).json({
        success: false,
        error: error?.message || 'Lỗi xử lý điểm danh vào ca.'
      });
    }
  });

  // 3. Authoritative Check-Out Endpoint
  router.post('/check-out', async (req: Request, res: Response) => {
    try {
      const result = await processServerCheckOut(db, req.body);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Attendance CheckOut Error]:', error);
      return res.status(400).json({
        success: false,
        error: error?.message || 'Lỗi xử lý kết thúc ca làm việc.'
      });
    }
  });

  return router;
}
