import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FundAccount, Partner } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { User, Phone, Wallet, CreditCard, Receipt, Loader2, CheckCircle2, ShieldCheck, Plus, QrCode, ArrowRight, Coins, Building, Search, Star, Check } from 'lucide-react';

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
  partners?: Partner[];
  onSelectCustomer?: (partner: Partner) => void;
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
  phoneInputRef,
  partners = [],
  onSelectCustomer
}) => {
  const [cashGiven, setCashGiven] = useState<number>(finalAmount);
  const [selectedFinanceCompany, setSelectedFinanceCompany] = useState('Home Credit');
  const [showQRModal, setShowQRModal] = useState(false);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  // Search existing customers
  const matchingCustomers = useMemo(() => {
    const qPhone = customerPhone.trim().toLowerCase();
    const qName = customerName.trim().toLowerCase();
    if (!qPhone && !qName) return [];
    if (qPhone.length < 2 && qName.length < 2) return [];

    return partners.filter(p => {
      const isCust = p.type === 'CUSTOMER' || p.type === 'BOTH' || p.category === 'CUSTOMER';
      const matchPhone = qPhone && p.phone?.toLowerCase().includes(qPhone);
      const matchName = qName && p.name?.toLowerCase().includes(qName);
      return isCust && (matchPhone || matchName);
    }).slice(0, 5);
  }, [partners, customerPhone, customerName]);

  // Check if exactly matched
  const matchedCustomer = useMemo(() => {
    if (!customerPhone) return null;
    return partners.find(p => p.phone === customerPhone.trim()) || null;
  }, [partners, customerPhone]);

  const handlePickCustomer = (cust: Partner) => {
    onChangeCustomerPhone(cust.phone || '');
    onChangeCustomerName(cust.name || '');
    setIsCustomerDropdownOpen(false);
    onSelectCustomer?.(cust);
  };

  const paymentMethods = [
    { id: 'Tiền mặt', label: 'Tiền Mặt', icon: Wallet },
    { id: 'Chuyển khoản QR', label: 'VietQR Pro', icon: QrCode },
    { id: 'Quẹt thẻ POS', label: 'Thẻ POS', icon: CreditCard },
    { id: 'Trả góp qua Cty Tài Chính (HD/Home/Mpos)', label: 'Trả Góp', icon: Receipt }
  ];

  const financeCompanies = ['Home Credit', 'HD Saison', 'Mpos 0%', 'Shinhan Finance'];

  const isCash = paymentMethod === 'Tiền mặt';
  const isVietQR = paymentMethod === 'Chuyển khoản QR';
  const isInstallment = paymentMethod.includes('Trả góp');
  const expectedDisbursement = Math.max(0, finalAmount - downPaymentAmount);

  // Quick tender suggestions
  const tenderSuggestions = useMemo(() => {
    if (finalAmount <= 0) return [];
    const exact = finalAmount;
    const round500k = Math.ceil(finalAmount / 500000) * 500000;
    const round1m = Math.ceil(finalAmount / 1000000) * 1000000;
    const plus500k = exact + 500000;

    const list = [
      { label: 'Đủ tiền', amount: exact }
    ];
    if (round500k > exact) {
      list.push({ label: `${(round500k / 1000).toLocaleString()}k`, amount: round500k });
    }
    if (round1m > round500k) {
      list.push({ label: `${(round1m / 1000000).toFixed(1)}Tr`, amount: round1m });
    } else {
      list.push({ label: `+500k`, amount: plus500k });
    }
    return list.slice(0, 4);
  }, [finalAmount]);

  const changeDue = Math.max(0, (cashGiven || finalAmount) - finalAmount);

  // Dynamic VietQR Techcombank URL simulation
  const vietQrUrl = `https://img.vietqr.io/image/970407-1903678999999-compact2.png?amount=${finalAmount}&addInfo=PhoneHouse%20POS%20${customerPhone || 'DonHang'}&accountName=PHONEHOUSE%20RETAIL`;

  return (
    <div className="bg-white p-3 sm:p-4 flex flex-col h-full space-y-3 overflow-hidden">
      {/* 1. Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-xl bg-orange-50 text-[#ff4b16] flex items-center justify-center font-black">
            <Coins className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900">Thu Tiền Khách Hàng</h3>
          </div>
        </div>
        <span className="text-[10px] font-mono text-zinc-400">
          Phím tắt: <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 font-bold border border-zinc-200">F9</kbd>
        </span>
      </div>

      {/* 2. Customer Information with Instant Auto-Complete Search */}
      <div className="space-y-1.5 relative">
        <div className="flex items-center justify-between text-xs font-bold text-zinc-700">
          <div className="flex items-center space-x-1.5">
            <span>Khách Hàng</span>
            {matchedCustomer ? (
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center space-x-0.5">
                <Star className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500" />
                <span>Khách Cũ ({(matchedCustomer as any).customerTier || (matchedCustomer as any).tier || 'Thành Viên'})</span>
              </span>
            ) : (customerPhone.trim() || customerName.trim()) ? (
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-orange-50 text-[#ff4b16] border border-orange-200">
                🆕 Khách Hàng Mới
              </span>
            ) : null}
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-zinc-400 font-mono">F4: SĐT</span>
            {onOpenCreateCustomerModal && (
              <button
                type="button"
                onClick={onOpenCreateCustomerModal}
                className="text-[11px] font-bold text-[#ff4b16] hover:underline flex items-center space-x-0.5 cursor-pointer"
                title="Tạo hồ sơ khách hàng mới"
              >
                <Plus className="w-3 h-3" />
                <span>Thêm mới</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 relative">
          {/* Phone Input with Live Dropdown */}
          <div className="relative">
            <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
            <input
              ref={phoneInputRef}
              type="tel"
              placeholder="SĐT khách hàng (F4)..."
              value={customerPhone}
              onFocus={() => setIsCustomerDropdownOpen(true)}
              onChange={e => {
                onChangeCustomerPhone(e.target.value);
                setIsCustomerDropdownOpen(true);
              }}
              className="w-full h-9 pl-8 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
            />
          </div>

          {/* Name Input */}
          <div className="relative">
            <User className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Tên khách hàng..."
              value={customerName}
              onFocus={() => setIsCustomerDropdownOpen(true)}
              onChange={e => {
                onChangeCustomerName(e.target.value);
                setIsCustomerDropdownOpen(true);
              }}
              className="w-full h-9 pl-8 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
            />
          </div>

          {/* Autocomplete Dropdown */}
          {isCustomerDropdownOpen && (matchingCustomers.length > 0 || customerName.length >= 2 || customerPhone.length >= 2) && (
            <div className="absolute top-10 left-0 right-0 z-30 bg-white rounded-2xl shadow-xl border border-zinc-200 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-64 overflow-y-auto">
              <div className="px-3 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
                <span>
                  {matchingCustomers.length > 0 
                    ? `Tìm thấy ${matchingCustomers.length} khách hàng trùng khớp:` 
                    : 'Không tìm thấy khách hàng cũ'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsCustomerDropdownOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 font-bold"
                >
                  ✕
                </button>
              </div>

              {matchingCustomers.map(cust => (
                <div
                  key={cust.id}
                  onClick={() => handlePickCustomer(cust)}
                  className="px-3 py-2 hover:bg-orange-50/70 transition-colors cursor-pointer flex items-center justify-between group border-b border-zinc-50 last:border-0"
                >
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-bold text-zinc-900 group-hover:text-[#ff4b16] transition-colors">{cust.name}</span>
                      <span className="text-[9px] font-bold font-mono px-1 rounded bg-zinc-100 text-zinc-600">{(cust as any).customerTier || (cust as any).tier || 'Thành Viên'}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-zinc-600">SĐT: {cust.phone}</span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-emerald-700 block">
                      {(cust as any).loyaltyPoints || (cust as any).accumulatedPoints ? `${(cust as any).loyaltyPoints || (cust as any).accumulatedPoints} điểm` : 'Đã từng mua'}
                    </span>
                    <span className="text-[9px] text-[#ff4b16] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                      Chọn khách này ↵
                    </span>
                  </div>
                </div>
              ))}

              {/* Explicit option to create a completely new customer with current typed info */}
              <div 
                onClick={() => setIsCustomerDropdownOpen(false)}
                className="p-2.5 bg-orange-50/80 hover:bg-orange-100 border-t border-orange-200/80 cursor-pointer flex items-center justify-between transition-colors text-[#ff4b16]"
              >
                <div className="flex items-center space-x-1.5">
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span className="text-xs font-bold">
                    Tạo mới khách hàng "{customerName.trim() || 'Mới'}" với SĐT {customerPhone.trim() || 'này'}
                  </span>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-[#ff4b16] text-white px-2 py-0.5 rounded-md">
                  Tạo Mới
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Payment Method Tabs */}
      <div className="space-y-1.5">
        <span className="text-xs font-bold text-zinc-700 block">Phương Thức Thanh Toán</span>
        <div className="grid grid-cols-2 gap-1.5">
          {paymentMethods.map(pm => {
            const Icon = pm.icon;
            const isSelected = paymentMethod === pm.id;

            return (
              <button
                key={pm.id}
                type="button"
                onClick={() => onChangePaymentMethod(pm.id)}
                className={`flex items-center space-x-2 p-2.5 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-orange-50 to-amber-50/80 border-[#ff4b16] text-[#ff4b16] ring-1 ring-[#ff4b16] shadow-2xs'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{pm.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Cash Tender Fast Calculator (If Cash) */}
      {isCash && (
        <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-zinc-700">Phím Mệnh Giá Nhanh:</span>
            <span className="text-[10px] text-zinc-400 font-mono">Tự tính tiền thối</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {tenderSuggestions.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCashGiven(item.amount)}
                className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer font-mono ${
                  cashGiven === item.amount
                    ? 'bg-[#ff4b16] text-white border-[#ff4b16] shadow-2xs'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:border-orange-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {changeDue > 0 && (
            <div className="pt-2 border-t border-zinc-200 flex justify-between items-center text-xs">
              <span className="font-bold text-emerald-700">Tiền thối lại khách:</span>
              <span className="text-sm font-black font-mono text-emerald-700">
                {changeDue.toLocaleString('vi-VN')} đ
              </span>
            </div>
          )}
        </div>
      )}

      {/* VietQR Fast Preview Link (If VietQR) */}
      {isVietQR && (
        <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-50/70 to-indigo-50/50 border border-blue-200/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <QrCode className="w-7 h-7 text-blue-600" />
            <div>
              <span className="text-xs font-black text-blue-900 block">Mã VietQR Động Techcombank</span>
              <span className="text-[10px] text-blue-600 font-mono">Tự điền số tiền: {finalAmount.toLocaleString('vi-VN')}đ</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowQRModal(true)}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
          >
            Hiện QR
          </button>
        </div>
      )}

      {/* 5. Installment Partner Details (If Installment) */}
      {isInstallment && (
        <div className="p-3.5 bg-orange-50/70 border border-orange-200 rounded-2xl space-y-2.5 text-xs">
          <span className="font-bold text-zinc-800 block">Công Ty Tài Chính Đối Tác:</span>
          <div className="grid grid-cols-2 gap-1.5">
            {financeCompanies.map(fc => (
              <button
                key={fc}
                type="button"
                onClick={() => setSelectedFinanceCompany(fc)}
                className={`p-2 rounded-xl text-left border font-semibold text-[11px] transition-all cursor-pointer ${
                  selectedFinanceCompany === fc
                    ? 'bg-orange-500 text-white border-orange-500 shadow-2xs font-bold'
                    : 'bg-white text-zinc-700 border-orange-200'
                }`}
              >
                {fc}
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-orange-200/60 space-y-1.5">
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
                className="w-32 text-right font-mono font-black px-2.5 py-1 bg-white border border-orange-300 rounded-xl text-xs"
              />
            </div>

            <div className="flex justify-between text-zinc-600 text-[11px]">
              <span>Chờ {selectedFinanceCompany} giải ngân:</span>
              <span className="font-mono font-bold text-zinc-900">{expectedDisbursement.toLocaleString('vi-VN')} đ</span>
            </div>
          </div>
        </div>
      )}

      {/* 6. Target Fund Account Picker */}
      <div className="space-y-1.5">
        <span className="text-xs font-bold text-zinc-700 block">Két Tiền / Quỹ Thu Ngân Nhận Tiền</span>
        <select
          value={selectedFundId}
          onChange={e => onSelectFundId(e.target.value)}
          className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs font-bold text-zinc-800 focus:outline-none focus:border-[#ff4b16] focus:bg-white transition-all"
        >
          {funds.map(f => {
            const balance = f.currentBalance ?? (f as any).balance ?? 0;
            return (
              <option key={f.id} value={f.id}>
                {f.name} (Số dư: {balance.toLocaleString('vi-VN')} đ)
              </option>
            );
          })}
        </select>
      </div>

      {/* 7. Checkout Action Button (F9) */}
      <div className="pt-2 mt-auto">
        <Button
          variant="primary"
          size="lg"
          isLoading={isProcessing}
          onClick={onExecuteCheckout}
          leftIcon={<Receipt className="w-5 h-5" />}
          className="w-full font-black text-sm shadow-xl shadow-orange-500/25 h-12 rounded-2xl cursor-pointer"
        >
          {isProcessing ? 'Đang Xử Lý Xuất Đơn...' : 'XÁC NHẬN XUẤT ĐƠN (F9)'}
        </Button>
      </div>

      {/* 8. VietQR Dynamic Modal */}
      {showQRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full text-center space-y-3 shadow-2xl border border-zinc-200">
            <h3 className="text-sm font-black text-zinc-900">Quét Mã VietQR Chuyển Khoản</h3>
            <p className="text-xs text-zinc-500 font-mono">
              Techcombank • 1903678999999 • PhoneHouse Retail
            </p>

            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl flex justify-center">
              <img
                src={vietQrUrl}
                alt="VietQR Code"
                className="w-56 h-56 object-contain rounded-xl"
                onError={(e) => {
                  // Fallback visual if offline
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

            <div className="font-mono font-black text-base text-[#ff4b16]">
              {finalAmount.toLocaleString('vi-VN')} đ
            </div>

            <button
              onClick={() => setShowQRModal(false)}
              className="w-full py-2.5 bg-zinc-900 text-white font-bold text-xs rounded-2xl hover:bg-black transition-colors cursor-pointer"
            >
              Đóng Mã QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
