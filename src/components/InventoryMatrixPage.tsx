import React, { useMemo, useState } from 'react';
import { Building2, Filter, Grid3X3, Search, X } from 'lucide-react';
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

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-2xs sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-orange-600"><Grid3X3 className="h-4 w-4" /> Ma trận hai trục</p>
            <h1 className="mt-1 text-lg font-black text-zinc-950 sm:text-xl">Ma trận tồn IMEI</h1>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold">
              <span className="rounded-lg bg-zinc-100 px-2 py-1 text-zinc-700">Trục tung: Máy → Dung lượng → Màu</span>
              <span className="rounded-lg bg-orange-50 px-2 py-1 text-orange-700">Trục hoành: Ngoại hình máy</span>
              <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">Giao điểm: Danh sách IMEI</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[9px] font-bold text-zinc-500">
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Sẵn bán</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-500" /> Đang giữ</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-violet-500" /> Kỹ thuật</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-blue-500" /> Đang chuyển</span>
          </div>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
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
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm model, dung lượng, màu hoặc IMEI…" className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-9 text-xs font-semibold text-zinc-900 outline-none focus:border-orange-400" />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400"><X className="h-4 w-4" /></button>}
          </label>
          <label className="relative shrink-0">
            <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <select value={status} onChange={event => setStatus(event.target.value as MatrixStatus)} className="h-10 max-w-[145px] appearance-none rounded-xl border border-zinc-200 bg-white pl-8 pr-3 text-[10px] font-black text-zinc-700 outline-none focus:border-orange-400 sm:max-w-none">
              <option value="ALL">Tất cả trạng thái</option>
              <option value="in_stock">Sẵn bán</option>
              <option value="reserved">Đang giữ</option>
              <option value="TECHNICAL">Đang kỹ thuật</option>
              <option value="in_transit">Đang chuyển</option>
            </select>
          </label>
        </div>
      </section>

      <InventoryVisualLedger devices={visibleDevices} scopeLabel={`${scopeLabel} · ${visibleDevices.length} máy theo bộ lọc`} />
    </div>
  );
};
