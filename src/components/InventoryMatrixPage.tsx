import React, { useMemo, useState } from 'react';
import { Building2, CircleHelp, Filter, Grid3X3, Search, SlidersHorizontal, X } from 'lucide-react';
import { DeviceItem, StoreBranch, WarehouseInfo } from '../types';
import { recordBelongsToBranch, resolveRecordBranchId } from '../utils/branchScope';
import { InventoryVisualLedger } from './InventoryVisualLedger';

interface InventoryMatrixPageProps {
  devices: DeviceItem[];
  branches?: StoreBranch[];
  warehouses?: WarehouseInfo[];
  selectedBranchId?: string;
  onSelectBranchId?: (branchId: string) => void;
}

type MatrixStatus = 'ALL' | 'in_stock' | 'reserved' | 'TECHNICAL' | 'in_transit';

const TECHNICAL_STATUSES = new Set(['warranty', 'repairing', 'in_repair', 'awaiting_technical']);
const STATUS_OPTIONS: Array<{ value: MatrixStatus; label: string }> = [
  { value: 'ALL', label: 'Tất cả trạng thái' },
  { value: 'in_stock', label: 'Sẵn bán' },
  { value: 'reserved', label: 'Đang giữ' },
  { value: 'TECHNICAL', label: 'Đang kỹ thuật' },
  { value: 'in_transit', label: 'Đang chuyển' }
];

function matchesStatus(device: DeviceItem, status: MatrixStatus): boolean {
  if (status === 'ALL') return true;
  if (status === 'TECHNICAL') return TECHNICAL_STATUSES.has(device.status);
  if (status === 'in_transit') return device.status === 'in_transit' || String(device.transferState || '').toUpperCase() === 'IN_TRANSIT';
  return device.status === status;
}

