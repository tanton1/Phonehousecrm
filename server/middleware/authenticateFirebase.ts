import { Request, Response, NextFunction } from 'express';
import { adminAuth, adminDb } from '../firebaseAdmin';

export interface StaffAuthority {
  uid: string;
  email?: string;
  role: string;
  branchId?: string;
  assignedBranchIds?: string[];
  active: boolean;
  name?: string;
}

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  role: string;
  branchId?: string;
  assignedBranchIds?: string[];
  name?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Authoritative Staff Authority Retrieval:
 * Reads directly from Firestore users/{uid} as the Single Source of Truth.
 */
export async function getStaffAuthority(uid: string, emailFallback?: string): Promise<StaffAuthority | null> {
  if (!adminDb) return null;

  try {
    let userSnap = await adminDb.collection('users').doc(uid).get();

    if (!userSnap.exists && emailFallback) {
      const emailQuery = await adminDb
        .collection('users')
        .where('email', '==', emailFallback.toLowerCase())
        .limit(1)
        .get();
      if (!emailQuery.empty) {
        userSnap = emailQuery.docs[0];
      }
    }

    if (!userSnap.exists) {
      return null;
    }

    const uData = userSnap.data()!;
    return {
      uid: userSnap.id,
      email: uData.email || emailFallback,
      role: (uData.role || '').toUpperCase(),
      branchId: uData.branchId || (uData.assignedBranchIds && uData.assignedBranchIds[0]) || '',
      assignedBranchIds: uData.assignedBranchIds || [],
      active: uData.active === true,
      name: uData.displayName || uData.name
    };
  } catch (err) {
    console.error('[getStaffAuthority Error]:', err);
    return null;
  }
}

export async function authenticateFirebase(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  // 1. Check for Bearer token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // In local development/testing mode, allow dev headers if explicitly provided
    const devUid = req.headers['x-staff-uid'] as string;
    const devRole = req.headers['x-staff-role'] as string;
    const devBranchId = req.headers['x-staff-branch-id'] as string;

    if (devUid && devRole && process.env.NODE_ENV !== 'production') {
      req.user = {
        uid: devUid,
        role: devRole.toUpperCase(),
        branchId: devBranchId || 'CN01',
        email: `${devUid}@phonehouse.local`,
        assignedBranchIds: [devBranchId || 'CN01']
      };
      return next();
    }

    return res.status(401).json({
      success: false,
      error: 'UNAUTHENTICATED',
      message: 'Yêu cầu Bearer Authorization Token để thực hiện hành động này.'
    });
  }

  const token = authHeader.slice(7).trim();

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    
    // 2. Resolve Role & Branch from Authoritative Firestore User Document (Single Source of Truth)
    let staff = await getStaffAuthority(decoded.uid, decoded.email);

    // If not in DB yet (e.g. initial admin bootstrap), fallback to claims
    if (!staff) {
      const claimRole = (decoded.role as string) || (decoded['custom:role'] as string);
      const claimBranchId = (decoded.branchId as string) || (decoded['custom:branchId'] as string) || '';
      if (claimRole) {
        staff = {
          uid: decoded.uid,
          email: decoded.email,
          role: claimRole.toUpperCase(),
          branchId: claimBranchId,
          assignedBranchIds: [claimBranchId].filter(Boolean),
          active: true,
          name: decoded.name || decoded.email
        };
      }
    }

    if (!staff) {
      return res.status(403).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'Tài khoản nhân viên chưa được khởi tạo trong hệ thống.'
      });
    }

    // 3. Active User Invariant Check: Inactive employees are immediately denied
    if (!staff.active) {
      return res.status(403).json({
        success: false,
        error: 'USER_INACTIVE',
        message: 'Tài khoản nhân viên này đã bị tạm khóa.'
      });
    }

    if (!staff.role) {
      return res.status(403).json({
        success: false,
        error: 'ROLE_NOT_ASSIGNED',
        message: 'Tài khoản chưa được phân quyền vai trò trên hệ thống.'
      });
    }

    if (staff.role !== 'ADMIN' && !staff.branchId) {
      return res.status(403).json({
        success: false,
        error: 'BRANCH_NOT_ASSIGNED',
        message: 'Tài khoản chưa được gán chi nhánh làm việc.'
      });
    }

    req.user = {
      uid: staff.uid,
      email: staff.email,
      role: staff.role,
      branchId: staff.branchId,
      assignedBranchIds: staff.assignedBranchIds,
      name: staff.name
    };
    next();
  } catch (error: any) {
    console.error('[Auth Middleware Error]:', error?.message || error);
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Token xác thực không hợp lệ hoặc đã hết hạn.'
    });
  }
}
