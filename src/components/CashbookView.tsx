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
import { CreatePartnerModal } from './CreatePartnerModal';
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
  selectedBranchId?: string;
  transactions: CashTransaction[];
  funds: FundAccount[];
  partners: Partner[];
  onAddTransaction: (transaction: CashTransaction) => void;
  onUpdateFunds?: (funds: FundAccount[]) => void;
  onTransferFunds?: (fromFundId: string, toFundId: string, amount: number, notes: string, creator?: string) => Promise<void> | void;
  onAddPartner?: (partner: Partner) => void | Promise<void>;
}

export const CashbookView: React.FC<CashbookViewProps> = ({
  currentUser,
  branches = [], 
  selectedBranchId = 'ALL',
  transactions = [], 
  funds = [], 
  partners = [], 
  onAddTransaction, 
  onUpdateFunds, 
  onTransferFunds, 
  onAddPartner 
}) => {
  const [activeMainTab, setActiveMainTab] = useState<'TRANSACTIONS' | 'ACCOUNTS' | 'REPORTS'>('TRANSACTIONS');
  const [selectedFundFilter, setSelectedFundFilter] = useState<string>('ALL');
  const [showBalance, setShowBalance] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'RECEIPT' | 'PAYMENT' | 'RETAIL'>('ALL');
  
  // Date filter state
  const [dateFilterMode, setDateFilterMode] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | '7DAYS' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM'>('THIS_MONTH');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Dynamic Branch-scoped Funds
  const displayFunds = useMemo(() => {
    if (!selectedBranchId || selectedBranchId === 'ALL') return funds;
    return funds.filter(f => !f.branchId || f.branchId === 'ALL' || f.branchId === selectedBranchId);
  }, [funds, selectedBranchId]);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // 1. Fund Filter
    if (selectedFundFilter !== 'ALL') {
      result = result.filter(t => t.fundId === selectedFundFilter || (t.fundName && t.fundName.includes(selectedFundFilter)));
    }

    // 2. Type/Category Filter
    if (activeFilter === 'RECEIPT') result = result.filter(t => t.type === 'RECEIPT');
    else if (activeFilter === 'PAYMENT') result = result.filter(t => t.type === 'PAYMENT');
    else if (activeFilter === 'RETAIL') result = result.filter(t => t.category === 'SALES_REVENUE');

    // 3. Date Filter
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateFilterMode === 'TODAY') {
      result = result.filter(t => (t.date || '').startsWith(todayStr));
    } else if (dateFilterMode === 'YESTERDAY') {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      result = result.filter(t => (t.date || '').startsWith(yesterday));
    } else if (dateFilterMode === '7DAYS') {
      const past7 = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      result = result.filter(t => (t.date || '').slice(0, 10) >= past7);
    } else if (dateFilterMode === 'THIS_MONTH') {
      const thisMonth = todayStr.slice(0, 7);
      result = result.filter(t => (t.date || '').startsWith(thisMonth));
    } else if (dateFilterMode === 'LAST_MONTH') {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      const lastMonth = d.toISOString().slice(0, 7);
      result = result.filter(t => (t.date || '').startsWith(lastMonth));
    } else if (dateFilterMode === 'CUSTOM') {
      if (customStartDate) result = result.filter(t => (t.date || '').slice(0, 10) >= customStartDate);
      if (customEndDate) result = result.filter(t => (t.date || '').slice(0, 10) <= customEndDate);
    }

    // 4. Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => 
        (t.code || '').toLowerCase().includes(q) ||
        (t.partnerName || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q) ||
        (t.categoryName || '').toLowerCase().includes(q) ||
        (t.referenceCode || '').toLowerCase().includes(q)
      );
    }

    // 5. Sort newest first (ngày gần nhất lên đầu)
    return result.sort((a, b) => {
      const timeA = new Date(a.date).getTime() || 0;
      const timeB = new Date(b.date).getTime() || 0;
      return timeB - timeA;
    });
  }, [transactions, selectedFundFilter, activeFilter, dateFilterMode, customStartDate, customEndDate, searchQuery]);

  // Accurate Stats calculated from filteredTransactions and displayFunds
  const currentBalance = useMemo(() => displayFunds.reduce((sum, f) => sum + (f.currentBalance || 0), 0), [displayFunds]);
  const totalIn = useMemo(() => filteredTransactions.filter(t => t.type === 'RECEIPT').reduce((s, t) => s + t.amount, 0), [filteredTransactions]);
  const totalOut = useMemo(() => filteredTransactions.filter(t => t.type === 'PAYMENT').reduce((s, t) => s + t.amount, 0), [filteredTransactions]);
  const netFlow = totalIn - totalOut;

  // Dynamic Date Filter Label
  const dateFilterPeriodLabel = useMemo(() => {
    const now = new Date();
    if (dateFilterMode === 'TODAY') return 'Hôm nay (' + now.toLocaleDateString('vi-VN') + ')';
    if (dateFilterMode === 'YESTERDAY') {
      const y = new Date(Date.now() - 86400000);
      return 'Hôm qua (' + y.toLocaleDateString('vi-VN') + ')';
    }
    if (dateFilterMode === '7DAYS') return '7 ngày gần nhất';
    if (dateFilterMode === 'THIS_MONTH') return `Tháng ${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    if (dateFilterMode === 'LAST_MONTH') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `Tháng ${String(lm.getMonth() + 1).padStart(2, '0')}/${lm.getFullYear()}`;
    }
    if (dateFilterMode === 'CUSTOM') return `${customStartDate || '...'} đến ${customEndDate || '...'}`;
    return 'Toàn bộ thời gian';
  }, [dateFilterMode, customStartDate, customEndDate]);

  // Sheet & Modal states
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isCreatePartnerModalOpen, setIsCreatePartnerModalOpen] = useState(false);
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Custom categories list
  const [customReceiptCategories, setCustomReceiptCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ph_custom_receipt_categories');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [customPaymentCategories, setCustomPaymentCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ph_custom_payment_categories');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

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

  const [accountsBranchFilter, setAccountsBranchFilter] = useState<string>(selectedBranchId || 'ALL');

  // Keep accountsBranchFilter in sync if selectedBranchId prop changes
  React.useEffect(() => {
    if (selectedBranchId) {
      setAccountsBranchFilter(selectedBranchId);
    }
  }, [selectedBranchId]);

  // Funds filtered for the ACCOUNTS tab
  const displayedFundsForAccountsTab = useMemo(() => {
    if (!accountsBranchFilter || accountsBranchFilter === 'ALL') return funds;
    return funds.filter(f => !f.branchId || f.branchId === 'ALL' || f.branchId === accountsBranchFilter);
  }, [funds, accountsBranchFilter]);

  const [fundFormData, setFundFormData] = useState({
    name: '',
    type: 'CASH' as PaymentFundType,
    bankName: '',
    accountNumber: '',
    initialBalance: '',
    branchId: selectedBranchId !== 'ALL' ? selectedBranchId : 'ALL'
  });
  const [formData, setFormData] = useState({
    type: 'RECEIPT' as CashTransactionType,
    category: 'SALES_REVENUE',
    categoryName: 'Thu tiền bán lẻ iPhone, Phụ kiện (POS)',
    amount: '',
    fundType: 'BANK' as PaymentFundType,
    fundName: funds.find(f => f.type === 'BANK')?.name || 'Techcombank - 190388889999 (VietQR Chính)',
    partnerId: '',
    partnerName: '',
    partnerType: 'CUSTOMER' as import('../types').PartnerType,
    partnerPhone: '',
    referenceCode: '',
    creator: currentUser?.displayName || 'Nhân viên kế toán',
    notes: '',
    branchId: selectedBranchId !== 'ALL' ? selectedBranchId : (currentUser?.branchId || branches[0]?.id || 'CN01'),
    isPLAccounted: true // Mặc định có hạch toán vào Kết quả kinh doanh
  });

  // Funds filtered for transaction create modal according to chosen branch
  const availableFundsForForm = useMemo(() => {
    const currentBranchId = formData.branchId || (selectedBranchId !== 'ALL' ? selectedBranchId : branches[0]?.id) || 'CN01';
    return funds.filter(f => !f.branchId || f.branchId === 'ALL' || f.branchId === currentBranchId);
  }, [funds, formData.branchId, selectedBranchId, branches]);

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
        initialBalance: fund.openingBalance ? fund.openingBalance.toString() : fund.currentBalance.toString(),
        branchId: fund.branchId || 'ALL'
      });
    } else {
      setFundFormData({
        name: '',
        type: 'CASH',
        bankName: '',
        accountNumber: '',
        initialBalance: '',
        branchId: selectedBranchId !== 'ALL' ? selectedBranchId : 'ALL'
      });
    }
    setIsFundModalOpen(true);
  };

  const handleSubmitFund = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateFunds) return;

    const initialBalNum = parseFloat(fundFormData.initialBalance.replace(/[^0-9]/g, '')) || 0;
    const assignedBranch = branches.find(b => b.id === fundFormData.branchId);
    const assignedBranchName = fundFormData.branchId === 'ALL' ? 'Toàn hệ thống' : (assignedBranch?.name || 'Chi nhánh');
    
    if (editingFund) {
      const updated = funds.map(f => f.id === editingFund.id ? {
        ...f,
        name: fundFormData.name,
        type: fundFormData.type,
        bankName: fundFormData.bankName,
        accountNumber: fundFormData.accountNumber,
        branchId: fundFormData.branchId,
        branch: assignedBranchName
      } : f);
      onUpdateFunds(updated);
    } else {
      const newFund: FundAccount = {
        id: `FUND-${Date.now()}`,
        name: fundFormData.name,
        type: fundFormData.type,
        bankName: fundFormData.bankName,
        accountNumber: fundFormData.accountNumber,
        branchId: fundFormData.branchId,
        branch: assignedBranchName,
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
      branchId: formData.branchId || (selectedBranchId !== 'ALL' ? selectedBranchId : currentUser?.branchId) || branches[0]?.id || 'CN01',
      notes: formData.notes || (formData.type === 'RECEIPT' ? 'Thu tiền theo chứng từ' : 'Chi tiền theo hóa đơn'),
      isPLAccounted: formData.isPLAccounted !== false,
      status: 'COMPLETED'
    };

    onAddTransaction(newTx);
    setIsCreateModalOpen(false);
    setSelectedTx(newTx);
  };

  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen max-w-[1600px] mx-auto p-2 sm:p-4 space-y-4 text-zinc-900 font-sans">
      
      {/* 1. Standard Page Header with consolidated CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-zinc-200 shadow-2xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-[#FF4B16] text-white flex items-center justify-center shadow-md shadow-[#FF4B16]/20 font-bold shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-zinc-900 tracking-tight">Sổ Quỹ & Ngân Hàng</h1>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-50 text-[#FF4B16] border border-orange-200 rounded-full">
                PhoneHouse
              </span>
              {selectedBranchId && selectedBranchId !== 'ALL' && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-full flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-[#FF4B16]" />
                  <span>{branches.find(b => b.id === selectedBranchId)?.name || 'Chi nhánh'}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 font-medium mt-0.5">
              Đối soát thu chi, số dư két tiền mặt và tài khoản VietQR
            </p>
          </div>
        </div>

        {/* Desktop Quick Actions + Mobile Consolidated Menu */}
        <div className="flex items-center gap-2 relative">
          
          {/* Desktop Direct Action 1: + Lập Phiếu Thu (F4) */}
          <button
            type="button"
            onClick={() => handleOpenCreateModal('RECEIPT')}
            className="hidden sm:flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
            title="Lập phiếu thu tiền mặt / chuyển khoản (Phím tắt F4)"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>+ Lập Phiếu Thu</span>
          </button>

          {/* Desktop Direct Action 2: - Lập Phiếu Chi */}
          <button
            type="button"
            onClick={() => handleOpenCreateModal('PAYMENT')}
            className="hidden sm:flex items-center space-x-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
            title="Lập phiếu chi mua hàng, chi phí hoạt động"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>- Lập Phiếu Chi</span>
          </button>

          {/* Desktop: Thao Tác Khác (Chuyển quỹ, Đối soát) | Mobile: Tạo Chứng Từ */}
          <div className="relative flex-1 sm:flex-none">
            <button
              type="button"
              onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
              className="w-full sm:w-auto bg-zinc-900 hover:bg-black text-white font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer"
            >
              <span className="sm:hidden flex items-center space-x-1">
                <Plus className="w-4 h-4 text-[#FF4B16]" />
                <span>Tạo Chứng Từ</span>
              </span>
              <span className="hidden sm:inline">Thao Tác Khác</span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isActionMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isActionMenuOpen && (
              <div 
                className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-2xl shadow-xl border border-zinc-200 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
                onClick={() => setIsActionMenuOpen(false)}
              >
                {/* Mobile-only Thu/Chi items */}
                <div className="sm:hidden">
                  <button
                    type="button"
                    onClick={() => handleOpenCreateModal('RECEIPT')}
                    className="w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition-colors text-left cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                      <ArrowDownLeft className="w-4 h-4 text-emerald-700" />
                    </div>
                    <div>
                      <span className="block text-zinc-900">+ Lập Phiếu Thu</span>
                      <span className="text-[10px] text-zinc-400 font-normal">Thu bán hàng, cọc (F4)</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenCreateModal('PAYMENT')}
                    className="w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors text-left cursor-pointer mt-1"
                  >
                    <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                      <ArrowUpRight className="w-4 h-4 text-rose-700" />
                    </div>
                    <div>
                      <span className="block text-zinc-900">- Lập Phiếu Chi</span>
                      <span className="text-[10px] text-zinc-400 font-normal">Chi mua máy, kho, lương</span>
                    </div>
                  </button>

                  <div className="my-1 border-t border-zinc-100" />
                </div>

                <button
                  type="button"
                  onClick={handleOpenTransferModal}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors text-left cursor-pointer"
                >
                  <ArrowRightLeft className="w-4 h-4 text-[#FF4B16]" />
                  <span>⇄ Chuyển Quỹ Nội Bộ</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenReconcileModal}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors text-left cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  <span>✓ Đối Soát Số Dư Ca</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Sticky Tab Navigation Bar */}
      <div className="bg-white/95 backdrop-blur-md border border-zinc-200 rounded-2xl p-1.5 shadow-2xs sticky top-0 z-20 flex items-center justify-between">
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
                type="button"
                onClick={() => setActiveMainTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                  isActive
                    ? 'bg-[#FF4B16] text-white shadow-xs'
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

        <div className="hidden sm:flex items-center space-x-2 text-xs font-semibold text-zinc-500 pr-2">
          <span>Kỳ:</span>
          <span className="font-mono font-bold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded-md border border-zinc-200">
            {dateFilterPeriodLabel}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        
        {activeMainTab === 'TRANSACTIONS' && (
          <>
            {/* 3. Financial KPIs: 4 Clean White Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-zinc-500 font-bold mb-1">
                  <span>Số Dư Khả Dụng</span>
                  <button onClick={() => setShowBalance(!showBalance)} className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 cursor-pointer">
                    {showBalance ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-xl sm:text-2xl font-bold font-mono text-zinc-900 tracking-tight">
                  {showBalance ? formatCurrency(currentBalance) : '***.***.*** đ'}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1 font-medium truncate">
                  {displayFunds.length} quỹ tại chi nhánh
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-emerald-700 font-bold mb-1">
                  <span className="flex items-center gap-1">
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    <span>Tổng Thu Vào (+)</span>
                  </span>
                </div>
                <p className="text-xl sm:text-2xl font-bold font-mono text-emerald-700 tracking-tight">
                  +{showBalance ? formatCurrency(totalIn) : '***'}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1 font-medium truncate">
                  {dateFilterPeriodLabel}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-rose-700 font-bold mb-1">
                  <span className="flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Tổng Chi Ra (-)</span>
                  </span>
                </div>
                <p className="text-xl sm:text-2xl font-bold font-mono text-rose-700 tracking-tight">
                  -{showBalance ? formatCurrency(totalOut) : '***'}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1 font-medium truncate">
                  {dateFilterPeriodLabel}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-zinc-600 font-bold mb-1">
                  <span>Dòng Tiền Thuần (Net)</span>
                </div>
                <p className={`text-xl sm:text-2xl font-bold font-mono tracking-tight ${netFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {showBalance ? (netFlow > 0 ? '+' : '') + formatCurrency(netFlow) : '***'}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1 font-medium truncate">
                  Thu (-) Chi trong kỳ
                </p>
              </div>
            </div>

            {/* 4. Fund Carousel */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Tài khoản & Két tiền ({displayFunds.length})</h3>
                <button onClick={() => setActiveMainTab('ACCOUNTS')} className="text-[#FF4B16] text-xs font-bold hover:underline cursor-pointer">
                  Quản lý quỹ & tài khoản ›
                </button>
              </div>
              <div className="flex space-x-3 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-zinc-200">
                {displayFunds.map((fund) => {
                  const isSelected = selectedFundFilter === fund.id;
                  const balance = fund.currentBalance ?? (fund as any).balance ?? 0;
                  const assignedBranch = branches.find(b => b.id === fund.branchId);
                  const branchTag = fund.branchId && fund.branchId !== 'ALL' ? (assignedBranch?.name || fund.branch || 'Chi nhánh') : 'Toàn HT';

                  return (
                    <div
                      key={fund.id}
                      onClick={() => setSelectedFundFilter(selectedFundFilter === fund.id ? 'ALL' : fund.id)}
                      className={`cursor-pointer border rounded-2xl p-3 min-w-[180px] shrink-0 flex flex-col justify-between transition-all ${
                        isSelected
                          ? 'bg-orange-50/50 border-[#FF4B16] shadow-xs ring-1 ring-[#FF4B16]'
                          : 'bg-white border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      <div className="flex items-center space-x-2 mb-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold ${
                          fund.type === 'CASH' ? 'bg-orange-100 text-[#FF4B16]' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {fund.type === 'CASH' ? <Wallet className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-zinc-900 truncate">{fund.name}</p>
                          <p className="text-[10px] text-zinc-400 truncate">
                            {fund.type === 'CASH' ? 'Két tiền' : fund.bankName || 'Ngân hàng'} • {branchTag}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs font-bold font-mono text-zinc-900">
                        {showBalance ? formatCurrency(balance) : '***.*** đ'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. Unified Clean Filter Bar */}
            <div className="bg-white p-3 sm:p-4 rounded-2xl border border-zinc-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo mã chứng từ (PT/PC), đối tác, nội dung thu chi..."
                  className="w-full pl-9 pr-8 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium text-zinc-900 focus:bg-white focus:outline-none focus:border-[#FF4B16] transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Type Filter Dropdown */}
              <select
                value={activeFilter}
                onChange={e => setActiveFilter(e.target.value as any)}
                className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 focus:bg-white focus:outline-none focus:border-[#FF4B16]"
              >
                <option value="ALL">Tất cả thu & chi</option>
                <option value="RECEIPT">Chỉ xem Thu tiền (+)</option>
                <option value="PAYMENT">Chỉ xem Chi tiền (-)</option>
                <option value="RETAIL">Doanh thu bán lẻ POS</option>
              </select>

              {/* Date Filter Dropdown */}
              <select
                value={dateFilterMode}
                onChange={e => setDateFilterMode(e.target.value as any)}
                className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 focus:bg-white focus:outline-none focus:border-[#FF4B16]"
              >
                <option value="THIS_MONTH">Tháng này ({new Date().getMonth() + 1}/{new Date().getFullYear()})</option>
                <option value="TODAY">Hôm nay</option>
                <option value="YESTERDAY">Hôm qua</option>
                <option value="7DAYS">7 ngày gần nhất</option>
                <option value="LAST_MONTH">Tháng trước</option>
                <option value="ALL">Toàn bộ thời gian</option>
                <option value="CUSTOM">Tùy chọn khoảng ngày...</option>
              </select>

              {/* Fund Filter Dropdown */}
              <select
                value={selectedFundFilter}
                onChange={e => setSelectedFundFilter(e.target.value)}
                className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 focus:bg-white focus:outline-none focus:border-[#FF4B16]"
              >
                <option value="ALL">Tất cả quỹ & tài khoản</option>
                {displayFunds.map(f => (
                  <option key={f.id} value={f.id}>{f.name} ({f.type === 'CASH' ? 'Két' : 'Bank'})</option>
                ))}
              </select>

              {dateFilterMode === 'CUSTOM' && (
                <div className="flex items-center space-x-1.5 text-xs bg-zinc-50 p-1.5 rounded-xl border border-zinc-200">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="px-2 py-1 bg-white border border-zinc-200 rounded-lg text-[11px] font-medium"
                  />
                  <span className="text-zinc-400 font-bold">-</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="px-2 py-1 bg-white border border-zinc-200 rounded-lg text-[11px] font-medium"
                  />
                </div>
              )}
            </div>

            {/* 6. Transaction Ledger: Desktop Table & Mobile Cards */}
            <div className="space-y-2 pb-12">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-600 px-1">
                <span>Nhật ký thu chi ({filteredTransactions.length} chứng từ)</span>
                <span className="text-[11px] font-mono text-zinc-400 font-normal">
                  Sắp xếp mới nhất lên đầu
                </span>
              </div>

              {/* DESKTOP TABLE VIEW (>= lg) */}
              <div className="hidden lg:block bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/80 border-b border-zinc-200 text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4">Thời gian</th>
                      <th className="py-3 px-3">Mã CT</th>
                      <th className="py-3 px-3">Đối tác / Khách</th>
                      <th className="py-3 px-4">Nội dung diễn giải</th>
                      <th className="py-3 px-3">Quỹ & Chi nhánh</th>
                      <th className="py-3 px-3 text-right">Thu (+VNĐ)</th>
                      <th className="py-3 px-3 text-right">Chi (-VNĐ)</th>
                      <th className="py-3 px-3 text-center">P&L</th>
                      <th className="py-3 px-4 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-zinc-400">
                          <Wallet className="w-8 h-8 mx-auto mb-2 text-zinc-300" />
                          <p className="font-semibold text-xs text-zinc-500">Không có giao dịch thu chi nào phù hợp</p>
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((tx) => {
                        const assignedBranch = branches.find(b => b.id === tx.branchId);
                        const branchLabel = tx.branchId && tx.branchId !== 'ALL' ? (assignedBranch?.name || 'Chi nhánh') : 'Toàn HT';

                        return (
                          <tr 
                            key={tx.id}
                            onClick={() => {
                              setSelectedTx(tx);
                              setIsPrintModalOpen(true);
                            }}
                            className="hover:bg-orange-50/30 transition-colors cursor-pointer group"
                          >
                            <td className="py-3 px-4 font-mono text-zinc-500 text-[11px] whitespace-nowrap">
                              {tx.date}
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-mono font-bold px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 border border-zinc-200 text-[11px]">
                                {tx.code}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-semibold text-zinc-900 max-w-[160px] truncate">
                              {tx.partnerName || 'Khách vãng lai / Đối tác'}
                            </td>
                            <td className="py-3 px-4 text-zinc-600 max-w-[220px] truncate font-medium">
                              {tx.notes || tx.categoryName}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <span className="font-semibold text-zinc-800">{tx.fundName || 'Quỹ tiền'}</span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-500 font-medium">
                                  {branchLabel}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                              {tx.type === 'RECEIPT' ? `+${formatCurrency(tx.amount)}` : '—'}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                              {tx.type === 'PAYMENT' ? `-${formatCurrency(tx.amount)}` : '—'}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {tx.isPLAccounted !== false ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                                  P&L
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded">
                                  Nội bộ
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                type="button"
                                className="p-1.5 text-zinc-400 hover:text-[#FF4B16] hover:bg-orange-50 rounded-lg transition-colors cursor-pointer"
                                title="Xem và in phiếu thu/chi"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARDS VIEW (< lg) */}
              <div className="lg:hidden space-y-2">
                {filteredTransactions.map(tx => (
                  <div 
                    key={tx.id} 
                    onClick={() => {
                      setSelectedTx(tx);
                      setIsPrintModalOpen(true);
                    }}
                    className="bg-white border border-zinc-200 rounded-2xl p-3 sm:p-4 flex items-center justify-between hover:shadow-md cursor-pointer transition-all hover:border-orange-200 group"
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
                          {tx.isPLAccounted !== false ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                              P&L
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-zinc-100 text-zinc-500 rounded">
                              Luân chuyển
                            </span>
                          )}
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
                    <div className="flex items-center space-x-2 shrink-0 ml-2">
                      <p className={`font-bold font-mono text-xs sm:text-sm ${
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
            
            {/* Branch Filter Chip Bar for Funds */}
            {branches.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <span className="text-xs font-bold text-zinc-500 mr-1 shrink-0">Chi nhánh:</span>
                <button
                  type="button"
                  onClick={() => setAccountsBranchFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    accountsBranchFilter === 'ALL'
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  🌐 Tất cả chi nhánh ({funds.length})
                </button>
                {branches.map(b => {
                  const count = funds.filter(f => f.branchId === b.id).length;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setAccountsBranchFilter(b.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                        accountsBranchFilter === b.id
                          ? 'bg-[#ff4b16] text-white shadow-xs'
                          : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      <Building2 className="w-3 h-3" />
                      <span>{b.name}</span>
                      <span className="text-[10px] opacity-80">({count})</span>
                    </button>
                  );
                })}
              </div>
            )}
            
            {/* Account Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {displayedFundsForAccountsTab.map((fund) => {
                const assignedBranch = branches.find(b => b.id === fund.branchId);
                const branchLabel = fund.branchId && fund.branchId !== 'ALL' ? (assignedBranch?.name || fund.branch || 'Chi nhánh') : 'Toàn hệ thống';
                const isAllBranch = !fund.branchId || fund.branchId === 'ALL';

                return (
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
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-black text-[#171717] text-base">{(fund.name || 'Quỹ').split('-')[0]?.trim() || fund.name}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              fund.type === 'CASH' ? 'bg-orange-100 text-orange-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {fund.type === 'CASH' ? 'Két tiền mặt' : 'Ngân hàng'}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                              isAllBranch 
                                ? 'bg-zinc-100 text-zinc-600 border-zinc-200' 
                                : 'bg-orange-50 text-[#ff4b16] border-orange-200'
                            }`}>
                              {isAllBranch ? '🌐' : <Building2 className="w-3 h-3 text-[#ff4b16]" />}
                              <span>{branchLabel}</span>
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
                );
              })}
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-zinc-700">
                      Hạng mục {modalType === 'RECEIPT' ? 'thu' : 'chi'} *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddCategoryModalOpen(true)}
                      className="text-[11px] font-bold text-[#ff4b16] hover:underline flex items-center space-x-0.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tạo nhóm mới</span>
                    </button>
                  </div>
                  <div className="flex items-center space-x-1.5">
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
                          <optgroup label="Danh mục Thu chuẩn">
                            <option value="SALES_REVENUE">Thu tiền bán lẻ iPhone, Phụ kiện (POS)</option>
                            <option value="CUSTOMER_DEBT_COLLECT">Thu nợ khách hàng / Giải ngân trả góp</option>
                            <option value="TRADEIN_DIFF_COLLECT">Thu tiền chênh lệch Trade-in thu cũ đổi mới</option>
                            <option value="DEPOSIT">Thu tiền đặt cọc giữ máy</option>
                            <option value="REPAIR_SERVICE">Thu phí dịch vụ sửa chữa / Thay linh kiện</option>
                            <option value="CAPITAL_INVEST">Chủ đầu tư nạp vốn / Bổ sung quỹ</option>
                            <option value="SUPPLIER_REFUND">Nhà cung cấp hoàn tiền hàng</option>
                            <option value="OTHER_INCOME">Thu nhập khác</option>
                          </optgroup>
                          {customReceiptCategories.length > 0 && (
                            <optgroup label="Danh mục Thu tự tạo">
                              {customReceiptCategories.map((c, i) => (
                                <option key={i} value={c}>{c}</option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      ) : (
                        <>
                          <optgroup label="Danh mục Chi chuẩn">
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
                          </optgroup>
                          {customPaymentCategories.length > 0 && (
                            <optgroup label="Danh mục Chi tự tạo">
                              {customPaymentCategories.map((c, i) => (
                                <option key={i} value={c}>{c}</option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIsAddCategoryModalOpen(true)}
                      className="p-2.5 bg-orange-50 hover:bg-orange-100 text-[#ff4b16] border border-orange-200 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
                      title="Thêm hạng mục mới"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Chi nhánh */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Chi nhánh phát sinh *</label>
                    <select
                      value={formData.branchId || (selectedBranchId !== 'ALL' ? selectedBranchId : branches[0]?.id || 'CN01')}
                      onChange={(e) => {
                        const newBranchId = e.target.value;
                        const matchingFunds = funds.filter(f => !f.branchId || f.branchId === 'ALL' || f.branchId === newBranchId);
                        const currentFundValid = matchingFunds.some(f => f.name === formData.fundName);
                        const nextFund = currentFundValid ? formData.fundName : (matchingFunds[0]?.name || funds[0]?.name || '');
                        const nextFundObj = funds.find(f => f.name === nextFund);
                        setFormData(prev => ({ 
                          ...prev, 
                          branchId: newBranchId,
                          fundName: nextFund,
                          fundType: nextFundObj?.type || prev.fundType
                        }));
                      }}
                      className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:ring-2 focus:ring-orange-500 focus:bg-white focus:outline-none"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>🏢 {b.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Tài khoản quỹ */}
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Tài khoản quỹ tương ứng *</label>
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
                      {availableFundsForForm.map((f, i) => {
                        const assignedBranch = branches.find(b => b.id === f.branchId);
                        const branchTag = f.branchId && f.branchId !== 'ALL' 
                          ? `[${assignedBranch?.name || f.branch || 'Chi nhánh'}]` 
                          : '[Toàn HT]';
                        return (
                          <option key={i} value={f.name}>{f.name} {branchTag} (Dư: {formatCurrency(f.currentBalance)})</option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-zinc-700">
                        {modalType === 'RECEIPT' ? 'Khách hàng (Nộp tiền)' : 'Nhà cung cấp (Nhận tiền)'}
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCreatePartnerModalOpen(true)}
                        className="text-[11px] font-bold text-[#ff4b16] hover:underline flex items-center space-x-0.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tạo mới</span>
                      </button>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <div className="relative flex-1">
                        <select
                          value={formData.partnerId}
                          onChange={(e) => handlePartnerSelect(e.target.value)}
                          className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:ring-2 focus:ring-orange-500 focus:bg-white focus:outline-none appearance-none"
                        >
                          <option value="">-- Chọn khách/NCC có sẵn --</option>
                          {partners.filter(p => modalType === 'RECEIPT' ? (p.type === 'CUSTOMER' || p.type === 'BOTH') : (p.type === 'SUPPLIER' || p.type === 'BOTH')).map(p => (
                            <option key={p.id} value={p.id}>{p.name} - {p.phone}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCreatePartnerModalOpen(true)}
                        className="p-2.5 bg-orange-50 hover:bg-orange-100 text-[#ff4b16] border border-orange-200 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
                        title="Tạo nhanh đối tác mới"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
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

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Mã tham chiếu (Hóa đơn, UNC...)</label>
                    <input
                      type="text"
                      placeholder="Ví dụ: INV-20250214-001 hoặc PN-001"
                      value={formData.referenceCode}
                      onChange={(e) => setFormData(prev => ({ ...prev, referenceCode: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:ring-2 focus:ring-orange-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 mb-1">Nội dung chi tiết & Lý do</label>
                    <textarea
                      rows={2}
                      placeholder="Ghi rõ lý do thu chi..."
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:ring-2 focus:ring-orange-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  {/* P&L Accounting Checkbox */}
                  <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex items-start space-x-2.5">
                    <input
                      type="checkbox"
                      id="isPLAccounted"
                      checked={formData.isPLAccounted}
                      onChange={(e) => setFormData(prev => ({ ...prev, isPLAccounted: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 rounded text-[#ff4b16] focus:ring-[#ff4b16] border-zinc-300 cursor-pointer accent-[#ff4b16]"
                    />
                    <label htmlFor="isPLAccounted" className="text-xs text-zinc-800 cursor-pointer select-none">
                      <span className="font-bold block text-zinc-900">Hạch toán vào Kết quả hoạt động kinh doanh (P&L)</span>
                      <span className="text-[11px] text-zinc-500 block mt-0.5">
                        {formData.isPLAccounted 
                          ? '✓ Mặc định: Giao dịch này sẽ được ghi nhận vào Báo Cáo Doanh Thu / Chi Phí kinh doanh định kỳ.' 
                          : '⚡ Bỏ chọn: Giao dịch này chỉ tác động số dư quỹ (luân chuyển vốn, nạp/rút vốn, cho mượn tạm...).'}
                      </span>
                    </label>
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
                      {funds.map(f => {
                        const assignedBranch = branches.find(b => b.id === f.branchId);
                        const branchTag = f.branchId && f.branchId !== 'ALL' ? `[${assignedBranch?.name || f.branch || 'Chi nhánh'}]` : '[Toàn HT]';
                        return (
                          <option key={f.id} value={f.name}>
                            {(f.name || 'Quỹ').split('-')[0]} {branchTag} (Dư: {formatCompact(f.currentBalance)})
                          </option>
                        );
                      })}
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
                      {funds.map(f => {
                        const assignedBranch = branches.find(b => b.id === f.branchId);
                        const branchTag = f.branchId && f.branchId !== 'ALL' ? `[${assignedBranch?.name || f.branch || 'Chi nhánh'}]` : '[Toàn HT]';
                        return (
                          <option key={f.id} value={f.name}>
                            {(f.name || 'Quỹ').split('-')[0]} {branchTag} (Dư: {formatCompact(f.currentBalance)})
                          </option>
                        );
                      })}
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
          <label className="block text-xs font-bold text-zinc-500 mb-1">Chi nhánh áp dụng quỹ</label>
          <select 
            value={fundFormData.branchId} 
            onChange={e => setFundFormData({...fundFormData, branchId: e.target.value})} 
            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:ring-2 focus:ring-orange-500"
          >
            <option value="ALL">🌐 Toàn hệ thống (Dùng chung)</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>🏢 {b.name}</option>
            ))}
          </select>
          <p className="text-[10px] text-zinc-400 mt-1">
            {fundFormData.branchId === 'ALL' 
              ? 'Quỹ dùng chung cho toàn bộ cửa hàng & báo cáo tổng.' 
              : 'Quỹ thuộc riêng két tiền hoặc tài khoản thu của chi nhánh đã chọn.'}
          </p>
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

      {/* MODAL: TẠO NHANH ĐỐI TÁC (KHÁCH HÀNG / NCC) */}
      <CreatePartnerModal
        isOpen={isCreatePartnerModalOpen}
        onClose={() => setIsCreatePartnerModalOpen(false)}
        defaultType={modalType === 'RECEIPT' ? 'CUSTOMER' : 'SUPPLIER'}
        onSavePartner={async (newPartner) => {
          if (onAddPartner) {
            await onAddPartner(newPartner);
          }
          // Auto-select into current form
          setFormData(prev => ({
            ...prev,
            partnerId: newPartner.id,
            partnerName: newPartner.name,
            partnerPhone: newPartner.phone || '',
            partnerType: newPartner.type
          }));
        }}
      />

      {/* MODAL: TẠO HẠNG MỤC THU / CHI MỚI */}
      {isAddCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-zinc-200/80 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-[#ff4b16] text-white flex items-center justify-center font-bold text-xs">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-zinc-900 text-sm">Tạo Hạng Mục {modalType === 'RECEIPT' ? 'Thu' : 'Chi'} Mới</h3>
                  <p className="text-[10px] text-zinc-500">Tự động lưu và hiển thị trong danh mục</p>
                </div>
              </div>
              <button onClick={() => setIsAddCategoryModalOpen(false)} className="text-zinc-400 hover:text-zinc-700 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!newCategoryName.trim()) return;
              const cat = newCategoryName.trim();
              if (modalType === 'RECEIPT') {
                const updated = [...customReceiptCategories, cat];
                setCustomReceiptCategories(updated);
                localStorage.setItem('ph_custom_receipt_categories', JSON.stringify(updated));
                setFormData(prev => ({ ...prev, category: cat as any, categoryName: cat }));
              } else {
                const updated = [...customPaymentCategories, cat];
                setCustomPaymentCategories(updated);
                localStorage.setItem('ph_custom_payment_categories', JSON.stringify(updated));
                setFormData(prev => ({ ...prev, category: cat as any, categoryName: cat }));
              }
              setNewCategoryName('');
              setIsAddCategoryModalOpen(false);
            }} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Tên Hạng Mục Mới *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder={modalType === 'RECEIPT' ? 'VD: Thu thanh lý ve chai...' : 'VD: Chi tiền nước uống khách...'}
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16]"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCategoryModalOpen(false)}
                  className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-2 bg-[#ff4b16] hover:bg-[#e03e0e] text-white font-bold text-xs rounded-xl shadow-sm"
                >
                  Lưu & Chọn Ngay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
