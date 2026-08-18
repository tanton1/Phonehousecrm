import { Request, Response, NextFunction } from 'express';

export function requireBranchAccess() {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHENTICATED'
      });
    }

    const userRole = (user.role || '').toUpperCase();

    // Only ADMIN or REGIONAL_MANAGER can access all branches
    if (userRole === 'ADMIN' || userRole === 'REGIONAL_MANAGER') {
      return next();
    }

    const targetBranchId = req.body?.branchId || req.query?.branchId || req.params?.branchId;
    if (targetBranchId && user.branchId && user.branchId !== targetBranchId) {
      return res.status(403).json({
        success: false,
        error: 'BRANCH_ACCESS_DENIED',
        message: `Tài khoản vai trò "${userRole}" thuộc chi nhánh "${user.branchId}" không có quyền thao tác trên chi nhánh "${targetBranchId}".`
      });
    }

    next();
  };
}
