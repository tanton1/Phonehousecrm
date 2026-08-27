import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Box, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Warehouse } from 'lucide-react';
import { ProductItem, StoreBranch, UserAccount, WarehouseInfo } from '../types';
import {
  fetchInventoryAccessoryBalances,
  fetchInventoryAccessoryTrace,
  InventoryAccessoryBalanceRow
} from '../services/inventoryApiClient';
import { GroupedStockSkuView, StockSkuGroup, StockSkuTraceResult } from './GroupedStockSkuView';
import { InventoryMetricCarousel } from './InventoryMetricCarousel';
import { HelpHint } from './HelpHint';

interface ProductsViewProps {
  products: ProductItem[];
  warehouses?: WarehouseInfo[];
  branches?: StoreBranch[];
  currentUser?: UserAccount | null;
  /** Rendered inside the unified parts hub, which already owns the page header. */
  embedded?: boolean;
}

const formatMoney = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');

/**
 * POS accessories are shown from branch/location balances.  `products` is
 * retained only as a legacy fallback for SKUs created before balance-ledger
 * posting was introduced.
 */
export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  warehouses = [],
  branches = [],
  currentUser,
  embedded = false
}) => {
  const [balanceRows, setBalanceRows] = useState<InventoryAccessoryBalanceRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<'ALL' | 'AVAILABLE' | 'LOW' | 'EMPTY'>('ALL');
  const [warehouseId, setWarehouseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const warehouseById = useMemo(() => new Map(warehouses.map(item => [String(item.id), item])), [warehouses]);
  const branchById = useMemo(() => new Map(branches.map(item => [String(item.id), item])), [branches]);

  const loadBalances = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setBalanceRows(await fetchInventoryAccessoryBalances(currentUser || undefined, warehouseId || undefined));
    } catch (cause: any) {
      setError(cause?.message || 'Không thể tải tồn phụ kiện theo kho. Đang hiển thị dữ liệu cũ để đối soát.');
      setBalanceRows([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser, warehouseId]);

  useEffect(() => {
    void loadBalances();
  }, [loadBalances]);

  const categories = useMemo(() => [...new Set([
    ...balanceRows.map(row => String(row.catalogGroupCode || row.category || '').trim()),
    ...products.map(product => String(product.catalogGroupCode || product.category || '').trim())
  ].filter(Boolean))].sort((left, right) => left.localeCompare(right, 'vi')), [balanceRows, products]);

  const stockGroups = useMemo<StockSkuGroup[]>(() => {
    const groups = new Map<string, StockSkuGroup>();
    const productIdsWithBalance = new Set(balanceRows.map(row => row.productId));

    balanceRows.forEach(row => {
      const groupId = `SKU:${String(row.sku || row.productId).trim().toUpperCase()}`;
      const location = warehouseById.get(String(row.warehouseId || ''));
      const branch = branchById.get(String(row.branchId || ''));
      const current = groups.get(groupId) || {
        id: groupId,
        itemType: 'ACCESSORY' as const,
        productId: row.productId,
        productMasterId: row.productMasterId,
        sku: row.sku,
        name: row.name,
        category: row.catalogGroupCode || row.category || 'Phụ kiện',
        brand: row.brand,
        modelCode: row.catalogModelCode,
        compatibleModels: row.compatibleModels || [],
        sellPrice: Number(row.sellPrice || 0),
        locations: []
      };
      current.locations.push({
        id: row.id,
        warehouseId: row.warehouseId,
        warehouseName: location?.name || (row.warehouseId ? `Kho ${row.warehouseId}` : 'Chưa định danh kho'),
        branchName: branch?.name || row.branchId || null,
        stockQuantity: Number(row.stockQuantity || 0),
        reservedQuantity: Number(row.reservedQuantity || 0),
        availableQuantity: Number(row.availableQuantity || 0),
        currentCost: typeof row.currentCost === 'number' ? row.currentCost : undefined,
        traceId: row.productId
      });
      groups.set(groupId, current);
    });

    // Old product documents may not yet have a branch balance.  They remain
    // visible as an explicit legacy row rather than silently disappearing.
    products.filter(product => product.category !== 'Dịch vụ' && !productIdsWithBalance.has(product.id)).forEach(product => {
      if (warehouseId && String(product.warehouse || '') !== warehouseId) return;
      const groupId = `SKU:${String(product.sku || product.id).trim().toUpperCase()}`;
      const location = warehouseById.get(String(product.warehouse || ''));
      const current = groups.get(groupId) || {
        id: groupId,
        itemType: 'ACCESSORY',
        productId: product.id,
        productMasterId: product.productMasterId || null,
        sku: product.sku,
        name: product.name,
        category: product.catalogGroupCode || product.category || 'Phụ kiện',
        brand: product.brand,
        modelCode: product.catalogModelCode,
        sellPrice: Number(product.sellPrice || 0),
        locations: []
      };
      current.locations.push({
        id: `LEGACY_${product.id}`,
        warehouseId: product.warehouse || null,
        warehouseName: location?.name || 'Tồn POS cũ · chưa tách theo kho',
        branchName: null,
        stockQuantity: Number(product.stockQuantity || 0),
        reservedQuantity: 0,
        // Legacy product.stockQuantity has no branch ledger or receipt chain,
        // therefore it is visible for reconciliation but never sellable.
        availableQuantity: 0,
        currentCost: Number(product.buyPrice || 0),
        traceId: product.id,
        isLegacy: true
      });
      groups.set(groupId, current);
    });

    const keyword = searchTerm.trim().toLocaleLowerCase('vi');
    return [...groups.values()].filter(group => {
      const searchValues = [group.sku, group.name, group.category, group.brand, group.modelCode, ...(group.compatibleModels || [])];
      if (keyword && !searchValues.some(value => String(value || '').toLocaleLowerCase('vi').includes(keyword))) return false;
      if (selectedCategory !== 'ALL' && group.category !== selectedCategory) return false;
      const totals = group.locations.reduce((summary, location) => ({
        stock: summary.stock + location.stockQuantity,
        available: summary.available + location.availableQuantity
      }), { stock: 0, available: 0 });
      const minimum = products.find(product => product.id === group.productId)?.minStockLevel || 0;
      if (availabilityFilter === 'AVAILABLE') return totals.available > 0;
      if (availabilityFilter === 'LOW') return totals.available > 0 && totals.available <= Number(minimum);
      if (availabilityFilter === 'EMPTY') return totals.available <= 0;
      return true;
    }).sort((left, right) => right.locations.reduce((sum, item) => sum + item.availableQuantity, 0)
      - left.locations.reduce((sum, item) => sum + item.availableQuantity, 0)
      || left.name.localeCompare(right.name, 'vi'));
  }, [availabilityFilter, balanceRows, branchById, products, searchTerm, selectedCategory, warehouseById, warehouseId]);

  const allGroupsForStats = useMemo(() => {
    const unique = new Map(stockGroups.map(group => [group.id, group]));
    return [...unique.values()];
  }, [stockGroups]);
  const stats = useMemo(() => allGroupsForStats.reduce((summary, group) => {
    const product = products.find(item => item.id === group.productId);
    const available = group.locations.reduce((sum, location) => sum + location.availableQuantity, 0);
    const stock = group.locations.reduce((sum, location) => sum + location.stockQuantity, 0);
    const costValue = group.locations.reduce((sum, location) => sum + location.availableQuantity * Number(location.currentCost || 0), 0);
    return {
      sku: summary.sku + 1,
      stock: summary.stock + stock,
      available: summary.available + available,
      low: summary.low + (available <= Number(product?.minStockLevel || 0) ? 1 : 0),
      value: summary.value + costValue
    };
  }, { sku: 0, stock: 0, available: 0, low: 0, value: 0 }), [allGroupsForStats, products]);
  const mayViewCost = balanceRows.some(row => typeof row.currentCost === 'number') || ['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(String(currentUser?.role || '').toUpperCase());

  const loadTrace = async (group: StockSkuGroup): Promise<StockSkuTraceResult> => {
    const auditedLocations = group.locations.filter(location => !location.isLegacy);
    if (!group.productId || auditedLocations.length === 0) {
      return { events: [], notice: 'Mã hàng cũ chưa có sổ tồn theo kho. Hãy đối soát và liên kết lại bằng phiếu nhập/chứng từ nguồn; không sửa số lượng trực tiếp.' };
    }
    const result = await fetchInventoryAccessoryTrace(group.productId, currentUser || undefined);
    return { events: result.movements, notice: result.notice };
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-24 sm:space-y-5 sm:pb-8">
      {!embedded && <header className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-2xs"><div className="flex items-center gap-2"><Box className="h-5 w-5 text-orange-600" /><h2 className="text-lg font-black text-zinc-900">Phụ kiện bán lẻ</h2><HelpHint title="Tồn phụ kiện bán lẻ">Mỗi thẻ là một SKU. Mở thẻ để xem số lượng ở từng kho; mở Chi tiết để xem lịch sử nhập, bán, hoàn và điều chuyển.</HelpHint></div></header>}

      <InventoryMetricCarousel label="Báo cáo phụ kiện bán lẻ, vuốt để xem thêm">
        <div className="h-full rounded-2xl border border-zinc-100 bg-white p-4 shadow-2xs"><p className="text-xs font-bold text-zinc-500">SKU đang theo dõi</p><p className="mt-1 text-2xl font-black text-zinc-900">{stats.sku}</p><p className="mt-1 text-[11px] text-zinc-400">Đã gom theo mã hàng</p></div>
        <div className="h-full rounded-2xl border border-zinc-100 bg-white p-4 shadow-2xs"><p className="text-xs font-bold text-zinc-500">Tồn vật lý</p><p className="mt-1 text-2xl font-black text-zinc-900">{stats.stock}</p><p className="mt-1 text-[11px] text-zinc-400">Tổng tại các kho</p></div>
        <div className="h-full rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-2xs"><p className="text-xs font-bold text-emerald-700">Có thể bán</p><p className="mt-1 text-2xl font-black text-emerald-800">{stats.available}</p><p className="mt-1 text-[11px] text-emerald-600">Sau phần đã giữ</p></div>
        <div className="h-full rounded-2xl border border-rose-100 bg-rose-50/40 p-4 shadow-2xs"><p className="text-xs font-bold text-rose-600">Cần cấp thêm</p><p className="mt-1 text-2xl font-black text-rose-700">{stats.low}</p><p className="mt-1 text-[11px] text-rose-500">Theo mức cảnh báo</p></div>
        <div className="h-full rounded-2xl border border-orange-100 bg-orange-50/60 p-4 shadow-2xs"><p className="text-xs font-bold text-orange-700">Giá trị khả dụng</p><p className="mt-1 text-xl font-black text-orange-700">{mayViewCost ? `${formatMoney(stats.value)} đ` : 'Ẩn theo quyền'}</p><p className="mt-1 text-[11px] text-orange-600">Theo giá vốn chứng từ</p></div>
      </InventoryMetricCarousel>

      {error && <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>}

      <section className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-2xs">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Tìm SKU, tên, nhóm, thương hiệu..." className="h-10 w-full rounded-xl border border-zinc-200 pl-10 pr-3 text-sm" /></label>
          <button type="button" onClick={() => void loadBalances()} disabled={loading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 disabled:opacity-50" title="Làm mới"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <label className="relative shrink-0"><Warehouse className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" /><select value={warehouseId} onChange={event => setWarehouseId(event.target.value)} className="h-9 max-w-[180px] rounded-xl border bg-white pl-8 pr-2 text-xs font-bold text-zinc-700"><option value="">Tất cả kho</option>{warehouses.filter(item => item.isActive !== false && !item.isArchived).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="relative shrink-0"><SlidersHorizontal className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" /><select value={selectedCategory} onChange={event => setSelectedCategory(event.target.value)} className="h-9 max-w-[180px] rounded-xl border bg-white pl-8 pr-2 text-xs font-bold text-zinc-700"><option value="ALL">Tất cả nhóm</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
          {([['ALL', 'Tất cả'], ['AVAILABLE', 'Có thể bán'], ['LOW', 'Sắp hết'], ['EMPTY', 'Hết hàng']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setAvailabilityFilter(value)} className={`h-9 shrink-0 rounded-xl px-3 text-[11px] font-black ${availabilityFilter === value ? 'bg-orange-600 text-white' : 'border border-zinc-200 bg-white text-zinc-600'}`}>{label}</button>)}
        </div>
      </section>

      <GroupedStockSkuView
        groups={stockGroups}
        loading={loading}
        canViewCost={mayViewCost}
        onLoadTrace={loadTrace}
        emptyMessage="Không có phụ kiện phù hợp bộ lọc hiện tại."
      />

      <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2.5 text-xs text-sky-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" /><span>Tồn chỉ đọc tại đây. Tăng, giảm hoặc hủy phải đi qua Phiếu nhập, hóa đơn bán hoặc phiếu điều chuyển để lịch sử và tài chính luôn khớp.</span></div>
    </div>
  );
};
