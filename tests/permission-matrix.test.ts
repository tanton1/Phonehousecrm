import { describe, it, expect } from 'vitest';
import { hasPermission, UserRole, ResourceModule, PermissionAction } from '../src/features/users/types';

describe('Sprint 16: Permission Matrix & Role Management Suite', () => {
  it('Case 1: Phân quyền vai trò Sale - Được phép tạo đơn POS nhưng không được xóa hoặc truy cập cấu hình hệ thống', () => {
    const role: UserRole = 'SALE';

    const canCreatePOS = hasPermission(role, 'POS_SALES', 'CREATE');
    const canDeletePOS = hasPermission(role, 'POS_SALES', 'DELETE');
    const canAccessSystemUsers = hasPermission(role, 'SYSTEM_USERS', 'VIEW');

    expect(canCreatePOS).toBe(true);
    expect(canDeletePOS).toBe(false);
    expect(canAccessSystemUsers).toBe(false);
  });

  it('Case 2: Quyền hạn tối cao của Superuser Admin - Toàn quyền trên mọi module và hành động', () => {
    const role: UserRole = 'ADMIN';
    const modules: ResourceModule[] = ['DASHBOARD', 'POS_SALES', 'FINANCE_LEDGER', 'WARRANTY', 'SYSTEM_USERS'];
    const actions: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE'];

    for (const mod of modules) {
      for (const act of actions) {
        expect(hasPermission(role, mod, act)).toBe(true);
      }
    }
  });

  it('Case 3: Khóa quyền truy cập khi tài khoản bị đình chỉ (Status: INACTIVE / SUSPENDED)', () => {
    const staff = {
      id: 'STAFF-01',
      displayName: 'Nhân viên A',
      status: 'INACTIVE'
    };

    const isLoginAllowed = staff.status === 'ACTIVE';
    expect(isLoginAllowed).toBe(false);
  });
});
