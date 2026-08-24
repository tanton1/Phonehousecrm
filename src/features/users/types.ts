import { StaffMember, StoreBranch } from '../../types';

export const USER_ROLES = {
  ADMIN: 'ADMIN',
  REGIONAL_MANAGER: 'REGIONAL_MANAGER',
  MANAGER: 'MANAGER',
  STORE_MANAGER: 'STORE_MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  SALES: 'SALES',
  SALE: 'SALE',
  SALE_ONLINE: 'SALE_ONLINE',
  CUSTOMER_CARE: 'CUSTOMER_CARE',
  CSKH: 'CSKH',
  TECH_LEAD: 'TECH_LEAD',
  TECH: 'TECH',
  TECHNICIAN: 'TECHNICIAN',
  WAREHOUSE: 'WAREHOUSE',
  CASHIER: 'CASHIER'
} as const;

export type UserRole = keyof typeof USER_ROLES;

export type PermissionAction = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'APPROVE';

export type ResourceModule =
  | 'DASHBOARD'
  | 'POS_SALES'
  | 'INVENTORY'
  | 'PROCUREMENT'
  | 'FINANCE_LEDGER'
  | 'CRM_LEADS'
  | 'CHAT_OMNI'
  | 'TRADEIN'
  | 'WARRANTY'
  | 'ATTENDANCE_PAYROLL'
  | 'SOP_CHECKLIST'
  | 'SYSTEM_USERS';

export interface ModulePermission {
  module: ResourceModule;
  label: string;
  category: 'Kinh Doanh' | 'Kho Vận' | 'Tài Chính' | 'Kỹ Thuật' | 'Vận Hành & Hệ Thống';
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
}

export type RolePermissionMap = Record<UserRole, ModulePermission[]>;

export const DEFAULT_MODULE_PERMISSIONS: { module: ResourceModule; label: string; category: ModulePermission['category'] }[] = [
  { module: 'DASHBOARD', label: 'Báo Cáo Tổng Quan & Doanh Thu', category: 'Kinh Doanh' },
  { module: 'POS_SALES', label: 'Bán Hàng POS & Xuất Hóa Đơn', category: 'Kinh Doanh' },
  { module: 'CRM_LEADS', label: 'Quản Lý Khách Hàng Tiềm Năng (CRM)', category: 'Kinh Doanh' },
  { module: 'CHAT_OMNI', label: 'Chat Đa Kênh (Facebook/Zalo/TikTok)', category: 'Kinh Doanh' },
  { module: 'TRADEIN', label: 'Thu Cũ Đổi Mới (Trade-in)', category: 'Kinh Doanh' },
  { module: 'INVENTORY', label: 'Quản Lý Kho Hàng & Thiết Bị IMEI', category: 'Kho Vận' },
  { module: 'PROCUREMENT', label: 'Nhập Hàng PO & Chuyển Kho', category: 'Kho Vận' },
  { module: 'FINANCE_LEDGER', label: 'Sổ Quỹ Thu Chi & Công Nợ', category: 'Tài Chính' },
  { module: 'WARRANTY', label: 'Tiếp Nhận & Sửa Chữa Bảo Hành', category: 'Kỹ Thuật' },
  { module: 'ATTENDANCE_PAYROLL', label: 'Chấm Công & Bảng Lương', category: 'Vận Hành & Hệ Thống' },
  { module: 'SOP_CHECKLIST', label: 'Quy Trình Tiêu Chuẩn SOP Mở/Đóng Ca', category: 'Vận Hành & Hệ Thống' },
  { module: 'SYSTEM_USERS', label: 'Phân Quyền & Quản Lý Nhân Sự', category: 'Vận Hành & Hệ Thống' }
];

export function hasPermission(
  role: UserRole | string,
  module: ResourceModule,
  action: PermissionAction
): boolean {
  if (role === 'ADMIN') return true;

  switch (module) {
    case 'POS_SALES':
      if (role === 'SALE' || role === 'MANAGER') {
        return action === 'VIEW' || action === 'CREATE' || action === 'EDIT';
      }
      return action === 'VIEW';

    case 'FINANCE_LEDGER':
      if (role === 'ACCOUNTANT' || role === 'MANAGER') {
        return action === 'VIEW' || action === 'CREATE' || action === 'EDIT' || action === 'APPROVE';
      }
      return false;

    case 'WARRANTY':
      if (role === 'TECH' || role === 'TECH_LEAD') {
        return action === 'VIEW' || action === 'CREATE' || action === 'EDIT';
      }
      return action === 'VIEW';

    case 'SYSTEM_USERS':
      return role === 'ADMIN' || (role === 'MANAGER' && action === 'VIEW');

    default:
      return action === 'VIEW';
  }
}
