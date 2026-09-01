import { Router, Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';
import { adminAuth } from '../firebaseAdmin';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { sensitiveRateLimit } from '../middleware/security';
import { requireRole } from '../middleware/requireRole';
import { normalizeRole } from '../../shared/permissions';

export function createUsersRouter(db: Firestore | null): Router {
  const router = Router();

  // Resolve the current Firebase identity to its authoritative PhoneHouse profile.
  // The authentication middleware also migrates legacy email-keyed profiles to users/{uid}.
  router.get('/me', authenticateFirebase, async (req: Request, res: Response) => {
    try {
      if (!db) {
        return res.status(503).json({
          success: false,
          error: 'AUTH_SERVICE_UNAVAILABLE',
          message: 'Cơ sở dữ liệu xác thực chưa sẵn sàng.'
        });
      }
      if (!req.user?.uid) {
        return res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
      }

      let snapshot = await db.collection('users').doc(req.user.uid).get();
      if (!snapshot.exists && req.user.email) {
        const legacy = await db.collection('users')
          .where('email', '==', req.user.email.toLowerCase())
          .limit(1)
          .get();
        if (!legacy.empty) snapshot = legacy.docs[0];
      }
      if (!snapshot.exists) {
        return res.status(403).json({
          success: false,
          error: 'USER_NOT_PROVISIONED',
          message: 'Tài khoản Firebase chưa có hồ sơ nhân viên PhoneHouse.'
        });
      }

      const data = snapshot.data() || {};
      const user = {
        id: req.user.uid,
        authUid: req.user.uid,
        email: String(data.email || req.user.email || '').trim().toLowerCase(),
        displayName: String(data.displayName || data.name || req.user.name || req.user.email || '').trim(),
        phone: String(data.phone || '').trim(),
        role: normalizeRole(data.role || req.user.role),
        branchId: String(data.branchId || req.user.branchId || '').trim(),
        payrollBranchId: String(data.payrollBranchId || '').trim(),
        assignedBranchIds: Array.isArray(data.assignedBranchIds)
          ? data.assignedBranchIds.map(String)
          : (req.user.assignedBranchIds || []),
        workplaceAddresses: Array.isArray(data.workplaceAddresses) ? data.workplaceAddresses.map(String) : [],
        active: data.active === true,
        mustChangePassword: data.mustChangePassword === true,
        createdAt: data.createdAt || '',
        avatarUrl: data.avatarUrl || '',
        facePhotoUrl: data.facePhotoUrl || '',
        faceEnrollmentStatus: data.faceEnrollmentStatus,
        lastLogin: data.lastLogin,
        notes: data.notes || '',
        kpiTargetRevenue: Number(data.kpiTargetRevenue || 0),
        kpiTargetOrders: Number(data.kpiTargetOrders || 0),
        kpiTargetWarranty: Number(data.kpiTargetWarranty || 0),
        baseSalary: Number(data.baseSalary || 0),
        departmentId: data.departmentId,
        departmentName: data.departmentName
      };

      return res.json({ success: true, user });
    } catch (error) {
      console.error('[Current User Profile Error]:', error);
      return res.status(503).json({
        success: false,
        error: 'AUTH_SERVICE_UNAVAILABLE',
        message: 'Không thể tải hồ sơ người dùng lúc này.'
      });
    }
  });

  // A recent Firebase re-authentication is required before the server changes
  // the password, clears the first-login lock and revokes older refresh tokens.
  router.post('/change-password', sensitiveRateLimit, authenticateFirebase, async (req: Request, res: Response) => {
    try {
      if (!db || !req.user?.uid) {
        return res.status(503).json({
          success: false,
          error: 'AUTH_SERVICE_UNAVAILABLE',
          message: 'Dịch vụ tài khoản chưa sẵn sàng.'
        });
      }
      const ref = db.collection('users').doc(req.user.uid);
      const snapshot = await ref.get();
      if (!snapshot.exists) {
        return res.status(403).json({ success: false, error: 'USER_NOT_PROVISIONED' });
      }
      const data = snapshot.data() || {};
      if (data.mustChangePassword !== true) {
        return res.status(409).json({
          success: false,
          error: 'PASSWORD_CHANGE_NOT_REQUIRED',
          message: 'Tài khoản không ở trạng thái bắt buộc đổi mật khẩu.'
        });
      }
      const authAgeSeconds = Math.floor(Date.now() / 1_000) - Number(req.user.authTime || 0);
      if (!req.user.authTime || authAgeSeconds < 0 || authAgeSeconds > 300) {
        return res.status(401).json({
          success: false,
          error: 'RECENT_LOGIN_REQUIRED',
          message: 'Vui lòng đăng nhập lại để đổi mật khẩu.'
        });
      }

      const newPassword = String(req.body?.newPassword || '');
      if (newPassword.length < 10 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
        return res.status(400).json({
          success: false,
          error: 'WEAK_PASSWORD',
          message: 'Mật khẩu mới phải có ít nhất 10 ký tự, gồm chữ hoa, chữ thường và chữ số.'
        });
      }

      await adminAuth.updateUser(req.user.uid, { password: newPassword });

      await ref.set({
        mustChangePassword: false,
        passwordChangedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      try {
        await adminAuth.revokeRefreshTokens(req.user.uid);
      } catch (revokeError) {
        console.warn('[Revoke Tokens After Password Change Warn]:', revokeError);
      }
      return res.json({ success: true, changed: true });
    } catch (error) {
      console.error('[Complete Password Change Error]:', error);
      return res.status(503).json({
        success: false,
        error: 'AUTH_SERVICE_UNAVAILABLE',
        message: 'Chưa thể xác nhận mật khẩu mới. Vui lòng thử lại.'
      });
    }
  });

  // 1. Create New Staff Account (Admin Only) via Firebase Admin SDK
  router.post('/create', authenticateFirebase, requireRole('ADMIN'), async (req: Request, res: Response) => {
    let authUserRecord: any = null;
    let isNewlyCreatedInAuth = false;

    try {
      const {
        email,
        password,
        displayName,
        phone,
        role = 'SALES',
        branchId = '',
        payrollBranchId = '',
        assignedBranchIds = [],
        workplaceAddresses = [],
        notes = ''
      } = req.body;

      if (!email || !displayName || !branchId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_FIELDS',
          message: 'Vui lòng cung cấp Email, Họ tên và Chi nhánh nhân viên.'
        });
      }
      if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
      const branchIds = [...new Set([branchId, ...(Array.isArray(assignedBranchIds) ? assignedBranchIds : [])].filter(Boolean).map(String))];
      const branchSnapshots = await Promise.all(branchIds.map(id => db.collection('branches').doc(id).get()));
      if (branchSnapshots.some(snapshot => !snapshot.exists || snapshot.data()?.isActive === false)) throw new Error('USER_BRANCH_INVALID');
      const resolvedPayrollBranchId = String(payrollBranchId || '').trim() || (branchIds.length === 1 ? branchIds[0] : '');
      if (!resolvedPayrollBranchId) throw new Error('PAYROLL_HOME_BRANCH_REQUIRED: Nhân viên làm nhiều chi nhánh phải có một chi nhánh trả lương chính.');
      if (!branchIds.includes(resolvedPayrollBranchId)) throw new Error('PAYROLL_HOME_BRANCH_INVALID: Chi nhánh trả lương phải nằm trong danh sách nơi làm việc.');

      const emailNormalized = email.trim().toLowerCase();
      const hasProvidedPassword = typeof password === 'string' && password.length > 0;
      if (hasProvidedPassword && password.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'PASSWORD_TOO_SHORT',
          message: 'Mật khẩu khởi tạo phải có ít nhất 8 ký tự.'
        });
      }
      const isAutoGeneratedPassword = !hasProvidedPassword;
      const initialPassword = isAutoGeneratedPassword
        ? randomBytes(16).toString('hex') + 'A1!'
        : password;

      // 1A. Check if user already exists in Firebase Auth, or create
      try {
        authUserRecord = await adminAuth.getUserByEmail(emailNormalized);
        if (password && password.length >= 6) {
          await adminAuth.updateUser(authUserRecord.uid, {
            password,
            displayName
          });
        }
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          // Create new user in Firebase Auth with strong random password
          authUserRecord = await adminAuth.createUser({
            email: emailNormalized,
            password: initialPassword,
            displayName,
            phoneNumber: phone && phone.startsWith('+') ? phone : undefined
          });
          isNewlyCreatedInAuth = true;
        } else {
          throw err;
        }
      }

      const uid = authUserRecord.uid;
      // A password chosen through Firebase's reset flow is already user-owned.
      // Only an admin-provided temporary password requires another first-login change.
      const mustChangePassword = hasProvidedPassword;

      // 1B. Set Custom User Claims on Firebase Auth
      const canonicalRole = normalizeRole(role);
      await adminAuth.setCustomUserClaims(uid, {
        role: canonicalRole,
        branchId
      });

      // 1C. Create or Update Document in Firestore 'users' collection with ID = uid
      const userData = {
        id: uid,
        uid,
        authUid: uid,
        email: emailNormalized,
        displayName,
        phone: phone || '',
        role: canonicalRole,
        branchId,
        payrollBranchId: resolvedPayrollBranchId,
        assignedBranchIds: branchIds,
        workplaceAddresses,
        active: true,
        mustChangePassword,
        ...(mustChangePassword ? { passwordChangeRequiredAt: FieldValue.serverTimestamp() } : {}),
        notes,
        createdAt: new Date().toISOString().split('T')[0],
        updatedAt: FieldValue.serverTimestamp()
      };

      if (db) {
        try {
          await db.collection('users').doc(uid).set(userData, { merge: true });
          
          // Also ensure a mirror record exists in staff collection for attendance matching
          await db.collection('staff').doc(uid).set({
            id: uid,
            uid,
            authUid: uid,
            name: displayName,
            email: emailNormalized,
            phone: phone || '',
            role: canonicalRole,
            branchId,
            payrollBranchId: resolvedPayrollBranchId,
            assignedBranchIds: branchIds,
            active: true,
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (dbErr) {
          // Rollback newly created Auth user on DB failure to avoid orphaned accounts
          if (isNewlyCreatedInAuth && uid) {
            try {
              await adminAuth.deleteUser(uid);
            } catch (rollbackErr) {
              console.error('[Rollback Auth User Error]:', rollbackErr);
            }
          }
          throw dbErr;
        }
      }

      return res.json({
        success: true,
        message: 'Tài khoản nhân viên đã được cấp phép đăng nhập thành công.',
        user: userData,
        passwordSetupRequired: isAutoGeneratedPassword
      });
    } catch (error: any) {
      console.error('[Create User Error]:', error);
      return res.status(400).json({
        success: false,
        error: error.code || 'USER_CREATION_FAILED',
        message: error.message || 'Không thể tạo tài khoản nhân viên.'
      });
    }
  });

  // 2. Set / Update Role & Branch (Admin Only) with Token Revocation
  router.post('/update-role', authenticateFirebase, requireRole('ADMIN'), async (req: Request, res: Response) => {
    try {
      const { uid, role, branchId, payrollBranchId, active, displayName, phone, assignedBranchIds, workplaceAddresses, notes } = req.body;
      if (!uid) {
        return res.status(400).json({ success: false, error: 'MISSING_UID', message: 'Thiếu UID người dùng.' });
      }
      if (!db) throw new Error('FIRESTORE_NOT_CONFIGURED');
      const targetSnapshot = await db.collection('users').doc(String(uid)).get();
      if (!targetSnapshot.exists) throw new Error('USER_NOT_FOUND');
      const currentProfile = targetSnapshot.data() || {};
      const branchConfigurationChanged = branchId !== undefined || Array.isArray(assignedBranchIds) || payrollBranchId !== undefined;
      const effectivePrimaryBranchId = String(branchId ?? currentProfile.branchId ?? '').trim();
      const effectiveAssignedBranchIds = [...new Set([
        effectivePrimaryBranchId,
        ...(Array.isArray(assignedBranchIds) ? assignedBranchIds : (currentProfile.assignedBranchIds || []))
      ].filter(Boolean).map(String))];
      let effectivePayrollBranchId = String(payrollBranchId ?? currentProfile.payrollBranchId ?? '').trim();
      if (branchConfigurationChanged) {
        if (!effectivePayrollBranchId && effectiveAssignedBranchIds.length === 1) effectivePayrollBranchId = effectiveAssignedBranchIds[0];
        if (!effectivePayrollBranchId) throw new Error('PAYROLL_HOME_BRANCH_REQUIRED: Nhân viên làm nhiều chi nhánh phải có một chi nhánh trả lương chính.');
        if (!effectiveAssignedBranchIds.includes(effectivePayrollBranchId)) throw new Error('PAYROLL_HOME_BRANCH_INVALID: Chi nhánh trả lương phải nằm trong danh sách nơi làm việc.');
        const requestedBranchSnapshots = await Promise.all(effectiveAssignedBranchIds.map(id => db.collection('branches').doc(id).get()));
        if (requestedBranchSnapshots.some(snapshot => !snapshot.exists || snapshot.data()?.isActive === false)) throw new Error('USER_BRANCH_INVALID');
      }

      // Update Firebase Auth Claims
      if (role || branchId || displayName) {
        const currentAuth = await adminAuth.getUser(uid);
        const currentClaims = currentAuth.customClaims || {};
        await adminAuth.setCustomUserClaims(uid, {
          ...currentClaims,
          ...(role ? { role: normalizeRole(role) } : {}),
          ...(branchId ? { branchId } : {})
        });
        if (displayName) await adminAuth.updateUser(uid, { displayName: String(displayName).trim() });
      }

      // If deactivated or role/branch changed, revoke all refresh tokens immediately
      try {
        await adminAuth.revokeRefreshTokens(uid);
      } catch (revokeErr) {
        console.warn('[Revoke Tokens Warn]:', revokeErr);
      }

      // Update Firestore Document & Staff Mirror
      if (db) {
        const updatePayload: any = {
          updatedAt: FieldValue.serverTimestamp()
        };
        if (role) updatePayload.role = normalizeRole(role);
        if (branchId) updatePayload.branchId = branchId;
        if (branchConfigurationChanged) updatePayload.payrollBranchId = effectivePayrollBranchId;
        if (typeof active === 'boolean') updatePayload.active = active;
        if (displayName !== undefined) updatePayload.displayName = String(displayName).trim();
        if (phone !== undefined) updatePayload.phone = String(phone || '').trim();
        if (branchConfigurationChanged) updatePayload.assignedBranchIds = effectiveAssignedBranchIds;
        if (Array.isArray(workplaceAddresses)) updatePayload.workplaceAddresses = workplaceAddresses.map(String);
        if (notes !== undefined) updatePayload.notes = String(notes || '');

        await db.collection('users').doc(uid).update(updatePayload);

        // Synchronize Staff Mirror Document
        const staffRef = db.collection('staff').doc(uid);
        const staffSnap = await staffRef.get();
        if (staffSnap.exists) {
          await staffRef.update(updatePayload);
        }
      }

      return res.json({
        success: true,
        message: 'Đã cập nhật quyền hạn, chi nhánh và thu hồi token phiên cũ thành công.'
      });
    } catch (error: any) {
      console.error('[Update Role Error]:', error);
      return res.status(400).json({
        success: false,
        error: error.code || 'ROLE_UPDATE_FAILED',
        message: error.message || 'Lỗi cập nhật vai trò người dùng.'
      });
    }
  });

  return router;
}
