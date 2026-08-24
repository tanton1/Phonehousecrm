import React, { useMemo, useState } from 'react';
import { Box, PackageCheck, Search, ShieldCheck } from 'lucide-react';
import { ProductItem } from '../types';
import { InventoryMetricCarousel } from './InventoryMetricCarousel';
import { HelpHint } from './HelpHint';

interface ProductsViewProps {
  products: ProductItem[];
  /** Rendered inside the unified parts hub, which already owns the page header. */
  embedded?: boolean;
}

const formatMoney = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');

/**
 * `products` is now a read-only POS stock projection.  Stock-changing
 * operations are deliberately performed only by the supplier receipt,
 * transfer, sale and reversal server transactions.
 */
export const ProductsView: React.FC<ProductsViewProps> = ({ products, embedded = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | ProductItem['category']>('ALL');

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

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-24 sm:space-y-5 sm:pb-8">
      {!embedded && <header className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-2xs"><div className="flex items-center gap-2"><Box className="h-5 w-5 text-orange-600" /><h2 className="text-lg font-black text-zinc-900">Phụ kiện bán lẻ</h2><HelpHint title="Tồn phụ kiện bán lẻ">Tồn này chỉ thay đổi khi có phiếu nhập nhà cung cấp, hóa đơn bán hàng, điều chuyển hoặc hủy chứng từ. Không có nút sửa/xóa tồn trực tiếp để tránh lệch quỹ, công nợ và lịch sử kho.</HelpHint></div></header>}

      <InventoryMetricCarousel label="Báo cáo phụ kiện bán lẻ, vuốt để xem thêm">
        <div className="h-full rounded-2xl border border-zinc-100 bg-white p-4 shadow-2xs"><p className="text-xs font-bold text-zinc-500">Mã hàng đang bán</p><p className="mt-1 text-2xl font-black text-zinc-900">{stats.totalItems}</p><p className="mt-1 text-[11px] text-zinc-400">Liên kết Danh mục</p></div>
        <div className="h-full rounded-2xl border border-rose-100 bg-rose-50/30 p-4 shadow-2xs"><p className="text-xs font-bold text-rose-600">Sắp hết hàng</p><p className="mt-1 text-2xl font-black text-rose-700">{stats.lowStock}</p><p className="mt-1 text-[11px] text-rose-500">Theo mức cảnh báo</p></div>
        <div className="h-full rounded-2xl border border-zinc-100 bg-white p-4 shadow-2xs"><p className="text-xs font-bold text-zinc-500">Tồn phụ kiện POS</p><p className="mt-1 text-2xl font-black text-zinc-900">{stats.retailUnits}</p><p className="mt-1 text-[11px] text-zinc-400">Đơn vị còn phục vụ bán</p></div>
        <div className="h-full rounded-2xl border border-orange-100 bg-orange-50/60 p-4 shadow-2xs"><p className="text-xs font-bold text-orange-700">Giá trị tồn (vốn)</p><p className="mt-1 text-xl font-black text-orange-700">{formatMoney(stats.totalValue)} đ</p><p className="mt-1 text-[11px] text-orange-600">Theo chứng từ nhập</p></div>
      </InventoryMetricCarousel>

      <section className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-2xs">
        <div className="flex flex-col gap-2 sm:flex-row"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Tìm SKU, tên, thương hiệu hoặc model..." className="h-10 w-full rounded-xl border border-zinc-200 px-10 pr-3 text-sm" /></label><div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">{(['ALL', 'Phụ kiện', 'Linh kiện', 'Dịch vụ'] as const).map(category => <button key={category} type="button" onClick={() => setSelectedCategory(category)} className={`h-10 shrink-0 rounded-xl px-3 text-xs font-black ${selectedCategory === category ? 'bg-orange-600 text-white' : 'border border-zinc-200 bg-white text-zinc-600'}`}>{category === 'ALL' ? 'Tất cả' : category}</button>)}</div></div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-2xs">
        <div className="hidden grid-cols-[130px_minmax(220px,1fr)_120px_100px_120px] gap-4 border-b border-zinc-100 bg-zinc-50 px-4 py-3 text-[11px] font-black uppercase tracking-wide text-zinc-500 lg:grid"><span>SKU</span><span>Hàng hóa</span><span>Giá bán</span><span>Tồn</span><span>Trạng thái</span></div>
        <div className="divide-y divide-zinc-100">
          {filteredProducts.map(product => {
            const stock = Number(product.stockQuantity || 0);
            const lowStock = stock <= Number(product.minStockLevel || 0);
            return <article key={product.id} className="grid gap-3 p-4 lg:grid-cols-[130px_minmax(220px,1fr)_120px_100px_120px] lg:items-center"><span className="font-mono text-xs font-black text-orange-700">{product.sku}</span><div className="min-w-0"><p className="truncate text-sm font-black text-zinc-900">{product.name}</p><p className="mt-1 text-[11px] text-zinc-500">{product.category}{product.brand ? ` · ${product.brand}` : ''}{product.catalogGroupCode ? ` · ${product.catalogGroupCode}` : ''}</p>{product.productMasterId ? <p className="mt-1 text-[10px] font-bold text-emerald-700">Đã liên kết Danh mục</p> : <p className="mt-1 text-[10px] font-bold text-amber-700">Mã cũ · chỉ xem</p>}</div><p className="text-sm font-black text-zinc-900"><span className="lg:hidden text-zinc-500">Giá bán: </span>{formatMoney(product.sellPrice)} đ</p><p className={`text-sm font-black ${lowStock ? 'text-rose-600' : 'text-emerald-700'}`}><span className="lg:hidden text-zinc-500">Tồn: </span>{stock}</p><span className={`inline-flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black ${lowStock ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{lowStock ? 'CẦN CẤP THÊM' : 'CÓ THỂ BÁN'}</span></article>;
          })}
          {filteredProducts.length === 0 && <div className="p-10 text-center"><PackageCheck className="mx-auto h-7 w-7 text-zinc-300" /><p className="mt-2 text-sm font-bold text-zinc-500">Chưa có phụ kiện phù hợp.</p><p className="mt-1 text-xs text-zinc-400">Dùng Phiếu nhập hàng để nhận tồn từ nhà cung cấp.</p></div>}
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2.5 text-xs text-sky-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" /><span>Tồn kho chỉ đọc tại đây. Muốn tăng, giảm hoặc hủy tồn, mở đúng Phiếu nhập, hóa đơn bán hoặc phiếu điều chuyển liên quan.</span></div>
    </div>
  );
};
