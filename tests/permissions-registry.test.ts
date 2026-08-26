import { describe, expect, it } from 'vitest';
import { hasPermission, normalizeRole } from '../shared/permissions';
import { isItemAuthorized } from '../src/app/permissionNavigation';

describe('canonical role and capability registry', () => {
  it('normalizes legacy role aliases', () => {
    expect(normalizeRole('SALE')).toBe('SALES');
    expect(normalizeRole('TECH')).toBe('TECHNICIAN');
    expect(normalizeRole('CSKH')).toBe('CUSTOMER_CARE');
  });

  it('uses the same capability decisions for aliases', () => {
    expect(hasPermission('SALE', 'POS_CHECKOUT')).toBe(true);
    expect(hasPermission('TECH', 'INVENTORY_TRANSFER_CREATE')).toBe(true);
    expect(hasPermission('CSKH', 'FINANCE_VIEW')).toBe(false);
  });

  it('uses capabilities for navigation instead of a second role allowlist', () => {
    expect(isItemAuthorized({ id: 'funds', label: 'Quỹ', icon: (() => null) as any, permission: 'FINANCE_VIEW' }, 'ACCOUNTANT')).toBe(true);
    expect(isItemAuthorized({ id: 'funds', label: 'Quỹ', icon: (() => null) as any, permission: 'FINANCE_VIEW' }, 'SALES')).toBe(false);
    expect(isItemAuthorized({ id: 'channels', label: 'Kênh', icon: (() => null) as any, permission: 'CHANNEL_MANAGE' }, 'MANAGER')).toBe(true);
  });
});
