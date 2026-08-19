import React, { useState, useMemo } from 'react';
import { 
  Wallet, ArrowUpRight, ArrowDownLeft, Search, Filter, Plus, Minus, Calendar,
  CreditCard, Building2, Users, Smartphone, FileText, ChevronDown, ChevronRight, RefreshCw, X, Share2, 
  Printer, ArrowRightLeft, CheckCircle2, AlertCircle, Eye, EyeOff, Sparkles, User as UserIcon, Clock
} from 'lucide-react';
import { 
  CashTransaction, FundAccount, CashTransactionType, PaymentFundType, 
  CashReceiptCategory, CashPaymentCategory, Partner, UserAccount, StoreBranch 
} from '../types';
import { PhoneHouseLogo } from './PhoneHouseLogo';
import { transferFundsInFirestore } from '../services/firestoreService';

// format helpers
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};
const formatCompact = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { notation: "compact", maximumFractionDigits: 2 }).format(amount).replace('T', 'tr');
};

interface CashbookViewProps {
  currentUser?: UserAccount | null;
  branches?: StoreBranch[];
  transactions: CashTransaction[];
  funds: FundAccount[];
  partners: Partner[];
  onAddTransaction: (transaction: CashTransaction) => void;
  onUpdateFunds?: (funds: FundAccount[]) => void;
  onTransferFunds?: (fromFundId: string, toFundId: string, amount: number, notes: string, creator?: string) => Promise<void> | void;
}

