import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CalendarClock, Loader2, Megaphone, Pencil, Plus, RefreshCw, Send, X } from 'lucide-react';
import type { StoreBranch, UserAccount } from '../types';
import { apiJson } from '../services/apiClient';

type PromotionStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'EXPIRED' | 'ARCHIVED';
type Promotion = {
  id: string; title: string; summary: string; details?: string; category: string; bannerUrl?: string;
  startsAt: string; endsAt: string; status: PromotionStatus; allBranches: boolean; branchIds: string[];
  targetModelKeywords?: string[]; targetCustomerTiers?: string[]; targetActivityTypes?: string[]; conditions?: string[];
  ctaLabel?: string; voucherCode?: string; priority?: number;
};

const emptyDraft = () => ({
  title: '', summary: '', details: '', category: 'GENERAL', bannerUrl: '',
  startsAt: '', endsAt: '', allBranches: true, branchIds: [] as string[],
  targetModelKeywords: '', targetCustomerTiers: '', targetActivityTypes: '', conditions: '',
  ctaLabel: 'Xem chi tiết', voucherCode: '', priority: 0
});

const statusLabels: Record<PromotionStatus, string> = {
  DRAFT: 'Bản nháp', SCHEDULED: 'Đã lên lịch', PUBLISHED: 'Đang phát hành', EXPIRED: 'Đã hết hạn', ARCHIVED: 'Đã lưu trữ'
};

