import React from 'react';
import { DeviceItem, ProductItem } from '../../../types';
import { ShoppingCart, Trash2, ShieldCheck, Plus, Minus, Tag, Repeat, Smartphone } from 'lucide-react';

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
  onClearCart
}) => {
  // Subtotal Calculation
  const devicesTotal = selectedDevices.reduce((sum, d) => sum + (d.sellPrice || 0), 0);
  const accessoriesTotal = selectedAccessories.reduce(
    (sum, acc) => sum + ((acc.product.price || acc.product.salePrice || 0) * acc.quantity),
    0
  );
  const totalAmount = devicesTotal + accessoriesTotal;
  const finalAmount = Math.max(0, totalAmount - discountAmount - tradeInDeduction);

  const totalItemsCount = selectedDevices.length + selectedAccessories.reduce((sum, a) => sum + a.quantity, 0);

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl p-3.5 sm:p-4 flex flex-col h-full shadow-2xs space-y-3">
      {/* 1. Cart Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-orange-100 text-[#ff4b16] flex items-center justify-center font-bold text-xs">
            {totalItemsCount}
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">Giỏ Hàng Thanh Toán</h3>
        </div>

        {totalItemsCount > 0 && (
          <button
            onClick={onClearCart}
            className="text-[11px] font-semibold text-zinc-400 hover:text-rose-600 transition-colors cursor-pointer"
          >
            Xóa giỏ hàng
          </button>
        )}
      </div>

      {/* 2. Items List */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 min-h-[220px] max-h-[360px] scrollbar-thin scrollbar-thumb-zinc-200">
        {totalItemsCount === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-zinc-400 space-y-2">
            <ShoppingCart className="w-8 h-8 stroke-1 text-zinc-300" />
            <p className="text-xs font-semibold text-zinc-600">Giỏ hàng đang trống</p>
            <p className="text-[11px] text-zinc-400 max-w-xs">Chọn máy iPhone từ danh sách bên trái hoặc quét mã IMEI để bắt đầu.</p>
          </div>
        ) : (
          <>
            {/* Devices Section */}
            {selectedDevices.map(dev => (
              <div
                key={dev.id}
                className="p-2.5 rounded-xl border border-zinc-200/70 bg-zinc-50/50 flex items-center justify-between group"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded bg-orange-100 text-[#ff4b16]">
                      MÁY
                    </span>
                    <h4 className="text-xs font-bold text-zinc-900 truncate">{dev.model}</h4>
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] text-zinc-500 font-mono mt-1">
                    <span>IMEI: ...{dev.imei ? dev.imei.slice(-6) : 'N/A'}</span>
                    <span>•</span>
                    <span>{dev.color || 'Đen'}</span>
                    <span>•</span>
                    <span>{dev.storage || '128GB'}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2.5 shrink-0">
                  <span className="text-xs font-black font-mono text-zinc-900">
                    {(dev.sellPrice || 0).toLocaleString('vi-VN')}đ
                  </span>
                  <button
                    onClick={() => onRemoveDevice(dev.id)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Accessories Section */}
            {selectedAccessories.map(acc => (
              <div
                key={acc.product.id}
                className="p-2.5 rounded-xl border border-zinc-200/70 bg-white flex items-center justify-between"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded bg-blue-100 text-blue-700">
                      PK
                    </span>
                    <h4 className="text-xs font-semibold text-zinc-800 truncate">{acc.product.name}</h4>
                  </div>
                  <span className="text-xs font-bold font-mono text-zinc-700 mt-0.5 block">
                    {((acc.product.price || acc.product.salePrice || 0) * acc.quantity).toLocaleString('vi-VN')}đ
                  </span>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {/* Stepper */}
                  <div className="flex items-center space-x-1 bg-zinc-100 p-0.5 rounded-lg">
                    <button
                      onClick={() => onUpdateAccessoryQty(acc.product.id, -1)}
                      className="w-5 h-5 rounded bg-white text-zinc-600 hover:bg-zinc-200 flex items-center justify-center cursor-pointer text-xs"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-mono font-bold text-zinc-800">
                      {acc.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateAccessoryQty(acc.product.id, 1)}
                      className="w-5 h-5 rounded bg-white text-zinc-600 hover:bg-zinc-200 flex items-center justify-center cursor-pointer text-xs"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    onClick={() => onRemoveAccessory(acc.product.id)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* 3. Warranty Package Picker */}
      <div className="p-2.5 rounded-xl bg-orange-50/60 border border-orange-200/80 space-y-1.5">
        <div className="flex items-center justify-between text-xs font-bold text-zinc-800">
          <div className="flex items-center space-x-1.5 text-[#ff4b16]">
            <ShieldCheck className="w-4 h-4" />
            <span>Gói Bảo Hành Kèm Theo</span>
          </div>
        </div>
        <select
          value={warrantyPackage}
          onChange={e => onSelectWarranty(e.target.value)}
          className="w-full h-8 px-2 bg-white border border-orange-200 rounded-lg text-xs font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
        >
          <option value="Gói Tiêu Chuẩn 6 Tháng">Gói Tiêu Chuẩn 6 Tháng (Mặc định)</option>
          <option value="Gói VIP 1 Đổi 1 12 Tháng">Gói VIP 1 Đổi 1 12 Tháng (+500k)</option>
          <option value="Gói Kim Cương Rơi Vỡ Vào Nước 12T">Gói Kim Cương Rơi Vỡ Vào Nước 12T (+1tr)</option>
        </select>
      </div>

      {/* 4. Trade-in Deduction (Thu Cũ) */}
      {tradeInDevice && (
        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-emerald-800">
            <Repeat className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="text-xs font-bold block truncate">Thu Cũ: {tradeInDevice.model}</span>
              <span className="text-[10px] text-emerald-600 font-mono">Định giá trừ vào đơn</span>
            </div>
          </div>
          <span className="text-xs font-black font-mono text-emerald-700">
            -{tradeInDeduction.toLocaleString('vi-VN')}đ
          </span>
        </div>
      )}

      {/* 5. Summary Calculations */}
      <div className="pt-2.5 border-t border-zinc-100 space-y-1.5 text-xs">
        <div className="flex justify-between text-zinc-500">
          <span>Tổng tiền hàng:</span>
          <span className="font-mono font-bold text-zinc-700">{totalAmount.toLocaleString('vi-VN')}đ</span>
        </div>

        {discountAmount > 0 && (
          <div className="flex justify-between text-rose-600 font-semibold">
            <span>Chiết khấu / Giảm giá (F8):</span>
            <span className="font-mono font-bold">-{discountAmount.toLocaleString('vi-VN')}đ</span>
          </div>
        )}

        {tradeInDeduction > 0 && (
          <div className="flex justify-between text-emerald-700 font-semibold">
            <span>Trừ tiền máy thu cũ:</span>
            <span className="font-mono font-bold">-{tradeInDeduction.toLocaleString('vi-VN')}đ</span>
          </div>
        )}

        <div className="flex justify-between items-baseline pt-2 border-t border-zinc-200">
          <span className="text-xs font-bold uppercase text-zinc-900">Khách Cần Trả:</span>
          <span className="text-lg font-black font-mono text-[#ff4b16]">
            {finalAmount.toLocaleString('vi-VN')}đ
          </span>
        </div>
      </div>
    </div>
  );
};
