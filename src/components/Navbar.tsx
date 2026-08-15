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
  Building2,
  Crown,
  KeyRound,
  Wallet,
  Package,
  FileText
} from 'lucide-react';
import { auth, signInWithGoogle, logOut } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { UserAccount } from '../types';
import { PhoneHouseLogo } from './PhoneHouseLogo';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenQuickSearch: () => void;
  onOpenNewDeviceModal: () => void;
  onOpenNewLeadModal: () => void;
  onOpenPOSModal: () => void;
  onOpenAICopilot: () => void;
  onOpenLoginModal: () => void;
  currentUser: UserAccount | null;
  onLogout: () => void;
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
  onOpenLoginModal,
  currentUser,
  onLogout,
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
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  const handleAuthClick = () => {
    onOpenLoginModal();
  };

  const navItems = [
    { id: 'dashboard', label: 'Tổng Quan', icon: Layers },
    { id: 'inventory', label: 'Kho IMEI', icon: Smartphone, badge: stockCount },
    { id: 'products', label: 'Linh Phụ Kiện', icon: Package },
    { id: 'pos', label: 'Bán Hàng POS', icon: ShoppingCart },
    { id: 'invoices', label: 'Hóa Đơn', icon: FileText },
    { id: 'cashbook', label: 'Sổ Quỹ Thu Chi', icon: Wallet },
    { id: 'partners', label: 'Đối Tác & NCC', icon: Building2 },
    { id: 'crm', label: 'Khách Hàng (CRM)', icon: Users, badge: leadCount },
    { id: 'tradein', label: 'Thu Cũ Đổi Mới', icon: RefreshCw },
    { id: 'warranty', label: 'Bảo Hành & Sửa', icon: Wrench, badge: warrantyCount > 0 ? warrantyCount : undefined },
    { id: 'more', label: 'Nhiều Hơn (More)', icon: Menu },
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
      id: 'invoices',
      label: 'Quản Lý Hóa Đơn & Doanh Thu',
      desc: 'Chi tiết từng đơn hàng, in hóa đơn K80, mã VietQR & quản lý công nợ',
      icon: FileText,
      color: 'text-orange-600 bg-orange-50 border-orange-200'
    },
    {
      id: 'cashbook',
      label: 'Sổ Quỹ & Dòng Tiền Thu Chi',
      desc: 'Quản lý két tiền mặt, tài khoản VietQR, cổng MPOS, dòng tiền thuần & hạch toán',
      icon: Wallet,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200'
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
      id: 'products',
      label: 'Kho Linh Kiện & Phụ Kiện',
      desc: 'Quản lý ốp lưng, sạc dự phòng, màn hình, pin thay thế, dịch vụ',
      icon: Package,
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
      {activeTab !== 'cashbook' && (
      <header className="bg-white/95 border-b border-orange-100 text-zinc-900 sticky top-0 z-30 shadow-2xs backdrop-blur-md">
        <div className="w-full max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Phone House Brand Logo */}
            <div 
              className="flex items-center space-x-2 sm:space-x-3 cursor-pointer group" 
              onClick={() => setActiveTab('dashboard')}
            >
              <PhoneHouseLogo size="md" showText={true} />
            </div>

            {/* Quick Search Box (Desktop) */}
            <div className="hidden md:flex items-center flex-1 max-w-md mx-6">
              <button
                onClick={onOpenQuickSearch}
                className="w-full bg-zinc-50 hover:bg-white text-zinc-500 hover:text-zinc-800 border border-zinc-200 hover:border-orange-400 rounded-xl px-3.5 py-2 text-xs flex items-center justify-between transition-all shadow-inner group cursor-pointer"
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
                className="md:hidden p-2 bg-orange-50 text-orange-600 border border-orange-200 rounded-xl hover:bg-orange-100 transition-all cursor-pointer"
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

              {/* Phone House User Account & Login Trigger */}
              <button
                onClick={handleAuthClick}
                className="bg-white hover:bg-orange-50/70 text-zinc-800 border border-orange-200/90 hover:border-orange-400 text-xs font-semibold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl flex items-center space-x-2 transition-all shadow-2xs cursor-pointer"
                title="Bấm để đăng nhập hoặc đổi tài khoản quản trị/nhân viên"
              >
                {currentUser ? (
                  <>
                    <div className="relative">
                      <img 
                        src={currentUser.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"} 
                        alt="Avatar" 
                        referrerPolicy="no-referrer"
                        className="w-5 h-5 rounded-full object-cover border border-orange-300"
                      />
                      {currentUser.role === 'ADMIN' && (
                        <Crown className="w-2.5 h-2.5 text-amber-500 absolute -top-1 -right-1" />
                      )}
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-black text-zinc-900 leading-tight max-w-[100px] truncate">
                        {currentUser.displayName.split(' ')[0]}
                      </span>
                      <span className="text-[9px] font-bold text-orange-600 leading-none">
                        {currentUser.role}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5 text-orange-600" />
                    <span className="text-xs font-bold text-orange-600">Đăng Nhập</span>
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
      )}

      {/* Mobile Bottom Quick Navigation Bar (Matching exactly: Tổng quan | Hàng hoá | Bán hàng | Hoá đơn | Nhiều hơn) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 border-t border-orange-100 px-2 py-1.5 z-30 flex items-center justify-around shadow-lg backdrop-blur-md">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center p-1 rounded-xl text-[10px] font-bold transition-colors ${
            activeTab === 'dashboard' ? 'text-orange-600' : 'text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <Layers className="w-4 h-4 mb-0.5" />
          <span>Tổng quan</span>
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex flex-col items-center p-1 rounded-xl text-[10px] font-bold relative transition-colors ${
            activeTab === 'inventory' ? 'text-orange-600' : 'text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <Package className="w-4 h-4 mb-0.5" />
          <span>Hàng hoá</span>
          {stockCount > 0 && (
            <span className="absolute top-0 right-0 w-2 h-2 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full"></span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('pos');
            onOpenPOSModal();
          }}
          className={`flex flex-col items-center p-1 rounded-xl text-[10px] font-bold transition-colors ${
            activeTab === 'pos' ? 'text-orange-600' : 'text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <ShoppingCart className="w-4 h-4 mb-0.5" />
          <span>Bán hàng</span>
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex flex-col items-center p-1 rounded-xl text-[10px] font-bold transition-colors ${
            activeTab === 'invoices' ? 'text-orange-600 font-extrabold' : 'text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <FileText className="w-4 h-4 mb-0.5" />
          <span>Hoá đơn</span>
        </button>

        <button
          onClick={() => setActiveTab('more')}
          className={`flex flex-col items-center p-1 rounded-xl text-[10px] font-bold transition-colors ${
            activeTab === 'more' ? 'text-orange-600 font-extrabold' : 'text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <Menu className="w-4 h-4 mb-0.5" />
          <span>Menu</span>
        </button>
      </div>

      {/* Full "Menu" Drawer Modal */}
      {isMoreMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-orange-100 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-3">
                <PhoneHouseLogo size="sm" showText={false} />
                <div>
                  <h3 className="font-bold text-zinc-900 text-base">
                    PHONE HOUSE • Menu Hệ Thống
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Phím tắt tiện ích & quản trị nhanh
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

            {/* Quick Tools & Admin Shortcuts */}
            <div className="p-3.5 bg-orange-50/50 rounded-2xl border border-orange-200/60 space-y-2 text-xs">
              <span className="font-bold text-orange-950 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                Công Cụ Trợ Lực Nhanh
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    onOpenAICopilot();
                  }}
                  className="p-2.5 bg-white hover:bg-orange-100/50 border border-orange-200/80 rounded-xl font-semibold text-zinc-800 text-left flex items-center justify-between text-xs cursor-pointer shadow-2xs"
                >
                  <span className="flex items-center gap-1.5">✨ AI Copilot</span>
                  <ChevronRight className="w-3.5 h-3.5 text-orange-400" />
                </button>

                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    onOpenPOSModal();
                  }}
                  className="p-2.5 bg-white hover:bg-orange-100/50 border border-orange-200/80 rounded-xl font-semibold text-zinc-800 text-left flex items-center justify-between text-xs cursor-pointer shadow-2xs"
                >
                  <span className="flex items-center gap-1.5">🛒 Bán POS</span>
                  <ChevronRight className="w-3.5 h-3.5 text-orange-400" />
                </button>

                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    onOpenNewDeviceModal();
                  }}
                  className="p-2.5 bg-white hover:bg-orange-100/50 border border-orange-200/80 rounded-xl font-semibold text-zinc-800 text-left flex items-center justify-between text-xs cursor-pointer shadow-2xs"
                >
                  <span className="flex items-center gap-1.5">➕ Nhập máy</span>
                  <ChevronRight className="w-3.5 h-3.5 text-orange-400" />
                </button>
              </div>
            </div>

            {/* Login / Switch Account Card inside Drawer */}
            <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 text-white rounded-2xl p-4 flex items-center justify-between shadow-md">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-300">Tài khoản hiện tại:</div>
                  <div className="text-sm font-bold text-amber-300">
                    {currentUser ? `${currentUser.displayName} (${currentUser.role})` : 'Chưa đăng nhập'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  onOpenLoginModal();
                }}
                className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-xs cursor-pointer"
              >
                Đổi Tài Khoản
              </button>
            </div>

            {/* Footer Status in Drawer */}
            <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2 border-t border-zinc-100">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Firebase Cloud Firestore Online</span>
              </span>
              <span className="font-mono">PHONE HOUSE v2.0</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
