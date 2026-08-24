import React, { useState } from 'react';
import { ChatConversation, ChatPriority, ChatWorkflowStatus } from '../types';
import { DeviceItem } from '../../../types';
import { PancakeChatStaffOption } from '../../../services/pancakeApiClient';
import { Button } from '../../../shared/ui/Button/Button';
import { User, ShoppingCart, Send, Clock3, Headphones } from 'lucide-react';

export interface ChatCustomerSidebarProps {
  conversation: ChatConversation | null;
  devices: DeviceItem[];
  onSendProductCard: (convoId: string, device: DeviceItem) => void;
  onConvertToPOS: (conversation: ChatConversation, selectedDevice?: DeviceItem) => void;
  staffOptions?: PancakeChatStaffOption[];
  currentUserId?: string;
  canAssignOthers?: boolean;
  workflowUpdating?: boolean;
  onUpdateWorkflow?: (conversationId: string, input: { assignedStaffId?: string; workflowStatus?: ChatWorkflowStatus; priority?: ChatPriority; nextFollowUpAt?: string | null }) => Promise<void> | void;
}

export const ChatCustomerSidebar: React.FC<ChatCustomerSidebarProps> = ({
  conversation,
  devices,
  onSendProductCard,
  onConvertToPOS,
  staffOptions = [],
  currentUserId = '',
  canAssignOthers = false,
  workflowUpdating = false,
  onUpdateWorkflow
}) => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  if (!conversation) return null;

  const inStockDevices = devices.filter(d => d.status === 'in_stock');
  const selectedDevice = inStockDevices.find(d => d.id === selectedDeviceId);

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 flex flex-col h-full space-y-4 shadow-2xs overflow-y-auto">
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

      {/* 3. CSKH ownership, stage and SLA */}
      {onUpdateWorkflow && (
        <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-3 text-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-black text-zinc-900"><Headphones className="h-3.5 w-3.5 text-[#ff4b16]" />Xử lý hội thoại</div>
            {conversation.firstResponseDueAt && !conversation.firstResponseAt && (
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${new Date(conversation.firstResponseDueAt).getTime() < Date.now() ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                <Clock3 className="mr-1 inline h-3 w-3" />{new Date(conversation.firstResponseDueAt).getTime() < Date.now() ? 'Đã trễ SLA' : 'Đang tính SLA'}
              </span>
            )}
          </div>

          {canAssignOthers ? (
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold text-zinc-500">Nhân viên phụ trách</span>
              <select disabled={workflowUpdating} value={conversation.assignedStaffId || ''} onChange={event => void onUpdateWorkflow(conversation.id, { assignedStaffId: event.target.value })} className="h-9 w-full rounded-xl border border-zinc-200 bg-white px-2.5 text-[11px] font-bold outline-none focus:border-[#ff4b16]">
                <option value="">Chưa phân công</option>
                {staffOptions.map(staff => <option key={staff.id} value={staff.id}>{staff.name} · {staff.role}</option>)}
              </select>
            </label>
          ) : conversation.assignedStaffId ? (
            <div className="rounded-lg bg-white px-2.5 py-2 text-[10px] font-bold text-zinc-700">Phụ trách: {conversation.assignedStaffName || conversation.assignedStaffId}</div>
          ) : (
            <button disabled={workflowUpdating || !currentUserId} onClick={() => void onUpdateWorkflow(conversation.id, { assignedStaffId: currentUserId, workflowStatus: 'OPEN' })} className="h-9 w-full rounded-xl bg-zinc-900 text-[11px] font-black text-white disabled:opacity-40">Tôi nhận xử lý</button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-[10px] font-bold text-zinc-500">Trạng thái</span>
              <select disabled={workflowUpdating} value={conversation.workflowStatus || 'NEW'} onChange={event => void onUpdateWorkflow(conversation.id, { workflowStatus: event.target.value as ChatWorkflowStatus })} className="h-9 w-full rounded-xl border border-zinc-200 bg-white px-2 text-[10px] font-bold outline-none focus:border-[#ff4b16]">
                <option value="NEW">Mới</option><option value="OPEN">Đang tư vấn</option><option value="WAITING_CUSTOMER">Chờ khách</option><option value="FOLLOW_UP">Chăm sóc lại</option><option value="WON">Đã chốt</option><option value="LOST">Không chốt</option><option value="CLOSED">Đã đóng</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-bold text-zinc-500">Ưu tiên</span>
              <select disabled={workflowUpdating} value={conversation.priority || 'NORMAL'} onChange={event => void onUpdateWorkflow(conversation.id, { priority: event.target.value as ChatPriority })} className="h-9 w-full rounded-xl border border-zinc-200 bg-white px-2 text-[10px] font-bold outline-none focus:border-[#ff4b16]">
                <option value="NORMAL">Bình thường</option><option value="HIGH">Ưu tiên</option><option value="URGENT">Khẩn</option>
              </select>
            </label>
          </div>

          {(conversation.workflowStatus || 'NEW') === 'FOLLOW_UP' && (
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold text-zinc-500">Lịch chăm sóc lại</span>
              <input type="datetime-local" disabled={workflowUpdating} value={conversation.nextFollowUpAt ? (() => { const date = new Date(conversation.nextFollowUpAt); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); })() : ''} onChange={event => void onUpdateWorkflow(conversation.id, { nextFollowUpAt: event.target.value ? new Date(event.target.value).toISOString() : null })} className="h-9 w-full rounded-xl border border-zinc-200 bg-white px-2 text-[10px] font-bold outline-none focus:border-[#ff4b16]" />
            </label>
          )}
        </div>
      )}

      {/* 4. Quick Device Quotation Picker */}
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

      {/* 5. POS Conversion Trigger */}
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
