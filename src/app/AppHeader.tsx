import React, { useState } from 'react';
import { StoreBranch, StaffMember } from '../types';
import { 
  Building2, 
  Search, 
  Bell, 
  ChevronDown, 
  LogOut, 
  User, 
  Shield, 
  Sparkles,
  Command
} from 'lucide-react';

export interface AppHeaderProps {
  currentUser: StaffMember | null;
  currentBranch: StoreBranch;
  branches: StoreBranch[];
  selectedBranchId?: string;
  onSelectBranchId?: (branchId: string) => void;
  onSelectBranch: (branch: StoreBranch) => void;
  onLogout: () => void;
  onOpenQuickSearch?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentUser,
  currentBranch,
  branches,
  selectedBranchId = 'ALL',
  onSelectBranchId,
  onSelectBranch,
  onLogout,
  onOpenQuickSearch
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isBranchMenuOpen, setIsBranchMenuOpen] = useState(false);

  const userName = currentUser?.name || currentUser?.displayName || 'Nhân viên';
  const isMultiBranchUser = !currentUser || currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER' || (currentUser.assignedBranchIds && currentUser.assignedBranchIds.length > 1);

  const availableBranches = branches.filter(b => {
    if (!currentUser || currentUser.role === 'ADMIN') return true;
    if (currentUser.assignedBranchIds && currentUser.assignedBranchIds.length > 0) {
      return currentUser.assignedBranchIds.includes(b.id);
    }
    return !currentUser.branchId || currentUser.branchId === b.id;
  });

  const selectedBranchObj = branches.find(b => b.id === selectedBranchId || b.code === selectedBranchId);
  const displayBranchName = selectedBranchId === 'ALL'
    ? 'Toàn Hệ Thống'
    : (selectedBranchObj?.name || currentBranch?.name || 'Toàn Hệ Thống');

  return (
    <header className="h-14 bg-white border-b border-zinc-200/80 px-3 sm:px-5 flex items-center justify-between sticky top-0 z-20 shrink-0">
      {/* 1. Branch Selector */}
      <div className="relative">
        <button
          onClick={() => {
            if (availableBranches.length > 1 || isMultiBranchUser) {
              setIsBranchMenuOpen(prev => !prev);
            }
          }}
          className={`flex items-center space-x-1.5 sm:space-x-2 px-2.5 py-1.5 rounded-xl border border-zinc-200/80 hover:bg-zinc-50 hover:border-zinc-300 transition-all text-xs font-semibold text-zinc-800 shadow-2xs active:scale-95 ${
            availableBranches.length > 1 || isMultiBranchUser ? 'cursor-pointer' : 'cursor-default'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#ff4b16] shrink-0" />
          <span className="truncate max-w-[110px] xs:max-w-[140px] sm:max-w-[220px]">{displayBranchName}</span>
          {(availableBranches.length > 1 || isMultiBranchUser) && (
            <ChevronDown className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400 shrink-0 transition-transform ${isBranchMenuOpen ? 'rotate-180' : ''}`} />
          )}
        </button>

        {isBranchMenuOpen && (availableBranches.length > 1 || isMultiBranchUser) && (
          <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-zinc-200 rounded-2xl shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-100 flex items-center justify-between">
              <span>Chọn Chi Nhánh Hoạt Động</span>
              {selectedBranchId && selectedBranchId !== 'ALL' && (
                <span className="text-[9px] text-[#ff4b16] font-normal">Đang lọc</span>
              )}
            </div>

            {isMultiBranchUser && (
              <button
                type="button"
                onClick={() => {
                  if (onSelectBranchId) {
                    onSelectBranchId('ALL');
                  }
                  setIsBranchMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-orange-50/60 transition-colors cursor-pointer border-b border-zinc-100 ${
                  selectedBranchId === 'ALL' ? 'font-bold text-[#ff4b16] bg-orange-50/80' : 'text-zinc-700'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <span className="w-2 h-2 rounded-full bg-[#ff4b16]" />
                  <span className="truncate font-semibold">Toàn Hệ Thống</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-400">Tất cả</span>
              </button>
            )}

            {availableBranches.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  if (onSelectBranchId) {
                    onSelectBranchId(b.id);
                  } else {
                    onSelectBranch(b);
                  }
                  setIsBranchMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-orange-50/60 transition-colors cursor-pointer ${
                  selectedBranchId === b.id ? 'font-bold text-[#ff4b16] bg-orange-50/80' : 'text-zinc-700'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <span className={`w-2 h-2 rounded-full ${b.isActive !== false || b.status === 'active' ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                  <span className="truncate">{b.name}</span>
                </div>
                {b.code && <span className="text-[10px] font-mono text-zinc-400">{b.code}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Middle Quick Search / Command Bar (Desktop) */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <button
          onClick={onOpenQuickSearch}
          className="w-full flex items-center justify-between bg-zinc-100/80 hover:bg-zinc-100 border border-transparent hover:border-zinc-200 text-zinc-400 px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer"
        >
          <div className="flex items-center space-x-2">
            <Search className="w-4 h-4 text-zinc-400" />
            <span>Tìm nhanh máy, IMEI, khách hàng, đơn hàng...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-white border border-zinc-200 rounded text-zinc-500 shadow-2xs">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* 3. Right Actions: Search (Mobile), Notifications & User Profile */}
      <div className="flex items-center space-x-1.5 sm:space-x-2.5">
        {/* Mobile Search Button */}
        <button
          onClick={onOpenQuickSearch}
          className="md:hidden p-2 rounded-xl text-zinc-600 hover:text-[#ff4b16] hover:bg-orange-50 transition-colors cursor-pointer active:scale-95"
          title="Tìm kiếm nhanh IMEI / Khách hàng"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Quick notification bell */}
        <button
          className="p-2 rounded-xl text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 relative transition-colors cursor-pointer active:scale-95"
          title="Thông báo hệ thống"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#ff4b16] rounded-full ring-2 ring-white" />
        </button>

        {/* User Profile dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(prev => !prev)}
            className="flex items-center space-x-2 pl-2 pr-1.5 py-1 rounded-xl hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-orange-100 text-[#ff4b16] font-bold text-xs flex items-center justify-center border border-orange-200 shrink-0">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-bold text-zinc-800 leading-tight truncate max-w-[100px]">
                {userName}
              </span>
              <span className="text-[9px] font-mono text-zinc-400 uppercase">
                {currentUser?.role || 'STAFF'}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 hidden sm:block" />
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-zinc-200 rounded-2xl shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-3 py-2 border-b border-zinc-100">
                <p className="text-xs font-bold text-zinc-900">{userName}</p>
                <p className="text-[10px] text-zinc-500 font-mono">{currentUser?.email || currentUser?.phone || 'admin@phonehouse.vn'}</p>
                <div className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-orange-50 text-[#ff4b16]">
                  <Shield className="w-2.5 h-2.5 mr-1" />
                  {currentUser?.role || 'ADMIN'}
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center space-x-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Đăng xuất hệ thống</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
