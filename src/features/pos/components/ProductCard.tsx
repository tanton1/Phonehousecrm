import React from 'react';
import { DeviceItem } from '../../../types';
import { Smartphone, Battery, ShieldCheck, Tag, Plus, Check, Zap } from 'lucide-react';

export interface ProductCardProps {
  device: DeviceItem;
  isSelected: boolean;
  onSelect: (device: DeviceItem) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ device, isSelected, onSelect }) => {
  // Determine color dot
  const getColorDot = (colorName: string = '') => {
    const c = colorName.toLowerCase();
    if (c.includes('tự nhiên') || c.includes('natural')) return 'bg-[#9a948d]';
    if (c.includes('sa mạc') || c.includes('desert') || c.includes('vàng') || c.includes('gold')) return 'bg-[#d4af37]';
    if (c.includes('trắng') || c.includes('white') || c.includes('silver')) return 'bg-[#e2e8f0]';
    if (c.includes('xanh') || c.includes('blue')) return 'bg-[#273c75]';
    if (c.includes('hồng') || c.includes('pink')) return 'bg-[#f8a5c2]';
    if (c.includes('tím') || c.includes('purple')) return 'bg-[#8c7ae6]';
    return 'bg-[#2f3640]'; // Black / Dark
  };

  return (
    <div
      onClick={() => onSelect(device)}
      className={`p-3 sm:p-3.5 rounded-2xl border transition-all duration-150 cursor-pointer relative flex flex-col justify-between select-none active:scale-[0.98] ${
        isSelected
          ? 'bg-gradient-to-br from-orange-50 to-amber-50/60 border-[#ff4b16] ring-2 ring-[#ff4b16] shadow-md shadow-[#ff4b16]/15'
          : 'bg-white border-zinc-200/90 hover:border-orange-300 hover:shadow-md hover:shadow-orange-500/5'
      }`}
    >
      <div>
        {/* Top Spec Row */}
        <div className="flex items-center justify-between gap-1 mb-2">
          {/* Storage & Color Swatch */}
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-zinc-100/90 border border-zinc-200/70 text-[10px] font-bold font-mono text-zinc-800">
            <span className={`w-2 h-2 rounded-full ${getColorDot(device.color)} shadow-2xs`} />
            <span>{device.storage || '128GB'}</span>
          </div>

          {/* Battery Health Badge */}
          {device.batteryHealth !== undefined && (
            <span
              className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md flex items-center space-x-0.5 ${
                device.batteryHealth >= 90
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                  : device.batteryHealth >= 80
                  ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                  : 'bg-rose-50 text-rose-700 border border-rose-200/60'
              }`}
            >
              <Battery className="w-3 h-3" />
              <span>{device.batteryHealth}%</span>
            </span>
          )}
        </div>

        {/* Model Title */}
        <h4 className="text-xs sm:text-[13px] font-bold text-zinc-900 line-clamp-1 leading-snug tracking-tight">
          {device.model}
        </h4>

        {/* Region & Condition */}
        <div className="mt-1 flex items-center space-x-1.5 text-[10px] text-zinc-500 font-mono">
          <span className="px-1 py-0.2 rounded bg-zinc-100 text-zinc-700 font-bold">
            {device.region?.includes('VN/A') ? 'VN/A' : (device.region || 'Quốc Tế')}
          </span>
          <span>•</span>
          <span className="text-zinc-600 truncate">{device.condition || '99% Keng'}</span>
        </div>

        {/* IMEI 4 digits */}
        <p className="text-[10px] text-zinc-400 font-mono mt-1">
          IMEI: ...<span className="font-bold text-zinc-700">{device.imei ? device.imei.slice(-6) : 'N/A'}</span>
        </p>
      </div>

      {/* Bottom bar: Price & Select Indicator */}
      <div className="mt-3 pt-2 border-t border-zinc-100 flex items-center justify-between">
        <div>
          <span className="text-xs sm:text-sm font-black font-mono text-[#ff4b16] block">
            {(device.sellPrice || 0).toLocaleString('vi-VN')} đ
          </span>
        </div>

        <button
          type="button"
          className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-[#ff4b16] text-white shadow-sm shadow-orange-500/40'
              : 'bg-zinc-100 text-zinc-600 hover:bg-orange-100 hover:text-[#ff4b16]'
          }`}
        >
          {isSelected ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
