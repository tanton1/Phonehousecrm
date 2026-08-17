import React, { useState } from 'react';
import { 
  UserAccount, 
  Partner, 
  SalesInvoice, 
  DeviceItem 
} from '../types';
import { 
  ShoppingCart, 
  FileText, 
  CalendarClock, 
  RotateCcw, 
  Wallet, 
  Sparkles, 
  Package, Database, 
  CheckSquare, 
  Download, 
  Upload, 
  ArrowLeftRight, 
  Trash2, 
  Box,
  ShieldCheck, 
  Share2, 
  MessageSquare, 
  Boxes, 
  FileEdit, 
  Globe, 
  Users, 
  Building2, 
  Truck, 
  UserCheck, 
  Clock, 
  DollarSign, 
  Percent, 
  Settings, 
  Calendar, 
  TrendingUp, 
  FileSpreadsheet, 
  Receipt, 
  CreditCard, 
  QrCode, 
  Printer, 
  Smartphone, 
  PhoneCall, 
  Languages, 
  LogOut, 
  Edit3, 
  Layers, 
  RefreshCw, 
  Wrench, 
  BookOpen, 
  Bot, 
  Radio, 
  X, 
  Plus, 
  CheckCircle2, 
  ChevronRight,
  Sparkle,
  Zap,
  Flame,
  User,
  HeartHandshake,
  BadgeCheck,
  Shield,
  Headphones,
  Award,
  CircleDollarSign,
  Scale,
  Store,
  Warehouse,
  PackageCheck,
  ScanFace
} from 'lucide-react';

interface MoreHubViewProps {
  currentUser?: UserAccount | null;
  onSelectTab: (tabId: string) => void;
  onOpenPOSModal: () => void;
  onOpenNewDeviceModal: () => void;
  onOpenAICopilot: () => void;
  onOpenLoginModal: () => void;
  onLogout: () => void;
  partners?: Partner[];
  invoices?: SalesInvoice[];
  devices?: DeviceItem[];
}

