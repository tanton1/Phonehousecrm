import { Router, Request, Response } from 'express';
import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { adminAuth } from '../firebaseAdmin';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';

export function createUsersRouter(db: Firestore | null): Router {
  const router = Router();

  // 1. Create New Staff Account (Admin Only) via Firebase Admin SDK
  router.post('/create', authenticateFirebase, requireRole('ADMIN'), async (req: Request, res: Response) => {
    try {
      const {
        email,
        password,
        displayName,
        phone,
        role = 'SALES',
        branchId = 'CN01',
        assignedBranchIds = ['CN01'],
        workplaceAddresses = [],
        notes = ''
      } = req.body;

      if (!email || !displayName) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_FIELDS',
          message: 'Vui lòng cung cấp đầy đủ Email và Họ tên nhân viên.'
        });
      }

      const emailNormalized = email.trim().toLowerCase();
      let authUserRecord;

      // 1A. Check if user already exists in Firebase Auth, or create
      try {
        authUserRecord = await adminAuth.getUserByEmail(emailNormalized);
        // If exists and password provided, update password
        if (password && password.length >= 6) {
          await adminAuth.updateUser(authUserRecord.uid, {
            password,
            displayName
          });
        }
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          // Create new user in Firebase Auth
          authUserRecord = await adminAuth.createUser({
            email: emailNormalized,
            password: password && password.length >= 6 ? password : 'PhoneHouse@2026',
            displayName,
            phoneNumber: phone && phone.startsWith('+') ? phone : undefined
          });
        } else {
          throw err;
        }
      }

      const uid = authUserRecord.uid;

      // 1B. Set Custom User Claims on Firebase Auth
      await adminAuth.setCustomUserClaims(uid, {
        role: role.toUpperCase(),
        branchId
      });

      // 1C. Create or Update Document in Firestore 'users' collection with ID = uid
      const userData = {
        id: uid,
        uid,
        email: emailNormalized,
        displayName,
        phone: phone || '',
        role: role.toUpperCase(),
        branchId,
        assignedBranchIds: assignedBranchIds.length > 0 ? assignedBranchIds : [branchId],
        workplaceAddresses,
        active: true,
        notes,
        createdAt: new Date().toISOString().split('T')[0],
        updatedAt: FieldValue.serverTimestamp()
      };

      if (db) {
        await db.collection('users').doc(uid).set(userData, { merge: true });
        
        // Also ensure a mirror record exists in staff collection for attendance matching
        await db.collection('staff').doc(uid).set({
          id: uid,
          uid,
          name: displayName,
          email: emailNormalized,
          phone: phone || '',
          role: role.toUpperCase(),
          branchId,
          active: true,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }

      return res.json({
        success: true,
        message: 'Tài khoản nhân viên đã được cấp phép đăng nhập thành công.',
        user: userData
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

  // 2. Set / Update Role & Branch (Admin Only)
  router.post('/update-role', authenticateFirebase, requireRole('ADMIN'), async (req: Request, res: Response) => {
    try {
      const { uid, role, branchId, active } = req.body;
      if (!uid) {
        return res.status(400).json({ success: false, error: 'MISSING_UID', message: 'Thiếu UID người dùng.' });
      }

      // Update Firebase Auth Claims
      if (role && branchId) {
        await adminAuth.setCustomUserClaims(uid, {
          role: role.toUpperCase(),
          branchId
        });
      }

      // Update Firestore Document
      if (db) {
        const updatePayload: any = {
          updatedAt: FieldValue.serverTimestamp()
        };
        if (role) updatePayload.role = role.toUpperCase();
        if (branchId) updatePayload.branchId = branchId;
        if (typeof active === 'boolean') updatePayload.active = active;

        await db.collection('users').doc(uid).update(updatePayload);
      }

      return res.json({
        success: true,
        message: 'Đã cập nhật quyền hạn và chi nhánh thành công.'
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
