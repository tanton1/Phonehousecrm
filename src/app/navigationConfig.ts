import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Repeat,
  Package,
  ArrowRightLeft,
  ShoppingBag,
  Wrench,
  Cpu,
  Wallet,
  Building2,
  Users,
  MessageSquare,
  Clock,
  CheckSquare,
  ShieldCheck,
  Store,
  BarChart3,
  Settings,
  DollarSign,
  Database,
  Award,
  ScanFace
} from 'lucide-react';
import React from 'react';

export interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  roles?: string[]; // Allowed roles (undefined = all authenticated users)
  shortcut?: string;
}

export interface NavigationGroup {
  id: string;
  label: string;
  items: NavigationItem[];
  roles?: string[];
}

export const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    id: 'overview',
    label: 'Tổng Quan',
    items: [
      { id: 'dashboard', label: 'Bàn Điều Hành', icon: LayoutDashboard, shortcut: 'Alt+1' },
      { id: 'reports', label: 'Báo Cáo & Phân Tích', icon: BarChart3, roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'] }
    ]
  },
  {
    id: 'sales',
    label: 'Bán Hàng & Thu Cũ',
    items: [
      { id: 'pos', label: 'POS Thu Ngân', icon: ShoppingCart, shortcut: 'F2' },
      { id: 'invoices', label: 'Quản Lý Hóa Đơn', icon: Receipt, shortcut: 'Alt+2' },
      { id: 'tradein', label: 'Thu Cũ Đổi Mới', icon: Repeat },
      { id: 'installments', label: 'Đối Soát Trả Góp', icon: DollarSign, roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'] }
    ]
  },
  {
    id: 'crm',
    label: 'Khách Hàng & Giao Tiếp',
    items: [
      { id: 'crm', label: 'Pipeline Lead CRM', icon: Users, shortcut: 'Alt+4' },
      { id: 'omnichannel-chat', label: 'Inbox Chat Đa Kênh', icon: MessageSquare }
    ]
  },
  {
    id: 'inventory',
    label: 'Kho & Hàng Hóa',
    items: [
      { id: 'inventory', label: 'Kho IMEI Máy', icon: Package, shortcut: 'Alt+3' },
      { id: 'purchase-orders', label: 'Nhập Hàng NCC', icon: ShoppingBag, roles: ['ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTANT'] },
      { id: 'transfers', label: 'Điều Chuyển Hàng', icon: ArrowRightLeft, roles: ['ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'TECH', 'TECHNICIAN', 'TECH_LEAD'] },
      { id: 'products', label: 'Phụ Kiện Bán Kèm', icon: Store },
      { id: 'spare-parts', label: 'Kho Linh Kiện Kỹ Thuật', icon: Cpu, roles: ['ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'] },
      { id: 'master-catalog', label: 'Danh Mục Hàng Hóa SKU', icon: Database, roles: ['ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTANT'] }
    ]
  },
  {
    id: 'technical',
    label: 'Kỹ Thuật & Sửa Chữa',
    items: [
      { id: 'warranty', label: 'Tiếp Nhận Sửa Chữa', icon: Wrench },
      { id: 'tech-workspace', label: 'Bàn Kỹ Thuật Cá Nhân', icon: Cpu, roles: ['ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH', 'TECHNICIAN'] }
    ]
  },
  {
    id: 'finance',
    label: 'Tài Chính & Kế Toán',
    items: [
      { id: 'funds', label: 'Sổ Quỹ & Ngân Hàng', icon: Wallet, roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'] },
      { id: 'partners', label: 'Công Nợ & Đối Tác NCC', icon: Building2, roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'] }
    ]
  },
  {
    id: 'hr',
    label: 'Nhân Sự & Hệ Thống',
    items: [
      { id: 'hr-attendance', label: 'Chấm Công & Ca Làm', icon: Clock },
      { id: 'staff-hr', label: 'Bàn Nhân Sự Cá Nhân', icon: CheckSquare },
      { id: 'checkin-portal', label: 'Điểm Danh Face ID', icon: ScanFace },
      { id: 'payroll', label: 'Bảng Lương & Hoa Hồng', icon: Award, roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'] },
      { id: 'users', label: 'Phân Quyền User RBAC', icon: ShieldCheck, roles: ['ADMIN'] },
      { id: 'store-settings', label: 'Cài Đặt & Khởi Tạo Hệ Thống', icon: Settings, roles: ['ADMIN', 'MANAGER'] }
    ]
  }
];

export const MOBILE_PRIMARY_TABS = [
  { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'pos', label: 'Bán hàng', icon: ShoppingCart },
  { id: 'inventory', label: 'Kho IMEI', icon: Package },
  { id: 'crm', label: 'CRM Lead', icon: Users },
  { id: 'more', label: 'Thêm', icon: Settings }
];

export function getMobilePrimaryTabs(userRole?: string) {
  if (userRole === 'SALES') {
    return [
      { id: 'dashboard', label: 'Hôm nay', icon: LayoutDashboard },
      { id: 'pos', label: 'Bán POS', icon: ShoppingCart },
      { id: 'crm', label: 'Khách CRM', icon: Users },
      { id: 'omnichannel-chat', label: 'Inbox', icon: MessageSquare },
      { id: 'more', label: 'Thêm', icon: Settings }
    ];
  }

  if (userRole === 'TECHNICIAN' || userRole === 'TECH' || userRole === 'TECH_LEAD') {
    return [
      { id: 'dashboard', label: 'Bàn thợ', icon: Cpu },
      { id: 'warranty', label: 'Sửa chữa', icon: Wrench },
      { id: 'products', label: 'Linh kiện', icon: Package },
      { id: 'checkin-portal', label: 'Điểm danh', icon: ScanFace },
      { id: 'more', label: 'Thêm', icon: Settings }
    ];
  }

  if (userRole === 'ACCOUNTANT') {
    return [
      { id: 'dashboard', label: 'Tài chính', icon: Wallet },
      { id: 'funds', label: 'Sổ quỹ', icon: Wallet },
      { id: 'invoices', label: 'Hóa đơn', icon: Receipt },
      { id: 'partners', label: 'Công nợ', icon: Building2 },
      { id: 'more', label: 'Thêm', icon: Settings }
    ];
  }

  // Default for ADMIN / MANAGER
  return [
    { id: 'dashboard', label: 'Điều hành', icon: LayoutDashboard },
    { id: 'pos', label: 'Bán POS', icon: ShoppingCart },
    { id: 'inventory', label: 'Kho hàng', icon: Package },
    { id: 'reports', label: 'Báo cáo', icon: BarChart3 },
    { id: 'more', label: 'Thêm', icon: Settings }
  ];
}
