import React from 'react';
import { DeviceItem, ProductItem, SalesCommissionTag } from '../../../types';
import { ShoppingCart, Trash2, ShieldCheck, Plus, Minus, Tag, Repeat, Smartphone, Sparkles, Gem, ArrowRight } from 'lucide-react';

export interface CartPanelProps {
  selectedDevices: DeviceItem[];
  selectedAccessories: { product: ProductItem; quantity: number }[];
  warrantyPackage: string;
  discountAmount: number;
  tradeInDeduction: number;
  tradeInDevice: DeviceItem | null;
  onRemoveDevice: (deviceId: string) => void;
  onUpdateAccessoryQty: (productId: string, delta: number) => void;
  onRemoveAccessory: (productId: string) => void;
  onSelectWarranty: (packageName: string) => void;
  onOpenDiscountModal: () => void;
  onOpenTradeInModal: () => void;
  onClearCart: () => void;
  commissionTags: SalesCommissionTag[];
  commissionTagSelections: Record<string, string[]>;
  onToggleCommissionTag: (itemType: 'DEVICE' | 'ACCESSORY', itemId: string, tagId: string) => void;
  getListPrice: (itemType: 'DEVICE' | 'ACCESSORY', item: DeviceItem | ProductItem) => number;
  getUnitPrice: (itemType: 'DEVICE' | 'ACCESSORY', item: DeviceItem | ProductItem) => number;
  getPriceReason: (itemType: 'DEVICE' | 'ACCESSORY', itemId: string) => string;
  onChangeUnitPrice: (itemType: 'DEVICE' | 'ACCESSORY', item: DeviceItem | ProductItem, unitPrice: number) => void;
  onChangePriceReason: (itemType: 'DEVICE' | 'ACCESSORY', itemId: string, reason: string) => void;
}

