import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  History,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  ShoppingCart,
  UserCheck,
  Wrench,
  X
} from 'lucide-react';
import {
  DeviceLifecycleCategory,
  DeviceLifecycleEvent,
  DeviceLifecycleTimeline,
  fetchDeviceLifecycleTimeline
} from '../services/inventoryApiClient';
import {
  extractLabeledImei,
  normalizeClickableImei,
  OPEN_IMEI_HISTORY_EVENT,
  openImeiHistory
} from '../utils/imeiHistory';

export { extractLabeledImei, normalizeClickableImei, openImeiHistory } from '../utils/imeiHistory';

interface ImeiLinkProps {
  imei?: string | null;
  children?: React.ReactNode;
  className?: string;
  title?: string;
}

export const ImeiLink: React.FC<ImeiLinkProps> = ({ imei, children, className = '', title }) => {
  const normalized = normalizeClickableImei(imei);
  if (!normalized) return <>{children ?? imei ?? '—'}</>;
  return (
    <span
      role="button"
      tabIndex={0}
      data-imei-history={normalized}
      title={title || `Xem toàn bộ lịch sử IMEI ${normalized}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        openImeiHistory(normalized);
      }}
      className={`inline-flex cursor-pointer items-center gap-1 rounded-md text-left font-mono font-bold text-orange-700 underline decoration-orange-300 decoration-dotted underline-offset-2 transition hover:bg-orange-50 hover:text-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-300 ${className}`}
    >
      {children ?? normalized}
      <History className="h-3 w-3 shrink-0 opacity-70" />
    </span>
  );
};

const CATEGORY_META: Record<DeviceLifecycleCategory, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  INVENTORY: { label: 'Kho', icon: Package, tone: 'bg-orange-50 text-orange-800 border-orange-200' },
  TRANSFER: { label: 'Điều chuyển', icon: ArrowLeftRight, tone: 'bg-blue-50 text-blue-800 border-blue-200' },
  CUSTODY: { label: 'Người giữ', icon: UserCheck, tone: 'bg-violet-50 text-violet-800 border-violet-200' },
  TECHNICAL: { label: 'Kỹ thuật', icon: Wrench, tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  PARTS: { label: 'Linh kiện', icon: Package, tone: 'bg-sky-50 text-sky-800 border-sky-200' },
  QC: { label: 'KCS', icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  COST: { label: 'Giá vốn', icon: DollarSign, tone: 'bg-zinc-100 text-zinc-800 border-zinc-200' },
  SALE: { label: 'Bán/thu tiền', icon: ShoppingCart, tone: 'bg-rose-50 text-rose-800 border-rose-200' },
  NOTE: { label: 'Ghi chú', icon: FileText, tone: 'bg-zinc-50 text-zinc-700 border-zinc-200' }
};

function timelineEventLocation(event: DeviceLifecycleEvent): string {
  const from = event.fromLocationName || event.fromLocationId || '';
  const to = event.toLocationName || event.toLocationId || '';
  if (!from && !to) return '';
  return `${from || '—'} → ${to || '—'}`;
}

export const GlobalImeiHistory: React.FC = () => {
  const [imei, setImei] = useState('');
  const [timeline, setTimeline] = useState<DeviceLifecycleTimeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'ALL' | DeviceLifecycleCategory>('ALL');

  const load = async (nextImei = imei) => {
    const normalized = normalizeClickableImei(nextImei);
    if (!normalized) return;
    setLoading(true);
    setError('');
    try {
      setTimeline(await fetchDeviceLifecycleTimeline({ imei: normalized }));
    } catch (cause: any) {
      setTimeline(null);
      setError(cause?.message || 'Không tải được lịch sử IMEI này.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const open = (nextImei: unknown) => {
      const normalized = normalizeClickableImei(nextImei);
      if (!normalized) return;
      setImei(normalized);
      setTimeline(null);
      setFilter('ALL');
      void load(normalized);
    };
    const handleOpen = (event: Event) => open((event as CustomEvent<{ imei?: string }>).detail?.imei);
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target || target.closest('[data-imei-history-modal]')) return;
      const explicit = target.closest<HTMLElement>('[data-imei-history]')?.dataset.imeiHistory;
      if (explicit) {
        event.preventDefault();
        event.stopPropagation();
        open(explicit);
        return;
      }
      let node: HTMLElement | null = target;
      // Only inspect the clicked text node and its immediate wrapper. Walking the
      // whole card would turn a click on the model/action button into an IMEI click.
      for (let depth = 0; node && depth < 2; depth += 1, node = node.parentElement) {
        if (['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'].includes(node.tagName)) return;
        const text = String(node.textContent || '').trim();
        if (text.length > 160) continue;
        const detected = extractLabeledImei(text);
        if (!detected) continue;
        event.preventDefault();
        event.stopPropagation();
        open(detected);
        return;
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setImei('');
    };
    window.addEventListener(OPEN_IMEI_HISTORY_EVENT, handleOpen as EventListener);
    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener(OPEN_IMEI_HISTORY_EVENT, handleOpen as EventListener);
      document.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const visibleEvents = useMemo(
    () => (timeline?.events || []).filter(event => filter === 'ALL' || event.category === filter),
    [timeline?.events, filter]
  );

  if (!imei) return null;
  const summary = timeline?.summary;
  return (
    <div data-imei-history-modal className="fixed inset-0 z-[260] flex items-end bg-zinc-950/65 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setImei(''); }}>
      <section className="flex h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-zinc-50 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-3xl">
        <header className="shrink-0 bg-gradient-to-r from-zinc-950 via-zinc-900 to-orange-950 px-4 py-4 text-white sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-orange-300"><History className="h-4 w-4" /> Event Timeline IMEI</p>
              <h2 className="mt-1 truncate text-lg font-black sm:text-xl">{timeline?.device.model || 'Lịch sử cây máy'}</h2>
              <p className="mt-1 font-mono text-xs text-zinc-300">IMEI: {imei}{timeline?.device.branchName ? ` · ${timeline.device.branchName}` : ''}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => void load()} disabled={loading} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-50" title="Tải lại"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
              <button type="button" onClick={() => setImei('')} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20" title="Đóng"><X className="h-5 w-5" /></button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {error && <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
          {loading && !timeline && <div className="grid min-h-64 place-items-center text-sm font-bold text-zinc-500"><span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin text-orange-500" /> Đang đối chiếu toàn bộ lịch sử IMEI…</span></div>}

          {timeline && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {[
                  { label: 'Đang ở đâu', value: summary?.currentLocationName || 'Chưa xác định', icon: MapPin },
                  { label: 'Ai đang giữ', value: summary?.currentCustodianName || 'Chưa xác định', icon: UserCheck },
                  { label: 'Thời gian thực làm', value: `${Number(summary?.activeWorkMinutes || 0).toLocaleString('vi-VN')} phút`, icon: Clock },
                  {
                    label: timeline.canViewCost ? 'Giá vốn hiện tại' : 'KCS / sửa lại',
                    value: timeline.canViewCost
                      ? `${Number(summary?.currentCost || 0).toLocaleString('vi-VN')} đ`
                      : `${summary?.qcFailCount || 0} lỗi · ${summary?.reworkCount || 0} sửa lại`,
                    icon: timeline.canViewCost ? DollarSign : CheckCircle2
                  }
                ].map(item => {
                  const Icon = item.icon;
                  return <div key={item.label} className="min-w-0 rounded-2xl border border-orange-100 bg-white p-3"><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-400"><Icon className="h-3.5 w-3.5 text-orange-500" />{item.label}</p><p className="mt-1 truncate text-xs font-black text-zinc-900" title={item.value}>{item.value}</p></div>;
                })}
              </div>

              <div className="flex gap-1.5 overflow-x-auto rounded-2xl border bg-white p-2 scrollbar-none">
                {(['ALL', 'INVENTORY', 'TRANSFER', 'CUSTODY', 'TECHNICAL', 'PARTS', 'QC', 'COST', 'SALE', 'NOTE'] as const)
                  .filter(value => value !== 'COST' || timeline.canViewCost)
                  .map(value => <button key={value} type="button" onClick={() => setFilter(value)} className={`shrink-0 rounded-xl px-3 py-1.5 text-[10px] font-black ${filter === value ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{value === 'ALL' ? `Tất cả (${timeline.summary.eventCount})` : CATEGORY_META[value].label}</button>)}
              </div>

              <div className="relative space-y-3 pl-5 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-orange-200">
                {visibleEvents.map(event => {
                  const meta = CATEGORY_META[event.category];
                  const Icon = meta.icon;
                  const location = timelineEventLocation(event);
                  return <article key={event.id} className="relative rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4"><span className="absolute -left-[21px] top-5 grid h-4 w-4 place-items-center rounded-full bg-orange-500 ring-4 ring-zinc-50"><span className="h-1.5 w-1.5 rounded-full bg-white" /></span><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black ${meta.tone}`}><Icon className="h-3 w-3" />{meta.label}</span><h3 className="mt-1 text-sm font-black text-zinc-900">{event.title}</h3></div><time className="shrink-0 text-[10px] font-bold text-zinc-400">{new Date(event.occurredAt).toLocaleString('vi-VN')}</time></div>{event.description && <p className="mt-2 text-xs leading-5 text-zinc-600">{event.description}</p>}<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-zinc-100 pt-2 text-[10px] font-semibold text-zinc-500"><span>{event.actorName || event.actorUid || 'Hệ thống'}</span>{location && <span>{location}</span>}{Number(event.durationMinutes || 0) > 0 && <span>{Number(event.durationMinutes).toLocaleString('vi-VN')} phút</span>}{(event.documentCode || event.workOrderCode) && <span className="font-mono text-orange-700">{event.documentCode || event.workOrderCode}</span>}{timeline.canViewCost && event.amount != null && <span className="font-black text-orange-700">{Number(event.amount).toLocaleString('vi-VN')} đ</span>}</div></article>;
                })}
                {!visibleEvents.length && <div className="rounded-2xl border bg-white p-8 text-center text-sm text-zinc-500">Không có mốc lịch sử phù hợp.</div>}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
