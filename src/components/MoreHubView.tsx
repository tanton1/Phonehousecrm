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
  Package, 
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
  Scale
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
      id: 'inventory',
      label: 'Kho iPhone IMEI 15 Số',
      subtitle: 'Pin %, Lần sạc, LL/A, VN/A',
      icon: Smartphone,
      color: 'text-amber-500',
      badge: `${devices.length} máy`
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
              onClick={() => setIsEditingStoreInfo(true)}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center text-white transition-all shrink-0 cursor-pointer"
              title="Chỉnh sửa thông tin cửa hàng"
            >
              <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          <div 
            onClick={() => setIsEditingStoreInfo(true)}
            className="mt-3 pt-2.5 border-t border-white/20 flex items-center justify-between text-[11px] sm:text-xs font-medium text-white/90 hover:text-white cursor-pointer group"
          >
            <div className="flex items-center space-x-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0"></span>
              <span className="truncate">Hotline: <strong className="text-amber-200">{storeInfo.phone}</strong> • MST: {storeInfo.taxCode}</span>
            </div>
            <span className="flex items-center text-amber-200 shrink-0 group-hover:translate-x-1 transition-transform ml-2">
              Chi tiết <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </span>
          </div>
        </div>

        {/* ================= 1. BÁN HÀNG & THU NGÂN (SALES & POS) ================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs border border-orange-100/80">
          <div className="flex items-center space-x-2 mb-3">
            <ShoppingCart className="w-5 h-5 text-orange-500 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-zinc-900">Bán Hàng & Thu Ngân</h2>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button
              onClick={() => {
                onSelectTab('pos');
                onOpenPOSModal();
              }}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <ShoppingCart className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Bán hàng POS</span>
                <span className="text-[10px] text-zinc-400 truncate block">Tạo đơn quét mã</span>
              </div>
            </button>

            <button
              onClick={() => onSelectTab('invoices')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <FileText className="w-5 h-5 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Hóa đơn & Bill</span>
                <span className="text-[10px] text-zinc-400 truncate block">Chi tiết & In K80</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('preorders')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <CalendarClock className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Đặt hàng trước</span>
                <span className="text-[10px] text-zinc-400 truncate block">Pre-order nhận cọc</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('returns')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <RotateCcw className="w-5 h-5 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Đổi trả hàng</span>
                <span className="text-[10px] text-zinc-400 truncate block">Đổi trả khách</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('services')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group col-span-2 sm:col-span-1"
            >
              <Sparkles className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Mua dịch vụ</span>
                <span className="text-[10px] text-zinc-400 truncate block">AppleCare+ & Bảo hành VIP</span>
              </div>
            </button>
          </div>
        </div>

        {/* ================= 2. KHO HÀNG & KỸ THUẬT (INVENTORY & TECH) ================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs border border-orange-100/80">
          <div className="flex items-center space-x-2 mb-3">
            <Smartphone className="w-5 h-5 text-amber-500 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-zinc-900">Kho Hàng & Kỹ Thuật</h2>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button
              onClick={() => onSelectTab('inventory')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Package className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Kho iPhone</span>
                <span className="text-[10px] text-zinc-400 truncate block">Quản lý IMEI & Pin %</span>
              </div>
            </button>

            <button
              onClick={() => onSelectTab('products')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Box className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Linh Phụ Kiện</span>
                <span className="text-[10px] text-zinc-400 truncate block">Quản lý SKU linh phụ kiện</span>
              </div>
            </button>

            <button
              onClick={() => {
                onSelectTab('inventory');
                onOpenNewDeviceModal();
              }}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Download className="w-5 h-5 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Nhập máy mới</span>
                <span className="text-[10px] text-zinc-400 truncate block">Thêm IMEI vào kho</span>
              </div>
            </button>

            <button
              onClick={() => onSelectTab('warranty')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <ShieldCheck className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Phiếu bảo hành</span>
                <span className="text-[10px] text-zinc-400 truncate block">Tra cứu theo IMEI</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('repairs')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Wrench className="w-5 h-5 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Sửa chữa máy</span>
                <span className="text-[10px] text-zinc-400 truncate block">Tiếp nhận & Ép kính</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('audits')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <CheckSquare className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Kiểm kê kho</span>
                <span className="text-[10px] text-zinc-400 truncate block">Cân bằng tồn thực tế</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('stock_transfers')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <ArrowLeftRight className="w-5 h-5 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Chuyển kho</span>
                <span className="text-[10px] text-zinc-400 truncate block">Luân chuyển chi nhánh</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('supplier_returns')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Upload className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Trả hàng nhập</span>
                <span className="text-[10px] text-zinc-400 truncate block">Hoàn trả nhà cung cấp</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('write_offs')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Trash2 className="w-5 h-5 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Xuất hủy máy</span>
                <span className="text-[10px] text-zinc-400 truncate block">Máy hỏng & LK lỗi</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('internal_use')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group col-span-2"
            >
              <Share2 className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Xuất nội bộ & Demo</span>
                <span className="text-[10px] text-zinc-400 truncate block">Máy trưng bày trải nghiệm tại showroom</span>
              </div>
            </button>
          </div>
        </div>

        {/* ================= TRỢ LÝ AI COPILOT CARD (MOVED BEFORE CRM) ================= */}
        <div 
          onClick={onOpenAICopilot}
          className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 text-white shadow-sm shadow-orange-500/10 flex items-center justify-between cursor-pointer hover:shadow-md transition-all border border-amber-300/30"
        >
          <div className="flex items-center space-x-3 min-w-0">
            <Bot className="w-6 h-6 text-white shrink-0 animate-bounce" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs sm:text-sm font-semibold truncate">Trợ Lý AI Phone House Copilot</h3>
                <span className="bg-white text-orange-700 text-[9px] font-semibold px-1.5 py-0.2 rounded-md shadow-2xs shrink-0">
                  Miễn Phí
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-orange-100 truncate mt-0.5">
                Phân tích kho IMEI, gợi ý giá thu cũ đổi mới, tối ưu hóa lợi nhuận
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-amber-200 shrink-0 ml-2" />
        </div>

        {/* ================= 3. KHÁCH HÀNG & CRM (CRM & MARKETING) ================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs border border-orange-100/80">
          <div className="flex items-center space-x-2 mb-3">
            <Users className="w-5 h-5 text-orange-500 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-zinc-900">Khách Hàng & CRM</h2>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button
              onClick={() => onSelectTab('crm')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Users className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Khách hàng CRM</span>
                <span className="text-[10px] text-zinc-400 truncate block">Phễu Leads & Tương tác</span>
              </div>
            </button>

            <button
              onClick={() => onSelectTab('tradein')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <RefreshCw className="w-5 h-5 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Thu cũ đổi mới</span>
                <span className="text-[10px] text-zinc-400 truncate block">Thẩm định AI & Trợ giá</span>
              </div>
            </button>

            <button
              onClick={() => onSelectTab('crm')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <MessageSquare className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Hội thoại CSKH</span>
                <span className="text-[10px] text-zinc-400 truncate block">Tích hợp FB & Zalo</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('vip_members')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Award className="w-5 h-5 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Khách VIP & Điểm</span>
                <span className="text-[10px] text-zinc-400 truncate block">Tích lũy K-Point</span>
              </div>
            </button>
          </div>
        </div>

        {/* ================= 4. KẾ TOÁN & DÒNG TIỀN (FINANCE & CASHFLOW) ================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs border border-orange-100/80">
          <div className="flex items-center space-x-2 mb-3">
            <Wallet className="w-5 h-5 text-amber-500 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-zinc-900">Kế Toán & Dòng Tiền</h2>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button
              onClick={() => onSelectTab('cashbook')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Wallet className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Sổ quỹ thu chi</span>
                <span className="text-[10px] text-zinc-400 truncate block">Tiền mặt & Ngân hàng</span>
              </div>
            </button>

            <button
              onClick={() => onSelectTab('partners')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Building2 className="w-5 h-5 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Nhà cung cấp</span>
                <span className="text-[10px] text-zinc-400 truncate block">Nguồn máy sỉ & Công nợ</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('shipments')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Truck className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Vận đơn bưu cục</span>
                <span className="text-[10px] text-zinc-400 truncate block">GHN, GHTK, Viettel</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('carriers')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <UserCheck className="w-5 h-5 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Đối soát COD</span>
                <span className="text-[10px] text-zinc-400 truncate block">Tiền thu hộ bưu cục</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('end_of_day')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Calendar className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Chốt ca cuối ngày</span>
                <span className="text-[10px] text-zinc-400 truncate block">Kiểm két & Bàn giao</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('tax_accounting')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <FileSpreadsheet className="w-5 h-5 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Thuế & Hóa đơn VAT</span>
                <span className="text-[10px] text-zinc-400 truncate block">Kê khai thuế khoán</span>
              </div>
            </button>
          </div>
        </div>

        {/* ================= 5. NHÂN SỰ & TIỀN LƯƠNG (STAFF & PAYROLL) ================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs border border-orange-100/80">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-orange-500 shrink-0" />
              <h2 className="text-sm sm:text-base font-semibold text-zinc-900">Nhân Sự & Tiền Lương</h2>
            </div>
            <span className="text-[11px] text-orange-600 font-medium">3 nhân sự hoạt động</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <button
              onClick={() => onSelectTab('users')}
              className="flex items-center space-x-2.5 p-2 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Users className="w-4 h-4 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <span className="text-xs font-medium text-zinc-800 group-hover:text-orange-600 truncate">Nhân viên</span>
            </button>

            <button
              onClick={() => setActiveSubModal('schedule')}
              className="flex items-center space-x-2.5 p-2 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Clock className="w-4 h-4 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <span className="text-xs font-medium text-zinc-800 group-hover:text-orange-600 truncate">Lịch làm việc</span>
            </button>

            <button
              onClick={() => setActiveSubModal('attendance')}
              className="flex items-center space-x-2.5 p-2 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <CheckSquare className="w-4 h-4 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <span className="text-xs font-medium text-zinc-800 group-hover:text-orange-600 truncate">Chấm công</span>
            </button>

            <button
              onClick={() => setActiveSubModal('payroll')}
              className="flex items-center space-x-2.5 p-2 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <DollarSign className="w-4 h-4 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <span className="text-xs font-medium text-zinc-800 group-hover:text-orange-600 truncate">Bảng lương</span>
            </button>

            <button
              onClick={() => setActiveSubModal('commissions')}
              className="flex items-center space-x-2.5 p-2 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Percent className="w-4 h-4 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <span className="text-xs font-medium text-zinc-800 group-hover:text-orange-600 truncate">Hoa hồng</span>
            </button>

            <button
              onClick={() => onSelectTab('users')}
              className="flex items-center space-x-2.5 p-2 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Settings className="w-4 h-4 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <span className="text-xs font-medium text-zinc-800 group-hover:text-orange-600 truncate">Phân quyền</span>
            </button>
          </div>
        </div>

        {/* ================= 6. BÁO CÁO, TÀI CHÍNH & AI ================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs border border-orange-100/80">
          <div className="flex items-center space-x-2 mb-3">
            <TrendingUp className="w-5 h-5 text-orange-500 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-zinc-900">Báo Cáo & Dịch Vụ Mở Rộng</h2>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button
              onClick={() => onSelectTab('dashboard')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <TrendingUp className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Biểu đồ doanh thu</span>
                <span className="text-[10px] text-zinc-400 truncate block">Phân tích lợi nhuận</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('vietqr_speaker')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <QrCode className="w-5 h-5 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Loa VietQR Ting Ting</span>
                <span className="text-[10px] text-zinc-400 truncate block">Báo tiền về quầy</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('business_loan')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <CreditCard className="w-5 h-5 text-orange-500 group-hover:text-orange-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Vay vốn nhập hàng</span>
                <span className="text-[10px] text-zinc-400 truncate block">Hạn mức ngân hàng</span>
              </div>
            </button>

            <button
              onClick={() => setActiveSubModal('hardware')}
              className="flex items-center space-x-3 p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <Printer className="w-5 h-5 text-amber-500 group-hover:text-amber-600 group-hover:scale-110 transition-all shrink-0" />
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-medium text-zinc-800 block group-hover:text-orange-600 truncate">Thiết bị phần cứng</span>
                <span className="text-[10px] text-zinc-400 truncate block">Máy in K80 & Barcode</span>
              </div>
            </button>
          </div>
        </div>

        {/* ================= 7. HỆ THỐNG & CÀI ĐẶT ================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-2xs border border-orange-100/80">
          <div className="space-y-1">
            <button
              onClick={() => setIsEditingStoreInfo(true)}
              className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <Settings className="w-5 h-5 text-zinc-500 group-hover:text-orange-600 shrink-0 transition-colors" />
                <span className="text-xs sm:text-sm font-medium text-zinc-800 group-hover:text-orange-600 truncate">Thiết lập thông tin cửa hàng & In bill</span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" />
            </button>

            <button
              onClick={() => onSelectTab('erpnext-plan')}
              className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <BookOpen className="w-5 h-5 text-zinc-500 group-hover:text-orange-600 shrink-0 transition-colors" />
                <span className="text-xs sm:text-sm font-medium text-zinc-800 group-hover:text-orange-600 truncate">Kiến trúc Chuỗi Bán Lẻ ERPNext Chuẩn Quốc Tế</span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" />
            </button>

            <button
              onClick={() => window.open('tel:19006522')}
              className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <PhoneCall className="w-5 h-5 text-zinc-500 group-hover:text-orange-600 shrink-0 transition-colors" />
                <span className="text-xs sm:text-sm font-medium text-zinc-800 group-hover:text-orange-600 truncate">Tổng đài hỗ trợ kỹ thuật: <strong>1900 6522</strong></span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" />
            </button>

            <button
              onClick={() => setActiveSubModal('language')}
              className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-orange-50/70 border border-transparent hover:border-orange-100 transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <Languages className="w-5 h-5 text-zinc-500 group-hover:text-orange-600 shrink-0 transition-colors" />
                <span className="text-xs sm:text-sm font-medium text-zinc-800 group-hover:text-orange-600 truncate">Ngôn ngữ: Tiếng Việt (VN)</span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" />
            </button>

            <button
              onClick={onLogout}
              className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-red-50 text-red-600 transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <LogOut className="w-5 h-5 text-red-500 shrink-0 transition-colors" />
                <span className="text-xs sm:text-sm font-semibold truncate">Đăng xuất ({currentUser?.fullName || 'Tài khoản'})</span>
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
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
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
