import React from 'react';
import { DeviceItem } from '../../../types';
import { Smartphone, Battery, ShieldCheck, Tag, Plus, Check } from 'lucide-react';

export interface ProductCardProps {
  device: DeviceItem;
  isSelected: boolean;
  onSelect: (device: DeviceItem) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ device, isSelected, onSelect }) => {
  return (
    <div
      onClick={() => onSelect(device)}
      className={`p-3 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between select-none ${
        isSelected
          ? 'bg-orange-50/80 border-[#ff4b16] ring-1 ring-[#ff4b16] shadow-sm shadow-[#ff4b16]/10'
          : 'bg-white border-zinc-200/80 hover:border-zinc-300 hover:shadow-sm'
      }`}
    >
      <div>
        {/* Top bar: Storage & Battery */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700">
            {device.storage || '128GB'} • {device.color || 'Đen'}
          </span>
          {device.batteryHealth !== undefined && (
            <span
              className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md flex items-center space-x-0.5 ${
                device.batteryHealth >= 90
                  ? 'bg-emerald-50 text-emerald-700'
                  : device.batteryHealth >= 80
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-rose-50 text-rose-700'
              }`}
            >
              <Battery className="w-3 h-3" />
              <span>{device.batteryHealth}%</span>
            </span>
          )}
        </div>

        {/* Model Title */}
        <h4 className="text-xs font-bold text-zinc-900 line-clamp-1 leading-snug">
          {device.model}
        </h4>

        {/* IMEI / Condition */}
        <div className="mt-1 flex items-center space-x-1.5 text-[10px] text-zinc-500 font-mono">
          <span className="text-zinc-700 font-bold">IMEI: ...{device.imei ? device.imei.slice(-6) : 'N/A'}</span>
          <span>•</span>
          <span className="text-zinc-600 font-sans truncate">{device.condition || '99%'}</span>
        </div>
      </div>

      {/* Bottom bar: Price & Select Indicator */}
      <div className="mt-3 pt-2 border-t border-zinc-100 flex items-center justify-between">
        <span className="text-xs font-black font-mono text-[#ff4b16]">
          {(device.sellPrice || 0).toLocaleString('vi-VN')}đ
        </span>

        <button
          type="button"
          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
            isSelected
              ? 'bg-[#ff4b16] text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-orange-100 hover:text-[#ff4b16]'
          }`}
        >
          {isSelected ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};
