import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Boxes, ClipboardCheck, PackagePlus, ReceiptText, Store } from 'lucide-react';
import { FundAccount, Partner, ProductItem, PurchaseOrder, StoreBranch, UserAccount, WarehouseInfo } from '../types';
import { ProductsView } from './ProductsView';
import { StockItemPurchaseEntryForm } from './StockItemPurchaseEntryForm';
import { TechnicalSparePartsView } from './TechnicalSparePartsView';
import { HelpHint } from './HelpHint';

interface PartsInventoryHubProps {
  products: ProductItem[];
  warehouses: WarehouseInfo[];
  partners: Partner[];
  branches: StoreBranch[];
  funds: FundAccount[];
  currentUser?: UserAccount | null;
  onAddPurchaseOrder: (order: PurchaseOrder, postToInventory: boolean) => Promise<PurchaseOrder | void> | PurchaseOrder | void;
  onOpenPurchaseOrders?: () => void;
  /** Keeps old deep-links to `spare-parts` useful while there is only one visible page. */
  preferredSection?: 'retail' | 'technical';
}

type HubSection = 'STOCK' | 'RECEIPT' | 'TRANSFERS' | 'RETAIL';

const TECHNICAL_PART_ROLES = new Set([
  'ADMIN',
  'MANAGER',
  'ACCOUNTANT',
  'INVENTORY_MANAGER',
  'WAREHOUSE',
  'REGIONAL_MANAGER',
  'TECH_LEAD',
  'TECH',
  'TECHNICIAN'
]);

