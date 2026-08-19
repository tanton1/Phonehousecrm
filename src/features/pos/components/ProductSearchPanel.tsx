import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DeviceItem, ProductItem } from '../../../types';
import { ProductCard } from './ProductCard';
import { Search, Package, Smartphone, Sparkles, Filter, X, Camera, QrCode, SlidersHorizontal, Check } from 'lucide-react';

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
  const [seriesFilter, setSeriesFilter] = useState<string>('ALL');
  const [conditionFilter, setConditionFilter] = useState<string>('ALL');
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [simulatedScanSuccess, setSimulatedScanSuccess] = useState(false);

  // Filter in_stock devices
  const inStockDevices = useMemo(() => {
    return devices.filter(d => d.status === 'in_stock');
  }, [devices]);

  // Series categorizations
  const seriesList = [
    { id: 'ALL', label: 'Tất cả model' },
    { id: '15', label: 'iPhone 15 Series' },
    { id: '14', label: 'iPhone 14 Series' },
    { id: '13', label: 'iPhone 13 Series' },
    { id: '12', label: 'iPhone 12 Series' },
    { id: 'OTHER', label: 'Dòng khác' }
  ];

  // Filtered devices based on search, series & condition
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

      let matchSeries = true;
      if (seriesFilter !== 'ALL') {
        if (seriesFilter === 'OTHER') {
          matchSeries = !d.model?.includes('15') && !d.model?.includes('14') && !d.model?.includes('13') && !d.model?.includes('12');
        } else {
          matchSeries = !!d.model?.includes(seriesFilter);
        }
      }

      let matchCondition = true;
      if (conditionFilter === 'NEW_SEAL') {
        matchCondition = d.condition?.toLowerCase().includes('seal') || d.condition?.toLowerCase().includes('mới') || false;
      } else if (conditionFilter === 'LIKENEW') {
        matchCondition = !d.condition?.toLowerCase().includes('seal') && !d.condition?.toLowerCase().includes('mới');
      }

      return matchSearch && matchSeries && matchCondition;
    });
  }, [inStockDevices, searchQuery, seriesFilter, conditionFilter]);

  // Filtered accessories
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter(p => {
      const isStock = (p.stockQuantity ?? 0) > 0;
      return (
        isStock &&
        (!q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      );
    });
  }, [products, searchQuery]);

  // Quick Barcode Scan Simulation
  const handleSimulateScan = (device: DeviceItem) => {
    onToggleSelectDevice(device);
    setSimulatedScanSuccess(true);
    setTimeout(() => {
      setSimulatedScanSuccess(false);
      setIsCameraScannerOpen(false);
    }, 800);
  };

  return (
    <div className="bg-white border border-zinc-200/80 rounded-3xl p-3.5 sm:p-4 flex flex-col h-full shadow-2xs space-y-3">
      {/* 1. Header & Tab Switcher */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center space-x-1.5 p-1 bg-zinc-100 rounded-2xl">
          <button
            onClick={() => setActiveTab('DEVICES')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'DEVICES'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Kho Máy iPhone ({inStockDevices.length})
          </button>

          <button
            onClick={() => setActiveTab('ACCESSORIES')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'ACCESSORIES'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            Phụ Kiện Chính Hãng ({products.filter(p => (p.stockQuantity ?? 0) > 0).length})
          </button>
        </div>

        {/* Camera Barcode Scanner Button */}
        <button
          type="button"
          onClick={() => setIsCameraScannerOpen(true)}
          className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#ff4b16] border border-orange-200/80 font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
          title="Quét Barcode / QR IMEI bằng Camera"
        >
          <Camera className="w-4 h-4" />
          <span className="hidden sm:inline">Quét Camera</span>
        </button>
      </div>

      {/* 2. Live Search Bar */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 pointer-events-none" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder={activeTab === 'DEVICES' ? 'Tìm Model, 4 số cuối IMEI, màu sắc, dung lượng...' : 'Tìm tên phụ kiện, sạc nhanh, ốp lưng...'}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full h-11 pl-10 pr-9 bg-zinc-50/80 border border-zinc-200 rounded-2xl text-xs font-medium text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:border-[#ff4b16] focus:ring-2 focus:ring-[#ff4b16]/10 transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 3. 2-Tier Segmented Category Chips */}
      {activeTab === 'DEVICES' && (
        <div className="space-y-1.5">
          {/* Tier 1: Series */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
            {seriesList.map(s => (
              <button
                key={s.id}
                onClick={() => setSeriesFilter(s.id)}
                className={`px-3 py-1 rounded-xl font-bold shrink-0 transition-all cursor-pointer ${
                  seriesFilter === s.id
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'bg-zinc-100/90 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Tier 2: Condition Tag */}
          <div className="flex items-center space-x-1.5 text-[10px] font-semibold">
            <span className="text-zinc-400">Tình trạng:</span>
            <button
              onClick={() => setConditionFilter('ALL')}
              className={`px-2 py-0.5 rounded-lg transition-colors cursor-pointer ${
                conditionFilter === 'ALL' ? 'bg-[#ff4b16] text-white font-bold' : 'bg-zinc-100 text-zinc-600'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setConditionFilter('NEW_SEAL')}
              className={`px-2 py-0.5 rounded-lg transition-colors cursor-pointer ${
                conditionFilter === 'NEW_SEAL' ? 'bg-[#ff4b16] text-white font-bold' : 'bg-zinc-100 text-zinc-600'
              }`}
            >
              New Seal 100%
            </button>
            <button
              onClick={() => setConditionFilter('LIKENEW')}
              className={`px-2 py-0.5 rounded-lg transition-colors cursor-pointer ${
                conditionFilter === 'LIKENEW' ? 'bg-[#ff4b16] text-white font-bold' : 'bg-zinc-100 text-zinc-600'
              }`}
            >
              Like New 99% Keng
            </button>
          </div>
        </div>
      )}

      {/* 4. Products Grid / List */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-0 scrollbar-thin scrollbar-thumb-zinc-200">
        {activeTab === 'DEVICES' ? (
          filteredDevices.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              <Smartphone className="w-10 h-10 stroke-1 text-zinc-300" />
              <p className="text-xs font-semibold text-zinc-600">Không tìm thấy máy trong kho</p>
              <p className="text-[11px] text-zinc-400 max-w-xs">Hãy thử tìm theo 4 số cuối IMEI hoặc đổi bộ lọc model series.</p>
            </div>
          )
        ) : filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredProducts.map(prod => (
              <div
                key={prod.id}
                onClick={() => onAddAccessory(prod)}
                className="p-3 sm:p-3.5 rounded-2xl border border-zinc-200/80 bg-white hover:border-orange-300 hover:shadow-sm transition-all cursor-pointer flex items-center justify-between group active:scale-[0.98]"
              >
                <div className="min-w-0 pr-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-orange-50 text-[#ff4b16]">
                    Phụ Kiện
                  </span>
                  <h4 className="text-xs font-bold text-zinc-900 truncate mt-1 group-hover:text-[#ff4b16] transition-colors">
                    {prod.name}
                  </h4>
                  <div className="flex items-center space-x-2 text-[10px] text-zinc-500 font-mono mt-0.5">
                    <span>Tồn kho: <b className="text-zinc-800 font-mono">{prod.stockQuantity}</b></span>
                    <span>•</span>
                    <span className="text-[#ff4b16] font-black font-mono text-xs">
                      {(prod.sellPrice || (prod as any).price || 0).toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="w-8 h-8 rounded-xl bg-orange-50 text-[#ff4b16] group-hover:bg-[#ff4b16] group-hover:text-white flex items-center justify-center shrink-0 transition-colors shadow-2xs cursor-pointer"
                >
                  <Package className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-zinc-400 space-y-2">
            <Package className="w-10 h-10 stroke-1 text-zinc-300" />
            <p className="text-xs font-semibold text-zinc-600">Không tìm thấy phụ kiện phù hợp</p>
          </div>
        )}
      </div>

      {/* 5. Camera Barcode / QR Scanner Live Modal */}
      {isCameraScannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-zinc-900 text-white w-full max-w-md rounded-3xl p-5 border border-zinc-800 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2">
                <Camera className="w-5 h-5 text-[#ff4b16]" />
                <h3 className="text-sm font-bold">Quét Barcode / QR Hộp iPhone</h3>
              </div>
              <button
                onClick={() => setIsCameraScannerOpen(false)}
                className="p-1 rounded-full text-zinc-400 hover:text-white bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Viewfinder simulation */}
            <div className="relative aspect-4/3 bg-black rounded-2xl overflow-hidden border border-zinc-800 flex items-center justify-center">
              {/* Laser scanner line */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-[#ff4b16] to-transparent absolute animate-pulse shadow-lg shadow-orange-500" />
              
              <div className="text-center space-y-2 p-4 z-10">
                <QrCode className="w-12 h-12 text-[#ff4b16] mx-auto animate-bounce" />
                <p className="text-xs text-zinc-300 font-medium">Hướng camera vào mã vạch IMEI trên vỏ hộp máy...</p>
              </div>

              {simulatedScanSuccess && (
                <div className="absolute inset-0 bg-emerald-600/90 flex flex-col items-center justify-center text-white space-y-1 animate-in zoom-in-95 duration-150">
                  <Check className="w-12 h-12 stroke-[3]" />
                  <span className="text-sm font-black">Đã quét thành công!</span>
                </div>
              )}
            </div>

            {/* Quick test tap: tap any available device */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-zinc-400 block">Hoặc bấm chọn nhanh máy sẵn trong kho để thử:</span>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {inStockDevices.slice(0, 3).map(dev => (
                  <button
                    key={dev.id}
                    onClick={() => handleSimulateScan(dev)}
                    className="w-full p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-left text-xs flex items-center justify-between transition-colors cursor-pointer font-mono"
                  >
                    <span className="truncate">{dev.model}</span>
                    <span className="text-amber-400 text-[10px] font-bold">IMEI: ...{dev.imei.slice(-6)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
