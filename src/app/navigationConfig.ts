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
  Settings
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
      { id: 'reports', label: 'Báo Cáo Doanh Thu', icon: BarChart3, roles: ['ADMIN', 'MANAGER'] }
    ]
  },
  {
    id: 'sales',
    label: 'Bán Hàng & POS',
    items: [
      { id: 'pos', label: 'POS Thu Ngân', icon: ShoppingCart, shortcut: 'F2' },
      { id: 'invoices', label: 'Quản Lý Hóa Đơn', icon: Receipt, shortcut: 'Alt+2' },
      { id: 'tradein', label: 'Thu Cũ Đổi Mới', icon: Repeat }
    ]
  },
  {
    id: 'inventory',
    label: 'Kho & Hàng Hóa',
    items: [
      { id: 'inventory', label: 'Kho IMEI Máy', icon: Package, shortcut: 'Alt+3' },
      { id: 'purchase-orders', label: 'Nhập Hàng NCC', icon: ShoppingBag, roles: ['ADMIN', 'MANAGER', 'INVENTORY_MANAGER'] },
      { id: 'transfers', label: 'Chuyển Kho Chi Nhánh', icon: ArrowRightLeft, roles: ['ADMIN', 'MANAGER', 'INVENTORY_MANAGER'] },
      { id: 'products', label: 'Phụ Kiện Bán Kèm', icon: Store }
    ]
  },
  {
    id: 'technical',
    label: 'Kỹ Thuật & Sửa Chữa',
    items: [
      { id: 'warranty', label: 'Tiếp Nhận Sửa Chữa', icon: Wrench },
      { id: 'spare-parts', label: 'Kho Linh Kiện Kỹ Thuật', icon: Cpu, roles: ['ADMIN', 'MANAGER', 'TECH_LEAD', 'TECH'] }
    ]
  },
  {
    id: 'finance',
    label: 'Tài Chính & Đối Tác',
    items: [
      { id: 'funds', label: 'Sổ Quỹ & Ngân Hàng', icon: Wallet, roles: ['ADMIN', 'MANAGER'] },
      { id: 'partners', label: 'Công Nợ & Đối Tác', icon: Building2, roles: ['ADMIN', 'MANAGER'] }
    ]
  },
  {
    id: 'crm',
    label: 'Khách Hàng & CRM',
    items: [
      { id: 'crm', label: 'Pipeline Lead CRM', icon: Users, shortcut: 'Alt+4' },
      { id: 'chat', label: 'Chat Đa Kênh', icon: MessageSquare }
    ]
  },
  {
    id: 'hr',
    label: 'Nhân Sự & Vận Hành',
    items: [
      { id: 'attendance', label: 'Chấm Công & Ca', icon: Clock },
      { id: 'sop', label: 'SOP & Bàn Giao Ca', icon: CheckSquare },
      { id: 'users', label: 'Phân Quyền Hệ Thống', icon: ShieldCheck, roles: ['ADMIN'] }
    ]
  }
];

export const MOBILE_PRIMARY_TABS = [
  { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'pos', label: 'Bán hàng', icon: ShoppingCart },
  { id: 'inventory', label: 'Kho IMEI', icon: Package },
  { id: 'crm', label: 'CRM Lead', icon: Users },
  { id: 'menu', label: 'Thêm', icon: Settings }
];