export const PartsInventoryHub: React.FC<PartsInventoryHubProps> = ({
  products,
  warehouses,
  partners,
  branches,
  funds,
  currentUser,
  onAddPurchaseOrder,
  onOpenPurchaseOrders,
  preferredSection
}) => {
  const canViewTechnicalStock = useMemo(
    () => TECHNICAL_PART_ROLES.has(String(currentUser?.role || '').toUpperCase()),
    [currentUser?.role]
  );
  const [section, setSection] = useState<HubSection>(() => preferredSection === 'retail' ? 'RETAIL' : 'STOCK');
  const [stockReceiptOpen, setStockReceiptOpen] = useState(false);

  useEffect(() => {
    if (!canViewTechnicalStock && section !== 'RETAIL') setSection('RETAIL');
    if (preferredSection === 'retail') setSection('RETAIL');
  }, [canViewTechnicalStock, preferredSection, section]);

  const tabDefinitions: Array<{ id: HubSection; label: string; icon: typeof Boxes; visible: boolean }> = [
    { id: 'STOCK', label: 'Tồn kho', icon: Boxes, visible: canViewTechnicalStock },
    { id: 'RECEIPT', label: 'Nhập hàng', icon: PackagePlus, visible: canViewTechnicalStock },
    { id: 'TRANSFERS', label: 'Điều chuyển & duyệt', icon: ArrowRightLeft, visible: canViewTechnicalStock },
    { id: 'RETAIL', label: 'Phụ kiện bán lẻ', icon: Store, visible: true }
  ];
  const tabs = tabDefinitions.filter(tab => tab.visible);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-24 sm:space-y-6 sm:pb-8">
      <header className="overflow-hidden rounded-3xl border border-orange-100 bg-gradient-to-br from-white via-white to-orange-50/80 shadow-2xs">
        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-sm shadow-orange-600/25"><Boxes className="h-5 w-5" /></span>
              <h2 className="text-xl font-black tracking-tight text-zinc-900 sm:text-2xl">Kho linh kiện &amp; phụ kiện</h2>
              <HelpHint title="Cách dùng kho linh kiện & phụ kiện">Danh mục hàng hóa chỉ quản lý SKU và tên. Tồn kho được theo dõi theo từng kho. Phiếu nhập tạo cùng lúc chứng từ, tồn kho, công nợ nhà cung cấp và giao dịch quỹ. Cấp phát cho KTV luôn đi từ Kho Tổng qua phiếu duyệt.</HelpHint>
            </div>
            <p className="mt-2 text-xs font-medium text-zinc-500 sm:text-sm">Tồn kho, nhập hàng và điều chuyển được tách riêng để dễ kiểm tra.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canViewTechnicalStock && <button type="button" onClick={() => { setSection('RECEIPT'); setStockReceiptOpen(true); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-black text-white shadow-lg shadow-orange-600/20 hover:bg-orange-700">
              <PackagePlus className="h-4 w-4" /> Nhập hàng
            </button>}
            {canViewTechnicalStock && onOpenPurchaseOrders && <button type="button" onClick={onOpenPurchaseOrders} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-black text-zinc-700 hover:border-orange-200 hover:text-orange-700">
              <ReceiptText className="h-4 w-4" /> Phiếu nhập
            </button>}
          </div>
        </div>
        <nav aria-label="Khu vực kho linh kiện và phụ kiện" className="flex gap-1 overflow-x-auto border-t border-orange-100 bg-white/80 p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = section === tab.id;
            return <button key={tab.id} type="button" onClick={() => setSection(tab.id)} className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition sm:px-4 ${active ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-500 hover:bg-orange-50 hover:text-orange-700'}`}>
              <Icon className="h-4 w-4" /> {tab.label}
            </button>;
          })}
        </nav>
      </header>

      {section === 'STOCK' && canViewTechnicalStock && (
        <TechnicalSparePartsView
          embedded
          mode="inventory"
          warehouses={warehouses}
          currentUser={currentUser}
          onOpenPurchaseReceipt={() => setStockReceiptOpen(true)}
        />
      )}

      {section === 'RECEIPT' && canViewTechnicalStock && (
        <section className="overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-2xs">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-2"><PackagePlus className="h-5 w-5 text-orange-600" /><h3 className="text-lg font-black text-zinc-900">Nhập hàng linh kiện &amp; phụ kiện</h3><HelpHint title="Luồng nhập hàng">Chọn SKU đã tạo ở Danh mục, sau đó chọn nhà cung cấp, kho nhận, số lượng, giá nhập, giá bán dự kiến và phương thức thanh toán. Khi xác nhận, hệ thống chỉ ghi phiếu nếu tồn kho, công nợ và quỹ cùng hợp lệ.</HelpHint></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ['1', 'Thông tin phiếu', 'Chi nhánh, kho nhận, nhà cung cấp'],
                  ['2', 'Chọn SKU & giá', 'Số lượng, giá nhập và giá bán dự kiến'],
                  ['3', 'Thanh toán', 'Quỹ chi hoặc ghi nhận công nợ']
                ].map(([number, title, note]) => <div key={number} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-xs font-black text-orange-700">{number}</span><p className="mt-2 text-xs font-black text-zinc-900">{title}</p><p className="mt-1 text-[11px] leading-4 text-zinc-500">{note}</p></div>)}
              </div>
              <button type="button" onClick={() => setStockReceiptOpen(true)} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-black text-white shadow-lg shadow-orange-600/20 hover:bg-orange-700"><PackagePlus className="h-4 w-4" /> Mở phiếu nhập hàng</button>
            </div>
            <aside className="border-t border-zinc-100 bg-zinc-50 p-5 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-emerald-600" /><p className="text-sm font-black text-zinc-900">Nguyên tắc nhận hàng</p></div>
              <ul className="mt-3 space-y-3 text-xs leading-5 text-zinc-600">
                <li><b className="text-zinc-900">Linh kiện</b> nhập vào Kho Tổng trước, rồi cấp phát cho KTV.</li>
                <li><b className="text-zinc-900">Phụ kiện</b> có thể nhận thẳng vào kho bán lẻ đã chọn.</li>
                <li>Không tạo SKU mới tại phiếu nhập; dùng mã đã có trong Danh mục.</li>
              </ul>
            </aside>
          </div>
        </section>
      )}

      {section === 'TRANSFERS' && canViewTechnicalStock && (
        <TechnicalSparePartsView embedded mode="requests" warehouses={warehouses} currentUser={currentUser} />
      )}

      {section === 'RETAIL' && (
        <ProductsView
          embedded
          products={products}
        />
      )}

      <StockItemPurchaseEntryForm
        isOpen={stockReceiptOpen}
        onClose={() => setStockReceiptOpen(false)}
        currentUser={currentUser}
        partners={partners}
        branches={branches}
        warehouses={warehouses}
        funds={funds}
        onAddPurchaseOrder={onAddPurchaseOrder}
      />
    </div>
  );
};
