import React from 'react';
import { ChevronRight, LogOut, Sparkles } from 'lucide-react';
import type { DeviceItem, Partner, SalesInvoice, UserAccount } from '../types';
import { getAuthorizedNavigation } from '../app/permissionNavigation';

interface MoreHubViewProps {
  currentUser?: UserAccount | null;
  onSelectTab: (tabId: string) => void;
  onOpenPOSModal: () => void;
  onOpenNewDeviceModal: () => void;
  onOpenAICopilot: () => void;
  onOpenLoginModal: () => void;
  onLogout: () => void;
  partners?: Partner[];
  invoices?: SalesInvoice[];
  devices?: DeviceItem[];
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Quản trị hệ thống',
  MANAGER: 'Quản lý',
  STORE_MANAGER: 'Quản lý cửa hàng',
  ACCOUNTANT: 'Kế toán',
  INVENTORY_MANAGER: 'Quản lý kho',
  SALES: 'Nhân viên bán hàng',
  SALE: 'Nhân viên bán hàng',
  CUSTOMER_CARE: 'Chăm sóc khách hàng',
  CSKH: 'Chăm sóc khách hàng',
  TECH: 'Kỹ thuật viên',
  TECHNICIAN: 'Kỹ thuật viên',
  TECH_LEAD: 'Trưởng kỹ thuật'
};

export const MoreHubView: React.FC<MoreHubViewProps> = ({
  currentUser,
  onSelectTab,
  onOpenPOSModal,
  onOpenAICopilot,
  onLogout
}) => {
  const role = currentUser?.role || 'SALES';
  const groups = getAuthorizedNavigation(role);

  const navigate = (tabId: string) => {
    if (tabId === 'pos') {
      onSelectTab('pos');
      onOpenPOSModal();
      return;
    }
    onSelectTab(tabId);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50/90 to-yellow-50 px-3 pb-28 pt-4 text-zinc-900 sm:px-5 sm:pb-12 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex items-start justify-between gap-4 border-b border-orange-200/60 pb-5">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-700">PhoneHouse</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Thêm chức năng</h1>
            <p className="mt-1 truncate text-xs font-semibold text-zinc-500 sm:text-sm">
              {currentUser?.displayName || 'Tài khoản'} · {ROLE_LABELS[role] || role}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAICopilot}
            className="flex shrink-0 items-center gap-2 py-2 text-xs font-black text-zinc-700 transition hover:text-orange-700"
          >
            <Sparkles className="h-5 w-5" />
            <span className="hidden sm:inline">Trợ lý AI</span>
          </button>
        </header>

        <div className="mt-3 divide-y divide-orange-200/60">
          {groups.map((group) => (
            <section key={group.id} className="py-5">
              <h2 className="mb-3 text-[11px] font-black uppercase tracking-[0.15em] text-zinc-500">{group.label}</h2>
              <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.id)}
                      className="group flex min-w-0 flex-col items-center gap-2 py-1 text-center sm:items-start sm:text-left"
                    >
                      <Icon className="h-6 w-6 text-zinc-700 transition group-hover:-translate-y-0.5 group-hover:text-orange-600" />
                      <span className="line-clamp-2 text-[11px] font-bold leading-4 text-zinc-700 group-hover:text-orange-700 sm:text-xs">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className="flex items-center justify-between border-t border-orange-200/60 py-5">
          <button
            type="button"
            onClick={() => onSelectTab('store-settings')}
            className="flex items-center gap-1.5 text-xs font-bold text-zinc-600 hover:text-orange-700"
          >
            Cài đặt hệ thống <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-2 text-xs font-black text-rose-600 hover:text-rose-700"
          >
            <LogOut className="h-4 w-4" /> Đăng xuất
          </button>
        </footer>
      </div>
    </main>
  );
};

export default MoreHubView;
