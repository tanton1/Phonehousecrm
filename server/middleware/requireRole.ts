import { Request, Response, NextFunction } from 'express';

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHENTICATED',
        message: 'Chưa đăng nhập hệ thống.'
      });
    }

    const userRole = (user.role || '').toUpperCase();

    // ADMIN has superuser privileges across all routes
    if (userRole === 'ADMIN') {
      return next();
    }

    const isMatch = allowedRoles.some(r => r.toUpperCase() === userRole);
    if (!isMatch) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_ROLE',
        message: `Vai trò "${user.role}" không có quyền truy cập chức năng này (Yêu cầu: ${allowedRoles.join(', ')}).`
      });
    }

    next();
  };
}
