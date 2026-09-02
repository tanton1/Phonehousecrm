import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, LayoutDashboard, Megaphone, RefreshCw, Settings2, ShieldCheck, Smartphone, Tags } from 'lucide-react';
import type { StoreBranch, UserAccount } from '../types';
import { apiJson } from '../services/apiClient';
import { QuickQuoteRequestsView } from './QuickQuoteRequestsView';
import { PromotionCampaignManagerView } from './PromotionCampaignManagerView';

type MiniAppSection = 'OVERVIEW' | 'CATALOG' | 'CONTENT';
type MiniAppSettings = { enabled: boolean; responseSlaMinutes: number; validityHours: number; fallbackBranchId?: string };
type MiniAppPromotion = { id: string; title: string; status: string; updatedAt?: string; bannerUrl?: string };

interface CustomerMiniAppManagerViewProps {
  currentUser?: UserAccount | null;
  branches: StoreBranch[];
  initialSection?: MiniAppSection;
  onNavigate?: (tab: string) => void;
}

export const CustomerMiniAppManagerView: React.FC<CustomerMiniAppManagerViewProps> = ({ currentUser, branches, initialSection = 'OVERVIEW', onNavigate }) => {
  const [section, setSection] = useState<MiniAppSection>(initialSection);
  const [settings, setSettings] = useState<MiniAppSettings | null>(null);
  const [promotions, setPromotions] = useState<MiniAppPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [settingsResponse, promotionsResponse] = await Promise.all([
        apiJson<{ success: boolean; data: MiniAppSettings }>('/api/customer-portal/staff/quick-quote/settings'),
        apiJson<{ success: boolean; data: MiniAppPromotion[] }>('/api/customer-portal/staff/promotions')
      ]);
      setSettings(settingsResponse.data);
      setPromotions(promotionsResponse.data || []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Không tải được trạng thái Mini App.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const publishedCount = promotions.filter(item => item.status === 'PUBLISHED').length;
  const draftCount = promotions.filter(item => item.status === 'DRAFT').length;
  const activeBranches = branches.filter(branch => branch.isActive !== false).length;

  const nav = [
    { id: 'OVERVIEW' as const, label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'CATALOG' as const, label: 'Cấu hình miniweb', icon: Settings2 },
    { id: 'CONTENT' as const, label: 'Bài đăng & AI', icon: Megaphone }
  ];

  return (
    <main className="space-y-4">
      <header className="overflow-hidden rounded-3xl bg-zinc-950 p-5 text-white shadow-xl shadow-zinc-200 sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="text-[11px] font-black uppercase tracking-[.18em] text-orange-300">PhoneHouse Care · Customer Growth</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Trung tâm Mini App khách hàng</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-300">Một nơi để vận hành trang báo giá, danh mục công khai, bài đăng ưu đãi và quy trình AI tạo nội dung cho khách hàng.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/khach-hang" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-black"><ExternalLink className="h-4 w-4" /> Cổng khách hàng</a>
            <a href="/khach-hang/bao-gia" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-500 px-3 text-xs font-black"><Smartphone className="h-4 w-4" /> Miniweb báo giá</a>
          </div>
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm" aria-label="Khu vực quản lý Mini App">
        {nav.map(item => {
          const Icon = item.icon;
          return <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-xs font-black transition ${section === item.id ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-orange-50 hover:text-orange-700'}`}><Icon className="h-4 w-4" />{item.label}</button>;
        })}
        <button type="button" onClick={() => void loadOverview()} className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-xs font-black text-zinc-600"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới</button>
      </nav>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}

      {section === 'OVERVIEW' && <>
        <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4"><p className="text-[11px] font-bold text-zinc-500">Miniweb báo giá</p><p className={`mt-2 text-xl font-black ${settings?.enabled ? 'text-emerald-600' : 'text-zinc-400'}`}>{settings?.enabled ? 'Đang bật' : 'Đang tắt'}</p><p className="mt-1 text-[11px] text-zinc-500">SLA {settings?.responseSlaMinutes || '—'} phút</p></div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-[11px] font-bold text-emerald-600">Bài đang phát hành</p><p className="mt-2 text-2xl font-black text-emerald-700">{publishedCount}</p><p className="mt-1 text-[11px] text-emerald-700/70">Hiển thị trong cổng khách</p></div>
          <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4"><p className="text-[11px] font-bold text-orange-600">Bản nháp cần duyệt</p><p className="mt-2 text-2xl font-black text-orange-700">{draftCount}</p><p className="mt-1 text-[11px] text-orange-700/70">Có thể viết tiếp bằng AI</p></div>
          <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4"><p className="text-[11px] font-bold text-sky-600">Chi nhánh phục vụ</p><p className="mt-2 text-2xl font-black text-sky-700">{activeBranches}</p><p className="mt-1 text-[11px] text-sky-700/70">Theo phạm vi Mini App</p></div>
        </section>

        <section className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3"><div className="rounded-xl bg-orange-100 p-2 text-orange-700"><Megaphone className="h-5 w-5" /></div><div><h2 className="text-base font-black">Quy trình vận hành đề xuất</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Giữ AI ở vai trò trợ lý, dữ liệu giá và trạng thái vẫn do hệ thống máy chủ xác nhận.</p></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[['1', 'Bật sản phẩm', 'Chọn iPhone, dịch vụ, phụ kiện được công khai'], ['2', 'Tạo bài bằng AI', 'Mô tả chương trình, AI sinh bản nháp và banner'], ['3', 'Duyệt & phát hành', 'Kiểm tra điều kiện rồi phát hành tới khách']].map(([number, title, text]) => <div key={number} className="rounded-xl bg-zinc-50 p-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-950 text-xs font-black text-white">{number}</span><p className="mt-3 text-xs font-black">{title}</p><p className="mt-1 text-[11px] leading-5 text-zinc-500">{text}</p></div>)}
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setSection('CATALOG')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-zinc-950 px-3 text-xs font-black text-white">Quản lý danh mục <ArrowRight className="h-4 w-4" /></button>{String(currentUser?.role || '').toUpperCase() === 'ADMIN' && onNavigate && <button type="button" onClick={() => onNavigate('retail-pricing')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-700"><Tags className="h-4 w-4" /> Cập nhật bảng giá</button>}<button type="button" onClick={() => setSection('CONTENT')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 text-xs font-black text-orange-700">Mở AI Studio <ArrowRight className="h-4 w-4" /></button></div>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-sky-600 p-2 text-white"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="text-base font-black text-zinc-950">An toàn dữ liệu</h2><p className="mt-1 text-xs leading-5 text-zinc-600">Khóa AI chỉ chạy ở server. Mini App công khai không nhận IMEI, giá vốn hoặc số tồn nội bộ.</p></div></div><div className="mt-5 space-y-2 text-xs font-bold text-sky-900"><p>✓ Giá báo khách được máy chủ xác nhận lại</p><p>✓ Bài AI luôn bắt đầu ở bản nháp</p><p>✓ Ảnh AI lưu Firebase Storage, không lưu base64 trong bài</p><p>✓ Có thể xem trước trước khi phát hành</p></div></div>
        </section>
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-black">Bài gần đây</h2><p className="mt-1 text-xs text-zinc-500">Theo dõi nhanh nội dung đang cần xử lý.</p></div><button type="button" onClick={() => setSection('CONTENT')} className="inline-flex min-h-10 items-center gap-1 rounded-xl border px-3 text-xs font-black">Mở quản lý bài <ArrowRight className="h-4 w-4" /></button></div>{promotions.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{promotions.slice(0, 6).map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-zinc-100 p-3"><div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-orange-50">{item.bannerUrl ? <img src={item.bannerUrl} alt="" className="h-full w-full object-cover" /> : <Megaphone className="m-3 h-6 w-6 text-orange-400" />}</div><div className="min-w-0"><p className="truncate text-xs font-black">{item.title}</p><span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-600">{item.status}</span></div></div>)}</div> : <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-xs font-semibold text-zinc-500">Chưa có bài đăng. Hãy mở AI Studio để tạo bản nháp đầu tiên.</p>}</section>
      </>}

      {section === 'CATALOG' && <QuickQuoteRequestsView currentUser={currentUser} branches={branches} initialMode="SETTINGS" settingsOnly />}
      {section === 'CONTENT' && <PromotionCampaignManagerView branches={branches} currentUser={currentUser} />}
    </main>
  );
};

export default CustomerMiniAppManagerView;
