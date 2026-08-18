import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../firebaseAdmin';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  role: string;
  branchId?: string;
  name?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
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
        email: `${devUid}@phonehouse.local`
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
    
    // Strict Role Validation: NEVER default to SALES if role claim is missing
    const userRole = (decoded.role as string) || (decoded['custom:role'] as string);
    if (!userRole) {
      return res.status(403).json({
        success: false,
        error: 'ROLE_NOT_ASSIGNED',
        message: 'Tài khoản chưa được phân quyền vai trò trên hệ thống.'
      });
    }

    const branchId = (decoded.branchId as string) || (decoded['custom:branchId'] as string) || '';
    if (userRole.toUpperCase() !== 'ADMIN' && !branchId) {
      return res.status(403).json({
        success: false,
        error: 'BRANCH_NOT_ASSIGNED',
        message: 'Tài khoản chưa được gán chi nhánh làm việc.'
      });
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      role: userRole.toUpperCase(),
      branchId,
      name: decoded.name || decoded.email
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
