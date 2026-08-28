import { Router, Request, Response } from 'express';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { processServerCheckIn, processServerCheckOut, resolveAttendanceRadius, resolveShiftAssignment } from '../services/attendanceService';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireBranchAccess } from '../middleware/requireBranchAccess';
import { requireRole } from '../middleware/requireRole';
import { listShiftBoard, saveShiftBoard, upsertShiftDefinition, upsertShiftDepartmentPolicy } from '../services/shiftSchedulingService';
import { createAttendanceVerificationSession } from '../services/attendanceVerificationService';
import { normalizeRole } from '../../shared/permissions';
import { listAttendanceHistory } from '../services/attendanceHistoryService';
import {
  attendanceTelegramOutboxId,
  dispatchTelegramOutboxEvent,
  loadTelegramConfig,
  processAttendanceLocationHeartbeat
} from '../services/telegramService';

const CHECKLIST_CATEGORIES = new Set(['OPENING', 'MID_SHIFT', 'CLOSING']);
const CHECKLIST_PRIORITIES = new Set(['HIGH', 'MEDIUM', 'NORMAL']);
const safeText = (value: unknown, max = 500) => String(value || '').trim().slice(0, max);
const elevatedHrRole = (role: unknown) => ['ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'STORE_MANAGER'].includes(normalizeRole(role));

function actorCanAccessBranch(actor: { role?: string; branchId?: string; assignedBranchIds?: string[] }, branchId: string) {
  const role = normalizeRole(actor.role);
  return role === 'ADMIN' || role === 'REGIONAL_MANAGER' || actor.branchId === branchId || (actor.assignedBranchIds || []).includes(branchId);
}

export function validateChecklistInput(input: any) {
  const date = safeText(input?.date, 10);
  const title = safeText(input?.title, 240);
  const category = safeText(input?.category, 30).toUpperCase();
  const priority = safeText(input?.priority || 'NORMAL', 20).toUpperCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) throw new Error('CHECKLIST_REQUIRED_FIELDS');
  if (!CHECKLIST_CATEGORIES.has(category) || !CHECKLIST_PRIORITIES.has(priority)) throw new Error('CHECKLIST_CLASSIFICATION_INVALID');
  return {
    date, title, category, priority,
    categoryName: category === 'OPENING' ? 'Đầu ca trực' : category === 'MID_SHIFT' ? 'Trong ca làm' : 'Cuối ca trực & Bàn giao',
    timeHint: safeText(input?.timeHint, 100),
    note: safeText(input?.note, 2000),
    photoProofUrl: safeText(input?.photoProofUrl, 1000),
    isCompleted: input?.isCompleted === true,
    isCustomTask: input?.isCustomTask === true
  };
}

