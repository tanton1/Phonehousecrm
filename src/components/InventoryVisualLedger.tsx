import React, { useMemo, useState } from 'react';
import { BookOpen, Eye, EyeOff, History, Smartphone } from 'lucide-react';
import { DeviceItem, MasterCatalogItem } from '../types';
import { catalogApi } from '../services/catalogApiClient';
import {
  classifyInventoryCondition,
  INVENTORY_CONDITION_OPTIONS,
  InventoryConditionBucket,
  inventoryConditionTone
} from '../utils/inventoryCondition';
import { ImeiLink } from './GlobalImeiHistory';

type ConditionBucket = Exclude<InventoryConditionBucket, 'ALL'>;

interface InventoryVisualLedgerProps {
  devices: DeviceItem[];
  catalogItems?: MasterCatalogItem[];
  scopeLabel: string;
}

interface LedgerRow {
  id: string;
  model: string;
  storage: string;
  color: string;
  cells: Record<string, DeviceItem[]>;
  total: number;
  modelRowSpan: number;
  storageRowSpan: number;
  showModel: boolean;
  showStorage: boolean;
}

const CONDITION_COLUMNS = INVENTORY_CONDITION_OPTIONS.filter(
  (option): option is typeof option & { id: ConditionBucket } => option.id !== 'ALL'
);

const naturalCompare = (left: string, right: string) => left.localeCompare(right, 'vi', { numeric: true, sensitivity: 'base' });

function statusDot(device: DeviceItem): string {
  if (device.status === 'in_stock') return 'bg-emerald-500';
  if (device.status === 'reserved') return 'bg-amber-500';
  if (device.status === 'in_transit' || String(device.transferState || '').toUpperCase() === 'IN_TRANSIT') return 'bg-blue-500';
  if (['warranty', 'repairing', 'in_repair', 'awaiting_technical'].includes(device.status)) return 'bg-violet-500';
  return 'bg-zinc-400';
}

function shortImei(imei: string, full: boolean): string {
  if (full || imei.length <= 5) return imei;
  return `…${imei.slice(-5)}`;
}

export function buildInventoryVisualLedger(devices: DeviceItem[], catalogItems: MasterCatalogItem[] = []) {
  const tree = new Map<string, Map<string, Map<string, DeviceItem[]>>>();
  catalogItems
    .filter(item => item.category === 'DEVICE' && item.lifecycleStatus !== 'ARCHIVED' && item.status !== 'inactive')
    .forEach(item => {
      const model = String(item.model || item.name || '').trim();
      const storage = String(item.storage || item.attributes?.STORAGE || item.attributes?.storage || '').trim();
      const color = String(item.color || item.attributes?.COLOR || item.attributes?.color || '').trim();
      if (!model || !storage || !color) return;
      if (!tree.has(model)) tree.set(model, new Map());
      const storageMap = tree.get(model)!;
      if (!storageMap.has(storage)) storageMap.set(storage, new Map());
      const colorMap = storageMap.get(storage)!;
      if (!colorMap.has(color)) colorMap.set(color, []);
    });
  devices.forEach(device => {
    const model = String(device.model || 'Chưa xác định model').trim();
    const storage = String(device.storage || '—').trim();
    const color = String(device.color || '—').trim();
    if (!tree.has(model)) tree.set(model, new Map());
    const storageMap = tree.get(model)!;
    if (!storageMap.has(storage)) storageMap.set(storage, new Map());
    const colorMap = storageMap.get(storage)!;
    colorMap.set(color, [...(colorMap.get(color) || []), device]);
  });

  const rows: LedgerRow[] = [];
  const conditionCounts = Object.fromEntries(CONDITION_COLUMNS.map(column => [column.id, 0])) as Record<ConditionBucket, number>;
  [...tree.entries()].sort(([a], [b]) => naturalCompare(a, b)).forEach(([model, storageMap]) => {
    const sortedStorages = [...storageMap.entries()].sort(([a], [b]) => naturalCompare(a, b));
    const modelRowSpan = sortedStorages.reduce((total, [, colorMap]) => total + colorMap.size, 0);
    let firstModelRow = true;
    sortedStorages.forEach(([storage, colorMap]) => {
      const sortedColors = [...colorMap.entries()].sort(([a], [b]) => naturalCompare(a, b));
      let firstStorageRow = true;
      sortedColors.forEach(([color, rowDevices]) => {
        const cells: Record<string, DeviceItem[]> = {};
        rowDevices
          .slice()
          .sort((a, b) => a.imei.localeCompare(b.imei))
          .forEach(device => {
            const bucket = classifyInventoryCondition(device.condition);
            cells[bucket] = [...(cells[bucket] || []), device];
            conditionCounts[bucket] += 1;
          });
        rows.push({
          id: JSON.stringify([model, storage, color]),
          model,
          storage,
          color,
          cells,
          total: rowDevices.length,
          modelRowSpan,
          storageRowSpan: sortedColors.length,
          showModel: firstModelRow,
          showStorage: firstStorageRow
        });
        firstModelRow = false;
        firstStorageRow = false;
      });
    });
  });

  return {
    rows,
    modelCount: tree.size,
    variantCount: rows.length,
    conditionCounts
  };
}