export const CashbookView: React.FC<CashbookViewProps> = ({
  currentUser,
  branches = [], 
  transactions, funds, partners, onAddTransaction, onUpdateFunds, onTransferFunds 
}) => {
  const [activeMainTab, setActiveMainTab] = useState<'TRANSACTIONS' | 'ACCOUNTS' | 'REPORTS'>('TRANSACTIONS');
  const [selectedFundFilter, setSelectedFundFilter] = useState<string>('ALL');
  const [showBalance, setShowBalance] = useState(true);
  
  // Sheet states
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  
  // Transaction Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<CashTransaction | null>(null);
  const [modalType, setModalType] = useState<'RECEIPT' | 'PAYMENT'>('RECEIPT');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [editingFund, setEditingFund] = useState<FundAccount | null>(null);

  const [transferData, setTransferData] = useState({
    fromFundName: funds.find(f => f.type === 'CASH')?.name || '',
    toFundName: funds.find(f => f.type === 'BANK')?.name || '',
    amount: '',
    notes: 'Chuyển quỹ nội bộ'
  });

  const [reconcileData, setReconcileData] = useState({
    fundName: funds[0]?.name || '',
    actualBalance: '',
    notes: 'Kiểm kê đối soát cuối ca'
  });

  const [fundFormData, setFundFormData] = useState({
    name: '',
    type: 'CASH' as PaymentFundType,
    bankName: '',
    accountNumber: '',
    initialBalance: ''
  });
  const [formData, setFormData] = useState({
    type: 'RECEIPT' as CashTransactionType,
    category: 'SALES_REVENUE',
    categoryName: 'Thu tiền bán lẻ iPhone',
    amount: '',
    fundType: 'BANK' as PaymentFundType,
    fundName: 'Techcombank - 190388889999 (VietQR Chính)',
    partnerId: '',
    partnerName: '',
    partnerType: 'CUSTOMER',
    partnerPhone: '',
    referenceCode: '',
    creator: 'Nhật Tân (Admin)',
    notes: '',
    branchId: ''
  });

  const [activeFilter, setActiveFilter] = useState<'ALL' | 'RECEIPT' | 'PAYMENT' | 'RETAIL'>('ALL');

  // Stats
  const currentBalance = funds.reduce((sum, f) => sum + f.currentBalance, 0);
  const totalIn = transactions.filter(t => t.type === 'RECEIPT').reduce((s, t) => s + t.amount, 0);
  const totalOut = transactions.filter(t => t.type === 'PAYMENT').reduce((s, t) => s + t.amount, 0);
  const netFlow = totalIn - totalOut;

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        handleOpenCreateModal('RECEIPT');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOpenCreateModal = (type: CashTransactionType) => {
    setIsCreateSheetOpen(false);
    setModalType(type);
    setFormData({
      type,
      category: type === 'RECEIPT' ? 'SALES_REVENUE' : 'INVENTORY_PURCHASE',
      categoryName: type === 'RECEIPT' ? 'Thu tiền bán lẻ iPhone' : 'Chi nhập hàng iPhone từ NCC',
      amount: '',
      fundType: 'BANK',
      fundName: funds.find(f => f.type === 'BANK')?.name || 'Techcombank - 190388889999 (VietQR Chính)',
      partnerId: '',
      partnerName: '',
      partnerType: type === 'RECEIPT' ? 'CUSTOMER' : 'SUPPLIER',
      partnerPhone: '',
      referenceCode: '',
      creator: 'Nhật Tân (Admin)',
      notes: ''
    });
    setIsCreateModalOpen(true);
  };

  const handlePartnerSelect = (partnerId: string) => {
    const p = partners.find(item => item.id === partnerId);
    if (p) {
      setFormData(prev => ({
        ...prev,
        partnerId: p.id,
        partnerName: p.name,
        partnerPhone: p.phone || '',
        partnerType: p.type
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        partnerId: '',
        partnerName: '',
        partnerPhone: ''
      }));
    }
  };

    const handleOpenTransferModal = () => {
    setIsCreateSheetOpen(false);
    setIsTransferModalOpen(true);
  };

  const handleOpenReconcileModal = () => {
    setIsCreateSheetOpen(false);
    setIsReconcileModalOpen(true);
  };

  const handleOpenFundModal = (fund: FundAccount | null = null) => {
    setEditingFund(fund);
    if (fund) {
      setFundFormData({
        name: fund.name,
        type: fund.type,
        bankName: fund.bankName || '',
        accountNumber: fund.accountNumber || '',
        initialBalance: fund.currentBalance.toString()
      });
    } else {
      setFundFormData({
        name: '',
        type: 'CASH',
        bankName: '',
        accountNumber: '',
        initialBalance: ''
      });
    }
    setIsFundModalOpen(true);
  };

  const handleSubmitFund = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateFunds) return;

    const initialBalNum = parseFloat(fundFormData.initialBalance.replace(/[^0-9]/g, '')) || 0;
    
    if (editingFund) {
      const updated = funds.map(f => f.id === editingFund.id ? {
        ...f,
        name: fundFormData.name,
        type: fundFormData.type,
        bankName: fundFormData.bankName,
        accountNumber: fundFormData.accountNumber
      } : f);
      onUpdateFunds(updated);
    } else {
      const newFund: FundAccount = {
        id: `FUND-${Date.now()}`,
        name: fundFormData.name,
        type: fundFormData.type,
        bankName: fundFormData.bankName,
        accountNumber: fundFormData.accountNumber,
        currentBalance: initialBalNum,
        openingBalance: initialBalNum,
        totalIncome: 0,
        totalExpense: 0,
        isActive: true,
        color: fundFormData.type === 'CASH' ? 'orange' : 'orange'
      };
      onUpdateFunds([...funds, newFund]);
    }
    setIsFundModalOpen(false);
  };

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(transferData.amount.replace(/[^0-9]/g, '')) || 0;
    if (amountNum <= 0) { alert('Số tiền không hợp lệ'); return; }
    if (transferData.fromFundName === transferData.toFundName) { alert('Quỹ nguồn và quỹ đích phải khác nhau'); return; }

    const fromFund = funds.find(f => f.name === transferData.fromFundName || f.id === transferData.fromFundName);
    const toFund = funds.find(f => f.name === transferData.toFundName || f.id === transferData.toFundName);
    if (!fromFund || !toFund) return;

    if (fromFund.currentBalance < amountNum) {
      if (!confirm(`Số dư của ${fromFund.name} (${formatCurrency(fromFund.currentBalance)}) thấp hơn số tiền chuyển (${formatCurrency(amountNum)}). Bạn có chắc chắn muốn tiếp tục?`)) {
        return;
      }
    }

    if (onTransferFunds) {
      await onTransferFunds(fromFund.id, toFund.id, amountNum, transferData.notes || 'Chuyển quỹ nội bộ', currentUser?.displayName || 'Admin');
    } else {
      await transferFundsInFirestore({
        fromFundId: fromFund.id,
        toFundId: toFund.id,
        fromFundName: fromFund.name,
        toFundName: toFund.name,
        amount: amountNum,
        note: transferData.notes || 'Chuyển quỹ nội bộ',
        transferredBy: currentUser?.displayName || 'Admin',
        branchId: currentUser?.branchId || 'ALL',
        branchName: 'Toàn hệ thống'
      });
    }

    setIsTransferModalOpen(false);
    setTransferData({
      fromFundName: funds.find(f => f.type === 'CASH')?.name || '',
      toFundName: funds.find(f => f.type === 'BANK')?.name || '',
      amount: '',
      notes: 'Chuyển quỹ nội bộ'
    });
  };

  const handleSubmitReconcile = (e: React.FormEvent) => {
    e.preventDefault();
    const actualBalNum = parseFloat(reconcileData.actualBalance.replace(/[^0-9]/g, '')) || 0;
    const fund = funds.find(f => f.name === reconcileData.fundName);
    if (!fund) return;

    const diff = actualBalNum - fund.currentBalance;
    if (diff === 0) {
      alert('Số dư khớp, không cần điều chỉnh.');
      setIsReconcileModalOpen(false);
      return;
    }

    const now = new Date();
    const dateStr = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;

    const txAdjust: CashTransaction = {
      id: `TX-${Date.now()}-ADJ`,
      code: `${diff > 0 ? 'PT' : 'PC'}-${Math.floor(1000 + Math.random() * 9000)}`,
      type: diff > 0 ? 'RECEIPT' : 'PAYMENT',
      category: diff > 0 ? 'OTHER_INCOME' : 'OTHER_EXPENSE',
      categoryName: 'Điều chỉnh đối soát',
      amount: Math.abs(diff),
      fundId: fund.id,
      fundType: fund.type,
      fundName: fund.name,
      date: dateStr,
      creator: 'Nhật Tân (Admin)',
      notes: reconcileData.notes,
      status: 'COMPLETED'
    };
    
    onAddTransaction(txAdjust);
    setIsReconcileModalOpen(false);
  };

  const handleSubmitTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(formData.amount.replace(/[^0-9]/g, '')) || 0;
    if (amountNum <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ lớn hơn 0đ');
      return;
    }

    const selectedFund = funds.find(f => f.name === formData.fundName) || funds.find(f => f.type === formData.fundType) || funds[0] || null;

    if (formData.type === 'PAYMENT' && selectedFund && selectedFund.currentBalance < amountNum) {
      const confirmed = window.confirm(
        `⚠️ Cảnh báo số dư:\nSố dư hiện tại của quỹ "${selectedFund.name}" là ${formatCurrency(selectedFund.currentBalance)}, nhỏ hơn số tiền muốn chi (${formatCurrency(amountNum)}).\n\nBạn có chắc chắn muốn xuất chi (ghi âm quỹ) không?`
      );
      if (!confirmed) return;
    }

    const now = new Date();
    const dateStr = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;
    const randomCode = `${formData.type === 'RECEIPT' ? 'PT' : 'PC'}-${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;

    const newTx: CashTransaction = {
      id: `TX-${Date.now()}`,
      code: randomCode,
      type: formData.type,
      category: formData.category,
      categoryName: formData.categoryName,
      amount: amountNum,
      fundId: selectedFund?.id || 'FUND-01',
      fundType: selectedFund?.type || formData.fundType,
      fundName: selectedFund?.name || formData.fundName,
      date: dateStr,
      partnerId: formData.partnerId || undefined,
      partnerName: formData.partnerName || (formData.type === 'RECEIPT' ? 'Khách lẻ vãng lai' : 'Nhà cung cấp / Đối tác'),
      partnerType: formData.partnerType,
      partnerPhone: formData.partnerPhone || undefined,
      referenceCode: formData.referenceCode || undefined,
      creator: currentUser?.displayName || formData.creator || 'Nhân viên kế toán',
      branchId: formData.branchId || branches[0]?.id || 'CN01',
      notes: formData.notes || (formData.type === 'RECEIPT' ? 'Thu tiền theo chứng từ' : 'Chi tiền theo hóa đơn'),
      status: 'COMPLETED'
    };

    onAddTransaction(newTx);
    setIsCreateModalOpen(false);
    setSelectedTx(newTx);
  };

  const filteredTransactions = transactions.filter(t => {
    if (activeFilter === 'RECEIPT') return t.type === 'RECEIPT';
    if (activeFilter === 'PAYMENT') return t.type === 'PAYMENT';
    if (activeFilter === 'RETAIL') return t.category === 'SALES_REVENUE';
    return true;
  });

  return (
    <div className="flex flex-col min-h-screen max-w-[1600px] mx-auto p-2 sm:p-4 space-y-4 text-zinc-900 font-sans">
      
      {/* 1. Header Bar with Permanent Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-[#ff4b16] text-white flex items-center justify-center shadow-sm font-bold shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg sm:text-xl font-black text-zinc-900 tracking-tight">Sổ Quỹ Tiền Mặt & Tài Chính</h1>
              <span className="px-2.5 py-0.5 text-[10px] font-bold bg-orange-50 text-[#ff4b16] border border-orange-200/60 rounded-full">
                PhoneHouse CRM
              </span>
            </div>
            <p className="text-xs text-zinc-500 font-medium mt-0.5">
              Quản lý dòng tiền thu chi, tài khoản ngân hàng VietQR và đối soát ca
            </p>
          </div>
        </div>

        {/* Top 4 Prominent Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleOpenCreateModal('RECEIPT')}
            className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center space-x-1.5 shadow-sm shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>+ Lập Phiếu Thu (F4)</span>
          </button>

          <button
            onClick={() => handleOpenCreateModal('PAYMENT')}
            className="flex-1 sm:flex-none bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center space-x-1.5 shadow-sm shadow-rose-600/20 transition-all cursor-pointer"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>- Lập Phiếu Chi</span>
          </button>

          <button
            onClick={handleOpenTransferModal}
            className="flex-1 sm:flex-none bg-orange-50 hover:bg-orange-100 text-[#ff4b16] border border-orange-200 font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer active:scale-95"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Chuyển Quỹ</span>
          </button>

          <button
            onClick={handleOpenReconcileModal}
            className="flex-1 sm:flex-none bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4 text-zinc-600" />
            <span>Đối Soát Ca</span>
          </button>
        </div>
      </div>

      {/* 2. Sticky Tab Navigation Bar */}
      <div className="bg-white/95 backdrop-blur-md border border-zinc-200/80 rounded-2xl p-1.5 shadow-2xs sticky top-0 z-20 flex items-center justify-between">
        <div className="flex space-x-1 sm:space-x-2">
          {[
            { id: 'TRANSACTIONS', label: 'Sổ Quỹ Thu Chi', count: transactions.length },
            { id: 'ACCOUNTS', label: 'Tài Khoản Quỹ & Két', count: funds.length },
            { id: 'REPORTS', label: 'Báo Cáo Dòng Tiền' }
          ].map(tab => {
            const isActive = activeMainTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveMainTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                  isActive
                    ? 'bg-[#ff4b16] text-white shadow-xs'
                    : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="hidden sm:flex items-center space-x-2 text-xs font-bold text-zinc-500 pr-2">
          <span>Tổng số dư:</span>
          <span className="font-mono font-black text-zinc-900">
            {showBalance ? formatCurrency(currentBalance) : '***.***.*** đ'}
          </span>
          <button onClick={() => setShowBalance(!showBalance)} className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700 cursor-pointer">
            {showBalance ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        
        {activeMainTab === 'TRANSACTIONS' && (
          <>
            {/* 3. Financial Summary Card */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center space-x-2 text-zinc-500 font-bold text-xs uppercase tracking-wider">
                  <span>Số dư tổng các quỹ hiện tại</span>
                  <button onClick={() => setShowBalance(!showBalance)} className="p-1 hover:bg-zinc-100 rounded-full cursor-pointer">
                    {showBalance ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-zinc-500">Kỳ hạch toán:</span>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 bg-zinc-100 text-zinc-800 rounded-lg border border-zinc-200">
                    Tháng 08/2026
                  </span>
                </div>
              </div>

              <div className="text-2xl sm:text-3xl font-black text-zinc-900 mb-5 font-mono">
                {showBalance ? formatCurrency(currentBalance) : '***.***.*** đ'}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-zinc-100">
                <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-emerald-700 font-bold mb-0.5">Tổng Thu Vào (+)</p>
                    <p className="text-base font-black font-mono text-emerald-800">
                      +{showBalance ? formatCurrency(totalIn) : '***'}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                </div>

                <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-rose-700 font-bold mb-0.5">Tổng Chi Ra (-)</p>
                    <p className="text-base font-black font-mono text-rose-800">
                      -{showBalance ? formatCurrency(totalOut) : '***'}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>

                <div className="p-3 bg-orange-50/70 border border-orange-100 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-orange-700 font-bold mb-0.5">Dòng Tiền Thuần (Net)</p>
                    <p className={`text-base font-black font-mono ${netFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {showBalance ? (netFlow > 0 ? '+' : '') + formatCurrency(netFlow) : '***'}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#ff4b16] flex items-center justify-center">
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Horizontal Fund Quick-Filter Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Tài khoản & Két tiền ({funds.length})</h3>
                <button onClick={() => setActiveMainTab('ACCOUNTS')} className="text-[#ff4b16] text-xs font-bold hover:underline cursor-pointer">
                  Quản lý quỹ & tài khoản ›
                </button>
              </div>
              <div className="flex space-x-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-200">
                <div
                  onClick={() => setSelectedFundFilter('ALL')}
                  className={`cursor-pointer border rounded-2xl p-3 min-w-[170px] shrink-0 flex flex-col justify-between transition-all ${
                    selectedFundFilter === 'ALL'
                      ? 'bg-orange-50 border-[#ff4b16] shadow-2xs ring-1 ring-[#ff4b16]'
                      : 'bg-white border-zinc-200/80 hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-100 text-zinc-700 font-bold">
                      <Wallet className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-zinc-900 truncate">Tất cả tài khoản</p>
                      <p className="text-[10px] text-zinc-400 truncate">Tổng số dư</p>
                    </div>
                  </div>
                  <p className="text-xs font-black font-mono text-zinc-900">
                    {showBalance ? formatCurrency(funds.reduce((sum, f) => sum + (f.currentBalance || 0), 0)) : '***.*** đ'}
                  </p>
                </div>

                {funds.map((fund) => {
                  const isSelected = selectedFundFilter === fund.id;
                  const balance = fund.currentBalance ?? (fund as any).balance ?? 0;
                  return (
                    <div
                      key={fund.id}
                      onClick={() => setSelectedFundFilter(fund.id)}
                      className={`cursor-pointer border rounded-2xl p-3 min-w-[180px] shrink-0 flex flex-col justify-between transition-all ${
                        isSelected
                          ? 'bg-orange-50 border-[#ff4b16] shadow-2xs ring-1 ring-[#ff4b16]'
                          : 'bg-white border-zinc-200/80 hover:bg-zinc-50'
                      }`}
                    >
                      <div className="flex items-center space-x-2 mb-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold ${
                          fund.type === 'CASH' ? 'bg-orange-100 text-[#ff4b16]' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {fund.type === 'CASH' ? <Wallet className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-zinc-900 truncate">{fund.name}</p>
                          <p className="text-[10px] text-zinc-400 truncate">
                            {fund.type === 'CASH' ? 'Két tiền mặt' : fund.bankName || 'Ngân hàng'}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs font-black font-mono text-zinc-900">
                        {showBalance ? formatCurrency(balance) : '***.*** đ'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. Filter & Search Bar */}
            <div className="bg-white p-3.5 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Tìm theo mã phiếu (PT/PC), đối tác, nội dung thu chi..."
                    className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
                  />
                </div>

                <div className="flex items-center space-x-1.5">
                  {[
                    { id: 'ALL', label: `Tất cả (${transactions.length})` },
                    { id: 'RECEIPT', label: `Thu (+${transactions.filter(t => t.type === 'RECEIPT').length})`, color: 'text-emerald-700' },
                    { id: 'PAYMENT', label: `Chi (-${transactions.filter(t => t.type === 'PAYMENT').length})`, color: 'text-rose-700' },
                    { id: 'RETAIL', label: 'Bán lẻ POS' }
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setActiveFilter(f.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeFilter === f.id
                          ? 'bg-zinc-900 text-white shadow-2xs'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      <span>{f.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 6. Transaction Items List */}
            <div className="space-y-2 pb-12">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-600 px-1">
                <span>Nhật ký thu chi gần đây ({filteredTransactions.length} chứng từ)</span>
              </div>
              <div className="space-y-2">
                {filteredTransactions.map(tx => (
                  <div 
                    key={tx.id} 
                    onClick={() => {
                      setSelectedTx(tx);
                      setIsPrintModalOpen(true);
                    }}
                    className="bg-white border border-zinc-200/80 rounded-2xl p-3 sm:p-4 flex items-center justify-between hover:shadow-md cursor-pointer transition-all hover:border-orange-200 group"
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        tx.type === 'RECEIPT' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {tx.type === 'RECEIPT' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <p className="font-bold text-zinc-900 text-xs truncate">
                            {tx.partnerName || 'Khách vãng lai / Đối tác'}
                          </p>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                            {tx.code}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 mt-0.5 truncate font-medium">
                          {tx.notes || tx.categoryName}
                        </p>
                        <div className="flex items-center space-x-3 text-[10px] text-zinc-400 mt-1 font-mono">
                          <span className="flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            {tx.date}
                          </span>
                          <span>•</span>
                          <span className="flex items-center">
                            {tx.fundType === 'CASH' ? <Wallet className="w-3 h-3 mr-1" /> : <Building2 className="w-3 h-3 mr-1" />}
                            {tx.fundName || 'Quỹ tiền'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 shrink-0 ml-3">
                      <p className={`font-black font-mono text-sm sm:text-base ${
                        tx.type === 'RECEIPT' ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {tx.type === 'RECEIPT' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </p>
                      <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeMainTab === 'ACCOUNTS' && (
          <div className="space-y-6 animate-in fade-in pb-20">
            {/* Header & Quick Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#EAECF0]">
              <div>
                <h3 className="font-black text-[#171717] text-lg">Quản Lý Quỹ Tiền Mặt & Tài Khoản Ngân Hàng</h3>
                <p className="text-xs text-zinc-500">Đối soát số dư thực tế, quản lý két tiền mặt tại showroom và tài khoản VietQR</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button 
                  onClick={handleOpenTransferModal} 
                  className="flex items-center space-x-1.5 bg-orange-600 hover:bg-orange-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-orange-500/20 cursor-pointer"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>Chuyển quỹ nội bộ</span>
                </button>
                <button 
                  onClick={handleOpenReconcileModal} 
                  className="flex items-center space-x-1.5 bg-orange-500 hover:bg-orange-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-orange-500/20 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Đối soát số dư</span>
                </button>
                <button 
                  onClick={() => handleOpenFundModal()} 
                  className="flex items-center space-x-1.5 bg-[#EA580C] hover:bg-[#128a59] text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-orange-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Thêm quỹ</span>
                </button>
              </div>
            </div>

            {/* Account Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 text-white rounded-2xl p-4 shadow-sm border border-zinc-800">
                <p className="text-xs text-zinc-400 font-medium mb-1">Tổng Số Dư Toàn Bộ Quỹ</p>
                <p className="text-xl font-black text-orange-400">
                  {formatCurrency(funds.reduce((acc, f) => acc + (f.currentBalance || 0), 0))}
                </p>
                <p className="text-[10px] text-zinc-400 mt-1">{funds.length} tài khoản & két tiền</p>
              </div>

              <div className="bg-orange-50/70 border border-orange-100 rounded-2xl p-4">
                <p className="text-xs text-orange-700 font-bold mb-1">Tiền Mặt Tại Các Két</p>
                <p className="text-xl font-black text-[#FF5A1F]">
                  {formatCurrency(funds.filter(f => f.type === 'CASH').reduce((acc, f) => acc + (f.currentBalance || 0), 0))}
                </p>
                <p className="text-[10px] text-orange-600/80 mt-1">Sẵn sàng thanh toán thu mua & chi phí</p>
              </div>

              <div className="bg-orange-50/70 border border-orange-100 rounded-2xl p-4">
                <p className="text-xs text-orange-700 font-bold mb-1">Tài Khoản Ngân Hàng & VietQR</p>
                <p className="text-xl font-black text-orange-700">
                  {formatCurrency(funds.filter(f => f.type !== 'CASH').reduce((acc, f) => acc + (f.currentBalance || 0), 0))}
                </p>
                <p className="text-[10px] text-orange-600/80 mt-1">Thu tiền chuyển khoản & POS quẹt thẻ</p>
              </div>
            </div>
            
            {/* Account Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {funds.map((fund) => (
                <div key={fund.id} className="bg-white border border-[#EAECF0] rounded-3xl p-5 flex flex-col justify-between hover:shadow-lg transition-all">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold ${
                          fund.type === 'CASH' ? 'bg-orange-50 text-[#FF5A1F]' : 
                          fund.type === 'BANK' ? 'bg-orange-50 text-orange-600' : 'bg-orange-50 text-orange-600'
                        }`}>
                          {fund.type === 'CASH' ? <Wallet className="w-6 h-6" /> : <Building2 className="w-6 h-6" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-[#171717] text-base">{(fund.name || 'Quỹ').split('-')[0]?.trim() || fund.name}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              fund.type === 'CASH' ? 'bg-orange-100 text-orange-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {fund.type === 'CASH' ? 'Két tiền mặt' : 'Ngân hàng'}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">{fund.type === 'BANK' ? `${fund.bankName || ''} - ${fund.accountNumber || ''}` : 'Tiền mặt tại quầy bán lẻ'}</p>
                        </div>
                      </div>
                      <button onClick={() => handleOpenFundModal(fund)} className="p-2 text-zinc-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-colors cursor-pointer" title="Sửa thông tin quỹ">
                        <span className="text-xs font-bold">Sửa</span>
                      </button>
                    </div>

                    <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                      <p className="text-[10px] text-zinc-500 mb-1 uppercase font-bold tracking-wider">Số dư khả dụng hiện tại</p>
                      <p className="text-2xl font-black text-[#171717]">{formatCurrency(fund.currentBalance)}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-100">
                      <div>
                        <p className="text-[10px] text-zinc-500">Tổng thu lũy kế</p>
                        <p className="text-xs font-bold text-[#EA580C]">+{formatCompact(fund.totalIncome)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-500">Tổng chi lũy kế</p>
                        <p className="text-xs font-bold text-[#E23C55]">-{formatCompact(fund.totalExpense)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Fund Actions */}
                  <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setTransferData(prev => ({ ...prev, fromFundName: fund.name }));
                        setIsTransferModalOpen(true);
                      }}
                      className="flex-1 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-xl text-xs font-bold flex items-center justify-center space-x-1 transition-colors cursor-pointer"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Chuyển từ quỹ này</span>
                    </button>
                    <button
                      onClick={() => {
                        handleOpenCreateModal('RECEIPT');
                        setFormData(prev => ({ ...prev, fundName: fund.name, fundType: fund.type }));
                      }}
                      className="px-3 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      + Nạp tiền
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Internal Transfers History Log Table */}
            <div className="bg-white border border-[#EAECF0] rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center space-x-2">
                  <ArrowRightLeft className="w-5 h-5 text-orange-600" />
                  <h4 className="font-black text-zinc-900 text-base">Lịch Sử Chuyển Quỹ Nội Bộ (Transfer Log)</h4>
                </div>
                <span className="text-xs text-zinc-500 font-medium">
                  {transactions.filter(t => t.categoryName.includes('Chuyển quỹ') || t.referenceCode?.startsWith('TRF-')).length} giao dịch chuyển tiền
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-500 font-bold border-b border-zinc-100">
                      <th className="p-3">Mã phiếu / Tham chiếu</th>
                      <th className="p-3">Thời gian</th>
                      <th className="p-3">Loại</th>
                      <th className="p-3">Tài khoản quỹ</th>
                      <th className="p-3">Số tiền</th>
                      <th className="p-3">Người thực hiện</th>
                      <th className="p-3">Ghi chú</th>
                      <th className="p-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {transactions
                      .filter(t => t.categoryName.includes('Chuyển quỹ') || t.referenceCode?.startsWith('TRF-'))
                      .slice(0, 10)
                      .map((tx) => (
                        <tr key={tx.id} className="hover:bg-zinc-50/80 transition-colors">
                          <td className="p-3 font-mono font-bold text-zinc-800">
                            <div>{tx.code}</div>
                            {tx.referenceCode && (
                              <div className="text-[10px] text-orange-600 font-medium">{tx.referenceCode}</div>
                            )}
                          </td>
                          <td className="p-3 text-zinc-500 whitespace-nowrap">{tx.date}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              tx.type === 'RECEIPT' ? 'bg-orange-100 text-orange-700' : 'bg-rose-100 text-rose-700'
                            }`}>
                              {tx.type === 'RECEIPT' ? 'Nhận Chuyển (+)' : 'Chuyển Đi (-)'}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-zinc-800">{(tx.fundName || 'Quỹ').split('-')[0]}</td>
                          <td className={`p-3 font-black whitespace-nowrap ${
                            tx.type === 'RECEIPT' ? 'text-[#EA580C]' : 'text-[#E23C55]'
                          }`}>
                            {tx.type === 'RECEIPT' ? '+' : '-'}{formatCurrency(tx.amount)}
                          </td>
                          <td className="p-3 text-zinc-600">{tx.creator}</td>
                          <td className="p-3 text-zinc-500 max-w-xs truncate">{tx.notes}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => {
                                setSelectedTx(tx);
                                setIsPrintModalOpen(true);
                              }}
                              className="px-2 py-1 bg-zinc-100 hover:bg-orange-50 hover:text-orange-600 text-zinc-600 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              In phiếu
                            </button>
                          </td>
                        </tr>
                      ))}
                    {transactions.filter(t => t.categoryName.includes('Chuyển quỹ') || t.referenceCode?.startsWith('TRF-')).length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-zinc-400">
                          Chưa có giao dịch chuyển quỹ nội bộ nào. Nhấn "Chuyển quỹ nội bộ" ở trên để thực hiện!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}


        {activeMainTab === 'REPORTS' && (
          <div className="text-center py-20 text-zinc-500 space-y-4">
            <FileText className="w-12 h-12 mx-auto text-zinc-300" />
            <h3 className="font-bold text-[#171717] text-lg">Báo Cáo Sổ Quỹ</h3>
            <p className="text-sm">Biểu đồ thu chi, cơ cấu chi phí, so sánh kỳ trước.</p>
          </div>
        )}
      </div>

      {/* Bottom Sheet for Create Transaction */}
      {isCreateSheetOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setIsCreateSheetOpen(false)} />
          <div className="bg-white rounded-t-3xl p-5 space-y-4 z-10 animate-in slide-in-from-bottom duration-300 shadow-2xl">
            <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto mb-2" />
            <h3 className="font-bold text-lg text-[#171717] mb-4">Tạo chứng từ mới</h3>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleOpenCreateModal('RECEIPT')} className="p-4 bg-orange-50 rounded-2xl flex items-center justify-center space-x-2 text-orange-700 font-bold hover:bg-orange-100 transition-colors">
                <ArrowDownLeft className="w-5 h-5" />
                <span>Phiếu thu</span>
              </button>
              <button onClick={() => handleOpenCreateModal('PAYMENT')} className="p-4 bg-rose-50 rounded-2xl flex items-center justify-center space-x-2 text-rose-700 font-bold hover:bg-rose-100 transition-colors">
                <ArrowUpRight className="w-5 h-5" />
                <span>Phiếu chi</span>
              </button>
              <button onClick={handleOpenTransferModal} className="p-4 bg-zinc-50 rounded-2xl flex items-center justify-center space-x-2 text-zinc-700 font-bold hover:bg-zinc-100 transition-colors cursor-pointer">
                <ArrowRightLeft className="w-5 h-5 text-orange-500" />
                <span>Chuyển quỹ</span>
              </button>
              <button onClick={handleOpenReconcileModal} className="p-4 bg-zinc-50 rounded-2xl flex items-center justify-center space-x-2 text-zinc-700 font-bold hover:bg-zinc-100 transition-colors cursor-pointer">
                <CheckCircle2 className="w-5 h-5 text-orange-500" />
                <span>Đối soát</span>
              </button>
            </div>
            <button onClick={() => setIsCreateSheetOpen(false)} className="w-full py-3.5 bg-zinc-100 rounded-2xl font-bold text-zinc-700 hover:bg-zinc-200 mt-2">
              Hủy bỏ
            </button>
          </div>
        </div>
      )}

      {/* MODAL: TẠO PHIẾU THU / CHI FULL SCREEN */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-white sm:bg-black/60 sm:backdrop-blur-xs z-50 flex items-center justify-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-3xl sm:max-w-2xl overflow-hidden shadow-none sm:shadow-2xl flex flex-col border-0 sm:border sm:border-orange-100">
            {/* Header */}
            <div className={`px-4 py-3.5 sm:px-6 sm:py-5 flex items-center gap-3 shrink-0 ${modalType === 'RECEIPT' ? 'bg-orange-50 border-b border-orange-100' : 'bg-rose-50 border-b border-rose-100'}`}>
              <button onClick={() => setIsCreateModalOpen(false)} className="sm:hidden p-1.5 -ml-2 text-zinc-500 hover:bg-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
              <div className="flex-1 flex items-center space-x-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${modalType === 'RECEIPT' ? 'bg-orange-100 text-orange-600' : 'bg-rose-100 text-rose-600'}`}>
                  {modalType === 'RECEIPT' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-black text-zinc-900 text-base leading-tight">
                    {modalType === 'RECEIPT' ? 'Lập Phiếu Thu Tiền' : 'Lập Phiếu Chi Tiền'}
                  </h3>
                  <p className="text-[10px] text-zinc-500">Hạch toán ghi nhận tức thì</p>
                </div>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="hidden sm:block p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-white rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 bg-white">
              <form onSubmit={handleSubmitTransaction} className="space-y-4">
                
                {/* Amount */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Số tiền (VNĐ) *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className={`text-lg font-black ${modalType === 'RECEIPT' ? 'text-orange-500' : 'text-rose-500'}`}>
                        {modalType === 'RECEIPT' ? '+' : '-'}
                      </span>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="0"
                      value={formData.amount}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        if (val) {
                          setFormData(prev => ({ ...prev, amount: parseInt(val, 10).toLocaleString('vi-VN') }));
                        } else {
                          setFormData(prev => ({ ...prev, amount: '' }));
                        }
                      }}
                      className="w-full pl-8 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xl font-black text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:bg-white focus:outline-none tracking-wider"
                    />
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                      <span className="text-zinc-400 font-bold">VNĐ</span>
                    </div>
                  </div>
                </div>

                {/* Hạng mục */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Hạng mục {modalType === 'RECEIPT' ? 'thu' : 'chi'}
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      const val = e.target.value;
                      const name = e.target.options[e.target.selectedIndex].text;
                      setFormData(prev => ({ ...prev, category: val as any, categoryName: name }));
                    }}
                    className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:ring-2 focus:ring-orange-500 focus:bg-white focus:outline-none"
                  >
                    {modalType === 'RECEIPT' ? (
                      <>
                        <option value="SALES_REVENUE">Thu tiền bán lẻ iPhone, Phụ kiện (POS)</option>
                        <option value="CUSTOMER_DEBT_COLLECT">Thu nợ khách hàng / Giải ngân trả góp</option>
                        <option value="TRADEIN_DIFF_COLLECT">Thu tiền chênh lệch Trade-in thu cũ đổi mới</option>
                        <option value="DEPOSIT">Thu tiền đặt cọc giữ máy</option>
                        <option value="REPAIR_SERVICE">Thu phí dịch vụ sửa chữa / Thay linh kiện</option>
                        <option value="CAPITAL_INVEST">Chủ đầu tư nạp vốn / Bổ sung quỹ</option>
                        <option value="SUPPLIER_REFUND">Nhà cung cấp hoàn tiền hàng</option>
                        <option value="OTHER_INCOME">Thu nhập khác</option>
                      </>
                    ) : (
                      <>
                        <option value="INVENTORY_PURCHASE">Chi nhập hàng iPhone / Phụ kiện từ NCC</option>
                        <option value="SUPPLIER_DEBT_PAY">Chi thanh toán nợ Nhà Cung Cấp</option>
                        <option value="TRADEIN_BUYBACK">Chi tiền mua lại máy cũ khách Trade-in</option>
                        <option value="STORE_RENT">Chi tiền thuê mặt bằng showroom</option>
                        <option value="SALARY_BONUS">Chi lương, thưởng, hoa hồng nhân viên</option>
                        <option value="MARKETING_ADS">Chi phí Marketing, quảng cáo Ads</option>
                        <option value="UTILITIES">Chi tiền điện, nước, internet cửa hàng</option>
                        <option value="WARRANTY_PARTS">Chi mua linh kiện kỹ thuật sửa chữa</option>
                        <option value="CUSTOMER_REFUND">Chi hoàn tiền đổi trả cho khách</option>
                        <option value="OTHER_EXPENSE">Chi phí hoạt động khác</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Tài khoản quỹ */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Tài khoản quỹ *</label>
                    <select
                      value={formData.fundName}
                      onChange={(e) => {
                        const fund = funds.find(f => f.name === e.target.value);
                        if (fund) {
                          setFormData(prev => ({ ...prev, fundName: fund.name, fundType: fund.type }));
                        }
                      }}
                      className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:ring-2 focus:ring-orange-500 focus:bg-white focus:outline-none"
                    >
                      {funds.map((f, i) => (
                        <option key={i} value={f.name}>{f.name} (Dư: {formatCurrency(f.currentBalance)})</option>
                      ))}
                    </select>
                  </div>

                  {/* Chi nhánh */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Chi nhánh thực hiện</label>
                    <select
                      value={formData.branchId || branches[0]?.id || 'CN01'}
                      onChange={(e) => setFormData(prev => ({ ...prev, branchId: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:ring-2 focus:ring-orange-500 focus:bg-white focus:outline-none"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">
                      {modalType === 'RECEIPT' ? 'Khách hàng (Nộp tiền)' : 'Nhà cung cấp (Nhận tiền)'}
                    </label>
                    <div className="relative">
                      <select
                        onChange={(e) => handlePartnerSelect(e.target.value)}
                        className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:ring-2 focus:ring-orange-500 focus:bg-white focus:outline-none appearance-none"
                      >
                        <option value="">-- Chọn khách/NCC có sẵn --</option>
                        {partners.filter(p => modalType === 'RECEIPT' ? p.type === 'CUSTOMER' : p.type === 'SUPPLIER').map(p => (
                          <option key={p.id} value={p.id}>{p.name} - {p.phone}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Tên người nộp / Người nhận</label>
                    <input
                      type="text"
                      placeholder="Ví dụ: Anh Nam, Phone House..."
                      value={formData.partnerName}
                      onChange={(e) => setFormData(prev => ({ ...prev, partnerName: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:ring-2 focus:ring-orange-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Mã tham chiếu (Hóa đơn, UNC...)</label>
                    <input
                      type="text"
                      placeholder="Ví dụ: INV-20250214-001"
                      value={formData.referenceCode}
                      onChange={(e) => setFormData(prev => ({ ...prev, referenceCode: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:ring-2 focus:ring-orange-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Nội dung chi tiết</label>
                    <textarea
                      rows={2}
                      placeholder="Ghi rõ lý do thu chi..."
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:ring-2 focus:ring-orange-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                {/* Sticky Footer */}
                <div className="pt-3 sm:pt-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-0 mt-auto sticky bottom-0 bg-white z-10 border-t border-zinc-100 flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="flex-1 py-3.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-2xl text-sm transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className={`flex-[2] py-3.5 text-white font-bold text-sm rounded-2xl shadow-lg transition-all ${
                      modalType === 'RECEIPT' ? 'bg-[#EA580C] hover:bg-[#128a59] shadow-orange-600/30' : 'bg-[#E23C55] hover:bg-[#c9324a] shadow-rose-600/30'
                    }`}
                  >
                    {modalType === 'RECEIPT' ? 'Lập Phiếu Thu' : 'Lập Phiếu Chi'}
                  </button>
                </div>

              </form>
            </div>
          </div>
        </div>
      )}
      {isTransferModalOpen && (() => {
        const fromFundObj = funds.find(f => f.name === transferData.fromFundName || f.id === transferData.fromFundName);
        const toFundObj = funds.find(f => f.name === transferData.toFundName || f.id === transferData.toFundName);
        const amountNum = parseFloat(transferData.amount.replace(/[^0-9]/g, '')) || 0;
        const fromBalanceAfter = (fromFundObj?.currentBalance || 0) - amountNum;
        const toBalanceAfter = (toFundObj?.currentBalance || 0) + amountNum;

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-orange-100">
              <div className="p-5 bg-gradient-to-r from-orange-50 to-rose-50 border-b border-orange-100 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-zinc-900 text-base">Chuyển Quỹ Tiền Nội Bộ</h3>
                    <p className="text-[11px] text-zinc-500">Cập nhật số dư 2 quỹ tức thời và ghi nhật ký thu/chi</p>
                  </div>
                </div>
                <button onClick={() => setIsTransferModalOpen(false)} className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-white rounded-xl cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitTransfer} className="p-5 space-y-4">
                {/* Visual Transfer Flow Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200">
                    <label className="block text-xs font-bold text-zinc-600 mb-1">1. Quỹ Nguồn (Rút / Chuyển Đi)</label>
                    <select 
                      value={transferData.fromFundName} 
                      onChange={e => setTransferData({...transferData, fromFundName: e.target.value})} 
                      className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:ring-2 focus:ring-orange-500"
                    >
                      {funds.map(f => (
                        <option key={f.id} value={f.name}>
                          {(f.name || 'Quỹ').split('-')[0]} (Dư: {formatCompact(f.currentBalance)})
                        </option>
                      ))}
                    </select>
                    {fromFundObj && (
                      <div className="mt-2 pt-2 border-t border-zinc-200/60 text-[11px] flex justify-between">
                        <span className="text-zinc-500">Số dư hiện tại:</span>
                        <span className="font-bold text-zinc-900">{formatCurrency(fromFundObj.currentBalance)}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200">
                    <label className="block text-xs font-bold text-zinc-600 mb-1">2. Quỹ Đích (Nạp / Nhận Tiền)</label>
                    <select 
                      value={transferData.toFundName} 
                      onChange={e => setTransferData({...transferData, toFundName: e.target.value})} 
                      className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:ring-2 focus:ring-orange-500"
                    >
                      {funds.map(f => (
                        <option key={f.id} value={f.name}>
                          {(f.name || 'Quỹ').split('-')[0]} (Dư: {formatCompact(f.currentBalance)})
                        </option>
                      ))}
                    </select>
                    {toFundObj && (
                      <div className="mt-2 pt-2 border-t border-zinc-200/60 text-[11px] flex justify-between">
                        <span className="text-zinc-500">Số dư hiện tại:</span>
                        <span className="font-bold text-zinc-900">{formatCurrency(toFundObj.currentBalance)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Amount Input */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Số Tiền Cần Chuyển (VNĐ) *</label>
                  <div className="relative">
                    <input 
                      required 
                      type="text" 
                      placeholder="0" 
                      value={transferData.amount} 
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setTransferData({...transferData, amount: val ? parseInt(val).toLocaleString('vi-VN') : ''});
                      }} 
                      className="w-full px-4 py-3 bg-white border border-orange-200 rounded-2xl text-2xl font-black text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500" 
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-sm text-zinc-400">VNĐ</span>
                  </div>

                  {/* Quick Amount Suggestion Buttons */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[1000000, 2000000, 5000000, 10000000, 50000000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTransferData(prev => ({ ...prev, amount: amt.toLocaleString('vi-VN') }))}
                        className="px-2.5 py-1 bg-zinc-100 hover:bg-orange-50 hover:text-orange-700 text-zinc-600 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        +{formatCompact(amt)}
                      </button>
                    ))}
                    {fromFundObj && fromFundObj.currentBalance > 0 && (
                      <button
                        type="button"
                        onClick={() => setTransferData(prev => ({ ...prev, amount: fromFundObj.currentBalance.toLocaleString('vi-VN') }))}
                        className="px-2.5 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Tất cả số dư ({formatCompact(fromFundObj.currentBalance)})
                      </button>
                    )}
                  </div>
                </div>

                {/* Simulated Balance After Transfer */}
                {amountNum > 0 && (
                  <div className="p-3 bg-orange-50/60 rounded-2xl border border-orange-100 text-xs space-y-1.5">
                    <div className="font-bold text-orange-900 flex items-center justify-between">
                      <span>Dự toán số dư sau khi chuyển:</span>
                      <span className="text-[10px] text-orange-600 uppercase font-mono">Tức thời</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-orange-200/50">
                      <div>
                        <span className="text-zinc-500 text-[11px]">{(fromFundObj?.name || 'Quỹ nguồn').split('-')[0]}: </span>
                        <span className={`font-black ${fromBalanceAfter < 0 ? 'text-rose-600' : 'text-zinc-900'}`}>
                          {formatCurrency(fromBalanceAfter)}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[11px]">{(toFundObj?.name || 'Quỹ đích').split('-')[0]}: </span>
                        <span className="font-black text-orange-600">
                          {formatCurrency(toBalanceAfter)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Ghi chú / Lý do chuyển tiền</label>
                  <input 
                    type="text" 
                    value={transferData.notes} 
                    onChange={e => setTransferData({...transferData, notes: e.target.value})} 
                    placeholder="Ví dụ: Rút tiền mặt nộp vào VietQR Techcombank..."
                    className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none" 
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsTransferModalOpen(false)}
                    className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-xs cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit" 
                    className="flex-[2] py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-500/30 text-xs flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>Xác Nhận & Cập Nhật Firestore</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

{isReconcileModalOpen && (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
      <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
        <h3 className="font-bold text-lg">Kiểm kê / Đối soát</h3>
        <button onClick={() => setIsReconcileModalOpen(false)} className="p-1.5 hover:bg-zinc-100 rounded-xl cursor-pointer"><X className="w-5 h-5" /></button>
      </div>
      <form onSubmit={handleSubmitReconcile} className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-500 mb-1">Chọn quỹ cần đối soát</label>
          <select value={reconcileData.fundName} onChange={e => setReconcileData({...reconcileData, fundName: e.target.value})} className="w-full px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-semibold">
            {funds.map(f => <option key={f.id} value={f.name}>{f.name} (SS: {formatCurrency(f.currentBalance)})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-500 mb-1">Số dư thực tế (Đếm được/App Bank)</label>
          <input required type="text" placeholder="Nhập số tiền thực tế..." value={reconcileData.actualBalance} onChange={e => {
            const val = e.target.value.replace(/[^0-9]/g, '');
            setReconcileData({...reconcileData, actualBalance: val ? parseInt(val).toLocaleString('vi-VN') : ''});
          }} className="w-full px-4 py-3 bg-white border border-orange-200 rounded-xl text-xl font-black text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-500 mb-1">Lý do điều chỉnh (nếu lệch)</label>
          <input type="text" value={reconcileData.notes} onChange={e => setReconcileData({...reconcileData, notes: e.target.value})} className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" />
        </div>
        <button type="submit" className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/30 cursor-pointer">Cân bằng sổ sách</button>
      </form>
    </div>
  </div>
)}

{isFundModalOpen && (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
      <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
        <h3 className="font-bold text-lg">{editingFund ? 'Sửa thông tin quỹ' : 'Thêm quỹ / TK Ngân hàng'}</h3>
        <button onClick={() => setIsFundModalOpen(false)} className="p-1.5 hover:bg-zinc-100 rounded-xl cursor-pointer"><X className="w-5 h-5" /></button>
      </div>
      <form onSubmit={handleSubmitFund} className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-500 mb-1">Loại tài khoản</label>
          <select disabled={!!editingFund} value={fundFormData.type} onChange={e => setFundFormData({...fundFormData, type: e.target.value as any})} className="w-full px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-semibold">
            <option value="CASH">Tiền mặt (Két)</option>
            <option value="BANK">Tài khoản ngân hàng</option>
            <option value="POS_CARD">Ví điện tử / Cổng thanh toán</option>
            <option value="INSTALLMENT_CREDIT">Đối tác trả góp (HD Saison, HomeCredit...)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-500 mb-1">Tên quỹ (Ví dụ: Két CN1, VCB - 123...)</label>
          <input required type="text" value={fundFormData.name} onChange={e => setFundFormData({...fundFormData, name: e.target.value})} className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" />
        </div>
        {fundFormData.type !== 'CASH' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-500 mb-1">Tên Ngân Hàng</label>
              <input type="text" value={fundFormData.bankName} onChange={e => setFundFormData({...fundFormData, bankName: e.target.value})} className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 mb-1">Số Tài Khoản</label>
              <input type="text" value={fundFormData.accountNumber} onChange={e => setFundFormData({...fundFormData, accountNumber: e.target.value})} className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm" />
            </div>
          </div>
        )}
        {!editingFund && (
          <div>
            <label className="block text-xs font-bold text-zinc-500 mb-1">Số dư khởi tạo</label>
            <input required type="text" placeholder="0" value={fundFormData.initialBalance} onChange={e => {
              const val = e.target.value.replace(/[^0-9]/g, '');
              setFundFormData({...fundFormData, initialBalance: val ? parseInt(val).toLocaleString('vi-VN') : ''});
            }} className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-lg font-black focus:outline-none focus:ring-2 focus:ring-[#EA580C]" />
          </div>
        )}
        <button type="submit" className="w-full py-3.5 bg-[#171717] hover:bg-black text-white font-bold rounded-xl shadow-lg cursor-pointer">{editingFund ? 'Cập nhật' : 'Tạo tài khoản'}</button>
      </form>
    </div>
  </div>
)}

      {/* MODAL: XEM CHI TIẾT & IN PHIẾU THU CHI K80 */}
      {isPrintModalOpen && selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl border border-orange-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <span className="font-mono text-xs font-bold text-zinc-500">
                CHỨNG TỪ SỐ: {selectedTx.code}
              </span>
              <button
                onClick={() => setIsPrintModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Printable K80 Receipt Voucher Content */}
            <div className="border border-dashed border-zinc-300 rounded-2xl p-4 bg-zinc-50/50 space-y-3 font-mono text-xs text-zinc-800">
              <div className="text-center space-y-1 pb-2 border-b border-dashed border-zinc-300">
                <h4 className="font-black text-sm uppercase tracking-wider text-zinc-900">
                  PHONE HOUSE VIỆT NAM
                </h4>
                <p className="text-[10px] text-zinc-500">Chuyên iPhone Zin Keng • Thu Cũ Đổi Mới</p>
                <div className="font-bold text-base mt-2">
                  {selectedTx.type === 'RECEIPT' ? 'PHIẾU THU TIỀN' : 'PHIẾU CHI TIỀN'}
                </div>
                <div className="text-[11px] text-zinc-500">{selectedTx.date}</div>
              </div>
              <div className="space-y-1.5 pt-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Người nộp/nhận:</span>
                  <span className="font-bold">{selectedTx.partnerName || 'Khách lẻ'}</span>
                </div>
                {selectedTx.partnerPhone && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Số điện thoại:</span>
                    <span className="font-semibold">{selectedTx.partnerPhone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-zinc-500">Hạng mục:</span>
                  <span className="font-bold text-right">{selectedTx.categoryName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Tài khoản quỹ:</span>
                  <span className="font-semibold text-right">{(selectedTx.fundName || 'Quỹ').split('-')[0]}</span>
                </div>
                {selectedTx.referenceCode && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Mã tham chiếu:</span>
                    <span className="font-bold text-orange-600">{selectedTx.referenceCode}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-zinc-500">Người lập phiếu:</span>
                  <span className="font-semibold">{selectedTx.creator}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-dashed border-zinc-300 flex justify-between items-center">
                <span className="font-bold text-xs uppercase">Tổng Số Tiền:</span>
                <span className="font-black text-base text-zinc-900">
                  {selectedTx.amount.toLocaleString('vi-VN')} đ
                </span>
              </div>
              <div className="pt-2 text-[10px] text-zinc-500 italic">
                Ghi chú: {selectedTx.notes}
              </div>
              <div className="pt-3 flex justify-around text-center text-[10px] text-zinc-600">
                <div>
                  <p className="font-bold">Người Nộp / Nhận</p>
                  <p className="text-zinc-400 mt-6">(Ký & ghi rõ họ tên)</p>
                </div>
                <div>
                  <p className="font-bold">Thủ Quỹ / Admin</p>
                  <p className="text-zinc-400 mt-6">(Ký & đóng dấu)</p>
                </div>
              </div>
            </div>
            {/* Print & Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-md shadow-orange-500/20 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>In Phiếu Thu/Chi K80</span>
              </button>
              <button
                onClick={() => setIsPrintModalOpen(false)}
                className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
