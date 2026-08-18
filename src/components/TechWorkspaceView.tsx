import React, { useState, useMemo } from 'react';
import { 
  Wrench, Package, Search, Bell, CheckCircle2, 
  Activity, Zap, Clock, Smartphone, ShieldCheck, RefreshCw,
  ArrowUpRight, FileText, Check, Filter, Layers, DollarSign, ScanFace
} from 'lucide-react';
import { TechKanbanBoard } from './TechKanbanBoard';
import { StaffHRView } from './StaffHRView';
import { UserAccount, WarrantyTicket, DeviceItem, CommissionTransaction, StoreBranch } from '../types';
import { calculateStaffDualWallet, calculateWarrantyTicketCommissions } from '../utils/commissionEngine';
import { INITIAL_STAFF_MEMBERS } from '../data/attendanceData';

interface TechWorkspaceViewProps {
  tasks: WarrantyTicket[];
  devices: DeviceItem[];
  branches?: StoreBranch[];
  currentUser?: UserAccount | null;
  onCheckIn?: (time: string) => void;
  onCheckOut?: (time: string) => void;
  onOpenCheckIn?: () => void;
  attendanceRecord?: import('../types').AttendanceRecord;
  commissions?: CommissionTransaction[];
  onSyncCommissions?: () => void;
}

