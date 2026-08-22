import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Loader2, Plus, RefreshCw, Search, Warehouse, X } from 'lucide-react';
import { UserAccount, WarehouseInfo } from '../types';
import {
  fetchTechnicalPartStockRequests,
  fetchTechnicalSpareParts,
  requestDecideTechnicalPartStockRequest,
  requestReceiveTechnicalSparePart,
  requestTechnicalPartStockRequest,
  TechnicalPartStockRequest
} from '../services/technicalApiClient';

interface TechnicalSparePartsViewProps {
  warehouses: WarehouseInfo[];
  currentUser?: UserAccount | null;
  /** Rendered inside the unified parts hub, which already owns the page header. */
  embedded?: boolean;
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

const SUPPLY_APPROVER_ROLES = new Set(['ADMIN', 'MANAGER', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'WAREHOUSE']);

const formatRequestDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const isActiveWarehouse = (warehouse: WarehouseInfo) => warehouse.isActive !== false && !warehouse.isArchived;

export const TechnicalSparePartsView: React.FC<TechnicalSparePartsViewProps> = ({ warehouses, currentUser, embedded = false }) => {
  const [parts, setParts] = useState<TechnicalSparePartRow[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [supplyRequests, setSupplyRequests] = useState<TechnicalPartStockRequest[]>([]);
  const [supplyParts, setSupplyParts] = useState<TechnicalSparePartRow[]>([]);
  const [supplyOpen, setSupplyOpen] = useState(false);
  const [supplyLoading, setSupplyLoading] = useState(false);
  const [supplyError, setSupplyError] = useState('');
  const [supplyNotice, setSupplyNotice] = useState('');
  const [decisionBusyId, setDecisionBusyId] = useState('');
  const [decisionQuantities, setDecisionQuantities] = useState<Record<string, string>>({});
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [supplyForm, setSupplyForm] = useState({
    targetWarehouseId: '',
    sourceWarehouseId: '',
    partId: '',
    lotId: '',
    quantity: 1,
    reason: ''
  });
  const [receipt, setReceipt] = useState({
    sku: '', name: '', category: 'KHAC', warehouseId: '', lotCode: '', quantity: 1, unitCost: 0,
    sourceType: 'PART_PURCHASE' as 'PART_PURCHASE' | 'OPENING_BALANCE' | 'MANUAL_ADJUSTMENT',
    sourceId: '', sourceCode: '', note: '', compatibleModels: ''
  });
  const canReceive = ['ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'WAREHOUSE', 'TECH_LEAD'].includes(String(currentUser?.role || '').toUpperCase());
  const currentRole = String(currentUser?.role || '').toUpperCase();
  const canApproveSupply = SUPPLY_APPROVER_ROLES.has(currentRole);
  const warehouseById = useMemo(() => new Map(warehouses.map(item => [item.id, item])), [warehouses]);
  const technicianWarehouses = useMemo(() => warehouses.filter(item => isActiveWarehouse(item) && item.type === 'TECHNICIAN_SUB'), [warehouses]);
  const requestableTechnicianWarehouses = useMemo(() => {
    if (canApproveSupply) return technicianWarehouses;
    return technicianWarehouses.filter(item => String(item.custodianUid || '') === String(currentUser?.id || ''));
  }, [canApproveSupply, currentUser?.id, technicianWarehouses]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setParts(await fetchTechnicalSpareParts(warehouseId || undefined));
    } catch (cause: any) {
      setError(cause?.message || 'Không thể tải dữ liệu linh kiện theo kho.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [warehouseId]);

  const loadSupplyRequests = async () => {
    setSupplyLoading(true);
    setSupplyError('');
    try {
      setSupplyRequests(await fetchTechnicalPartStockRequests());
    } catch (cause: any) {
      setSupplyError(cause?.message || 'Không thể tải yêu cầu cấp phát linh kiện.');
    } finally {
      setSupplyLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser?.id) return;
    void loadSupplyRequests();
  }, [currentUser?.id]);

  useEffect(() => {
    setSupplyForm(current => {
      const target = requestableTechnicianWarehouses.find(item => item.id === current.targetWarehouseId)
        || requestableTechnicianWarehouses[0];
      const sourceWarehouseId = target?.parentWarehouseId ? String(target.parentWarehouseId) : '';
      if (!target) {
        return current.targetWarehouseId || current.sourceWarehouseId || current.partId || current.lotId
          ? { ...current, targetWarehouseId: '', sourceWarehouseId: '', partId: '', lotId: '' }
          : current;
      }
      if (target.id === current.targetWarehouseId && sourceWarehouseId === current.sourceWarehouseId) return current;
      return {
        ...current,
        targetWarehouseId: String(target.id),
        sourceWarehouseId,
        partId: '',
        lotId: ''
      };
    });
  }, [requestableTechnicianWarehouses]);

  useEffect(() => {
    const sourceWarehouseId = supplyForm.sourceWarehouseId;
    if (!sourceWarehouseId) {
      setSupplyParts([]);
      return;
    }
    let disposed = false;
    void (async () => {
      try {
        const result = await fetchTechnicalSpareParts(sourceWarehouseId);
        if (!disposed) setSupplyParts(result);
      } catch (cause: any) {
        if (!disposed) setSupplyError(cause?.message || 'Không thể tải tồn Kho Tổng để lập yêu cầu.');
      }
    })();
    return () => { disposed = true; };
  }, [supplyForm.sourceWarehouseId]);

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
  const selectedSupplyPart = useMemo(
    () => supplyParts.find(item => item.id === supplyForm.partId),
    [supplyForm.partId, supplyParts]
  );
  const selectedSupplyLot = useMemo(
    () => selectedSupplyPart?.lots?.find(item => item.id === supplyForm.lotId),
    [selectedSupplyPart, supplyForm.lotId]
  );
  const selectedTargetWarehouse = warehouseById.get(supplyForm.targetWarehouseId);
  const selectedSourceWarehouse = warehouseById.get(supplyForm.sourceWarehouseId);
  const pendingSupplyRequests = useMemo(
    () => supplyRequests.filter(item => String(item.status || '') === 'PENDING'),
    [supplyRequests]
  );
  const visibleSupplyRequests = useMemo(
    () => canApproveSupply ? pendingSupplyRequests : supplyRequests.slice(0, 8),
    [canApproveSupply, pendingSupplyRequests, supplyRequests]
  );

  const refreshAll = async () => {
    await Promise.all([load(), loadSupplyRequests()]);
  };

  const submitSupplyRequest = async () => {
    if (!selectedTargetWarehouse || !selectedSourceWarehouse || !selectedSupplyPart) {
      setSupplyError('Chọn kho KTV và linh kiện từ Kho Tổng trước khi gửi yêu cầu.');
      return;
    }
    if (selectedSourceWarehouse.type !== 'CENTRAL' || selectedTargetWarehouse.type !== 'TECHNICIAN_SUB') {
      setSupplyError('Cấp phát chỉ đi từ Kho Tổng sang kho con KTV đúng quan hệ cha – con.');
      return;
    }
    if (!Number.isInteger(Number(supplyForm.quantity)) || Number(supplyForm.quantity) < 1) {
      setSupplyError('Số lượng yêu cầu phải là số nguyên lớn hơn 0.');
      return;
    }
    if (supplyForm.reason.trim().length < 5) {
      setSupplyError('Vui lòng nêu lý do cấp phát tối thiểu 5 ký tự.');
      return;
    }
    setSupplyLoading(true);
    setSupplyError('');
    setSupplyNotice('');
    try {
      await requestTechnicalPartStockRequest({
        sourceWarehouseId: String(selectedSourceWarehouse.id),
        targetWarehouseId: String(selectedTargetWarehouse.id),
        partId: selectedSupplyPart.id,
        lotId: supplyForm.lotId || undefined,
        quantity: Number(supplyForm.quantity),
        reason: supplyForm.reason.trim()
      });
      setSupplyNotice('Đã gửi yêu cầu cấp phát. Kho Tổng chỉ chuyển tồn sau khi duyệt.');
      setSupplyForm(current => ({ ...current, partId: '', lotId: '', quantity: 1, reason: '' }));
      setSupplyOpen(false);
      await Promise.all([loadSupplyRequests(), load()]);
    } catch (cause: any) {
      setSupplyError(cause?.message || 'Không thể gửi yêu cầu cấp phát linh kiện.');
    } finally {
      setSupplyLoading(false);
    }
  };

  const decideSupplyRequest = async (request: TechnicalPartStockRequest, decision: 'APPROVED' | 'REJECTED') => {
    if (decision === 'APPROVED') {
      const quantity = Number(decisionQuantities[request.id] || request.quantityRequested);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > Number(request.quantityRequested || 0)) {
        setSupplyError('Số lượng duyệt phải từ 1 đến số lượng đã yêu cầu.');
        return;
      }
    }
    setDecisionBusyId(request.id);
    setSupplyError('');
    setSupplyNotice('');
    try {
      const quantity = Number(decisionQuantities[request.id] || request.quantityRequested);
      await requestDecideTechnicalPartStockRequest(request.id, {
        decision,
        quantityApproved: decision === 'APPROVED' ? quantity : undefined,
        note: decisionNotes[request.id]?.trim() || undefined
      });
      setSupplyNotice(decision === 'APPROVED'
        ? 'Đã duyệt và chuyển tồn từ Kho Tổng sang kho KTV trong cùng transaction.'
        : 'Đã từ chối yêu cầu cấp phát.');
      await Promise.all([loadSupplyRequests(), load()]);
    } catch (cause: any) {
      setSupplyError(cause?.message || 'Không thể cập nhật quyết định cấp phát.');
    } finally {
      setDecisionBusyId('');
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-24 sm:space-y-6 sm:pb-8">
      <header className={`flex flex-col justify-between gap-3 ${embedded ? 'rounded-2xl border border-zinc-100 bg-white p-4 shadow-2xs' : ''} sm:flex-row sm:items-center`}>
        <div>
          {embedded ? (
            <h3 className="flex items-center gap-2 text-base font-black text-zinc-900 sm:text-lg"><Boxes className="h-5 w-5 text-orange-600" /> Tồn linh kiện theo kho</h3>
          ) : (
            <h2 className="flex items-center gap-2 text-xl font-black text-zinc-900 sm:text-2xl"><Boxes className="h-7 w-7 text-orange-600" /> Linh kiện theo kho</h2>
          )}
          <p className="mt-1 text-xs leading-5 text-zinc-500 sm:text-sm">Kho Tổng điều phối cho kho con KTV. Tồn chỉ thay đổi qua phiếu nhập, cấp phát, xuất dùng, trả hoặc đảo ledger.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {requestableTechnicianWarehouses.length > 0 && <button onClick={() => { setSupplyError(''); setSupplyNotice(''); setSupplyOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-black text-orange-700"><Plus className="h-4 w-4" /> Yêu cầu Kho Tổng</button>}
          {canReceive && <button onClick={() => setReceiptOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white"><Plus className="h-4 w-4" /> Nhập linh kiện</button>}
          <button onClick={() => void refreshAll()} disabled={loading || supplyLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-black text-zinc-700 disabled:opacity-50">
            {loading || supplyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Làm mới
          </button>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}
      {supplyError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{supplyError}</div>}
      {supplyNotice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{supplyNotice}</div>}

      {receiptOpen && <section className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 sm:p-5">
        <div className="flex items-center justify-between"><div><h3 className="font-black text-zinc-900">Phiếu nhận linh kiện theo lô</h3><p className="text-xs text-zinc-500">Tăng tồn vật lý, snapshot giá vốn lô và cập nhật bình quân kho trong một transaction.</p></div><button onClick={() => setReceiptOpen(false)} className="rounded-lg p-2 text-zinc-500"><X className="h-5 w-5" /></button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input value={receipt.sku} onChange={event => setReceipt(current => ({ ...current, sku: event.target.value }))} placeholder="SKU *" className="h-11 rounded-xl border px-3 text-sm" />
          <input value={receipt.name} onChange={event => setReceipt(current => ({ ...current, name: event.target.value }))} placeholder="Tên linh kiện *" className="h-11 rounded-xl border px-3 text-sm" />
          <input value={receipt.category} onChange={event => setReceipt(current => ({ ...current, category: event.target.value }))} placeholder="Phân loại" className="h-11 rounded-xl border px-3 text-sm" />
          <select value={receipt.warehouseId} onChange={event => setReceipt(current => ({ ...current, warehouseId: event.target.value }))} className="h-11 rounded-xl border bg-white px-3 text-sm font-bold"><option value="">Kho Tổng nhận *</option>{warehouses.filter(item => item.isActive !== false && !item.isArchived && item.type === 'CENTRAL').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
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

      {supplyOpen && <section className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-zinc-900">Yêu cầu cấp phát từ Kho Tổng</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">KTV chỉ yêu cầu cho kho con được gán tài khoản của mình. Phiếu này không tự trừ Kho Tổng; Kế toán, Admin hoặc Kho phải duyệt trước khi tồn được điều chuyển.</p>
          </div>
          <button type="button" onClick={() => setSupplyOpen(false)} className="rounded-lg p-2 text-zinc-500"><X className="h-5 w-5" /></button>
        </div>

        {requestableTechnicianWarehouses.length === 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">Tài khoản chưa được gán vào kho con KTV hợp lệ. Hãy thiết lập kho con có Kho Tổng cha và gán tài khoản KTV trước.</div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1.5"><span className="text-xs font-black text-zinc-600">Kho KTV nhận *</span><select value={supplyForm.targetWarehouseId} onChange={event => {
              const targetWarehouseId = event.target.value;
              const target = requestableTechnicianWarehouses.find(item => String(item.id) === targetWarehouseId);
              setSupplyForm(current => ({
                ...current,
                targetWarehouseId,
                sourceWarehouseId: target?.parentWarehouseId ? String(target.parentWarehouseId) : '',
                partId: '',
                lotId: ''
              }));
            }} className="h-11 w-full rounded-xl border bg-white px-3 text-sm font-bold"><option value="">Chọn kho KTV</option>{requestableTechnicianWarehouses.map(item => <option key={String(item.id)} value={String(item.id)}>{item.name}{item.custodianName ? ` · ${item.custodianName}` : ''}</option>)}</select></label>
            <div className="space-y-1.5"><p className="text-xs font-black text-zinc-600">Kho nguồn bắt buộc</p><div className={`flex h-11 items-center rounded-xl border px-3 text-sm font-bold ${selectedSourceWarehouse?.type === 'CENTRAL' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{selectedSourceWarehouse?.name || 'Kho cha chưa hợp lệ'}</div></div>
            <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-black text-zinc-600">Linh kiện từ Kho Tổng *</span><select value={supplyForm.partId} onChange={event => setSupplyForm(current => ({ ...current, partId: event.target.value, lotId: '' }))} className="h-11 w-full rounded-xl border bg-white px-3 text-sm font-bold"><option value="">Chọn linh kiện cần cấp phát</option>{supplyParts.map(part => <option key={part.id} value={part.id}>{part.sku} · {part.name} — khả dụng {part.availableQuantity}</option>)}</select></label>
            <label className="space-y-1.5"><span className="text-xs font-black text-zinc-600">Lô nguồn (tùy chọn)</span><select disabled={!selectedSupplyPart} value={supplyForm.lotId} onChange={event => setSupplyForm(current => ({ ...current, lotId: event.target.value }))} className="h-11 w-full rounded-xl border bg-white px-3 text-sm font-bold disabled:bg-zinc-100"><option value="">Theo giá bình quân kho</option>{selectedSupplyPart?.lots?.map(lot => <option key={lot.id} value={lot.id}>{lot.lotCode} — khả dụng {lot.availableQuantity}</option>)}</select></label>
            <label className="space-y-1.5"><span className="text-xs font-black text-zinc-600">Số lượng yêu cầu *</span><input type="number" min={1} step={1} value={supplyForm.quantity} onChange={event => setSupplyForm(current => ({ ...current, quantity: Number(event.target.value) }))} className="h-11 w-full rounded-xl border px-3 text-sm font-bold" /></label>
            <label className="space-y-1.5 sm:col-span-2"><span className="text-xs font-black text-zinc-600">Lý do / máy cần xử lý *</span><input value={supplyForm.reason} onChange={event => setSupplyForm(current => ({ ...current, reason: event.target.value }))} placeholder="Ví dụ: dự trữ thay pin iPhone 15 Pro, tồn kho KTV đã hết" className="h-11 w-full rounded-xl border px-3 text-sm" /></label>
            <div className="flex flex-col justify-end gap-1"><p className="text-xs text-zinc-500">Khả dụng tại nguồn: <span className="font-black text-zinc-800">{selectedSupplyLot?.availableQuantity ?? selectedSupplyPart?.availableQuantity ?? '—'}</span></p><button type="button" disabled={supplyLoading || !selectedSupplyPart || !selectedSourceWarehouse || !selectedTargetWarehouse} onClick={() => void submitSupplyRequest()} className="h-11 rounded-xl bg-orange-600 px-4 text-sm font-black text-white disabled:opacity-40">Gửi yêu cầu</button></div>
          </div>
        )}
      </section>}

      {(canApproveSupply || requestableTechnicianWarehouses.length > 0) && <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="flex flex-col gap-2 border-b bg-zinc-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-black text-zinc-900">{canApproveSupply ? 'Phiếu cấp phát chờ duyệt' : 'Yêu cầu cấp phát của kho KTV'}</h3><p className="mt-0.5 text-xs text-zinc-500">{canApproveSupply ? `${pendingSupplyRequests.length} phiếu đang chờ quyết định; duyệt sẽ chuyển tồn giữa hai kho.` : 'Theo dõi các yêu cầu đã gửi và kết quả điều phối từ Kho Tổng.'}</p></div>
          <button type="button" onClick={() => void loadSupplyRequests()} disabled={supplyLoading} className="inline-flex items-center justify-center gap-2 self-start rounded-xl border bg-white px-3 py-2 text-xs font-black text-zinc-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${supplyLoading ? 'animate-spin' : ''}`} /> Làm mới phiếu</button>
        </div>
        <div className="divide-y">
          {supplyLoading && visibleSupplyRequests.length === 0 && <p className="flex items-center justify-center gap-2 p-8 text-sm font-bold text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải phiếu cấp phát...</p>}
          {!supplyLoading && visibleSupplyRequests.length === 0 && <p className="p-8 text-center text-sm text-zinc-500">{canApproveSupply ? 'Không có phiếu cấp phát đang chờ duyệt.' : 'Chưa có yêu cầu cấp phát nào cho kho KTV của bạn.'}</p>}
          {visibleSupplyRequests.map(request => {
            const requestSource = warehouseById.get(request.sourceWarehouseId);
            const requestTarget = warehouseById.get(request.targetWarehouseId);
            const pending = String(request.status || '') === 'PENDING';
            const busy = decisionBusyId === request.id;
            return <article key={request.id} className="p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-black text-orange-700">{request.sku || request.partId}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${pending ? 'bg-amber-100 text-amber-800' : String(request.status) === 'FULFILLED' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-700'}`}>{pending ? 'CHỜ DUYỆT' : request.status}</span></div>
                  <p className="font-black text-zinc-900">{request.partName || 'Linh kiện'}</p>
                  <p className="text-sm text-zinc-600">{requestSource?.name || request.sourceWarehouseId} <span className="px-1 text-orange-600">→</span> {requestTarget?.name || request.targetWarehouseId}</p>
                  <p className="text-xs text-zinc-500">Yêu cầu <span className="font-black text-zinc-800">{request.quantityRequested}</span> · nguồn lúc gửi {request.sourceAvailableSnapshot ?? '—'} · {request.requestedByName || request.requestedByUid || 'Không rõ người yêu cầu'} · {formatRequestDate(request.requestedAt)}</p>
                  <p className="text-xs leading-5 text-zinc-500">Lý do: {request.reason}</p>
                  {!pending && <p className="text-xs font-bold text-zinc-600">{request.status === 'FULFILLED' ? `Đã cấp ${request.quantityApproved ?? request.quantityRequested}` : 'Đã từ chối'}{request.decisionNote ? ` · ${request.decisionNote}` : ''}</p>}
                </div>
                {canApproveSupply && pending && <div className="grid w-full gap-2 sm:grid-cols-[120px_minmax(180px,1fr)_auto_auto] lg:w-[600px]">
                  <input type="number" min={1} max={request.quantityRequested} value={decisionQuantities[request.id] ?? String(request.quantityRequested)} onChange={event => setDecisionQuantities(current => ({ ...current, [request.id]: event.target.value }))} aria-label={`Số lượng duyệt ${request.partName || request.partId}`} className="h-10 rounded-xl border px-3 text-sm font-black" />
                  <input value={decisionNotes[request.id] || ''} onChange={event => setDecisionNotes(current => ({ ...current, [request.id]: event.target.value }))} placeholder="Ghi chú quyết định" className="h-10 rounded-xl border px-3 text-sm" />
                  <button type="button" disabled={busy} onClick={() => void decideSupplyRequest(request, 'REJECTED')} className="h-10 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700 disabled:opacity-50">Từ chối</button>
                  <button type="button" disabled={busy} onClick={() => void decideSupplyRequest(request, 'APPROVED')} className="h-10 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-50">{busy ? 'Đang xử lý...' : 'Duyệt & cấp phát'}</button>
                </div>}
              </div>
            </article>;
          })}
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
