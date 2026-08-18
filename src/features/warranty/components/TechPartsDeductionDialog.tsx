import React, { useState } from 'react';
import { WarrantyTicket, SparePart, WarrantyTicketPart } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { Cpu, Plus, Trash2, CheckCircle2, ShieldCheck, DollarSign, X } from 'lucide-react';

export interface TechPartsDeductionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: WarrantyTicket | null;
  spareParts: SparePart[];
  onConfirmPartsAndComplete: (ticket: WarrantyTicket, parts: WarrantyTicketPart[], commission: number) => Promise<void> | void;
}

export const TechPartsDeductionDialog: React.FC<TechPartsDeductionDialogProps> = ({
  isOpen,
  onClose,
  ticket,
  spareParts,
  onConfirmPartsAndComplete
}) => {
  const [selectedParts, setSelectedParts] = useState<WarrantyTicketPart[]>([]);
  const [partIdInput, setPartIdInput] = useState<string>(spareParts[0]?.id || '');
  const [commissionAmount, setCommissionAmount] = useState<number>(100000);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !ticket) return null;

  const inStockParts = spareParts.filter(p => p.stockQuantity > 0);

  const handleAddPart = () => {
    const partObj = spareParts.find(p => p.id === partIdInput);
    if (!partObj) return;

    const existing = selectedParts.find(p => p.partId === partObj.id);
    if (existing) {
      setSelectedParts(prev =>
        prev.map(p => (p.partId === partObj.id ? { ...p, quantity: p.quantity + 1 } : p))
      );
    } else {
      setSelectedParts(prev => [
        ...prev,
        {
          partId: partObj.id,
          name: partObj.name,
          partCode: partObj.partCode,
          quantity: 1,
          costPrice: partObj.costPrice,
          retailPrice: partObj.sellPrice || partObj.costPrice
        }
      ]);
    }
  };

  const handleRemovePart = (partId: string) => {
    setSelectedParts(prev => prev.filter(p => p.partId !== partId));
  };

  const totalPartsCost = selectedParts.reduce((sum, p) => sum + p.costPrice * p.quantity, 0);

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await onConfirmPartsAndComplete(ticket, selectedParts, commissionAmount);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-zinc-100">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 text-[#ff4b16] flex items-center justify-center font-bold">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900">Xuất Linh Kiện & Nghiệm Thu KTV</h3>
              <p className="text-xs text-zinc-500 font-mono">Phiếu: {ticket.ticketNumber} ({ticket.model})</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Part Selection */}
          <div className="space-y-2">
            <label className="font-bold text-zinc-800 block">Chọn Linh Kiện Từ Kho Kỹ Thuật:</label>
            <div className="flex space-x-2">
              <select
                value={partIdInput}
                onChange={e => setPartIdInput(e.target.value)}
                className="flex-1 h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
              >
                {inStockParts.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Tồn: {p.stockQuantity} - Giá vốn: {p.costPrice.toLocaleString('vi-VN')}đ)
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={handleAddPart} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Thêm
              </Button>
            </div>
          </div>

          {/* Selected Parts List */}
          <div className="space-y-2">
            <span className="font-bold text-zinc-700 block">Linh Kiện Đã Dùng Cho Máy ({selectedParts.length})</span>
            <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
              {selectedParts.length === 0 ? (
                <div className="p-4 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl text-center text-zinc-400 text-[11px]">
                  Chưa gắn linh kiện (Có thể là sửa chữa phần cứng/phần mềm không thay thế)
                </div>
              ) : (
                selectedParts.map(p => (
                  <div
                    key={p.partId}
                    className="p-2.5 bg-zinc-50 border border-zinc-200/80 rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-zinc-800 block">{p.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Số lượng: {p.quantity} • Giá vốn: {(p.costPrice * p.quantity).toLocaleString('vi-VN')}đ
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemovePart(p.partId)}
                      className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Commission Amount */}
          <div className="p-3.5 bg-orange-50/70 border border-orange-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-800">Hoa Hồng Kỹ Thuật Viên ({ticket.technician}):</span>
              <input
                type="number"
                value={commissionAmount}
                onChange={e => setCommissionAmount(parseInt(e.target.value, 10) || 0)}
                className="w-32 h-8 px-2 bg-white border border-orange-300 rounded-lg text-right font-mono font-bold text-[#ff4b16]"
              />
            </div>
            <p className="text-[10px] text-zinc-500">
              Số tiền này sẽ được tự động cộng vào ví hoa hồng KTV sau khi đơn hoàn tất.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 flex items-center justify-end space-x-2.5">
          <Button variant="outline" size="md" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            variant="primary"
            size="md"
            isLoading={isSubmitting}
            onClick={handleSave}
            leftIcon={<CheckCircle2 className="w-4 h-4" />}
          >
            Nghiệm Thu Sửa Xong (Chuyển Ready)
          </Button>
        </div>
      </div>
    </div>
  );
};
