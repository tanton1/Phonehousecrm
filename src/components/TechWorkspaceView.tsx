import React, { useEffect, useState, useMemo } from 'react';
import { 
  Wrench, Package, Search, Bell, CheckCircle2, 
  Activity, Zap, Clock, Smartphone, ShieldCheck, RefreshCw,
  ArrowUpRight, FileText, Check, Filter, Layers, DollarSign, ScanFace
} from 'lucide-react';
import { TechKanbanBoard } from './TechKanbanBoard';
import { StaffHRView } from './StaffHRView';
import { UserAccount, WarrantyTicket, DeviceItem, CommissionTransaction, StoreBranch, WarehouseInfo, FundAccount } from '../types';
import { calculateStaffDualWallet } from '../utils/commissionEngine';
import { INITIAL_STAFF_MEMBERS } from '../data/attendanceData';
import { fetchMyTechnicalWork, fetchPendingTechnicalHandoffs, fetchRepairRevenueReport, fetchTechnicalCommissionLedger, requestAcceptTechnicalHandoff, RepairRevenueReport, TechnicalCommissionLedgerEntry } from '../services/technicalApiClient';
import { TechnicalWorkOrderDrawer } from './TechnicalWorkOrderDrawer';
import { uploadTechnicalEvidence } from '../services/technicalEvidenceService';

interface TechWorkspaceViewProps {
  devices: DeviceItem[];
  branches?: StoreBranch[];
  warehouses?: WarehouseInfo[];
  funds?: FundAccount[];
  currentUser?: UserAccount | null;
  onCheckIn?: (time: string) => void;
  onCheckOut?: (time: string) => void;
  onOpenCheckIn?: () => void;
  attendanceRecord?: import('../types').AttendanceRecord;
  onSyncCommissions?: () => void;
}