export const MoreHubView: React.FC<MoreHubViewProps> = ({
  currentUser,
  onSelectTab,
  onOpenPOSModal,
  onOpenNewDeviceModal,
  onOpenAICopilot,
  onOpenLoginModal,
  onLogout,
  partners = [],
  invoices = [],
  devices = []
}) => {
  const [activeSubModal, setActiveSubModal] = useState<string | null>(null);
  const [isEditingStoreInfo, setIsEditingStoreInfo] = useState(false);

  // Store information
  const [storeInfo, setStoreInfo] = useState({
    name: 'PHONE HOUSE • APPLE STORE',
    branch: 'Chi nhánh: 123 Cầu Giấy, Q. Cầu Giấy, Hà Nội',
    phone: '0909.123.456',
    address: '123 Cầu Giấy, P. Quan Hoa, TP. Hà Nội',
    taxCode: '0109988776',
    qrAccount: '0909123456 (MBBANK - NGUYEN NHAT TAN)'
  });

  // Preorders mock state
  const [preorders] = useState([
    {
      id: 'PRE-8841',
      customer: 'Trần Văn Hoàng',
      phone: '0988.222.111',
      model: 'iPhone 16 Pro Max 256GB Sa Mạc (Desert Titanium)',
      deposit: 5000000,
      totalPrice: 34500000,
      expectedDate: '20/08/2026',
      status: 'Đã nhận cọc - Đang về hàng',
      note: 'Ưu tiên lấy đợt 1, tặng ốp Torras'
    },
    {
      id: 'PRE-8840',
      customer: 'Nguyễn Thị Mai',
      phone: '0912.333.444',
      model: 'iPhone 16 Plus 128GB Hồng Phấn',
      deposit: 3000000,
      totalPrice: 24500000,
      expectedDate: '22/08/2026',
      status: 'Sẵn sàng giao',
      note: 'Giao tận nơi hoặc nhận tại cửa hàng'
    }
  ]);

  // Repairs mock state
  const [repairs] = useState([
    {
      id: 'SC-1049',
      customer: 'Hoàng Anh Tuấn',
      phone: '0977.888.999',
      device: 'iPhone 14 Pro 128GB Tím',
      issue: 'Vỡ kính màn hình, pin báo bảo trì 78%',
      estimatedCost: 1850000,
      technician: 'KTV Nam Apple',
      status: 'Đang ép kính & thay pin Zin',
      receivedTime: '14/08 09:30',
      returnTime: '14/08 16:30'
    },
    {
      id: 'SC-1048',
      customer: 'Phạm Minh Đức',
      phone: '0933.456.789',
      device: 'iPhone 13 Pro Max Xanh Sierra',
      issue: 'Màn hình chớp trắng, mất FaceID',
      estimatedCost: 1200000,
      technician: 'KTV Tuấn Anh',
      status: 'Đã xử lý xong - Chờ khách lấy',
      receivedTime: '13/08 14:15',
      returnTime: '14/08 17:00'
    }
  ]);

  // Inventory Audit Sessions
  const [audits] = useState([
    {
      id: 'KK-202608',
      title: 'Kiểm kê kho iPhone Tủ Kính Mặt Tiền',
      date: '14/08/2026',
      auditor: 'Nhật Tân (Admin)',
      systemQty: 48,
      actualQty: 48,
      diff: 0,
      status: 'Khớp 100%'
    },
    {
      id: 'KK-202607',
      title: 'Kiểm kê Phụ kiện Củ Sạc & Cường lực KingKong',
      date: '10/08/2026',
      auditor: 'Thu ngân Linh',
      systemQty: 150,
      actualQty: 148,
      diff: -2,
      status: 'Lệch 2 củ sạc (Đã bù trừ)'
    }
  ]);

  // Deliveries mock state
  const [shipments] = useState([
    {
      code: 'GHN-9842104',
      carrier: 'Giao Hàng Nhanh (GHN)',
      customer: 'Lê Hoàng Nam - Hội An',
      phone: '0905.777.333',
      item: 'iPhone 15 Pro 128GB Đen',
      cod: 21500000,
      status: 'Đang luân chuyển giao hàng',
      fee: 45000
    },
    {
      code: 'GHTK-552199',
      carrier: 'GHTK Express',
      customer: 'Phạm Thị Bích - Tam Kỳ',
      phone: '0935.123.888',
      item: 'Combo Sạc Anker 30W + Ốp Torras',
      cod: 750000,
      status: 'Đã giao thành công - Đã đối soát COD',
      fee: 30000
    }
  ]);

  // Staff Timesheet & Payroll mock state
  const [staffTimesheet] = useState([
    { name: 'Nguyễn Nhật Tân', role: 'Chủ Cửa Hàng / Quản Lý', workDays: 26, salesCount: 38, commission: 5700000, salary: 25700000, status: 'Đã chốt lương' },
    { name: 'Trần Mỹ Linh', role: 'Thu Ngân & Bán Hàng', workDays: 26, salesCount: 24, commission: 3600000, salary: 12600000, status: 'Đang tính công' },
    { name: 'Lê Tuấn Anh', role: 'Kỹ Thuật Phần Cứng', workDays: 25, salesCount: 15, commission: 2800000, salary: 13800000, status: 'Đang tính công' }
  ]);

  // All 11 primary pages in app
  const primaryPages = [
    {
      id: 'dashboard',
      label: 'Tổng Quan Doanh Thu',
      subtitle: 'KPI, Doanh thu, Lợi nhuận',
      icon: Layers,
      color: 'text-orange-500',
      badge: 'Trực quan'
    },
    {
      id: 'purchase-orders',
      label: 'Nhập Hàng (Phiếu Nhập NCC)',
      subtitle: 'Quản lý phiếu nhập máy & phụ kiện theo NCC',
      icon: PackageCheck,
      color: 'text-orange-600',
      badge: 'Nhập hàng NCC'
    },
    {
      id: 'inventory',
      label: 'Kho iPhone IMEI 15 Số',
      subtitle: 'Pin %, Lần sạc, LL/A, VN/A',
      icon: Smartphone,
      color: 'text-amber-500',
      badge: `${devices.length} máy`
    },
    {
      id: 'transfers',
      label: 'Chuyển Kho & Điều Vận',
      subtitle: 'Luân chuyển giữa 3 chi nhánh',
      icon: ArrowLeftRight,
      color: 'text-orange-600',
      badge: '3 Chi nhánh'
    },
    {
      id: 'master-catalog',
      label: 'Danh Mục Hàng Hóa Gốc (Master SKU)',
      subtitle: 'Mã SKU, Bảng giá gốc Máy & Linh Kiện',
      icon: Database,
      color: 'text-orange-600',
      badge: 'Master Catalog'
    },
    {
      id: 'products',
      label: 'Kho Linh Kiện & Phụ Kiện',
      subtitle: 'Màn hình, Pin zin, Ốp sạc',
      icon: Package,
      color: 'text-amber-600',
      badge: 'Linh phụ kiện'
    },
    {
      id: 'pos',
      label: 'Bán Hàng POS Nhanh',
      subtitle: 'Quét barcode, VietQR, Giỏ hàng',
      icon: ShoppingCart,
      color: 'text-orange-600',
      badge: 'POS Thu Ngân'
    },
    {
      id: 'invoices',
      label: 'Quản Lý Hóa Đơn & Bill',
      subtitle: 'Chi tiết hóa đơn, In K80, VietQR',
      icon: FileText,
      color: 'text-orange-500',
      badge: `${invoices.length} đơn`
    },
    {
      id: 'crm',
      label: 'Khách Hàng (CRM Leads)',
      subtitle: 'Phân loại VIP, K-Point, Phễu',
      icon: Users,
      color: 'text-amber-600',
      badge: 'CRM VIP'
    },
    {
      id: 'tradein',
      label: 'Thu Cũ Đổi Mới (Trade-in)',
      subtitle: 'Thẩm định AI, Trợ giá lên đời',
      icon: RefreshCw,
      color: 'text-orange-500',
      badge: 'Hot Trade-in'
    },
    {
      id: 'warranty',
      label: 'Bảo Hành & Sửa Chữa',
      subtitle: 'Tra cứu IMEI, Linh kiện zin',
      icon: Wrench,
      color: 'text-amber-500',
      badge: 'IMEI Care'
    },
    {
      id: 'cashbook',
      label: 'Sổ Quỹ Thu Chi',
      subtitle: 'Dòng tiền mặt, Ngân hàng',
      icon: Wallet,
      color: 'text-orange-600',
      badge: 'Tài chính'
    },
    {
      id: 'partners',
      label: 'Đối Tác & Nhà Cung Cấp',
      subtitle: 'Nguồn hàng sỉ, Đại lý phụ kiện',
      icon: Building2,
      color: 'text-amber-500',
      badge: `${partners.length} đối tác`
    },
    {
      id: 'users',
      label: 'Phân Quyền User & Nhân Viên',
      subtitle: 'Admin, Quản lý, Kỹ thuật',
      icon: ShieldCheck,
      color: 'text-orange-500',
      badge: 'Bảo mật'
    },
    {
      id: 'installments',
      label: 'Đối Soát Trả Góp',
      subtitle: 'HD Saison, Home Credit, Mpos',
      icon: Scale,
      color: 'text-orange-600',
      badge: 'Giải ngân'
    },
    {
      id: 'employee-dashboard',
      label: 'Dashboard Nhân Viên (KPI)',
      subtitle: 'Hóa đơn bán, Doanh thu vs Mục tiêu, Xử lý BH',
      icon: TrendingUp,
      color: 'text-orange-500',
      badge: 'KPI Cá Nhân'
    },
    {
      id: 'checkin-portal',
      label: 'Điểm Danh Nhanh (Fast Check-in)',
      subtitle: 'Quy trình 4 bước: GPS, Wi-Fi, Face ID & Xác nhận',
      icon: ScanFace,
      color: 'text-[#FF4B16]',
      badge: 'Chấm công 4 bước'
    },
    {
      id: 'hr-attendance',
      label: 'Chấm Công, Ca Làm & Lương',
      subtitle: 'Check-in 4 lớp, KPI, Lịch tuần & Phiếu lương',
      icon: Clock,
      color: 'text-[#FF4B16]',
      badge: 'HRM Suite'
    },
    {
      id: 'store-settings',
      label: 'Cài Đặt Cửa Hàng & Kho',
      subtitle: 'Chi nhánh, kho hàng, máy in K80, logo',
      icon: Settings,
      color: 'text-orange-600',
      badge: 'Hệ thống'
    },
    {
      id: 'erpnext-plan',
      label: 'Kiến Trúc Chuỗi ERPNext',
      subtitle: 'Quản trị chuỗi bán lẻ chuẩn QT',
      icon: BookOpen,
      color: 'text-amber-600',
      badge: 'ERP Pro'
    }
  ];

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-orange-50/40 via-amber-50/20 to-white pb-24 sm:pb-12 text-zinc-900 animate-fadeIn">
      
      {/* Top Status Bar */}
      <div className="w-full py-1.5 flex items-center justify-between px-2 sm:px-4">
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
          <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-orange-700">
            Phone House Management Suite
          </span>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="w-8 h-8 rounded-full bg-white shadow-2xs border border-orange-200/80 flex items-center justify-center text-orange-500 hover:rotate-180 hover:bg-orange-50 transition-all duration-500 cursor-pointer"
          title="Làm mới trang"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Content Stream */}
      <div className="w-full space-y-3 sm:space-y-4">
        
        {/* ================= STORE BRAND HEADER ================= */}
        <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 text-white shadow-md shadow-orange-500/15 border border-orange-400/30">
          <div className="relative z-10 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-xl sm:rounded-2xl bg-white text-orange-600 flex items-center justify-center font-bold text-xl sm:text-2xl shadow-sm border border-amber-200 shrink-0">
                <span>PH</span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1 className="text-base sm:text-xl font-semibold text-white leading-tight truncate">
                    {storeInfo.name}
                  </h1>
                  <span className="text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full bg-white/90 text-orange-700 font-semibold shadow-2xs whitespace-nowrap">
                    ● Chi nhánh hoạt động
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-orange-100 font-medium truncate">{storeInfo.branch}</p>
                <p className="text-[10px] sm:text-[11px] text-amber-100/90 truncate">{storeInfo.address}</p>
              </div>
            </div>

            <button
              onClick={() => onSelectTab('store-settings')}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center text-white transition-all shrink-0 cursor-pointer"
              title="Cài đặt thông tin cửa hàng, chi nhánh & kho"
            >
              <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          <div 
            onClick={() => onSelectTab('store-settings')}
            className="mt-3 pt-2.5 border-t border-white/20 flex items-center justify-between text-[11px] sm:text-xs font-medium text-white/90 hover:text-white cursor-pointer group"
          >
            <div className="flex items-center space-x-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0"></span>
              <span className="truncate">Hotline: <strong className="text-amber-200">{storeInfo.phone}</strong> • MST: {storeInfo.taxCode}</span>
            </div>
            <span className="flex items-center text-amber-200 shrink-0 group-hover:translate-x-1 transition-transform ml-2">
              Quản lý Cửa Hàng & Kho <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </span>
          </div>
        </div>

        {/* ================= 1. BÁN HÀNG & DỊCH VỤ ================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs border border-orange-100/80">
          <div className="flex items-center space-x-2 mb-3">
            <ShoppingCart className="w-5 h-5 text-orange-500 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-zinc-900">Bán Hàng & Dịch Vụ</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button onClick={() => { onSelectTab('pos'); onOpenPOSModal(); }} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <ShoppingCart className="w-5 h-5 text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Bán Hàng POS</span>
                <span className="text-[10px] text-zinc-500 truncate block">Lên đơn, quét mã</span>
              </div>
            </button>
            <button onClick={() => onSelectTab('invoices')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <FileText className="w-5 h-5 text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Hóa Đơn & Bill</span>
                <span className="text-[10px] text-zinc-500 truncate block">Chi tiết & In K80</span>
              </div>
            </button>
            <button onClick={() => onSelectTab('tradein')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <RefreshCw className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-emerald-600 truncate">Thu Cũ Đổi Mới</span>
                <span className="text-[10px] text-zinc-500 truncate block">Định giá máy cũ</span>
              </div>
            </button>
            <button onClick={() => onSelectTab('warranty')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <Wrench className="w-5 h-5 text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Bảo Hành & Sửa Chữa</span>
                <span className="text-[10px] text-zinc-500 truncate block">Nhận máy, báo giá</span>
              </div>
            </button>
            {/* Mock Features */}
            <button onClick={() => setActiveSubModal('preorders')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-zinc-50 border border-transparent transition-all text-left cursor-pointer group">
              <CalendarClock className="w-4 h-4 text-zinc-400 group-hover:text-orange-500 shrink-0" />
              <div className="min-w-0"><span className="text-[11px] sm:text-xs font-medium text-zinc-600 truncate block">Đặt hàng (Pre-order)</span></div>
            </button>
            <button onClick={() => setActiveSubModal('returns')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-zinc-50 border border-transparent transition-all text-left cursor-pointer group">
              <RotateCcw className="w-4 h-4 text-zinc-400 group-hover:text-orange-500 shrink-0" />
              <div className="min-w-0"><span className="text-[11px] sm:text-xs font-medium text-zinc-600 truncate block">Đổi trả hàng</span></div>
            </button>
          </div>
        </div>

        {/* ================= 2. KHO HÀNG & VẬN HÀNH ================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs border border-orange-100/80">
          <div className="flex items-center space-x-2 mb-3">
            <Package className="w-5 h-5 text-amber-500 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-zinc-900">Kho Hàng & Vận Hành</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {/* MASTER CATALOG ITEM (Highlighted) */}
            <button 
              onClick={() => onSelectTab('master-catalog')} 
              className="col-span-2 flex items-center space-x-3 p-3 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-orange-500/5 hover:from-orange-500/20 hover:to-amber-500/20 border border-orange-200 hover:border-orange-400 transition-all text-left cursor-pointer group shadow-2xs"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs sm:text-sm font-black text-zinc-900 block group-hover:text-orange-600 truncate">
                    Danh Mục Hàng Hóa Gốc (Master Catalog)
                  </span>
                  <span className="px-1.5 py-0.2 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[9px] font-extrabold rounded-md uppercase tracking-wider shrink-0">
                    Mã Gốc SKU
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 truncate block">
                  Quản lý SKU chuẩn: Thiết bị iPhone/iPad, Linh kiện & Phụ kiện
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-orange-400 group-hover:translate-x-1 transition-transform shrink-0" />
            </button>

            <button onClick={() => onSelectTab('inventory')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <Smartphone className="w-5 h-5 text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Kho IMEI Thiết Bị</span>
                <span className="text-[10px] text-zinc-500 truncate block">iPhone, iPad, Mac</span>
              </div>
            </button>
            <button onClick={() => onSelectTab('products')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <Box className="w-5 h-5 text-orange-500 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Kho Linh Phụ Kiện</span>
                <span className="text-[10px] text-zinc-500 truncate block">Ốp, Sạc, Màn hình</span>
              </div>
            </button>
            <button onClick={() => onSelectTab('purchase-orders')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <PackageCheck className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Nhập Hàng NCC</span>
                <span className="text-[10px] text-zinc-500 truncate block">Tạo Phiếu nhập kho</span>
              </div>
            </button>
            <button onClick={() => onSelectTab('transfers')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <ArrowLeftRight className="w-5 h-5 text-orange-500 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Chuyển Kho Nội Bộ</span>
                <span className="text-[10px] text-zinc-500 truncate block">Điều vận liên chi nhánh</span>
              </div>
            </button>
            {/* Mock Features */}
            <button onClick={() => setActiveSubModal('audits')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-zinc-50 border border-transparent transition-all text-left cursor-pointer group">
              <CheckSquare className="w-4 h-4 text-zinc-400 group-hover:text-orange-500 shrink-0" />
              <div className="min-w-0"><span className="text-[11px] sm:text-xs font-medium text-zinc-600 truncate block">Kiểm kê định kỳ</span></div>
            </button>
            <button onClick={() => setActiveSubModal('shipments')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-zinc-50 border border-transparent transition-all text-left cursor-pointer group">
              <Truck className="w-4 h-4 text-zinc-400 group-hover:text-orange-500 shrink-0" />
              <div className="min-w-0"><span className="text-[11px] sm:text-xs font-medium text-zinc-600 truncate block">Vận đơn bưu cục</span></div>
            </button>
          </div>
        </div>

        {/* ================= 3. KHÁCH HÀNG & ĐỐI TÁC ================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs border border-orange-100/80">
          <div className="flex items-center space-x-2 mb-3">
            <Users className="w-5 h-5 text-orange-500 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-zinc-900">Khách Hàng & Đối Tác</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button onClick={() => onSelectTab('crm')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <MessageSquare className="w-5 h-5 text-orange-500 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Khách Hàng CRM</span>
                <span className="text-[10px] text-zinc-500 truncate block">Quản lý Phễu & Zalo</span>
              </div>
            </button>
            <button onClick={() => onSelectTab('partners')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <Building2 className="w-5 h-5 text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Đối Tác & NCC</span>
                <span className="text-[10px] text-zinc-500 truncate block">Sổ nợ nhà cung cấp</span>
              </div>
            </button>
            {/* Mock */}
            <button onClick={() => setActiveSubModal('vip_members')} className="col-span-2 flex items-center space-x-3 p-2.5 rounded-xl hover:bg-zinc-50 border border-transparent transition-all text-left cursor-pointer group">
              <Award className="w-4 h-4 text-zinc-400 group-hover:text-orange-500 shrink-0" />
              <div className="min-w-0"><span className="text-[11px] sm:text-xs font-medium text-zinc-600 truncate block">Tích điểm Khách VIP (K-Point)</span></div>
            </button>
          </div>
        </div>

        {/* ================= 4. KẾ TOÁN & TÀI CHÍNH ================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs border border-orange-100/80">
          <div className="flex items-center space-x-2 mb-3">
            <Wallet className="w-5 h-5 text-emerald-500 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-zinc-900">Kế Toán & Tài Chính</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button onClick={() => onSelectTab('dashboard')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <TrendingUp className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Báo Cáo & Lợi Nhuận</span>
                <span className="text-[10px] text-zinc-500 truncate block">Biểu đồ tổng quan</span>
              </div>
            </button>
            <button onClick={() => onSelectTab('cashbook')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <CircleDollarSign className="w-5 h-5 text-orange-500 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Sổ Quỹ Thu Chi</span>
                <span className="text-[10px] text-zinc-500 truncate block">Tiền mặt, Ngân hàng</span>
              </div>
            </button>
            <button onClick={() => onSelectTab('installments')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <Scale className="w-5 h-5 text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Đối Soát Trả Góp</span>
                <span className="text-[10px] text-zinc-500 truncate block">HD Saison, HomeCredit</span>
              </div>
            </button>
            <button onClick={() => setActiveSubModal('tax_accounting')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-zinc-50 border border-transparent transition-all text-left cursor-pointer group">
              <FileSpreadsheet className="w-4 h-4 text-zinc-400 group-hover:text-orange-500 shrink-0" />
              <div className="min-w-0"><span className="text-[11px] sm:text-xs font-medium text-zinc-600 truncate block">Thuế & VAT</span></div>
            </button>
          </div>
        </div>

        {/* ================= 5. NHÂN SỰ & QUẢN TRỊ ================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs border border-orange-100/80">
          <div className="flex items-center space-x-2 mb-3">
            <UserCheck className="w-5 h-5 text-orange-500 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-zinc-900">Nhân Sự & Quản Trị</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            <button onClick={() => onSelectTab('hr-attendance')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <Clock className="w-5 h-5 text-[#FF4B16] group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Hub Nhân Sự & Lương</span>
                <span className="text-[10px] text-zinc-500 truncate block">Bảng công, Xếp ca, Lương KTV</span>
              </div>
            </button>
            <button onClick={() => onSelectTab('employee-dashboard')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <Award className="w-5 h-5 text-amber-500 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">KPI Cá Nhân (Nhân viên)</span>
                <span className="text-[10px] text-zinc-500 truncate block">Theo dõi target cá nhân</span>
              </div>
            </button>
            <button onClick={() => onSelectTab('users')} className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <ShieldCheck className="w-5 h-5 text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-zinc-900 block group-hover:text-orange-600 truncate">Phân Quyền Hệ Thống</span>
                <span className="text-[10px] text-zinc-500 truncate block">Quản lý User & Vai trò</span>
              </div>
            </button>
          </div>
        </div>

        {/* ================= TRỢ LÝ AI COPILOT CARD ================= */}
        <div className="relative overflow-hidden bg-zinc-900 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-lg border border-zinc-800 group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Sparkle className="w-24 h-24 text-white" />
          </div>
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-2 text-emerald-400 mb-1">
                <Sparkles className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Trí Tuệ Nhân Tạo</span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-white">Trợ lý AI Copilot</h3>
              <p className="text-[11px] sm:text-xs text-zinc-400 mt-1 max-w-[200px] sm:max-w-[250px]">
                Phân tích dữ liệu, tự động tạo nội dung CRM và gợi ý chiến lược.
              </p>
            </div>
            <button
              onClick={onOpenAICopilot}
              className="px-4 py-2 bg-white text-zinc-900 font-bold text-xs rounded-xl shadow-lg hover:scale-105 transition-transform cursor-pointer flex items-center space-x-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Mở AI</span>
            </button>
          </div>
        </div>

        {/* ================= 6. CÀI ĐẶT HỆ THỐNG ================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs border border-orange-100/80">
          <div className="flex items-center space-x-2 mb-3">
            <Settings className="w-5 h-5 text-zinc-600 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-zinc-900">Cài Đặt Hệ Thống</h2>
          </div>
          <div className="space-y-1">
            <button onClick={() => onSelectTab('store-settings')} className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <div className="flex items-center space-x-3 min-w-0">
                <Store className="w-5 h-5 text-orange-600 group-hover:text-orange-700 shrink-0 transition-colors" />
                <div className="min-w-0">
                  <span className="text-xs sm:text-sm font-bold text-zinc-900 group-hover:text-orange-600 truncate block">Cài Đặt Cửa Hàng & In Bill</span>
                  <span className="text-[10px] sm:text-xs text-zinc-500 truncate block">Mẫu in K80, thông tin, logo</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
            </button>
            <button onClick={() => onSelectTab('erpnext-plan')} className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group bg-orange-50/30">
              <div className="flex items-center space-x-3 min-w-0">
                <BookOpen className="w-5 h-5 text-amber-600 group-hover:text-orange-700 shrink-0 transition-colors" />
                <div className="min-w-0">
                  <span className="text-xs sm:text-sm font-bold text-zinc-900 group-hover:text-orange-600 truncate block">Kiến Trúc ERPNext Chuỗi Bán Lẻ</span>
                  <span className="text-[10px] sm:text-xs text-zinc-500 truncate block">Sẵn sàng Scale lên Enterprise</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
            </button>
            {/* Quick settings mock */}
            <button onClick={() => setActiveSubModal('vietqr_speaker')} className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-zinc-50 border border-transparent transition-all text-left cursor-pointer group">
              <div className="flex items-center space-x-3 min-w-0">
                <QrCode className="w-4 h-4 text-zinc-400 shrink-0 transition-colors" />
                <span className="text-[11px] sm:text-xs font-medium text-zinc-600 truncate">Cấu hình loa VietQR Ting Ting</span>
              </div>
              <ChevronRight className="w-3 h-3 text-zinc-300 shrink-0" />
            </button>
            <button onClick={onLogout} className="w-full mt-2 flex items-center justify-between p-2.5 rounded-xl hover:bg-red-50 text-red-600 transition-all text-left cursor-pointer group border border-red-100">
              <div className="flex items-center space-x-3 min-w-0">
                <LogOut className="w-5 h-5 text-red-500 shrink-0 transition-colors" />
                <span className="text-xs sm:text-sm font-bold truncate">Đăng xuất ({currentUser?.fullName || 'Tài khoản'})</span>
              </div>
              <ChevronRight className="w-4 h-4 text-red-400 shrink-0" />
            </button>
          </div>
        </div>
        
        {/* Footer info */}
        <div className="text-center py-2 text-[10px] text-zinc-400">
          Phone House POS Suite v3.2.0 • Hệ thống bán lẻ iPhone chuyên nghiệp
        </div>

      </div>

      {/* ================= EDIT STORE INFO MODAL ================= */}
      {isEditingStoreInfo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl border border-orange-200 overflow-hidden animate-scaleIn max-h-[90vh] flex flex-col">
            <div className="p-3.5 sm:p-4 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-white" />
                <h3 className="text-sm sm:text-base font-semibold">Cài Đặt Cửa Hàng & In Bill</h3>
              </div>
              <button 
                onClick={() => setIsEditingStoreInfo(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 sm:p-5 space-y-3 overflow-y-auto flex-1 text-xs sm:text-sm">
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Tên cửa hàng (Hiển thị đầu hóa đơn):</label>
                <input 
                  type="text" 
                  value={storeInfo.name}
                  onChange={(e) => setStoreInfo({ ...storeInfo, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-normal"
                />
              </div>

              <div>
                <label className="block font-medium text-zinc-700 mb-1">Chi nhánh quản lý:</label>
                <input 
                  type="text" 
                  value={storeInfo.branch}
                  onChange={(e) => setStoreInfo({ ...storeInfo, branch: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-normal"
                />
              </div>

              <div>
                <label className="block font-medium text-zinc-700 mb-1">Địa chỉ showroom:</label>
                <input 
                  type="text" 
                  value={storeInfo.address}
                  onChange={(e) => setStoreInfo({ ...storeInfo, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-normal"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Hotline CSKH:</label>
                  <input 
                    type="text" 
                    value={storeInfo.phone}
                    onChange={(e) => setStoreInfo({ ...storeInfo, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-normal"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Mã số thuế:</label>
                  <input 
                    type="text" 
                    value={storeInfo.taxCode}
                    onChange={(e) => setStoreInfo({ ...storeInfo, taxCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-normal"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-zinc-700 mb-1">Tài khoản nhận tiền VietQR động:</label>
                <input 
                  type="text" 
                  value={storeInfo.qrAccount}
                  onChange={(e) => setStoreInfo({ ...storeInfo, qrAccount: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500 font-normal"
                />
              </div>
            </div>

            <div className="p-3 bg-zinc-50 border-t border-zinc-200 flex items-center justify-end space-x-2 shrink-0">
              <button
                onClick={() => setIsEditingStoreInfo(false)}
                className="px-4 py-2 rounded-xl border border-zinc-300 font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  setIsEditingStoreInfo(false);
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold shadow-md shadow-orange-500/20 hover:opacity-95 cursor-pointer"
              >
                Lưu Thay Đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= SUB-MODAL HANDLERS ================= */}
      {activeSubModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl border border-orange-200 overflow-hidden animate-scaleIn max-h-[90vh] flex flex-col">
            
            {/* Submodal Header */}
            <div className="p-3.5 sm:p-4 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2 min-w-0">
                <span className="text-white shrink-0">
                  {activeSubModal === 'preorders' && <CalendarClock className="w-5 h-5" />}
                  {activeSubModal === 'repairs' && <Wrench className="w-5 h-5" />}
                  {activeSubModal === 'audits' && <CheckSquare className="w-5 h-5" />}
                  {activeSubModal === 'shipments' && <Truck className="w-5 h-5" />}
                  {activeSubModal === 'payroll' && <DollarSign className="w-5 h-5" />}
                  {activeSubModal === 'vietqr_speaker' && <QrCode className="w-5 h-5" />}
                  {activeSubModal === 'hardware' && <Printer className="w-5 h-5" />}
                  {['preorders', 'repairs', 'audits', 'shipments', 'payroll', 'vietqr_speaker', 'hardware'].indexOf(activeSubModal) === -1 && <Package className="w-5 h-5" />}
                </span>
                <h3 className="text-sm sm:text-base font-semibold truncate">
                  {activeSubModal === 'preorders' && 'Quản Lý Đơn Đặt Hàng Pre-order'}
                  {activeSubModal === 'repairs' && 'Phiếu Tiếp Nhận Sửa Chữa Điện Thoại'}
                  {activeSubModal === 'audits' && 'Kiểm Kê Kho & Cân Bằng Tồn'}
                  {activeSubModal === 'shipments' && 'Quản Lý Vận Đơn & Tra Cứu GHN/GHTK'}
                  {activeSubModal === 'payroll' && 'Bảng Lương & Hoa Hồng Doanh Số'}
                  {activeSubModal === 'vietqr_speaker' && 'Cấu Hình Loa Báo Tiền VietQR Ting Ting'}
                  {activeSubModal === 'hardware' && 'Bộ Thiết Bị Phần Cứng Bán Hàng POS'}
                  {activeSubModal === 'returns' && 'Quản Lý Trả Hàng Đổi Trả'}
                  {activeSubModal === 'services' && 'Mua Gói Dịch Vụ & Bảo Hành Mở Rộng'}
                  {activeSubModal === 'supplier_returns' && 'Trả Hàng Nhập Nhà Cung Cấp'}
                  {activeSubModal === 'stock_transfers' && 'Chuyển Hàng Nội Bộ Chi Nhánh'}
                  {activeSubModal === 'write_offs' && 'Xuất Huỷ Hàng Hỏng & Linh Kiện'}
                  {activeSubModal === 'internal_use' && 'Xuất Dùng Nội Bộ & Trưng Bày'}
                  {activeSubModal === 'vip_members' && 'Khách Hàng Thân Thiết VIP & Tích Điểm'}
                  {activeSubModal === 'reviews' && 'Khảo Sát & Đánh Giá Chất Lượng CSKH'}
                  {activeSubModal === 'carriers' && 'Đối Soát Tiền Thu Hộ COD'}
                  {activeSubModal === 'schedule' && 'Lịch Làm Việc & Xếp Ca Nhân Sự'}
                  {activeSubModal === 'attendance' && 'Nhật Ký Chấm Công GPS / WiFi'}
                  {activeSubModal === 'commissions' && 'Chính Sách Hoa Hồng Theo Cây Máy'}
                  {activeSubModal === 'end_of_day' && 'Chốt Ca & Kiểm Kê Tiền Két Cuối Ngày'}
                  {activeSubModal === 'tax_accounting' && 'Kê Khai Thuế Hộ Kinh Doanh'}
                  {activeSubModal === 'business_loan' && 'Vốn Vay Nhập Hàng Lãi Suất Ưu Đãi'}
                  {activeSubModal === 'language' && 'Tùy Chọn Ngôn Ngữ Hệ Thống'}
                </h3>
              </div>
              <button 
                onClick={() => setActiveSubModal(null)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white cursor-pointer shrink-0 ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Submodal Body */}
            <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 space-y-3 text-xs sm:text-sm">
              
              {/* 1. Preorders View */}
              {activeSubModal === 'preorders' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-700">Danh sách khách đặt trước ({preorders.length}):</span>
                    <button 
                      onClick={() => alert('Đã mở form nhận cọc Pre-order mới!')}
                      className="px-2.5 py-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-medium text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm Cọc
                    </button>
                  </div>
                  {preorders.map((po) => (
                    <div key={po.id} className="p-3 rounded-xl border border-orange-100 bg-orange-50/30 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-orange-700">{po.id} • {po.customer}</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                          {po.status}
                        </span>
                      </div>
                      <div className="text-zinc-800 font-medium">{po.model}</div>
                      <div className="flex flex-wrap items-center justify-between text-xs text-zinc-600 gap-1 pt-1 border-t border-orange-100">
                        <span>Cọc: <strong className="text-emerald-600">{po.deposit.toLocaleString()} đ</strong> / {po.totalPrice.toLocaleString()} đ</span>
                        <span>Hẹn: <strong>{po.expectedDate}</strong></span>
                      </div>
                      {po.note && <div className="text-[11px] text-zinc-500 italic">Ghi chú: {po.note}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* 2. Repairs View */}
              {activeSubModal === 'repairs' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-700">Phiếu sửa chữa đang xử lý ({repairs.length}):</span>
                    <button 
                      onClick={() => alert('Đã mở form tiếp nhận sửa chữa mới!')}
                      className="px-2.5 py-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-medium text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Nhận Máy
                    </button>
                  </div>
                  {repairs.map((rp) => (
                    <div key={rp.id} className="p-3 rounded-xl border border-orange-100 bg-orange-50/30 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-orange-700">{rp.id} • {rp.customer} ({rp.phone})</span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                          rp.status.includes('xong') ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'
                        }`}>
                          {rp.status}
                        </span>
                      </div>
                      <div className="font-semibold text-zinc-800">{rp.device}</div>
                      <div className="text-zinc-600">Lỗi: <span className="text-red-600 font-medium">{rp.issue}</span></div>
                      <div className="flex flex-wrap items-center justify-between text-xs text-zinc-600 pt-1 border-t border-orange-100">
                        <span>Chi phí ước tính: <strong className="text-emerald-600">{rp.estimatedCost.toLocaleString()} đ</strong></span>
                        <span>Phụ trách: <strong>{rp.technician}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 3. Audits View */}
              {activeSubModal === 'audits' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-700">Đợt kiểm kê gần nhất:</span>
                    <button 
                      onClick={() => alert('Bắt đầu quét barcode kiểm đếm kho!')}
                      className="px-2.5 py-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-medium text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <CheckSquare className="w-3.5 h-3.5" /> Tạo Phiếu Kiểm
                    </button>
                  </div>
                  {audits.map((au) => (
                    <div key={au.id} className="p-3 rounded-xl border border-orange-100 bg-orange-50/30 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-orange-700">{au.id} • {au.date}</span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                          au.diff === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {au.status}
                        </span>
                      </div>
                      <div className="font-medium text-zinc-800">{au.title}</div>
                      <div className="flex items-center justify-between text-xs text-zinc-600 pt-1 border-t border-orange-100">
                        <span>Hệ thống: <strong>{au.systemQty}</strong> | Thực tế: <strong>{au.actualQty}</strong></span>
                        <span>Kiểm kê viên: <strong>{au.auditor}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 4. Shipments View */}
              {activeSubModal === 'shipments' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-700">Vận đơn bưu cục đang kết nối:</span>
                    <button 
                      onClick={() => alert('Đã mở form tạo vận đơn GHN/GHTK!')}
                      className="px-2.5 py-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-medium text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Bắn Đơn Bưu Cục
                    </button>
                  </div>
                  {shipments.map((sh) => (
                    <div key={sh.code} className="p-3 rounded-xl border border-orange-100 bg-orange-50/30 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-orange-700">{sh.code} • {sh.carrier}</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-orange-100 text-orange-800">
                          {sh.status}
                        </span>
                      </div>
                      <div className="font-medium text-zinc-800">{sh.customer} ({sh.phone})</div>
                      <div className="text-zinc-600">Sản phẩm: {sh.item}</div>
                      <div className="flex items-center justify-between text-xs text-zinc-600 pt-1 border-t border-orange-100">
                        <span>Thu hộ COD: <strong className="text-emerald-600">{sh.cod.toLocaleString()} đ</strong></span>
                        <span>Cước vận chuyển: <strong>{sh.fee.toLocaleString()} đ</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 5. Payroll View */}
              {activeSubModal === 'payroll' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-700">Bảng lương tháng hiện tại:</span>
                    <button 
                      onClick={() => alert('Đã xuất file Excel bảng lương!')}
                      className="px-2.5 py-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-medium text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> Xuất Bảng Lương
                    </button>
                  </div>
                  {staffTimesheet.map((st, idx) => (
                    <div key={idx} className="p-3 rounded-xl border border-orange-100 bg-orange-50/30 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-orange-700">{st.name}</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                          {st.role}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs text-zinc-700">
                        <div>Ngày công: <strong>{st.workDays} ngày</strong></div>
                        <div>Cây máy bán ra: <strong className="text-orange-600">{st.salesCount} máy</strong></div>
                        <div>Hoa hồng bán: <strong className="text-emerald-600">{st.commission.toLocaleString()} đ</strong></div>
                        <div>Tổng thực nhận: <strong className="text-emerald-700 font-semibold">{st.salary.toLocaleString()} đ</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 6. VietQR Speaker Config */}
              {activeSubModal === 'vietqr_speaker' && (
                <div className="space-y-3 text-center p-2">
                  <Radio className="w-10 h-10 text-orange-500 mx-auto animate-pulse" />
                  <h4 className="font-semibold text-base text-zinc-800">Loa Báo Tiền VietQR Ting Ting</h4>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    Tự động phát giọng đọc âm lượng lớn mỗi khi khách hàng quét mã QR chuyển khoản thành công tại quầy thu ngân.
                  </p>
                  <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-left space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-600">Trạng thái loa:</span>
                      <strong className="text-emerald-600">● Đang kết nối WiFi Quầy Thu Ngân</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600">Mẫu câu phát:</span>
                      <strong className="text-zinc-800">"Ting Ting! Đã nhận..."</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-600">Độ trễ phản hồi:</span>
                      <strong className="text-emerald-600">&lt; 0.8 giây</strong>
                    </div>
                  </div>
                  <button 
                    onClick={() => alert('Đã phát âm thanh thử nghiệm ra loa!')}
                    className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl shadow-md cursor-pointer"
                  >
                    Phát Thử Giọng Đọc Mẫu Ra Loa
                  </button>
                </div>
              )}

              {/* 7. Hardware Bundles */}
              {activeSubModal === 'hardware' && (
                <div className="space-y-2.5">
                  <div className="p-3 rounded-xl border border-orange-100 bg-orange-50/40 space-y-1">
                    <span className="font-semibold text-orange-700">1. Máy in hóa đơn nhiệt K80 LAN / USB</span>
                    <p className="text-xs text-zinc-600">In bill tức thì sau khi bấm hoàn tất đơn hàng, tự động cắt giấy, không dùng mực.</p>
                    <div className="text-xs text-emerald-600 font-medium">Trạng thái: Sẵn sàng kết nối</div>
                  </div>
                  <div className="p-3 rounded-xl border border-orange-100 bg-orange-50/40 space-y-1">
                    <span className="font-semibold text-orange-700">2. Máy quét Barcode 2D Datamatrix</span>
                    <p className="text-xs text-zinc-600">Quét cực nhạy mã IMEI vỏ hộp iPhone, tem bảo hành, căn cước công dân của khách.</p>
                    <div className="text-xs text-emerald-600 font-medium">Trạng thái: Hoạt động tốt</div>
                  </div>
                  <div className="p-3 rounded-xl border border-orange-100 bg-orange-50/40 space-y-1">
                    <span className="font-semibold text-orange-700">3. Két thu ngân tự động bung RJ11</span>
                    <p className="text-xs text-zinc-600">Tự động mở ngăn kéo khi ấn in hóa đơn POS hoặc bấm phím tắt F12.</p>
                    <div className="text-xs text-emerald-600 font-medium">Trạng thái: Đã kết nối máy in K80</div>
                  </div>
                </div>
              )}

              {/* Generic fallback for other actions */}
              {['preorders', 'repairs', 'audits', 'shipments', 'payroll', 'vietqr_speaker', 'hardware'].indexOf(activeSubModal) === -1 && (
                <div className="p-4 text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-orange-500 mx-auto" />
                  <h4 className="font-semibold text-zinc-800">Mô-đun đang hoạt động</h4>
                  <p className="text-xs text-zinc-500">
                    Phân hệ đã được tích hợp đầy đủ trong hệ sinh thái Phone House Suite. Bạn có thể sử dụng trực tiếp các thao tác dữ liệu.
                  </p>
                  <button
                    onClick={() => setActiveSubModal(null)}
                    className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl shadow-md cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              )}

            </div>

            {/* Submodal Footer */}
            <div className="p-3 bg-zinc-50 border-t border-zinc-200 flex items-center justify-end shrink-0">
              <button
                onClick={() => setActiveSubModal(null)}
                className="px-4 py-1.5 rounded-xl border border-zinc-300 font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer text-xs"
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