export const CartPanel: React.FC<CartPanelProps> = ({
  selectedDevices,
  selectedAccessories,
  warrantyPackage,
  discountAmount,
  tradeInDeduction,
  tradeInDevice,
  onRemoveDevice,
  onUpdateAccessoryQty,
  onRemoveAccessory,
  onSelectWarranty,
  onOpenDiscountModal,
  onOpenTradeInModal,
  onClearCart,
  commissionTags,
  commissionTagSelections,
  onToggleCommissionTag,
  getListPrice,
  getUnitPrice,
  getPriceReason,
  onChangeUnitPrice,
  onChangePriceReason
}) => {
  // Subtotal Calculation
  const devicesTotal = selectedDevices.reduce((sum, device) => sum + getUnitPrice('DEVICE', device), 0);
  const accessoriesTotal = selectedAccessories.reduce(
    (sum, acc) => sum + (getUnitPrice('ACCESSORY', acc.product) * acc.quantity),
    0
  );
  const totalAmount = devicesTotal + accessoriesTotal;
  const finalAmount = Math.max(0, totalAmount - discountAmount - tradeInDeduction);

  const totalItemsCount = selectedDevices.length + selectedAccessories.reduce((sum, a) => sum + a.quantity, 0);
  const renderCommissionTags = (itemType: 'DEVICE' | 'ACCESSORY', itemId: string) => {
    const tags = commissionTags.filter(tag => tag.isActive && tag.appliesTo === itemType);
    if (tags.length === 0) return <p className="mt-2 text-[10px] font-bold text-red-600">Chưa có tag {itemType === 'DEVICE' ? 'Máy' : 'Phụ kiện'} hoạt động trong Cài đặt Sales.</p>;
    const selected = commissionTagSelections[`${itemType}:${itemId}`] || [];
    return <div className="mt-2 flex flex-wrap gap-1.5 border-t border-zinc-200/70 pt-2">
      <span className="mr-1 text-[10px] font-black text-zinc-500">Tag hoa hồng *</span>
      {tags.map(tag => {
        const checked = selected.includes(tag.id);
        const valueLabel = tag.calculationType === 'PERCENT' ? `${tag.value}%` : `${tag.value.toLocaleString('vi-VN')}đ`;
        return <label key={tag.id} title={tag.description || tag.name} className={`cursor-pointer rounded-lg border px-2 py-1 text-[10px] font-bold ${checked ? 'border-orange-500 bg-orange-500 text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:border-orange-300'}`}>
          <input type="checkbox" className="sr-only" checked={checked} onChange={() => onToggleCommissionTag(itemType, itemId, tag.id)} />
          {tag.name} · {valueLabel}
        </label>;
      })}
    </div>;
  };

  const warrantyOptions = [
    { id: 'Gói Tiêu Chuẩn 6T', label: 'Chuẩn 6 Tháng', desc: 'Bảo hành phần cứng 6T' },
    { id: 'Gói VIP 1 Đổi 1 12 Tháng', label: '💎 VIP 1 Đổi 1 12T', desc: 'Lỗi là đổi mới (+990k)' },
    { id: 'Gói Kim Cương Rơi Vỡ 12 Tháng', label: '👑 Kim Cương VIP', desc: 'Bảo hành cả rơi vỡ (+1.49tr)' }
  ];

  return (
    <div className="bg-white p-3 sm:p-4 flex flex-col h-full space-y-3 overflow-hidden">
      {/* 1. Cart Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#ff4b16] text-white flex items-center justify-center font-black text-xs shadow-sm shadow-orange-500/30">
            {totalItemsCount}
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900">Giỏ Hàng Xuất Đơn</h3>
            <span className="text-[10px] text-zinc-400 font-medium">Tự động tính bảo hành & thuế</span>
          </div>
        </div>

        {totalItemsCount > 0 && (
          <button
            onClick={onClearCart}
            className="text-[11px] font-bold text-zinc-400 hover:text-rose-600 transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-rose-50"
          >
            Làm trống
          </button>
        )}
      </div>

      {/* 2. Items List */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 min-h-0 scrollbar-thin scrollbar-thumb-zinc-200">
        {totalItemsCount === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center text-center p-3 text-zinc-400 space-y-1.5">
            <ShoppingCart className="w-9 h-9 stroke-1 text-zinc-300" />
            <p className="text-xs font-bold text-zinc-600">Giỏ hàng đang trống</p>
            <p className="text-[11px] text-zinc-400 max-w-xs">Chạm vào máy iPhone hoặc phụ kiện ở khung bên trái để bắt đầu lập đơn.</p>
          </div>
        ) : (
          <>
            {/* Devices Section */}
            {selectedDevices.map(dev => (
              <div
                key={dev.id}
                className="p-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 group hover:bg-orange-50/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[9px] font-black font-mono px-1.5 py-0.2 rounded bg-orange-100 text-[#ff4b16]">
                      MÁY
                    </span>
                    <h4 className="text-xs font-bold text-zinc-900 truncate">{dev.model}</h4>
                  </div>
                  <div className="flex items-center space-x-1.5 text-[10px] text-zinc-500 font-mono mt-1">
                    <span className="font-bold text-zinc-700">IMEI: ...{dev.imei ? dev.imei.slice(-6) : 'N/A'}</span>
                    <span>•</span>
                    <span>{dev.color || 'Đen'}</span>
                    <span>•</span>
                    <span>{dev.storage || '128GB'}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-xs font-black font-mono text-[#ff4b16]">
                    {getUnitPrice('DEVICE', dev).toLocaleString('vi-VN')} đ
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveDevice(dev.id)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Xóa máy khỏi đơn"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                </div>
                <div className="mt-2 grid gap-2 rounded-xl border border-orange-100 bg-white p-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="space-y-1 text-[10px] font-black text-zinc-600"><span>Giá bán trên phiếu (có thể điều chỉnh)</span><input type="number" min="1" value={getUnitPrice('DEVICE', dev) || ''} onChange={event => onChangeUnitPrice('DEVICE', dev, Math.max(0, Number(event.target.value) || 0))} className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-sm font-black text-orange-600 outline-none focus:border-orange-500" /></label>
                  <span className="pb-2 text-[10px] text-zinc-500">Niêm yết: {getListPrice('DEVICE', dev).toLocaleString('vi-VN')}đ</span>
                </div>
                {getUnitPrice('DEVICE', dev) !== getListPrice('DEVICE', dev) && <input value={getPriceReason('DEVICE', dev.id)} onChange={event => onChangePriceReason('DEVICE', dev.id, event.target.value)} placeholder="Lý do điều chỉnh giá *" className="mt-2 w-full rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs outline-none focus:border-orange-500" />}
                {renderCommissionTags('DEVICE', dev.id)}
              </div>
            ))}

            {/* Accessories Section */}
            {selectedAccessories.map(acc => (
              <div
                key={acc.product.id}
                className="p-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 group"
              >
                <div className="flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[9px] font-bold font-mono px-1.5 py-0.2 rounded bg-blue-100 text-blue-700">
                      PHỤ KIỆN
                    </span>
                    <h4 className="text-xs font-bold text-zinc-900 truncate">{acc.product.name}</h4>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">
                    Đơn giá: {getUnitPrice('ACCESSORY', acc.product).toLocaleString('vi-VN')}đ
                  </span>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {/* Quantity Stepper */}
                  <div className="flex items-center border border-zinc-200 rounded-xl bg-white overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() => onUpdateAccessoryQty(acc.product.id, -1)}
                      className="p-1 hover:bg-zinc-100 text-zinc-600 transition-colors cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="px-2 font-mono font-bold text-xs text-zinc-800">{acc.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onUpdateAccessoryQty(acc.product.id, 1)}
                      className="p-1 hover:bg-zinc-100 text-zinc-600 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <span className="text-xs font-black font-mono text-zinc-900 min-w-[70px] text-right">
                    {(getUnitPrice('ACCESSORY', acc.product) * acc.quantity).toLocaleString('vi-VN')}đ
                  </span>

                  <button
                    type="button"
                    onClick={() => onRemoveAccessory(acc.product.id)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                </div>
                <div className="mt-2 grid gap-2 rounded-xl border border-blue-100 bg-white p-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="space-y-1 text-[10px] font-black text-zinc-600"><span>Giá bán trên phiếu (có thể điều chỉnh)</span><input type="number" min="1" value={getUnitPrice('ACCESSORY', acc.product) || ''} onChange={event => onChangeUnitPrice('ACCESSORY', acc.product, Math.max(0, Number(event.target.value) || 0))} className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-sm font-black text-blue-700 outline-none focus:border-blue-500" /></label>
                  <span className="pb-2 text-[10px] text-zinc-500">Niêm yết: {getListPrice('ACCESSORY', acc.product).toLocaleString('vi-VN')}đ</span>
                </div>
                {getUnitPrice('ACCESSORY', acc.product) !== getListPrice('ACCESSORY', acc.product) && <input value={getPriceReason('ACCESSORY', acc.product.id)} onChange={event => onChangePriceReason('ACCESSORY', acc.product.id, event.target.value)} placeholder="Lý do điều chỉnh giá *" className="mt-2 w-full rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs outline-none focus:border-orange-500" />}
                {renderCommissionTags('ACCESSORY', acc.product.id)}
              </div>
            ))}
          </>
        )}
      </div>

      {/* 3. Warranty VIP Package Picker */}
      <div className="space-y-1.5 pt-2 border-t border-zinc-100">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-zinc-800 flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#ff4b16]" />
            <span>Gói Bảo Hành PhoneHouse</span>
          </span>
          <span className="text-[10px] text-zinc-400 font-mono">Bảo hành điện tử</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
          {warrantyOptions.map(pkg => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => onSelectWarranty(pkg.id)}
              className={`p-2 rounded-2xl border text-left transition-all cursor-pointer ${
                warrantyPackage === pkg.id
                  ? 'bg-orange-50/90 border-[#ff4b16] text-[#ff4b16] ring-1 ring-[#ff4b16] shadow-2xs'
                  : 'bg-zinc-50 border-zinc-200/80 text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <div className="text-[11px] font-black truncate">{pkg.label}</div>
              <div className="text-[9px] text-zinc-500 truncate mt-0.5">{pkg.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 4. Discount & Trade-in Quick Action Bar */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onOpenDiscountModal}
          className={`flex-1 py-2 px-3 rounded-2xl border text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
            discountAmount > 0
              ? 'bg-amber-50 border-amber-300 text-amber-800 shadow-2xs'
              : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
          }`}
        >
          <Tag className="w-3.5 h-3.5 text-amber-600" />
          <span>{discountAmount > 0 ? `Voucher -${(discountAmount/1000).toLocaleString()}k` : '+ Voucher / Giảm Giá'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenTradeInModal}
          className={`flex-1 py-2 px-3 rounded-2xl border text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
            tradeInDeduction > 0
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-2xs'
              : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
          }`}
        >
          <Repeat className="w-3.5 h-3.5 text-emerald-600" />
          <span>{tradeInDeduction > 0 ? `Thu cũ -${(tradeInDeduction/1000).toLocaleString()}k` : '+ Thu Cũ Đổi Mới'}</span>
        </button>
      </div>

      {/* 5. Summary Total Breakdown */}
      <div className="p-3.5 rounded-2xl bg-zinc-900 text-white space-y-1.5 font-mono shadow-sm">
        <div className="flex justify-between text-xs text-zinc-400">
          <span>Tổng tiền hàng:</span>
          <span>{totalAmount.toLocaleString('vi-VN')} đ</span>
        </div>

        {discountAmount > 0 && (
          <div className="flex justify-between text-xs text-amber-400">
            <span>Chiết khấu Voucher:</span>
            <span>-{discountAmount.toLocaleString('vi-VN')} đ</span>
          </div>
        )}

        {tradeInDeduction > 0 && (
          <div className="flex justify-between text-xs text-emerald-400">
            <span>Trợ giá Thu Cũ:</span>
            <span>-{tradeInDeduction.toLocaleString('vi-VN')} đ</span>
          </div>
        )}

        <div className="pt-2 border-t border-zinc-800 flex justify-between items-center text-white">
          <span className="text-xs uppercase font-sans font-black tracking-wider text-zinc-300">Khách Cần Trả:</span>
          <span className="text-base sm:text-lg font-black text-[#ff4b16]">
            {finalAmount.toLocaleString('vi-VN')} đ
          </span>
        </div>
      </div>
    </div>
  );
};