function toLocalInput(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function csv(value: string) { return value.split(',').map(item => item.trim()).filter(Boolean); }

export function PromotionCampaignManagerView({ branches, currentUser }: { branches: StoreBranch[]; currentUser?: UserAccount | null }) {
  const mayUseGlobalScope = ['ADMIN', 'REGIONAL_MANAGER'].includes(String(currentUser?.role || ''));
  const [items, setItems] = useState<Promotion[]>([]);
  const [filter, setFilter] = useState<'ALL' | PromotionStatus>('ALL');
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await apiJson<{ success: boolean; data: Promotion[] }>('/api/customer-portal/staff/promotions');
      setItems(response.data || []);
    } catch (e: any) { setError(e?.message || 'Không tải được chiến dịch.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => filter === 'ALL' ? items : items.filter(item => item.status === filter), [filter, items]);
  const startCreate = () => {
    setEditing(null);
    setDraft({ ...emptyDraft(), allBranches: mayUseGlobalScope, branchIds: mayUseGlobalScope || !currentUser?.branchId ? [] : [currentUser.branchId] });
    setOpen(true);
  };
  const startEdit = (item: Promotion) => {
    setEditing(item);
    setDraft({
      title: item.title || '', summary: item.summary || '', details: item.details || '', category: item.category || 'GENERAL', bannerUrl: item.bannerUrl || '',
      startsAt: toLocalInput(item.startsAt), endsAt: toLocalInput(item.endsAt), allBranches: item.allBranches !== false, branchIds: item.branchIds || [],
      targetModelKeywords: (item.targetModelKeywords || []).join(', '), targetCustomerTiers: (item.targetCustomerTiers || []).join(', '), targetActivityTypes: (item.targetActivityTypes || []).join(', '), conditions: (item.conditions || []).join('\n'),
      ctaLabel: item.ctaLabel || 'Xem chi tiết', voucherCode: item.voucherCode || '', priority: Number(item.priority || 0)
    });
    setOpen(true);
  };
  const save = async () => {
    setBusy('save'); setError('');
    try {
      const body = {
        ...draft,
        startsAt: new Date(draft.startsAt).toISOString(), endsAt: new Date(draft.endsAt).toISOString(),
        targetModelKeywords: csv(draft.targetModelKeywords), targetCustomerTiers: csv(draft.targetCustomerTiers), targetActivityTypes: csv(draft.targetActivityTypes),
        conditions: draft.conditions.split('\n').map(item => item.trim()).filter(Boolean), ctaType: 'DETAIL'
      };
      await apiJson(`/api/customer-portal/staff/promotions${editing ? `/${encodeURIComponent(editing.id)}` : ''}`, {
        method: editing ? 'PUT' : 'POST', body: JSON.stringify(body)
      });
      setOpen(false); await load();
    } catch (e: any) { setError(e?.message || 'Không lưu được chiến dịch.'); }
    finally { setBusy(''); }
  };
  const changeStatus = async (item: Promotion, status: PromotionStatus) => {
    setBusy(item.id); setError('');
    try {
      await apiJson(`/api/customer-portal/staff/promotions/${encodeURIComponent(item.id)}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      await load();
    } catch (e: any) { setError(e?.message || 'Không đổi được trạng thái chiến dịch.'); }
    finally { setBusy(''); }
  };
  const toggleBranch = (id: string) => setDraft(current => ({ ...current, branchIds: current.branchIds.includes(id) ? current.branchIds.filter(item => item !== id) : [...current.branchIds, id] }));

  return <main className="space-y-4">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#ff4b16]">PhoneHouse Care</p><h1 className="mt-1 text-2xl font-black">Chiến dịch ưu đãi khách hàng</h1><p className="mt-1 text-sm text-zinc-500">Quản lý phạm vi, đối tượng và vòng đời khuyến mãi từ một nguồn server.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-black"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />Làm mới</button><button onClick={startCreate} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ff4b16] px-4 text-xs font-black text-white"><Plus className="h-4 w-4" />Tạo chiến dịch</button></div></div>
    <div className="flex gap-2 overflow-x-auto pb-1">{(['ALL', 'DRAFT', 'SCHEDULED', 'PUBLISHED', 'EXPIRED', 'ARCHIVED'] as const).map(value => <button key={value} onClick={() => setFilter(value)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${filter === value ? 'bg-zinc-950 text-white' : 'border border-zinc-200 bg-white text-zinc-600'}`}>{value === 'ALL' ? 'Tất cả' : statusLabels[value]}</button>)}</div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div> : !visible.length ? <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-zinc-500"><Megaphone className="mx-auto mb-2 h-8 w-8 text-zinc-300" />Chưa có chiến dịch ở trạng thái này.</div> : <div className="grid gap-3 lg:grid-cols-2">{visible.map(item => <article key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-700">{item.category}</span><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-600">{statusLabels[item.status]}</span></div><h2 className="mt-2 font-black text-zinc-900">{item.title}</h2><p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-500">{item.summary}</p></div><button onClick={() => startEdit(item)} disabled={item.status === 'ARCHIVED'} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 disabled:opacity-30" aria-label="Sửa"><Pencil className="h-4 w-4" /></button></div><div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-zinc-50 p-3 text-xs"><div><span className="text-zinc-400">Bắt đầu</span><b className="mt-1 block">{new Date(item.startsAt).toLocaleString('vi-VN')}</b></div><div><span className="text-zinc-400">Kết thúc</span><b className="mt-1 block">{new Date(item.endsAt).toLocaleString('vi-VN')}</b></div><div className="col-span-2"><span className="text-zinc-400">Phạm vi</span><b className="mt-1 block">{item.allBranches ? 'Toàn hệ thống' : `${item.branchIds.length} chi nhánh`}</b></div></div><div className="mt-3 flex flex-wrap gap-2">{item.status === 'DRAFT' && <><button onClick={() => void changeStatus(item, 'SCHEDULED')} disabled={busy === item.id} className="inline-flex min-h-10 items-center gap-1 rounded-xl border px-3 text-xs font-black"><CalendarClock className="h-4 w-4" />Lên lịch</button><button onClick={() => void changeStatus(item, 'PUBLISHED')} disabled={busy === item.id} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white"><Send className="h-4 w-4" />Phát hành</button></>}{item.status === 'SCHEDULED' && <button onClick={() => void changeStatus(item, 'PUBLISHED')} disabled={busy === item.id} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white"><Send className="h-4 w-4" />Phát hành ngay</button>}{item.status === 'PUBLISHED' && <button onClick={() => void changeStatus(item, 'EXPIRED')} disabled={busy === item.id} className="min-h-10 rounded-xl border px-3 text-xs font-black">Kết thúc chiến dịch</button>}{item.status !== 'ARCHIVED' && <button onClick={() => void changeStatus(item, 'ARCHIVED')} disabled={busy === item.id} className="inline-flex min-h-10 items-center gap-1 rounded-xl border px-3 text-xs font-black text-zinc-500"><Archive className="h-4 w-4" />Lưu trữ</button>}</div></article>)}</div>}
    {open && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-0 sm:p-6"><div className="mx-auto min-h-full max-w-2xl bg-white sm:min-h-0 sm:rounded-3xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3 sm:rounded-t-3xl"><div><p className="font-black">{editing ? 'Chỉnh sửa chiến dịch' : 'Tạo chiến dịch mới'}</p><p className="text-xs text-zinc-500">Người thao tác: {currentUser?.displayName || currentUser?.email}</p></div><button onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl"><X className="h-5 w-5" /></button></div><div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6"><label className="text-sm font-bold sm:col-span-2">Tiêu đề<input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className="mt-1 h-12 w-full rounded-xl border px-3" /></label><label className="text-sm font-bold sm:col-span-2">Tóm tắt<textarea value={draft.summary} onChange={e => setDraft({ ...draft, summary: e.target.value })} className="mt-1 min-h-20 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold sm:col-span-2">Chi tiết<textarea value={draft.details} onChange={e => setDraft({ ...draft, details: e.target.value })} className="mt-1 min-h-28 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold">Nhóm<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} className="mt-1 h-12 w-full rounded-xl border px-3"><option value="GENERAL">Chung</option><option value="DEVICE">Mua máy</option><option value="REPAIR">Sửa chữa</option><option value="ACCESSORY">Phụ kiện</option><option value="LOYALTY">Khách thân thiết</option></select></label><label className="text-sm font-bold">Ưu tiên<input type="number" min="0" max="100" value={draft.priority} onChange={e => setDraft({ ...draft, priority: Number(e.target.value) })} className="mt-1 h-12 w-full rounded-xl border px-3" /></label><label className="text-sm font-bold">Bắt đầu<input type="datetime-local" value={draft.startsAt} onChange={e => setDraft({ ...draft, startsAt: e.target.value })} className="mt-1 h-12 w-full rounded-xl border px-3" /></label><label className="text-sm font-bold">Kết thúc<input type="datetime-local" value={draft.endsAt} onChange={e => setDraft({ ...draft, endsAt: e.target.value })} className="mt-1 h-12 w-full rounded-xl border px-3" /></label><label className="text-sm font-bold sm:col-span-2">URL banner<input value={draft.bannerUrl} onChange={e => setDraft({ ...draft, bannerUrl: e.target.value })} className="mt-1 h-12 w-full rounded-xl border px-3" placeholder="https://…" /></label><label className="text-sm font-bold">Model mục tiêu<input value={draft.targetModelKeywords} onChange={e => setDraft({ ...draft, targetModelKeywords: e.target.value })} className="mt-1 h-12 w-full rounded-xl border px-3" placeholder="iPhone 15, iPhone 16" /></label><label className="text-sm font-bold">Hạng khách<input value={draft.targetCustomerTiers} onChange={e => setDraft({ ...draft, targetCustomerTiers: e.target.value })} className="mt-1 h-12 w-full rounded-xl border px-3" placeholder="GOLD, VIP" /></label><label className="text-sm font-bold sm:col-span-2">Lịch sử mục tiêu<input value={draft.targetActivityTypes} onChange={e => setDraft({ ...draft, targetActivityTypes: e.target.value.toUpperCase() })} className="mt-1 h-12 w-full rounded-xl border px-3" placeholder="PURCHASE, REPAIR hoặc WARRANTY" /></label><label className="text-sm font-bold">CTA<input value={draft.ctaLabel} onChange={e => setDraft({ ...draft, ctaLabel: e.target.value })} className="mt-1 h-12 w-full rounded-xl border px-3" /></label><label className="text-sm font-bold">Mã voucher<input value={draft.voucherCode} onChange={e => setDraft({ ...draft, voucherCode: e.target.value.toUpperCase() })} className="mt-1 h-12 w-full rounded-xl border px-3 font-mono" /></label><label className="text-sm font-bold sm:col-span-2">Điều kiện, mỗi dòng một mục<textarea value={draft.conditions} onChange={e => setDraft({ ...draft, conditions: e.target.value })} className="mt-1 min-h-24 w-full rounded-xl border p-3" /></label><div className="sm:col-span-2"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.allBranches} onChange={e => setDraft({ ...draft, allBranches: e.target.checked, branchIds: e.target.checked ? [] : draft.branchIds })} className="h-4 w-4 accent-orange-600" />Áp dụng toàn hệ thống</label>{!draft.allBranches && <div className="mt-2 grid gap-2 sm:grid-cols-2">{branches.filter(branch => branch.isActive !== false).map(branch => <label key={branch.id} className="flex items-center gap-2 rounded-xl bg-zinc-50 p-3 text-sm"><input type="checkbox" checked={draft.branchIds.includes(branch.id)} onChange={() => toggleBranch(branch.id)} className="h-4 w-4 accent-orange-600" />{branch.name}</label>)}</div>}</div><div className="flex justify-end gap-2 sm:col-span-2"><button onClick={() => setOpen(false)} className="min-h-11 rounded-xl border px-4 text-sm font-black">Hủy</button><button onClick={() => void save()} disabled={busy === 'save' || !draft.title || !draft.summary || !draft.startsAt || !draft.endsAt || (!draft.allBranches && !draft.branchIds.length)} className="min-h-11 rounded-xl bg-[#ff4b16] px-5 text-sm font-black text-white disabled:opacity-40">{busy === 'save' ? 'Đang lưu…' : 'Lưu bản nháp'}</button></div></div></div></div>}
  </main>;
}

export default PromotionCampaignManagerView;
