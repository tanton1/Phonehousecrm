import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FundAccount, Partner } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { User, Phone, Wallet, CreditCard, Receipt, Loader2, CheckCircle2, ShieldCheck, Plus, QrCode, ArrowRight, Coins, Building, Search, Star, Check } from 'lucide-react';

export interface SplitPaymentData {
  isSplitMode: boolean;
  splitCash: number;
  splitCashFundId: string;
  splitBank1: number;
  splitBankFundId1: string;
  splitBank2: number;
  splitBankFundId2: string;
  splitCard: number;
  splitCardFundId: string;
  splitDebt: number;
}

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
  onExecuteCheckout: (splitData?: SplitPaymentData) => void;
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

  // Group funds by type for intuitive identification
  const cashFunds = useMemo(() => funds.filter(f => f.type === 'CASH' || f.name.toLowerCase().includes('tiền mặt') || f.name.toLowerCase().includes('két')), [funds]);
  const bankFunds = useMemo(() => funds.filter(f => f.type === 'BANK' || f.name.toLowerCase().includes('ngân hàng') || f.bankName || f.accountNumber), [funds]);
  const cardFunds = useMemo(() => funds.filter(f => f.type === 'CARD' || f.name.toLowerCase().includes('pos') || f.name.toLowerCase().includes('thẻ')), [funds]);

  // Multi-Payment / Split Tender State (Supports 2 separate bank accounts!)
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
  const [splitCash, setSplitCash] = useState<number>(0);
  const [splitCashFundId, setSplitCashFundId] = useState<string>(() => cashFunds[0]?.id || funds[0]?.id || '');
  
  const [splitBank1, setSplitBank1] = useState<number>(finalAmount);
  const [splitBankFundId1, setSplitBankFundId1] = useState<string>(() => bankFunds[0]?.id || funds[0]?.id || '');
  
  const [hasSecondBankTransfer, setHasSecondBankTransfer] = useState<boolean>(false);
  const [splitBank2, setSplitBank2] = useState<number>(0);
  const [splitBankFundId2, setSplitBankFundId2] = useState<string>(() => bankFunds[1]?.id || bankFunds[0]?.id || funds[0]?.id || '');
  
  const [splitCard, setSplitCard] = useState<number>(0);
  const [splitCardFundId, setSplitCardFundId] = useState<string>(() => cardFunds[0]?.id || funds[0]?.id || '');
  
  const [splitDebt, setSplitDebt] = useState<number>(0);

  // Auto sync when finalAmount changes
  useEffect(() => {
    setCashGiven(finalAmount);
    if (!isSplitMode) {
      setSplitBank1(finalAmount);
      setSplitBank2(0);
      setSplitCash(0);
      setSplitCard(0);
      setSplitDebt(0);
    }
  }, [finalAmount, isSplitMode]);

  // Ensure default fund selections when funds are loaded
  useEffect(() => {
    if (!selectedFundId && funds.length > 0) {
      onSelectFundId(funds[0].id);
    }
    if (!splitCashFundId && cashFunds.length > 0) setSplitCashFundId(cashFunds[0].id);
    if (!splitBankFundId1 && bankFunds.length > 0) setSplitBankFundId1(bankFunds[0].id);
    if (!splitBankFundId2 && bankFunds.length > 1) setSplitBankFundId2(bankFunds[1].id);
  }, [funds, cashFunds, bankFunds, selectedFundId, splitCashFundId, splitBankFundId1, splitBankFundId2, onSelectFundId]);

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

  // Split sum calculations
  const totalSplit = splitCash + splitBank1 + (hasSecondBankTransfer ? splitBank2 : 0) + splitCard + splitDebt;
  const splitDiff = totalSplit - finalAmount;

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

  // Find active bank fund for VietQR
  const activeBankFund = funds.find(f => f.id === (isSplitMode ? splitBankFundId1 : selectedFundId)) || bankFunds[0] || funds[0];
  const vietQrAccount = activeBankFund?.accountNumber || '1903678999999';
  const vietQrBankName = activeBankFund?.bankName || 'Techcombank';

  // Dynamic VietQR Techcombank URL simulation
  const vietQrUrl = `https://img.vietqr.io/image/970407-${vietQrAccount}-compact2.png?amount=${isSplitMode ? splitBank1 : finalAmount}&addInfo=PhoneHouse%20POS%20${customerPhone || 'DonHang'}&accountName=PHONEHOUSE%20RETAIL`;

  const handleSubmitCheckout = () => {
    if (isSplitMode) {
      if (splitDiff !== 0) {
        alert(`Tổng tiền các phương thức (${totalSplit.toLocaleString('vi-VN')} đ) chưa khớp với tổng đơn hàng (${finalAmount.toLocaleString('vi-VN')} đ)!`);
        return;
      }
      if (splitCash > 0 && !splitCashFundId) {
        alert('Vui lòng chọn Két tiền mặt nhận tiền cho khoản thanh toán tiền mặt!');
        return;
      }
      if (splitBank1 > 0 && !splitBankFundId1) {
        alert('Vui lòng chọn Tài khoản ngân hàng nhận tiền cho khoản chuyển khoản 1!');
        return;
      }
      if (hasSecondBankTransfer && splitBank2 > 0 && !splitBankFundId2) {
        alert('Vui lòng chọn Tài khoản ngân hàng nhận tiền cho khoản chuyển khoản 2!');
        return;
      }
      if (splitCard > 0 && !splitCardFundId) {
        alert('Vui lòng chọn Tài khoản POS nhận tiền cho khoản cà thẻ!');
        return;
      }
      onExecuteCheckout({
        isSplitMode: true,
        splitCash,
        splitCashFundId,
        splitBank1,
        splitBankFundId1,
        splitBank2: hasSecondBankTransfer ? splitBank2 : 0,
        splitBankFundId2: hasSecondBankTransfer ? splitBankFundId2 : '',
        splitCard,
        splitCardFundId,
        splitDebt
      });
    } else {
      if (!selectedFundId) {
        alert('BẮT BUỘC: Vui lòng chọn tài khoản ngân hàng hoặc két tiền mặt nhận tiền!');
        return;
      }
      onExecuteCheckout({
        isSplitMode: false,
        splitCash: isCash ? finalAmount : 0,
        splitCashFundId: isCash ? selectedFundId : '',
        splitBank1: isVietQR ? finalAmount : 0,
        splitBankFundId1: isVietQR ? selectedFundId : '',
        splitBank2: 0,
        splitBankFundId2: '',
        splitCard: paymentMethod.includes('thẻ') ? finalAmount : 0,
        splitCardFundId: paymentMethod.includes('thẻ') ? selectedFundId : '',
        splitDebt: isInstallment ? Math.max(0, finalAmount - downPaymentAmount) : 0
      });
    }
  };

  return (
    <div className="bg-white p-3 sm:p-4 flex flex-col h-full space-y-3 overflow-y-auto pb-32 lg:pb-6">
      {/* 1. Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-xl bg-orange-50 text-[#ff4b16] flex items-center justify-center font-bold">
            <Coins className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">Thu Tiền & Định Danh Quỹ</h3>
          </div>
        </div>
        <span className="text-[10px] font-mono text-zinc-400">
          Phím tắt: <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 font-semibold border border-zinc-200">F9</kbd>
        </span>
      </div>

      {/* 2. Customer Information with Instant Auto-Complete Search */}
      <div className="space-y-1.5 relative">
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
          <div className="flex items-center space-x-1.5">
            <span>Khách Hàng</span>
            {matchedCustomer ? (
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center space-x-0.5">
                <Star className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500" />
                <span>Khách Cũ ({(matchedCustomer as any).customerTier || (matchedCustomer as any).tier || 'Thành Viên'})</span>
              </span>
            ) : (customerPhone.trim() || customerName.trim()) ? (
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-md bg-orange-50 text-[#ff4b16] border border-orange-200">
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
                className="text-[11px] font-semibold text-[#ff4b16] hover:underline flex items-center space-x-0.5 cursor-pointer"
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
              className="w-full h-9 pl-8 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-semibold focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
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
              className="w-full h-9 pl-8 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
            />
          </div>

          {/* Autocomplete Dropdown */}
          {isCustomerDropdownOpen && (matchingCustomers.length > 0 || customerName.length >= 2 || customerPhone.length >= 2) && (
            <div className="absolute top-10 left-0 right-0 z-30 bg-white rounded-2xl shadow-xl border border-zinc-200 py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-64 overflow-y-auto">
              <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
                <span>
                  {matchingCustomers.length > 0 
                    ? `Tìm thấy ${matchingCustomers.length} khách hàng:` 
                    : 'Không tìm thấy khách hàng cũ'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsCustomerDropdownOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 font-bold cursor-pointer"
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
                      <span className="text-xs font-semibold text-zinc-800 group-hover:text-[#ff4b16] transition-colors">{cust.name}</span>
                      <span className="text-[9px] font-semibold font-mono px-1 rounded bg-zinc-100 text-zinc-600">{(cust as any).customerTier || (cust as any).tier || 'Thành Viên'}</span>
                    </div>
                    <span className="text-[10px] font-mono font-medium text-zinc-500">SĐT: {cust.phone}</span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-semibold text-emerald-700 block">
                      {(cust as any).loyaltyPoints || (cust as any).accumulatedPoints ? `${(cust as any).loyaltyPoints || (cust as any).accumulatedPoints} điểm` : 'Đã từng mua'}
                    </span>
                    <span className="text-[9px] text-[#ff4b16] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                      Chọn khách này ↵
                    </span>
                  </div>
                </div>
              ))}

              <div 
                onClick={() => setIsCustomerDropdownOpen(false)}
                className="p-2.5 bg-orange-50/80 hover:bg-orange-100 border-t border-orange-200/80 cursor-pointer flex items-center justify-between transition-colors text-[#ff4b16]"
              >
                <div className="flex items-center space-x-1.5">
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span className="text-xs font-semibold">
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

      {/* 3. Payment Mode Toggle: Single vs Multi-Method (Split Payment) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-700">Hình Thức Thanh Toán</span>
          <button
            type="button"
            onClick={() => setIsSplitMode(!isSplitMode)}
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg transition-all cursor-pointer flex items-center space-x-1 ${
              isSplitMode
                ? 'bg-[#ff4b16] text-white shadow-xs'
                : 'bg-orange-50 text-[#ff4b16] border border-orange-200 hover:bg-orange-100'
            }`}
          >
            <span>🔀 Kết hợp nhiều hình thức</span>
          </button>
        </div>

        {/* MULTI-PAYMENT / SPLIT TENDER VIEW (With multiple bank accounts) */}
        {isSplitMode ? (
          <div className="p-3 bg-gradient-to-br from-orange-50/40 via-white to-orange-50/20 border border-orange-200/80 rounded-2xl space-y-3">
            <div className="text-[11px] font-semibold text-zinc-600 flex items-center justify-between">
              <span>Phân bổ số tiền & chọn đúng tài khoản nhận:</span>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => {
                    const half = Math.round(finalAmount / 2);
                    setSplitCash(half);
                    setSplitBank1(finalAmount - half);
                    setSplitBank2(0);
                    setSplitCard(0);
                    setSplitDebt(0);
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold cursor-pointer"
                >
                  50/50 (Tiền + CK)
                </button>
              </div>
            </div>

            {/* Split Method 1: Cash + Mandatory Cash Fund */}
            <div className="p-2 bg-white rounded-xl border border-zinc-200/90 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-1.5 text-zinc-700 w-28 shrink-0">
                  <Wallet className="w-3.5 h-3.5 text-orange-600" />
                  <span className="font-semibold">Tiền mặt:</span>
                </div>
                <input
                  type="number"
                  value={splitCash || ''}
                  onChange={e => setSplitCash(Number(e.target.value) || 0)}
                  placeholder="0 đ"
                  className="flex-1 h-8 px-2.5 text-right bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-mono font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16] focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSplitCash(finalAmount);
                    setSplitBank1(0);
                    setSplitBank2(0);
                    setSplitCard(0);
                    setSplitDebt(0);
                  }}
                  className="px-2 py-1 text-[10px] bg-zinc-100 hover:bg-zinc-200 rounded-lg text-zinc-600 font-semibold cursor-pointer"
                >
                  Hết
                </button>
              </div>

              {splitCash > 0 && (
                <div className="flex items-center space-x-2 pt-1 border-t border-zinc-100">
                  <span className="text-[10px] text-zinc-500 font-medium shrink-0">Két nhận tiền:</span>
                  <select
                    value={splitCashFundId}
                    onChange={e => setSplitCashFundId(e.target.value)}
                    className="flex-1 h-7 px-2 bg-orange-50/50 border border-orange-200 rounded-lg text-[11px] font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
                  >
                    {cashFunds.length > 0 ? (
                      cashFunds.map(f => (
                        <option key={f.id} value={f.id}>
                          💵 {f.name} (Dư: {f.currentBalance.toLocaleString('vi-VN')}đ)
                        </option>
                      ))
                    ) : (
                      funds.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))
                    )}
                  </select>
                </div>
              )}
            </div>

            {/* Split Method 2: Bank Transfer 1 + Mandatory Bank Account 1 */}
            <div className="p-2 bg-white rounded-xl border border-blue-200/90 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-1.5 text-blue-900 w-28 shrink-0">
                  <QrCode className="w-3.5 h-3.5 text-blue-600" />
                  <span className="font-semibold">Chuyển khoản 1:</span>
                </div>
                <input
                  type="number"
                  value={splitBank1 || ''}
                  onChange={e => setSplitBank1(Number(e.target.value) || 0)}
                  placeholder="0 đ"
                  className="flex-1 h-8 px-2.5 text-right bg-blue-50/30 border border-blue-200 rounded-lg text-xs font-mono font-semibold text-blue-700 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSplitBank1(Math.max(0, finalAmount - splitCash - (hasSecondBankTransfer ? splitBank2 : 0) - splitCard - splitDebt));
                  }}
                  className="px-2 py-1 text-[10px] bg-blue-50 hover:bg-blue-100 rounded-lg text-blue-600 font-semibold cursor-pointer"
                >
                  Bù
                </button>
              </div>

              {splitBank1 > 0 && (
                <div className="flex items-center space-x-2 pt-1 border-t border-blue-100">
                  <span className="text-[10px] text-blue-600 font-medium shrink-0">TK ngân hàng nhận 1:</span>
                  <select
                    value={splitBankFundId1}
                    onChange={e => setSplitBankFundId1(e.target.value)}
                    className="flex-1 h-7 px-2 bg-blue-50/50 border border-blue-200 rounded-lg text-[11px] font-semibold text-blue-900 focus:outline-none focus:border-blue-500"
                  >
                    {bankFunds.length > 0 ? (
                      bankFunds.map(f => (
                        <option key={f.id} value={f.id}>
                          🏦 {f.name} {f.accountNumber ? `(${f.accountNumber})` : ''} - Dư: {f.currentBalance.toLocaleString('vi-VN')}đ
                        </option>
                      ))
                    ) : (
                      funds.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))
                    )}
                  </select>
                </div>
              )}
            </div>

            {/* Optional Bank Transfer 2 (If customer transfers into 2 separate bank accounts!) */}
            {hasSecondBankTransfer ? (
              <div className="p-2 bg-white rounded-xl border border-indigo-200/90 space-y-1.5 relative">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-1.5 text-indigo-900 w-28 shrink-0">
                    <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="font-semibold">Chuyển khoản 2:</span>
                  </div>
                  <input
                    type="number"
                    value={splitBank2 || ''}
                    onChange={e => setSplitBank2(Number(e.target.value) || 0)}
                    placeholder="0 đ"
                    className="flex-1 h-8 px-2.5 text-right bg-indigo-50/30 border border-indigo-200 rounded-lg text-xs font-mono font-semibold text-indigo-700 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSplitBank2(0);
                      setHasSecondBankTransfer(false);
                    }}
                    className="px-2 py-1 text-[10px] bg-rose-50 hover:bg-rose-100 rounded-lg text-rose-600 font-semibold cursor-pointer"
                    title="Xóa chuyển khoản 2"
                  >
                    ✕ Xóa
                  </button>
                </div>

                <div className="flex items-center space-x-2 pt-1 border-t border-indigo-100">
                  <span className="text-[10px] text-indigo-600 font-medium shrink-0">TK ngân hàng nhận 2:</span>
                  <select
                    value={splitBankFundId2}
                    onChange={e => setSplitBankFundId2(e.target.value)}
                    className="flex-1 h-7 px-2 bg-indigo-50/50 border border-indigo-200 rounded-lg text-[11px] font-semibold text-indigo-900 focus:outline-none focus:border-indigo-500"
                  >
                    {bankFunds.length > 0 ? (
                      bankFunds.map(f => (
                        <option key={f.id} value={f.id}>
                          🏦 {f.name} {f.accountNumber ? `(${f.accountNumber})` : ''} - Dư: {f.currentBalance.toLocaleString('vi-VN')}đ
                        </option>
                      ))
                    ) : (
                      funds.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setHasSecondBankTransfer(true);
                  if (bankFunds.length > 1) {
                    setSplitBankFundId2(bankFunds[1].id);
                  }
                }}
                className="w-full py-1.5 px-2.5 rounded-xl border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 text-[11px] font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Thêm chuyển khoản vào tài khoản ngân hàng thứ 2</span>
              </button>
            )}

            {/* Split Method 3: POS Card */}
            <div className="p-2 bg-white rounded-xl border border-purple-200/90 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-1.5 text-purple-900 w-28 shrink-0">
                  <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                  <span className="font-semibold">Cà thẻ POS:</span>
                </div>
                <input
                  type="number"
                  value={splitCard || ''}
                  onChange={e => setSplitCard(Number(e.target.value) || 0)}
                  placeholder="0 đ"
                  className="flex-1 h-8 px-2.5 text-right bg-purple-50/30 border border-purple-200 rounded-lg text-xs font-mono font-semibold text-purple-700 focus:outline-none focus:border-purple-500 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSplitCard(Math.max(0, finalAmount - splitCash - splitBank1 - (hasSecondBankTransfer ? splitBank2 : 0) - splitDebt));
                  }}
                  className="px-2 py-1 text-[10px] bg-purple-50 hover:bg-purple-100 rounded-lg text-purple-600 font-semibold cursor-pointer"
                >
                  Bù
                </button>
              </div>

              {splitCard > 0 && (
                <div className="flex items-center space-x-2 pt-1 border-t border-purple-100">
                  <span className="text-[10px] text-purple-600 font-medium shrink-0">Máy/TK POS:</span>
                  <select
                    value={splitCardFundId}
                    onChange={e => setSplitCardFundId(e.target.value)}
                    className="flex-1 h-7 px-2 bg-purple-50/50 border border-purple-200 rounded-lg text-[11px] font-semibold text-purple-900 focus:outline-none focus:border-purple-500"
                  >
                    {cardFunds.length > 0 ? (
                      cardFunds.map(f => (
                        <option key={f.id} value={f.id}>
                          💳 {f.name} - Dư: {f.currentBalance.toLocaleString('vi-VN')}đ
                        </option>
                      ))
                    ) : (
                      funds.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))
                    )}
                  </select>
                </div>
              )}
            </div>

            {/* Split Method 4: Debt / Installment */}
            <div className="p-2 bg-white rounded-xl border border-rose-200/90 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-1.5 text-rose-900 w-28 shrink-0">
                  <Receipt className="w-3.5 h-3.5 text-rose-600" />
                  <span className="font-semibold">Ghi nợ / Trả góp:</span>
                </div>
                <input
                  type="number"
                  value={splitDebt || ''}
                  onChange={e => setSplitDebt(Number(e.target.value) || 0)}
                  placeholder="0 đ"
                  className="flex-1 h-8 px-2.5 text-right bg-rose-50/30 border border-rose-200 rounded-lg text-xs font-mono font-semibold text-rose-700 focus:outline-none focus:border-rose-500 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSplitDebt(Math.max(0, finalAmount - splitCash - splitBank1 - (hasSecondBankTransfer ? splitBank2 : 0) - splitCard));
                  }}
                  className="px-2 py-1 text-[10px] bg-rose-50 hover:bg-rose-100 rounded-lg text-rose-600 font-semibold cursor-pointer"
                >
                  Bù
                </button>
              </div>
            </div>

            {/* Multi-Payment Balance Feedback */}
            <div className="pt-2 border-t border-orange-200/60 flex items-center justify-between text-xs">
              <span className="text-zinc-600 font-medium">Tổng tiền phân bổ:</span>
              <span className={`font-mono font-bold ${splitDiff === 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {totalSplit.toLocaleString('vi-VN')} / {finalAmount.toLocaleString('vi-VN')} đ
                {splitDiff !== 0 && (
                  <span className="text-[10px] ml-1 font-semibold">
                    ({splitDiff > 0 ? `+${splitDiff.toLocaleString('vi-VN')}đ` : `${splitDiff.toLocaleString('vi-VN')}đ`})
                  </span>
                )}
              </span>
            </div>
          </div>
        ) : (
          /* SINGLE PAYMENT METHOD SELECTION */
          <div className="grid grid-cols-2 gap-1.5">
            {paymentMethods.map(pm => {
              const Icon = pm.icon;
              const isSelected = paymentMethod === pm.id;

              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => onChangePaymentMethod(pm.id)}
                  className={`flex items-center space-x-2 p-2.5 rounded-2xl border text-xs font-semibold transition-all cursor-pointer ${
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
        )}
      </div>

      {/* 4. Cash Tender Fast Calculator (If Cash Single) */}
      {!isSplitMode && isCash && (
        <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-700">Khách Đưa Tiền Mặt:</span>
            <span className="text-[10px] text-zinc-400 font-mono">Tự tính tiền thối</span>
          </div>

          <div className="relative">
            <input
              type="number"
              value={cashGiven || ''}
              onChange={e => setCashGiven(Number(e.target.value) || 0)}
              placeholder="Nhập số tiền khách đưa..."
              className="w-full h-9 px-3 text-right bg-white border border-zinc-200 rounded-xl text-xs font-mono font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
            />
          </div>

          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {tenderSuggestions.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCashGiven(item.amount)}
                className={`py-1.5 px-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer font-mono ${
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
              <span className="font-semibold text-emerald-700">Tiền thối lại khách:</span>
              <span className="text-sm font-bold font-mono text-emerald-700">
                {changeDue.toLocaleString('vi-VN')} đ
              </span>
            </div>
          )}
        </div>
      )}

      {/* VietQR Fast Preview Link (If VietQR Single or VietQR in split) */}
      {((!isSplitMode && isVietQR) || (isSplitMode && splitBank1 > 0)) && (
        <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-50/70 to-indigo-50/50 border border-blue-200/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <QrCode className="w-7 h-7 text-blue-600" />
            <div>
              <span className="text-xs font-bold text-blue-900 block">Mã VietQR Động {vietQrBankName}</span>
              <span className="text-[10px] text-blue-600 font-mono">
                TK {vietQrAccount} • Số tiền: {(isSplitMode ? splitBank1 : finalAmount).toLocaleString('vi-VN')}đ
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowQRModal(true)}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm transition-all cursor-pointer"
          >
            Hiện QR
          </button>
        </div>
      )}

      {/* 5. Installment Partner Details (If Installment Single) */}
      {!isSplitMode && isInstallment && (
        <div className="p-3.5 bg-orange-50/70 border border-orange-200 rounded-2xl space-y-2.5 text-xs">
          <span className="font-semibold text-zinc-800 block">Công Ty Tài Chính Đối Tác:</span>
          <div className="grid grid-cols-2 gap-1.5">
            {financeCompanies.map(fc => (
              <button
                key={fc}
                type="button"
                onClick={() => setSelectedFinanceCompany(fc)}
                className={`p-2 rounded-xl text-left border text-[11px] transition-all cursor-pointer ${
                  selectedFinanceCompany === fc
                    ? 'bg-orange-500 text-white border-orange-500 shadow-2xs font-semibold'
                    : 'bg-white text-zinc-700 border-orange-200'
                }`}
              >
                {fc}
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-orange-200/60 space-y-1.5">
            <div className="flex justify-between items-center font-semibold text-zinc-800">
              <span>Khách trả trước:</span>
              <input
                type="text"
                inputMode="numeric"
                value={downPaymentAmount.toLocaleString('vi-VN')}
                onChange={e => {
                  const val = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0;
                  onChangeDownPayment(val);
                }}
                className="w-32 text-right font-mono font-semibold px-2.5 py-1 bg-white border border-orange-300 rounded-xl text-xs"
              />
            </div>

            <div className="flex justify-between text-zinc-600 text-[11px]">
              <span>Chờ {selectedFinanceCompany} giải ngân:</span>
              <span className="font-mono font-semibold text-zinc-900">{expectedDisbursement.toLocaleString('vi-VN')} đ</span>
            </div>
          </div>
        </div>
      )}

      {/* 6. Target Fund Account Picker (MANDATORY in Single Mode) */}
      {!isSplitMode && (
        <div className="space-y-1.5 p-3 bg-zinc-50/80 rounded-2xl border border-zinc-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-700 flex items-center gap-1">
              <span>Tài Khoản / Két Tiền Nhận Tiền</span>
              <span className="text-rose-500 font-bold">*</span>
            </span>
            <span className="text-[10px] font-semibold text-[#ff4b16] bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
              Bắt buộc chọn
            </span>
          </div>
          <select
            value={selectedFundId}
            onChange={e => onSelectFundId(e.target.value)}
            className="w-full h-10 px-3 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16] transition-all"
          >
            {funds.map(f => {
              const balance = f.currentBalance ?? (f as any).balance ?? 0;
              const icon = f.type === 'CASH' ? '💵' : f.type === 'BANK' ? '🏦' : '💳';
              return (
                <option key={f.id} value={f.id}>
                  {icon} {f.name} {f.accountNumber ? `(${f.accountNumber})` : ''} - Số dư: {balance.toLocaleString('vi-VN')} đ
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* 7. Checkout Action Button (F9) */}
      <div className="pt-2 mt-auto">
        <Button
          variant="primary"
          size="lg"
          isLoading={isProcessing}
          onClick={handleSubmitCheckout}
          leftIcon={<Receipt className="w-5 h-5" />}
          className="w-full font-bold text-sm shadow-xl shadow-orange-500/25 h-12 rounded-2xl cursor-pointer"
        >
          {isProcessing ? 'Đang Xử Lý Xuất Đơn...' : 'XÁC NHẬN XUẤT ĐƠN (F9)'}
        </Button>
      </div>

      {/* 8. VietQR Dynamic Modal */}
      {showQRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full text-center space-y-3 shadow-2xl border border-zinc-200">
            <h3 className="text-sm font-bold text-zinc-900">Quét Mã VietQR Chuyển Khoản</h3>
            <p className="text-xs text-zinc-500 font-mono">
              {vietQrBankName} • {vietQrAccount} • PhoneHouse Retail
            </p>

            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl flex justify-center">
              <img
                src={vietQrUrl}
                alt="VietQR Code"
                className="w-56 h-56 object-contain rounded-xl"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

            <div className="font-mono font-bold text-base text-[#ff4b16]">
              {(isSplitMode ? splitBank1 : finalAmount).toLocaleString('vi-VN')} đ
            </div>

            <button
              onClick={() => setShowQRModal(false)}
              className="w-full py-2.5 bg-zinc-900 text-white font-semibold text-xs rounded-2xl hover:bg-black transition-colors cursor-pointer"
            >
              Đóng Mã QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
