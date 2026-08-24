import { NAVIGATION_GROUPS, NavigationGroup, NavigationItem } from './navigationConfig';

export function isItemAuthorized(item: NavigationItem, userRole: string = 'SALES'): boolean {
  if (userRole === 'CUSTOMER_CARE' || userRole === 'CSKH') {
    return ['dashboard', 'crm', 'omnichannel-chat', 'hr-attendance', 'staff-hr', 'checkin-portal'].includes(item.id);
  }
  if (!item.roles || item.roles.length === 0) return true;
  if (userRole === 'ADMIN') return true;
  return item.roles.includes(userRole);
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