export const TechWorkspaceView: React.FC<TechWorkspaceViewProps> = ({ 
  devices, 
  branches = [],
  warehouses = [],
  funds = [],
  currentUser, 
  onCheckIn, 
  onCheckOut, 
  onOpenCheckIn,
  attendanceRecord,
  onSyncCommissions
}) => {
  const [activeTab, setActiveTab] = useState<'KANBAN' | 'INVENTORY' | 'KPI' | 'REPORT' | 'HR'>('KANBAN');
  const [walletFilter, setWalletFilter] = useState<'ALL' | 'KCS' | 'REPAIR' | 'WARRANTY' | 'TRADEIN'>('ALL');
  const [isSyncing, setIsSyncing] = useState(false);
  const [assignedWorkLines, setAssignedWorkLines] = useState<any[]>([]);
  const [assignedWorkError, setAssignedWorkError] = useState('');
  const [selectedTechnicalTask, setSelectedTechnicalTask] = useState<WarrantyTicket | null>(null);
  const [ledgerCommissions, setLedgerCommissions] = useState<CommissionTransaction[]>([]);
  const [pendingHandoffs, setPendingHandoffs] = useState<any[]>([]);
  const [selectedHandoff, setSelectedHandoff] = useState<any | null>(null);
  const [handoffScan, setHandoffScan] = useState('');
  const [handoffNotes, setHandoffNotes] = useState('');
  const [handoffFiles, setHandoffFiles] = useState<File[]>([]);
  const [repairReport, setRepairReport] = useState<RepairRevenueReport | null>(null);
  const [repairReportLoading, setRepairReportLoading] = useState(false);
  const [repairReportError, setRepairReportError] = useState('');
  const [reportFrom, setReportFrom] = useState(() => `${new Date().toISOString().slice(0, 7)}-01`);
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const currentRole = String(currentUser?.role || '').toUpperCase();
  const canViewRepairReport = ['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(currentRole);

  const mapLedgerEntry = (entry: TechnicalCommissionLedgerEntry): CommissionTransaction => {
    const workOrderType = String(entry.workOrderType || '');
    const type = workOrderType === 'WARRANTY'
      ? 'TECH_WARRANTY'
      : workOrderType === 'INBOUND_PREP' ? 'TECH_KCS'
        : workOrderType === 'TRADE_IN_REFURB' ? 'TRADEIN_BONUS' : 'TECH_REPAIR';
    const status = entry.status === 'ELIGIBLE' ? 'CONFIRMED'
      : entry.status === 'CANCELLED' ? 'REVERSED'
        : entry.status === 'PAID' ? 'PAID' : 'PENDING';
    return {
      id: entry.id,
      employeeId: entry.staffUid,
      employeeName: entry.staffName,
      role: 'TECHNICIAN',
      walletCategory: 'TECH_WALLET',
      orderId: entry.workOrderId,
      orderCode: entry.workOrderId,
      orderItemId: entry.workOrderLineId,
      productName: entry.taskName || entry.taskCode || 'Task kỹ thuật',
      imei: entry.imei,
      branchId: entry.branchId,
      type,
      baseAmount: 0,
      profitAmount: 0,
      commissionRate: 0,
      commissionAmount: Number(entry.commissionPayable ?? entry.amount ?? 0),
      status,
      policyId: entry.policyId || 'TECH_TASK_POLICY',
      policyVersion: entry.policyVersion || 'UNVERSIONED',
      occurredAt: entry.eligibleAt || entry.createdAt || new Date().toISOString(),
      approvedAt: entry.eligibleAt || undefined,
      sourceType: 'TECHNICAL_WORK_ORDER',
      sourceId: entry.workOrderId
    };
  };

  const loadAssignedWork = async () => {
    setIsSyncing(true);
    try {
      const period = new Date().toISOString().slice(0, 7);
      const [lines, ledger, handoffs] = await Promise.all([
        fetchMyTechnicalWork(),
        fetchTechnicalCommissionLedger(period),
        fetchPendingTechnicalHandoffs()
      ]);
      setAssignedWorkLines(Array.isArray(lines) ? lines : []);
      setLedgerCommissions((ledger || []).map(mapLedgerEntry));
      setPendingHandoffs(Array.isArray(handoffs) ? handoffs : []);
      setAssignedWorkError('');
    } catch (error: any) {
      setAssignedWorkError(error?.message || 'Không thể tải công việc được giao từ kho.');
    } finally {
      setIsSyncing(false);
    }
  };

  const loadRepairReport = async () => {
    if (!canViewRepairReport) return;
    setRepairReportLoading(true);
    setRepairReportError('');
    try {
      setRepairReport(await fetchRepairRevenueReport(reportFrom, reportTo));
    } catch (error: any) {
      setRepairReportError(error?.message || 'Không thể tải báo cáo doanh thu sửa chữa.');
    } finally {
      setRepairReportLoading(false);
    }
  };

  useEffect(() => {
    void loadAssignedWork();
  }, [currentUser?.id]);

  useEffect(() => {
    void loadRepairReport();
  }, [currentUser?.id, canViewRepairReport]);

  // Active tech staff identification
  const currentStaffId = currentUser?.id || '';
  const staffMember = (INITIAL_STAFF_MEMBERS || []).find(s => s?.id === currentStaffId || s?.name === currentUser?.displayName) 
    || { id: currentStaffId, name: currentUser?.displayName || 'Kỹ thuật viên', role: 'TECHNICIAN', branchId: currentUser?.branchId || '' } as any;

  // Automated Tech Wallet Calculation using Phase 3 Engine
  const dualWallet = useMemo(() => {
    return calculateStaffDualWallet(staffMember?.id || currentStaffId, ledgerCommissions, [staffMember as any]);
  }, [staffMember, currentStaffId, ledgerCommissions]);

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
  const todayCompletedCount = assignedWorkLines.filter(line =>
    ['COMPLETED', 'VERIFIED', 'QC_PASSED', 'RETURNED_TO_STOCK', 'DELIVERED_TO_CUSTOMER'].includes(String(line.status || line.workOrderStatus || ''))
  ).length;

  const handleManualSync = async () => {
    if (onSyncCommissions) {
      onSyncCommissions();
    }
    await loadAssignedWork();
    await loadRepairReport();
  };

  const acceptSelectedHandoff = async () => {
    if (!selectedHandoff) return;
    setIsSyncing(true);
    setAssignedWorkError('');
    try {
      const handoverPhotoUrls = handoffFiles.length
        ? await uploadTechnicalEvidence(selectedHandoff.workOrderId, 'handoff-accept', handoffFiles)
        : [];
      await requestAcceptTechnicalHandoff(selectedHandoff.id, {
        scannedImei: handoffScan,
        handoverPhotoUrls,
        notes: handoffNotes.trim()
      });
      setSelectedHandoff(null);
      setHandoffScan('');
      setHandoffNotes('');
      setHandoffFiles([]);
      await loadAssignedWork();
    } catch (cause: any) {
      setAssignedWorkError(cause?.message || 'Không thể nhận bàn giao KTV.');
    } finally {
      setIsSyncing(false);
    }
  };

  const assignedDevices = useMemo(() => {
    const userNames = new Set([currentUser?.displayName, currentUser?.name, staffMember?.name].filter(Boolean));
    const assignedDeviceIds = new Set(assignedWorkLines.map(line => String(line.deviceId || '')).filter(Boolean));
    return devices.filter(device =>
      assignedDeviceIds.has(String(device.id)) ||
      (device as any).currentCustodianUid === currentUser?.id ||
      userNames.has(device.technicianAssigned) ||
      userNames.has(device.currentCustodian)
    );
  }, [devices, assignedWorkLines, currentUser, staffMember]);

  const kanbanTasks = useMemo(() => {
    const grouped = new Map<string, any[]>();
    assignedWorkLines.forEach(line => {
      const key = String(line.workOrderId || line.id || '');
      grouped.set(key, [...(grouped.get(key) || []), line]);
    });
    return [...grouped.entries()].map(([workOrderId, lines]) => {
      const first = lines[0] || {};
      const workOrderStatus = String(first.workOrderStatus || 'ASSIGNED');
      const lineStatuses = lines.map(line => String(line.status || 'ASSIGNED'));
      const openLineStatuses = lineStatuses.filter(status => !['COMPLETED', 'VERIFIED'].includes(status));
      const allOpenTasksWaitingForParts = openLineStatuses.length > 0 && openLineStatuses.every(status => status === 'WAITING_PARTS');
      const stage = ['DELIVERED_TO_CUSTOMER', 'RETURNED_TO_STOCK', 'RETURNED_TO_BRANCH'].includes(workOrderStatus)
        ? 'COMPLETED'
        : ['QC_PASSED', 'CUSTOMER_READY'].includes(workOrderStatus)
          ? 'WAITING_DELIVERY'
          : ['TECH_COMPLETED', 'QC_PENDING'].includes(workOrderStatus)
            ? 'WAITING_QC'
            : allOpenTasksWaitingForParts
              ? 'WAITING_PARTS'
              : workOrderStatus === 'ASSIGNED' || lineStatuses.every(status => status === 'ASSIGNED')
                ? 'WAITING_ACCEPTANCE'
                : 'IN_PROGRESS';
      const actionableLine = lines.find(line => ['ASSIGNED', 'ACCEPTED', 'REWORK_REQUIRED', 'IN_PROGRESS', 'WAITING_PARTS'].includes(String(line.status || ''))) || first;
      const technicians = [...new Map(lines.filter(line => line.assigneeUid || line.assigneeName).map(line => [String(line.assigneeUid || line.assigneeName), { id: String(line.assigneeUid || ''), name: String(line.assigneeName || 'Chưa gán KTV') }])).values()];
      return {
        id: `TECH-WO-${workOrderId}`,
        workOrderId,
        workOrderStatus,
        workOrderType: first.workOrderType,
        sourceWarehouseId: first.sourceWarehouseId,
        lineId: actionableLine.id,
        sourceKind: 'TECHNICAL_WORK_ORDER',
        ticketNumber: first.workOrderCode || workOrderId,
        ticketCode: first.workOrderCode || workOrderId,
        customerName: first.customerName || 'Máy nội bộ từ kho',
        phone: first.customerPhone || '',
        imei: first.imei || '',
        model: first.model || 'Thiết bị',
        deviceModel: first.model || 'Thiết bị',
        issueType: 'Khác',
        faultDescription: first.issueDescription || first.taskName || 'Công việc kỹ thuật',
        issueDescription: lines.map(line => line.taskName || line.taskType).filter(Boolean).join(' · '),
        technician: technicians.map(item => item.name).join(' · ') || 'Chưa gán KTV',
        technicianIds: technicians.map(item => item.id).filter(Boolean),
        taskLines: lines.map(line => ({ id: line.id, taskName: line.taskName || line.taskType || 'Việc kỹ thuật', status: line.status || 'ASSIGNED', assigneeUid: line.assigneeUid || '', assigneeName: line.assigneeName || '' })),
        boardStage: stage,
        status: stage,
        priority: lines.some(line => line.priority === 'URGENT') ? 'URGENT' : lines.some(line => line.priority === 'PRIORITY') ? 'PRIORITY' : 'NORMAL',
        isWarrantyFree: first.workOrderType === 'WARRANTY',
        estimatedCost: Number(lines.reduce((sum, line) => sum + Number(line.commissionAmount || 0), 0)),
        estimatedLaborCost: Number(lines.reduce((sum, line) => sum + Number(line.commissionAmount || 0), 0)),
        finalCost: 0,
        receivedDate: first.createdAt || '',
        expectedReturnDate: lines.map(line => line.deadlineAt).filter(Boolean).sort()[0] || ''
      } as any;
    }).filter(task => task.boardStage !== 'COMPLETED') as unknown as WarrantyTicket[];
  }, [assignedWorkLines]);

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
                  <h2 className="text-base sm:text-lg font-black text-zinc-900">Bàn kỹ thuật & KCS</h2>
                  <span className="text-xs font-bold text-zinc-500 bg-white px-2.5 py-1 rounded-xl border border-zinc-200 shadow-2xs">
                    {kanbanTasks.length} công việc
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 flex items-center gap-2 shadow-2xs">
                    <Clock className="w-3.5 h-3.5 text-orange-500" />
                    <span>SLA Tiêu Chuẩn: &lt; 2h / ca</span>
                  </div>
                </div>
              </div>
              {pendingHandoffs.length > 0 && <div className="mb-3 rounded-2xl border border-blue-200 bg-blue-50 p-3"><p className="text-xs font-black uppercase tracking-wide text-blue-900">Có {pendingHandoffs.length} máy đang chờ bạn nhận trách nhiệm</p><div className="mt-2 flex flex-wrap gap-2">{pendingHandoffs.map(handoff => <button key={handoff.id} onClick={() => { setSelectedHandoff(handoff); setHandoffScan(''); setHandoffNotes(''); setHandoffFiles([]); }} className="rounded-xl bg-white px-3 py-2 text-left text-xs shadow-sm"><strong className="block text-blue-800">{handoff.imei} · {handoff.targetTechnicianName || 'KTV nhận'}</strong><span className="text-zinc-500">Từ {handoff.fromTechnicianName || 'KTV trước'} · {handoff.reason}</span></button>)}</div></div>}
              {(assignedWorkLines.length > 0 || assignedWorkError) && <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50/70 p-3"><div><p className="text-xs font-black uppercase tracking-wide text-orange-900">Máy kho đã chuyển cho tôi: {assignedWorkLines.length} hạng mục</p><p className="text-[11px] text-orange-700">Đã đưa thẳng vào các cột Kanban bên dưới theo trạng thái thực tế.</p>{assignedWorkError && <p className="mt-1 text-xs font-semibold text-rose-600">{assignedWorkError}</p>}</div><button onClick={handleManualSync} className="rounded-lg bg-white p-2 text-orange-700 shadow-sm"><RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} /></button></div>}
              <div className="flex-1 min-h-0 bg-white rounded-3xl shadow-2xs border border-zinc-200/80 overflow-hidden">
                <TechKanbanBoard 
                  tasks={kanbanTasks}
                  onTaskClick={setSelectedTechnicalTask}
                  onRefresh={handleManualSync}
                  currentUserRole={currentUser?.role}
                  currentUserId={String((currentUser as any)?.authUid || currentUser?.id || '')}
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
            <div className="mx-auto max-w-4xl space-y-3">
              <div className="flex items-center justify-between"><div><h2 className="font-black text-zinc-900">Máy tôi đang chịu trách nhiệm</h2><p className="text-xs text-zinc-500">Đối chiếu theo task và tài khoản KTV được gắn với kho con</p></div><span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-800">{assignedDevices.length} máy</span></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {assignedDevices.map(device => <div key={device.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><div><p className="font-black text-zinc-900">{device.model} {device.storage}</p><p className="mt-1 font-mono text-xs text-zinc-500">IMEI: {device.imei}</p></div><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-600">{device.status}</span></div><p className="mt-3 text-xs text-zinc-600">Kho/vị trí: {String(device.currentLocationId || device.warehouseId || device.warehouse || 'Đang chờ nhận')}</p></div>)}
                {assignedDevices.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center"><Package className="mx-auto h-12 w-12 text-zinc-200" /><p className="mt-3 text-sm font-semibold text-zinc-500">Chưa có máy nào được giao cho tài khoản này.</p></div>}
              </div>
            </div>
          )}

          {activeTab === 'REPORT' && canViewRepairReport && (
            <div className="mx-auto max-w-5xl space-y-4">
              <div className="rounded-3xl bg-gradient-to-r from-zinc-900 to-orange-800 p-5 text-white shadow-lg"><p className="text-xs font-black uppercase tracking-wider text-orange-200">Báo cáo tiếp nhận sửa chữa</p><h2 className="mt-1 text-xl font-black">Doanh thu theo máy đã trả khách</h2><p className="mt-1 text-xs text-zinc-200">Chỉ tính phiếu đã bàn giao; số tiền đã thu được ghi trực tiếp vào quỹ đã chọn.</p><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><label className="text-xs font-bold">Từ ngày<input type="date" value={reportFrom} onChange={event => setReportFrom(event.target.value)} className="mt-1 block h-10 w-full rounded-xl border-0 px-3 text-zinc-900"/></label><label className="text-xs font-bold">Đến ngày<input type="date" value={reportTo} onChange={event => setReportTo(event.target.value)} className="mt-1 block h-10 w-full rounded-xl border-0 px-3 text-zinc-900"/></label><button onClick={() => void loadRepairReport()} disabled={repairReportLoading} className="self-end rounded-xl bg-white px-4 py-2.5 text-xs font-black text-orange-700 disabled:opacity-50"><RefreshCw className={`mr-1 inline h-3.5 w-3.5 ${repairReportLoading ? 'animate-spin' : ''}`}/>Xem báo cáo</button></div></div>
              {repairReportError && <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{repairReportError}</p>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold text-zinc-500">Máy đã trả</p><p className="mt-1 text-2xl font-black">{repairReport?.summary.deliveredCount || 0}</p></div><div className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold text-zinc-500">Doanh thu dịch vụ</p><p className="mt-1 text-lg font-black text-orange-700">{formatVND(repairReport?.summary.serviceRevenue || 0)}</p></div><div className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold text-zinc-500">Đã thu vào quỹ</p><p className="mt-1 text-lg font-black text-emerald-700">{formatVND(repairReport?.summary.cashCollected || 0)}</p></div><div className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold text-zinc-500">Còn khách nợ</p><p className="mt-1 text-lg font-black text-rose-700">{formatVND(repairReport?.summary.outstanding || 0)}</p></div></div>
              <section className="overflow-hidden rounded-3xl border bg-white"><div className="border-b p-4"><h3 className="font-black">Chi tiết từng phiếu</h3><p className="mt-1 text-xs text-zinc-500">{repairReport?.summary.warrantyCount || 0} phiếu bảo hành trong khoảng thời gian này.</p></div><div className="divide-y">{repairReport?.items.map(item => <article key={item.workOrderId} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]"><div><p className="font-black text-zinc-900">{item.model} <span className="font-mono text-xs text-zinc-500">· {item.imei || 'Không có IMEI'}</span></p><p className="mt-1 text-sm font-semibold text-zinc-700">{item.customerName} {item.customerPhone ? `· ${item.customerPhone}` : ''}</p><p className="mt-1 text-xs text-zinc-500">{item.code} · {item.deliveredAt ? new Date(item.deliveredAt).toLocaleString('vi-VN') : 'Chưa có thời gian'} · {item.type === 'WARRANTY' ? 'Bảo hành' : 'Sửa dịch vụ'}</p>{item.deliveryNotes && <p className="mt-2 text-xs text-zinc-600">{item.deliveryNotes}</p>}</div><div className="grid grid-cols-3 gap-3 text-right text-xs sm:block sm:space-y-1"><p><span className="block text-zinc-500">Tổng</span><strong>{formatVND(item.finalAmount)}</strong></p><p><span className="block text-zinc-500">Đã thu</span><strong className="text-emerald-700">{formatVND(item.paidAmount)}</strong></p><p><span className="block text-zinc-500">Còn nợ</span><strong className="text-rose-700">{formatVND(item.balanceDue)}</strong></p></div></article>)}{!repairReportLoading && !repairReport?.items.length && <p className="p-10 text-center text-sm text-zinc-500">Chưa có máy nào được bàn giao trong khoảng thời gian đã chọn.</p>}</div></section>
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
          <span className="text-[10px]">Điều phối</span>
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
        {canViewRepairReport && <button onClick={() => setActiveTab('REPORT')} className={`flex flex-col items-center justify-center w-20 h-full gap-1 transition-all cursor-pointer ${activeTab === 'REPORT' ? 'text-orange-600 font-bold' : 'text-zinc-400'}`}><DollarSign className={`w-5 h-5 ${activeTab === 'REPORT' ? 'scale-110' : ''}`} /><span className="text-[10px]">Doanh thu</span></button>}
        <button 
          onClick={() => setActiveTab('HR')}
          className={`flex flex-col items-center justify-center w-20 h-full gap-1 transition-all cursor-pointer ${activeTab === 'HR' ? 'text-orange-600 font-bold' : 'text-zinc-400'}`}
        >
          <Activity className={`w-5 h-5 ${activeTab === 'HR' ? 'scale-110' : ''}`} />
          <span className="text-[10px]">Chấm Công</span>
        </button>
      </div>
      {selectedHandoff && <div className="fixed inset-0 z-[155] grid place-items-center bg-black/60 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedHandoff(null); }}><section className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-zinc-900">Nhận bàn giao từ KTV khác</h3><p className="mt-1 text-xs text-zinc-500">IMEI {selectedHandoff.imei} · từ {selectedHandoff.fromTechnicianName || 'KTV trước'}</p></div><button onClick={() => setSelectedHandoff(null)} className="rounded-lg px-2 py-1 text-zinc-500">✕</button></div><div className="mt-4 space-y-3"><input value={handoffScan} onChange={event => setHandoffScan(event.target.value.replace(/\D/g, '').slice(0, 15))} placeholder="Quét IMEI thực nhận" className="h-11 w-full rounded-xl border px-3 font-mono text-sm"/><textarea value={handoffNotes} onChange={event => setHandoffNotes(event.target.value)} rows={3} placeholder="Tình trạng nhận máy và ghi chú" className="w-full rounded-xl border p-3 text-sm"/><label className="block rounded-xl border border-dashed p-4 text-xs font-bold">Ảnh máy lúc nhận trách nhiệm (không bắt buộc)<input type="file" accept="image/*" multiple onChange={event => setHandoffFiles(Array.from(event.target.files || []))} className="mt-2 block w-full text-xs"/></label><button disabled={isSyncing || handoffScan.length < 5} onClick={() => void acceptSelectedHandoff()} className="w-full rounded-xl bg-blue-700 py-3 text-sm font-black text-white disabled:opacity-40">Quét nhận và chịu trách nhiệm</button></div></section></div>}
      <TechnicalWorkOrderDrawer task={selectedTechnicalTask} warehouses={warehouses} funds={funds} currentUser={currentUser} onClose={() => setSelectedTechnicalTask(null)} onRefresh={handleManualSync} />
    </div>
  );
};

