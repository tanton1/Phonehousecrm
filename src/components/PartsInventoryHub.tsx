import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, Package, Store, Wrench } from 'lucide-react';
import { ProductItem, UserAccount, WarehouseInfo } from '../types';
import { ProductsView } from './ProductsView';
import { TechnicalSparePartsView } from './TechnicalSparePartsView';

interface PartsInventoryHubProps {
  products: ProductItem[];
  warehouses: WarehouseInfo[];
  currentUser?: UserAccount | null;
  onAddProduct: (product: ProductItem) => void;
  onUpdateProduct: (product: ProductItem) => void;
  onDeleteProduct: (productId: string) => void;
  /** Keeps old deep-links to `spare-parts` useful while there is only one visible page. */
  preferredSection?: 'retail' | 'technical';
}

type PartSection = 'retail' | 'technical';

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
  currentUser,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  preferredSection
}) => {
  const canViewTechnicalStock = useMemo(
    () => TECHNICAL_PART_ROLES.has(String(currentUser?.role || '').toUpperCase()),
    [currentUser?.role]
  );
  const isTechnician = ['TECH', 'TECHNICIAN', 'TECH_LEAD'].includes(String(currentUser?.role || '').toUpperCase());
  const [section, setSection] = useState<PartSection>(() => {
    if (preferredSection === 'technical' || isTechnician) return 'technical';
    return 'retail';
  });

  useEffect(() => {
    if (preferredSection === 'technical' && canViewTechnicalStock) {
      setSection('technical');
    } else if (!canViewTechnicalStock) {
      setSection('retail');
    }
  }, [canViewTechnicalStock, preferredSection]);

  const sections: Array<{ id: PartSection; label: string; description: string; icon: typeof Store }> = [
    {
      id: 'retail',
      label: 'Bán kèm POS',
      description: 'SKU phụ kiện, dịch vụ và tồn dùng khi bán tại quầy.',
      icon: Store
    },
    {
      id: 'technical',
      label: 'Linh kiện theo kho',
      description: 'Kho Tổng điều phối tồn cho các kho con KTV; mọi xuất dùng được đối soát theo phiếu kỹ thuật.',
      icon: Wrench
    }
  ];

  const visibleSections = sections.filter(item => item.id === 'retail' || canViewTechnicalStock);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-24 sm:space-y-6 sm:pb-8">
      <header className="rounded-3xl border border-orange-100 bg-gradient-to-br from-white via-white to-orange-50/70 p-4 shadow-2xs sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-zinc-900 sm:text-2xl">
              <Boxes className="h-7 w-7 text-orange-600" />
              Kho Linh Kiện &amp; Phụ Kiện
            </h2>
            <p className="mt-1 max-w-3xl text-xs font-medium leading-5 text-zinc-500 sm:text-sm">
              Một điểm quản lý chung cho hàng bán kèm và linh kiện vận hành. Kho Tổng là đầu mối cấp phát cho kho con của kỹ thuật viên.
            </p>
          </div>

          <div className="inline-flex w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-1 sm:w-auto">
            {visibleSections.map(item => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition-all sm:flex-none sm:px-4 ${
                    active
                      ? 'bg-white text-orange-700 shadow-sm ring-1 ring-orange-100'
                      : 'text-zinc-500 hover:bg-white/80 hover:text-zinc-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-zinc-100 bg-white px-4 py-3 shadow-2xs">
        {section === 'retail' ? (
          <div className="flex items-start gap-3 text-sm text-zinc-600">
            <Store className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
            <p><span className="font-black text-zinc-900">Bán kèm POS.</span> Quản lý SKU, giá bán và mức tồn phục vụ trực tiếp cho quầy bán hàng.</p>
          </div>
        ) : (
          <div className="flex items-start gap-3 text-sm text-zinc-600">
            <Package className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
            <p><span className="font-black text-zinc-900">Linh kiện theo vị trí thực tế.</span> KTV dùng kho con cá nhân; thiếu tồn sẽ yêu cầu Kho Tổng để duyệt cấp phát, không tự lấy từ kho chung.</p>
          </div>
        )}
      </section>

      {section === 'retail' ? (
        <ProductsView
          embedded
          products={products}
          onAddProduct={onAddProduct}
          onUpdateProduct={onUpdateProduct}
          onDeleteProduct={onDeleteProduct}
        />
      ) : (
        <TechnicalSparePartsView embedded warehouses={warehouses} currentUser={currentUser} />
      )}
    </div>
  );
};
