import { describe, it, expect } from 'vitest';
import { NAVIGATION_GROUPS, MOBILE_PRIMARY_TABS, getMobilePrimaryTabs } from '../src/app/navigationConfig';
import { getAuthorizedNavigation, isItemAuthorized } from '../src/app/permissionNavigation';

describe('Sprint 5: App Shell & Role-Based Navigation Test Suite', () => {
  it('Case 1: Navigation groups structure contract', () => {
    expect(NAVIGATION_GROUPS.length).toBe(7);
    expect(MOBILE_PRIMARY_TABS.length).toBe(5);
  });

  it('Case 2: Admin có quyền truy cập toàn bộ 100% Navigation Groups', () => {
    const adminGroups = getAuthorizedNavigation('ADMIN');
    expect(adminGroups.length).toBe(NAVIGATION_GROUPS.length);

    // Chấm công, xếp ca và lương dùng chung một Hub để không lặp icon.
    const allItemIds = adminGroups.flatMap(g => g.items.map(i => i.id));
    expect(allItemIds).toContain('funds');
    expect(allItemIds).toContain('partners');
    expect(allItemIds).toContain('users');
    expect(allItemIds).toContain('purchase-orders');
    expect(allItemIds).toContain('store-settings');
    expect(allItemIds).toContain('master-catalog');
    expect(allItemIds).toContain('inventory-matrix');
    expect(allItemIds.filter(id => id === 'hr-attendance')).toHaveLength(1);
    expect(allItemIds).not.toContain('payroll');
    expect(allItemIds).not.toContain('shift-scheduling');
  });

  it('Case 3: Sales có Sửa chữa lẻ theo chi nhánh, không thấy Sổ quỹ hay Phân quyền', () => {
    const salesGroups = getAuthorizedNavigation('SALES');
    const salesItemIds = salesGroups.flatMap(g => g.items.map(i => i.id));

    // Allowed for Sales
    expect(salesItemIds).toContain('pos');
    expect(salesItemIds).toContain('invoices');
    expect(salesItemIds).toContain('inventory');
    expect(salesItemIds).toContain('inventory-matrix');
    expect(salesItemIds).toContain('crm');
    expect(salesItemIds).toContain('checkin-portal');
    expect(salesItemIds).toContain('warranty');

    // Blocked for Sales
    expect(salesItemIds).not.toContain('funds');
    expect(salesItemIds).not.toContain('users');
    expect(salesItemIds).not.toContain('purchase-orders');
    expect(salesItemIds).not.toContain('spare-parts');
    expect(salesItemIds).not.toContain('store-settings');
    expect(salesItemIds).not.toContain('shift-scheduling');
  });

  it('Case 4: Kỹ thuật viên (TECH) chỉ thấy Bàn kỹ thuật, Kho Linh Kiện và Chuyển kho', () => {
    const techGroups = getAuthorizedNavigation('TECH');
    const techItemIds = techGroups.flatMap(g => g.items.map(i => i.id));

    expect(techItemIds).not.toContain('warranty');
    expect(techItemIds).toContain('products');
    expect(techItemIds).not.toContain('spare-parts');
    expect(techItemIds).toContain('tech-workspace');
    expect(techItemIds).toContain('checkin-portal');
    expect(techItemIds).not.toContain('funds');
    expect(techItemIds).not.toContain('users');
  });

  it('Case 5: CSKH tập trung vào CRM, Inbox và chấm công', () => {
    const ids = getAuthorizedNavigation('CUSTOMER_CARE').flatMap(group => group.items.map(item => item.id));
    expect(ids).toEqual(expect.arrayContaining(['dashboard', 'crm', 'omnichannel-chat', 'hr-attendance', 'checkin-portal']));
    expect(ids).not.toEqual(expect.arrayContaining(['pos', 'inventory', 'funds', 'users']));
    expect(getMobilePrimaryTabs('CUSTOMER_CARE').map(item => item.id)).toEqual(['dashboard', 'crm', 'omnichannel-chat', 'checkin-portal', 'more']);
  });
});
