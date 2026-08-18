import React, { useState, useMemo } from 'react';
import { DeviceItem } from '../../../types';
import { Smartphone, Search, Check, Plus, Battery } from 'lucide-react';

export interface TargetDevicePickerPanelProps {
  devices: DeviceItem[];
  selectedDevice: DeviceItem | null;
  onSelectDevice: (device: DeviceItem) => void;
}

export const TargetDevicePickerPanel: React.FC<TargetDevicePickerPanelProps> = ({
  devices,
  selectedDevice,
  onSelectDevice
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const inStockDevices = useMemo(() => {
    return devices.filter(d => d.status === 'in_stock');
  }, [devices]);

  const filteredDevices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return inStockDevices.filter(d => {
      return (
        !q ||
        d.model?.toLowerCase().includes(q) ||
        d.imei?.toLowerCase().includes(q) ||
        d.storage?.toLowerCase().includes(q) ||
        d.color?.toLowerCase().includes(q)
      );
    });
  }, [inStockDevices, searchQuery]);

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 flex flex-col h-full space-y-3 shadow-2xs">
      {/* Header */}
      <div className="border-b border-zinc-100 pb-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#ff4b16] font-bold text-xs flex items-center justify-center">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
              2. Chọn Máy Đời Mới Lên Đời
            </h3>
            <p className="text-[10px] text-zinc-400">Máy có sẵn trong kho ({inStockDevices.length} cây)</p>
          </div>
        </div>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5 pointer-events-none" />
        <input
          type="text"
          placeholder="Tìm máy lên đời (iPhone 15, 16 Pro...)..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full h-8 pl-8 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-[#ff4b16]"
        />
      </div>

      {/* Selected Target Preview */}
      {selectedDevice && (
        <div className="p-3 bg-orange-50/80 border border-[#ff4b16] rounded-xl flex items-center justify-between text-xs">
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-zinc-900">{selectedDevice.model}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-orange-100 text-[#ff4b16]">
                ĐÃ CHỌN
              </span>
            </div>
            <span className="text-[11px] text-zinc-500 font-mono mt-0.5 block">
              {selectedDevice.storage} • {selectedDevice.color} • Pin: {selectedDevice.batteryHealth || 100}%
            </span>
          </div>
          <span className="font-black font-mono text-[#ff4b16] text-sm">
            {(selectedDevice.sellPrice || 0).toLocaleString('vi-VN')}đ
          </span>
        </div>
      )}

      {/* Device List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[420px] scrollbar-thin scrollbar-thumb-zinc-200">
        {filteredDevices.length === 0 ? (
          <div className="p-8 text-center text-zinc-400 text-xs">
            Không tìm thấy máy trong kho.
          </div>
        ) : (
          filteredDevices.map(dev => {
            const isSelected = selectedDevice?.id === dev.id;

            return (
              <div
                key={dev.id}
                onClick={() => onSelectDevice(dev)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between select-none ${
                  isSelected
                    ? 'bg-orange-50/80 border-[#ff4b16] ring-1 ring-[#ff4b16]'
                    : 'bg-zinc-50/50 border-zinc-200/80 hover:border-zinc-300 hover:bg-white'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <h4 className="text-xs font-bold text-zinc-900 truncate">{dev.model}</h4>
                  <div className="flex items-center space-x-2 text-[10px] text-zinc-500 font-mono mt-0.5">
                    <span>{dev.storage}</span>
                    <span>•</span>
                    <span>{dev.color}</span>
                    <span>•</span>
                    <span className="text-emerald-700">Pin {dev.batteryHealth || 100}%</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-xs font-black font-mono text-zinc-900">
                    {(dev.sellPrice || 0).toLocaleString('vi-VN')}đ
                  </span>
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                      isSelected ? 'bg-[#ff4b16] text-white' : 'bg-zinc-200 text-zinc-600'
                    }`}
                  >
                    {isSelected ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