export const TechWorkspaceView: React.FC<TechWorkspaceViewProps> = ({ 
  tasks, 
  devices, 
  branches = [],
  currentUser, 
  onCheckIn, 
  onCheckOut, 
  onOpenCheckIn,
  attendanceRecord,
  commissions = [],
  onSyncCommissions
}) => {
  const [activeTab, setActiveTab] = useState<'KANBAN' | 'INVENTORY' | 'KPI' | 'HR'>('KANBAN');
  const [walletFilter, setWalletFilter] = useState<'ALL' | 'KCS' | 'REPAIR' | 'WARRANTY' | 'TRADEIN'>('ALL');
  const [isSyncing, setIsSyncing] = useState(false);

  // Active tech staff identification
  const currentStaffId = currentUser?.id || 'STAFF_004';
  const staffMember = INITIAL_STAFF_MEMBERS.find(s => s.id === currentStaffId || s.name === currentUser?.displayName) 
    || INITIAL_STAFF_MEMBERS.find(s => s.role === 'TECHNICIAN') 
    || INITIAL_STAFF_MEMBERS[0];

  // Automated Tech Wallet Calculation using Phase 3 Engine
  const dualWallet = useMemo(() => {
    // Generate real-time commissions from tickets if not provided or empty
    const directTicketCommissions = tasks.flatMap(t => calculateWarrantyTicketCommissions(t, INITIAL_STAFF_MEMBERS));
    const mergedCommissions = commissions.length > 0 ? commissions : directTicketCommissions;
    return calculateStaffDualWallet(staffMember.id, mergedCommissions, INITIAL_STAFF_MEMBERS);
  }, [staffMember, commissions, tasks]);

  const techWallet = dualWallet.techWallet;

  // Filtered Tech Transactions
  const filteredTechTransactions = useMemo(() => {
    return techWallet.transactions.filter(tx => {
      if (walletFilter === 'ALL') return true;
      if (walletFilter === 'KCS') return tx.type === 'TECH_KCS';
      if (walletFilter === 'REPAIR') return tx.type === 'TECH_REPAIR';
      if (walletFilter === 'WARRANTY') return tx.type === 'TECH_WARRANTY';
      if (walletFilter === 'TRADEIN') return tx.type === 'TRADEIN_BONUS';
      return true;
    });
  }, [techWallet.transactions, walletFilter]);

  // Today specific metrics
  const todayTasks = tasks.filter(t => {
    const isMine = t.technician === currentUser?.displayName || t.assigneeId === staffMember.id;
    return isMine;
  });
  const todayCompletedCount = todayTasks.filter(t => t.status === 'ready' || t.status === 'delivered').length;

  const handleManualSync = () => {
    setIsSyncing(true);
    if (onSyncCommissions) {
      onSyncCommissions();
    }
    setTimeout(() => {
      setIsSyncing(false);
    }, 600);
  };

  const formatVND = (num: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col font-sans">
      {/* TECH TOPBAR */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-orange-600 text-white p-2 sm:p-3 sm:px-6 flex items-center justify-between shadow-md z-10 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-wider">Tech Desk</h1>
            <div className="text-[10px] text-orange-200 flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"></span>
              <span>KTV: {staffMember.name}</span>
            </div>
          </div>
        </div>

        {/* METRICS (Center) */}
        <div className="hidden md:flex flex-1 max-w-xl mx-8 justify-center">
          <div className="flex items-center gap-3 bg-black/10 border border-white/20 px-4 py-1.5 rounded-full text-xs font-medium">
            <div className="flex items-center gap-1.5 text-white/90">
              <Activity className="w-4 h-4 text-orange-300"/> 
              <span>Hoàn thành: <strong className="text-white">{todayCompletedCount} máy</strong></span>
            </div>
            <span className="text-white/40">|</span>
            <div className="flex items-center gap-1.5 text-white/90">
              <Zap className="w-4 h-4 text-orange-300"/> 
              <span>Ví Kỹ Thuật: <strong className="text-white font-mono">{formatVND(techWallet.totalCommission)}</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button 
            onClick={() => {
              if (onOpenCheckIn) {
                onOpenCheckIn();
              } else {
                setActiveTab('HR');
              }
            }}
            className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shrink-0"
            title="Điểm danh Face ID"
          >
            <ScanFace className="w-4 h-4" />
            <span className="hidden sm:inline">Điểm Danh</span>
          </button>

          <button 
            onClick={handleManualSync}
            disabled={isSyncing}
            className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all cursor-pointer disabled:opacity-50"
            title="Đồng bộ"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>

          <button className="relative p-1.5 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors cursor-pointer">
            <Bell className="w-4 h-4 text-white" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full border border-[#FF4B16]"></span>
          </button>
          
          <div className="w-9 h-9 rounded-xl bg-white text-[#FF4B16] flex items-center justify-center font-black text-xs shadow-md ml-1 border border-orange-200">
            {staffMember.name.slice(0, 2).toUpperCase()}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden pb-16">
        {/* MAIN CONTENT AREA */}
        <div className="flex-1 overflow-auto bg-zinc-50/50 p-3 sm:p-5">
          {activeTab === 'KANBAN' && (
            <div className="h-full flex flex-col">
              <div className="mb-3 sm:mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-zinc-900">Bảng Điều Phối Sửa Chữa & KCS</h2>
                  <span className="text-xs font-bold text-zinc-500 bg-white px-2.5 py-1 rounded-xl border border-zinc-200 shadow-2xs">
                    {tasks.length} phiếu
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 flex items-center gap-2 shadow-2xs">
                    <Clock className="w-3.5 h-3.5 text-orange-500" />
                    <span>SLA Tiêu Chuẩn: &lt; 2h / ca</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 min-h-0 bg-white rounded-3xl shadow-2xs border border-zinc-200/80 overflow-hidden">
                <TechKanbanBoard 
                  tasks={tasks}
                  onTaskClick={(t) => console.log('View task', t)}
                />
              </div>
            </div>
          )}

          {activeTab === 'KPI' && (
            <div className="max-w-5xl mx-auto space-y-5 animate-fadeIn">
              {/* WALLET HEADER BANNER */}
              <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-orange-900 rounded-3xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 w-80 h-full bg-orange-500/10 rounded-l-full pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-orange-400 text-zinc-950 text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                        Ví Kỹ Thuật Độc Lập
                      </span>
                      <span className="text-xs text-zinc-300 font-medium">Tự động kết nối Phiếu Tiếp Nhận & KCS</span>
                    </div>
                    <div className="text-2xl sm:text-4xl font-black tracking-tight font-mono text-orange-300">
                      {formatVND(techWallet.totalCommission)}
                    </div>
                    <p className="text-xs text-zinc-300 mt-1">
                      Tích lũy từ {techWallet.completedTicketCount} công việc đạt chuẩn QC • {techWallet.pendingCount} ca đang kiểm tra
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleManualSync}
                      disabled={isSyncing}
                      className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl border border-white/20 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? 'Đang đồng bộ...' : 'Quét lại phiếu KTV'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 4 CORE BREAKDOWN CARDS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                {/* KCS Card */}
                <div className="bg-white rounded-2xl p-4 border border-zinc-200/90 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-orange-600 mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider">KCS Kiểm Định</span>
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-zinc-900 font-mono">{techWallet.kcsCount} máy</div>
                    <div className="text-xs font-bold text-orange-600 font-mono mt-0.5">+{formatVND(techWallet.kcsAmount)}</div>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-2 pt-2 border-t border-zinc-100">Định mức: 35.000 đ/máy</div>
                </div>

                {/* Repair Card */}
                <div className="bg-white rounded-2xl p-4 border border-zinc-200/90 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-orange-600 mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider">Sửa Chữa Dịch Vụ</span>
                      <Wrench className="w-4 h-4" />
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-zinc-900 font-mono">{techWallet.repairCount} ca</div>
                    <div className="text-xs font-bold text-orange-600 font-mono mt-0.5">+{formatVND(techWallet.repairAmount)}</div>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-2 pt-2 border-t border-zinc-100">Thay màn, pin, ép kính, main</div>
                </div>

                {/* Warranty Free Card */}
                <div className="bg-white rounded-2xl p-4 border border-zinc-200/90 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-orange-600 mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider">Bảo Hành Tiêu Chuẩn</span>
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-zinc-900 font-mono">{techWallet.warrantyCount} máy</div>
                    <div className="text-xs font-bold text-orange-600 font-mono mt-0.5">+{formatVND(techWallet.warrantyAmount)}</div>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-2 pt-2 border-t border-zinc-100">Công KTV: 50.000 đ/máy</div>
                </div>

                {/* Trade-in Card */}
                <div className="bg-white rounded-2xl p-4 border border-zinc-200/90 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-orange-600 mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider">Test Thu Cũ</span>
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-zinc-900 font-mono">{techWallet.tradeInCount} máy</div>
                    <div className="text-xs font-bold text-orange-600 font-mono mt-0.5">+{formatVND(techWallet.tradeInAmount)}</div>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-2 pt-2 border-t border-zinc-100">Định mức: 50.000 đ/máy</div>
                </div>
              </div>

              {/* TRANSACTION LEDGER TABLE (LỊCH SỬ BIẾN ĐỘNG VÍ KỸ THUẬT) */}
              <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50/50">
                  <div>
                    <h3 className="font-black text-sm text-zinc-900 uppercase tracking-wide">
                      Sổ Kê Chi Tiết Hoa Hồng Kỹ Thuật (Phase 3 Ledger)
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">Trích xuất tự động theo thời gian thực từ Phiếu sửa chữa & KCS</p>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {[
                      { id: 'ALL', label: 'Tất cả' },
                      { id: 'KCS', label: 'KCS Nhập' },
                      { id: 'REPAIR', label: 'Sửa chữa' },
                      { id: 'WARRANTY', label: 'Bảo hành' },
                      { id: 'TRADEIN', label: 'Thu cũ' }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setWalletFilter(f.id as any)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          walletFilter === f.id
                            ? 'bg-orange-600 text-white shadow-2xs'
                            : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-zinc-100 max-h-[480px] overflow-y-auto">
                  {filteredTechTransactions.length === 0 ? (
                    <div className="p-8 text-center text-zinc-400 space-y-2">
                      <Wrench className="w-10 h-10 mx-auto text-zinc-300 stroke-1" />
                      <p className="text-xs font-medium">Chưa có giao dịch hoa hồng nào trong mục này</p>
                    </div>
                  ) : (
                    filteredTechTransactions.map(tx => (
                      <div key={tx.id} className="p-3.5 sm:p-4 hover:bg-orange-50/30 transition-colors flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                            tx.type === 'TECH_KCS' ? 'bg-orange-100 text-orange-600' :
                            tx.type === 'TECH_REPAIR' ? 'bg-orange-100 text-orange-600' :
                            tx.type === 'TECH_WARRANTY' ? 'bg-orange-100 text-orange-600' :
                            'bg-orange-100 text-orange-600'
                          }`}>
                            {tx.type === 'TECH_KCS' ? <Smartphone className="w-4 h-4" /> :
                             tx.type === 'TECH_REPAIR' ? <Wrench className="w-4 h-4" /> :
                             tx.type === 'TECH_WARRANTY' ? <ShieldCheck className="w-4 h-4" /> :
                             <Zap className="w-4 h-4" />}
                          </div>

                          <div>
                            <div className="font-extrabold text-zinc-900 text-xs sm:text-sm">{tx.productName}</div>
                            <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500 mt-0.5">
                              <span className="font-mono font-bold text-orange-600 bg-orange-50 px-1.5 py-0.2 rounded border border-orange-100">
                                {tx.orderCode}
                              </span>
                              {tx.imei && <span className="font-mono text-zinc-400">IMEI: {tx.imei}</span>}
                              <span>•</span>
                              <span>{tx.occurredAt}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-black text-sm sm:text-base text-orange-600 font-mono">
                            +{formatVND(tx.commissionAmount)}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                            tx.status === 'CONFIRMED' ? 'bg-orange-100 text-orange-800' :
                            tx.status === 'PENDING' ? 'bg-orange-100 text-orange-800' : 'bg-zinc-100 text-zinc-600'
                          }`}>
                            {tx.status === 'CONFIRMED' ? '✓ Đã vào ví' : '⏳ Chờ QC xong'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'INVENTORY' && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-4">
              <Package className="w-16 h-16 text-zinc-200" />
              <p className="font-medium text-sm">Kho linh kiện đang được đồng bộ ERP...</p>
            </div>
          )}
          
          {activeTab === 'HR' && (
            <div className="h-full bg-white rounded-3xl shadow-2xs border border-zinc-200/80 overflow-hidden p-3 sm:p-5">
              <StaffHRView 
                currentUser={currentUser} 
                roleType='TECH' 
                branches={branches}
                onCheckIn={onCheckIn}
                onCheckOut={onCheckOut}
                checkedInState={!!attendanceRecord?.checkInTime && !attendanceRecord?.checkOutTime}
                initialCheckInTime={attendanceRecord?.checkInTime || null}
                onOpenCheckInModal={onOpenCheckIn}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* BOTTOM TAB BAR */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-zinc-200 flex items-center justify-around z-40 px-2 pb-safe">
        <button 
          onClick={() => setActiveTab('KANBAN')}
          className={`flex flex-col items-center justify-center w-20 h-full gap-1 transition-all cursor-pointer ${activeTab === 'KANBAN' ? 'text-orange-600 font-bold' : 'text-zinc-400'}`}
        >
          <CheckCircle2 className={`w-5 h-5 ${activeTab === 'KANBAN' ? 'scale-110' : ''}`} />
          <span className="text-[10px]">Kanban</span>
        </button>
        <button 
          onClick={() => setActiveTab('INVENTORY')}
          className={`flex flex-col items-center justify-center w-20 h-full gap-1 transition-all cursor-pointer ${activeTab === 'INVENTORY' ? 'text-orange-600 font-bold' : 'text-zinc-400'}`}
        >
          <Package className={`w-5 h-5 ${activeTab === 'INVENTORY' ? 'scale-110' : ''}`} />
          <span className="text-[10px]">Kho Linh Kiện</span>
        </button>
        <button 
          onClick={() => setActiveTab('KPI')}
          className={`flex flex-col items-center justify-center w-20 h-full gap-1 transition-all cursor-pointer ${activeTab === 'KPI' ? 'text-orange-600 font-bold' : 'text-zinc-400'}`}
        >
          <Zap className={`w-5 h-5 ${activeTab === 'KPI' ? 'scale-110' : ''}`} />
          <span className="text-[10px]">Ví Kỹ Thuật</span>
        </button>
        <button 
          onClick={() => setActiveTab('HR')}
          className={`flex flex-col items-center justify-center w-20 h-full gap-1 transition-all cursor-pointer ${activeTab === 'HR' ? 'text-orange-600 font-bold' : 'text-zinc-400'}`}
        >
          <Activity className={`w-5 h-5 ${activeTab === 'HR' ? 'scale-110' : ''}`} />
          <span className="text-[10px]">Chấm Công</span>
        </button>
      </div>
    </div>
  );
};

