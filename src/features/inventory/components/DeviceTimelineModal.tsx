import React from 'react';
import { DeviceItem, DeviceHistoryLog } from '../../../types';
import { StatusBadge } from '../../../shared/ui/StatusBadge/StatusBadge';
import { Smartphone, Battery, Clock, CheckCircle2, ArrowRightLeft, ShoppingCart, Wrench, PackageCheck, X, User } from 'lucide-react';

export interface DeviceTimelineModalProps {
  device: DeviceItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DeviceTimelineModal: React.FC<DeviceTimelineModalProps> = ({ device, isOpen, onClose }) => {
  if (!isOpen || !device) return null;

  // Build timeline events from device.history or synthesized from attributes
  const events: { id: string; title: string; time: string; actor: string; type: string; details: string }[] = [];

  // 1. Nhập kho ban đầu
  events.push({
    id: 'evt-import',
    title: 'Nhập kho thiết bị từ Nhà Cung Cấp',
    time: device.receivedDate || 'N/A',
    actor: device.supplier || 'Bộ phận Thu Mua',
    type: 'IMPORT',
    details: `Nhập máy ${device.model} (${device.storage || '128GB'} - ${device.color || 'Đen'}), Tình trạng: ${device.condition || '99%'}, Pin: ${device.batteryHealth || 100}%, Giá nhập: ${(device.buyPrice || 0).toLocaleString('vi-VN')}đ.`
  });

  // 2. Custom History Logs
  if (device.history && device.history.length > 0) {
    device.history.forEach((h, idx) => {
      events.push({
        id: `evt-hist-${idx}`,
        title: h.action || 'Cập nhật trạng thái máy',
        time: h.timestamp || 'N/A',
        actor: h.performedBy || 'Nhân viên kho',
        type: h.action?.includes('Chuyển') ? 'TRANSFER' : 'UPDATE',
        details: h.details || ''
      });
    });
  }

  // 3. Sự kiện Bán Hàng nếu máy đã bán
  if (device.status === 'sold' || device.soldDate) {
    events.push({
      id: 'evt-sold',
      title: 'Xuất bán cho khách hàng',
      time: device.soldDate || 'N/A',
      actor: 'Nhân viên POS Thu Ngân',
      type: 'SOLD',
      details: `Khách hàng: ${device.customerName || 'Khách vãng lai'} (${device.customerPhone || 'N/A'}). Giá bán: ${(device.sellPrice || 0).toLocaleString('vi-VN')}đ.`
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-zinc-100">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 text-[#ff4b16] flex items-center justify-center font-bold">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-black text-zinc-900">{device.model}</h3>
                <StatusBadge status={device.status} />
              </div>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                IMEI: <span className="font-bold text-zinc-800">{device.imei}</span> • Seri: {device.serialNo || 'N/A'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Device Quick Spec Bar */}
        <div className="bg-zinc-50/80 px-5 py-3 border-b border-zinc-100 grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-zinc-400 block text-[10px]">Màu & Dung lượng</span>
            <span className="font-bold text-zinc-800">{device.color || 'Đen'} • {device.storage || '128GB'}</span>
          </div>
          <div>
            <span className="text-zinc-400 block text-[10px]">Tình trạng Pin</span>
            <span className="font-bold text-emerald-600 flex items-center space-x-1">
              <Battery className="w-3.5 h-3.5" />
              <span>{device.batteryHealth || 100}%</span>
            </span>
          </div>
          <div>
            <span className="text-zinc-400 block text-[10px]">Giá bán niêm yết</span>
            <span className="font-bold font-mono text-[#ff4b16]">{(device.sellPrice || 0).toLocaleString('vi-VN')}đ</span>
          </div>
        </div>

        {/* Timeline Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center space-x-2 text-zinc-800 font-bold text-xs">
            <Clock className="w-4 h-4 text-[#ff4b16]" />
            <span>Hành Trình Vòng Đời Thiết Bị (Device Journey)</span>
          </div>

          <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200">
            {events.map(evt => (
              <div key={evt.id} className="relative group">
                <div className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white ${
                  evt.type === 'SOLD' ? 'bg-emerald-500 text-white' : evt.type === 'IMPORT' ? 'bg-[#ff4b16] text-white' : evt.type === 'TRANSFER' ? 'bg-blue-500 text-white' : 'bg-zinc-500 text-white'
                }`}>
                  {evt.type === 'SOLD' ? <ShoppingCart className="w-3 h-3" /> : evt.type === 'IMPORT' ? <PackageCheck className="w-3 h-3" /> : evt.type === 'TRANSFER' ? <ArrowRightLeft className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                </div>

                <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-3.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-zinc-900">{evt.title}</h5>
                    <span className="text-[10px] font-mono text-zinc-400">{evt.time}</span>
                  </div>
                  <p className="text-zinc-600 leading-relaxed">{evt.details}</p>
                  <div className="text-[10px] text-zinc-500 font-medium pt-1.5 border-t border-zinc-200/60 flex items-center space-x-1">
                    <User className="w-3 h-3 text-zinc-400" />
                    <span>Thực hiện: <strong className="text-zinc-700">{evt.actor}</strong></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
