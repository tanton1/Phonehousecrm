import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  Clock3,
  History,
  Loader2,
  MapPin,
  PackageCheck,
  Tags,
  Warehouse,
  X
} from 'lucide-react';
import { HelpHint } from './HelpHint';

export interface StockSkuLot {
  id: string;
  code: string;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unitCost?: number;
  receivedAt?: string | null;
}

export interface StockSkuLocation {
  id: string;
  warehouseId?: string | null;
  warehouseName: string;
  branchName?: string | null;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  currentCost?: number;
  traceId?: string;
  isLegacy?: boolean;
  lots?: StockSkuLot[];
}

export interface StockSkuGroup {
  id: string;
  itemType: 'PART' | 'ACCESSORY';
  productId?: string;
  productMasterId?: string | null;
  sku: string;
  name: string;
  category: string;
  brand?: string | null;
  modelCode?: string | null;
  compatibleModels?: string[];
  sellPrice?: number;
  locations: StockSkuLocation[];
}

export interface StockSkuTraceEvent {
  id: string;
  type: string;
  occurredAt?: string | null;
  quantity?: number | null;
  warehouseName?: string | null;
  counterpartyWarehouseName?: string | null;
  sourceCode?: string | null;
  sourceId?: string | null;
  actorName?: string | null;
  imei?: string | null;
  note?: string | null;
  status?: string | null;
}

export interface StockSkuTraceResult {
  events: StockSkuTraceEvent[];
  notice?: string;
}

interface GroupedStockSkuViewProps {
  groups: StockSkuGroup[];
  loading?: boolean;
  emptyMessage?: string;
  canViewCost?: boolean;
  onLoadTrace: (group: StockSkuGroup) => Promise<StockSkuTraceResult>;
}

const formatMoney = (value: number) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Không rõ thời gian';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const movementLabel = (type: string) => {
  const labels: Record<string, string> = {
    STOCK_RECEIPT: 'Nhập kho',
    STOCK_RECEIPT_CANCELLED: 'Hủy nhập kho',
    STOCK_SALE: 'Xuất bán',
    STOCK_SALE_REVERSAL: 'Hoàn hàng bán',
    TRANSFER_OUT: 'Điều chuyển đi',
    TRANSFER_IN: 'Điều chuyển đến',
    RESERVED: 'Giữ trước',
    RESERVATION_CANCELLED: 'Hủy giữ trước',
    ISSUED: 'Xuất cho kỹ thuật',
    CONSUMED: 'Đã sử dụng',
    RETURNED: 'Trả lại kho',
    SCRAPPED: 'Hỏng / loại bỏ',
    CANCELLED: 'Đã hủy'
  };
  return labels[String(type || '').toUpperCase()] || type || 'Biến động kho';
};

const eventTone = (type: string) => {
  const value = String(type || '').toUpperCase();
  if (value.includes('RECEIPT') || value.includes('TRANSFER_IN') || value.includes('RETURN')) return 'bg-emerald-500';
  if (value.includes('CANCEL') || value.includes('REVERSAL')) return 'bg-zinc-400';
  if (value.includes('SALE') || value.includes('ISSUED') || value.includes('CONSUMED') || value.includes('TRANSFER_OUT')) return 'bg-orange-500';
  if (value.includes('SCRAP')) return 'bg-rose-500';
  return 'bg-sky-500';
};

