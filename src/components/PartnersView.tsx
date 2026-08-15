import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Truck, 
  DollarSign, 
  ShieldCheck, 
  Search, 
  Filter, 
  Plus, 
  Edit3, 
  Trash2, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  TrendingUp, 
  Award, 
  Smartphone, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  CreditCard, 
  Layers, 
  Building2, 
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  Calendar,
  X,
  Printer,
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  SlidersHorizontal
} from 'lucide-react';
import { 
  Partner, 
  PartnerType, 
  CustomerTier, 
  SupplierCategory, 
  DeviceItem 
} from '../types';

interface PartnersViewProps {
  partners: Partner[];
  devices: DeviceItem[];
  initialTab?: 'ALL' | 'CUSTOMERS' | 'SUPPLIERS' | 'DEBT_HUB';
  onAddPartner: (partner: Partner) => void;
  onUpdatePartner: (partner: Partner) => void;
  onDeletePartner: (partnerId: string) => void;
  funds: import('../types').FundAccount[];
  onAddTransaction: (tx: import('../types').CashTransaction) => void;
}

type TimeFilterType = 'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'LAST_MONTH';
type SortOptionType = 'NEWEST' | 'OLDEST' | 'AMOUNT_ASC' | 'AMOUNT_DESC' | 'NAME_AZ';

