import { NextFunction, Request, Response } from 'express';
import { hasPermission, Permission } from '../../shared/permissions';

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, code: 'UNAUTHENTICATED' });
    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ success: false, code: 'PERMISSION_DENIED', message: `Thiếu quyền ${permission}.`, requestId: req.requestId });
    }
    next();
  };
}
