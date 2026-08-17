import React, { useState, useEffect, useMemo } from 'react';
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
  FileText,
  ArrowLeftRight,
  Settings,
  Store,
  Clock,
  TrendingUp,
  Award,
  UserCheck,
  MapPin,
  CheckCircle2,
  DollarSign,
  Scale,
  CalendarClock,
  RotateCcw,
  SlidersHorizontal,
  Bot,
  PackageCheck,
  ScanFace
} from 'lucide-react';
import { auth, signInWithGoogle, logOut } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { UserAccount, StoreBranch } from '../types';
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
  transferCount?: number;
  userCount?: number;
  isFirebaseSyncing?: boolean;
  selectedBranchId: string;
  onBranchChange: (branchId: string) => void;
  branches: StoreBranch[];
}

export interface MenuItemDef {
  id: string;
  label: string;
  desc: string;
  icon: any;
  groupId: string;
  groupName: string;
  badge?: string;
  color: string;
  highlight?: boolean;
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
  transferCount = 3,
  userCount = 5,
  isFirebaseSyncing = true,
  selectedBranchId,
  onBranchChange,
  branches
}) => {
  const [user, setUser] = useState<User | null>(null);

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
    { id: 'pos', label: 'Bán Hàng POS', icon: ShoppingCart },
    { id: 'checkin-portal', label: '⚡ Điểm Danh Face ID', icon: ScanFace, badge: 'HOT' },
    { id: 'hr-attendance', label: 'Chấm Công & Lương', icon: Clock },
    { id: 'inventory', label: 'Kho IMEI', icon: Smartphone, badge: stockCount },
    { id: 'purchase-orders', label: 'Nhập Hàng (NCC)', icon: PackageCheck },
    { id: 'transfers', label: 'Chuyển Kho', icon: ArrowLeftRight, badge: transferCount },
    { id: 'master-catalog', label: 'Danh Mục Hàng Hóa', icon: Database },
    { id: 'products', label: 'Linh Phụ Kiện', icon: Package },
    { id: 'invoices', label: 'Hóa Đơn', icon: FileText },
    { id: 'cashbook', label: 'Sổ Quỹ Thu Chi', icon: Wallet },
    { id: 'partners', label: 'Đối Tác & NCC', icon: Building2 },
    { id: 'crm', label: 'Khách Hàng (CRM)', icon: Users, badge: leadCount },
    { id: 'tradein', label: 'Thu Cũ Đổi Mới', icon: RefreshCw },
    { id: 'warranty', label: 'Bảo Hành & Sửa', icon: Wrench, badge: warrantyCount > 0 ? warrantyCount : undefined },
    { id: 'employee-dashboard', label: 'Dashboard Nhân Viên', icon: TrendingUp },
    { id: 'users', label: 'Phân Quyền User', icon: ShieldCheck, badge: userCount },
    { id: 'more', label: 'Nhiều Hơn (More)', icon: Menu },
    { id: 'erpnext-plan', label: 'Kiến Trúc ERPNext', icon: BookOpen },
  ];

  return (
    <>
      {/* Top Desktop & Mobile Header Bar */}
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
              {/* Branch Selector (Desktop) */}
              {currentUser && (
                <div className="hidden lg:flex items-center space-x-1 bg-zinc-50 border border-zinc-200 rounded-xl px-2 py-1 mr-2">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                  <select
                    value={selectedBranchId}
                    onChange={(e) => onBranchChange(e.target.value)}
                    disabled={currentUser.role !== 'ADMIN' && currentUser.role !== 'MANAGER'}
                    className="bg-transparent text-xs font-semibold text-zinc-700 outline-none border-none py-1 w-32 truncate appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-80"
                    title={currentUser.role !== 'ADMIN' ? 'Chỉ Admin mới có thể đổi chi nhánh' : 'Chọn chi nhánh'}
                  >
                    <option value="ALL">Toàn Hệ Thống</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

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

              {/* Fast Check-in Quick Button */}
              <button
                onClick={() => setActiveTab('checkin-portal')}
                className={`px-2.5 sm:px-3 py-2 rounded-xl text-xs font-black flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs ${
                  activeTab === 'checkin-portal'
                    ? 'bg-[#FF4B16] text-white ring-2 ring-orange-500/30 shadow-md shadow-orange-500/25'
                    : 'bg-orange-50 hover:bg-orange-100 text-[#FF4B16] border border-orange-200'
                }`}
                title="Mở Cổng Điểm Danh Nhanh (Face ID Sinh Trắc Học)"
              >
                <ScanFace className="w-4 h-4" />
                <span className="hidden sm:inline">Điểm Danh</span>
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

              {/* Menu 'Nhiều Hơn' 3 Gạch Desktop Quick Navigation */}
              <button
                onClick={() => setActiveTab('more')}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  activeTab === 'more'
                    ? 'text-orange-600 bg-orange-50 border-orange-300'
                    : 'text-zinc-600 hover:text-orange-600 hover:bg-orange-50 border-zinc-200'
                }`}
                title="Xem Menu Phân Hệ Đầy Đủ"
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

      {/* Mobile Bottom Quick Navigation Bar (5 nút chuẩn: Tổng quan | Hàng hoá | Hoá đơn | CRM | Xem thêm) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 border-t border-orange-200/80 px-2 py-1.5 z-40 flex items-center justify-around shadow-xl backdrop-blur-md">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center p-1 rounded-xl text-[10px] font-bold transition-all ${
            activeTab === 'dashboard' 
              ? 'text-[#F94A1F] font-extrabold scale-105' 
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Layers className="w-4 h-4 mb-0.5" />
          <span>Tổng quan</span>
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex flex-col items-center p-1 rounded-xl text-[10px] font-bold relative transition-all ${
            activeTab === 'inventory' 
              ? 'text-[#F94A1F] font-extrabold scale-105' 
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
          title="Kho Máy IMEI"
        >
          <div className="relative">
            <Smartphone className="w-4 h-4 mb-0.5" />
            {stockCount > 0 && (
              <span className="absolute -top-1 -right-1.5 w-2 h-2 bg-[#F94A1F] rounded-full ring-2 ring-white"></span>
            )}
          </div>
          <span>Kho IMEI</span>
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex flex-col items-center p-1 rounded-xl text-[10px] font-bold transition-all ${
            activeTab === 'invoices' 
              ? 'text-[#F94A1F] font-extrabold scale-105' 
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <FileText className="w-4 h-4 mb-0.5" />
          <span>Hoá đơn</span>
        </button>

        <button
          onClick={() => setActiveTab('crm')}
          className={`flex flex-col items-center p-1 rounded-xl text-[10px] font-bold relative transition-all ${
            activeTab === 'crm' || activeTab === 'customers'
              ? 'text-[#F94A1F] font-extrabold scale-105' 
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
          title="Khách Hàng & CRM"
        >
          <div className="relative">
            <Users className="w-4 h-4 mb-0.5" />
            {leadCount > 0 && (
              <span className="absolute -top-1 -right-1.5 w-2 h-2 bg-[#F94A1F] rounded-full ring-2 ring-white"></span>
            )}
          </div>
          <span>CRM</span>
        </button>

        {/* Nút Xem Thêm / Menu Hệ Thống */}
        <button
          onClick={() => setActiveTab('more')}
          className={`flex flex-col items-center p-1 rounded-xl text-[10px] font-bold transition-all ${
            activeTab === 'more' 
              ? 'text-[#F94A1F] font-extrabold scale-105' 
              : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          <Menu className="w-4 h-4 mb-0.5" />
          <span>Xem thêm</span>
        </button>
      </div>
    </>
  );
};
