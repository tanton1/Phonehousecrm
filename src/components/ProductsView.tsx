import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Box,
  Check,
  Edit2,
  Loader2,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { ProductItem } from '../types';
import type { MasterCatalogItem } from '../types';
import { catalogApi } from '../services/catalogApiClient';
import { InventoryMetricCarousel } from './InventoryMetricCarousel';
import { HelpHint } from './HelpHint';

interface ProductsViewProps {
  products: ProductItem[];
  onAddProduct: (product: ProductItem) => void;
  onUpdateProduct: (product: ProductItem) => void;
  onDeleteProduct: (productId: string) => void;
  /** Rendered inside the unified parts hub, which already owns the page header. */
  embedded?: boolean;
}

const formatMoney = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');
const categoryFromMaster = (item: MasterCatalogItem): ProductItem['category'] => item.category === 'PART' ? 'Linh kiện' : 'Phụ kiện';

/**
 * POS accessories remain a stock projection, while Product Master owns the
 * identity. This view deliberately never creates a SKU/name from typed text.
 */
export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  embedded = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | ProductItem['category']>('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<ProductItem>>({});
  const [selectedMaster, setSelectedMaster] = useState<MasterCatalogItem | null>(null);
  const [masterQuery, setMasterQuery] = useState('');
  const [masterItems, setMasterItems] = useState<MasterCatalogItem[]>([]);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState('');
  const [formError, setFormError] = useState('');

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('vi');
    return products.filter(product => {
      const matchesSearch = !query || [product.name, product.sku, product.brand, product.catalogGroupCode, product.catalogModelCode]
        .some(value => String(value || '').toLocaleLowerCase('vi').includes(query));
      return matchesSearch && (selectedCategory === 'ALL' || product.category === selectedCategory);
    });
  }, [products, searchTerm, selectedCategory]);

  const stats = useMemo(() => ({
    totalItems: products.length,
    lowStock: products.filter(product => Number(product.stockQuantity || 0) <= Number(product.minStockLevel || 0)).length,
    retailUnits: products.filter(product => product.category === 'Phụ kiện').reduce((sum, product) => sum + Number(product.stockQuantity || 0), 0),
    totalValue: products.reduce((sum, product) => sum + Number(product.buyPrice || 0) * Number(product.stockQuantity || 0), 0)
  }), [products]);

  useEffect(() => {
    if (!dialogOpen || formData.id) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setMasterLoading(true);
        setMasterError('');
        try {
          const [parts, accessories] = await Promise.all([
            catalogApi.listItems({ kind: 'PART', activeOnly: true, limit: 30, search: masterQuery.trim() }),
            catalogApi.listItems({ kind: 'ACCESSORY', activeOnly: true, limit: 30, search: masterQuery.trim() })
          ]);
          if (!cancelled) {
            const unique = [...parts.items, ...accessories.items]
              .filter((item, index, all) => all.findIndex(candidate => candidate.id === item.id) === index);
            setMasterItems(unique);
          }
        } catch (cause: any) {
          if (!cancelled) setMasterError(cause?.message || 'Không thể tải Danh mục hàng hóa.');
        } finally {
          if (!cancelled) setMasterLoading(false);
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dialogOpen, formData.id, masterQuery]);

  const openCreate = () => {
    setFormData({ category: 'Phụ kiện', status: 'active', stockQuantity: 0, minStockLevel: 5, buyPrice: 0, sellPrice: 0 });
    setSelectedMaster(null);
    setMasterQuery('');
    setFormError('');
    setMasterError('');
    setDialogOpen(true);
  };

  const openEdit = (product: ProductItem) => {
    setFormData(product);
    setSelectedMaster(null);
    setFormError('');
    setDialogOpen(true);
  };

  const chooseMaster = (item: MasterCatalogItem) => {
    setSelectedMaster(item);
    setMasterQuery('');
    setFormData(current => ({
      ...current,
      productMasterId: item.id,
      sku: item.sku,
      name: item.name,
      category: categoryFromMaster(item),
      catalogGroupCode: item.catalogGroupCode || item.categoryCode || undefined,
      catalogModelCode: item.modelCode || undefined,
      brand: item.brand || current.brand || 'Chưa gán',
      buyPrice: Number(current.buyPrice ?? item.defaultImportPrice ?? 0),
      sellPrice: Number(current.sellPrice ?? item.defaultRetailPrice ?? 0)
    }));
  };

  const handleSave = () => {
    const buyPrice = Number(formData.buyPrice ?? 0);
    const sellPrice = Number(formData.sellPrice ?? 0);
    const stockQuantity = Number(formData.stockQuantity ?? 0);
    const minStockLevel = Number(formData.minStockLevel ?? 0);
    if (![buyPrice, sellPrice, stockQuantity, minStockLevel].every(value => Number.isFinite(value) && value >= 0)) {
      setFormError('Giá và số lượng phải là số từ 0 trở lên.');
      return;
    }
    if (formData.id) {
      onUpdateProduct({
        ...(formData as ProductItem),
        buyPrice,
        sellPrice,
        stockQuantity,
        minStockLevel,
        status: formData.status || 'active'
      });
    } else {
      if (!selectedMaster) {
        setFormError('Chọn một mã hàng từ Danh mục trước khi thêm tồn.');
        return;
      }
      if (products.some(product => product.productMasterId === selectedMaster.id || product.sku === selectedMaster.sku)) {
        setFormError('Mã hàng này đã có tồn. Hãy mở mã đang có để điều chỉnh số lượng, không tạo thêm SKU.');
        return;
      }
      onAddProduct({
        id: `PRD_${selectedMaster.id}`,
        productMasterId: selectedMaster.id,
        sku: selectedMaster.sku,
        name: selectedMaster.name,
        category: categoryFromMaster(selectedMaster),
        brand: selectedMaster.brand || String(formData.brand || 'Chưa gán'),
        ...((selectedMaster.catalogGroupCode || selectedMaster.categoryCode)
          ? { catalogGroupCode: selectedMaster.catalogGroupCode || selectedMaster.categoryCode }
          : {}),
        ...(selectedMaster.modelCode ? { catalogModelCode: selectedMaster.modelCode } : {}),
        buyPrice,
        sellPrice,
        stockQuantity,
        minStockLevel,
        status: formData.status || 'active',
        notes: formData.notes || ''
      });
    }
    setDialogOpen(false);
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-24 sm:space-y-5 sm:pb-8">
      <header className={`flex flex-col gap-3 sm:flex-row sm:items-center ${embedded ? 'justify-end' : 'justify-between'}`}>
        {!embedded && <div><h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-zinc-900"><Box className="h-6 w-6 text-orange-600" /> Hàng bán kèm theo Danh mục</h2><p className="mt-1 text-xs text-zinc-500">SKU và tên lấy từ Danh mục hàng hóa; kho chỉ quản lý số lượng và giá.</p></div>}
        <button type="button" onClick={openCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-black text-white shadow-lg shadow-orange-600/20"><Plus className="h-4 w-4" /> Thêm tồn từ Danh mục</button>
      </header>

      <InventoryMetricCarousel>
        <div className="h-full rounded-2xl border bg-white p-4 shadow-2xs"><p className="text-xs font-bold text-zinc-500">Mã hàng đang bán</p><p className="mt-1 text-2xl font-black text-zinc-900">{stats.totalItems}</p><p className="mt-1 text-[11px] text-zinc-400">Mỗi mã liên kết Danh mục</p></div>
        <div className="h-full rounded-2xl border border-rose-100 bg-rose-50/30 p-4 shadow-2xs"><p className="text-xs font-bold text-rose-600">Sắp hết hàng</p><p className="mt-1 text-2xl font-black text-rose-700">{stats.lowStock}</p><p className="mt-1 text-[11px] text-rose-500">Cần kiểm tra cấp thêm</p></div>
        <div className="h-full rounded-2xl border bg-white p-4 shadow-2xs"><p className="text-xs font-bold text-zinc-500">Tồn phụ kiện POS</p><p className="mt-1 text-2xl font-black text-zinc-900">{stats.retailUnits}</p><p className="mt-1 text-[11px] text-zinc-400">Đơn vị đang bán tại quầy</p></div>
        <div className="h-full rounded-2xl border bg-orange-50 p-4 shadow-2xs"><p className="text-xs font-bold text-orange-700">Giá trị tồn (vốn)</p><p className="mt-1 text-xl font-black text-orange-700">{formatMoney(stats.totalValue)} đ</p><p className="mt-1 text-[11px] text-orange-600">Theo dữ liệu tồn hiện có</p></div>
      </InventoryMetricCarousel>

      <section className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-2xs">
        <div className="flex flex-col gap-2 sm:flex-row"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Tìm tên, SKU, thương hiệu hoặc model..." className="h-10 w-full rounded-xl border px-10 pr-3 text-sm" /></label><div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">{(['ALL', 'Phụ kiện', 'Linh kiện', 'Dịch vụ'] as const).map(category => <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={`h-10 shrink-0 rounded-xl px-3 text-xs font-black ${selectedCategory === category ? 'bg-orange-600 text-white' : 'border bg-white text-zinc-600'}`}>{category === 'ALL' ? 'Tất cả' : category}</button>)}</div></div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredProducts.map(product => {
          const lowStock = Number(product.stockQuantity || 0) <= Number(product.minStockLevel || 0);
          return <article key={product.id} className="rounded-2xl border bg-white p-4 shadow-2xs"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-[11px] font-black text-orange-700">{product.sku}</p><h3 className="mt-1 line-clamp-2 text-sm font-black text-zinc-900">{product.name}</h3><p className="mt-1 text-xs text-zinc-500">{product.category}{product.brand ? ` · ${product.brand}` : ''}</p></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => openEdit(product)} aria-label={`Sửa ${product.name}`} className="rounded-lg border p-2 text-zinc-500 hover:text-orange-600"><Edit2 className="h-4 w-4" /></button><button type="button" onClick={() => { if (window.confirm(`Xóa ${product.name}?`)) onDeleteProduct(product.id); }} aria-label={`Xóa ${product.name}`} className="rounded-lg border p-2 text-zinc-500 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div></div><div className="mt-3 flex items-end justify-between border-t pt-3"><div><p className={`text-sm font-black ${lowStock ? 'text-rose-600' : 'text-emerald-700'}`}>Tồn {product.stockQuantity}{lowStock ? ' · sắp hết' : ''}</p><p className="mt-1 text-[11px] text-zinc-400">Vốn {formatMoney(product.buyPrice)} đ · Bán {formatMoney(product.sellPrice)} đ</p></div>{!product.productMasterId && <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">Mã cũ</span>}</div></article>;
        })}
        {filteredProducts.length === 0 && <div className="col-span-full rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-zinc-500">Chưa có hàng phù hợp. Hãy tạo mã tại Danh mục hàng hóa, rồi thêm tồn tại đây.</div>}
      </section>

      {dialogOpen && <div data-ph-fullscreen-form className="fixed inset-0 z-50 flex items-end bg-zinc-950/45 sm:items-center sm:justify-center sm:p-5"><section className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"><header className="flex items-center justify-between border-b px-4 py-4 sm:px-6"><div className="flex items-center gap-2"><h2 className="text-base font-black text-zinc-900">{formData.id ? 'Cập nhật tồn và giá' : 'Thêm tồn từ Danh mục'}</h2><HelpHint title={formData.id ? 'Cập nhật tồn và giá' : 'Thêm tồn từ Danh mục'}>{formData.id ? 'SKU và tên do Danh mục hàng hóa quản lý. Ở đây chỉ cập nhật giá và số lượng tồn.' : 'Chọn một mã hàng đã có trong Danh mục. Form này không tạo SKU mới; kho chỉ lưu giá và số lượng.'}</HelpHint></div><button type="button" onClick={() => setDialogOpen(false)} className="rounded-xl p-2 text-zinc-500"><X className="h-5 w-5" /></button></header><div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {!formData.id && <section className="rounded-2xl border border-orange-200 bg-orange-50/50 p-3"><p className="text-xs font-black text-zinc-700">Chọn mã hàng *</p>{selectedMaster ? <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-black text-zinc-900">{selectedMaster.name}</p><p className="font-mono text-[11px] font-bold text-orange-700">{selectedMaster.sku}</p></div><button type="button" onClick={() => { setSelectedMaster(null); setFormData(current => ({ ...current, productMasterId: undefined, sku: '', name: '' })); }} className="text-xs font-bold text-rose-600">Đổi</button></div> : <><label className="relative mt-2 block"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input autoFocus value={masterQuery} onChange={event => setMasterQuery(event.target.value)} placeholder="Tìm mã hàng, tên hoặc model..." className="h-10 w-full rounded-xl border bg-white px-10 pr-3 text-sm" /></label><div className="mt-2 max-h-52 divide-y overflow-y-auto rounded-xl border bg-white">{masterLoading && <p className="flex items-center gap-2 p-3 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Đang tìm Danh mục...</p>}{!masterLoading && masterItems.map(item => <button key={item.id} type="button" onClick={() => chooseMaster(item)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-orange-50"><span className="min-w-0"><span className="block truncate text-sm font-bold text-zinc-900">{item.name}</span><span className="block font-mono text-[11px] font-bold text-orange-700">{item.sku}</span></span><span className="shrink-0 text-[10px] font-bold text-zinc-500">{item.category === 'PART' ? 'Linh kiện' : 'Phụ kiện'}</span></button>)}{!masterLoading && masterItems.length === 0 && <p className="p-3 text-xs text-zinc-500">Chưa tìm thấy mã hàng. Tạo hoặc chỉnh sửa tại Danh mục hàng hóa trước.</p>}</div></>}{masterError && <p className="mt-2 text-xs font-bold text-red-600">{masterError}</p>}</section>}
        {formData.id && <section className="rounded-2xl border bg-zinc-50 p-3"><div className="flex items-center gap-2"><div><p className="font-mono text-xs font-black text-orange-700">{formData.sku}</p><p className="mt-1 text-sm font-black text-zinc-900">{formData.name}</p></div><HelpHint title="Mã hàng thuộc Danh mục">Muốn đổi tên hoặc SKU, mở Danh mục hàng hóa. Sửa tại kho chỉ thay đổi giá và số lượng.</HelpHint></div></section>}
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="text-xs font-black text-zinc-600">Giá vốn</span><input type="number" min={0} value={formData.buyPrice ?? 0} onChange={event => setFormData(current => ({ ...current, buyPrice: Number(event.target.value) }))} className="h-11 w-full rounded-xl border px-3 text-sm font-bold" /></label><label className="space-y-1"><span className="text-xs font-black text-zinc-600">Giá bán</span><input type="number" min={0} value={formData.sellPrice ?? 0} onChange={event => setFormData(current => ({ ...current, sellPrice: Number(event.target.value) }))} className="h-11 w-full rounded-xl border px-3 text-sm font-bold" /></label><label className="space-y-1"><span className="text-xs font-black text-zinc-600">Tồn hiện tại</span><input type="number" min={0} value={formData.stockQuantity ?? 0} onChange={event => setFormData(current => ({ ...current, stockQuantity: Number(event.target.value) }))} className="h-11 w-full rounded-xl border px-3 text-sm font-bold" /></label><label className="space-y-1"><span className="text-xs font-black text-zinc-600">Cảnh báo sắp hết</span><input type="number" min={0} value={formData.minStockLevel ?? 0} onChange={event => setFormData(current => ({ ...current, minStockLevel: Number(event.target.value) }))} className="h-11 w-full rounded-xl border px-3 text-sm font-bold" /></label></div>
        <label className="space-y-1"><span className="text-xs font-black text-zinc-600">Thương hiệu hiển thị</span><input value={formData.brand || ''} onChange={event => setFormData(current => ({ ...current, brand: event.target.value }))} className="h-11 w-full rounded-xl border px-3 text-sm" placeholder="Tự lấy từ danh mục nếu có" /></label>
        <label className="space-y-1"><span className="text-xs font-black text-zinc-600">Ghi chú</span><textarea value={formData.notes || ''} onChange={event => setFormData(current => ({ ...current, notes: event.target.value }))} rows={2} className="w-full rounded-xl border p-3 text-sm" /></label>
        {formError && <p className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700"><AlertCircle className="h-4 w-4" /> {formError}</p>}
      </div><footer className="flex gap-3 border-t bg-zinc-50 px-4 py-3 sm:px-6"><button type="button" onClick={() => setDialogOpen(false)} className="h-11 flex-1 rounded-xl border bg-white text-sm font-black text-zinc-700">Hủy</button><button type="button" onClick={handleSave} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-600 text-sm font-black text-white"><Check className="h-4 w-4" /> {formData.id ? 'Lưu thay đổi' : 'Thêm tồn'}</button></footer></section></div>}
    </div>
  );
};
