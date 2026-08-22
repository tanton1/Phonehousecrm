import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Loader2, Plus, RefreshCw, Search, Warehouse, X } from 'lucide-react';
import { UserAccount, WarehouseInfo } from '../types';
import { fetchTechnicalSpareParts, requestReceiveTechnicalSparePart } from '../services/technicalApiClient';

interface TechnicalSparePartsViewProps {
  warehouses: WarehouseInfo[];
  currentUser?: UserAccount | null;
}

interface TechnicalSparePartRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  branchId?: string | null;
  warehouseId?: string | null;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  compatibleModels?: string[];
  currentCost?: number;
  lots?: Array<{
    id: string;
    lotCode: string;
    stockQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
    unitCost?: number;
    receivedAt?: string | null;
  }>;
}

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0
});

export const TechnicalSparePartsView: React.FC<TechnicalSparePartsViewProps> = ({ warehouses, currentUser }) => {
  const [parts, setParts] = useState<TechnicalSparePartRow[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receipt, setReceipt] = useState({
    sku: '', name: '', category: 'KHAC', warehouseId: '', lotCode: '', quantity: 1, unitCost: 0,
    sourceType: 'PART_PURCHASE' as 'PART_PURCHASE' | 'OPENING_BALANCE' | 'MANUAL_ADJUSTMENT',
    sourceId: '', sourceCode: '', note: '', compatibleModels: ''
  });
  const canReceive = ['ADMIN', 'MANAGER'].includes(String(currentUser?.role || '').toUpperCase());

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setParts(await fetchTechnicalSpareParts(warehouseId || undefined));
    } catch (cause: any) {
      setError(cause?.message || 'Không thể tải kho linh kiện kỹ thuật.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [warehouseId]);

  const submitReceipt = async () => {
    const selectedWarehouse = warehouses.find(item => item.id === receipt.warehouseId);
    if (!selectedWarehouse?.branchId) {
      setError('Kho linh kiện phải được định danh chi nhánh trước khi nhập.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await requestReceiveTechnicalSparePart({
        sku: receipt.sku.trim(),
        name: receipt.name.trim(),
        category: receipt.category.trim() || 'KHAC',
        branchId: selectedWarehouse.branchId,
        warehouseId: selectedWarehouse.id,
        lotCode: receipt.lotCode.trim() || undefined,
        quantity: Number(receipt.quantity),
        unitCost: Number(receipt.unitCost),
        sourceType: receipt.sourceType,
        sourceId: receipt.sourceId.trim(),
        sourceCode: receipt.sourceCode.trim() || undefined,
        note: receipt.note.trim(),
        compatibleModels: receipt.compatibleModels.split(',').map(value => value.trim()).filter(Boolean)
      });
      setReceipt(current => ({ ...current, sku: '', name: '', lotCode: '', quantity: 1, unitCost: 0, sourceId: '', sourceCode: '', note: '', compatibleModels: '' }));
      setReceiptOpen(false);
      await load();
    } catch (cause: any) {
      setError(cause?.message || 'Không thể nhập kho linh kiện.');
    } finally {
      setLoading(false);
    }
  };

  const warehouseById = useMemo(() => new Map(warehouses.map(item => [item.id, item])), [warehouses]);
  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi');
    if (!keyword) return parts;
    return parts.filter(part => [part.sku, part.name, part.category, ...(part.compatibleModels || [])]
      .some(value => String(value || '').toLocaleLowerCase('vi').includes(keyword)));
  }, [parts, search]);
  const totals = useMemo(() => filtered.reduce((summary, part) => ({
    stock: summary.stock + Number(part.stockQuantity || 0),
    reserved: summary.reserved + Number(part.reservedQuantity || 0),
    available: summary.available + Number(part.availableQuantity || 0),
    value: summary.value + Number(part.availableQuantity || 0) * Number(part.currentCost || 0)
  }), { stock: 0, reserved: 0, available: 0, value: 0 }), [filtered]);
  const mayViewCost = parts.some(part => typeof part.currentCost === 'number');

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-24 sm:space-y-6 sm:pb-8">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-zinc-900 sm:text-2xl">
            <Boxes className="h-7 w-7 text-orange-600" /> Kho linh kiện kỹ thuật
          </h2>
          <p className="mt-1 text-sm text-zinc-500">Nguồn chuẩn: spareParts. Tồn chỉ thay đổi qua phiếu nhập, xuất, dùng, trả hoặc đảo ledger.</p>
        </div>
        <div className="flex gap-2">
          {canReceive && <button onClick={() => setReceiptOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white"><Plus className="h-4 w-4" /> Nhập linh kiện</button>}
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-black text-zinc-700 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Làm mới
          </button>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

      {receiptOpen && <section className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 sm:p-5">
        <div className="flex items-center justify-between"><div><h3 className="font-black text-zinc-900">Phiếu nhận linh kiện theo lô</h3><p className="text-xs text-zinc-500">Tăng tồn vật lý, snapshot giá vốn lô và cập nhật bình quân kho trong một transaction.</p></div><button onClick={() => setReceiptOpen(false)} className="rounded-lg p-2 text-zinc-500"><X className="h-5 w-5" /></button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input value={receipt.sku} onChange={event => setReceipt(current => ({ ...current, sku: event.target.value }))} placeholder="SKU *" className="h-11 rounded-xl border px-3 text-sm" />
          <input value={receipt.name} onChange={event => setReceipt(current => ({ ...current, name: event.target.value }))} placeholder="Tên linh kiện *" className="h-11 rounded-xl border px-3 text-sm" />
          <input value={receipt.category} onChange={event => setReceipt(current => ({ ...current, category: event.target.value }))} placeholder="Phân loại" className="h-11 rounded-xl border px-3 text-sm" />
          <select value={receipt.warehouseId} onChange={event => setReceipt(current => ({ ...current, warehouseId: event.target.value }))} className="h-11 rounded-xl border bg-white px-3 text-sm font-bold"><option value="">Kho nhận *</option>{warehouses.filter(item => item.isActive !== false && !item.isArchived).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <input value={receipt.lotCode} onChange={event => setReceipt(current => ({ ...current, lotCode: event.target.value }))} placeholder="Mã lô" className="h-11 rounded-xl border px-3 text-sm" />
          <input type="number" min={1} value={receipt.quantity} onChange={event => setReceipt(current => ({ ...current, quantity: Number(event.target.value) }))} placeholder="Số lượng" className="h-11 rounded-xl border px-3 text-sm" />
          <input type="number" min={0} step={1} value={receipt.unitCost} onChange={event => setReceipt(current => ({ ...current, unitCost: Number(event.target.value) }))} placeholder="Giá vốn/đơn vị" className="h-11 rounded-xl border px-3 text-sm" />
          <select value={receipt.sourceType} onChange={event => setReceipt(current => ({ ...current, sourceType: event.target.value as typeof current.sourceType }))} className="h-11 rounded-xl border bg-white px-3 text-sm"><option value="PART_PURCHASE">Mua linh kiện</option><option value="OPENING_BALANCE">Tồn đầu kỳ</option><option value="MANUAL_ADJUSTMENT">Điều chỉnh có lý do</option></select>
          <input value={receipt.sourceId} onChange={event => setReceipt(current => ({ ...current, sourceId: event.target.value }))} placeholder="ID chứng từ nguồn *" className="h-11 rounded-xl border px-3 text-sm" />
          <input value={receipt.sourceCode} onChange={event => setReceipt(current => ({ ...current, sourceCode: event.target.value }))} placeholder="Mã chứng từ hiển thị" className="h-11 rounded-xl border px-3 text-sm" />
          <input value={receipt.compatibleModels} onChange={event => setReceipt(current => ({ ...current, compatibleModels: event.target.value }))} placeholder="Model tương thích, cách nhau dấu phẩy" className="h-11 rounded-xl border px-3 text-sm lg:col-span-2" />
          <input value={receipt.note} onChange={event => setReceipt(current => ({ ...current, note: event.target.value }))} placeholder="Ghi chú/lý do" className="h-11 rounded-xl border px-3 text-sm lg:col-span-3" />
          <button disabled={loading || !receipt.sku.trim() || !receipt.name.trim() || !receipt.warehouseId || !receipt.sourceId.trim() || receipt.quantity < 1 || receipt.unitCost < 0} onClick={() => void submitReceipt()} className="h-11 rounded-xl bg-orange-600 px-4 text-sm font-black text-white disabled:opacity-40">Xác nhận nhập</button>
        </div>
      </section>}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Tổng tồn vật lý', totals.stock],
          ['Đang giữ trước', totals.reserved],
          ['Có thể xuất', totals.available],
          ['Giá trị khả dụng', mayViewCost ? money.format(totals.value) : 'Ẩn theo quyền']
        ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold text-zinc-500">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>)}
      </section>

      <section className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-[minmax(0,1fr)_280px]">
        <label className="relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-zinc-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm SKU, tên, model tương thích..." className="h-11 w-full rounded-xl border pl-11 pr-3 text-sm" />
        </label>
        <label className="relative">
          <Warehouse className="absolute left-3 top-3 h-5 w-5 text-zinc-400" />
          <select value={warehouseId} onChange={event => setWarehouseId(event.target.value)} className="h-11 w-full rounded-xl border bg-white pl-11 pr-3 text-sm font-bold">
            <option value="">Tất cả kho được phép xem</option>
            {warehouses.filter(item => item.isActive !== false && !item.isArchived).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="hidden grid-cols-[120px_minmax(220px,1fr)_180px_90px_90px_110px_150px] gap-3 border-b bg-zinc-50 px-4 py-3 text-xs font-black text-zinc-500 lg:grid">
          <span>SKU</span><span>Linh kiện</span><span>Kho vật lý</span><span>Tồn</span><span>Đã giữ</span><span>Khả dụng</span><span>Giá vốn</span>
        </div>
        <div className="divide-y">
          {filtered.map(part => {
            const location = part.warehouseId ? warehouseById.get(part.warehouseId) : undefined;
            const hasMismatch = Number(part.stockQuantity || 0) < Number(part.reservedQuantity || 0);
            return <article key={part.id} className="grid gap-3 p-4 lg:grid-cols-[120px_minmax(220px,1fr)_180px_90px_90px_110px_150px] lg:items-center">
              <span className="font-mono text-xs font-black text-orange-700">{part.sku}</span>
              <div><p className="font-black text-zinc-900">{part.name}</p><p className="mt-1 text-xs text-zinc-500">{part.category}{part.compatibleModels?.length ? ` · ${part.compatibleModels.join(', ')}` : ''}</p></div>
              <span className="text-sm font-bold text-zinc-600">{location?.name || (part.warehouseId ? `Kho ${part.warehouseId}` : 'Chưa định danh kho')}</span>
              <span className="text-sm font-black"><span className="lg:hidden text-zinc-500">Tồn: </span>{part.stockQuantity}</span>
              <span className="text-sm font-black"><span className="lg:hidden text-zinc-500">Đã giữ: </span>{part.reservedQuantity}</span>
              <span className={`text-sm font-black ${hasMismatch ? 'text-red-700' : 'text-emerald-700'}`}><span className="lg:hidden text-zinc-500">Khả dụng: </span>{part.availableQuantity}</span>
              <span className="text-sm font-black">{typeof part.currentCost === 'number' ? money.format(part.currentCost) : 'Không có quyền xem'}</span>
              {!!part.lots?.length && <div className="col-span-full flex flex-wrap gap-2">{part.lots.map(lot => <span key={lot.id} className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-600">Lô {lot.lotCode}: tồn {lot.stockQuantity}, giữ {lot.reservedQuantity}{typeof lot.unitCost === 'number' ? ` · ${money.format(lot.unitCost)}` : ''}</span>)}</div>}
              {hasMismatch && <p className="col-span-full flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700"><AlertTriangle className="h-4 w-4" /> Tồn giữ trước lớn hơn tồn vật lý, cần đối soát ledger.</p>}
            </article>;
          })}
          {!loading && filtered.length === 0 && <p className="p-10 text-center text-sm text-zinc-500">Không có linh kiện trong phạm vi kho/chi nhánh được cấp quyền.</p>}
          {loading && <p className="flex items-center justify-center gap-2 p-10 text-sm font-bold text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải dữ liệu canonical...</p>}
        </div>
      </section>
    </div>
  );
};
