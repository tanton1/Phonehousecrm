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
    expect(hasPermission('SALE', 'CRM_READ')).toBe(true);
    expect(hasPermission('TECH', 'INVENTORY_TRANSFER_CREATE')).toBe(true);
    expect(hasPermission('TECH', 'TRADE_IN_READ')).toBe(true);
    expect(hasPermission('TECH', 'INVOICE_READ')).toBe(false);
    expect(hasPermission('CSKH', 'FINANCE_VIEW')).toBe(false);
    expect(hasPermission('CSKH', 'CRM_READ')).toBe(true);
  });

  it('keeps raw operational listeners aligned with job capabilities', () => {
    expect(hasPermission('SALES', 'INVOICE_READ')).toBe(true);
    expect(hasPermission('SALES', 'CRM_READ')).toBe(true);
    expect(hasPermission('ACCOUNTANT', 'INVOICE_READ')).toBe(true);
    expect(hasPermission('ACCOUNTANT', 'CRM_READ')).toBe(false);
    expect(hasPermission('INVENTORY_MANAGER', 'TRADE_IN_READ')).toBe(true);
    expect(hasPermission('INVENTORY_MANAGER', 'PARTNER_DIRECTORY_READ')).toBe(true);
    expect(hasPermission('TECHNICIAN', 'PARTNER_DIRECTORY_READ')).toBe(false);
  });

  it('uses capabilities for navigation instead of a second role allowlist', () => {
    expect(isItemAuthorized({ id: 'funds', label: 'Quỹ', icon: (() => null) as any, permission: 'FINANCE_VIEW' }, 'ACCOUNTANT')).toBe(true);
    expect(isItemAuthorized({ id: 'funds', label: 'Quỹ', icon: (() => null) as any, permission: 'FINANCE_VIEW' }, 'SALES')).toBe(false);
    expect(isItemAuthorized({ id: 'channels', label: 'Kênh', icon: (() => null) as any, permission: 'CHANNEL_MANAGE' }, 'MANAGER')).toBe(true);
  });
});
