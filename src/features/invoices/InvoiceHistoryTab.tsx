import React from 'react';
import { SalesInvoice } from '../../types';
import { Clock, CheckCircle2, RotateCcw, AlertTriangle, FileText } from 'lucide-react';

export interface InvoiceHistoryTabProps {
  invoice: SalesInvoice;
}

export const InvoiceHistoryTab: React.FC<InvoiceHistoryTabProps> = ({ invoice }) => {
  const events = [];

  // 1. Created Event
  events.push({
    id: 'evt-created',
    title: 'Tạo hóa đơn bán hàng thành công',
    time: invoice.createdAt || invoice.createdDate || 'N/A',
    actor: invoice.cashier || invoice.sellerName || 'Thu Ngân',
    type: 'SUCCESS',
    description: `Xuất hóa đơn mã ${invoice.invoiceCode || invoice.id} với tổng số tiền ${(invoice.finalAmount || 0).toLocaleString('vi-VN')}đ.`
  });

  // 2. Cancellation Event if cancelled
  if (invoice.status === 'cancelled') {
    events.push({
      id: 'evt-cancelled',
      title: 'Hóa đơn đã bị hủy & hoàn tiền',
      time: invoice.createdAt || 'N/A',
      actor: 'Admin / Quản Lý',
      type: 'DANGER',
      description: `Đã hoàn trả lại toàn bộ máy/phụ kiện về kho và thực hiện phiếu chi hoàn tiền khách hàng.`
    });
  }

  // 3. Custom History Logs if exist
  if (invoice.history && invoice.history.length > 0) {
    invoice.history.forEach((h, idx) => {
      events.push({
        id: `evt-hist-${idx}`,
        title: h.action || 'Nhật ký hóa đơn',
        time: h.timestamp || 'N/A',
        actor: h.performedBy || 'Hệ thống',
        type: 'INFO',
        description: h.details || ''
      });
    });
  }

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center space-x-2 text-zinc-800 font-bold">
        <Clock className="w-4 h-4 text-[#ff4b16]" />
        <span>Lịch Sử Thao Tác & Timeline Sự Kiện</span>
      </div>

      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200">
        {events.map((evt) => (
          <div key={evt.id} className="relative group">
            {/* Dot Indicator */}
            <div className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white ${
              evt.type === 'SUCCESS' ? 'bg-emerald-500 text-white' : evt.type === 'DANGER' ? 'bg-rose-500 text-white' : 'bg-blue-500 text-white'
            }`}>
              {evt.type === 'SUCCESS' ? <CheckCircle2 className="w-3 h-3" /> : evt.type === 'DANGER' ? <RotateCcw className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
            </div>

            <div className="bg-zinc-50 border border-zinc-200/80 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-zinc-900">{evt.title}</h5>
                <span className="text-[10px] font-mono text-zinc-400">{evt.time}</span>
              </div>
              <p className="text-zinc-600">{evt.description}</p>
              <div className="text-[10px] text-zinc-500 font-medium pt-1 border-t border-zinc-200/60">
                Thực hiện bởi: <span className="font-bold text-zinc-700">{evt.actor}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
