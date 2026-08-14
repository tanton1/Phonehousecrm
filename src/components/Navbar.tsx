import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Search, 
  Layers, 
  Users, 
  RefreshCw, 
  Wrench, 
  ShoppingCart, 
  BookOpen, 
  Sparkles,
  Zap,
  Plus,
  Cloud,
  Database,
  LogIn,
  LogOut,
  User as UserIcon,
  Menu,
  X,
  ShieldCheck,
  ChevronRight,
  ShieldAlert,
  Building2
} from 'lucide-react';
import { auth, signInWithGoogle, logOut } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenQuickSearch: () => void;
  onOpenNewDeviceModal: () => void;
  onOpenNewLeadModal: () => void;
  onOpenPOSModal: () => void;
  onOpenAICopilot: () => void;
  stockCount: number;
  leadCount: number;
  warrantyCount: number;
  userCount?: number;
  isFirebaseSyncing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenQuickSearch,
  onOpenNewDeviceModal,
  onOpenNewLeadModal,
  onOpenPOSModal,
  onOpenAICopilot,
  stockCount,
  leadCount,
  warrantyCount,
  userCount = 5,
  isFirebaseSyncing = true
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleAuthAction = async () => {
    if (user) {
      if (confirm(`Đăng xuất khỏi tài khoản ${user.displayName || user.email}?`)) {
        await logOut();
      }
    } else {
      try {
        setAuthLoading(true);
        await signInWithGoogle();
      } catch (err) {
        console.error('Sign-in failed:', err);
      } finally {
        setAuthLoading(false);
      }
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Tổng Quan', icon: Layers },
    { id: 'inventory', label: 'Kho IMEI', icon: Smartphone, badge: stockCount },
    { id: 'pos', label: 'Bán Hàng POS', icon: ShoppingCart },
    { id: 'partners', label: 'Đối Tác & NCC', icon: Building2 },
    { id: 'crm', label: 'Khách Hàng (CRM)', icon: Users, badge: leadCount },
    { id: 'tradein', label: 'Thu Cũ Đổi Mới', icon: RefreshCw },
    { id: 'warranty', label: 'Bảo Hành & Sửa', icon: Wrench, badge: warrantyCount > 0 ? warrantyCount : undefined },
    { id: 'users', label: 'Phân Quyền User', icon: ShieldCheck, badge: userCount },
    { id: 'erpnext-plan', label: 'Kiến Trúc ERPNext', icon: BookOpen },
  ];

  const allMenuItems = [
    {
      id: 'dashboard',
      label: 'Tổng Quan Hệ Thống',
      desc: 'Doanh thu, tồn kho, lợi nhuận gộp & tiến độ bán lẻ thời gian thực',
      icon: Layers,
      color: 'text-amber-600 bg-amber-50 border-amber-200'
    },
    {
      id: 'inventory',
      label: 'Kho Máy 15 Số IMEI',
      desc: 'Quản lý từng cây iPhone, pin, màn hình, tình trạng & giá vốn',
      icon: Smartphone,
      badge: `${stockCount} máy`,
      color: 'text-orange-600 bg-orange-50 border-orange-200'
    },
    {
      id: 'pos',
      label: 'Điểm Bán Lẻ POS & Hóa Đơn K80',
      desc: 'Lên đơn thanh toán, trừ tồn kho, tính trả góp 0% & in hóa đơn nhiệt',
      icon: ShoppingCart,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200'
    },
    {
      id: 'partners',
      label: 'Đối Tác, Khách Hàng 360° & Nhà Cung Cấp',
      desc: 'Quản lý khách lẻ VIP, khách buôn sỉ, nguồn nhập Like New & đối soát công nợ',
      icon: Building2,
      color: 'text-cyan-600 bg-cyan-50 border-cyan-200'
    },
    {
      id: 'crm',
      label: 'Quản Lý Khách Hàng CRM',
      desc: 'Nuôi dưỡng lead TikTok/Facebook/Zalo, kịch bản tư vấn AI',
      icon: Users,
      badge: `${leadCount} lead`,
      color: 'text-blue-600 bg-blue-50 border-blue-200'
    },
    {
      id: 'tradein',
      label: 'Thu Cũ Đổi Mới (Trade-in AI)',
      desc: 'Kiểm định 12 bước, AI định giá máy cũ và tính tiền bù',
      icon: RefreshCw,
      color: 'text-purple-600 bg-purple-50 border-purple-200'
    },
    {
      id: 'warranty',
      label: 'Phiếu Bảo Hành & Sửa Chữa',
      desc: 'Bảo hành 1 đổi 1, tiếp nhận sửa chữa, AI chẩn đoán lỗi',
      icon: Wrench,
      badge: warrantyCount > 0 ? `${warrantyCount} phiếu` : undefined,
      color: 'text-red-600 bg-red-50 border-red-200'
    },
    {
      id: 'users',
      label: 'Quản Lý Người Dùng & Phân Quyền',
      desc: 'Cấp tài khoản Admin, Cửa hàng trưởng, Nhân viên bán hàng, Kỹ thuật',
      icon: ShieldCheck,
      badge: `${userCount} user`,
      color: 'text-rose-600 bg-rose-50 border-rose-200'
    },
    {
      id: 'erpnext-plan',
      label: 'Kiến Trúc ERPNext & Frappe',
      desc: 'Tài liệu DocTypes, Docker compose & kế thừa doanh nghiệp',
      icon: BookOpen,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-200'
    }
  ];

  return (
    <>
      {/* Top Desktop & Mobile Header Bar */}
      <header className="bg-white/95 border-b border-orange-100 text-zinc-900 sticky top-0 z-30 shadow-sm backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Brand */}
            <div 
              className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer group" 
              onClick={() => setActiveTab('dashboard')}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 via-amber-400 to-orange-100 p-[1.5px] shadow-md shadow-orange-500/20">
                <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-orange-500 group-hover:scale-110 transition-transform" />
                </div>
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-black text-base sm:text-lg tracking-tight text-zinc-900">iStore ERP</span>
                  <span className="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm shadow-orange-500/30">
                    iPhone CRM
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-[10px] sm:text-xs text-zinc-500 font-medium">
                  <span>Frappe & ERPNext v15</span>
                  <span className="text-zinc-300">•</span>
                  <span className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-semibold">Firestore Cloud Sync</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Search Box (Desktop) */}
            <div className="hidden md:flex items-center flex-1 max-w-md mx-6">
              <button
                onClick={onOpenQuickSearch}
                className="w-full bg-zinc-50 hover:bg-white text-zinc-500 hover:text-zinc-800 border border-zinc-200 hover:border-orange-400 rounded-xl px-3.5 py-2 text-xs flex items-center justify-between transition-all shadow-inner group"
              >
                <div className="flex items-center space-x-2.5">
                  <Search className="w-4 h-4 text-zinc-400 group-hover:text-orange-500 transition-colors" />
                  <span className="truncate">Tra cứu IMEI (15 số), Tên khách, SĐT, Mã đơn...</span>
                </div>
                <kbd className="hidden sm:inline-block bg-white text-orange-600 text-[10px] px-2 py-0.5 rounded border border-orange-200 font-mono font-bold shadow-xs">
                  ⌘K
                </kbd>
              </button>
            </div>

            {/* Right Actions */}
            <div className="flex items-center space-x-2">
              {/* Mobile Search Button */}
              <button
                onClick={onOpenQuickSearch}
                className="md:hidden p-2 bg-orange-50 text-orange-600 border border-orange-200 rounded-xl hover:bg-orange-100 transition-all"
                title="Tìm kiếm nhanh"
              >
                <Search className="w-4 h-4" />
              </button>

              {/* AI Assistant Button */}
              <button
                onClick={onOpenAICopilot}
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center space-x-1.5 transition-all shadow-md shadow-orange-500/25 active:scale-95 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
                <span className="hidden sm:inline">AI Copilot</span>
                <span className="sm:hidden">AI</span>
              </button>

              {/* Quick POS Checkout (Desktop) */}
              <button
                onClick={onOpenPOSModal}
                className="hidden sm:flex bg-white hover:bg-orange-50 text-zinc-700 hover:text-orange-600 border border-zinc-200 hover:border-orange-300 text-xs font-bold px-3 py-2 rounded-xl items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-orange-500" />
                <span>Bán POS</span>
              </button>

              {/* Firebase Google Auth Button */}
              <button
                onClick={handleAuthAction}
                disabled={authLoading}
                className="bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 hover:border-orange-300 text-xs font-semibold px-2.5 py-2 rounded-xl flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer"
                title={user ? `Đang đăng nhập: ${user.email}` : 'Đăng nhập Google để đồng bộ'}
              >
                {user ? (
                  <>
                    {user.photoURL ? (
                      <img 
                        src={user.photoURL} 
                        alt="Avatar" 
                        referrerPolicy="no-referrer"
                        className="w-4 h-4 rounded-full border border-orange-300"
                      />
                    ) : (
                      <UserIcon className="w-3.5 h-3.5 text-orange-600" />
                    )}
                    <span className="hidden lg:inline text-xs font-bold text-zinc-800 truncate max-w-[100px]">
                      {user.displayName?.split(' ')[0] || user.email?.split('@')[0]}
                    </span>
                    <LogOut className="w-3 h-3 text-zinc-400 hover:text-red-500 ml-0.5" />
                  </>
                ) : (
                  <>
                    <LogIn className="w-3.5 h-3.5 text-orange-600" />
                    <span className="hidden sm:inline text-xs font-bold">Google Auth</span>
                  </>
                )}
              </button>

              {/* Menu 'Nhiều Hơn' Desktop Quick Toggle */}
              <button
                onClick={() => setIsMoreMenuOpen(true)}
                className="p-2 text-zinc-600 hover:text-orange-600 hover:bg-orange-50 rounded-xl border border-zinc-200 transition-colors cursor-pointer"
                title="Xem tất cả menu chức năng"
              >
                <Menu className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Navigation Sub-Bar */}
        <div className="hidden md:block bg-zinc-50/80 border-t border-zinc-200/80 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex items-center space-x-1 overflow-x-auto scrollbar-none py-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/20'
                      : 'text-zinc-600 hover:text-orange-600 hover:bg-white'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? 'bg-white text-orange-600' : 'bg-zinc-200 text-zinc-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Fixed Navigation Bar (App-like Feel with 3-bar 'Nhiều Hơn' Menu Icon) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-orange-100 px-1 py-1 shadow-2xl flex items-center justify-around">
        {[
          { id: 'dashboard', label: 'Tổng Quan', icon: Layers },
          { id: 'inventory', label: 'Kho Máy', icon: Smartphone, badge: stockCount },
          { id: 'pos', label: 'Bán POS', icon: ShoppingCart },
          { id: 'crm', label: 'CRM', icon: Users, badge: leadCount },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
                isActive ? 'text-orange-600 font-bold' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <div className={`p-1 rounded-lg ${isActive ? 'bg-orange-100 text-orange-600' : ''}`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="absolute top-0.5 right-1.5 w-4 h-4 bg-orange-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* 5th Button: Icon 3 gạch ngang "Nhiều Hơn" */}
        <button
          onClick={() => setIsMoreMenuOpen(true)}
          className={`relative flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
            isMoreMenuOpen ? 'text-orange-600 font-bold' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          <div className={`p-1 rounded-lg ${isMoreMenuOpen ? 'bg-orange-100 text-orange-600' : ''}`}>
            <Menu className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">Nhiều Hơn</span>
        </button>
      </nav>

      {/* FULL-PAGE NAVIGATION DRAWER / MODAL FOR 'NHIỀU HƠN' */}
      {isMoreMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-fade-in p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl border border-orange-100 max-h-[85vh] overflow-y-auto space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
                  <Menu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 text-base">
                    Tổng Thể Menu & Phân Hệ iStore Pro
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Truy cập nhanh tất cả trang quản trị, kho máy & dịch vụ
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMoreMenuOpen(false)}
                className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid of All Menu Items */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {allMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMoreMenuOpen(false);
                    }}
                    className={`flex items-start space-x-3 p-3 rounded-2xl text-left transition-all border cursor-pointer ${
                      isActive 
                        ? 'bg-orange-50/80 border-orange-300 ring-2 ring-orange-200' 
                        : 'bg-white hover:bg-zinc-50 border-zinc-200/80 hover:border-orange-200'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl border shrink-0 ${item.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs sm:text-sm text-zinc-800 truncate">
                          {item.label}
                        </span>
                        {item.badge && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Quick Tools & Admin Shortcuts */}
            <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200/80 space-y-2 text-xs">
              <span className="font-bold text-zinc-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                Công Cụ Trợ Lực Nhanh
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    onOpenAICopilot();
                  }}
                  className="p-2 bg-white hover:bg-orange-50 border border-zinc-200 rounded-xl font-semibold text-zinc-700 text-left flex items-center justify-between text-[11px] cursor-pointer"
                >
                  <span>✨ Trợ lý AI Copilot</span>
                  <ChevronRight className="w-3 h-3 text-zinc-400" />
                </button>

                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    onOpenPOSModal();
                  }}
                  className="p-2 bg-white hover:bg-orange-50 border border-zinc-200 rounded-xl font-semibold text-zinc-700 text-left flex items-center justify-between text-[11px] cursor-pointer"
                >
                  <span>🛒 Bán POS nhanh</span>
                  <ChevronRight className="w-3 h-3 text-zinc-400" />
                </button>

                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    onOpenNewDeviceModal();
                  }}
                  className="p-2 bg-white hover:bg-orange-50 border border-zinc-200 rounded-xl font-semibold text-zinc-700 text-left flex items-center justify-between text-[11px] cursor-pointer"
                >
                  <span>➕ Nhập kho máy mới</span>
                  <ChevronRight className="w-3 h-3 text-zinc-400" />
                </button>
              </div>
            </div>

            {/* Footer Status in Drawer */}
            <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2 border-t border-zinc-100">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Firebase Cloud Firestore Online</span>
              </span>
              <span className="font-mono">v1.2.0-Enterprise</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