export function createAttendanceRouter(db: Firestore | null): Router {
  const router = Router();

  const getActor = (req: Request) => ({
    uid: req.user!.uid,
    role: req.user!.role,
    branchId: req.user?.branchId,
    assignedBranchIds: req.user?.assignedBranchIds || [],
    name: req.user?.name || req.user?.email || req.user!.uid
  });

  const scheduleErrorStatus = (error: any) => {
    const message = String(error?.message || error || '');
    if (message.includes('FORBIDDEN')) return 403;
    if (message.includes('NOT_FOUND')) return 404;
    if (message.includes('FIRESTORE_NOT_CONFIGURED')) return 503;
    return 400;
  };

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

  // Authoritative context shown before check-in: server time, fixed/published shift and store GPS.
  router.post('/check-in-context', authenticateFirebase, requireBranchAccess(), async (req: Request, res: Response) => {
    try {
      if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
      const branchId = String(req.body?.branchId || req.user?.branchId || '').trim();
      if (!branchId) throw new Error('BRANCH_REQUIRED');
      const branchSnap = await db.collection('branches').doc(branchId).get();
      if (!branchSnap.exists) throw new Error('BRANCH_NOT_FOUND');
      const branch = branchSnap.data() || {};
      if (branch.isActive === false || branch.active === false) throw new Error('BRANCH_NOT_ACTIVE');
      if (typeof branch.gpsLatitude !== 'number' || typeof branch.gpsLongitude !== 'number') {
        throw new Error('BRANCH_GPS_NOT_CONFIGURED');
      }
      const now = new Date();
      const workDate = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
      // When an overnight shift is still open, use that exact assignment for
      // checkout instead of requiring a new schedule on the following date.
      const openAttendance = await db.collection('attendance')
        .where('staffId', '==', req.user!.uid)
        .where('branchId', '==', branchId)
        .where('attendanceStatus', '==', 'CHECKED_IN')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      const openRecord = openAttendance.empty ? null : openAttendance.docs[0].data();
      const shift = openRecord ? {
        shiftId: String(openRecord.shiftId || 'SHIFT_CUSTOM'),
        shiftName: String(openRecord.shiftName || 'Ca đang làm'),
        startTime: String(openRecord.scheduledStart || ''),
        endTime: String(openRecord.scheduledEnd || ''),
        breakMinutes: Number(openRecord.scheduledBreakMinutes ?? openRecord.breakDurationMinutes ?? 0),
        isOff: false
      } : await resolveShiftAssignment(db, {
        staffId: req.user!.uid,
        branchId,
        workDate
      });
      return res.json({
        success: true,
        data: {
          serverTimeIso: now.toISOString(),
          serverTimeFormatted: now.toLocaleTimeString('vi-VN', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Ho_Chi_Minh'
          }),
          serverDateFormatted: now.toLocaleDateString('vi-VN', {
            weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh'
          }),
          workDate,
          shift,
          branch: {
            id: branchId,
            name: String(branch.name || branch.branchName || branchId),
            latitude: branch.gpsLatitude,
            longitude: branch.gpsLongitude,
            radiusMeters: resolveAttendanceRadius(branch)
          }
        }
      });
    } catch (error: any) {
      const code = String(error?.message || 'CHECKIN_CONTEXT_FAILED').split(':')[0];
      const status = code.includes('NOT_FOUND') ? 404 : code.includes('NOT_CONFIGURED') ? 422 : 400;
      return res.status(status).json({ success: false, code, message: error?.message || 'Không tải được thông tin ca làm việc.' });
    }
  });

  // Server-scoped monthly history. Staff can only read their own records;
  // managers can drill into staff whose attendance belongs to an accessible branch.
  router.get('/history', authenticateFirebase, async (req: Request, res: Response) => {
    try {
      const result = await listAttendanceHistory(db, getActor(req), {
        staffUid: req.query.staffUid,
        branchId: req.query.branchId,
        month: req.query.month
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      const code = String(error?.message || 'ATTENDANCE_HISTORY_FAILED').split(':')[0];
      const status = code.includes('FORBIDDEN') ? 403 : code.includes('NOT_FOUND') ? 404 : code.includes('NOT_CONFIGURED') ? 503 : 400;
      return res.status(status).json({ success: false, code, message: 'Không tải được lịch sử chấm công.' });
    }
  });

  // 2. Authoritative Check-In Endpoint (Requires Firebase Auth Token & Branch Access)
  router.post('/verification-sessions', authenticateFirebase, requireBranchAccess(), async (req: Request, res: Response) => {
    try {
      const branchId = String(req.body?.branchId || req.user?.branchId || '').trim();
      if (!branchId) return res.status(400).json({ success: false, code: 'BRANCH_REQUIRED', message: 'Cần chọn chi nhánh trước khi xác minh.' });
      const result = await createAttendanceVerificationSession(db, {
        uid: req.user!.uid,
        branchId,
        deviceId: String(req.body?.deviceId || ''),
        action: req.body?.action === 'CHECK_OUT' ? 'CHECK_OUT' : 'CHECK_IN',
        clientIp: getClientIp(req)
      });
      return res.status(201).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, code: String(error?.message || 'VERIFICATION_SESSION_FAILED').split(':')[0], message: 'Không tạo được phiên xác minh chấm công.' });
    }
  });

  router.post('/check-in', authenticateFirebase, requireBranchAccess(), async (req: Request, res: Response) => {
    try {
      await loadTelegramConfig(db).catch(() => null);
      const ip = getClientIp(req);
      const sanitizedPayload = {
        staffId: req.user!.uid,
        staffName: req.user?.name || req.user?.email || 'Nhân viên',
        role: req.user?.role || 'STAFF',
        branchId: req.body.branchId || req.user?.branchId || '',
        branchName: req.body.branchName,
        userCoords: req.body.userCoords,
        faceCaptureBase64: req.body.faceCaptureBase64,
        faceSessionId: req.body.faceSessionId,
        verificationNonce: req.body.verificationNonce,
        deviceId: req.body.deviceId,
        photoEvidenceId: req.body.photoEvidenceId,
        qrScanned: Boolean(req.body.qrScanned),
        clientIp: ip
      };
      const result = await processServerCheckIn(db, sanitizedPayload);
      await dispatchTelegramOutboxEvent(db, attendanceTelegramOutboxId(result.id, 'CHECK_IN')).catch(error => {
        console.warn('[Attendance Telegram CheckIn Dispatch]:', String(error?.message || error));
      });
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
      await loadTelegramConfig(db).catch(() => null);
      const bodyWithAuth = {
        ...req.body,
        staffId: req.user?.uid || req.body.staffId,
        staffUid: req.user?.uid,
        branchId: req.body.branchId || req.user?.branchId,
        clientIp: getClientIp(req)
      };
      const result = await processServerCheckOut(db, bodyWithAuth);
      await dispatchTelegramOutboxEvent(db, attendanceTelegramOutboxId(result.id, 'CHECK_OUT')).catch(error => {
        console.warn('[Attendance Telegram CheckOut Dispatch]:', String(error?.message || error));
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Attendance CheckOut Error]:', error);
      return res.status(400).json({
        success: false,
        error: error?.message || 'Lỗi xử lý kết thúc ca làm việc.'
      });
    }
  });

  // Foreground-only location heartbeat. Mobile browsers cannot guarantee
  // background execution; the API therefore reports only observations that
  // were actually received while PhoneHouseCRM was open.
  router.post('/location-heartbeats', authenticateFirebase, requireBranchAccess(), async (req: Request, res: Response) => {
    try {
      await loadTelegramConfig(db).catch(() => null);
      const branchId = String(req.body?.branchId || req.user?.branchId || '').trim();
      const result = await processAttendanceLocationHeartbeat(db, {
        branchId,
        latitude: Number(req.body?.latitude),
        longitude: Number(req.body?.longitude),
        accuracyMeters: Number(req.body?.accuracyMeters || 0)
      }, { uid: req.user!.uid, name: req.user?.name || req.user?.email || req.user!.uid });
      if (result.eventId) {
        await dispatchTelegramOutboxEvent(db, result.eventId).catch(error => {
          console.warn('[Attendance Telegram Location Dispatch]:', String(error?.message || error));
        });
      }
      return res.json({ success: true, data: result });
    } catch (error: any) {
      const code = String(error?.message || 'ATTENDANCE_LOCATION_FAILED').split(':')[0];
      const status = code.includes('NOT_OPEN') ? 409 : code.includes('FORBIDDEN') ? 403 : code.includes('NOT_FOUND') ? 404 : 400;
      return res.status(status).json({ success: false, code, message: 'Không thể cập nhật vị trí trong ca.' });
    }
  });

  // 4. Authoritative Attendance Review Endpoint (Requires Manager/Admin)
  router.post('/review', authenticateFirebase, requireRole('ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
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

  router.post('/leave-requests', authenticateFirebase, async (req: Request, res: Response) => {
    try {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      const actor = getActor(req);
      const branchId = String(actor.branchId || '').trim();
      const type = String(req.body?.type || '').trim().toUpperCase();
      const startDate = String(req.body?.startDate || '').trim();
      const endDate = String(req.body?.endDate || '').trim();
      const totalDays = Number(req.body?.totalDays);
      const reason = String(req.body?.reason || '').trim().slice(0, 1000);
      if (!branchId) throw new Error('BRANCH_REQUIRED');
      if (!['ANNUAL_LEAVE', 'HALF_DAY', 'UNPAID', 'SHIFT_SWAP', 'SICK_LEAVE'].includes(type)) throw new Error('LEAVE_TYPE_INVALID');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) throw new Error('LEAVE_DATE_INVALID');
      if (!Number.isFinite(totalDays) || totalDays <= 0 || totalDays > 365 || !reason) throw new Error('LEAVE_REQUIRED_FIELDS');
      const leaveRef = db.collection('leaveRequests').doc();
      let result: any;
      await db.runTransaction(async transaction => {
        const branch = await transaction.get(db.collection('branches').doc(branchId));
        if (!branch.exists || branch.data()?.isActive === false) throw new Error('BRANCH_NOT_ACTIVE');
        const now = new Date().toISOString();
        result = {
          id: leaveRef.id, code: `NP-${now.slice(0, 7).replace('-', '')}-${leaveRef.id.slice(0, 5).toUpperCase()}`,
          staffId: actor.uid, staffName: actor.name, role: actor.role, branchId,
          branchName: String(branch.data()?.name || req.body?.branchName || ''),
          type, startDate, endDate, totalDays, reason,
          swapWithStaffId: String(req.body?.swapWithStaffId || '').trim() || null,
          swapWithStaffName: String(req.body?.swapWithStaffName || '').trim() || null,
          swapDate: String(req.body?.swapDate || '').trim() || null,
          status: 'PENDING', createdAt: now, createdByUid: actor.uid
        };
        transaction.create(leaveRef, { ...result, createdAtServer: new Date() });
      });
      return res.status(201).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(scheduleErrorStatus(error)).json({ success: false, error: error?.message || 'LEAVE_CREATE_FAILED' });
    }
  });

  router.post('/leave-requests/:requestId/review', authenticateFirebase, requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    try {
      if (!db) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
      const actor = getActor(req);
      const decision = String(req.body?.decision || '').trim().toUpperCase();
      if (!['APPROVE', 'REJECT'].includes(decision)) throw new Error('LEAVE_REVIEW_DECISION_INVALID');
      const leaveRef = db.collection('leaveRequests').doc(req.params.requestId);
      let result: any;
      await db.runTransaction(async transaction => {
        const leave = await transaction.get(leaveRef);
        if (!leave.exists) throw new Error('LEAVE_REQUEST_NOT_FOUND');
        const current = leave.data()!;
        const staff = current.branchId ? null : await transaction.get(db.collection('users').doc(String(current.staffId || '')));
        const branchId = String(current.branchId || staff?.data()?.branchId || '').trim();
        const allowed = actor.role === 'ADMIN' || actor.branchId === branchId || actor.assignedBranchIds.includes(branchId);
        if (!branchId || !allowed) throw new Error('LEAVE_BRANCH_FORBIDDEN');
        if (current.status !== 'PENDING') throw new Error('LEAVE_REQUEST_ALREADY_REVIEWED');
        const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        result = { ...current, id: leave.id, branchId, status, approvedBy: actor.name, approvedByUid: actor.uid, approvedAt: new Date().toISOString() };
        transaction.update(leaveRef, {
          branchId, status, approvedBy: actor.name, approvedByUid: actor.uid,
          approvedAt: result.approvedAt, reviewReason: String(req.body?.reason || '').trim().slice(0, 1000)
        });
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(scheduleErrorStatus(error)).json({ success: false, error: error?.message || 'LEAVE_REVIEW_FAILED' });
    }
  });

  router.post('/checklists/:checklistId/save', authenticateFirebase, async (req: Request, res: Response) => {
    try {
      if (!db) throw new Error('DATABASE_UNAVAILABLE');
      const checklistId = safeText(req.params.checklistId, 180);
      if (!/^[A-Za-z0-9_-]{3,180}$/.test(checklistId)) throw new Error('CHECKLIST_ID_INVALID');
      const actor = getActor(req);
      const ref = db.collection('dailyShiftChecklists').doc(checklistId);
      let result: any;
      await db.runTransaction(async transaction => {
        const currentSnap = await transaction.get(ref);
        const current = currentSnap.exists ? currentSnap.data()! : null;
        const targetStaffId = safeText(current?.staffId || req.body?.staffId || actor.uid, 128);
        const templateId = safeText(current?.templateId || req.body?.templateId, 128);
        const [staffSnap, templateSnap] = await Promise.all([
          transaction.get(db.collection('users').doc(targetStaffId)),
          templateId ? transaction.get(db.collection('sopTemplates').doc(templateId)) : Promise.resolve(null)
        ]);
        const manager = elevatedHrRole(actor.role);
        if (targetStaffId !== actor.uid && !manager) throw new Error('CHECKLIST_STAFF_FORBIDDEN');
        const targetStaff = staffSnap.exists ? staffSnap.data()! : {};
        const branchId = safeText(current?.branchId || targetStaff.branchId || req.body?.branchId || actor.branchId, 80);
        if (!branchId || branchId === 'ALL') throw new Error('BRANCH_REQUIRED');
        if (!actorCanAccessBranch(actor, branchId)) throw new Error('CHECKLIST_BRANCH_FORBIDDEN');
        if (current && current.staffId !== actor.uid && !manager) throw new Error('CHECKLIST_OWNER_FORBIDDEN');
        const source = templateSnap?.exists ? { ...req.body, ...templateSnap.data(), date: req.body?.date || current?.date } : { ...current, ...req.body };
        const draft = validateChecklistInput(source);
        const now = new Date().toISOString();
        result = {
          ...(current || {}), ...draft, id: checklistId, templateId: templateId || null,
          staffId: targetStaffId,
          staffName: safeText(targetStaff.displayName || targetStaff.name || req.body?.staffName || actor.name, 160),
          staffRole: safeText(targetStaff.role || req.body?.staffRole || actor.role, 40),
          branchId,
          branchName: safeText(req.body?.branchName || current?.branchName, 160),
          isCustomTask: !templateId || draft.isCustomTask,
          assignedByLeaderName: targetStaffId !== actor.uid ? actor.name : safeText(current?.assignedByLeaderName, 160),
          completedAt: draft.isCompleted ? (current?.completedAt || now) : null,
          completedBy: draft.isCompleted ? actor.name : null,
          updatedAt: now,
          updatedByUid: actor.uid,
          createdAt: current?.createdAt || now,
          createdByUid: current?.createdByUid || actor.uid
        };
        transaction.set(ref, { ...result, updatedAtServer: FieldValue.serverTimestamp(), ...(current ? {} : { createdAtServer: FieldValue.serverTimestamp() }) }, { merge: false });
      });
      return res.status(201).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(scheduleErrorStatus(error)).json({ success: false, error: error?.message || 'CHECKLIST_SAVE_FAILED' });
    }
  });

  router.post('/checklists/:checklistId/review', authenticateFirebase, requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    try {
      if (!db) throw new Error('DATABASE_UNAVAILABLE');
      const actor = getActor(req);
      const ref = db.collection('dailyShiftChecklists').doc(req.params.checklistId);
      let result: any;
      await db.runTransaction(async transaction => {
        const snap = await transaction.get(ref);
        if (!snap.exists) throw new Error('CHECKLIST_NOT_FOUND');
        const current = snap.data()!;
        const branchId = safeText(current.branchId, 80);
        if (!branchId || !actorCanAccessBranch(actor, branchId)) throw new Error('CHECKLIST_BRANCH_FORBIDDEN');
        const now = new Date().toISOString();
        result = { ...current, id: snap.id, verifiedByManager: true, verifiedAt: now, verifiedBy: actor.name, verifiedByUid: actor.uid };
        transaction.update(ref, { verifiedByManager: true, verifiedAt: now, verifiedBy: actor.name, verifiedByUid: actor.uid, updatedAtServer: FieldValue.serverTimestamp() });
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(scheduleErrorStatus(error)).json({ success: false, error: error?.message || 'CHECKLIST_REVIEW_FAILED' });
    }
  });

  router.post('/handovers', authenticateFirebase, async (req: Request, res: Response) => {
    try {
      if (!db) throw new Error('DATABASE_UNAVAILABLE');
      const actor = getActor(req);
      const branchId = safeText(req.body?.branchId || actor.branchId, 80);
      if (!branchId || branchId === 'ALL') throw new Error('BRANCH_REQUIRED');
      if (!actorCanAccessBranch(actor, branchId)) throw new Error('HANDOVER_BRANCH_FORBIDDEN');
      const ref = db.collection('shiftHandover').doc();
      let result: any;
      await db.runTransaction(async transaction => {
        const branchSnap = await transaction.get(db.collection('branches').doc(branchId));
        if (!branchSnap.exists || branchSnap.data()?.isActive === false) throw new Error('BRANCH_NOT_ACTIVE');
        const numeric = (value: unknown, field: string, max = 10_000_000_000) => {
          const parsed = Number(value || 0);
          if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) throw new Error(`${field}_INVALID`);
          return Math.round(parsed);
        };
        const now = new Date().toISOString();
        result = {
          id: ref.id,
          code: `BG-${now.slice(0, 10).replace(/-/g, '')}-${ref.id.slice(0, 5).toUpperCase()}`,
          date: now.slice(0, 10),
          shiftName: safeText(req.body?.shiftName || 'Ca trực hôm nay', 120),
          branchId,
          branchName: safeText(branchSnap.data()?.name, 160),
          staffId: actor.uid,
          staffName: actor.name,
          staffRole: actor.role,
          cashInSafe: numeric(req.body?.cashInSafe, 'HANDOVER_CASH'),
          cashRevenueToday: numeric(req.body?.cashRevenueToday, 'HANDOVER_CASH_REVENUE'),
          posCardRevenueToday: numeric(req.body?.posCardRevenueToday, 'HANDOVER_CARD_REVENUE'),
          qrBankRevenueToday: numeric(req.body?.qrBankRevenueToday, 'HANDOVER_BANK_REVENUE'),
          totalRevenueToday: numeric(req.body?.totalRevenueToday, 'HANDOVER_TOTAL_REVENUE'),
          demoDevicesCount: numeric(req.body?.demoDevicesCount, 'HANDOVER_DEVICE_COUNT', 100_000),
          demoDevicesLocked: req.body?.demoDevicesLocked === true,
          glassShowcasesLocked: req.body?.glassShowcasesLocked === true,
          powerHeatDevicesTurnedOff: req.body?.powerHeatDevicesTurnedOff === true,
          pendingRepairsCount: numeric(req.body?.pendingRepairsCount, 'HANDOVER_REPAIR_COUNT', 100_000),
          pendingTradeInsCount: numeric(req.body?.pendingTradeInsCount, 'HANDOVER_TRADEIN_COUNT', 100_000),
          pendingAppointmentsNote: safeText(req.body?.pendingAppointmentsNote, 2000),
          generalNotes: safeText(req.body?.generalNotes, 4000),
          completedTasksCount: numeric(req.body?.completedTasksCount, 'HANDOVER_COMPLETED_TASK_COUNT', 100_000),
          totalTasksCount: numeric(req.body?.totalTasksCount, 'HANDOVER_TOTAL_TASK_COUNT', 100_000),
          status: 'SUBMITTED', createdAt: now, createdByUid: actor.uid
        };
        transaction.create(ref, { ...result, createdAtServer: FieldValue.serverTimestamp(), updatedAtServer: FieldValue.serverTimestamp() });
      });
      return res.status(201).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(scheduleErrorStatus(error)).json({ success: false, error: error?.message || 'HANDOVER_CREATE_FAILED' });
    }
  });

  router.post('/handovers/:handoverId/review', authenticateFirebase, requireRole('ADMIN', 'MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    try {
      if (!db) throw new Error('DATABASE_UNAVAILABLE');
      const actor = getActor(req);
      const ref = db.collection('shiftHandover').doc(req.params.handoverId);
      let result: any;
      await db.runTransaction(async transaction => {
        const snap = await transaction.get(ref);
        if (!snap.exists) throw new Error('HANDOVER_NOT_FOUND');
        const current = snap.data()!;
        const branchId = safeText(current.branchId, 80);
        if (!branchId || !actorCanAccessBranch(actor, branchId)) throw new Error('HANDOVER_BRANCH_FORBIDDEN');
        if (current.status === 'APPROVED_BY_MANAGER') throw new Error('HANDOVER_ALREADY_APPROVED');
        const now = new Date().toISOString();
        result = { ...current, id: snap.id, status: 'APPROVED_BY_MANAGER', managerApprovedBy: actor.name, managerApprovedByUid: actor.uid, managerFeedback: safeText(req.body?.feedback, 2000), approvedAt: now };
        transaction.update(ref, { status: result.status, managerApprovedBy: result.managerApprovedBy, managerApprovedByUid: actor.uid, managerFeedback: result.managerFeedback, approvedAt: now, updatedAtServer: FieldValue.serverTimestamp() });
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      return res.status(scheduleErrorStatus(error)).json({ success: false, error: error?.message || 'HANDOVER_REVIEW_FAILED' });
    }
  });

  // 5. Weekly department/staff scheduling board.
  router.get('/shift-board', authenticateFirebase, async (req: Request, res: Response) => {
    try {
      const result = await listShiftBoard(db, getActor(req), {
        weekStart: String(req.query.weekStart || ''),
        branchId: String(req.query.branchId || '')
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Shift Board List Error]:', error);
      return res.status(scheduleErrorStatus(error)).json({ success: false, error: error?.message || 'Không tải được lịch làm việc.' });
    }
  });

  router.put('/shift-board', authenticateFirebase, requireRole('MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    try {
      const result = await saveShiftBoard(db, getActor(req), {
        branchId: String(req.body?.branchId || ''),
        weekStart: String(req.body?.weekStart || ''),
        status: req.body?.status,
        entries: req.body?.entries,
        operationKey: req.body?.operationKey
      });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Shift Board Save Error]:', error);
      return res.status(scheduleErrorStatus(error)).json({ success: false, error: error?.message || 'Không lưu được lịch làm việc.' });
    }
  });

  router.post('/shift-definitions', authenticateFirebase, requireRole('MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    try {
      const result = await upsertShiftDefinition(db, getActor(req), req.body || {});
      return res.status(201).json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Shift Definition Create Error]:', error);
      return res.status(scheduleErrorStatus(error)).json({ success: false, error: error?.message || 'Không tạo được ca làm.' });
    }
  });

  router.patch('/shift-definitions/:id', authenticateFirebase, requireRole('MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    try {
      const result = await upsertShiftDefinition(db, getActor(req), { ...req.body, id: req.params.id });
      return res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Shift Definition Update Error]:', error);
      return res.status(scheduleErrorStatus(error)).json({ success: false, error: error?.message || 'Không cập nhật được ca làm.' });
    }
  });

  router.put('/shift-department-policies', authenticateFirebase, requireRole('MANAGER', 'STORE_MANAGER'), async (req: Request, res: Response) => {
    try {
      const result = await upsertShiftDepartmentPolicy(db, getActor(req), req.body || {});
      return res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('[Shift Department Policy Error]:', error);
      return res.status(scheduleErrorStatus(error)).json({ success: false, error: error?.message || 'Không lưu được quy tắc bộ phận.' });
    }
  });

  return router;
}
