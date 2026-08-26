import { NAVIGATION_GROUPS, NavigationGroup, NavigationItem } from './navigationConfig';
import { hasPermission, normalizeRole } from '../../shared/permissions';

export function isItemAuthorized(item: NavigationItem, userRole: string = 'SALES'): boolean {
  userRole = normalizeRole(userRole);
  if (userRole === 'CUSTOMER_CARE') {
    return ['dashboard', 'crm', 'omnichannel-chat', 'hr-attendance', 'staff-hr', 'checkin-portal'].includes(item.id);
  }
  if (item.permission && !hasPermission(userRole, item.permission)) return false;
  if (!item.roles || item.roles.length === 0) return true;
  if (userRole === 'ADMIN') return true;
  return item.roles.map(normalizeRole).includes(userRole);
}

export function getAuthorizedNavigation(userRole: string = 'SALES'): NavigationGroup[] {
  if (userRole === 'ADMIN') {
    return NAVIGATION_GROUPS;
  }

  return NAVIGATION_GROUPS.map(group => {
    // Filter items in the group
    const authorizedItems = group.items.filter(item => isItemAuthorized(item, userRole));
    return {
      ...group,
      items: authorizedItems
    };
  }).filter(group => group.items.length > 0);
}
