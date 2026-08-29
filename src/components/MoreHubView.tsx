import React, { useEffect, useState } from 'react';
import { Bot, ChevronRight, Copy, Link2, LogOut, Sparkles, Unlink } from 'lucide-react';
import type { DeviceItem, Partner, SalesInvoice, UserAccount } from '../types';
import { getAuthorizedNavigation } from '../app/permissionNavigation';
import { requestTelegramLinkCode, requestTelegramLinkStatus, requestUnlinkTelegram, TelegramLinkStatus } from '../services/telegramApiClient';

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
  const [telegramLink, setTelegramLink] = useState<TelegramLinkStatus | null>(null);
  const [telegramCode, setTelegramCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState('');

  useEffect(() => {
    if (!currentUser) return;
    requestTelegramLinkStatus().then(setTelegramLink).catch(() => setTelegramLink({ linked: false }));
  }, [currentUser?.id]);

  const createTelegramCode = async () => {
    setTelegramBusy(true);
    setTelegramError('');
    try {
      setTelegramCode(await requestTelegramLinkCode());
    } catch (error: any) {
      setTelegramError(error?.message || 'Không tạo được mã liên kết Telegram.');
    } finally {
      setTelegramBusy(false);
    }
  };

  const navigate = (tabId: string) => {
    if (tabId === 'pos') {
      onSelectTab('pos');
      onOpenPOSModal();
      return;
    }
    onSelectTab(tabId);
  };

  return (
    <main className="min-h-screen bg-white px-3 pb-28 pt-4 text-zinc-900 sm:px-5 sm:pb-12 lg:px-8">
      <svg aria-hidden="true" className="pointer-events-none absolute h-0 w-0">
        <defs>
          <linearGradient id="more-hub-icon-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff4b16" />
            <stop offset="100%" stopColor="#ff6b3d" />
          </linearGradient>
        </defs>
      </svg>
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-5">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ff4b16]">PhoneHouse</p>
            <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Xem thêm</h1>
            <p className="mt-1 truncate text-xs font-semibold text-zinc-500 sm:text-sm">
              {currentUser?.displayName || 'Tài khoản'} · {ROLE_LABELS[role] || role}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAICopilot}
            className="flex shrink-0 items-center gap-2 py-2 text-xs font-black text-zinc-700 transition hover:text-[#ff4b16]"
          >
            <Sparkles className="h-5 w-5" style={{ stroke: 'url(#more-hub-icon-gradient)' }} />
            <span className="hidden sm:inline">Trợ lý AI</span>
          </button>
        </header>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {groups.map((group) => (
            <section key={group.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-100/80">
              <h2 className="mb-4 text-[11px] font-black uppercase tracking-[0.15em] text-zinc-500">{group.label}</h2>
              <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
                {group.items.map((item) => {
                  const Icon = item.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.id)}
                      className="group flex min-w-0 flex-col items-center gap-2 py-1 text-center sm:items-start sm:text-left"
                    >
                      <Icon
                        className="h-6 w-6 transition group-hover:-translate-y-0.5"
                        style={{ stroke: 'url(#more-hub-icon-gradient)' }}
                      />
                      <span className="line-clamp-2 text-[11px] font-bold leading-4 text-zinc-700 group-hover:text-zinc-950 sm:text-xs">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-sky-600 p-2 text-white"><Bot className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-black text-zinc-900">Liên kết Telegram với CRM</h2>
                  <p className="mt-0.5 text-xs text-zinc-600">Bot nhận đúng vai trò và chỉ trả dữ liệu thuộc chi nhánh được cấp.</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${telegramLink?.linked ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'}`}>
                  {telegramLink?.linked ? 'Đã liên kết' : 'Chưa liên kết'}
                </span>
              </div>

              {telegramCode && !telegramLink?.linked && (
                <div className="mt-3 rounded-xl border border-sky-200 bg-white p-3">
                  <p className="text-[11px] font-bold text-zinc-500">Gửi lệnh sau cho bot Telegram trong 10 phút:</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-900 px-3 py-2 text-xs font-black text-white">/lienket {telegramCode.code}</code>
                    <button type="button" onClick={() => void navigator.clipboard.writeText(`/lienket ${telegramCode.code}`)} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-600 hover:text-sky-700" aria-label="Sao chép mã liên kết"><Copy className="h-4 w-4" /></button>
                  </div>
                  <p className="mt-2 text-[10px] text-zinc-500">Hết hạn: {new Date(telegramCode.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              )}

              {telegramError && <p className="mt-2 text-xs font-bold text-rose-600">{telegramError}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {!telegramLink?.linked ? (
                  <button type="button" onClick={() => void createTelegramCode()} disabled={telegramBusy} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                    <Link2 className="h-4 w-4" /> {telegramBusy ? 'Đang tạo…' : telegramCode ? 'Tạo mã mới' : 'Tạo mã liên kết'}
                  </button>
                ) : (
                  <button type="button" onClick={async () => {
                    if (!window.confirm('Hủy liên kết Telegram với tài khoản CRM này?')) return;
                    setTelegramBusy(true);
                    try {
                      await requestUnlinkTelegram();
                      setTelegramLink({ linked: false });
                      setTelegramCode(null);
                    } catch (error: any) {
                      setTelegramError(error?.message || 'Không hủy được liên kết.');
                    } finally {
                      setTelegramBusy(false);
                    }
                  }} disabled={telegramBusy} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-600 disabled:opacity-50">
                    <Unlink className="h-4 w-4" /> Hủy liên kết
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-4 flex items-center justify-between border-t border-zinc-200 py-5">
          <button
            type="button"
            onClick={() => onSelectTab('store-settings')}
            className="flex items-center gap-1.5 text-xs font-bold text-zinc-600 hover:text-[#ff4b16]"
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
