import React, { useState } from 'react';
import { FundAccount, StoreBranch, StaffMember, CashTransaction, CashReceiptCategory, CashPaymentCategory } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { Wallet, Plus, AlertCircle, X, ArrowDownRight, ArrowUpRight } from 'lucide-react';

export interface CreateCashTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  funds: FundAccount[];
  branches: StoreBranch[];
  initialType?: 'RECEIPT' | 'PAYMENT';
  currentUser?: StaffMember | null;
  onConfirmTransaction: (tx: CashTransaction, fundId: string, updatedBalance: number) => Promise<void> | void;
}

export const CreateCashTransactionModal: React.FC<CreateCashTransactionModalProps> = ({
  isOpen,
  onClose,
  funds,
  branches,
  initialType = 'RECEIPT',
  currentUser,
  onConfirmTransaction
}) => {
  const [type, setType] = useState<'RECEIPT' | 'PAYMENT'>(initialType);
  const [amount, setAmount] = useState<number>(0);
  const [fundId, setFundId] = useState<string>(funds[0]?.id || '');
  const [category, setCategory] = useState<string>(
    initialType === 'RECEIPT' ? 'OTHER_INCOME' : 'OTHER_EXPENSE'
  );
  const [partnerName, setPartnerName] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const selectedFund = funds.find(f => f.id === fundId) || funds[0];

  const receiptCategories: { id: CashReceiptCategory; label: string }[] = [
    { id: 'SALES_REVENUE', label: 'Thu tiền bán hàng / POS' },
    { id: 'CUSTOMER_DEBT_COLLECT', label: 'Thu tiền nợ khách hàng' },
    { id: 'TRADEIN_DIFF_COLLECT', label: 'Thu tiền chênh lệch Trade-in' },
    { id: 'DEPOSIT', label: 'Thu tiền đặt cọc giữ máy' },
    { id: 'REPAIR_SERVICE', label: 'Thu tiền sửa chữa / bảo hành' },
    { id: 'CAPITAL_INVEST', label: 'Bổ sung vốn / Quỹ dự phòng' },
    { id: 'SUPPLIER_REFUND', label: 'NCC hoàn tiền hàng' },
    { id: 'OTHER_INCOME', label: 'Thu nhập khác' }
  ];

  const paymentCategories: { id: CashPaymentCategory; label: string }[] = [
    { id: 'INVENTORY_PURCHASE', label: 'Chi nhập hàng iPhone / Máy' },
    { id: 'SUPPLIER_DEBT_PAY', label: 'Chi thanh toán nợ NCC' },
    { id: 'STORE_RENT', label: 'Chi tiền thuê mặt bằng' },
    { id: 'SALARY_BONUS', label: 'Chi lương / thưởng / hoa hồng' },
    { id: 'MARKETING_ADS', label: 'Chi quảng cáo Ads' },
    { id: 'UTILITIES', label: 'Chi điện / nước / internet' },
    { id: 'WARRANTY_PARTS', label: 'Chi mua linh kiện sửa chữa' },
    { id: 'CUSTOMER_REFUND', label: 'Chi hoàn tiền đổi trả' },
    { id: 'OTHER_EXPENSE', label: 'Chi phí khác' }
  ];

  const handleTypeChange = (newType: 'RECEIPT' | 'PAYMENT') => {
    setType(newType);
    setCategory(newType === 'RECEIPT' ? 'OTHER_INCOME' : 'OTHER_EXPENSE');
  };

  const handleSave = async () => {
    if (amount <= 0) {
      alert('Vui lòng nhập số tiền lớn hơn 0đ.');
      return;
    }
    if (!selectedFund) {
      alert('Vui lòng chọn Quỹ tiền thực hiện.');
      return;
    }

    // Guard negative balance for payment
    if (type === 'PAYMENT' && selectedFund.currentBalance < amount) {
      alert(`Số dư quỹ "${selectedFund.name}" hiện tại (${selectedFund.currentBalance.toLocaleString('vi-VN')}đ) không đủ để chi ${amount.toLocaleString('vi-VN')}đ.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const codePrefix = type === 'RECEIPT' ? 'PT' : 'PC';
      const txCode = `${codePrefix}-${new Date().toISOString().slice(2, 7).replace('-', '')}-${Date.now().toString().slice(-4)}`;
      const updatedBalance = type === 'RECEIPT'
        ? selectedFund.currentBalance + amount
        : selectedFund.currentBalance - amount;

      const newTx: CashTransaction = {
        id: `TX-${Date.now()}`,
        code: txCode,
        type,
        category: category as any,
        categoryName: (type === 'RECEIPT' ? receiptCategories : paymentCategories).find(c => c.id === category)?.label || category,
        amount,
        fundId: selectedFund.id,
        fundType: selectedFund.type,
        fundName: selectedFund.name,
        date: new Date().toISOString().split('T')[0],
        partnerName: partnerName.trim() || undefined,
        partnerPhone: partnerPhone.trim() || undefined,
        status: 'COMPLETED',
        notes: notes.trim() || undefined,
        creator: currentUser?.displayName || 'Thu Ngân'
      };

      await onConfirmTransaction(newTx, selectedFund.id, updatedBalance);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-zinc-100 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
              type === 'RECEIPT' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}>
              {type === 'RECEIPT' ? <ArrowDownRight className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900">
                {type === 'RECEIPT' ? 'Lập Phiếu Thu Tiền' : 'Lập Phiếu Chi Tiền'}
              </h3>
              <p className="text-xs text-zinc-500">Sổ Quỹ Thu Chi PhoneHouse</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Type Toggle */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-xl text-xs font-bold">
          <button
            type="button"
            onClick={() => handleTypeChange('RECEIPT')}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              type === 'RECEIPT' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            + Thu Tiền Vào Quỹ
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('PAYMENT')}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              type === 'PAYMENT' ? 'bg-rose-600 text-white shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            - Chi Tiền Ra Quỹ
          </button>
        </div>

        {/* Form Body */}
        <div className="space-y-3 text-xs">
          {/* Amount */}
          <div className="space-y-1">
            <label className="font-bold text-zinc-800 block">Số Tiền (VNĐ):</label>
            <input
              type="number"
              placeholder="Nhập số tiền..."
              value={amount || ''}
              onChange={e => setAmount(parseInt(e.target.value, 10) || 0)}
              className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-mono font-bold text-zinc-900 focus:bg-white focus:outline-none focus:border-[#ff4b16]"
            />
          </div>

          {/* Fund Account Picker */}
          <div className="space-y-1">
            <label className="font-bold text-zinc-800 block">Quỹ / Tài Khoản Thực Hiện:</label>
            <select
              value={fundId}
              onChange={e => setFundId(e.target.value)}
              className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
            >
              {funds.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name} (Số dư: {f.currentBalance.toLocaleString('vi-VN')}đ)
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div className="space-y-1">
            <label className="font-bold text-zinc-800 block">Danh Mục Thu/Chi:</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
            >
              {(type === 'RECEIPT' ? receiptCategories : paymentCategories).map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Partner Info */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="font-bold text-zinc-800 block">Tên Đối Tác / Người Nộp:</label>
              <input
                type="text"
                placeholder="Tên đối tác..."
                value={partnerName}
                onChange={e => setPartnerName(e.target.value)}
                className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-[#ff4b16]"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-zinc-800 block">Số Điện Thoại:</label>
              <input
                type="tel"
                placeholder="09..."
                value={partnerPhone}
                onChange={e => setPartnerPhone(e.target.value)}
                className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono focus:outline-none focus:border-[#ff4b16]"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="font-bold text-zinc-800 block">Ghi Chú:</label>
            <input
              type="text"
              placeholder="Chi tiết nội dung phiếu..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-[#ff4b16]"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-zinc-100">
          <Button variant="outline" size="md" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            variant={type === 'RECEIPT' ? 'primary' : 'danger'}
            size="md"
            isLoading={isSubmitting}
            onClick={handleSave}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Lưu {type === 'RECEIPT' ? 'Phiếu Thu' : 'Phiếu Chi'}
          </Button>
        </div>
      </div>
    </div>
  );
};