export const GroupedStockSkuView: React.FC<GroupedStockSkuViewProps> = ({
  groups,
  loading = false,
  emptyMessage = 'Không có mã hàng phù hợp bộ lọc hiện tại.',
  canViewCost = false,
  onLoadTrace
}) => {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<StockSkuGroup | null>(null);
  const [detailTab, setDetailTab] = useState<'OVERVIEW' | 'LOCATIONS' | 'HISTORY'>('OVERVIEW');
  const [trace, setTrace] = useState<StockSkuTraceResult | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState('');

  const selectedTotals = useMemo(() => selectedGroup?.locations.reduce((summary, location) => ({
    stock: summary.stock + Number(location.stockQuantity || 0),
    reserved: summary.reserved + Number(location.reservedQuantity || 0),
    available: summary.available + Number(location.availableQuantity || 0)
  }), { stock: 0, reserved: 0, available: 0 }), [selectedGroup]);

  const toggleGroup = (groupId: string) => {
    setExpandedIds(current => current.includes(groupId)
      ? current.filter(id => id !== groupId)
      : [...current, groupId]);
  };

  const openDetail = async (group: StockSkuGroup) => {
    setSelectedGroup(group);
    setDetailTab('OVERVIEW');
    setTrace(null);
    setTraceError('');
    setTraceLoading(true);
    try {
      setTrace(await onLoadTrace(group));
    } catch (cause: any) {
      setTraceError(cause?.message || 'Không thể tải lịch sử mã hàng.');
    } finally {
      setTraceLoading(false);
    }
  };

  if (loading && groups.length === 0) {
    return <div className="flex items-center justify-center gap-2 rounded-3xl border border-zinc-100 bg-white p-12 text-sm font-bold text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải tồn kho...</div>;
  }

  if (!loading && groups.length === 0) {
    return <div className="rounded-3xl border border-zinc-100 bg-white p-12 text-center"><PackageCheck className="mx-auto h-8 w-8 text-zinc-300" /><p className="mt-2 text-sm font-bold text-zinc-500">{emptyMessage}</p></div>;
  }

  return <>
    <section className="space-y-2.5 sm:space-y-3">
      {groups.map(group => {
        const isExpanded = expandedIds.includes(group.id);
        const totals = group.locations.reduce((summary, location) => ({
          stock: summary.stock + Number(location.stockQuantity || 0),
          reserved: summary.reserved + Number(location.reservedQuantity || 0),
          available: summary.available + Number(location.availableQuantity || 0)
        }), { stock: 0, reserved: 0, available: 0 });
        const hasMismatch = group.locations.some(location => Number(location.stockQuantity || 0) < Number(location.reservedQuantity || 0));
        const costs = group.locations.map(location => location.currentCost).filter((value): value is number => typeof value === 'number');
        const minCost = costs.length ? Math.min(...costs) : 0;
        const maxCost = costs.length ? Math.max(...costs) : 0;

        return <article key={group.id} className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-2xs transition hover:border-orange-300 sm:rounded-3xl">
          <button type="button" onClick={() => toggleGroup(group.id)} className="flex w-full items-center gap-3 p-3 text-left sm:p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-950 to-zinc-800 text-white shadow-sm"><Boxes className="h-5 w-5 text-orange-400" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black tracking-tight text-zinc-950 sm:text-base">{group.name}</span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] font-black text-orange-700">{group.sku}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${totals.available > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{totals.available} dùng được / {totals.stock} tổng</span>
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">{group.category || 'Chưa gán nhóm'}</span>
                {group.brand && <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">{group.brand}</span>}
                {group.productMasterId ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Đã liên kết Danh mục</span> : <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Mã cũ</span>}
                {hasMismatch && <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700"><AlertTriangle className="h-3 w-3" /> Cần đối soát</span>}
              </span>
              <span className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2">
                <span className="flex min-w-0 flex-wrap gap-1">
                  {group.locations.slice(0, 4).map(location => <span key={location.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-bold text-zinc-600">{location.warehouseName}: <b className="text-zinc-950">{location.availableQuantity}</b></span>)}
                  {group.locations.length > 4 && <span className="rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-500">+{group.locations.length - 4} kho</span>}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-black text-zinc-500">{isExpanded ? 'Thu gọn' : `Xem ${group.locations.length} vị trí`}<ChevronDown className={`h-3.5 w-3.5 transition ${isExpanded ? 'rotate-180 text-orange-600' : ''}`} /></span>
              </span>
            </span>
          </button>

          {isExpanded && <div className="space-y-2 border-t border-zinc-100 bg-zinc-50/50 p-2.5 sm:p-3">
            {group.locations.map(location => {
              const mismatch = Number(location.stockQuantity || 0) < Number(location.reservedQuantity || 0);
              return <div key={location.id} className="rounded-2xl border border-zinc-200/80 bg-white p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-xs font-black text-zinc-900"><MapPin className="h-3.5 w-3.5 shrink-0 text-orange-600" /> {location.warehouseName}</p>
                    {location.branchName && <p className="mt-0.5 truncate text-[10px] font-bold text-zinc-400">{location.branchName}</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <span className="rounded-lg bg-zinc-100 px-2 py-1"><b className="block text-xs text-zinc-900">{location.stockQuantity}</b><small className="text-[9px] font-bold text-zinc-500">Tồn</small></span>
                    <span className="rounded-lg bg-amber-50 px-2 py-1"><b className="block text-xs text-amber-800">{location.reservedQuantity}</b><small className="text-[9px] font-bold text-amber-700">Đã giữ</small></span>
                    <span className={`rounded-lg px-2 py-1 ${mismatch ? 'bg-rose-50' : 'bg-emerald-50'}`}><b className={`block text-xs ${mismatch ? 'text-rose-700' : 'text-emerald-700'}`}>{location.availableQuantity}</b><small className={`text-[9px] font-bold ${mismatch ? 'text-rose-600' : 'text-emerald-600'}`}>Khả dụng</small></span>
                  </div>
                </div>
                {!!location.lots?.length && <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{location.lots.map(lot => <span key={lot.id} className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-bold text-zinc-600">Lô {lot.code}: {lot.availableQuantity}/{lot.stockQuantity}{canViewCost && typeof lot.unitCost === 'number' ? ` · ${formatMoney(lot.unitCost)}` : ''}</span>)}</div>}
              </div>;
            })}
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-950 p-3 text-white">
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{typeof group.sellPrice === 'number' ? 'Giá bán' : 'Giá vốn theo kho'}</p><p className="truncate text-sm font-black text-orange-400">{typeof group.sellPrice === 'number' ? formatMoney(group.sellPrice) : canViewCost && costs.length ? (minCost === maxCost ? formatMoney(minCost) : `${formatMoney(minCost)} – ${formatMoney(maxCost)}`) : 'Ẩn theo quyền'}</p></div>
              <button type="button" onClick={() => void openDetail(group)} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-orange-600 px-3 text-xs font-black text-white"><History className="h-4 w-4" /> Chi tiết &amp; lịch sử</button>
            </div>
          </div>}
        </article>;
      })}
    </section>

    {selectedGroup && <div className="fixed inset-0 z-[120] flex bg-black/55 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Chi tiết ${selectedGroup.name}`}>
      <button type="button" aria-label="Đóng chi tiết" onClick={() => setSelectedGroup(null)} className="hidden flex-1 cursor-default lg:block" />
      <section className="flex h-full w-full flex-col bg-[#f7f7f8] shadow-2xl lg:ml-auto lg:max-w-3xl">
        <header className="shrink-0 bg-zinc-950 px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top))] text-white sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="font-mono text-[11px] font-black text-orange-400">{selectedGroup.sku}</p><h2 className="mt-1 truncate text-lg font-black tracking-tight">{selectedGroup.name}</h2><p className="mt-1 text-xs text-zinc-400">{selectedGroup.category} · {selectedGroup.locations.length} vị trí kho</p></div>
            <button type="button" onClick={() => setSelectedGroup(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white"><X className="h-5 w-5" /></button>
          </div>
          <nav className="mt-3 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {([['OVERVIEW', 'Tổng quan'], ['LOCATIONS', 'Theo kho & lô'], ['HISTORY', 'Lịch sử']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setDetailTab(value)} className={`h-9 shrink-0 rounded-xl px-3 text-xs font-black ${detailTab === value ? 'bg-orange-600 text-white' : 'bg-white/10 text-zinc-300'}`}>{label}</button>)}
          </nav>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5">
          {detailTab === 'OVERVIEW' && <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-zinc-100 bg-white p-3"><p className="text-[10px] font-bold text-zinc-500">Tồn vật lý</p><p className="mt-1 text-xl font-black text-zinc-950">{selectedTotals?.stock || 0}</p></div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3"><p className="text-[10px] font-bold text-amber-700">Đã giữ</p><p className="mt-1 text-xl font-black text-amber-800">{selectedTotals?.reserved || 0}</p></div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-[10px] font-bold text-emerald-700">Có thể dùng</p><p className="mt-1 text-xl font-black text-emerald-800">{selectedTotals?.available || 0}</p></div>
            </div>
            <section className="rounded-2xl border border-zinc-100 bg-white p-4">
              <div className="flex items-center gap-2"><Tags className="h-4 w-4 text-orange-600" /><h3 className="text-sm font-black text-zinc-900">Thông tin mã hàng</h3><HelpHint title="Mã hàng và tồn kho">Một SKU là một mặt hàng. Các dòng bên dưới chỉ là số lượng của cùng SKU tại từng kho, không phải SKU mới.</HelpHint></div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-zinc-400">Nhóm hàng</dt><dd className="mt-0.5 font-black text-zinc-800">{selectedGroup.category || 'Chưa gán'}</dd></div>
                <div><dt className="text-zinc-400">Loại tồn</dt><dd className="mt-0.5 font-black text-zinc-800">{selectedGroup.itemType === 'PART' ? 'Linh kiện kỹ thuật' : 'Phụ kiện bán lẻ'}</dd></div>
                <div><dt className="text-zinc-400">Thương hiệu</dt><dd className="mt-0.5 font-black text-zinc-800">{selectedGroup.brand || 'Chưa gán'}</dd></div>
                <div><dt className="text-zinc-400">Danh mục Smart</dt><dd className={`mt-0.5 font-black ${selectedGroup.productMasterId ? 'text-emerald-700' : 'text-amber-700'}`}>{selectedGroup.productMasterId ? 'Đã liên kết' : 'Mã cũ'}</dd></div>
              </dl>
              {!!selectedGroup.compatibleModels?.length && <div className="mt-3 border-t border-zinc-100 pt-3"><p className="text-[10px] font-bold text-zinc-400">Model tương thích</p><div className="mt-1.5 flex flex-wrap gap-1">{selectedGroup.compatibleModels.map(model => <span key={model} className="rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-700">{model}</span>)}</div></div>}
            </section>
            <button type="button" onClick={() => setDetailTab('HISTORY')} className="flex min-h-12 w-full items-center justify-between rounded-2xl bg-zinc-950 px-4 text-left text-white"><span><span className="block text-sm font-black">Xem lịch sử chứng từ</span><span className="text-[10px] text-zinc-400">Nhập, bán, điều chuyển và sử dụng</span></span><History className="h-5 w-5 text-orange-400" /></button>
          </div>}

          {detailTab === 'LOCATIONS' && <div className="space-y-2.5">
            {selectedGroup.locations.map(location => <section key={location.id} className="rounded-2xl border border-zinc-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-1.5 text-sm font-black text-zinc-900"><Warehouse className="h-4 w-4 text-orange-600" /> {location.warehouseName}</p>{location.branchName && <p className="mt-1 text-[11px] font-bold text-zinc-400">{location.branchName}</p>}</div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">{location.availableQuantity} khả dụng</span></div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-zinc-50 p-2"><b className="block text-sm text-zinc-900">{location.stockQuantity}</b><span className="text-[9px] font-bold text-zinc-500">Tồn</span></div><div className="rounded-xl bg-amber-50 p-2"><b className="block text-sm text-amber-800">{location.reservedQuantity}</b><span className="text-[9px] font-bold text-amber-700">Giữ</span></div><div className="rounded-xl bg-emerald-50 p-2"><b className="block text-sm text-emerald-800">{location.availableQuantity}</b><span className="text-[9px] font-bold text-emerald-700">Dùng được</span></div></div>
              {!!location.lots?.length && <div className="mt-3 space-y-1.5 border-t border-zinc-100 pt-3">{location.lots.map(lot => <div key={lot.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2 text-xs"><span className="min-w-0"><b className="block truncate text-zinc-800">Lô {lot.code}</b><small className="text-zinc-400">{lot.receivedAt ? `Nhận ${formatDateTime(lot.receivedAt)}` : 'Chưa có ngày nhận'}</small></span><span className="shrink-0 text-right font-black text-zinc-800">{lot.availableQuantity}/{lot.stockQuantity}{canViewCost && typeof lot.unitCost === 'number' && <small className="block font-medium text-zinc-400">{formatMoney(lot.unitCost)}</small>}</span></div>)}</div>}
            </section>)}
          </div>}

          {detailTab === 'HISTORY' && <section className="rounded-2xl border border-zinc-100 bg-white p-4">
            <div className="flex items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-black text-zinc-900"><Clock3 className="h-4 w-4 text-orange-600" /> Dòng thời gian</h3><p className="mt-1 text-[11px] text-zinc-500">Mỗi sự kiện liên kết về chứng từ nguồn khi dữ liệu có sẵn.</p></div>{traceLoading && <Loader2 className="h-5 w-5 animate-spin text-orange-600" />}</div>
            {traceError && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{traceError}</p>}
            {trace?.notice && <p className="mt-3 rounded-xl bg-sky-50 p-3 text-xs font-medium leading-5 text-sky-800">{trace.notice}</p>}
            {!traceLoading && !traceError && (trace?.events.length || 0) === 0 && <p className="mt-4 rounded-xl bg-zinc-50 p-5 text-center text-xs text-zinc-500">Chưa có biến động được ghi cho mã hàng này.</p>}
            <div className="mt-4 space-y-0">
              {trace?.events.map((event, index) => <div key={event.id} className="relative flex gap-3 pb-4 last:pb-0"><div className="relative flex w-3 shrink-0 justify-center"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${eventTone(event.type)}`} />{index < trace.events.length - 1 && <span className="absolute bottom-0 top-4 w-px bg-zinc-200" />}</div><div className="min-w-0 flex-1 rounded-xl border border-zinc-100 bg-zinc-50/70 px-3 py-2.5"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs font-black text-zinc-900">{movementLabel(event.type)}</p><time className="text-[10px] font-medium text-zinc-400">{formatDateTime(event.occurredAt)}</time></div><div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-bold"><span className="rounded bg-white px-1.5 py-0.5 text-zinc-700">SL: {Math.abs(Number(event.quantity || 0)) || '—'}</span>{event.warehouseName && <span className="rounded bg-white px-1.5 py-0.5 text-zinc-700">{event.warehouseName}</span>}{event.imei && <span className="rounded bg-sky-50 px-1.5 py-0.5 font-mono text-sky-800">IMEI {event.imei}</span>}</div>{(event.sourceCode || event.sourceId) && <p className="mt-1.5 truncate font-mono text-[10px] font-bold text-orange-700">Chứng từ: {event.sourceCode || event.sourceId}</p>}{event.note && <p className="mt-1 text-[11px] leading-4 text-zinc-500">{event.note}</p>}</div></div>)}
            </div>
          </section>}
        </div>
      </section>
    </div>}
  </>;
};