export const InventoryVisualLedger: React.FC<InventoryVisualLedgerProps> = ({ devices, catalogItems = [], scopeLabel }) => {
  const [showFullImeis, setShowFullImeis] = useState(false);
  const [hideEmptyColumns, setHideEmptyColumns] = useState(false);
  const [showEmptyVariants, setShowEmptyVariants] = useState(false);
  const [remoteCatalogItems, setRemoteCatalogItems] = useState<MasterCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');

  const effectiveCatalogItems = catalogItems.length ? catalogItems : remoteCatalogItems;

  const { rows, modelCount, variantCount, conditionCounts } = useMemo(
    () => buildInventoryVisualLedger(devices, showEmptyVariants ? effectiveCatalogItems : []),
    [devices, effectiveCatalogItems, showEmptyVariants]
  );

  const toggleEmptyVariants = async () => {
    if (showEmptyVariants) {
      setShowEmptyVariants(false);
      return;
    }
    setCatalogError('');
    if (effectiveCatalogItems.length) {
      setShowEmptyVariants(true);
      return;
    }
    setCatalogLoading(true);
    try {
      const collected = new Map<string, MasterCatalogItem>();
      let cursor: string | undefined;
      for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
        const page = await catalogApi.listItems({ limit: 100, cursor, kind: 'DEVICE', activeOnly: true });
        page.items.forEach(item => collected.set(item.id, item));
        if (!page.hasMore || !page.nextCursor) break;
        cursor = page.nextCursor;
      }
      const loaded = [...collected.values()];
      setRemoteCatalogItems(loaded);
      setShowEmptyVariants(true);
    } catch (error: any) {
      setCatalogError(error?.message || 'Không tải được danh mục mã hàng đang hết tồn.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const visibleConditionColumns = hideEmptyColumns
    ? CONDITION_COLUMNS.filter(column => conditionCounts[column.id] > 0)
    : CONDITION_COLUMNS;

  const imeiCell = (cellDevices: DeviceItem[]) => {
    if (!cellDevices.length) return <span className="text-zinc-300">—</span>;
    return (
      <div className="space-y-1">
        {cellDevices.map(device => (
          <ImeiLink
            key={device.id}
            imei={device.imei}
            title={`${device.model} · ${device.storage} · ${device.color} · ${device.condition || 'Chưa phân loại'} · Xem lịch sử ${device.imei}`}
            className="max-w-full bg-transparent px-1 py-0.5 text-[10px] no-underline hover:bg-orange-50 sm:text-[11px]"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(device)}`} />
            <span className="truncate">{shortImei(device.imei, showFullImeis)}</span>
          </ImeiLink>
        ))}
      </div>
    );
  };

  return (
    <section className="space-y-3">
      <header className="overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-br from-zinc-950 via-zinc-900 to-orange-950 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-orange-300"><BookOpen className="h-4 w-4" /> Sổ tồn trực quan</p>
            <h2 className="mt-1 text-lg font-black sm:text-xl">Máy · Dung lượng · Màu · Ngoại hình</h2>
            <p className="mt-1 text-xs font-medium text-zinc-300">{scopeLabel} · {modelCount} dòng máy · {variantCount} biến thể · {devices.length} IMEI</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={catalogLoading} onClick={() => void toggleEmptyVariants()} className={`h-9 rounded-xl border px-3 text-[10px] font-black disabled:opacity-60 ${showEmptyVariants ? 'border-orange-400 bg-orange-500 text-white' : 'border-white/15 bg-white/10 text-white hover:bg-white/15'}`}>
              {catalogLoading ? 'Đang tải danh mục…' : showEmptyVariants ? 'Đang hiện cả mã hết hàng' : 'Hiện mã đang hết hàng'}
            </button>
            <button type="button" onClick={() => setHideEmptyColumns(value => !value)} className="h-9 rounded-xl border border-white/15 bg-white/10 px-3 text-[10px] font-black text-white hover:bg-white/15">
              {hideEmptyColumns ? 'Hiện mọi cột' : 'Ẩn cột không có máy'}
            </button>
            <button type="button" onClick={() => setShowFullImeis(value => !value)} className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[10px] font-black ${showFullImeis ? 'bg-orange-500 text-white' : 'bg-white text-zinc-950'}`}>
              {showFullImeis ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showFullImeis ? 'Rút gọn IMEI' : 'Hiện đủ IMEI'}
            </button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto border-t border-white/10 bg-white/5 px-4 py-2.5 scrollbar-none sm:px-5">
          {CONDITION_COLUMNS.map(column => (
            <div key={column.id} className="flex shrink-0 items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5">
              <span className="text-[10px] font-bold text-zinc-300">{column.shortLabel}</span>
              <strong className="font-mono text-xs text-white">{conditionCounts[column.id]}</strong>
            </div>
          ))}
        </div>
      </header>

      {catalogError && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{catalogError}</p>}

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-10 text-center">
          <Smartphone className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-3 text-sm font-black text-zinc-700">Không có IMEI phù hợp</p>
          <p className="mt-1 text-xs text-zinc-400">Hãy đổi chi nhánh hoặc bộ lọc phía trên.</p>
        </div>
      ) : (
        <>
          <div className="hidden max-h-[74dvh] overflow-auto rounded-2xl border border-zinc-300 bg-white shadow-sm lg:block">
            <table className="border-separate border-spacing-0 text-left" style={{ minWidth: 460 + visibleConditionColumns.length * 170 }}>
              <thead className="sticky top-0 z-30 bg-zinc-950 text-white">
                <tr>
                  <th className="sticky left-0 z-50 w-[160px] min-w-[160px] border-b border-r border-zinc-700 bg-zinc-950 px-3 py-3 text-xs font-black">Máy</th>
                  <th className="sticky left-[160px] z-50 w-[100px] min-w-[100px] border-b border-r border-zinc-700 bg-zinc-950 px-3 py-3 text-xs font-black">Dung lượng</th>
                  <th className="sticky left-[260px] z-50 w-[110px] min-w-[110px] border-b border-r border-zinc-700 bg-zinc-950 px-3 py-3 text-xs font-black">Màu</th>
                  {visibleConditionColumns.map(column => (
                    <th key={column.id} className="w-[170px] min-w-[170px] border-b border-r border-zinc-700 px-3 py-3 align-bottom last:border-r-0">
                      <span className={`inline-flex rounded-lg border px-2 py-1 text-[10px] font-black ${inventoryConditionTone(column.id)}`}>{column.label}</span>
                      <p className="mt-1 font-mono text-[9px] text-zinc-400">{conditionCounts[column.id]} IMEI</p>
                    </th>
                  ))}
                  <th className="sticky right-0 z-40 w-[88px] min-w-[88px] border-b border-l border-zinc-700 bg-zinc-950 px-2 py-3 text-center text-xs font-black">Tổng</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className={index % 2 ? 'bg-zinc-50/70' : 'bg-white'}>
                    {row.showModel && <th rowSpan={row.modelRowSpan} className="sticky left-0 z-20 border-b border-r border-zinc-300 bg-white px-3 py-3 align-top text-sm font-black text-zinc-950">{row.model}</th>}
                    {row.showStorage && <th rowSpan={row.storageRowSpan} className="sticky left-[160px] z-20 border-b border-r border-zinc-300 bg-white px-3 py-3 align-top font-mono text-xs font-black text-zinc-800">{row.storage}</th>}
                    <th className={`sticky left-[260px] z-20 border-b border-r border-zinc-300 px-3 py-3 text-xs font-black text-zinc-700 ${index % 2 ? 'bg-zinc-50' : 'bg-white'}`}>{row.color}</th>
                    {visibleConditionColumns.map(column => (
                      <td key={column.id} className="border-b border-r border-zinc-200 px-2 py-2 align-top last:border-r-0">{imeiCell(row.cells[column.id] || [])}</td>
                    ))}
                    <td className={`sticky right-0 z-20 border-b border-l border-zinc-300 px-2 py-3 text-center align-top ${index % 2 ? 'bg-zinc-50' : 'bg-white'}`}><strong className="text-base font-black text-[#ff4b16]">{row.total}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="max-h-[72dvh] overflow-auto rounded-2xl border border-zinc-300 bg-white shadow-sm lg:hidden">
            <table className="border-separate border-spacing-0 text-left" style={{ minWidth: 215 + visibleConditionColumns.length * 120 }}>
              <thead className="sticky top-0 z-30 bg-zinc-950 text-white">
                <tr>
                  <th className="sticky left-0 z-50 w-[155px] min-w-[155px] border-b border-r border-zinc-700 bg-zinc-950 px-2.5 py-2.5 text-[10px] font-black">Máy / Dung lượng / Màu</th>
                  {visibleConditionColumns.map(column => (
                    <th key={column.id} className="w-[120px] min-w-[120px] border-b border-r border-zinc-700 px-2 py-2.5 align-bottom">
                      <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[9px] font-black ${inventoryConditionTone(column.id)}`}>{column.shortLabel}</span>
                      <p className="mt-1 font-mono text-[8px] text-zinc-400">{conditionCounts[column.id]} IMEI</p>
                    </th>
                  ))}
                  <th className="sticky right-0 z-40 w-[60px] min-w-[60px] border-b border-l border-zinc-700 bg-zinc-950 px-1 py-2.5 text-center text-[9px] font-black">Tổng</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className={index % 2 ? 'bg-zinc-50/70' : 'bg-white'}>
                    <th className={`sticky left-0 z-20 border-b border-r border-zinc-300 px-2.5 py-2 align-top ${index % 2 ? 'bg-zinc-50' : 'bg-white'}`}>
                      <p className="text-[10px] font-black leading-tight text-zinc-950">{row.model}</p>
                      <p className="mt-1 text-[9px] font-bold text-zinc-500">{row.storage} · {row.color}</p>
                      {row.total === 0 && <span className="mt-1 inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-[8px] font-bold text-zinc-400">Hết hàng</span>}
                    </th>
                    {visibleConditionColumns.map(column => (
                      <td key={column.id} className="border-b border-r border-zinc-200 px-1.5 py-2 align-top">{imeiCell(row.cells[column.id] || [])}</td>
                    ))}
                    <td className={`sticky right-0 z-20 border-b border-l border-zinc-300 px-1 py-2 text-center align-top ${index % 2 ? 'bg-zinc-50' : 'bg-white'}`}><strong className="text-sm font-black text-[#ff4b16]">{row.total}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[10px] font-medium text-zinc-400"><History className="h-3.5 w-3.5" /> Bấm vào IMEI để xem toàn bộ lịch sử nhập, chuyển kho, kỹ thuật, giá vốn và bán hàng.</p>
    </section>
  );
};
