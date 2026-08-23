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
  ScanFace,
  ClipboardCheck,
  MessageSquare
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

  const navClusters = [
    {
      id: 'dashboard',
      label: 'Tổng Quan',
      icon: Layers,
      defaultTab: 'dashboard',
      matchIds: ['dashboard']
    },
    {
      id: 'sales_group',
      label: 'Bán Hàng',
      icon: ShoppingCart,
      defaultTab: 'pos',
      matchIds: ['pos', 'invoices', 'tradein', 'crm', 'omnichannel-chat'],
      badge: (leadCount > 0) ? leadCount : undefined,
      subItems: [
        { id: 'pos', label: 'Bán Hàng POS', icon: ShoppingCart },
        { id: 'invoices', label: 'Hóa Đơn Bán Lẻ', icon: FileText },
        { id: 'tradein', label: 'Thu Cũ Đổi Mới', icon: RefreshCw },
        { id: 'crm', label: 'Khách Hàng (CRM)', icon: Users, badge: leadCount },
        { id: 'omnichannel-chat', label: 'Chat Đa Kênh', icon: MessageSquare, badge: 'SYNC' }
      ]
    },
    {
      id: 'inventory_group',
      label: 'Hàng Hóa',
      icon: Smartphone,
      defaultTab: 'inventory',
      matchIds: ['inventory', 'products', 'purchase-orders', 'transfers', 'master-catalog'],
      badge: (stockCount > 0) ? stockCount : undefined,
      subItems: [
        { id: 'inventory', label: 'Kho IMEI', icon: Smartphone, badge: stockCount },
        { id: 'products', label: 'Linh Phụ Kiện', icon: Package },
        { id: 'purchase-orders', label: 'Nhập Hàng (NCC)', icon: PackageCheck },
        { id: 'transfers', label: 'Chuyển Kho', icon: ArrowLeftRight, badge: transferCount },
        { id: 'master-catalog', label: 'Danh Mục Hàng Hóa', icon: Database }
      ]
    },
    {
      id: 'technical_group',
      label: 'Kỹ Thuật',
      icon: Wrench,
      defaultTab: 'warranty',
      matchIds: ['warranty', 'tech-workspace'],
      badge: (warrantyCount > 0) ? warrantyCount : undefined,
      subItems: [
        { id: 'warranty', label: 'Tiếp Nhận Sửa Chữa', icon: Wrench, badge: warrantyCount > 0 ? warrantyCount : undefined },
        { id: 'tech-workspace', label: 'Kanban Kỹ Thuật & KCS', icon: Sparkles }
      ]
    },
    {
      id: 'finance_group',
      label: 'Tài Chính',
      icon: Wallet,
      defaultTab: 'cashbook',
      matchIds: ['cashbook', 'partners', 'installments'],
      subItems: [
        { id: 'cashbook', label: 'Sổ Quỹ Thu Chi', icon: Wallet },
        { id: 'partners', label: 'Đối Tác & NCC', icon: Building2 },
        { id: 'installments', label: 'Đối Soát Trả Góp', icon: DollarSign }
      ]
    },
    {
      id: 'hr_system_group',
      label: 'Nhân Sự & Hệ Thống',
      icon: ShieldCheck,
      defaultTab: 'hr-attendance',
      matchIds: ['hr-attendance', 'sop-management', 'users', 'store-settings'],
      subItems: [
        { id: 'hr-attendance', label: 'Chấm Công & Lương', icon: Clock },
        { id: 'sop-management', label: 'Quy Trình SOP & Ca', icon: ClipboardCheck },
        { id: 'users', label: 'Phân Quyền User', icon: ShieldCheck, badge: userCount },
        { id: 'store-settings', label: 'Cài Đặt & Khởi Tạo', icon: Settings }
      ]
    }
  ];

  const [hoveredCluster, setHoveredCluster] = useState<string | null>(null);

  const userRole = currentUser?.role?.toUpperCase() || 'SALES';

  const visibleClusters = useMemo(() => {
    return navClusters
      .filter((cluster) => {
        if (userRole === 'ADMIN' || userRole === 'MANAGER') return true;
        if (userRole === 'SALES') {
          return ['dashboard', 'sales_group', 'inventory_group', 'hr_system_group'].includes(cluster.id);
        }
        if (userRole === 'TECHNICIAN') {
          return ['technical_group', 'inventory_group', 'hr_system_group'].includes(cluster.id);
        }
        if (userRole === 'ACCOUNTANT') {
          return ['dashboard', 'sales_group', 'finance_group', 'inventory_group', 'hr_system_group'].includes(cluster.id);
        }
        return ['dashboard', 'sales_group'].includes(cluster.id);
      })
      .map((cluster) => {
        if (userRole === 'ADMIN' || userRole === 'MANAGER') return cluster;

        if (cluster.id === 'hr_system_group') {
          return {
            ...cluster,
            subItems: cluster.subItems?.filter(sub => ['hr-attendance', 'sop-management'].includes(sub.id))
          };
        }
        if (cluster.id === 'sales_group' && userRole === 'ACCOUNTANT') {
          return {
            ...cluster,
            subItems: cluster.subItems?.filter(sub => ['invoices', 'crm'].includes(sub.id))
          };
        }
        if (cluster.id === 'inventory_group' && userRole === 'TECHNICIAN') {
          return {
            ...cluster,
            subItems: cluster.subItems?.filter(sub => ['products', 'transfers'].includes(sub.id))
          };
        }
        if (cluster.id === 'inventory_group' && userRole === 'SALES') {
          return {
            ...cluster,
            subItems: cluster.subItems?.filter(sub => ['inventory', 'products', 'master-catalog'].includes(sub.id))
          };
        }
        return cluster;
      });
  }, [userRole, navClusters]);

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
              

              {/* Mobile Search Button */}
              <button
                onClick={onOpenQuickSearch}
                className="md:hidden p-2 bg-orange-50 text-orange-600 border border-orange-200 rounded-xl hover:bg-orange-100 transition-all cursor-pointer"
                title="Tìm kiếm nhanh"
              >
                <Search className="w-4 h-4" />
              </button>

              
              {/* GLOBAL BRANCH SELECTOR */}
              {currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER') && (
                <div className="flex items-center space-x-1 bg-orange-50/50 border border-orange-200 rounded-lg px-2 py-1.5 shadow-2xs hover:bg-orange-50 transition-colors cursor-pointer mr-1 sm:mr-2">
                  <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <select
                    value={selectedBranchId}
                    onChange={(e) => onBranchChange(e.target.value)}
                    className="bg-transparent text-[11px] font-bold text-zinc-700 outline-none border-none w-[80px] lg:w-[100px] truncate cursor-pointer appearance-none"
                  >
                    <option value="ALL">Toàn Hệ Thống</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              

              

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
                        <Crown className="w-2.5 h-2.5 text-orange-500 absolute -top-1 -right-1" />
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

        {/* Desktop Navigation Sub-Bar with 6 Category Clusters */}
        <div className="hidden md:block bg-zinc-50/90 border-t border-zinc-200/80 px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-7xl mx-auto flex items-center justify-between py-1.5">
            <div className="flex items-center space-x-1">
              {visibleClusters.map((cluster) => {
                const Icon = cluster.icon;
                const isClusterActive = cluster.matchIds.includes(activeTab);
                const hasSub = cluster.subItems && cluster.subItems.length > 0;
                const isHovered = hoveredCluster === cluster.id;

                return (
                  <div 
                    key={cluster.id} 
                    className="relative"
                    onMouseEnter={() => hasSub && setHoveredCluster(cluster.id)}
                    onMouseLeave={() => setHoveredCluster(null)}
                  >
                    <button
                      onClick={() => {
                        if (cluster.defaultTab) {
                          setActiveTab(cluster.defaultTab);
                        }
                      }}
                      className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        isClusterActive
                          ? 'bg-gradient-to-r from-orange-500 to-orange-500 text-white shadow-sm shadow-orange-500/20'
                          : 'text-zinc-600 hover:text-orange-600 hover:bg-white'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isClusterActive ? 'text-white' : 'text-zinc-400'}`} />
                      <span>{cluster.label}</span>
                      {cluster.badge !== undefined && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                            isClusterActive ? 'bg-white text-orange-600' : 'bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          {cluster.badge}
                        </span>
                      )}
                    </button>

                    {/* Cluster Sub-Menu Dropdown */}
                    {hasSub && isHovered && (
                      <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-2xl shadow-xl border border-orange-100 p-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                        {cluster.subItems?.map((sub) => {
                          const SubIcon = sub.icon;
                          const isSubActive = activeTab === sub.id;
                          return (
                            <button
                              key={sub.id}
                              onClick={() => {
                                setActiveTab(sub.id);
                                setHoveredCluster(null);
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                                isSubActive
                                  ? 'bg-orange-50 text-orange-600 font-bold'
                                  : 'text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900'
                              }`}
                            >
                              <div className="flex items-center space-x-2.5">
                                <SubIcon className={`w-3.5 h-3.5 ${isSubActive ? 'text-orange-500' : 'text-zinc-400'}`} />
                                <span>{sub.label}</span>
                              </div>
                              {sub.badge !== undefined && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-orange-100 text-orange-600">
                                  {sub.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* App Launcher Button */}
            <button
              onClick={() => setActiveTab('more')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                activeTab === 'more'
                  ? 'text-orange-600 bg-orange-50 border-orange-300'
                  : 'text-zinc-500 hover:text-orange-600 hover:bg-white border-transparent hover:border-zinc-200'
              }`}
            >
              <Menu className="w-3.5 h-3.5" />
              <span>Tất Cả Phân Hệ ▦</span>
            </button>
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
