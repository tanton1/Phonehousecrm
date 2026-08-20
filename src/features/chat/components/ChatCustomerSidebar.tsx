import React, { useState } from 'react';
import { ChatConversation } from '../types';
import { DeviceItem } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { User, Phone, Smartphone, ShoppingCart, Sparkles, Send, Tag } from 'lucide-react';

export interface ChatCustomerSidebarProps {
  conversation: ChatConversation | null;
  devices: DeviceItem[];
  onSendProductCard: (convoId: string, device: DeviceItem) => void;
  onConvertToPOS: (conversation: ChatConversation, selectedDevice?: DeviceItem) => void;
}

export const ChatCustomerSidebar: React.FC<ChatCustomerSidebarProps> = ({
  conversation,
  devices,
  onSendProductCard,
  onConvertToPOS
}) => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  if (!conversation) return null;

  const inStockDevices = devices.filter(d => d.status === 'in_stock');
  const selectedDevice = inStockDevices.find(d => d.id === selectedDeviceId);

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 flex flex-col h-full space-y-4 shadow-2xs">
      {/* 1. Header */}
      <div className="border-b border-zinc-100 pb-3 flex items-center space-x-2.5">
        <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#ff4b16] font-bold text-xs flex items-center justify-center">
          <User className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-zinc-900">Thông Tin Báo Giá Nhanh</h4>
          <p className="text-[10px] text-zinc-400">Tư vấn trực tiếp từ kho máy</p>
        </div>
      </div>

      {/* 2. Customer Summary */}
      <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl space-y-1.5 text-xs">
        <div className="flex justify-between text-zinc-600">
          <span>Khách hàng:</span>
          <span className="font-bold text-zinc-900">{conversation.customerName}</span>
        </div>
        <div className="flex justify-between text-zinc-600">
          <span>Số điện thoại:</span>
          <span className="font-mono font-bold text-zinc-800">{conversation.customerPhone || 'Chưa có SĐT'}</span>
        </div>
        <div className="flex justify-between text-zinc-600">
          <span>Nguồn hội thoại:</span>
          <span className="font-bold text-[#ff4b16]">{conversation.channel}</span>
        </div>
      </div>

      {/* 3. Quick Device Quotation Picker */}
      <div className="space-y-2 text-xs">
        <label className="font-bold text-zinc-800 block">Chọn Máy Trong Kho Báo Giá:</label>
        <select
          value={selectedDeviceId}
          onChange={e => setSelectedDeviceId(e.target.value)}
          className="w-full h-9 px-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
        >
          <option value="">-- Chọn máy sẵn hàng ({inStockDevices.length}) --</option>
          {inStockDevices.slice(0, 25).map(dev => (
            <option key={dev.id} value={dev.id}>
              {dev.model} ({dev.storage} - {dev.color}) - {(dev.sellPrice || 0).toLocaleString('vi-VN')}đ{dev.branchId ? ` • [${dev.branchId}]` : ''}
            </option>
          ))}
        </select>

        {selectedDevice && (
          <div className="p-3 bg-orange-50/70 border border-orange-200 rounded-xl space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between font-bold">
              <span className="text-zinc-900">{selectedDevice.model}</span>
              <span className="font-mono text-[#ff4b16]">
                {(selectedDevice.sellPrice || 0).toLocaleString('vi-VN')}đ
              </span>
            </div>
            <div className="text-[11px] text-zinc-600 flex items-center space-x-2 font-mono">
              <span>Pin: {selectedDevice.batteryHealth || 100}%</span>
              <span>•</span>
              <span>{selectedDevice.storage}</span>
              <span>•</span>
              <span>{selectedDevice.color}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onSendProductCard(conversation.id, selectedDevice)}
              leftIcon={<Send className="w-3 h-3" />}
              className="w-full text-[11px] font-bold h-8"
            >
              Gửi Thẻ Báo Giá Vào Chat
            </Button>
          </div>
        )}
      </div>

      {/* 4. POS Conversion Trigger */}
      <div className="pt-2 mt-auto border-t border-zinc-100">
        <Button
          variant="primary"
          size="lg"
          onClick={() => onConvertToPOS(conversation, selectedDevice)}
          leftIcon={<ShoppingCart className="w-4 h-4" />}
          className="w-full"
        >
          Tạo Đơn Hàng Sang POS (F2)
        </Button>
      </div>
    </div>
  );
};
