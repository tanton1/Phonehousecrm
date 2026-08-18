import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DeviceItem, ProductItem } from '../../../types';
import { ProductCard } from './ProductCard';
import { Search, Package, Smartphone, Sparkles, Filter, X } from 'lucide-react';

export interface ProductSearchPanelProps {
  devices: DeviceItem[];
  products: ProductItem[];
  selectedDeviceIds: string[];
  onToggleSelectDevice: (device: DeviceItem) => void;
  onAddAccessory: (product: ProductItem) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export const ProductSearchPanel: React.FC<ProductSearchPanelProps> = ({
  devices,
  products,
  selectedDeviceIds,
  onToggleSelectDevice,
  onAddAccessory,
  searchInputRef
}) => {
  const [activeTab, setActiveTab] = useState<'DEVICES' | 'ACCESSORIES'>('DEVICES');
  const [searchQuery, setSearchQuery] = useState('');
  const [modelFilter, setModelFilter] = useState('ALL');

  // Filter in_stock devices
  const inStockDevices = useMemo(() => {
    return devices.filter(d => d.status === 'in_stock');
  }, [devices]);

  // Unique models for filter chips
  const availableModels = useMemo(() => {
    const set = new Set<string>();
    inStockDevices.forEach(d => {
      if (d.model) set.add(d.model);
    });
    return Array.from(set).slice(0, 6);
  }, [inStockDevices]);

  // Filtered devices based on search & model chip
  const filteredDevices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return inStockDevices.filter(d => {
      const matchSearch =
        !q ||
        d.model?.toLowerCase().includes(q) ||
        d.imei?.toLowerCase().includes(q) ||
        d.serialNo?.toLowerCase().includes(q) ||
        d.color?.toLowerCase().includes(q) ||
        d.storage?.toLowerCase().includes(q);

      const matchModel = modelFilter === 'ALL' || d.model === modelFilter;
      return matchSearch && matchModel;
    });
  }, [inStockDevices, searchQuery, modelFilter]);

  // Filtered accessories
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter(p => {
      return (
        p.stockQuantity > 0 &&
        (!q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      );
    });
  }, [products, searchQuery]);

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl p-3.5 sm:p-4 flex flex-col h-full shadow-2xs space-y-3">
      {/* 1. Header & Tab Switcher */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center space-x-1.5 p-1 bg-zinc-100/80 rounded-xl">
          <button
            onClick={() => setActiveTab('DEVICES')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'DEVICES'
                ? 'bg-white text-zinc-900 shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Máy Trong Kho ({inStockDevices.length})
          </button>

          <button
            onClick={() => setActiveTab('ACCESSORIES')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'ACCESSORIES'
                ? 'bg-white text-zinc-900 shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Phụ Kiện ({products.filter(p => p.stockQuantity > 0).length})
          </button>
        </div>

        <span className="text-[10px] font-mono text-zinc-400 hidden sm:inline-block">
          Phím tắt: <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 font-bold border border-zinc-200">F2</kbd>
        </span>
      </div>

      {/* 2. Live Search Bar */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder={activeTab === 'DEVICES' ? 'Quét mã IMEI (15 số), tìm Model, Màu, Dung lượng...' : 'Tìm tên phụ kiện, ốp lưng, sạc nhanh...'}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full h-10 pl-9 pr-8 bg-zinc-50/80 border border-zinc-200 rounded-xl text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:border-[#ff4b16] focus:ring-2 focus:ring-[#ff4b16]/10 transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 3. Filter Chips for Devices */}
      {activeTab === 'DEVICES' && availableModels.length > 0 && (
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
          <button
            onClick={() => setModelFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors cursor-pointer ${
              modelFilter === 'ALL'
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Tất cả
          </button>
          {availableModels.map(m => (
            <button
              key={m}
              onClick={() => setModelFilter(m)}
              className={`px-2.5 py-1 rounded-lg font-medium shrink-0 transition-colors cursor-pointer ${
                modelFilter === m
                  ? 'bg-orange-100 text-[#ff4b16] font-bold'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* 4. Products Grid / List */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-[360px] max-h-[580px] scrollbar-thin scrollbar-thumb-zinc-200">
        {activeTab === 'DEVICES' ? (
          filteredDevices.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredDevices.map(dev => (
                <ProductCard
                  key={dev.id}
                  device={dev}
                  isSelected={selectedDeviceIds.includes(dev.id)}
                  onSelect={onToggleSelectDevice}
                />
              ))}
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-zinc-400 space-y-2">
              <Smartphone className="w-8 h-8 stroke-1 text-zinc-300" />
              <p className="text-xs font-semibold text-zinc-600">Không tìm thấy máy phù hợp</p>
              <p className="text-[11px] text-zinc-400 max-w-xs">Hãy thử tìm theo 6 số cuối IMEI hoặc đổi từ khóa.</p>
            </div>
          )
        ) : filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredProducts.map(prod => (
              <div
                key={prod.id}
                onClick={() => onAddAccessory(prod)}
                className="p-3 rounded-2xl border border-zinc-200/80 bg-white hover:border-zinc-300 hover:shadow-2xs transition-all cursor-pointer flex items-center justify-between"
              >
                <div className="min-w-0 pr-2">
                  <h4 className="text-xs font-bold text-zinc-900 truncate">{prod.name}</h4>
                  <div className="flex items-center space-x-2 text-[10px] text-zinc-500 font-mono mt-0.5">
                    <span>Tồn: {prod.stockQuantity}</span>
                    <span>•</span>
                    <span className="text-[#ff4b16] font-bold font-mono">
                      {(prod.price || prod.salePrice || 0).toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-orange-100 hover:text-[#ff4b16] text-zinc-600 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-zinc-400 space-y-2">
            <Package className="w-8 h-8 stroke-1 text-zinc-300" />
            <p className="text-xs font-semibold text-zinc-600">Không tìm thấy phụ kiện</p>
          </div>
        )}
      </div>
    </div>
  );
};