export const InventoryMatrixPage: React.FC<InventoryMatrixPageProps> = ({
  devices,
  branches = [],
  warehouses = [],
  selectedBranchId = 'ALL',
  onSelectBranchId
}) => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MatrixStatus>('ALL');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const currentInventory = useMemo(() => devices.filter(device => device.status !== 'sold'), [devices]);

  const branchCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: currentInventory.length };
    currentInventory.forEach(device => {
      const branchId = resolveRecordBranchId(device, branches, warehouses) || 'UNASSIGNED';
      counts[branchId] = (counts[branchId] || 0) + 1;
    });
    return counts;
  }, [currentInventory, branches, warehouses]);

  const visibleDevices = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi-VN');
    return currentInventory.filter(device => {
      if (!recordBelongsToBranch(device, selectedBranchId, branches, warehouses)) return false;
      if (!matchesStatus(device, status)) return false;
      if (!query) return true;
      return [device.model, device.storage, device.color, device.imei, device.condition, device.serialNo]
        .some(value => String(value || '').toLocaleLowerCase('vi-VN').includes(query));
    });
  }, [currentInventory, selectedBranchId, branches, warehouses, status, search]);

  const scopeLabel = selectedBranchId === 'ALL'
    ? 'Toàn hệ thống'
    : branches.find(branch => branch.id === selectedBranchId)?.name || 'Chi nhánh đang chọn';
  const statusLabel = STATUS_OPTIONS.find(option => option.value === status)?.label || 'Tất cả trạng thái';
  const activeFilterCount = Number(selectedBranchId !== 'ALL') + Number(status !== 'ALL');

  const resetFilters = () => {
    onSelectBranchId?.('ALL');
    setStatus('ALL');
  };

  return (
    <div className="space-y-2 sm:space-y-3">
      <section className="rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-2xs sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="hidden items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-orange-600 sm:flex"><Grid3X3 className="h-4 w-4" /> Ma trận hai trục</p>
            <div className="flex min-w-0 items-baseline gap-2 sm:mt-1">
              <h1 className="truncate text-base font-black text-zinc-950 sm:text-xl">Ma trận tồn IMEI</h1>
              <span className="shrink-0 font-mono text-[10px] font-black text-orange-600 sm:hidden">{visibleDevices.length} máy</span>
            </div>
            <div className="mt-2 hidden flex-wrap gap-2 text-[10px] font-bold sm:flex">
              <span className="rounded-lg bg-zinc-100 px-2 py-1 text-zinc-700">Trục tung: Máy → Dung lượng → Màu</span>
              <span className="rounded-lg bg-orange-50 px-2 py-1 text-orange-700">Trục hoành: Ngoại hình máy</span>
              <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">Giao điểm: Danh sách IMEI</span>
            </div>
          </div>
          <button type="button" onClick={() => setGuideOpen(value => !value)} className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border sm:hidden ${guideOpen ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-zinc-200 text-zinc-500'}`} aria-label="Xem hướng dẫn ma trận">
            <CircleHelp className="h-4 w-4" />
          </button>
          <div className="hidden items-center gap-3 text-[9px] font-bold text-zinc-500 sm:flex">
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Sẵn bán</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-500" /> Đang giữ</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-violet-500" /> Kỹ thuật</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-blue-500" /> Đang chuyển</span>
          </div>
        </div>

        {guideOpen && (
          <div className="mt-2 rounded-xl border border-orange-100 bg-orange-50/60 p-2.5 text-[10px] font-bold text-zinc-600 sm:hidden">
            <p><strong className="text-zinc-900">Dọc:</strong> Máy → Dung lượng → Màu · <strong className="text-zinc-900">Ngang:</strong> Ngoại hình · <strong className="text-zinc-900">Ô:</strong> IMEI</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px]">
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Sẵn bán</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-500" /> Đang giữ</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-violet-500" /> Kỹ thuật</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-blue-500" /> Đang chuyển</span>
            </div>
          </div>
        )}

        <div className="mt-3 hidden gap-1.5 overflow-x-auto pb-1 scrollbar-none sm:flex">
          <button type="button" onClick={() => onSelectBranchId?.('ALL')} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-black ${selectedBranchId === 'ALL' ? 'border-orange-500 bg-orange-500 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}>
            <Building2 className="h-3.5 w-3.5" /> Tất cả <span className="font-mono opacity-80">{branchCounts.ALL || 0}</span>
          </button>
          {branches.filter(branch => branch.isActive !== false).map(branch => (
            <button key={branch.id} type="button" onClick={() => onSelectBranchId?.(branch.id)} className={`h-8 shrink-0 rounded-xl border px-3 text-[10px] font-black ${selectedBranchId === branch.id ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}>
              {branch.name.replace(/^Phone\s*House\s*/i, '').replace(/^PhoneHouse\s*/i, '') || branch.name} <span className="ml-1 font-mono opacity-70">{branchCounts[branch.id] || 0}</span>
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm máy hoặc IMEI…" className="h-9 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-8 text-xs font-semibold text-zinc-900 outline-none focus:border-orange-400 sm:h-10 sm:pr-9" />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400"><X className="h-4 w-4" /></button>}
          </label>
          <button type="button" onClick={() => setMobileFiltersOpen(value => !value)} className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[10px] font-black sm:hidden ${mobileFiltersOpen || activeFilterCount ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-zinc-200 bg-white text-zinc-600'}`} aria-expanded={mobileFiltersOpen}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Lọc
            {activeFilterCount > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-orange-500 px-1 font-mono text-[8px] text-white">{activeFilterCount}</span>}
          </button>
          <label className="relative hidden shrink-0 sm:block">
            <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <select value={status} onChange={event => setStatus(event.target.value as MatrixStatus)} className="h-10 max-w-[145px] appearance-none rounded-xl border border-zinc-200 bg-white pl-8 pr-3 text-[10px] font-black text-zinc-700 outline-none focus:border-orange-400 sm:max-w-none">
              {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        {mobileFiltersOpen && (
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2 sm:hidden">
            <label className="col-span-2 text-[9px] font-black uppercase tracking-wide text-zinc-500">
              Chi nhánh
              <select value={selectedBranchId} onChange={event => onSelectBranchId?.(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-bold text-zinc-800 outline-none focus:border-orange-400">
                <option value="ALL">Toàn hệ thống · {branchCounts.ALL || 0}</option>
                {branches.filter(branch => branch.isActive !== false).map(branch => <option key={branch.id} value={branch.id}>{branch.name} · {branchCounts[branch.id] || 0}</option>)}
              </select>
            </label>
            <label className="col-span-2 text-[9px] font-black uppercase tracking-wide text-zinc-500">
              Trạng thái
              <select value={status} onChange={event => setStatus(event.target.value as MatrixStatus)} className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-bold text-zinc-800 outline-none focus:border-orange-400">
                {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <p className="col-span-1 self-center truncate text-[9px] font-bold text-zinc-500">{scopeLabel} · {statusLabel}</p>
            <button type="button" onClick={resetFilters} disabled={activeFilterCount === 0} className="col-span-1 h-8 rounded-lg border border-zinc-200 bg-white text-[10px] font-black text-zinc-600 disabled:opacity-40">Xóa bộ lọc</button>
          </div>
        )}

        {!mobileFiltersOpen && activeFilterCount > 0 && (
          <div className="mt-1.5 flex items-center justify-between gap-2 sm:hidden">
            <p className="min-w-0 truncate text-[9px] font-bold text-zinc-500">{scopeLabel} · {statusLabel}</p>
            <button type="button" onClick={resetFilters} className="shrink-0 text-[9px] font-black text-orange-600">Xóa lọc</button>
          </div>
        )}
      </section>

      <InventoryVisualLedger devices={visibleDevices} scopeLabel={`${scopeLabel} · ${visibleDevices.length} máy theo bộ lọc`} />
    </div>
  );
};
