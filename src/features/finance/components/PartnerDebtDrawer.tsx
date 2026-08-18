import React, { useState } from 'react';
import { Partner, FundAccount, PartnerDebtTransaction } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { Building2, User, Phone, Wallet, ArrowDownRight, ArrowUpRight, Clock, Plus, X } from 'lucide-react';

export interface PartnerDebtDrawerProps {
  partner: Partner | null;
  isOpen: boolean;
  onClose: () => void;
  funds: FundAccount[];
  onExecuteDebtRepayment: (partner: Partner, amount: number, fundId: string, note: string) => Promise<void> | void;
}

export const PartnerDebtDrawer: React.FC<PartnerDebtDrawerProps> = ({
  partner,
  isOpen,
  onClose,
  funds,
  onExecuteDebtRepayment
}) => {
  const [repayAmount, setRepayAmount] = useState<number>(0);
  const [selectedFundId, setSelectedFundId] = useState<string>(funds[0]?.id || '');
  const [repayNote, setRepayNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRepayFormOpen, setIsRepayFormOpen] = useState(false);

  if (!isOpen || !partner) return null;

  const isSupplier = partner.type === 'SUPPLIER' || partner.type === 'BOTH';
  const outstandingDebt = partner.outstandingDebt || 0;

  const handleExecute = async () => {
    if (repayAmount <= 0) {
      alert('Vui lòng nhập số tiền thanh toán hợp lệ lớn hơn 0đ.');
      return;
    }
    if (!selectedFundId) {
      alert('Vui lòng chọn Quỹ tiền thực hiện giao dịch.');
      return;
    }

    const fund = funds.find(f => f.id === selectedFundId);
    if (isSupplier && fund && fund.currentBalance < repayAmount) {
      alert(`Số dư quỹ "${fund.name}" hiện tại (${fund.currentBalance.toLocaleString('vi-VN')}đ) không đủ để thanh toán ${repayAmount.toLocaleString('vi-VN')}đ.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onExecuteDebtRepayment(
        partner,
        repayAmount,
        selectedFundId,
        repayNote.trim() || (isSupplier ? 'Thanh toán công nợ Nhà Cung Cấp' : 'Thu tiền công nợ khách hàng')
      );
      setIsRepayFormOpen(false);
      setRepayAmount(0);
      setRepayNote('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl border-l border-zinc-200 animate-in slide-in-from-right duration-300">
        {/* 1. Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 text-[#ff4b16] flex items-center justify-center font-bold">
              {isSupplier ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900 leading-snug">{partner.name}</h3>
              <p className="text-xs text-zinc-500 flex items-center space-x-1 font-mono">
                <Phone className="w-3 h-3 text-zinc-400" />
                <span>{partner.phone || 'Chưa cập nhật SĐT'}</span>
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

        {/* 2. Outstanding Debt Card */}
        <div className="p-5 bg-zinc-50/80 border-b border-zinc-100 space-y-3">
          <div className="p-4 bg-white border border-zinc-200/80 rounded-2xl shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-zinc-500 block">
                {isSupplier ? 'Công Nợ Phải Trả NCC' : 'Công Nợ Khách Phải Thu'}
              </span>
              <span className={`text-xl font-black font-mono mt-1 block ${
                outstandingDebt > 0 ? 'text-[#ff4b16]' : 'text-emerald-600'
              }`}>
                {outstandingDebt.toLocaleString('vi-VN')}đ
              </span>
            </div>

            {outstandingDebt > 0 && !isRepayFormOpen && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setRepayAmount(outstandingDebt);
                  setIsRepayFormOpen(true);
                }}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                {isSupplier ? 'Trả Nợ' : 'Thu Nợ'}
              </Button>
            )}
          </div>

          {/* Quick Repayment Form */}
          {isRepayFormOpen && (
            <div className="p-4 bg-orange-50/70 border border-orange-200/80 rounded-2xl space-y-3 text-xs">
              <div className="flex items-center justify-between font-bold text-zinc-900">
                <span>{isSupplier ? 'Thanh Toán Nợ NCC' : 'Thu Nợ Khách Hàng'}</span>
                <button
                  onClick={() => setIsRepayFormOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 text-[11px]"
                >
                  Đóng
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-600 font-medium block">Số tiền (VNĐ):</label>
                <input
                  type="number"
                  value={repayAmount}
                  onChange={e => setRepayAmount(parseInt(e.target.value, 10) || 0)}
                  className="w-full h-9 px-3 bg-white border border-orange-300 rounded-xl font-mono font-bold text-zinc-900 focus:outline-none focus:border-[#ff4b16]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-600 font-medium block">Quỹ tiền thực hiện:</label>
                <select
                  value={selectedFundId}
                  onChange={e => setSelectedFundId(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
                >
                  {funds.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} (Dư: {f.currentBalance.toLocaleString('vi-VN')}đ)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-600 font-medium block">Nội dung / Ghi chú:</label>
                <input
                  type="text"
                  placeholder="Ghi chú phiếu..."
                  value={repayNote}
                  onChange={e => setRepayNote(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-[#ff4b16]"
                />
              </div>

              <Button
                variant="primary"
                size="md"
                isLoading={isSubmitting}
                onClick={handleExecute}
                className="w-full mt-2"
              >
                Xác Nhận Giao Dịch
              </Button>
            </div>
          )}
        </div>

        {/* 3. Debt Transaction History Timeline */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 text-xs">
          <div className="flex items-center space-x-2 text-zinc-800 font-bold">
            <Clock className="w-4 h-4 text-[#ff4b16]" />
            <span>Lịch Sử Giao Dịch Công Nợ</span>
          </div>

          <div className="space-y-2">
            {!partner.debtTransactions || partner.debtTransactions.length === 0 ? (
              <div className="p-6 text-center text-zinc-400">
                Chưa có lịch sử biến động công nợ.
              </div>
            ) : (
              partner.debtTransactions.map(tx => (
                <div
                  key={tx.id}
                  className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-1.5 font-bold text-zinc-900">
                      <span>{tx.note || (tx.type === 'PAYMENT' ? 'Thanh toán nợ' : 'Phát sinh nợ')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono block">{tx.date}</span>
                  </div>

                  <span className={`font-mono font-bold ${
                    tx.type === 'PAYMENT' ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {tx.type === 'PAYMENT' ? '-' : '+'}{tx.amount.toLocaleString('vi-VN')}đ
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
