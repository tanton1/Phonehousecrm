import React from 'react';
import { FundAccount, Partner } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { User, Phone, Wallet, CreditCard, Receipt, Loader2, CheckCircle2, ShieldCheck, Plus } from 'lucide-react';

export interface PaymentPanelProps {
  customerName: string;
  customerPhone: string;
  onChangeCustomerName: (name: string) => void;
  onChangeCustomerPhone: (phone: string) => void;
  onOpenCreateCustomerModal?: () => void;
  paymentMethod: string;
  onChangePaymentMethod: (method: any) => void;
  funds: FundAccount[];
  selectedFundId: string;
  onSelectFundId: (fundId: string) => void;
  finalAmount: number;
  downPaymentAmount: number;
  onChangeDownPayment: (amount: number) => void;
  isProcessing: boolean;
  onExecuteCheckout: () => void;
  phoneInputRef?: React.RefObject<HTMLInputElement | null>;
}

export const PaymentPanel: React.FC<PaymentPanelProps> = ({
  customerName,
  customerPhone,
  onChangeCustomerName,
  onChangeCustomerPhone,
  onOpenCreateCustomerModal,
  paymentMethod,
  onChangePaymentMethod,
  funds,
  selectedFundId,
  onSelectFundId,
  finalAmount,
  downPaymentAmount,
  onChangeDownPayment,
  isProcessing,
  onExecuteCheckout,
  phoneInputRef
}) => {
  const paymentMethods = [
    { id: 'Tiền mặt', label: 'Tiền Mặt', icon: Wallet },
    { id: 'Chuyển khoản QR', label: 'VietQR', icon: CreditCard },
    { id: 'Quẹt thẻ POS', label: 'Thẻ POS', icon: CreditCard },
    { id: 'Trả góp qua Cty Tài Chính (HD/Home/Mpos)', label: 'Trả Góp', icon: Receipt }
  ];

  const isInstallment = paymentMethod.includes('Trả góp');
  const expectedDisbursement = Math.max(0, finalAmount - downPaymentAmount);

  return (
    <div className="bg-white border border-zinc-200/80 rounded-2xl p-3.5 sm:p-4 flex flex-col h-full shadow-2xs space-y-4">
      {/* 1. Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">Thông Tin Thu Tiền</h3>
        <span className="text-[10px] font-mono text-zinc-400">
          Phím tắt: <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 font-bold border border-zinc-200">F9</kbd>
        </span>
      </div>

      {/* 2. Customer Information */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-zinc-700">
          <span>Khách Hàng</span>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-zinc-400 font-mono">F4: SĐT</span>
            {onOpenCreateCustomerModal && (
              <button
                type="button"
                onClick={onOpenCreateCustomerModal}
                className="text-[11px] font-bold text-[#ff4b16] hover:underline flex items-center space-x-0.5 cursor-pointer"
                title="Tạo hồ sơ khách hàng mới"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm mới</span>
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
          <input
            ref={phoneInputRef}
            type="tel"
            placeholder="Số điện thoại khách hàng (F4)..."
            value={customerPhone}
            onChange={e => onChangeCustomerPhone(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
          />
        </div>

        <div className="relative">
          <User className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Tên khách hàng (tùy chọn)..."
            value={customerName}
            onChange={e => onChangeCustomerName(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
          />
        </div>
      </div>

      {/* 3. Payment Method Tabs */}
      <div className="space-y-1.5">
        <span className="text-xs font-bold text-zinc-700 block">Hình Thức Thanh Toán</span>
        <div className="grid grid-cols-2 gap-1.5">
          {paymentMethods.map(pm => {
            const Icon = pm.icon;
            const isSelected = paymentMethod === pm.id;

            return (
              <button
                key={pm.id}
                type="button"
                onClick={() => onChangePaymentMethod(pm.id)}
                className={`flex items-center space-x-2 p-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-orange-50 border-[#ff4b16] text-[#ff4b16] ring-1 ring-[#ff4b16]'
                    : 'bg-zinc-50/70 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{pm.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Target Fund Account Picker */}
      {/* 4. Target Fund Account Picker */}
      <div className="space-y-1.5">
        <span className="text-xs font-bold text-zinc-700 block">Nguồn Tiền / Quỹ Thu</span>
        <select
          value={selectedFundId}
          onChange={e => onSelectFundId(e.target.value)}
          className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16] focus:bg-white transition-all"
        >
          {funds.map(f => {
            const balance = f.currentBalance ?? (f as any).balance ?? 0;
            return (
              <option key={f.id} value={f.id}>
                {f.name} (Số dư: {balance.toLocaleString('vi-VN')}đ)
              </option>
            );
          })}
        </select>
      </div>

      {/* 5. Installment Downpayment Details (If Installment) */}
      {isInstallment && (
        <div className="p-3 bg-orange-50/70 border border-orange-200 rounded-xl space-y-2 text-xs">
          <div className="flex justify-between items-center font-bold text-zinc-800">
            <span>Khách trả trước:</span>
            <input
              type="text"
              inputMode="numeric"
              value={downPaymentAmount.toLocaleString('vi-VN')}
              onChange={e => {
                const val = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0;
                onChangeDownPayment(val);
              }}
              className="w-28 text-right font-mono font-bold px-2 py-1 bg-white border border-orange-300 rounded-lg text-xs"
            />
          </div>

          <div className="flex justify-between text-zinc-600 text-[11px]">
            <span>Chờ đối tác giải ngân:</span>
            <span className="font-mono font-bold text-zinc-900">{expectedDisbursement.toLocaleString('vi-VN')}đ</span>
          </div>
        </div>
      )}

      {/* 6. Checkout Action Button (F9) */}
      <div className="pt-2 mt-auto">
        <Button
          variant="primary"
          size="lg"
          isLoading={isProcessing}
          onClick={onExecuteCheckout}
          leftIcon={<Receipt className="w-4 h-4" />}
          className="w-full font-bold shadow-md shadow-orange-500/20"
        >
          {isProcessing ? 'Đang Xuất Đơn...' : 'Xác Nhận Xuất Đơn (F9)'}
        </Button>
      </div>
    </div>
  );
};
