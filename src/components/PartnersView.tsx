import React, { useState } from 'react';
import {
  Users,
  Truck,
  Building2,
  Phone,
  Mail,
  MapPin,
  Search,
  Filter,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Smartphone,
  Star,
  Award,
  Sparkles,
  CreditCard,
  History,
  FileText,
  Tag,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Eye,
  Edit3,
  Trash2,
  Send,
  MessageSquare,
  ShieldCheck,
  Zap,
  TrendingUp,
  Download,
  Share2,
  Calendar,
  Layers,
  ShoppingBag
} from 'lucide-react';
import { Partner, PartnerType, CustomerTier, SupplierCategory, DeviceItem } from '../types';

interface PartnersViewProps {
  partners: Partner[];
  devices: DeviceItem[];
  onAddPartner: (partner: Partner) => void;
  onUpdatePartner: (partner: Partner) => void;
  onDeletePartner: (partnerId: string) => void;
}

export const PartnersView: React.FC<PartnersViewProps> = ({
  partners,
  devices,
  onAddPartner,
  onUpdatePartner,
  onDeletePartner
}) => {
  // Navigation & Filtering
  const [activeTab, setActiveTab] = useState<'ALL' | 'CUSTOMERS' | 'SUPPLIERS' | 'DEBT_HUB'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('ALL');
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');
  
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

  // Calculations for Metrics Banner
  const totalCustomers = partners.filter(p => p.type === 'CUSTOMER' || p.type === 'BOTH').length;
  const totalSuppliers = partners.filter(p => p.type === 'SUPPLIER' || p.type === 'BOTH').length;
  
  // Outstanding Receivables (Phải thu từ khách) & Payables (Phải trả NCC)
  const totalReceivables = partners
    .filter(p => p.type === 'CUSTOMER' || (p.type === 'BOTH' && p.outstandingDebt > 0))
    .reduce((sum, p) => sum + (p.outstandingDebt || 0), 0);

  const totalPayables = partners
    .filter(p => p.type === 'SUPPLIER')
    .reduce((sum, p) => sum + (p.outstandingDebt || 0), 0);

  const filteredPartners = partners.filter((p) => {
    // Tab filtering
    if (activeTab === 'CUSTOMERS' && p.type !== 'CUSTOMER' && p.type !== 'BOTH') return false;
    if (activeTab === 'SUPPLIERS' && p.type !== 'SUPPLIER' && p.type !== 'BOTH') return false;
    if (activeTab === 'DEBT_HUB' && (!p.outstandingDebt || p.outstandingDebt <= 0)) return false;

    // Search
    const matchSearch = 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone.includes(searchTerm) ||
      (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.address && p.address.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.tags && p.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase())));

    // Sub filters
    if (tierFilter !== 'ALL' && p.customerTier !== tierFilter) return false;
    if (supplierFilter !== 'ALL' && p.supplierCategory !== supplierFilter) return false;

    return matchSearch;
  });

  const handleOpenAdd = (type: PartnerType = 'CUSTOMER') => {
    setEditingPartner(null);
    setFormData({
      type,
      name: '',
      phone: '',
      email: '',
      address: '',
      taxCode: '',
      customerTier: type === 'CUSTOMER' ? 'STANDARD' : undefined,
      supplierCategory: type === 'SUPPLIER' ? 'OFFICIAL_DISTRIBUTOR' : undefined,
      outstandingDebt: 0,
      creditLimit: 10000000,
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
        : formData.type === 'SUPPLIER'
        ? `PT-SUPP-${Date.now().toString().slice(-4)}`
        : `PT-BOTH-${Date.now().toString().slice(-4)}`;

      const newPartner: Partner = {
        id: newId,
        type: formData.type || 'CUSTOMER',
        name: formData.name!,
        phone: formData.phone!,
        email: formData.email,
        address: formData.address,
        taxCode: formData.taxCode,
        customerTier: formData.customerTier,
        supplierCategory: formData.supplierCategory,
        loyaltyPoints: formData.type === 'CUSTOMER' ? 100 : 0,
        totalSpent: 0,
        totalPurchasedFrom: 0,
        outstandingDebt: Number(formData.outstandingDebt) || 0,
        creditLimit: Number(formData.creditLimit) || 10000000,
        favoriteModel: formData.favoriteModel,
        qualityRating: formData.type === 'SUPPLIER' ? 5 : undefined,
        createdAt: new Date().toISOString().split('T')[0],
        lastInteraction: new Date().toISOString().split('T')[0],
        notes: formData.notes,
        tags: formData.tags || []
      };
      onAddPartner(newPartner);
    }
    setIsFormModalOpen(false);
  };

  const handleAddTag = () => {
    if (tagInput.trim()) {
      const currentTags = formData.tags || [];
      if (!currentTags.includes(tagInput.trim())) {
        setFormData({ ...formData, tags: [...currentTags, tagInput.trim()] });
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: (formData.tags || []).filter(t => t !== tagToRemove)
    });
  };

  const handleOpenDebtSettle = (partner: Partner) => {
    setDebtActionPartner(partner);
    setSettleAmount(partner.outstandingDebt || 0);
    setSettleNote(`Thanh toán đối soát ngày ${new Date().toLocaleDateString('vi-VN')}`);
    setIsDebtModalOpen(true);
  };

  const handleConfirmDebtSettle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtActionPartner) return;

    const remaining = Math.max(0, (debtActionPartner.outstandingDebt || 0) - settleAmount);
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
          `\n\n💡 **Khuyến nghị Upsell / Retention của AI:**` +
          `\n1. Máy hiện tại đã đến chu kỳ 12 tháng sử dụng, đề xuất gửi tin nhắn Zalo kèm kịch bản Trade-in trợ giá thêm 500.000đ khi lên đời iPhone 16 Pro Max.` +
          `\n2. Khách còn **${partner.loyaltyPoints || 0} điểm thưởng**, đề xuất tặng 01 củ sạc nhanh 20W chính hãng để kích hoạt lần mua tiếp theo.`
        );
      } else {
        setAiAnalysis(
          `Đối tác cung ứng **${partner.name}** (${partner.supplierCategory}), đánh giá chất lượng **${partner.qualityRating || 5}/5 sao**. ` +
          `\n\n📦 **Đánh giá nguồn hàng & Tối ưu chi phí:**` +
          `\n1. Tỷ lệ lỗi RMA đầu nguồn cực thấp (< 0.8%), chính sách bảo hành **${partner.warrantyPolicyDays || 30} ngày** rất an tâm.` +
          `\n2. Hạn mức công nợ hiện tại: **${(partner.creditLimit || 0).toLocaleString('vi-VN')} đ**. Đề xuất gom đơn nhập lô lớn 15 cây vào thứ 5 để nhận chiết khấu thêm 1.5% giá máy.`
        );
      }
      setIsAiLoading(false);
    }, 600);
  };

  const getTierBadge = (tier?: CustomerTier) => {
    switch (tier) {
      case 'DIAMOND':
        return <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-cyan-100 text-cyan-800 border border-cyan-300 flex items-center gap-1"><Award className="w-3 h-3 text-cyan-600" /> VIP Kim Cương</span>;
      case 'GOLD':
        return <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1"><Award className="w-3 h-3 text-amber-600" /> VIP Vàng</span>;
      case 'SILVER':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-zinc-200 text-zinc-800 border border-zinc-300 flex items-center gap-1"><Award className="w-3 h-3 text-zinc-500" /> Hạng Bạc</span>;
      case 'WHOLESALE':
        return <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1"><Building2 className="w-3 h-3 text-purple-600" /> Khách Buôn Sỉ</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-100 text-zinc-700">Chuẩn</span>;
    }
  };

  const getSupplierCategoryBadge = (cat?: SupplierCategory) => {
    switch (cat) {
      case 'OFFICIAL_DISTRIBUTOR':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-blue-500" /> Phân Phối Chính Hãng VN/A</span>;
      case 'LIKE_NEW_WHOLESALER':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1"><Smartphone className="w-3 h-3 text-orange-500" /> Đầu Nậu Like New USA/LL/A</span>;
      case 'COMPONENTS':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1"><Layers className="w-3 h-3 text-emerald-500" /> Linh Kiện & Phụ Kiện Zin</span>;
      case 'FINANCE_PARTNER':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1"><CreditCard className="w-3 h-3 text-indigo-500" /> Đối Tác Trả Góp 0%</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-100 text-zinc-700">Nhà cung cấp</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 font-semibold">Khách Hàng Toàn Hệ Thống</span>
            <div className="p-2 bg-orange-50 text-orange-600 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-zinc-900 mt-2">{totalCustomers} Khách</div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Tích điểm & Lịch sử mua 360°
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 font-semibold">Nhà Cung Cấp & Đầu Nguồn</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-zinc-900 mt-2">{totalSuppliers} Đối Tác</div>
          <div className="text-[11px] text-blue-600 font-semibold mt-1">
            VN/A, Like New LL/A, Linh kiện & Trả góp
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 font-semibold">Công Nợ Phải Thu (Khách nợ)</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-emerald-700 mt-2">
            {totalReceivables.toLocaleString('vi-VN')} đ
          </div>
          <div className="text-[11px] text-zinc-500 font-medium mt-1">
            Khách sỉ gối đầu & Chờ ngân hàng giải ngân
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 font-semibold">Công Nợ Phải Trả (Nợ NCC)</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-rose-700 mt-2">
            {totalPayables.toLocaleString('vi-VN')} đ
          </div>
          <div className="text-[11px] text-zinc-500 font-medium mt-1">
            Tiền nhập máy mới & Lô Like New gối đầu
          </div>
        </div>
      </div>

      {/* 2. Controls & Filtering Bar */}
      <div className="bg-white p-4 rounded-2xl border border-orange-100 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Main Tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'ALL'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Tất Cả Đối Tác ({partners.length})
            </button>

            <button
              onClick={() => setActiveTab('CUSTOMERS')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'CUSTOMERS'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Khách Hàng ({totalCustomers})</span>
            </button>

            <button
              onClick={() => setActiveTab('SUPPLIERS')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'SUPPLIERS'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Nhà Cung Cấp ({totalSuppliers})</span>
            </button>

            <button
              onClick={() => setActiveTab('DEBT_HUB')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'DEBT_HUB'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Sổ Nợ & Đối Soát</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleOpenAdd('CUSTOMER')}
              className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Khách Hàng</span>
            </button>

            <button
              onClick={() => handleOpenAdd('SUPPLIER')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Nhà Cung Cấp</span>
            </button>
          </div>
        </div>

        {/* Search & Sub Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-100">
          <div className="relative sm:col-span-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên, SĐT, email, mã số thuế, thẻ tag..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-hidden focus:border-orange-500"
            />
          </div>

          {/* Tier Filter */}
          <div>
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              className="w-full py-2 px-3 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-medium text-zinc-700 focus:outline-hidden"
            >
              <option value="ALL">Tất cả hạng thành viên</option>
              <option value="DIAMOND">💎 VIP Kim Cương</option>
              <option value="GOLD">🥇 VIP Vàng</option>
              <option value="SILVER">🥈 Hạng Bạc</option>
              <option value="STANDARD">🥉 Chuẩn</option>
              <option value="WHOLESALE">🏢 Khách Buôn Sỉ</option>
            </select>
          </div>

          {/* Supplier Category Filter */}
          <div>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="w-full py-2 px-3 text-xs bg-zinc-50 border border-zinc-200 rounded-xl font-medium text-zinc-700 focus:outline-hidden"
            >
              <option value="ALL">Tất cả phân loại NCC</option>
              <option value="OFFICIAL_DISTRIBUTOR">Chính Hãng VN/A (FPT/Viettel)</option>
              <option value="LIKE_NEW_WHOLESALER">Đầu Nậu Like New (LL/A, ZA/A)</option>
              <option value="COMPONENTS">Linh Kiện & Pin Pisen</option>
              <option value="FINANCE_PARTNER">Đối Tác Trả Góp (HD Saison/Mpos)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Partner Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPartners.map((partner) => {
          const isCustomer = partner.type === 'CUSTOMER' || partner.type === 'BOTH';
          const isSupplier = partner.type === 'SUPPLIER' || partner.type === 'BOTH';

          return (
            <div
              key={partner.id}
              className={`bg-white rounded-2xl p-4 border transition-all hover:shadow-md flex flex-col justify-between ${
                partner.outstandingDebt > 0
                  ? 'border-amber-200 ring-1 ring-amber-100'
                  : 'border-zinc-200/80 hover:border-orange-200'
              }`}
            >
              <div>
                {/* Header: Name, Type & Badges */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-2xl font-bold flex items-center justify-center text-sm shadow-xs ${
                      isCustomer 
                        ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white' 
                        : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white'
                    }`}>
                      {partner.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-900 text-sm flex items-center gap-1.5">
                        {partner.name}
                      </h3>
                      <p className="text-xs text-zinc-500 font-mono flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 text-zinc-400" />
                        <span>{partner.phone}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {isCustomer && getTierBadge(partner.customerTier)}
                    {isSupplier && getSupplierCategoryBadge(partner.supplierCategory)}
                  </div>
                </div>

                {/* Info Block */}
                <div className="space-y-2 text-xs bg-zinc-50 p-3 rounded-xl border border-zinc-100 mb-3">
                  {partner.email && (
                    <div className="flex items-center justify-between text-zinc-600">
                      <span className="text-zinc-400">Email:</span>
                      <span className="font-mono text-zinc-800 truncate max-w-[180px]">{partner.email}</span>
                    </div>
                  )}

                  {partner.address && (
                    <div className="flex items-start justify-between text-zinc-600 gap-2">
                      <span className="text-zinc-400 shrink-0">Địa chỉ:</span>
                      <span className="text-zinc-700 text-right line-clamp-1">{partner.address}</span>
                    </div>
                  )}

                  {isCustomer && (
                    <div className="flex items-center justify-between text-zinc-600 pt-1 border-t border-zinc-200">
                      <span className="text-zinc-400">Tổng chi tiêu (LTV):</span>
                      <span className="font-bold text-orange-600">
                        {(partner.totalSpent || 0).toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                  )}

                  {isCustomer && (
                    <div className="flex items-center justify-between text-zinc-600">
                      <span className="text-zinc-400">Điểm tích lũy:</span>
                      <span className="font-bold text-amber-600 flex items-center gap-1">
                        <Award className="w-3.5 h-3.5" /> {partner.loyaltyPoints || 0} điểm
                      </span>
                    </div>
                  )}

                  {isSupplier && (
                    <div className="flex items-center justify-between text-zinc-600 pt-1 border-t border-zinc-200">
                      <span className="text-zinc-400">Đã nhập từ NCC:</span>
                      <span className="font-bold text-blue-700">
                        {(partner.totalPurchasedFrom || 0).toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                  )}

                  {/* Outstanding Debt Indicator */}
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-200">
                    <span className="text-zinc-500 font-semibold">
                      {isCustomer ? 'Nợ cần thu:' : 'Nợ cần trả NCC:'}
                    </span>
                    {partner.outstandingDebt > 0 ? (
                      <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                        {partner.outstandingDebt.toLocaleString('vi-VN')} đ
                      </span>
                    ) : (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Đã quyết toán
                      </span>
                    )}
                  </div>
                </div>

                {/* Tags */}
                {partner.tags && partner.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {partner.tags.map((t, idx) => (
                      <span key={idx} className="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md font-medium">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                <button
                  onClick={() => setSelectedPartner(partner)}
                  className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Hồ Sơ 360°</span>
                </button>

                <div className="flex items-center space-x-1">
                  {partner.outstandingDebt > 0 && (
                    <button
                      onClick={() => handleOpenDebtSettle(partner)}
                      className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                      title="Thu nợ / Thanh toán đối soát"
                    >
                      Quyết Toán
                    </button>
                  )}

                  <button
                    onClick={() => handleOpenEdit(partner)}
                    className="p-1.5 text-zinc-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer"
                    title="Chỉnh sửa thông tin"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      if (confirm(`Bạn có chắc muốn xóa đối tác ${partner.name}?`)) {
                        onDeletePartner(partner.id);
                      }
                    }}
                    className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Xóa đối tác"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. CUSTOMER / SUPPLIER 360° DRAWER MODAL */}
      {selectedPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl border border-orange-100 max-h-[90vh] overflow-y-auto space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white font-black text-lg flex items-center justify-center shadow-md">
                  {selectedPartner.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-zinc-900 text-lg">{selectedPartner.name}</h3>
                    {selectedPartner.type === 'CUSTOMER' && getTierBadge(selectedPartner.customerTier)}
                    {selectedPartner.type === 'SUPPLIER' && getSupplierCategoryBadge(selectedPartner.supplierCategory)}
                  </div>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">
                    Mã đối tác: {selectedPartner.id} • Tham gia: {selectedPartner.createdAt}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedPartner(null);
                  setAiAnalysis(null);
                }}
                className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quick Contact & Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1.5">
                <div className="text-zinc-400 font-semibold">Thông Tin Liên Hệ</div>
                <div className="flex items-center gap-2 text-zinc-800 font-medium">
                  <Phone className="w-3.5 h-3.5 text-orange-500" />
                  <span>{selectedPartner.phone}</span>
                </div>
                {selectedPartner.email && (
                  <div className="flex items-center gap-2 text-zinc-800 font-medium">
                    <Mail className="w-3.5 h-3.5 text-blue-500" />
                    <span>{selectedPartner.email}</span>
                  </div>
                )}
                {selectedPartner.address && (
                  <div className="flex items-center gap-2 text-zinc-800 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{selectedPartner.address}</span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1.5">
                <div className="text-zinc-400 font-semibold">Chỉ Số Tài Chính & Công Nợ</div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Hạn mức công nợ:</span>
                  <span className="font-bold text-zinc-800">
                    {(selectedPartner.creditLimit || 0).toLocaleString('vi-VN')} đ
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Công nợ hiện tại:</span>
                  <span className={`font-bold ${selectedPartner.outstandingDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {selectedPartner.outstandingDebt.toLocaleString('vi-VN')} đ
                  </span>
                </div>
                {selectedPartner.loyaltyPoints !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Điểm thưởng Loyalty:</span>
                    <span className="font-bold text-amber-600">{selectedPartner.loyaltyPoints} điểm</span>
                  </div>
                )}
              </div>
            </div>

            {/* Device History & Purchase Profile */}
            {selectedPartner.deviceHistory && selectedPartner.deviceHistory.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-orange-500" />
                  <span>Lịch Sử Thiết Bị & Số IMEI Đã Mua / Đổi Đời</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedPartner.deviceHistory.map((imei, idx) => (
                    <div key={idx} className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 font-bold text-[10px] flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-mono font-bold text-zinc-800">{imei}</span>
                      </div>
                      <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                        Đã kích hoạt
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes & Special Preferences */}
            {selectedPartner.notes && (
              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 text-xs text-amber-900">
                <span className="font-bold block mb-1">Ghi Chú Vận Hành:</span>
                {selectedPartner.notes}
              </div>
            )}

            {/* AI Copilot Partner Retention / Procurement Assistant */}
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-2xl p-4 text-white space-y-3 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-bold text-orange-400">
                  <Sparkles className="w-4 h-4" />
                  <span>Trợ Lý AI Đối Tác (Smart Retention & Sourcing)</span>
                </div>
                <button
                  onClick={() => handleGenerateAiRecommendation(selectedPartner)}
                  disabled={isAiLoading}
                  className="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                >
                  <Zap className="w-3 h-3" />
                  <span>{isAiLoading ? 'AI Đang Phân Tích...' : 'Phân Tích Bằng AI'}</span>
                </button>
              </div>

              {aiAnalysis ? (
                <div className="text-xs text-zinc-200 whitespace-pre-line leading-relaxed bg-white/10 p-3 rounded-xl border border-white/10">
                  {aiAnalysis}
                </div>
              ) : (
                <p className="text-xs text-zinc-400">
                  Bấm nút Phân Tích Bằng AI để tự động tạo kịch bản chăm sóc Zalo ZNS, đề xuất đổi đời máy (Trade-in) hoặc đánh giá mức giá sỉ tốt nhất từ NCC.
                </p>
              )}
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
              <button
                onClick={() => {
                  setSelectedPartner(null);
                  handleOpenEdit(selectedPartner);
                }}
                className="px-4 py-2 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              >
                Chỉnh Sửa Hồ Sơ
              </button>

              <div className="flex items-center space-x-2">
                {selectedPartner.outstandingDebt > 0 && (
                  <button
                    onClick={() => {
                      setSelectedPartner(null);
                      handleOpenDebtSettle(selectedPartner);
                    }}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Quyết Toán Sổ Nợ
                  </button>
                )}
                <button
                  onClick={() => setSelectedPartner(null)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. ADD / EDIT PARTNER MODAL */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-orange-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="font-bold text-zinc-900 text-base">
                {editingPartner ? 'Cập Nhật Thông Tin Đối Tác' : 'Thêm Mới Đối Tác (Khách / NCC)'}
              </h3>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePartner} className="space-y-3.5 mt-4 text-xs">
              {/* Type Selection */}
              <div>
                <label className="block font-bold text-zinc-700 mb-1">Loại Đối Tác <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'CUSTOMER', label: 'Khách Hàng' },
                    { id: 'SUPPLIER', label: 'Nhà Cung Cấp' },
                    { id: 'BOTH', label: 'Cả Hai (Song Phương)' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, type: t.id as PartnerType })}
                      className={`py-2 px-2 rounded-xl font-bold border transition-all text-center cursor-pointer ${
                        formData.type === t.id
                          ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Tên Đối Tác / Doanh Nghiệp <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="VD: Nguyễn Văn Tuấn / Synnex FPT"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Số Điện Thoại <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    required
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="VD: 0987654321"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="VD: tuan.apple@gmail.com"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Mã Số Thuế (Nếu có)</label>
                  <input
                    type="text"
                    value={formData.taxCode || ''}
                    onChange={(e) => setFormData({ ...formData, taxCode: e.target.value })}
                    placeholder="VD: 0101778163"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Địa Chỉ</label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="VD: 45 Cầu Giấy, Hà Nội"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden"
                />
              </div>

              {/* Conditional Customer Tier / Supplier Category */}
              {formData.type !== 'SUPPLIER' && (
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Hạng Thành Viên Khách Hàng</label>
                  <select
                    value={formData.customerTier || 'STANDARD'}
                    onChange={(e) => setFormData({ ...formData, customerTier: e.target.value as CustomerTier })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl font-medium text-zinc-800 bg-white"
                  >
                    <option value="STANDARD">🥉 Chuẩn (Khách mua lẻ)</option>
                    <option value="SILVER">🥈 Hạng Bạc (Tích 1.5%, chi tiêu trên 25Tr)</option>
                    <option value="GOLD">🥇 Hạng Vàng (Tích 2%, trợ giá thu cũ +500k)</option>
                    <option value="DIAMOND">💎 VIP Kim Cương (Chi tiêu trên 100Tr)</option>
                    <option value="WHOLESALE">🏢 Khách Buôn Sỉ (Áp dụng bảng giá sỉ)</option>
                  </select>
                </div>
              )}

              {formData.type !== 'CUSTOMER' && (
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Phân Loại Nhà Cung Cấp</label>
                  <select
                    value={formData.supplierCategory || 'LIKE_NEW_WHOLESALER'}
                    onChange={(e) => setFormData({ ...formData, supplierCategory: e.target.value as SupplierCategory })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl font-medium text-zinc-800 bg-white"
                  >
                    <option value="OFFICIAL_DISTRIBUTOR">Phân Phối Chính Hãng VN/A (FPT/Viettel/DGW)</option>
                    <option value="LIKE_NEW_WHOLESALER">Đầu Nậu Gom Máy Like New (LL/A, ZA/A)</option>
                    <option value="COMPONENTS">Linh Kiện Màn Hình & Pin Pisen</option>
                    <option value="FINANCE_PARTNER">Đối Tác Tài Chính Trả Góp (HD Saison/Mpos)</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Hạn Mức Công Nợ (VNĐ)</label>
                  <input
                    type="number"
                    value={formData.creditLimit || 0}
                    onChange={(e) => setFormData({ ...formData, creditLimit: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Công Nợ Ban Đầu (VNĐ)</label>
                  <input
                    type="number"
                    value={formData.outstandingDebt || 0}
                    onChange={(e) => setFormData({ ...formData, outstandingDebt: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden font-mono"
                  />
                </div>
              </div>

              {/* Tags Input */}
              <div>
                <label className="block font-bold text-zinc-700 mb-1">Thẻ Ghi Chú (Tags)</label>
                <div className="flex items-center space-x-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="VD: Thích màu Titan, Lấy sỉ..."
                    className="flex-1 px-3 py-1.5 border border-zinc-200 rounded-xl focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 font-bold rounded-xl text-zinc-700 cursor-pointer"
                  >
                    + Thêm
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(formData.tags || []).map((tag, idx) => (
                    <span key={idx} className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-md text-[11px] flex items-center gap-1 font-medium">
                      #{tag}
                      <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Ghi Chú Đặc Biệt</label>
                <textarea
                  rows={2}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Thói quen thanh toán, chu kỳ lấy hàng..."
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-3 border-t border-zinc-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 border border-zinc-200 text-zinc-700 font-semibold rounded-xl hover:bg-zinc-50 cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-md shadow-orange-500/20 cursor-pointer"
                >
                  {editingPartner ? 'Cập Nhật Đối Tác' : 'Lưu Đối Tác Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. DEBT SETTLEMENT MODAL */}
      {isDebtModalOpen && debtActionPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-orange-100">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-600" />
                Quyết Toán Sổ Nợ / Đối Soát
              </h3>
              <button
                onClick={() => setIsDebtModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmDebtSettle} className="space-y-4 mt-4 text-xs">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
                <div className="text-zinc-600">Đối tác: <strong>{debtActionPartner.name}</strong> ({debtActionPartner.phone})</div>
                <div className="text-zinc-600">
                  Dư nợ hiện tại: <strong className="text-rose-600">{debtActionPartner.outstandingDebt.toLocaleString('vi-VN')} đ</strong>
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Số Tiền Quyết Toán (VNĐ) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  required
                  min={1000}
                  max={debtActionPartner.outstandingDebt}
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl focus:border-orange-500 font-mono font-bold text-base text-zinc-900"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Ghi Chú Thu / Chi</label>
                <input
                  type="text"
                  value={settleNote}
                  onChange={(e) => setSettleNote(e.target.value)}
                  placeholder="VD: Khách chuyển khoản VCB qua QR..."
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:border-orange-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsDebtModalOpen(false)}
                  className="px-4 py-2 border border-zinc-200 rounded-xl text-zinc-700 font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Xác Nhận Quyết Toán
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
