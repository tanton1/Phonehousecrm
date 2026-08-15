import React, { useState, useMemo } from 'react';
import { 
  WarrantyTicket, 
  DeviceItem, 
  FundAccount, 
  CashTransaction 
} from '../types';
import { 
  REPAIR_SERVICES_PRICELIST, 
  RepairServiceItem 
} from '../data/initialData';
import { 
  Wrench, 
  Plus, 
  Search, 
  ShieldCheck, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Printer, 
  Smartphone,
  Cpu,
  UserCheck,
  Zap,
  Check,
  X,
  FileText,
  DollarSign,
  Tag,
  Layers,
  Activity,
  History,
  Lock,
  ChevronRight,
  BatteryCharging,
  QrCode,
  SlidersHorizontal,
  TrendingUp,
  Percent
} from 'lucide-react';

interface WarrantyServiceViewProps {
  warrantyTickets: WarrantyTicket[];
  devices: DeviceItem[];
  funds?: FundAccount[];
  onAddTicket: (ticket: WarrantyTicket) => void;
  onUpdateTicket: (ticket: WarrantyTicket) => void;
  onAddTransaction?: (tx: CashTransaction) => void;
}

export const WarrantyServiceView: React.FC<WarrantyServiceViewProps> = ({
  warrantyTickets,
  devices,
  funds = [],
  onAddTicket,
  onUpdateTicket,
  onAddTransaction
}) => {
  // Tabs: 'TICKETS' | 'PRICELIST' | 'STATS'
  const [activeTab, setActiveTab] = useState<'TICKETS' | 'PRICELIST' | 'STATS'>('TICKETS');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL'); // ALL, FREE, PAID

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeTicketDetails, setActiveTicketDetails] = useState<WarrantyTicket | null>(null);
  const [printTicket, setPrintTicket] = useState<WarrantyTicket | null>(null);

  // Price list search & filter
  const [priceSearchTerm, setPriceSearchTerm] = useState('');
  const [selectedPriceCategory, setSelectedPriceCategory] = useState<string>('ALL');

  // AI Diagnostic State
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [aiDiagnosticResult, setAiDiagnosticResult] = useState<{
    likelyCause: string;
    recommendedAction: string;
    repairTime: string;
    estimatedCostRange: string;
    warrantyTerms: string;
    riskWarning: string;
  } | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<WarrantyTicket>>({
    customerName: '',
    phone: '',
    imei: '',
    model: 'iPhone 13 Pro Max',
    color: 'Titan Tự Nhiên',
    storage: '128GB',
    passcode: '',
    icloudStatus: 'Clean / Khách Nhớ Mật Khẩu',
    deviceAppearance: 'Máy Đẹp Keng 99%',
    accessoriesIncluded: 'Máy trần (không phụ kiện)',
    issueType: 'Màn Hình / Cảm Ứng',
    faultDescription: 'Màn hình bị trắng/xanh toàn bộ khi đang sử dụng',
    technician: 'KTV Trọng (Chuyên Màn)',
    isWarrantyFree: true,
    repairCategory: 'WARRANTY_FREE',
    estimatedCost: 0,
    warrantyMonthsAfterRepair: 6,
    expectedReturnDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]
  });

  // Auto Lookup device by IMEI from sold or in_stock devices
  const handleLookupDeviceByImei = (imei: string) => {
    const cleanImei = imei.trim();
    if (cleanImei.length < 4) return;

    const found = devices.find(d => d.imei === cleanImei || d.imei.endsWith(cleanImei));
    if (found) {
      setFormData(prev => ({
        ...prev,
        imei: found.imei,
        model: found.model,
        color: found.color,
        storage: found.storage,
        customerName: found.customerName || prev.customerName,
        phone: found.customerPhone || prev.phone,
        isWarrantyFree: found.status === 'sold' || found.status === 'warranty'
      }));
    }
  };

  // AI Diagnostic Assistant
  const handleRunAIDiagnostic = () => {
    if (!formData.faultDescription) {
      alert('Vui lòng nhập mô tả triệu chứng lỗi trước khi chẩn đoán!');
      return;
    }

    setIsDiagnosing(true);
    setTimeout(() => {
      let cause = 'Chập áp màn hình 120Hz ProMotion trên dòng 13 Pro / 13 Pro Max';
      let action = 'Áp dụng công nghệ câu dây đồng nối áp màn hình (không cần thay cả cụm màn hình, giữ zin hiển thị 120Hz)';
      let cost = formData.isWarrantyFree ? '0đ (Bảo hành VIP 1 đổi 1)' : '500.000đ - 800.000đ';
      let time = '30 - 45 Phút (Lấy Ngay)';
      let warranty = 'Bảo hành 6 tháng sau sửa chữa';

      if (formData.issueType === 'Pin / Phù Pin') {
        cause = 'Cell pin bị chai phồng, chu kỳ sạc vượt ngưỡng 800 lần, dung lượng còn dưới 80%';
        action = 'Thay Pin Pisen Dragon / Bison Dung Lượng Cao + Sàng cáp IC fix pin 100% trong Cài đặt';
        cost = formData.isWarrantyFree ? '0đ (Bảo hành 1 đổi 1)' : '650.000đ - 1.200.000đ';
        time = '25 - 40 Phút';
        warranty = 'Bảo hành 12 tháng đổi mới';
      } else if (formData.issueType === 'Face ID / Camera') {
        cause = 'Hư hỏng mắt đọc Dot Projector hoặc đứt cáp cảm biến Face ID do va đập / ẩm nước';
        action = 'Sử dụng cáp JCID / Luban sửa Face ID không cần hàn đục thấu kính gốc';
        cost = '750.000đ - 1.450.000đ';
        time = '45 - 60 Phút';
        warranty = 'Bảo hành 6 tháng';
      } else if (formData.issueType === 'Ép Kính / Thay Lưng') {
        cause = 'Kính ngoài nứt vỡ do rơi rớt nhưng phôi màn hình OLED hiển thị và cảm ứng còn hoạt động bình thường';
        action = 'Tách kính vỡ, ép kính zin phủ nano chân không bằng keo OCA chuẩn nhà máy';
        cost = '600.000đ - 1.100.000đ';
        time = '60 - 90 Phút';
        warranty = 'Bảo hành 12 tháng bụi bọt keo';
      }

      setAiDiagnosticResult({
        likelyCause: cause,
        recommendedAction: action,
        repairTime: time,
        estimatedCostRange: cost,
        warrantyTerms: warranty,
        riskWarning: 'Kiểm tra kỹ tình trạng sườn vỏ, camera và face ID trước khi nhận máy'
      });
      setIsDiagnosing(false);
    }, 500);
  };

  // Submit New Ticket
  const handleSaveTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName || !formData.phone || !formData.imei) {
      alert('Vui lòng nhập đầy đủ tên khách, SĐT và số IMEI!');
      return;
    }

    const isFree = Boolean(formData.isWarrantyFree);
    const estCost = isFree ? 0 : (Number(formData.estimatedCost) || 0);

    const newTicket: WarrantyTicket = {
      id: `WRN-${Date.now().toString().slice(-4)}`,
      ticketNumber: `BH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
      customerName: formData.customerName,
      phone: formData.phone,
      imei: formData.imei,
      model: formData.model || 'iPhone 13 Pro Max',
      color: formData.color,
      storage: formData.storage,
      passcode: formData.passcode || 'Không có / Mở khóa tại chỗ',
      icloudStatus: formData.icloudStatus || 'Clean / Khách Nhớ Mật Khẩu',
      deviceAppearance: formData.deviceAppearance || 'Máy Đẹp Keng 99%',
      accessoriesIncluded: formData.accessoriesIncluded || 'Máy trần',
      issueType: formData.issueType || 'Khác',
      faultDescription: formData.faultDescription || '',
      receivedDate: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16),
      expectedReturnDate: formData.expectedReturnDate || '',
      technician: formData.technician || 'KTV Trọng (Chuyên Màn)',
      status: 'received',
      isWarrantyFree: isFree,
      repairCategory: isFree ? 'WARRANTY_FREE' : 'REPAIR_SERVICE',
      estimatedCost: estCost,
      finalCost: estCost,
      warrantyMonthsAfterRepair: formData.warrantyMonthsAfterRepair || 6,
      aiDiagnostic: aiDiagnosticResult?.recommendedAction,
      timeline: [
        {
          time: new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16),
          action: 'Tiếp nhận máy tại quầy',
          note: `Lỗi: ${formData.issueType}. Tình trạng: ${formData.deviceAppearance}`,
          user: 'Nhật Tân (Lễ Tân/Admin)'
        }
      ]
    };

    onAddTicket(newTicket);
    setIsAddModalOpen(false);
    setAiDiagnosticResult(null);
  };

  // Status Change Workflow
  const handleUpdateStatus = (ticket: WarrantyTicket, newStatus: WarrantyTicket['status']) => {
    const now = new Date().toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);
    let actionDesc = '';
    let completedDate = ticket.completedDate;
    let deliveredDate = ticket.deliveredDate;

    if (newStatus === 'repairing') {
      actionDesc = 'Kỹ thuật viên bắt đầu tháo máy & sửa chữa';
    } else if (newStatus === 'ready') {
      actionDesc = 'Sửa chữa hoàn tất, kiểm tra QC 12 bước đạt chuẩn';
      completedDate = now;
    } else if (newStatus === 'delivered') {
      actionDesc = 'Đã bàn giao máy cho khách hàng & xuất phiếu bảo hành';
      deliveredDate = now;

      // If paid repair, prompt creating cash transaction receipt
      if (!ticket.isWarrantyFree && ticket.finalCost > 0 && onAddTransaction) {
        const createReceipt = confirm(`Giao máy thành công! Tạo phiếu thu ${ticket.finalCost.toLocaleString('vi-VN')}đ dịch vụ sửa chữa vào Quỹ Tiền Mặt?`);
        if (createReceipt) {
          const newTx: CashTransaction = {
            id: `TX-${Date.now()}`,
            code: `PT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
            type: 'RECEIPT',
            category: 'REPAIR_SERVICE',
            categoryName: `Thu tiền dịch vụ sửa chữa ${ticket.model} (${ticket.issueType})`,
            amount: ticket.finalCost,
            fundType: 'CASH',
            fundName: 'Quỹ Tiền Mặt Tại Két Cửa Hàng',
            date: now,
            partnerName: ticket.customerName,
            partnerPhone: ticket.phone,
            partnerType: 'CUSTOMER',
            referenceCode: ticket.ticketNumber,
            creator: ticket.technician || 'KTV Sửa Chữa',
            notes: `Thu tiền dịch vụ phiếu ${ticket.ticketNumber} - IMEI: ${ticket.imei}`,
            status: 'COMPLETED'
          };
          onAddTransaction(newTx);
        }
      }
    }

    const updatedTicket: WarrantyTicket = {
      ...ticket,
      status: newStatus,
      ...(completedDate ? { completedDate } : {}),
      ...(deliveredDate ? { deliveredDate } : {}),
      timeline: [
        ...(ticket.timeline || []),
        {
          time: now,
          action: actionDesc || `Chuyển trạng thái: ${newStatus}`,
          user: 'KTV Trực Tiếp Xử Lý'
        }
      ]
    };

    onUpdateTicket(updatedTicket);
    if (activeTicketDetails?.id === ticket.id) {
      setActiveTicketDetails(updatedTicket);
    }
  };

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return warrantyTickets.filter(ticket => {
      const matchesSearch = 
        ticket.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.phone.includes(searchTerm) ||
        ticket.imei.includes(searchTerm) ||
        ticket.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.model.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'ALL' || ticket.status === statusFilter;
      const matchesType = 
        typeFilter === 'ALL' ||
        (typeFilter === 'FREE' && ticket.isWarrantyFree) ||
        (typeFilter === 'PAID' && !ticket.isWarrantyFree);

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [warrantyTickets, searchTerm, statusFilter, typeFilter]);

  // Filtered Price List
  const filteredPriceList = useMemo(() => {
    return REPAIR_SERVICES_PRICELIST.filter(item => {
      const matchCat = selectedPriceCategory === 'ALL' || item.category === selectedPriceCategory;
      const matchSearch = 
        item.name.toLowerCase().includes(priceSearchTerm.toLowerCase()) ||
        item.compatibleModels.toLowerCase().includes(priceSearchTerm.toLowerCase()) ||
        (item.notes && item.notes.toLowerCase().includes(priceSearchTerm.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [priceSearchTerm, selectedPriceCategory]);

  // Statistics Summary
  const stats = useMemo(() => {
    const total = warrantyTickets.length;
    const received = warrantyTickets.filter(t => t.status === 'received').length;
    const repairing = warrantyTickets.filter(t => t.status === 'repairing' || t.status === 'waiting_parts' || t.status === 'inspecting').length;
    const ready = warrantyTickets.filter(t => t.status === 'ready').length;
    const delivered = warrantyTickets.filter(t => t.status === 'delivered').length;
    
    const freeWarrantyCount = warrantyTickets.filter(t => t.isWarrantyFree).length;
    const paidServiceCount = warrantyTickets.filter(t => !t.isWarrantyFree).length;
    const totalRevenue = warrantyTickets.filter(t => !t.isWarrantyFree).reduce((sum, t) => sum + (t.finalCost || t.estimatedCost || 0), 0);

    return {
      total,
      received,
      repairing,
      ready,
      delivered,
      freeWarrantyCount,
      paidServiceCount,
      totalRevenue
    };
  }, [warrantyTickets]);

  const getStatusBadge = (status: WarrantyTicket['status']) => {
    switch (status) {
      case 'received':
        return (
          <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>Mới Tiếp Nhận</span>
          </span>
        );
      case 'inspecting':
        return (
          <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center space-x-1">
            <Activity className="w-3 h-3" />
            <span>Đang Kiểm Tra</span>
          </span>
        );
      case 'waiting_parts':
        return (
          <span className="bg-purple-50 text-purple-700 border border-purple-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center space-x-1">
            <Cpu className="w-3 h-3" />
            <span>Chờ Linh Kiện</span>
          </span>
        );
      case 'repairing':
        return (
          <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center space-x-1 animate-pulse">
            <Wrench className="w-3 h-3" />
            <span>Đang Sửa Chữa</span>
          </span>
        );
      case 'ready':
        return (
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Đã Xong (Chờ Trả)</span>
          </span>
        );
      case 'delivered':
        return (
          <span className="bg-zinc-100 text-zinc-600 border border-zinc-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-medium inline-flex items-center space-x-1">
            <UserCheck className="w-3 h-3" />
            <span>Đã Giao Máy</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fadeIn pb-16">
      {/* 1. TOP BANNER */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-orange-100 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg sm:text-xl font-black text-zinc-900 tracking-tight">
                Trung Tâm Bảo Hành & Dịch Vụ Sửa Chữa Apple
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                {stats.total} Phiếu
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Tiếp nhận máy theo IMEI, chẩn đoán AI, quản lý kỹ thuật viên, theo dõi linh kiện và in biên nhận K80/A5
            </p>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => {
            setFormData({
              customerName: '',
              phone: '',
              imei: '',
              model: 'iPhone 13 Pro Max',
              color: 'Titan Tự Nhiên',
              storage: '128GB',
              passcode: '',
              icloudStatus: 'Clean / Khách Nhớ Mật Khẩu',
              deviceAppearance: 'Máy Đẹp Keng 99%',
              accessoriesIncluded: 'Máy trần',
              issueType: 'Màn Hình / Cảm Ứng',
              faultDescription: 'Màn hình bị trắng/xanh toàn bộ khi đang lướt mạng',
              technician: 'KTV Trọng (Chuyên Màn)',
              isWarrantyFree: true,
              repairCategory: 'WARRANTY_FREE',
              estimatedCost: 0,
              warrantyMonthsAfterRepair: 6,
              expectedReturnDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]
            });
            setIsAddModalOpen(true);
          }}
          className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-black px-4 py-2.5 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-orange-500/20 active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Tiếp Nhận Máy Mới</span>
        </button>
      </div>

      {/* 2. STATS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-orange-100 shadow-xs">
          <div className="text-[10px] font-bold text-zinc-500 uppercase">Mới Tiếp Nhận</div>
          <div className="text-xl sm:text-2xl font-black text-orange-600 mt-0.5">{stats.received}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Chờ KTV kiểm tra & chẩn đoán</div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-amber-100 shadow-xs">
          <div className="text-[10px] font-bold text-zinc-500 uppercase">Đang Sửa Chữa</div>
          <div className="text-xl sm:text-2xl font-black text-amber-600 mt-0.5">{stats.repairing}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">KTV đang thao tác xử lý</div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-emerald-100 shadow-xs">
          <div className="text-[10px] font-bold text-zinc-500 uppercase">Đã Xong / Chờ Giao</div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-0.5">{stats.ready}</div>
          <div className="text-[10px] text-zinc-400 mt-0.5">Đã test QC đạt chuẩn 100%</div>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-blue-100 shadow-xs">
          <div className="text-[10px] font-bold text-zinc-500 uppercase">Doanh Thu Dịch Vụ</div>
          <div className="text-lg sm:text-xl font-black text-blue-600 mt-0.5 font-mono">
            {stats.totalRevenue.toLocaleString('vi-VN')} đ
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">{stats.freeWarrantyCount} ca BH miễn phí</div>
        </div>
      </div>

      {/* 3. NAVIGATION TABS */}
      <div className="flex items-center space-x-2 border-b border-zinc-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('TICKETS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'TICKETS'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Danh Sách Phiếu Tiếp Nhận ({warrantyTickets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('PRICELIST')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'PRICELIST'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span>Bảng Giá Dịch Vụ & Linh Kiện iPhone</span>
        </button>

        <button
          onClick={() => setActiveTab('STATS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'STATS'
              ? 'bg-orange-500 text-white shadow-xs'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Quy Trình & Tỷ Lệ Bảo Hành</span>
        </button>
      </div>

      {/* TAB 1: TICKETS LIST */}
      {activeTab === 'TICKETS' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-orange-100 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm Mã phiếu, IMEI, Tên khách, Model..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-orange-500"
                />
              </div>

              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-bold focus:outline-none focus:border-orange-500"
                >
                  <option value="ALL">Tất Cả Trạng Thái</option>
                  <option value="received">Mới Tiếp Nhận</option>
                  <option value="inspecting">Đang Kiểm Tra</option>
                  <option value="repairing">Đang Sửa Chữa</option>
                  <option value="ready">Đã Sửa Xong (Chờ Trả)</option>
                  <option value="delivered">Đã Giao Máy Khách</option>
                </select>
              </div>

              <div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-bold focus:outline-none focus:border-orange-500"
                >
                  <option value="ALL">Tất Cả Phân Loại</option>
                  <option value="FREE">Bảo Hành 1 Đổi 1 (Miễn Phí)</option>
                  <option value="PAID">Sửa Chữa Dịch Vụ (Có Phí)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block bg-white border border-orange-100 rounded-3xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs text-zinc-700">
              <thead className="bg-zinc-50 text-zinc-500 uppercase font-bold border-b border-zinc-200 text-[11px]">
                <tr>
                  <th className="px-4 py-3.5">Mã Phiếu & Khách Hàng</th>
                  <th className="px-4 py-3.5">Thiết Bị & IMEI (15 số)</th>
                  <th className="px-4 py-3.5">Hạng Mục Lỗi & Mô Tả</th>
                  <th className="px-4 py-3.5">Kỹ Thuật Xử Lý</th>
                  <th className="px-4 py-3.5">Chi Phí / Bảo Hành</th>
                  <th className="px-4 py-3.5">Trạng Thái</th>
                  <th className="px-4 py-3.5 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredTickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                      <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30 text-zinc-400" />
                      <p>Không có phiếu bảo hành/sửa chữa nào phù hợp bộ lọc.</p>
                    </td>
                  </tr>
                ) : (
                  filteredTickets.map((t) => (
                    <tr key={t.id} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-black text-orange-600">{t.ticketNumber || t.id}</div>
                        <div className="font-bold text-zinc-900 text-xs mt-0.5">{t.customerName}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">{t.phone}</div>
                      </td>

                      <td className="px-4 py-3.5 font-mono">
                        <div className="font-bold text-zinc-900 text-xs">{t.model}</div>
                        <div className="text-[11px] text-zinc-600 font-bold">IMEI: {t.imei}</div>
                        {t.deviceAppearance && (
                          <div className="text-[10px] text-zinc-500 font-sans">{t.deviceAppearance}</div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 max-w-xs">
                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          {t.issueType}
                        </span>
                        <p className="text-[11px] text-zinc-600 mt-1 line-clamp-1 italic">"{t.faultDescription}"</p>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="font-bold text-zinc-800">{t.technician}</span>
                        <div className="text-[10px] text-zinc-500">Nhận: {t.receivedDate}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        {t.isWarrantyFree ? (
                          <div>
                            <span className="text-emerald-700 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              BH Miễn Phí
                            </span>
                            <div className="text-[10px] text-zinc-400 mt-0.5">Gói VIP 1 đổi 1</div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-zinc-900 font-black font-mono text-xs">
                              {t.finalCost ? t.finalCost.toLocaleString('vi-VN') : t.estimatedCost.toLocaleString('vi-VN')} đ
                            </span>
                            <div className="text-[10px] text-zinc-500 mt-0.5">BH {t.warrantyMonthsAfterRepair || 6} tháng</div>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        {getStatusBadge(t.status)}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => setActiveTicketDetails(t)}
                            className="p-1.5 bg-zinc-50 hover:bg-orange-50 text-zinc-700 rounded-lg border border-zinc-200"
                            title="Xem Chi Tiết Phiếu"
                          >
                            <FileText className="w-3.5 h-3.5 text-orange-600" />
                          </button>

                          <button
                            onClick={() => setPrintTicket(t)}
                            className="p-1.5 bg-zinc-50 hover:bg-orange-50 text-zinc-700 rounded-lg border border-zinc-200"
                            title="In Biên Nhận K80"
                          >
                            <Printer className="w-3.5 h-3.5 text-zinc-600" />
                          </button>

                          {t.status === 'received' && (
                            <button
                              onClick={() => handleUpdateStatus(t, 'repairing')}
                              className="bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg"
                            >
                              Sửa Máy
                            </button>
                          )}
                          {t.status === 'repairing' && (
                            <button
                              onClick={() => handleUpdateStatus(t, 'ready')}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg"
                            >
                              Sửa Xong
                            </button>
                          )}
                          {t.status === 'ready' && (
                            <button
                              onClick={() => handleUpdateStatus(t, 'delivered')}
                              className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-xs"
                            >
                              Giao Máy
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filteredTickets.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-zinc-300 text-zinc-500 text-xs">
                Không có phiếu nào.
              </div>
            ) : (
              filteredTickets.map((t) => (
                <div 
                  key={t.id}
                  className="bg-white border border-orange-100 rounded-2xl p-4 space-y-3 shadow-xs"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-xs font-black text-orange-600">{t.ticketNumber || t.id}</span>
                      <h3 className="font-bold text-zinc-900 text-sm mt-0.5">{t.customerName} ({t.phone})</h3>
                    </div>
                    {getStatusBadge(t.status)}
                  </div>

                  <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-xs space-y-1">
                    <div className="flex justify-between text-zinc-500">
                      <span>Thiết bị:</span>
                      <strong className="text-zinc-900 font-mono">{t.model} ({t.imei.slice(-6)})</strong>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span>Lỗi:</span>
                      <span className="text-amber-800 font-bold">{t.issueType}</span>
                    </div>
                    <div className="flex justify-between text-zinc-500">
                      <span>Chi phí:</span>
                      <span className="font-black text-zinc-900 font-mono">
                        {t.isWarrantyFree ? 'BH Miễn Phí' : `${(t.finalCost || t.estimatedCost).toLocaleString('vi-VN')} đ`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-[11px] text-zinc-500">
                      KTV: <strong className="text-zinc-700">{t.technician}</strong>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => setActiveTicketDetails(t)}
                        className="px-2.5 py-1 bg-zinc-100 text-zinc-700 text-xs font-bold rounded-lg"
                      >
                        Chi Tiết
                      </button>

                      <button
                        onClick={() => setPrintTicket(t)}
                        className="p-1.5 bg-zinc-100 text-zinc-700 rounded-lg"
                      >
                        <Printer className="w-3.5 h-3.5 text-orange-600" />
                      </button>

                      {t.status === 'received' && (
                        <button
                          onClick={() => handleUpdateStatus(t, 'repairing')}
                          className="px-3 py-1 bg-amber-500 text-white text-xs font-bold rounded-lg shadow-xs"
                        >
                          Sửa Máy
                        </button>
                      )}
                      {t.status === 'repairing' && (
                        <button
                          onClick={() => handleUpdateStatus(t, 'ready')}
                          className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg shadow-xs"
                        >
                          Sửa Xong
                        </button>
                      )}
                      {t.status === 'ready' && (
                        <button
                          onClick={() => handleUpdateStatus(t, 'delivered')}
                          className="px-3 py-1 bg-orange-600 text-white text-xs font-bold rounded-lg shadow-xs"
                        >
                          Giao Máy
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PRICELIST */}
      {activeTab === 'PRICELIST' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-orange-100 shadow-xs flex flex-col sm:flex-row justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm bảng giá thay màn hình, thay pin, ép kính, sửa Face ID..."
                value={priceSearchTerm}
                onChange={(e) => setPriceSearchTerm(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
              />
            </div>

            <select
              value={selectedPriceCategory}
              onChange={(e) => setSelectedPriceCategory(e.target.value)}
              className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 font-bold focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">Tất Cả Danh Mục Sửa Chữa</option>
              <option value="THAY_MAN_HINH">Thay Màn Hình iPhone</option>
              <option value="THAY_PIN">Thay Pin iPhone Chính Hãng</option>
              <option value="EP_KINH">Ép Kính / Ép Cảm Ứng</option>
              <option value="FACE_ID">Sửa Chữa Face ID</option>
              <option value="MAINBOARD_NGUON">Phần Cứng Mainboard / IC Nguồn</option>
            </select>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredPriceList.map((item) => (
              <div 
                key={item.id}
                className="bg-white border border-orange-100 hover:border-orange-300 rounded-2xl p-4 space-y-3 shadow-xs transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                      {item.categoryName}
                    </span>
                    <h3 className="font-bold text-zinc-900 text-sm mt-1">{item.name}</h3>
                    <div className="text-[11px] text-zinc-500">Áp dụng: <strong>{item.compatibleModels}</strong></div>
                  </div>

                  <div className="text-right">
                    <div className="text-base font-black text-orange-600 font-mono">
                      {item.sellPrice.toLocaleString('vi-VN')} đ
                    </div>
                    <span className="text-[10px] text-zinc-400">Giá vốn: {item.costPrice.toLocaleString('vi-VN')}đ</span>
                  </div>
                </div>

                <div className="p-2.5 bg-zinc-50 rounded-xl text-xs text-zinc-600 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span>Thời gian hoàn thành: <strong>{item.durationMinutes} phút</strong></span>
                    <span>Bảo hành: <strong className="text-emerald-700">{item.warrantyPeriodMonths} tháng</strong></span>
                  </div>
                  {item.notes && <p className="text-[11px] text-zinc-500 italic pt-1 border-t border-zinc-200">{item.notes}</p>}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        issueType: item.categoryName.includes('Pin') ? 'Pin / Phù Pin' : item.categoryName.includes('Màn') ? 'Màn Hình / Cảm Ứng' : 'Khác',
                        faultDescription: `Yêu cầu dịch vụ: ${item.name}`,
                        estimatedCost: item.sellPrice,
                        isWarrantyFree: false,
                        warrantyMonthsAfterRepair: item.warrantyPeriodMonths
                      }));
                      setIsAddModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-xs rounded-xl border border-orange-200 transition-colors cursor-pointer"
                  >
                    + Tiếp Nhận Dịch Vụ Này
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: STATS & QC WORKFLOW */}
      {activeTab === 'STATS' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-3xl border border-orange-100 shadow-xs space-y-4">
            <h3 className="font-black text-zinc-900 text-base flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-orange-600" />
              <span>Tiêu Chuẩn Tiếp Nhận & Kiểm Tra Chất Lượng (QC 12 Bước)</span>
            </h3>
            <p className="text-xs text-zinc-600">
              Quy trình chuẩn Apple Service tại Phone House đảm bảo độ bền và tính toàn vẹn của thiết bị khách hàng:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs space-y-1.5">
                <div className="font-bold text-zinc-900 flex items-center space-x-1.5">
                  <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px]">1</span>
                  <span>Tiếp Nhận & Kiểm Tra Ban Đầu</span>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Kiểm tra ngoại quan, chụp ảnh sườn vỏ, check iCloud, ghi nhận mật khẩu và phụ kiện kèm theo.
                </p>
              </div>

              <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs space-y-1.5">
                <div className="font-bold text-zinc-900 flex items-center space-x-1.5">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px]">2</span>
                  <span>Sửa Chữa Trong Phòng Kỹ Thuật</span>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Sử dụng linh kiện bóc máy/chính hãng Pisen, dán ron chống nước áp suất chuẩn zin cho máy.
                </p>
              </div>

              <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs space-y-1.5">
                <div className="font-bold text-zinc-900 flex items-center space-x-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">3</span>
                  <span>Kiểm Tra QC & Xuất Phiếu Bảo Hành</span>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Test toàn bộ tính năng Face ID, TrueTone, Micro, Loa, Camera trước sau và cấp tem bảo hành.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: TIẾP NHẬN MÁY BẢO HÀNH / SỬA CHỮA */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-3xl sm:max-w-3xl overflow-hidden shadow-2xl flex flex-col border border-orange-200">
            <div className="bg-gradient-to-r from-orange-50 via-amber-50/50 to-white px-5 py-4 border-b border-orange-100 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-zinc-900 text-base">Tiếp Nhận Máy Bảo Hành & Sửa Chữa</h3>
                  <p className="text-[11px] text-zinc-500">Tra cứu nhanh theo 15 số IMEI & ghi nhận tình trạng máy</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1.5 hover:bg-zinc-100 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTicket} className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 bg-white">
              {/* Row 1: IMEI & Tra cứu */}
              <div className="p-3.5 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-2">
                <label className="block text-xs font-bold text-zinc-800">
                  Số IMEI Thiết Bị (15 số) * <span className="text-[11px] text-orange-600 font-normal">(Nhập để tự động tìm khách hàng & gói bảo hành)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={formData.imei}
                    onChange={(e) => {
                      setFormData({ ...formData, imei: e.target.value });
                      handleLookupDeviceByImei(e.target.value);
                    }}
                    placeholder="Nhập 15 số IMEI..."
                    className="flex-1 bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleLookupDeviceByImei(formData.imei || '')}
                    className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold hover:bg-orange-600 cursor-pointer"
                  >
                    Tra Cứu Máy
                  </button>
                </div>
              </div>

              {/* Row 2: Customer & Device Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Dòng iPhone *</label>
                  <input
                    type="text"
                    required
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Tên Khách Hàng *</label>
                  <input
                    type="text"
                    required
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Số Điện Thoại *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-mono focus:bg-white focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Row 3: Passcode & Appearance & iCloud */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Mật Khẩu Mở Khóa Máy</label>
                  <input
                    type="text"
                    value={formData.passcode}
                    onChange={(e) => setFormData({ ...formData, passcode: e.target.value })}
                    placeholder="VD: 123456 hoặc Không có"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:border-orange-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Ngoại Quan Lúc Nhận</label>
                  <select
                    value={formData.deviceAppearance}
                    onChange={(e) => setFormData({ ...formData, deviceAppearance: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:border-orange-500"
                  >
                    <option value="Máy Đẹp Keng 99%">Máy Đẹp Keng 99%</option>
                    <option value="Trầy Xước Viền Nhẹ">Trầy Xước Viền Nhẹ</option>
                    <option value="Cấn Móp Góc / Nứt Kính">Cấn Móp Góc / Nứt Kính</option>
                    <option value="Màn Hình Bể / Sọc Toàn Bộ">Màn Hình Bể / Sọc Toàn Bộ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Tình Trạng iCloud</label>
                  <select
                    value={formData.icloudStatus}
                    onChange={(e) => setFormData({ ...formData, icloudStatus: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:border-orange-500"
                  >
                    <option value="Clean / Khách Nhớ Mật Khẩu">Clean / Khách Nhớ Mật Khẩu</option>
                    <option value="Đã Thoát iCloud Tại Quầy">Đã Thoát iCloud Tại Quầy</option>
                    <option value="Mất Nguồn Chưa Kiểm Tra Được">Mất Nguồn Chưa Kiểm Tra Được</option>
                  </select>
                </div>
              </div>

              {/* Row 4: Issue Category & Warranty Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Nhóm Hạng Mục Lỗi *</label>
                  <select
                    value={formData.issueType}
                    onChange={(e) => setFormData({ ...formData, issueType: e.target.value as any })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-bold focus:border-orange-500"
                  >
                    <option value="Màn Hình / Cảm Ứng">Màn Hình / Cảm Ứng (Trắng, Xanh, Sọc 13PM)</option>
                    <option value="Pin / Phù Pin">Pin / Phù Pin / Nhanh Hết Pin</option>
                    <option value="Ép Kính / Thay Lưng">Ép Kính / Ép Cảm Ứng / Thay Kính Lưng</option>
                    <option value="Face ID / Camera">Face ID / Camera Rung Mờ</option>
                    <option value="Mainboard / IC Sạc">Mainboard / IC Nguồn / Mất Sóng</option>
                    <option value="Loa / Mic">Loa Trong / Loa Ngoài / Mic Rè</option>
                    <option value="Khác">Lỗi Khác</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Hình Thức Xử Lý & Chi Phí</label>
                  <div className="flex gap-2">
                    <label className={`flex-1 p-2 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer ${
                      formData.isWarrantyFree ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                    }`}>
                      <input
                        type="radio"
                        name="warrantyType"
                        checked={formData.isWarrantyFree}
                        onChange={() => setFormData({ ...formData, isWarrantyFree: true, estimatedCost: 0 })}
                        className="hidden"
                      />
                      <span>Bảo Hành Miễn Phí (0đ)</span>
                    </label>

                    <label className={`flex-1 p-2 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer ${
                      !formData.isWarrantyFree ? 'bg-orange-50 border-orange-500 text-orange-800' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                    }`}>
                      <input
                        type="radio"
                        name="warrantyType"
                        checked={!formData.isWarrantyFree}
                        onChange={() => setFormData({ ...formData, isWarrantyFree: false, estimatedCost: 650000 })}
                        className="hidden"
                      />
                      <span>Sửa Dịch Vụ Có Phí</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Fault Description & AI Diagnosis */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-zinc-800">Mô Tả Triệu Chứng Cụ Thể</label>
                  <button
                    type="button"
                    onClick={handleRunAIDiagnostic}
                    disabled={isDiagnosing}
                    className="text-xs bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold px-3 py-1 rounded-lg flex items-center space-x-1 shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isDiagnosing ? 'Đang phân tích...' : 'AI Chẩn Đoán Kỹ Thuật'}</span>
                  </button>
                </div>

                <textarea
                  rows={2}
                  value={formData.faultDescription}
                  onChange={(e) => setFormData({ ...formData, faultDescription: e.target.value })}
                  placeholder="VD: Khách báo máy 13 Pro Max đang dùng bị trắng màn hình đột ngột..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs text-zinc-900 focus:bg-white focus:border-orange-500"
                />
              </div>

              {/* AI Diagnostic Result Card */}
              {aiDiagnosticResult && (
                <div className="p-3.5 bg-gradient-to-r from-orange-50/80 to-amber-50/80 border border-orange-200 rounded-2xl text-xs space-y-2">
                  <div className="flex items-center space-x-1.5 font-bold text-orange-800">
                    <Sparkles className="w-4 h-4 text-orange-600" />
                    <span>Kết Quả Phân Tích & Đề Xuất Kỹ Thuật (Gemini AI)</span>
                  </div>

                  <div className="space-y-1 text-zinc-700">
                    <div><strong>Nguyên nhân khả dĩ:</strong> {aiDiagnosticResult.likelyCause}</div>
                    <div><strong>Phương án xử lý:</strong> {aiDiagnosticResult.recommendedAction}</div>
                    <div className="flex gap-4 pt-1 text-[11px] font-bold">
                      <span className="text-orange-700">Thời gian: {aiDiagnosticResult.repairTime}</span>
                      <span className="text-emerald-700">Dự toán: {aiDiagnosticResult.estimatedCostRange}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Row: KTV & Cost & Return Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Kỹ Thuật Phụ Trách</label>
                  <input
                    type="text"
                    value={formData.technician}
                    onChange={(e) => setFormData({ ...formData, technician: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Báo Giá Tạm Tính (VNĐ)</label>
                  <input
                    type="number"
                    disabled={formData.isWarrantyFree}
                    value={formData.estimatedCost}
                    onChange={(e) => setFormData({ ...formData, estimatedCost: Number(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-mono font-bold focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Hẹn Ngày Trả Máy</label>
                  <input
                    type="date"
                    value={formData.expectedReturnDate}
                    onChange={(e) => setFormData({ ...formData, expectedReturnDate: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:bg-white focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Submit Actions */}
              <div className="pt-3 border-t border-zinc-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20 active:scale-95"
                >
                  Lưu & Xuất Phiếu Biên Nhận
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CHI TIẾT TIẾN ĐỘ PHIẾU BẢO HÀNH */}
      {activeTicketDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border border-orange-200 flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-orange-50 via-amber-50/50 to-white px-5 py-4 border-b border-orange-100 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <Wrench className="w-5 h-5 text-orange-600" />
                <div>
                  <h3 className="font-black text-zinc-900 text-base">
                    Phiếu Tiếp Nhận {activeTicketDetails.ticketNumber || activeTicketDetails.id}
                  </h3>
                  <span className="text-[11px] text-zinc-500">Khách: {activeTicketDetails.customerName} ({activeTicketDetails.phone})</span>
                </div>
              </div>
              <button 
                onClick={() => setActiveTicketDetails(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1.5 hover:bg-zinc-100 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs">
              {/* Status Banner */}
              <div className="p-3.5 bg-orange-50/60 border border-orange-200 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase font-bold">Trạng Thái Hiện Tại</div>
                  <div className="mt-1">{getStatusBadge(activeTicketDetails.status)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-zinc-500 uppercase font-bold">KTV Phụ Trách</div>
                  <strong className="text-zinc-900 text-sm">{activeTicketDetails.technician}</strong>
                </div>
              </div>

              {/* Machine specs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                <div>
                  <span className="text-zinc-500 text-[10px] block">Dòng máy:</span>
                  <strong className="text-zinc-900">{activeTicketDetails.model}</strong>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] block">Số IMEI:</span>
                  <strong className="text-zinc-900 font-mono">{activeTicketDetails.imei}</strong>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] block">Mật khẩu màn hình:</span>
                  <strong className="text-orange-700 font-mono">{activeTicketDetails.passcode || 'Không có'}</strong>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] block">Chi phí sửa:</span>
                  <strong className="text-zinc-900 font-mono">
                    {activeTicketDetails.isWarrantyFree ? '0đ (BH Miễn Phí)' : `${(activeTicketDetails.finalCost || activeTicketDetails.estimatedCost).toLocaleString('vi-VN')} đ`}
                  </strong>
                </div>
              </div>

              {/* Fault description & AI */}
              <div className="space-y-2">
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                  <span className="text-[10px] font-bold text-zinc-500 block mb-0.5">Triệu chứng tiếp nhận:</span>
                  <p className="text-zinc-800 italic font-medium">"{activeTicketDetails.faultDescription}"</p>
                </div>

                {activeTicketDetails.aiDiagnostic && (
                  <div className="p-3 bg-orange-50/50 rounded-xl border border-orange-200 text-zinc-700">
                    <span className="text-[10px] font-bold text-orange-700 block mb-0.5">Chẩn đoán kỹ thuật AI:</span>
                    <p>{activeTicketDetails.aiDiagnostic}</p>
                  </div>
                )}
              </div>

              {/* Action Progress Flow */}
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <h4 className="font-black text-zinc-900 uppercase text-[11px] tracking-wider">Cập Nhật Tiến Độ</h4>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleUpdateStatus(activeTicketDetails, 'repairing')}
                    disabled={activeTicketDetails.status === 'repairing'}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1 cursor-pointer ${
                      activeTicketDetails.status === 'repairing' ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-zinc-100 hover:bg-amber-50 text-zinc-700'
                    }`}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>1. Đang Sửa</span>
                  </button>

                  <button
                    onClick={() => handleUpdateStatus(activeTicketDetails, 'ready')}
                    disabled={activeTicketDetails.status === 'ready'}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1 cursor-pointer ${
                      activeTicketDetails.status === 'ready' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-zinc-100 hover:bg-emerald-50 text-zinc-700'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>2. Sửa Xong (QC OK)</span>
                  </button>

                  <button
                    onClick={() => handleUpdateStatus(activeTicketDetails, 'delivered')}
                    disabled={activeTicketDetails.status === 'delivered'}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1 cursor-pointer ${
                      activeTicketDetails.status === 'delivered' ? 'bg-zinc-200 text-zinc-800 border border-zinc-300' : 'bg-zinc-100 hover:bg-orange-50 text-zinc-700'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>3. Đã Giao Khách</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center">
              <button
                onClick={() => {
                  setPrintTicket(activeTicketDetails);
                  setActiveTicketDetails(null);
                }}
                className="px-3.5 py-2 bg-white hover:bg-orange-50 text-zinc-700 border border-zinc-200 rounded-xl font-bold flex items-center space-x-1.5"
              >
                <Printer className="w-4 h-4 text-orange-600" />
                <span>In Phiếu K80</span>
              </button>

              <button
                onClick={() => setActiveTicketDetails(null)}
                className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded-xl font-bold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: IN BIÊN NHẬN K80 / A5 */}
      {printTicket && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-orange-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <span className="font-black text-sm text-zinc-900">Biên Nhận Bảo Hành & Sửa Chữa</span>
              <button onClick={() => setPrintTicket(null)} className="text-zinc-400 hover:text-zinc-600 font-bold">✕</button>
            </div>

            {/* Receipt K80 */}
            <div className="bg-zinc-50 text-black p-4 rounded-xl border border-zinc-300 text-xs font-mono space-y-2 shadow-inner">
              <div className="text-center font-black text-sm uppercase text-orange-600">PHONE HOUSE APPLE PREMIUM</div>
              <div className="text-center text-[10px] text-zinc-600">BIÊN NHẬN SỬA CHỮA & BẢO HÀNH</div>
              <div className="border-b border-dashed border-zinc-400 my-2" />

              <div className="flex justify-between font-bold">
                <span>Số Phiếu:</span>
                <span>{printTicket.ticketNumber || printTicket.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Ngày Nhận:</span>
                <span>{printTicket.receivedDate}</span>
              </div>
              <div className="flex justify-between">
                <span>Khách Hàng:</span>
                <span className="font-bold">{printTicket.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span>SĐT:</span>
                <span>{printTicket.phone}</span>
              </div>
              <div className="flex justify-between">
                <span>Thiết Bị:</span>
                <span className="font-bold">{printTicket.model}</span>
              </div>
              <div className="flex justify-between">
                <span>Số IMEI:</span>
                <span>{printTicket.imei}</span>
              </div>
              <div className="flex justify-between">
                <span>Mật khẩu máy:</span>
                <span>{printTicket.passcode || 'Không có'}</span>
              </div>

              <div className="pt-2 border-t border-dashed border-zinc-400">
                <div><strong>Lỗi tiếp nhận:</strong> {printTicket.issueType}</div>
                <div className="text-[11px] italic">"{printTicket.faultDescription}"</div>
              </div>

              <div className="pt-2 border-t border-dashed border-zinc-400 flex justify-between font-bold">
                <span>Chi phí tạm tính:</span>
                <span>
                  {printTicket.isWarrantyFree ? '0đ (BH Miễn Phí)' : `${(printTicket.finalCost || printTicket.estimatedCost).toLocaleString('vi-VN')} đ`}
                </span>
              </div>

              <div className="text-[10px] text-zinc-500 pt-2 border-t border-dashed border-zinc-400">
                * Quý khách vui lòng mang theo phiếu này khi nhận lại máy. Cửa hàng không chịu trách nhiệm dữ liệu bên trong máy.
              </div>

              {/* Signatures */}
              <div className="pt-4 grid grid-cols-2 gap-2 text-center text-[10px] text-zinc-600 font-sans">
                <div>
                  <div className="font-bold">Khách Hàng</div>
                  <div className="h-10"></div>
                  <div>(Ký, ghi rõ họ tên)</div>
                </div>
                <div>
                  <div className="font-bold">KTV Tiếp Nhận</div>
                  <div className="h-10"></div>
                  <div>{printTicket.technician}</div>
                </div>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20"
              >
                In Biên Nhận (Print)
              </button>
              <button
                onClick={() => setPrintTicket(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
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