export const PartnersView: React.FC<PartnersViewProps> = ({
  partners,
  devices,
  initialTab = 'ALL',
  onAddPartner,
  onUpdatePartner,
  onDeletePartner,
  funds,
  onAddTransaction
}) => {
  // Navigation & Filtering
  const [activeTab, setActiveTab] = useState<'ALL' | 'CUSTOMERS' | 'SUPPLIERS' | 'DEBT_HUB'>(initialTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [quickDebtFilter, setQuickDebtFilter] = useState<'ALL' | 'HAS_DEBT' | 'NO_DEBT' | 'VIP_WHOLESALE'>('ALL');
  const [tierFilter, setTierFilter] = useState<string>('ALL');
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');

  // Time & Sort Filter (Matches iOS Screenshot UI)
  const [timeFilter, setTimeFilter] = useState<TimeFilterType>('ALL');
  const [sortOption, setSortOption] = useState<SortOptionType>('AMOUNT_DESC');
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'MINIMAL' | 'DETAILED'>('MINIMAL');
  
  // Selected Partner for 360° Drawer / Detail Modal
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  // Add / Edit Modal
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  
  // Debt Settle Modal
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [debtActionPartner, setDebtActionPartner] = useState<Partner | null>(null);
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleNote, setSettleNote] = useState('');
  const [settleFundId, setSettleFundId] = useState('');
  const [settleDirection, setSettleDirection] = useState<'RECEIPT' | 'PAYMENT'>('RECEIPT');

  // AI Loyalty & Retention Simulation
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<Partner>>({
    type: 'CUSTOMER',
    name: '',
    phone: '',
    email: '',
    address: '',
    taxCode: '',
    customerTier: 'STANDARD',
    supplierCategory: 'LIKE_NEW_WHOLESALER',
    outstandingDebt: 0,
    creditLimit: 10000000,
    favoriteModel: '',
    notes: '',
    tags: []
  });
  const [tagInput, setTagInput] = useState('');

  // Time filter label mapping
  const timeLabels: Record<TimeFilterType, string> = {
    ALL: 'Toàn thời gian',
    TODAY: 'Hôm nay',
    YESTERDAY: 'Hôm qua',
    LAST_7_DAYS: '7 ngày qua',
    THIS_MONTH: 'Tháng này',
    LAST_MONTH: 'Tháng trước'
  };

  // Sort label mapping
  const sortLabels: Record<SortOptionType, string> = {
    NEWEST: 'Mới nhất',
    OLDEST: 'Cũ nhất',
    AMOUNT_ASC: 'Giá trị tăng',
    AMOUNT_DESC: 'Giá trị giảm',
    NAME_AZ: 'Tên (A-Z)'
  };

  // Calculations for Metrics Banner
  const totalCustomers = partners.filter(p => p.type === 'CUSTOMER' || p.type === 'BOTH').length;
  const totalSuppliers = partners.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH').length;
  
  // Outstanding Receivables (Phải thu từ khách) & Payables (Phải trả NCC)
  const totalReceivables = partners
    .filter(p => p.type === 'CUSTOMER' || (p.type === 'BOTH' && p.outstandingDebt > 0))
    .reduce((sum, p) => sum + (p.outstandingDebt || 0), 0);

  const totalPayables = partners
    .filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH')
    .reduce((sum, p) => sum + (p.outstandingDebt || 0), 0);

  // Filtered & Sorted list
  const filteredPartners = useMemo(() => {
    return partners.filter((p) => {
      // Tab filtering
      if (activeTab === 'CUSTOMERS' && p.type !== 'CUSTOMER' && p.type !== 'BOTH') return false;
      if (activeTab === 'SUPPLIERS' && p.type !== 'SUPPLIER' && p.type !== 'BOTH') return false;
      if (activeTab === 'DEBT_HUB' && (!p.outstandingDebt || p.outstandingDebt <= 0)) return false;

      // Quick debt filter
      if (quickDebtFilter === 'HAS_DEBT' && (!p.outstandingDebt || p.outstandingDebt <= 0)) return false;
      if (quickDebtFilter === 'NO_DEBT' && (p.outstandingDebt && p.outstandingDebt > 0)) return false;
      if (quickDebtFilter === 'VIP_WHOLESALE' && p.customerTier !== 'WHOLESALE' && p.customerTier !== 'DIAMOND' && p.supplierCategory !== 'LIKE_NEW_WHOLESALER') return false;

      // Search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchName = p.name.toLowerCase().includes(query);
        const matchPhone = p.phone.includes(query);
        const matchEmail = p.email?.toLowerCase().includes(query) || false;
        const matchAddress = p.address?.toLowerCase().includes(query) || false;
        const matchTags = p.tags?.some(t => t.toLowerCase().includes(query)) || false;
        if (!matchName && !matchPhone && !matchEmail && !matchAddress && !matchTags) {
          return false;
        }
      }

      // Sub filters
      if (tierFilter !== 'ALL' && p.customerTier !== tierFilter) return false;
      if (supplierFilter !== 'ALL' && p.supplierCategory !== supplierFilter) return false;

      return true;
    }).sort((a, b) => {
      if (sortOption === 'NEWEST') {
        return new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime();
      }
      if (sortOption === 'OLDEST') {
        return new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime();
      }
      if (sortOption === 'AMOUNT_ASC') {
        return (a.outstandingDebt || 0) - (b.outstandingDebt || 0);
      }
      if (sortOption === 'AMOUNT_DESC') {
        return (b.outstandingDebt || 0) - (a.outstandingDebt || 0);
      }
      if (sortOption === 'NAME_AZ') {
        return a.name.localeCompare(b.name, 'vi');
      }
      return 0;
    });
  }, [partners, activeTab, quickDebtFilter, searchTerm, tierFilter, supplierFilter, sortOption]);

  const handleOpenAdd = (type: PartnerType = 'SUPPLIER') => {
    setEditingPartner(null);
    setFormData({
      type,
      name: '',
      phone: '',
      email: '',
      address: '',
      taxCode: '',
      customerTier: type === 'CUSTOMER' ? 'STANDARD' : undefined,
      supplierCategory: type === 'SUPPLIER' ? 'LIKE_NEW_WHOLESALER' : undefined,
      outstandingDebt: 0,
      creditLimit: 50000000,
      favoriteModel: '',
      notes: '',
      tags: []
    });
    setTagInput('');
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (partner: Partner) => {
    setEditingPartner(partner);
    setFormData({ ...partner });
    setTagInput('');
    setIsFormModalOpen(true);
  };

  const handleSavePartner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      alert('Vui lòng nhập đầy đủ tên và số điện thoại đối tác!');
      return;
    }

    if (editingPartner) {
      const updated: Partner = {
        ...editingPartner,
        ...formData,
        name: formData.name!,
        phone: formData.phone!,
        type: formData.type || editingPartner.type,
      };
      onUpdatePartner(updated);
      if (selectedPartner?.id === updated.id) {
        setSelectedPartner(updated);
      }
    } else {
      const newId = formData.type === 'CUSTOMER' 
        ? `PT-CUST-${Date.now().toString().slice(-4)}`
        : `PT-SUPP-${Date.now().toString().slice(-4)}`;
      
      const newPartner: Partner = {
        id: newId,
        name: formData.name!,
        phone: formData.phone!,
        type: formData.type || 'SUPPLIER',
        email: formData.email,
        address: formData.address,
        taxCode: formData.taxCode,
        customerTier: formData.customerTier,
        supplierCategory: formData.supplierCategory,
        outstandingDebt: Number(formData.outstandingDebt) || 0,
        creditLimit: Number(formData.creditLimit) || 10000000,
        favoriteModel: formData.favoriteModel,
        notes: formData.notes,
        tags: formData.tags || [],
        createdAt: new Date().toISOString().split('T')[0],
        lastInteraction: new Date().toISOString().split('T')[0]
      };
      onAddPartner(newPartner);
    }
    setIsFormModalOpen(false);
  };

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    if (!formData.tags?.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput.trim()]
      }));
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.filter(t => t !== tagToRemove)
    }));
  };

  const handleOpenDebtSettle = (partner: Partner) => {
    setDebtActionPartner(partner);
    setSettleAmount(partner.outstandingDebt || 0);
    setSettleNote(`Thanh toán đối soát công nợ ngày ${new Date().toLocaleDateString('vi-VN')}`);
    setSettleFundId(funds.find(f => f.type === 'BANK')?.id || funds[0]?.id || '');
    setSettleDirection(partner.type === 'SUPPLIER' ? 'PAYMENT' : 'RECEIPT');
    setIsDebtModalOpen(true);
  };

  const handleConfirmDebtSettle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtActionPartner) return;

    const remaining = Math.max(0, (debtActionPartner.outstandingDebt || 0) - settleAmount);
    
    // Ghi nhận vào sổ quỹ
    const fund = funds.find(f => f.id === settleFundId);
    if (fund) {
      const isReceipt = settleDirection === 'RECEIPT';
      const cashTx: import('../types').CashTransaction = {
        id: `TX-${Date.now()}`,
        code: `${isReceipt ? 'PT' : 'PC'}-${Math.floor(1000 + Math.random() * 9000)}`,
        type: isReceipt ? 'RECEIPT' : 'PAYMENT',
        category: isReceipt ? 'CUSTOMER_DEBT_COLLECT' : 'SUPPLIER_DEBT_PAY',
        categoryName: isReceipt ? 'Thu nợ khách hàng' : 'Chi trả nợ NCC',
        amount: settleAmount,
        fundType: fund.type,
        fundName: fund.name,
        date: new Date().toLocaleString('sv-SE').replace(' ', 'T'), // YYYY-MM-DDTHH:mm
        partnerId: debtActionPartner.id,
        partnerName: debtActionPartner.name,
        creator: 'Nhật Tân (Admin)',
        notes: settleNote,
        status: 'COMPLETED'
      };
      onAddTransaction(cashTx);
    }

    const newTx: any = {
      id: `TX-${Date.now().toString().slice(-6)}`,
      date: new Date().toISOString().split('T')[0],
      type: 'PAYMENT',
      amount: settleAmount,
      note: settleNote
    };

    const updated: Partner = {
      ...debtActionPartner,
      outstandingDebt: remaining,
      debtTransactions: [newTx, ...(debtActionPartner.debtTransactions || [])]
    };

    onUpdatePartner(updated);
    if (selectedPartner?.id === updated.id) {
      setSelectedPartner(updated);
    }
    setIsDebtModalOpen(false);
  };

  const handleGenerateAiRecommendation = (partner: Partner) => {
    setIsAiLoading(true);
    setAiAnalysis(null);
    setTimeout(() => {
      if (partner.type === 'CUSTOMER' || partner.type === 'BOTH') {
        setAiAnalysis(
          `Khách hàng **${partner.name}** thuộc hạng **${partner.customerTier || 'STANDARD'}**, tổng chi tiêu **${(partner.totalSpent || 0).toLocaleString('vi-VN')} đ**. ` +
          `Lịch sử yêu thích: *${partner.favoriteModel || 'iPhone Pro Max'}*. ` +
          `\n\n💡 **Khuyến nghị Upsell & Chăm Sóc Khách:**` +
          `\n1. Chu kỳ sử dụng đã đạt thời điểm vàng nâng cấp, đề xuất gửi tin nhắn Zalo kèm kịch bản Trade-in trợ giá 500.000đ khi lên đời iPhone 16 Pro Max.` +
          `\n2. Khách còn **${partner.loyaltyPoints || 0} điểm thưởng**, đề xuất tặng 01 củ sạc nhanh 30W chính hãng khi mua phụ kiện.`
        );
      } else {
        setAiAnalysis(
          `Đối tác cung ứng **${partner.name}** (${partner.supplierCategory || 'Nguồn hàng sỉ'}), công nợ hiện tại: **${(partner.outstandingDebt || 0).toLocaleString('vi-VN')} đ**. ` +
          `\n\n📦 **Đánh giá nguồn hàng & Tối ưu chi phí:**` +
          `\n1. Nguồn máy Like New cam kết màn zin vỏ zin chất lượng cao, chính sách bảo hành **${partner.warrantyPolicyDays || 30} ngày** rất uy tín.` +
          `\n2. Hạn mức công nợ khả dụng: **${(partner.creditLimit || 0).toLocaleString('vi-VN')} đ**. Đề xuất đối soát thứ 6 hàng tuần để duy trì ưu đãi chiết khấu 1.5% - 2% khi lấy nguyên lô.`
        );
      }
      setIsAiLoading(false);
    }, 500);
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fadeIn pb-12">
      {/* 1. TOP TITLE BAR & ACTION BUTTONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-orange-100 shadow-sm">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-zinc-900 tracking-tight flex items-center gap-2">
                {activeTab === 'SUPPLIERS' ? 'Nhà Cung Cấp & Nguồn Hàng' : activeTab === 'CUSTOMERS' ? 'Khách Hàng & CRM' : 'Đối Tác & Công Nợ Phone House'}
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                  {filteredPartners.length} đối tác
                </span>
              </h1>
              <p className="text-xs text-zinc-500">
                Theo dõi đối soát nợ gối đầu, nguồn hàng Like New/Chính hãng & phân hạng khách
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenAdd(activeTab === 'CUSTOMERS' ? 'CUSTOMER' : 'SUPPLIER')}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-sm shadow-orange-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Thêm {activeTab === 'CUSTOMERS' ? 'Khách Hàng' : 'Nhà Cung Cấp'}</span>
          </button>
        </div>
      </div>

      {/* 2. TAB SELECTOR BAR */}
      <div className="flex items-center space-x-1 p-1 bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'ALL'
              ? 'bg-zinc-900 text-white shadow-xs'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          🌐 Tất Cả ({partners.length})
        </button>
        <button
          onClick={() => setActiveTab('SUPPLIERS')}
          className={`flex-1 min-w-[130px] py-2 px-3 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'SUPPLIERS'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          🏢 Nhà Cung Cấp ({totalSuppliers})
        </button>
        <button
          onClick={() => setActiveTab('CUSTOMERS')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'CUSTOMERS'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          👤 Khách Hàng ({totalCustomers})
        </button>
        <button
          onClick={() => setActiveTab('DEBT_HUB')}
          className={`flex-1 min-w-[120px] py-2 px-3 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'DEBT_HUB'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-rose-600 hover:bg-rose-50'
          }`}
        >
          💳 Sổ Nợ ({partners.filter(p => (p.outstandingDebt || 0) > 0).length})
        </button>
      </div>

      {/* 3. DEBT BANNER - MATCHING USER SCREENSHOT IMG_6058 DIRECTLY */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-zinc-200/80 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              {activeTab === 'CUSTOMERS' ? 'Khách Đang Nợ Cửa Hàng' : 'Nợ Cần Trả Nhà Cung Cấp'} ▾
            </div>
            <div className="text-xl sm:text-2xl font-black text-rose-600 tracking-tight">
              -{ (activeTab === 'CUSTOMERS' ? totalReceivables : totalPayables).toLocaleString('vi-VN') } <span className="text-xs font-normal text-zinc-400">đ</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-500 border-t sm:border-t-0 pt-2 sm:pt-0">
          <div className="text-right">
            <span className="font-bold text-zinc-800">{filteredPartners.length}</span> đối tác đang hiển thị
          </div>
          <div className="h-4 w-px bg-zinc-200"></div>
          <div>
            Hạn mức tín dụng: <strong className="text-zinc-800">1.8 Tỷ đ</strong>
          </div>
        </div>
      </div>

      {/* 4. SEARCH, TIME FILTER DROPDOWN, SORT & VIEW MODE BAR */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-zinc-200/80 shadow-sm p-3.5 sm:p-4 space-y-3">
        {/* Row 1: Search & Filter Pill Buttons */}
        <div className="flex items-center justify-between gap-2">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo tên đối tác, số điện thoại, địa chỉ, tag..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Time Filter Pill Button (Directly from user screenshot) */}
          <div className="relative">
            <button
              onClick={() => setIsTimeDropdownOpen(!isTimeDropdownOpen)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              <span>{timeLabels[timeFilter]}</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            </button>

            {/* Time Filter Modal / Dropdown */}
            {isTimeDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-zinc-200 rounded-2xl shadow-xl z-30 py-1.5 overflow-hidden animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-zinc-100 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Thời gian
                </div>
                {(['ALL', 'TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'THIS_MONTH', 'LAST_MONTH'] as TimeFilterType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTimeFilter(t);
                      setIsTimeDropdownOpen(false);
                    }}
                    className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors ${
                      timeFilter === t
                        ? 'bg-orange-50 text-orange-600 font-bold'
                        : 'text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <span>{timeLabels[t]}</span>
                    {timeFilter === t && <span className="text-orange-500">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort Button (Directly from user screenshot IMG_6058) */}
          <div className="relative">
            <button
              onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
              className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-zinc-700 transition-colors cursor-pointer"
              title="Sắp xếp theo"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>

            {/* Sort Dropdown Modal */}
            {isSortDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-zinc-200 rounded-2xl shadow-xl z-30 py-1.5 overflow-hidden animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-zinc-100 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Sắp xếp theo
                </div>
                {(['AMOUNT_DESC', 'AMOUNT_ASC', 'NEWEST', 'OLDEST', 'NAME_AZ'] as SortOptionType[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSortOption(s);
                      setIsSortDropdownOpen(false);
                    }}
                    className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors ${
                      sortOption === s
                        ? 'bg-orange-50 text-orange-600 font-bold'
                        : 'text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <span>{sortLabels[s]}</span>
                    {sortOption === s && <span className="text-orange-500">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Minimalist vs Detailed Toggle */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200">
            <button
              onClick={() => setViewMode('MINIMAL')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'MINIMAL' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              Tối giản
            </button>
            <button
              onClick={() => setViewMode('DETAILED')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'DETAILED' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              Chi tiết
            </button>
          </div>
        </div>

        {/* Row 2: Quick Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 text-xs">
          <button
            onClick={() => setQuickDebtFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
              quickDebtFilter === 'ALL'
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Tất cả ({partners.length})
          </button>
          <button
            onClick={() => setQuickDebtFilter('HAS_DEBT')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
              quickDebtFilter === 'HAS_DEBT'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/60'
            }`}
          >
            Đang có nợ ({partners.filter(p => (p.outstandingDebt || 0) > 0).length})
          </button>
          <button
            onClick={() => setQuickDebtFilter('NO_DEBT')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
              quickDebtFilter === 'NO_DEBT'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
            }`}
          >
            Đã thanh toán hết (0đ)
          </button>
          <button
            onClick={() => setQuickDebtFilter('VIP_WHOLESALE')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
              quickDebtFilter === 'VIP_WHOLESALE'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200/60'
            }`}
          >
            👑 VIP & Sỉ Like New
          </button>
        </div>
      </div>

      {/* 5. PARTNERS LIST (MINIMALIST SCREENSHOT MATCH VS DETAILED 360) */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-zinc-200/80 shadow-sm overflow-hidden">
        {filteredPartners.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 space-y-2">
            <Users className="w-12 h-12 mx-auto text-zinc-300" />
            <p className="text-sm font-semibold text-zinc-600">Không tìm thấy đối tác nào</p>
            <p className="text-xs">Hãy thử đổi từ khóa tìm kiếm hoặc chọn bộ lọc khác</p>
          </div>
        ) : viewMode === 'MINIMAL' ? (
          /* MINIMALIST ROW LAYOUT (Directly matching iOS Screenshot aesthetics in IMG_6058) */
          <div className="divide-y divide-zinc-100">
            {filteredPartners.map((partner) => (
              <div
                key={partner.id}
                onClick={() => setSelectedPartner(partner)}
                className="px-4 py-3.5 hover:bg-zinc-50 transition-colors flex items-center justify-between cursor-pointer group"
              >
                <div className="space-y-1 min-w-0 pr-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs sm:text-sm text-zinc-900 truncate">
                      {partner.name}
                    </span>
                    {partner.type === 'SUPPLIER' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-700">
                        NCC
                      </span>
                    )}
                    {partner.type === 'CUSTOMER' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-50 text-emerald-700">
                        Khách
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500 flex items-center space-x-2 truncate">
                    <span>{partner.phone}</span>
                    {partner.address && (
                      <>
                        <span>•</span>
                        <span className="truncate max-w-[200px]">{partner.address}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-black text-sm sm:text-base text-rose-600 tracking-tight">
                    {(partner.outstandingDebt || 0).toLocaleString('vi-VN')} <span className="text-[10px] font-normal text-zinc-400">đ</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 group-hover:text-orange-600 transition-colors">
                    Chi tiết & Đối soát ➔
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* DETAILED FULL-TABLE VIEW */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-bold">
                <tr>
                  <th className="px-4 py-3">Tên Đối Tác & Mã</th>
                  <th className="px-4 py-3">Liên Hệ & Địa Chỉ</th>
                  <th className="px-4 py-3">Phân Loại / Hạng</th>
                  <th className="px-4 py-3 text-right">Công Nợ Hiện Tại</th>
                  <th className="px-4 py-3 text-right">Hạn Mức Tín Dụng</th>
                  <th className="px-4 py-3 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredPartners.map((partner) => (
                  <tr key={partner.id} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-zinc-900">{partner.name}</div>
                      <div className="text-[11px] text-zinc-400">{partner.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-zinc-800">{partner.phone}</div>
                      <div className="text-[11px] text-zinc-400 truncate max-w-[220px]">{partner.address || partner.email || 'Chưa cập nhật'}</div>
                    </td>
                    <td className="px-4 py-3">
                      {partner.type === 'SUPPLIER' && (
                        <span className="inline-block px-2 py-0.5 rounded-md font-semibold text-[11px] bg-blue-50 text-blue-700">
                          {partner.supplierCategory || 'Nhà cung cấp'}
                        </span>
                      )}
                      {partner.type === 'CUSTOMER' && (
                        <span className="inline-block px-2 py-0.5 rounded-md font-semibold text-[11px] bg-emerald-50 text-emerald-700">
                          {partner.customerTier || 'Khách chuẩn'}
                        </span>
                      )}
                      {partner.type === 'BOTH' && (
                        <span className="inline-block px-2 py-0.5 rounded-md font-semibold text-[11px] bg-purple-50 text-purple-700">
                          Đối tác song phương
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-black text-sm text-rose-600">
                        {(partner.outstandingDebt || 0).toLocaleString('vi-VN')} đ
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600 font-medium">
                      {(partner.creditLimit || 0).toLocaleString('vi-VN')} đ
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedPartner(partner)}
                          className="px-2 py-1 bg-zinc-100 hover:bg-orange-50 hover:text-orange-600 rounded-lg text-[11px] font-bold text-zinc-700 transition-colors cursor-pointer"
                        >
                          360°
                        </button>
                        <button
                          onClick={() => handleOpenDebtSettle(partner)}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          Trả Nợ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. PARTNER 360° DRAWER / DETAIL MODAL */}
      {selectedPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-5 sm:p-6 shadow-2xl border border-orange-100 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center font-bold text-base shadow-sm">
                  {selectedPartner.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">{selectedPartner.name}</h3>
                  <p className="text-xs text-zinc-500">Mã: {selectedPartner.id} • {selectedPartner.phone}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPartner(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Financial Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-rose-50/70 border border-rose-100 p-3 rounded-2xl">
                <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Công Nợ Hiện Tại</div>
                <div className="text-lg font-black text-rose-600 mt-1">
                  {(selectedPartner.outstandingDebt || 0).toLocaleString('vi-VN')} đ
                </div>
              </div>
              <div className="bg-blue-50/70 border border-blue-100 p-3 rounded-2xl">
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Hạn Mức Tín Dụng</div>
                <div className="text-lg font-black text-blue-600 mt-1">
                  {(selectedPartner.creditLimit || 0).toLocaleString('vi-VN')} đ
                </div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-2xl col-span-2 sm:col-span-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Đánh Giá Uy Tín</div>
                <div className="text-lg font-black text-emerald-600 mt-1 flex items-center gap-1">
                  ★ {selectedPartner.qualityRating || 5.0} / 5.0
                </div>
              </div>
            </div>

            {/* AI Recommendation Box */}
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-orange-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-orange-500" />
                  Trợ Lý AI Phân Tích Đối Tác & Đề Xuất Chiết Khấu
                </span>
                <button
                  onClick={() => handleGenerateAiRecommendation(selectedPartner)}
                  className="px-2.5 py-1 bg-white hover:bg-orange-100 text-orange-600 rounded-xl text-xs font-bold shadow-2xs border border-orange-200 cursor-pointer"
                >
                  {isAiLoading ? 'Đang phân tích...' : '⚡ Chạy Phân Tích'}
                </button>
              </div>
              {aiAnalysis && (
                <div className="text-xs text-zinc-700 leading-relaxed whitespace-pre-line pt-1 border-t border-orange-200/60">
                  {aiAnalysis}
                </div>
              )}
            </div>

            {/* Notes & Tags */}
            {selectedPartner.notes && (
              <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs text-zinc-700">
                <strong>Ghi chú:</strong> {selectedPartner.notes}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => handleOpenDebtSettle(selectedPartner)}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-md shadow-rose-600/20 cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>Thanh Toán / Đối Soát Nợ</span>
              </button>
              <button
                onClick={() => {
                  handleOpenEdit(selectedPartner);
                }}
                className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold text-xs cursor-pointer flex items-center gap-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Sửa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: THANH TOÁN / ĐỐI SOÁT CÔNG NỢ */}
      {isDebtModalOpen && debtActionPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/70 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl border border-orange-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="font-bold text-base text-zinc-900">
                Đối Soát & Thanh Toán Nợ
              </h3>
              <button
                onClick={() => setIsDebtModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmDebtSettle} className="space-y-3.5">
              <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-1">
                <div className="text-xs text-zinc-500">Đối tác: <strong>{debtActionPartner.name}</strong></div>
                <div className="text-xs text-rose-600 font-bold">
                  Dư nợ hiện tại: {(debtActionPartner.outstandingDebt || 0).toLocaleString('vi-VN')} đ
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Số tiền thanh toán đối soát (VND) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-base font-black text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Nguồn tiền / Quỹ thanh toán
                </label>
                <select
                  value={settleFundId}
                  onChange={(e) => setSettleFundId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none mb-3"
                >
                  {funds.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Ghi chú chứng từ thanh toán
                </label>
                <input
                  type="text"
                  value={settleNote}
                  onChange={(e) => setSettleNote(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 rounded-2xl text-white font-bold text-sm bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
                >
                  ✓ Xác Nhận Trừ Nợ & Cập Nhật Sổ Quỹ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL: THÊM / SỬA ĐỐI TÁC */}
      {isFormModalOpen && (
        <div className="fixed inset-0 bg-white sm:bg-zinc-950/70 sm:backdrop-blur-xs z-50 flex items-center justify-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-3xl sm:max-w-lg overflow-hidden shadow-none sm:shadow-2xl flex flex-col border-0 sm:border sm:border-orange-100">
            <div className="bg-white px-4 py-3.5 sm:px-6 sm:py-5 border-b border-orange-100 flex items-center gap-3 shrink-0">
              <button onClick={() => setIsFormModalOpen(false)} className="sm:hidden p-1.5 -ml-2 text-zinc-400 hover:bg-zinc-100 rounded-lg">
                <X className="w-5 h-5 text-zinc-600" />
              </button>
              <h3 className="font-bold text-base text-zinc-900 flex-1">
                {editingPartner ? 'Sửa Đối Tác' : 'Thêm Đối Tác Mới'}
              </h3>
              <button onClick={() => setIsFormModalOpen(false)} className="hidden sm:block p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl cursor-pointer">
                ✕
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 bg-white">
              <form onSubmit={handleSavePartner} className="space-y-3.5">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type: 'SUPPLIER' }))}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    formData.type === 'SUPPLIER' ? 'bg-blue-600 text-white shadow-xs' : 'text-zinc-600'
                  }`}
                >
                  🏢 Nhà Cung Cấp
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type: 'CUSTOMER' }))}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    formData.type === 'CUSTOMER' ? 'bg-emerald-600 text-white shadow-xs' : 'text-zinc-600'
                  }`}
                >
                  👤 Khách Hàng
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Tên đối tác / Thương hiệu <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Top Phone, Phone House Hội An, Anh Tuấn..."
                  value={formData.name || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs sm:text-sm font-semibold text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Số điện thoại <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0932435377..."
                    value={formData.phone || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Công nợ ban đầu (VND)
                  </label>
                  <input
                    type="number"
                    value={formData.outstandingDebt || 0}
                    onChange={(e) => setFormData(prev => ({ ...prev, outstandingDebt: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Địa chỉ showroom / Kho hàng
                </label>
                <input
                  type="text"
                  placeholder="Địa chỉ chi tiết..."
                  value={formData.address || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Ghi chú đối tác
                </label>
                <textarea
                  rows={2}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 sm:pt-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-0 mt-auto sticky bottom-0 bg-white z-10 border-t border-zinc-100">
                <button
                  type="submit"
                  className="w-full py-3 rounded-2xl text-white font-bold text-sm bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/30 transition-all cursor-pointer"
                >
                  ✓ Lưu Đối Tác
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
