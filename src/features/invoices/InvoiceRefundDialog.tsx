import React, { useState } from 'react';
import { SalesInvoice, FundAccount } from '../../types';
import { Button } from '../../shared/ui/Button/Button';
import { RotateCcw, AlertTriangle, Wallet, CheckCircle2, X } from 'lucide-react';

export interface InvoiceRefundDialogProps {
  isOpen: boolean;
  invoice: SalesInvoice | null;
  funds: FundAccount[];
  isLoading?: boolean;
  onConfirmRefund: (invoice: SalesInvoice, refundFundId: string, reason: string) => Promise<void> | void;
  onClose: () => void;
}

export const InvoiceRefundDialog: React.FC<InvoiceRefundDialogProps> = ({
  isOpen,
  invoice,
  funds,
  isLoading = false,
  onConfirmRefund,
  onClose
}) => {
  const [reason, setReason] = useState('Khách đổi ý trả hàng hoàn tiền');
  const [selectedFundId, setSelectedFundId] = useState<string>('');

  if (!isOpen || !invoice) return null;

  const isLegacy = !invoice.paymentFundId;
  const originalFund = invoice.paymentFundId ? funds.find(f => f.id === invoice.paymentFundId) : null;
  const availableFunds = invoice.branchId
    ? funds.filter(f => f.branchId === invoice.branchId && f.isArchived !== true && f.isActive !== false)
    : [];

  const fundToUseId = isLegacy ? (selectedFundId || availableFunds[0]?.id || '') : (invoice.paymentFundId || '');
  const refundAmount = invoice.paidAmount || invoice.finalAmount || 0;

  const handleConfirm = async () => {
    if (!reason.trim()) {
      alert('Vui lòng nhập lý do hoàn tiền / hủy hóa đơn.');
      return;
    }
    if (!fundToUseId) {
      alert('Vui lòng chọn Quỹ hoàn tiền hợp lệ.');
      return;
    }

    await onConfirmRefund(invoice, fundToUseId, reason.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-zinc-100 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center space-x-2.5 text-rose-600">
            <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900">Hủy & Hoàn Tiền Hóa Đơn</h3>
              <p className="text-xs text-zinc-500 font-mono">Mã đơn: {invoice.invoiceCode || invoice.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Refund Amount Banner */}
        <div className="p-3.5 bg-rose-50/70 border border-rose-200/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-rose-900 block">Số tiền cần hoàn trả khách:</span>
            <span className="text-[11px] text-rose-600">Khách hàng: {invoice.customerName} ({invoice.customerPhone || 'N/A'})</span>
          </div>
          <span className="text-lg font-black font-mono text-rose-600">
            {refundAmount.toLocaleString('vi-VN')}đ
          </span>
        </div>

        {/* Fund Selection Guard */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-zinc-800">
            Quỹ / Tài Khoản Trừ Tiền Hoàn:
          </label>

          {isLegacy ? (
            <div className="space-y-2">
              <div className="p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl flex items-start space-x-2 text-amber-800 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Hóa đơn cũ (Legacy):</strong> Không có mã Quỹ gốc. Admin vui lòng chọn chính xác tài khoản xuất tiền hoàn.
                </p>
              </div>

              <select
                value={selectedFundId || availableFunds[0]?.id || ''}
                onChange={e => setSelectedFundId(e.target.value)}
                className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16] focus:bg-white"
              >
                {availableFunds.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name} (Số dư hiện tại: {f.currentBalance.toLocaleString('vi-VN')}đ)
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Wallet className="w-4 h-4 text-[#ff4b16]" />
                <span className="text-xs font-semibold text-zinc-800">
                  {originalFund ? originalFund.name : `Quỹ ID: ${invoice.paymentFundId}`}
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-mono">
                Quỹ gốc đã thu
              </span>
            </div>
          )}
        </div>

        {/* Reason Input */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-zinc-800">
            Lý do hoàn trả đơn hàng:
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Nhập lý do khách trả hàng hoặc hủy hóa đơn..."
            className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-rose-500 focus:bg-white resize-none"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-zinc-100">
          <Button variant="outline" size="md" onClick={onClose} disabled={isLoading}>
            Hủy Bỏ
          </Button>
          <Button
            variant="danger"
            size="md"
            isLoading={isLoading}
            onClick={handleConfirm}
            leftIcon={<RotateCcw className="w-4 h-4" />}
          >
            Xác Nhận Hoàn Tiền & Nhập Lại Kho
          </Button>
        </div>
      </div>
    </div>
  );
};
