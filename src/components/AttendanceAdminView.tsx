import React, { useState, useMemo } from 'react';
import { 
  StaffMember, 
  AttendanceRecord, 
  WeeklyShiftSchedule, 
  LeaveRequest, 
  CommissionTransaction, 
  MonthlyPayrollSlip,
  SalaryPolicy,
  PayrollLedgerItem,
  SalesInvoice,
  WarrantyTicket,
  StaffDualWalletSummary,
  StoreBranch
} from '../types';
import { 
  Users, 
  Clock, 
  Calendar, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  DollarSign, 
  Filter, 
  Plus, 
  Search, 
  Download, 
  Copy, 
  Sparkles, 
  ChevronRight, 
  Check, 
  X, 
  ShieldCheck, 
  Eye, 
  Printer, 
  Wrench, 
  TrendingUp, 
  Building2, 
  ChevronDown,
  Layers,
  Settings,
  Lock,
  Send,
  Sliders,
  CheckCheck,
  Monitor,
  RefreshCw,
  Smartphone,
  Package,
  Zap,
  ArrowUpRight,
  Wifi,
  Loader2
} from 'lucide-react';
import { 
  calculateStaffDualWallet, 
  syncCommissionsFromAllSources, 
  calculateInvoiceCommissions, 
  calculateWarrantyTicketCommissions 
} from '../utils/commissionEngine';
import { TechCommissionMatrixEditor } from './TechCommissionMatrixEditor';

interface AttendanceAdminViewProps {
  staffList: StaffMember[];
  todayAttendance: AttendanceRecord[];
  weeklySchedules: WeeklyShiftSchedule[];
  leaveRequests: LeaveRequest[];
  payrollSlips: MonthlyPayrollSlip[];
  policies: SalaryPolicy[];
  commissions: CommissionTransaction[];
  branches?: StoreBranch[];
  activeAdminTab?: 'OVERVIEW' | 'SHIFTS' | 'TIMESHEET' | 'PAYROLL' | 'TECH_COMMISSION' | 'APPROVAL' | 'POLICIES';
  onSelectAdminTab?: (tab: 'OVERVIEW' | 'SHIFTS' | 'TIMESHEET' | 'PAYROLL' | 'TECH_COMMISSION' | 'APPROVAL' | 'POLICIES') => void;
  onApproveLeave: (leaveId: string) => void;
  onAdvancePayrollApproval: (slipId: string, nextStep: number, approverName: string, notes: string) => void;
  onUpdateShift: (staffId: string, dateKey: string, shiftName: string) => void;
  onUpdatePolicy?: (updatedPolicy: SalaryPolicy) => void;
  invoices?: SalesInvoice[];
  warrantyTickets?: WarrantyTicket[];
}

export const AttendanceAdminView: React.FC<AttendanceAdminViewProps> = ({
  staffList,
  todayAttendance,
  weeklySchedules,
  leaveRequests,
  payrollSlips,
  policies,
  commissions,
  branches = [],
  activeAdminTab: controlledTab,
  onSelectAdminTab: setControlledTab,
  onApproveLeave,
  onAdvancePayrollApproval,
  onUpdateShift,
  onUpdatePolicy,
  invoices = [],
  warrantyTickets = []
}) => {
  
  // Real-time synced commissions across all tickets and invoices
  const allSyncedCommissions = useMemo(() => {
    return syncCommissionsFromAllSources(invoices, warrantyTickets, staffList, policies, commissions);
  }, [invoices, warrantyTickets, staffList, policies, commissions]);

  // Compute dual wallet for all staff members
  const staffDualWalletsMap = useMemo(() => {
    const map = new Map<string, StaffDualWalletSummary>();
    staffList.forEach(staff => {
      map.set(staff.id, calculateStaffDualWallet(staff.id, allSyncedCommissions, staffList));
    });
    return map;
  }, [staffList, allSyncedCommissions]);

  // Initial Calculated Slips populated with dual wallet figures
  const [calculatedSlips, setCalculatedSlips] = useState<MonthlyPayrollSlip[]>(() => {
    return staffList.map(staff => {
      const dual = calculateStaffDualWallet(staff.id, allSyncedCommissions, staffList);
      const policy = policies.find(p => p.role === staff.role) || policies[0];
      const baseSalary = policy?.baseSalary || 5000000;
      const allowance = (policy?.lunchAllowance || 500000) + (policy?.phoneAllowance || 200000);
      const deductions = 0;
      const totalCommission = dual.totalGrossCommission;
      const kpiBonus = dual.salesWallet.totalRevenue >= 100000000 ? 2000000 : 0;

      return {
        id: `SLIP-2026-08-${staff.id}`,
        employeeId: staff.id,
        employeeName: staff.name,
        employeeCode: staff.code || '',
        periodMonth: '08/2026',
        month: '08/2026',
        role: staff.role,
        roleTitle: staff.roleTitle || (staff.role === 'ADMIN' ? 'Chủ Cửa Hàng' : staff.role === 'MANAGER' ? 'Quản Lý' : staff.role === 'SALES' ? 'Nhân Viên Bán Hàng' : 'Kỹ Thuật Viên'),
        branchId: staff.branchId || 'CN01',
        branchName: staff.branchName || 'PhoneHouse Cầu Giấy',
        standardWorkDays: 26,
        actualWorkDays: 26,
        baseSalary: baseSalary,
        totalAllowance: allowance,
        allowances: [
          { name: 'Phụ cấp ăn trưa', amount: policy?.lunchAllowance || 500000 },
          { name: 'Phụ cấp điện thoại & xăng xe', amount: policy?.phoneAllowance || 200000 }
        ],
        kpiBonus: kpiBonus,
        totalCommission: totalCommission,
        commissions: dual.techWallet.transactions.concat(dual.salesWallet.transactions),
        overtimePay: 0,
        totalDeductions: deductions,
        deductions: [],
        netPay: baseSalary + allowance + totalCommission + kpiBonus - deductions,
        status: 'DRAFT',
        approvalStep: 1,
        approvalSteps: []
      } as unknown as MonthlyPayrollSlip;
    });
  });

  const [isCalculating, setIsCalculating] = useState(false);
  const [selectedSlipDetail, setSelectedSlipDetail] = useState<{
    slip: MonthlyPayrollSlip;
    wallet: StaffDualWalletSummary;
  } | null>(null);

  const [commissionViewMode, setCommissionViewMode] = useState<'MATRIX_CONFIG' | 'TECH_WALLET' | 'SALES_WALLET' | 'DUAL_COMBINED'>('MATRIX_CONFIG');

  const handleCalculatePayroll = () => {
    setIsCalculating(true);
    setTimeout(() => {
      const newSlips = staffList.map(staff => {
        const dual = staffDualWalletsMap.get(staff.id) || calculateStaffDualWallet(staff.id, allSyncedCommissions, staffList);
        const policy = policies.find(p => p.role === staff.role) || policies[0];
        const baseSalary = policy?.baseSalary || 5000000;
        const allowance = (policy?.lunchAllowance || 500000) + (policy?.phoneAllowance || 200000);
        const deductions = 0; // Khấu trừ đi trễ (nếu có)
        const totalCommission = dual.totalGrossCommission;
        const kpiBonus = dual.salesWallet.totalRevenue >= 100000000 ? 2000000 : 0;
        
        return {
          id: `SLIP-${Date.now()}-${staff.id}`,
          employeeId: staff.id,
          employeeName: staff.name,
          employeeCode: staff.code || '',
          periodMonth: '08/2026',
          month: '08/2026',
          role: staff.role,
          roleTitle: staff.roleTitle || (staff.role === 'ADMIN' ? 'Chủ Cửa Hàng' : staff.role === 'MANAGER' ? 'Quản Lý' : staff.role === 'SALES' ? 'Nhân Viên Bán Hàng' : 'Kỹ Thuật Viên'),
          branchId: staff.branchId || 'CN01',
          branchName: staff.branchName || 'PhoneHouse Cầu Giấy',
          standardWorkDays: 26,
          actualWorkDays: 26,
          baseSalary: baseSalary,
          totalAllowance: allowance,
          allowances: [
            { name: 'Phụ cấp ăn trưa', amount: policy?.lunchAllowance || 500000 },
            { name: 'Phụ cấp điện thoại & xăng xe', amount: policy?.phoneAllowance || 200000 }
          ],
          kpiBonus: kpiBonus,
          totalCommission: totalCommission,
          commissions: dual.techWallet.transactions.concat(dual.salesWallet.transactions),
          overtimePay: 0,
          totalDeductions: deductions,
          deductions: [],
          netPay: baseSalary + allowance + totalCommission + kpiBonus - deductions,
          status: 'DRAFT',
          approvalStep: 1,
          approvalSteps: []
        } as unknown as MonthlyPayrollSlip;
      });
      setCalculatedSlips(newSlips);
      setIsCalculating(false);
    }, 800);
  };

  // Admin Tabs
  const [internalAdminTab, setInternalAdminTab] = useState<'OVERVIEW' | 'SHIFTS' | 'TIMESHEET' | 'PAYROLL' | 'TECH_COMMISSION' | 'APPROVAL' | 'POLICIES'>('OVERVIEW');
  const adminTab = controlledTab || internalAdminTab;
  const setAdminTab = setControlledTab || setInternalAdminTab;
  
  // Selected Branch Filter
  const [selectedBranch, setSelectedBranch] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-08');

  // Selected Staff for Drawer view
  const [selectedStaffTimesheet, setSelectedStaffTimesheet] = useState<StaffMember | null>(null);
  const [selectedPayrollSlip, setSelectedPayrollSlip] = useState<MonthlyPayrollSlip | null>(null);

  // Policy Editor Modal State
  const [editingPolicy, setEditingPolicy] = useState<SalaryPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState<SalaryPolicy | null>(null);
  const [policySaveSuccess, setPolicySaveSuccess] = useState<boolean>(false);

  const handleOpenEditPolicy = (pol: SalaryPolicy) => {
    setEditingPolicy(pol);
    setPolicyForm(JSON.parse(JSON.stringify(pol)));
    setPolicySaveSuccess(false);
  };

  const handleSavePolicy = () => {
    if (!policyForm) return;
    if (onUpdatePolicy) {
      onUpdatePolicy(policyForm);
    }
    setPolicySaveSuccess(true);
    setTimeout(() => {
      setEditingPolicy(null);
      setPolicyForm(null);
      setPolicySaveSuccess(false);
    }, 900);
  };

  // Filtered Today Attendance
  const activeCount = todayAttendance.filter(a => a.status === 'IN_PROGRESS' || a.status === 'COMPLETED').length;
  const lateCount = todayAttendance.filter(a => a.status === 'LATE' || a.lateMinutes > 0).length;
  const absentCount = staffList.length - todayAttendance.length;
  const outsideCount = todayAttendance.filter(a => a.currentActivity === 'OUTSIDE' || a.currentActivity === 'DELIVERY').length;

  return (
    <div className="space-y-6">
      
      {/* TOP HEADER & ADMIN SUB-NAV */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
            <Building2 className="w-3.5 h-3.5 text-[#FF4B16]" />
            <span>Quản trị Nhân sự & Tiền lương PhoneHouse</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-zinc-900 mt-0.5">
            Quản Lý Chấm Công, Ca Làm & Tính Lương
          </h1>
        </div>

        {/* Global Branch & Month Selectors */}
        <div className="flex items-center space-x-2">
          <select 
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800"
          >
            <option value="ALL">Tất cả chi nhánh</option>
            {branches.map(br => (
              <option key={br.id} value={br.id}>{br.name}</option>
            ))}
          </select>

          <select 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800"
          >
            <option value="2026-08">Kỳ lương 08/2026</option>
            <option value="2026-07">Kỳ lương 07/2026</option>
          </select>
        </div>
      </div>

      {/* ADMIN NAVIGATION TABS */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 border-b border-zinc-200 text-xs font-bold">
        {[
          { id: 'OVERVIEW', label: 'Tổng Quan Chấm Công', icon: Clock },
          { id: 'SHIFTS', label: 'Ma Trận Xếp Ca Tuần', icon: Calendar },
          { id: 'TIMESHEET', label: 'Bảng Công Tháng', icon: FileText },
          { id: 'PAYROLL', label: 'Bảng Lương & Hoa Hồng', icon: DollarSign },
          { id: 'TECH_COMMISSION', label: 'Hoa hồng Kỹ thuật', icon: Monitor },
          { id: 'APPROVAL', label: 'Quy Trình Duyệt Lương', icon: CheckCheck },
          { id: 'POLICIES', label: 'Cấu Hình Chính Sách Lương', icon: Sliders },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = adminTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setAdminTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                isActive 
                  ? 'bg-[#FF4B16] text-white shadow-xs font-extrabold' 
                  : 'bg-white text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* SECTION 1: TỔNG QUAN CHẤM CÔNG HÔM NAY (SCREEN 16) */}
      {/* ======================================================== */}
      {adminTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* 4 CORE KPI CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
              <div className="text-xs font-bold text-zinc-400 uppercase">Đã vào ca</div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-600 mt-1">
                {activeCount} / {staffList.length}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>80% quân số đúng giờ</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
              <div className="text-xs font-bold text-zinc-400 uppercase">Đi trễ</div>
              <div className="text-2xl sm:text-3xl font-black text-[#FF4B16] mt-1">
                {lateCount}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-orange-500" />
                <span>Muộn trung bình 12 phút</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
              <div className="text-xs font-bold text-zinc-400 uppercase">Vắng / Nghỉ</div>
              <div className="text-2xl sm:text-3xl font-black text-zinc-800 mt-1">
                {absentCount > 0 ? absentCount : 0}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 flex items-center space-x-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>1 có phép, 0 không phép</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
              <div className="text-xs font-bold text-zinc-400 uppercase">Ra ngoài / Đi ship</div>
              <div className="text-2xl sm:text-3xl font-black text-orange-600 mt-1">
                {outsideCount}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-orange-500" />
                <span>Đang giao hàng cho khách VIP</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* NHÂN VIÊN ĐANG LÀM VIỆC (TABLE) */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
                  Danh sách nhân sự đang trong ca (Realtime)
                </h3>
                <span className="text-xs text-zinc-400">Cập nhật tự động mỗi 30s</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 text-zinc-500 font-bold uppercase text-[10px] border-y border-zinc-200/60">
                    <tr>
                      <th className="py-2.5 px-3">Nhân viên</th>
                      <th className="py-2.5 px-3">Ca làm</th>
                      <th className="py-2.5 px-3">Giờ vào</th>
                      <th className="py-2.5 px-3">Trạng thái</th>
                      <th className="py-2.5 px-3">Vị trí</th>
                      <th className="py-2.5 px-3">Thời gian làm</th>
                      <th className="py-2.5 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {todayAttendance.map((rec) => (
                      <tr key={rec.id} className="hover:bg-zinc-50/80 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-zinc-900">{rec.staffName}</div>
                          <div className="text-[10px] text-zinc-400">{rec.role}</div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-zinc-700">{rec.shiftName}</td>
                        <td className="py-3 px-3 font-mono font-bold text-zinc-800">{rec.checkInTime}</td>
                        <td className="py-3 px-3">
                          {rec.status === 'LATE' ? (
                            <span className="bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Đi trễ {rec.lateMinutes}m
                            </span>
                          ) : (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Đúng giờ
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center space-x-1 text-zinc-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span>GPS Khớp</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-zinc-900">
                          {Math.floor(rec.workDurationMinutes / 60)}h {rec.workDurationMinutes % 60}m
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => {
                              const s = staffList.find(st => st.id === rec.staffId);
                              if (s) setSelectedStaffTimesheet(s);
                            }}
                            className="text-[11px] font-bold text-[#FF4B16] hover:underline"
                          >
                            Chi tiết
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CẢNH BÁO TỰ ĐỘNG & TIẾN ĐỘ DOANH SỐ */}
            <div className="space-y-4">
              {/* CẢNH BÁO PANEL */}
              <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
                <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>Cảnh báo chấm công</span>
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-orange-50/70 border border-orange-100 text-orange-950 font-medium">
                    ⚠️ <strong>1 nhân viên đi trễ</strong> ({todayAttendance.find(a => a.status === 'LATE')?.staffName || 'Trần Thị B'})
                  </div>
                  <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-800 font-medium">
                    📍 <strong>0 trường hợp</strong> rời khỏi vùng GPS cho phép
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100 text-blue-900 font-medium">
                    🛵 <strong>1 nhân viên</strong> đang ra ngoài giao máy iPhone cho khách
                  </div>
                </div>
              </div>

              {/* TỶ LỆ HOÀN THÀNH KPI HÔM NAY */}
              <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
                <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider mb-3">
                  Tỷ lệ hoàn thành KPI hôm nay
                </h3>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-zinc-50 p-2.5 rounded-xl">
                    <div className="text-base font-black text-[#FF4B16]">62%</div>
                    <div className="text-[10px] text-zinc-400 font-bold mt-0.5">Doanh số</div>
                    <div className="text-[10px] text-zinc-700 mt-1 font-bold">12.5M/20M</div>
                  </div>
                  <div className="bg-zinc-50 p-2.5 rounded-xl">
                    <div className="text-base font-black text-[#FF4B16]">60%</div>
                    <div className="text-[10px] text-zinc-400 font-bold mt-0.5">Số đơn</div>
                    <div className="text-[10px] text-zinc-700 mt-1 font-bold">6 / 10</div>
                  </div>
                  <div className="bg-zinc-50 p-2.5 rounded-xl">
                    <div className="text-base font-black text-emerald-600">53%</div>
                    <div className="text-[10px] text-zinc-400 font-bold mt-0.5">Tư vấn</div>
                    <div className="text-[10px] text-zinc-700 mt-1 font-bold">8 / 15</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 2: MA TRẬN XẾP CA TUẦN (SCREEN 17) */}
      {/* ======================================================== */}
      {adminTab === 'SHIFTS' && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
                Lịch làm việc tuần (11/05 – 17/05/2026)
              </h3>
              <p className="text-xs text-zinc-500">Kéo thả hoặc click vào ô để đổi ca cho nhân viên</p>
            </div>

            <div className="flex items-center space-x-2">
              <button 
                onClick={() => alert('Đã sao chép lịch tuần trước thành công!')}
                className="px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold flex items-center space-x-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Sao chép tuần trước</span>
              </button>

              <button 
                onClick={() => alert('AI Auto-scheduler: Đã tối ưu hóa chia ca cân bằng 26 công/người!')}
                className="px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold flex items-center space-x-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>Xếp tự động AI</span>
              </button>

              <button 
                onClick={() => alert('Đang xuất bảng ca Excel...')}
                className="px-3 py-2 rounded-xl bg-[#FF4B16] hover:bg-[#E94312] text-white text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Xuất Excel</span>
              </button>
            </div>
          </div>

          {/* WEEKLY MATRIX GRID */}
          <div className="overflow-x-auto">
            <table className="w-full text-center text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-100 text-zinc-700 font-bold uppercase text-[11px]">
                  <th className="py-3 px-4 text-left border border-zinc-200">Nhân viên</th>
                  <th className="py-3 px-2 border border-zinc-200">T2 (11)</th>
                  <th className="py-3 px-2 border border-zinc-200">T3 (12)</th>
                  <th className="py-3 px-2 border border-zinc-200">T4 (13)</th>
                  <th className="py-3 px-2 border border-zinc-200">T5 (14)</th>
                  <th className="py-3 px-2 border border-zinc-200">T6 (15)</th>
                  <th className="py-3 px-2 border border-zinc-200 bg-orange-100/60 text-[#FF4B16]">T7 (16)</th>
                  <th className="py-3 px-2 border border-zinc-200">CN (17)</th>
                </tr>
              </thead>
              <tbody>
                {weeklySchedules.map((sch) => (
                  <tr key={sch.id} className="hover:bg-zinc-50/50">
                    <td className="py-3 px-4 text-left font-bold text-zinc-900 border border-zinc-200 bg-white">
                      <div>{sch.staffName}</div>
                      <div className="text-[10px] text-zinc-400 font-normal">{sch.role}</div>
                    </td>

                    {['2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14', '2026-05-15', '2026-05-16', '2026-05-17'].map(dKey => {
                      const day = sch.days[dKey];
                      const shiftName = day ? day.shiftName : 'Nghỉ';
                      
                      let badgeStyle = 'bg-zinc-100 text-zinc-500';
                      if (shiftName === 'Ca sáng') badgeStyle = 'bg-orange-100 text-orange-900 border border-orange-200 font-bold';
                      if (shiftName === 'Ca chiều') badgeStyle = 'bg-blue-100 text-blue-900 border border-blue-200 font-bold';
                      if (shiftName === 'Ca tối') badgeStyle = 'bg-purple-100 text-purple-900 border border-purple-200 font-bold';

                      return (
                        <td key={dKey} className="py-2.5 px-2 border border-zinc-200">
                          <button
                            onClick={() => {
                              const nextShift = shiftName === 'Ca sáng' ? 'Ca chiều' : shiftName === 'Ca chiều' ? 'Ca tối' : shiftName === 'Ca tối' ? 'Nghỉ' : 'Ca sáng';
                              onUpdateShift(sch.staffId, dKey, nextShift);
                            }}
                            className={`w-full py-1.5 px-2 rounded-lg text-xs transition-all cursor-pointer ${badgeStyle}`}
                            title="Click để đổi nhanh ca làm"
                          >
                            {shiftName}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 3: BẢNG CÔNG THÁNG (TIMESHEET) (SCREEN 18) */}
      {/* ======================================================== */}
      {adminTab === 'TIMESHEET' && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
                Bảng chấm công tổng hợp Tháng 08/2026
              </h3>
              <p className="text-xs text-zinc-500">Chốt công thực tế, tính số phút đi muộn & giờ tăng ca OT</p>
            </div>

            <button 
              onClick={() => alert('Đang xuất bảng công tháng sang Excel...')}
              className="px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold flex items-center space-x-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Bảng Công</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-500 font-bold uppercase text-[10px] border-y border-zinc-200/60">
                <tr>
                  <th className="py-2.5 px-3">Nhân viên</th>
                  <th className="py-2.5 px-3 text-center">Công chuẩn</th>
                  <th className="py-2.5 px-3 text-center">Công thực tế</th>
                  <th className="py-2.5 px-3 text-center">Đi trễ (phút)</th>
                  <th className="py-2.5 px-3 text-center">Tăng ca (giờ)</th>
                  <th className="py-2.5 px-3 text-center">Nghỉ phép</th>
                  <th className="py-2.5 px-3 text-center">Thiếu công</th>
                  <th className="py-2.5 px-3 text-center">Trạng thái</th>
                  <th className="py-2.5 px-3 text-right">Xem chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {payrollSlips.map(slip => (
                  <tr key={slip.id} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-bold text-zinc-900">{slip.employeeName}</div>
                      <div className="text-[10px] text-zinc-400">{slip.roleTitle}</div>
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-zinc-700">{slip.standardWorkDays}</td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-600">{slip.actualWorkDays}</td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-orange-600">
                      {slip.lateMinutesTotal > 0 ? `${slip.lateMinutesTotal}m` : '0'}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-purple-600">
                      {slip.otHoursTotal}h
                    </td>
                    <td className="py-3 px-3 text-center text-zinc-600">0.5</td>
                    <td className="py-3 px-3 text-center text-zinc-600">0</td>
                    <td className="py-3 px-3 text-center">
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Đủ công
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => {
                          const s = staffList.find(st => st.id === slip.employeeId);
                          if (s) setSelectedStaffTimesheet(s);
                        }}
                        className="text-[11px] font-bold text-[#FF4B16] hover:underline"
                      >
                        Lịch sử ngày &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 4: BẢNG LƯƠNG & HOA HỒNG (PAYROLL) (PHASE 3 DUAL WALLET) */}
      {/* ======================================================== */}
      {adminTab === 'PAYROLL' && (
        <div className="space-y-4">
          {/* SUMMARY CARDS DYNAMICALLY COMPUTED */}
          {(() => {
            const totalBase = calculatedSlips.reduce((sum, s) => sum + s.baseSalary, 0);
            const totalTechComm = staffList.reduce((sum, s) => {
              const w = staffDualWalletsMap.get(s.id);
              return sum + (w?.techWallet.totalCommission || 0);
            }, 0);
            const totalSalesComm = staffList.reduce((sum, s) => {
              const w = staffDualWalletsMap.get(s.id);
              return sum + (w?.salesWallet.totalCommission || 0);
            }, 0);
            const totalNet = calculatedSlips.reduce((sum, s) => sum + s.netPay, 0);

            return (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Tổng Lương Cơ Bản</div>
                  <div className="text-lg sm:text-xl font-black text-zinc-900 mt-1 font-mono">
                    {totalBase.toLocaleString()} đ
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-orange-600 uppercase flex items-center gap-1">
                    <Wrench className="w-3 h-3" /> Ví Kỹ Thuật (KCS & Sửa)
                  </div>
                  <div className="text-lg sm:text-xl font-black text-orange-600 mt-1 font-mono">
                    +{totalTechComm.toLocaleString()} đ
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1">
                    <Smartphone className="w-3 h-3" /> Ví Doanh Thu (Bán Máy)
                  </div>
                  <div className="text-lg sm:text-xl font-black text-emerald-600 mt-1 font-mono">
                    +{totalSalesComm.toLocaleString()} đ
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
                  <div className="text-[10px] font-bold text-purple-600 uppercase">Tổng Hoa Hồng KPI</div>
                  <div className="text-lg sm:text-xl font-black text-purple-600 mt-1 font-mono">
                    +{(totalTechComm + totalSalesComm).toLocaleString()} đ
                  </div>
                </div>
                <div className="bg-zinc-900 text-white p-4 rounded-2xl shadow-md">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Tổng Thực Chi Chuyển Khoản</div>
                  <div className="text-lg sm:text-xl font-black text-[#FF4B16] mt-1 font-mono">
                    {totalNet.toLocaleString()} đ
                  </div>
                </div>
              </div>
            );
          })()}

          {/* MAIN PAYROLL TABLE */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wider flex items-center gap-2">
                  <span>Bảng chi tiết lương & Ví Kép tháng {selectedMonth}</span>
                  <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                    Dual Wallet Ready
                  </span>
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Phân tách độc lập Ví Kỹ Thuật (từ Phiếu bảo hành/KCS) và Ví Doanh Thu (từ Hóa đơn POS)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCalculatePayroll}
                  disabled={isCalculating}
                  className="px-4 py-2 bg-[#FF4B16] hover:bg-[#E03D0D] text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCalculating ? 'animate-spin' : ''}`} />
                  <span>{isCalculating ? 'Đang tự động gom...' : '⚡ Tính Lương & Quét Ví Toàn Hệ Thống'}</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-500 font-bold uppercase text-[10px] border-y border-zinc-200/60">
                  <tr>
                    <th className="py-3 px-3">Nhân viên</th>
                    <th className="py-3 px-3 text-right">Lương cứng</th>
                    <th className="py-3 px-3 text-right">Phụ cấp</th>
                    <th className="py-3 px-3 text-right text-orange-600">Ví Kỹ Thuật</th>
                    <th className="py-3 px-3 text-right text-emerald-600">Ví Doanh Thu</th>
                    <th className="py-3 px-3 text-right">Tổng Hoa Hồng</th>
                    <th className="py-3 px-3 text-right">Thực lĩnh</th>
                    <th className="py-3 px-3 text-center">Trạng thái</th>
                    <th className="py-3 px-3 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {calculatedSlips.map(slip => {
                    const wallet = staffDualWalletsMap.get(slip.employeeId) || calculateStaffDualWallet(slip.employeeId, allSyncedCommissions, staffList);
                    return (
                      <tr key={slip.id} className="hover:bg-zinc-50/80 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-zinc-900">{slip.employeeName}</div>
                          <div className="text-[10px] text-zinc-400 font-medium">{slip.roleTitle}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-medium font-mono">{slip.baseSalary.toLocaleString()} đ</td>
                        <td className="py-3 px-3 text-right text-zinc-600 font-mono">{slip.totalAllowance.toLocaleString()} đ</td>
                        <td className="py-3 px-3 text-right font-bold text-orange-600 font-mono">
                          +{wallet.techWallet.totalCommission.toLocaleString()} đ
                          <div className="text-[9px] text-zinc-400 font-normal font-sans">
                            {wallet.techWallet.completedTicketCount} ca KCS/Sửa
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-600 font-mono">
                          +{wallet.salesWallet.totalCommission.toLocaleString()} đ
                          <div className="text-[9px] text-zinc-400 font-normal font-sans">
                            {wallet.salesWallet.completedOrderCount} đơn POS
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-black text-purple-600 font-mono">
                          +{slip.totalCommission.toLocaleString()} đ
                        </td>
                        <td className="py-3 px-3 text-right font-black text-[#FF4B16] text-sm font-mono">
                          {slip.netPay.toLocaleString()} đ
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            {slip.status === 'DRAFT' ? 'Chờ CHT duyệt' : slip.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => setSelectedSlipDetail({ slip, wallet })}
                            className="px-2.5 py-1 bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-600 text-zinc-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            Xem Sổ Ví &rarr;
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 4.5: PHÂN TÍCH HOA HỒNG KỸ THUẬT & DOANH THU (PHASE 3) */}
      {/* ======================================================== */}
      {adminTab === 'TECH_COMMISSION' && (
        <div className="space-y-4 animate-fadeIn">
          {/* TOGGLE SUB-VIEW */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-zinc-200 shadow-2xs">
            <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-xl">
              <button
                onClick={() => setCommissionViewMode('MATRIX_CONFIG')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  commissionViewMode === 'MATRIX_CONFIG' ? 'bg-amber-500 text-white shadow-2xs font-black' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                📋 Ma Trận Đơn Giá & Quy Chế KTV
              </button>
              <button
                onClick={() => setCommissionViewMode('TECH_WALLET')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  commissionViewMode === 'TECH_WALLET' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                🛠️ Ví Hoa Hồng Kỹ Thuật (Thực tế)
              </button>
              <button
                onClick={() => setCommissionViewMode('SALES_WALLET')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  commissionViewMode === 'SALES_WALLET' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                📱 Ví Doanh Số Bán Hàng (POS)
              </button>
              <button
                onClick={() => setCommissionViewMode('DUAL_COMBINED')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  commissionViewMode === 'DUAL_COMBINED' ? 'bg-zinc-900 text-white shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                ⚡ Bảng Kê Tổng Hợp Cả 2 Ví
              </button>
            </div>

            <div className="text-xs text-zinc-500 font-medium">
              Đồng bộ thực: {warrantyTickets.length} phiếu sửa chữa • {invoices.length} hóa đơn bán hàng
            </div>
          </div>

          {/* 1. MATRIX & COMPENSATION CONFIG COMPONENT */}
          {commissionViewMode === 'MATRIX_CONFIG' && (
            <TechCommissionMatrixEditor 
              onMatrixUpdated={() => {
                // Trigger recalculation
                handleCalculatePayroll();
              }}
            />
          )}

          {/* DYNAMIC METRIC CARDS */}
          {commissionViewMode === 'TECH_WALLET' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
                <div className="text-[10px] font-bold text-zinc-400 uppercase">Kỹ thuật viên đang làm</div>
                <div className="text-lg sm:text-xl font-black text-zinc-900 mt-1">
                  {staffList.filter(s => s.role.includes('TECH') || s.role.includes('STORE_MANAGER')).length} nhân sự
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
                <div className="text-[10px] font-bold text-orange-600 uppercase">KCS Kiểm Định Máy Nhập</div>
                <div className="text-lg sm:text-xl font-black text-orange-600 mt-1 font-mono">
                  {allSyncedCommissions.filter(c => c.type === 'TECH_KCS').length} máy
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
                <div className="text-[10px] font-bold text-amber-600 uppercase">Sửa Chữa & Thay Linh Kiện</div>
                <div className="text-lg sm:text-xl font-black text-amber-600 mt-1 font-mono">
                  {allSyncedCommissions.filter(c => c.type === 'TECH_REPAIR' || c.type === 'TECH_WARRANTY').length} ca
                </div>
              </div>
              <div className="bg-indigo-950 text-white p-4 rounded-2xl shadow-md">
                <div className="text-[10px] font-bold text-indigo-300 uppercase">Tổng Quỹ Ví Kỹ Thuật</div>
                <div className="text-lg sm:text-xl font-black text-amber-400 mt-1 font-mono">
                  {allSyncedCommissions.filter(c => c.walletCategory === 'TECH_WALLET').reduce((sum, c) => sum + c.commissionAmount, 0).toLocaleString()} đ
                </div>
              </div>
            </div>
          )}

          {commissionViewMode === 'SALES_WALLET' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
                <div className="text-[10px] font-bold text-zinc-400 uppercase">Chuyên Viên Tư Vấn</div>
                <div className="text-lg sm:text-xl font-black text-zinc-900 mt-1">
                  {staffList.filter(s => s.role.includes('SALES') || s.role.includes('MANAGER')).length} nhân sự
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
                <div className="text-[10px] font-bold text-emerald-600 uppercase">Đơn Hàng Máy iPhone/iPad</div>
                <div className="text-lg sm:text-xl font-black text-emerald-600 mt-1 font-mono">
                  {allSyncedCommissions.filter(c => c.type === 'SALES_PHONE').length} máy
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
                <div className="text-[10px] font-bold text-orange-600 uppercase">Phụ Kiện & Gói Care</div>
                <div className="text-lg sm:text-xl font-black text-orange-600 mt-1 font-mono">
                  {allSyncedCommissions.filter(c => c.type === 'SALES_ACCESSORY' || c.type === 'CARE_PACKAGE').length} món
                </div>
              </div>
              <div className="bg-emerald-950 text-white p-4 rounded-2xl shadow-md">
                <div className="text-[10px] font-bold text-emerald-300 uppercase">Tổng Quỹ Ví Doanh Thu</div>
                <div className="text-lg sm:text-xl font-black text-emerald-300 mt-1 font-mono">
                  {allSyncedCommissions.filter(c => c.walletCategory === 'SALES_WALLET').reduce((sum, c) => sum + c.commissionAmount, 0).toLocaleString()} đ
                </div>
              </div>
            </div>
          )}

          {/* DETAILED LEDGER TABLE */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
                Bảng Kê Chi Tiết Thu Nhập Theo Nhân Sự Tháng {selectedMonth}
              </h3>
              <span className="text-xs font-bold text-emerald-600">✓ Tự động liên kết Realtime</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-500 font-bold uppercase text-[10px] border-y border-zinc-200/60">
                  <tr>
                    <th className="py-2.5 px-3">Nhân sự</th>
                    <th className="py-2.5 px-3 text-center">Kiểm định KCS</th>
                    <th className="py-2.5 px-3 text-center">Sửa chữa & BH</th>
                    <th className="py-2.5 px-3 text-center">Bán máy POS</th>
                    <th className="py-2.5 px-3 text-center">Phụ kiện & Care</th>
                    <th className="py-2.5 px-3 text-right">Ví Kỹ Thuật</th>
                    <th className="py-2.5 px-3 text-right">Ví Doanh Thu</th>
                    <th className="py-2.5 px-3 text-right">Tổng Vào Ví</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {staffList.map((staff) => {
                    const wallet = staffDualWalletsMap.get(staff.id) || calculateStaffDualWallet(staff.id, allSyncedCommissions, staffList);
                    const tech = wallet.techWallet;
                    const sales = wallet.salesWallet;

                    return (
                      <tr key={staff.id} className="hover:bg-zinc-50/80 transition-colors">
                        <td className="py-3 px-3 font-bold text-zinc-900">
                          <div>{staff.name}</div>
                          <div className="text-[10px] text-zinc-400 font-normal">{staff.roleTitle || staff.role}</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="font-semibold text-orange-600">{tech.kcsCount} máy</div>
                          <div className="text-[10px] text-zinc-400 font-mono">+{tech.kcsAmount.toLocaleString()} đ</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="font-semibold text-amber-600">{tech.repairCount + tech.warrantyCount} ca</div>
                          <div className="text-[10px] text-zinc-400 font-mono">+{(tech.repairAmount + tech.warrantyAmount).toLocaleString()} đ</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="font-semibold text-emerald-600">{sales.deviceOrderCount || 0} máy</div>
                          <div className="text-[10px] text-zinc-400 font-mono">+{(sales.deviceAmount ?? sales.deviceCommission ?? 0).toLocaleString()} đ</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="font-semibold text-orange-600">{(sales.accessoryOrderCount || 0) + (sales.carePackageCount || 0)} món</div>
                          <div className="text-[10px] text-zinc-400 font-mono">+{((sales.accessoryAmount ?? sales.accessoryCommission ?? 0) + (sales.carePackageAmount ?? sales.carePackageCommission ?? 0)).toLocaleString()} đ</div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-orange-600">
                          {tech.totalCommission.toLocaleString()} đ
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                          {sales.totalCommission.toLocaleString()} đ
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-purple-600 text-sm">
                          {wallet.totalGrossCommission.toLocaleString()} đ
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CHI TIẾT SỔ VÍ KÉP (DUAL WALLET INSPECTOR) */}
      {/* ======================================================== */}
      {selectedSlipDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-orange-200 animate-in fade-in space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div>
                <h3 className="font-black text-base text-zinc-900 flex items-center gap-2">
                  <span>Sổ Chi Tiết Ví Thu Nhập & Lương</span>
                  <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {selectedSlipDetail.slip.periodMonth}
                  </span>
                </h3>
                <p className="text-xs text-zinc-500">
                  Nhân viên: <strong>{selectedSlipDetail.slip.employeeName}</strong> ({selectedSlipDetail.slip.roleTitle})
                </p>
              </div>
              <button
                onClick={() => setSelectedSlipDetail(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 2 WALLETS SUMMARY BOXES */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Tech Wallet Box */}
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4 text-orange-600" /> Ví Kỹ Thuật & KCS
                  </span>
                  <span className="text-sm font-black font-mono text-blue-700">
                    +{selectedSlipDetail.wallet.techWallet.totalCommission.toLocaleString()} đ
                  </span>
                </div>
                <div className="text-[11px] text-blue-950 space-y-1">
                  <div className="flex justify-between">
                    <span>KCS Máy Nhập:</span>
                    <strong>{selectedSlipDetail.wallet.techWallet.kcsCount} máy ({selectedSlipDetail.wallet.techWallet.kcsAmount.toLocaleString()} đ)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Sửa chữa / Linh kiện:</span>
                    <strong>{selectedSlipDetail.wallet.techWallet.repairCount} ca ({selectedSlipDetail.wallet.techWallet.repairAmount.toLocaleString()} đ)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Bảo hành tiêu chuẩn:</span>
                    <strong>{selectedSlipDetail.wallet.techWallet.warrantyCount} máy ({selectedSlipDetail.wallet.techWallet.warrantyAmount.toLocaleString()} đ)</strong>
                  </div>
                </div>
              </div>

              {/* Sales Wallet Box */}
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-600" /> Ví Doanh Thu Bán Hàng
                  </span>
                  <span className="text-sm font-black font-mono text-emerald-700">
                    +{selectedSlipDetail.wallet.salesWallet.totalCommission.toLocaleString()} đ
                  </span>
                </div>
                <div className="text-[11px] text-emerald-950 space-y-1">
                  <div className="flex justify-between">
                    <span>Hoa hồng bán máy:</span>
                    <strong>{selectedSlipDetail.wallet.salesWallet.deviceOrderCount || 0} máy ({(selectedSlipDetail.wallet.salesWallet.deviceAmount ?? selectedSlipDetail.wallet.salesWallet.deviceCommission ?? 0).toLocaleString()} đ)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Hoa hồng Phụ kiện:</span>
                    <strong>{selectedSlipDetail.wallet.salesWallet.accessoryOrderCount || 0} món ({(selectedSlipDetail.wallet.salesWallet.accessoryAmount ?? selectedSlipDetail.wallet.salesWallet.accessoryCommission ?? 0).toLocaleString()} đ)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Gói Bảo Hành VIP Care:</span>
                    <strong>{selectedSlipDetail.wallet.salesWallet.carePackageCount || 0} gói ({(selectedSlipDetail.wallet.salesWallet.carePackageAmount ?? selectedSlipDetail.wallet.salesWallet.carePackageCommission ?? 0).toLocaleString()} đ)</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* TOTAL PAYOUT BREAKDOWN */}
            <div className="p-4 bg-zinc-900 text-white rounded-2xl space-y-2">
              <div className="text-xs font-bold text-zinc-400 uppercase">Tổng Thu Nhập & Thực Lĩnh Tháng</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 border-t border-zinc-800">
                <div>
                  <span className="text-zinc-400">Lương cứng:</span>
                  <div className="font-bold font-mono text-zinc-200">{selectedSlipDetail.slip.baseSalary.toLocaleString()} đ</div>
                </div>
                <div>
                  <span className="text-zinc-400">Phụ cấp:</span>
                  <div className="font-bold font-mono text-zinc-200">{selectedSlipDetail.slip.totalAllowance.toLocaleString()} đ</div>
                </div>
                <div>
                  <span className="text-zinc-400">Tổng Hoa Hồng:</span>
                  <div className="font-bold font-mono text-emerald-400">+{selectedSlipDetail.wallet.totalGrossCommission.toLocaleString()} đ</div>
                </div>
                <div>
                  <span className="text-zinc-400">Thực Lĩnh:</span>
                  <div className="font-black font-mono text-[#FF4B16] text-sm">{selectedSlipDetail.slip.netPay.toLocaleString()} đ</div>
                </div>
              </div>
            </div>

            {/* TRANSACTION HISTORY LEDGER */}
            <div className="space-y-2">
              <h4 className="font-black text-xs text-zinc-900 uppercase">Nhật Ký Các Đơn & Phiếu Tạo Ra Thu Nhập</h4>
              <div className="max-h-52 overflow-y-auto divide-y divide-zinc-100 border border-zinc-200 rounded-2xl text-xs">
                {selectedSlipDetail.wallet.techWallet.transactions.concat(selectedSlipDetail.wallet.salesWallet.transactions).length === 0 ? (
                  <div className="p-4 text-center text-zinc-400">Chưa có giao dịch phát sinh trong kỳ</div>
                ) : (
                  selectedSlipDetail.wallet.techWallet.transactions.concat(selectedSlipDetail.wallet.salesWallet.transactions).map((tx, idx) => (
                    <div key={tx.id || idx} className="p-3 hover:bg-zinc-50 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-zinc-900">{tx.productName}</div>
                        <div className="text-[10px] text-zinc-500">
                          {tx.orderCode} • {tx.occurredAt} • <span className="font-mono text-indigo-600">{tx.walletCategory}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-emerald-600 font-mono">+{tx.commissionAmount.toLocaleString()} đ</div>
                        <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded">
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedSlipDetail(null)}
                className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 5: QUY TRÌNH DUYỆT LƯƠNG 5 CẤP (SCREEN 21) */}
      {/* ======================================================== */}
      {adminTab === 'APPROVAL' && (
        <div className="bg-white rounded-2xl p-6 border border-zinc-200/80 shadow-2xs space-y-6">
          <div>
            <h3 className="text-base font-black text-zinc-900 uppercase tracking-wider">
              Quy Trình Phê Duyệt & Khóa Kỳ Lương Tháng 08/2026
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Tuân thủ luồng kiểm soát nội bộ: CHT &rarr; Kế toán &rarr; Giám đốc &rarr; Khóa kỳ &rarr; Chi lương
            </p>
          </div>

          {/* VISUAL 5-STEP APPROVAL STEPPER */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
            {[
              { step: 1, title: '1. Quản lý cửa hàng', desc: 'Đối soát công & doanh số', status: 'COMPLETED', approver: 'Nguyễn Thị E (CHT)', time: '16/05 10:30' },
              { step: 2, title: '2. Kế toán đối soát', desc: 'Kiểm tra hoa hồng & hoàn đơn', status: 'IN_PROGRESS', approver: 'Kế toán trưởng', time: 'Đang xử lý' },
              { step: 3, title: '3. Ban giám đốc', desc: 'Phê duyệt tổng quỹ lương', status: 'PENDING', approver: 'Chưa duyệt', time: '--' },
              { step: 4, title: '4. Khóa kỳ lương', desc: 'Đóng sổ kế toán tháng', status: 'PENDING', approver: 'Hệ thống tự động', time: '--' },
              { step: 5, title: '5. Thanh toán & Phiếu', desc: 'Chuyển khoản & gửi e-Slip', status: 'PENDING', approver: 'Ngân hàng Techcombank', time: '--' },
            ].map(s => (
              <div 
                key={s.step} 
                className={`p-4 rounded-2xl border transition-all ${
                  s.status === 'COMPLETED' ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' :
                  s.status === 'IN_PROGRESS' ? 'bg-orange-50/70 border-orange-200 text-orange-950 shadow-xs ring-2 ring-[#FF4B16]/20' :
                  'bg-zinc-50 border-zinc-200 text-zinc-400'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                    s.status === 'COMPLETED' ? 'bg-emerald-600 text-white' :
                    s.status === 'IN_PROGRESS' ? 'bg-[#FF4B16] text-white' :
                    'bg-zinc-200 text-zinc-600'
                  }`}>
                    {s.status === 'COMPLETED' ? '✓' : s.step}
                  </span>
                  <span className="text-[10px] font-bold uppercase">
                    {s.status === 'COMPLETED' ? 'Đã duyệt' : s.status === 'IN_PROGRESS' ? 'Đang chờ' : 'Chưa đến'}
                  </span>
                </div>
                <div className="font-extrabold text-xs text-zinc-900">{s.title}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">{s.desc}</div>
                <div className="text-[10px] font-semibold text-zinc-700 mt-2 pt-2 border-t border-zinc-200/50">
                  {s.approver} • {s.time}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-zinc-700">
              <strong className="text-zinc-900">Thao tác phê duyệt cấp Kế toán:</strong> Đã kiểm tra 28 đơn hàng và 5 phiếu sửa chữa.
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => alert('Yêu cầu CHT giải trình điều chỉnh hoàn đơn')}
                className="px-4 py-2 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 text-xs font-bold rounded-xl cursor-pointer"
              >
                Yêu cầu điều chỉnh
              </button>
              <button
                onClick={() => alert('Đã phê duyệt kỳ lương cấp Kế toán! Chuyển lên Giám đốc duyệt.')}
                className="px-4 py-2 bg-[#FF4B16] hover:bg-[#E94312] text-white text-xs font-black rounded-xl cursor-pointer shadow-xs"
              >
                PHÊ DUYỆT CẤP KẾ TOÁN &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 6: CẤU HÌNH CHÍNH SÁCH LƯƠNG (SCREEN 22 & 23) */}
      {/* ======================================================== */}
      {adminTab === 'POLICIES' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {policies.map((pol) => (
              <div key={pol.id} className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-2xs space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="bg-orange-100 text-orange-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {pol.version} • {pol.status}
                    </span>
                    <h3 className="text-sm font-black text-zinc-900 mt-1">{pol.name}</h3>
                  </div>
                </div>

                <div className="space-y-2 text-xs border-t border-zinc-100 pt-3">
                  <div className="flex justify-between py-1 border-b border-zinc-100">
                    <span className="text-zinc-500">Lương cơ bản:</span>
                    <span className="font-bold text-zinc-900">{pol.baseSalary.toLocaleString()} đ</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-100">
                    <span className="text-zinc-500">Chuyên cần:</span>
                    <span className="font-bold text-emerald-600">+{pol.attendanceBonus.toLocaleString()} đ</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-100">
                    <span className="text-zinc-500">Hoa hồng bán máy:</span>
                    <span className="font-bold text-[#FF4B16]">{pol.deviceProfitPercent}% lợi nhuận</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-100">
                    <span className="text-zinc-500">Hoa hồng phụ kiện:</span>
                    <span className="font-bold text-zinc-900">{pol.accessoryProfitPercent}% doanh thu</span>
                  </div>
                  {pol.techPointRateVnd > 0 && (
                    <div className="flex justify-between py-1 border-b border-zinc-100">
                      <span className="text-zinc-500">Giá trị Point kỹ thuật:</span>
                      <span className="font-bold text-purple-600">{pol.techPointRateVnd.toLocaleString()} đ / điểm</span>
                    </div>
                  )}
                  {pol.onlineSaleSplitPercent > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-500">Phân chia Online / Showroom:</span>
                      <span className="font-bold text-zinc-900">30% / 70%</span>
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => handleOpenEditPolicy(pol)}
                  className="w-full py-2 bg-zinc-100 hover:bg-orange-50 hover:text-[#FF4B16] text-zinc-800 font-bold text-xs rounded-xl transition-all border border-zinc-200/80 hover:border-orange-300 flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Chỉnh sửa công thức lương</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DRAWER: CHI TIẾT BẢNG CÔNG TỪNG NGÀY CỦA NHÂN VIÊN */}
      {/* ======================================================== */}
      {selectedStaffTimesheet && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end backdrop-blur-xs">
          <div className="bg-white w-full max-w-md h-full p-5 shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center space-x-3">
                  <img 
                    src={selectedStaffTimesheet.avatar} 
                    alt={selectedStaffTimesheet.name} 
                    className="w-10 h-10 rounded-full object-cover border"
                  />
                  <div>
                    <h3 className="font-black text-sm text-zinc-900">{selectedStaffTimesheet.name}</h3>
                    <div className="text-xs text-zinc-400">{selectedStaffTimesheet.roleTitle}</div>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedStaffTimesheet(null)}
                  className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="my-4 space-y-3">
                <div className="text-xs font-black text-zinc-900 uppercase">Lịch sử chấm công chi tiết</div>

                {/* Day item 1 */}
                <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs space-y-1">
                  <div className="flex justify-between font-bold">
                    <span className="text-zinc-900">16/05/2026 (Hôm nay)</span>
                    <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px]">Đúng giờ</span>
                  </div>
                  <div className="text-zinc-600 font-mono">07:58:12 &rarr; Đang trong ca (08h05 công)</div>
                  <div className="text-[10px] text-zinc-400">GPS: 136 Cầu Giấy (Cách 14m) • Wi-Fi: PH_HAICHAU_5G</div>
                </div>

                {/* Day item 2 */}
                <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs space-y-1">
                  <div className="flex justify-between font-bold">
                    <span className="text-zinc-900">15/05/2026</span>
                    <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px]">Đúng giờ</span>
                  </div>
                  <div className="text-zinc-600 font-mono">07:55:00 &rarr; 17:03:00 (8h08 công)</div>
                  <div className="text-[10px] text-zinc-400">Đã chốt 3 đơn iPhone 15 Pro Max</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedStaffTimesheet(null)}
              className="w-full py-3 bg-zinc-900 text-white font-bold text-xs rounded-xl cursor-pointer"
            >
              ĐÓNG DRAWER
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* DRAWER: PHIẾU LƯƠNG CHI TIẾT (PAYROLL DRAWER) (SCREEN 20) */}
      {/* ======================================================== */}
      {selectedPayrollSlip && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg h-full p-6 shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Phiếu lương chi tiết</span>
                  <h3 className="font-black text-base text-zinc-900">{selectedPayrollSlip.employeeName}</h3>
                  <div className="text-xs text-zinc-500">{selectedPayrollSlip.roleTitle} • {selectedPayrollSlip.branchName}</div>
                </div>
                <button 
                  onClick={() => setSelectedPayrollSlip(null)}
                  className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* HERO SALARY */}
              <div className="my-4 p-4 rounded-2xl bg-zinc-900 text-white">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">Thực lĩnh chuyển khoản</span>
                <div className="text-2xl font-black font-mono text-[#FF4B16] mt-0.5">
                  {selectedPayrollSlip.netReceivable.toLocaleString()} đ
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  Số TK: {selectedPayrollSlip.bankAccount} ({selectedPayrollSlip.bankName})
                </div>
              </div>

              {/* BREAKDOWN SECTIONS */}
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-500">Lương cơ bản ({selectedPayrollSlip.actualWorkDays} công):</span>
                  <span className="font-bold text-zinc-900">{selectedPayrollSlip.baseSalary.toLocaleString()} đ</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-500">Thưởng chuyên cần:</span>
                  <span className="font-bold text-emerald-600">+{selectedPayrollSlip.attendanceBonus.toLocaleString()} đ</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-500">Hoa hồng bán máy:</span>
                  <span className="font-bold text-emerald-600">+{selectedPayrollSlip.deviceCommissionTotal.toLocaleString()} đ</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-500">Hoa hồng phụ kiện:</span>
                  <span className="font-bold text-emerald-600">+{selectedPayrollSlip.accessoryCommissionTotal.toLocaleString()} đ</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-500">Thưởng KPI vượt bậc:</span>
                  <span className="font-bold text-purple-600">+{selectedPayrollSlip.kpiBonus.toLocaleString()} đ</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-500">Tăng ca OT ({selectedPayrollSlip.otHoursTotal} giờ):</span>
                  <span className="font-bold text-zinc-900">+{selectedPayrollSlip.overtimeAmount.toLocaleString()} đ</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-500">Điều chỉnh đơn hoàn:</span>
                  <span className="font-bold text-red-600">-{selectedPayrollSlip.returnDeductions.toLocaleString()} đ</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-500">Tạm ứng giữa tháng:</span>
                  <span className="font-bold text-red-600">-{selectedPayrollSlip.advanceSalaryDeductions.toLocaleString()} đ</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-100 flex space-x-2">
              <button
                onClick={() => {}}
                className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>In Phiếu K80</span>
              </button>
              <button
                onClick={() => setSelectedPayrollSlip(null)}
                className="flex-1 py-3 bg-zinc-900 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                ĐÓNG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CHỈNH SỬA CÔNG THỨC & CHÍNH SÁCH LƯƠNG (POLICY EDITOR) */}
      {/* ======================================================== */}
      {editingPolicy && policyForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-3xl rounded-3xl p-6 shadow-2xl border border-zinc-200 space-y-5 my-8 max-h-[90vh] flex flex-col justify-between overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#FF4B16]">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base font-black text-zinc-900">
                      Biên Tập Công Thức Lương & Thưởng
                    </h2>
                    <span className="bg-orange-100 text-[#FF4B16] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      {policyForm.version}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 font-medium">
                    Cấu hình chính sách cho vai trò: <strong>{policyForm.name}</strong>
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setEditingPolicy(null);
                  setPolicyForm(null);
                }}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body: 2 Columns (Form Inputs + Live Simulator) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
              
              {/* Left Column: Form Fields (7 cols) */}
              <div className="lg:col-span-7 space-y-3.5">
                
                {/* 1. Policy Name & Status */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                      Tên chính sách lương
                    </label>
                    <input 
                      type="text"
                      value={policyForm.name}
                      onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:border-[#FF4B16] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                      Trạng thái áp dụng
                    </label>
                    <select
                      value={policyForm.status}
                      onChange={(e) => setPolicyForm({ ...policyForm, status: e.target.value as any })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:border-[#FF4B16] focus:bg-white"
                    >
                      <option value="ACTIVE">ACTIVE (Đang kích hoạt)</option>
                      <option value="DRAFT">DRAFT (Bản nháp thử nghiệm)</option>
                    </select>
                  </div>
                </div>

                {/* 2. Base Salary & Attendance Bonus */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                      Lương cơ bản (đ/tháng)
                    </label>
                    <input 
                      type="number"
                      value={policyForm.baseSalary}
                      onChange={(e) => setPolicyForm({ ...policyForm, baseSalary: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:border-[#FF4B16] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                      Thưởng chuyên cần (đ/tháng)
                    </label>
                    <input 
                      type="number"
                      value={policyForm.attendanceBonus}
                      onChange={(e) => setPolicyForm({ ...policyForm, attendanceBonus: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-emerald-700 focus:outline-hidden focus:border-[#FF4B16] focus:bg-white"
                    />
                  </div>
                </div>

                {/* 3. Device & Accessory Profit Commission */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                      Hoa hồng bán máy (% Lợi nhuận)
                    </label>
                    <div className="relative">
                      <input 
                        type="number"
                        step="0.1"
                        value={policyForm.deviceProfitPercent}
                        onChange={(e) => setPolicyForm({ ...policyForm, deviceProfitPercent: Number(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-[#FF4B16] focus:outline-hidden focus:border-[#FF4B16] focus:bg-white"
                      />
                      <span className="absolute right-3 top-2 text-zinc-400 font-bold">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                      Hoa hồng phụ kiện (% Doanh thu)
                    </label>
                    <div className="relative">
                      <input 
                        type="number"
                        step="0.1"
                        value={policyForm.accessoryProfitPercent}
                        onChange={(e) => setPolicyForm({ ...policyForm, accessoryProfitPercent: Number(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-orange-600 focus:outline-hidden focus:border-[#FF4B16] focus:bg-white"
                      />
                      <span className="absolute right-3 top-2 text-zinc-400 font-bold">%</span>
                    </div>
                  </div>
                </div>

                {/* 4. Tech Point & OT hourly rate */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                      Giá trị Point Kỹ thuật (đ/điểm)
                    </label>
                    <input 
                      type="number"
                      value={policyForm.techPointRateVnd}
                      onChange={(e) => setPolicyForm({ ...policyForm, techPointRateVnd: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-purple-700 focus:outline-hidden focus:border-[#FF4B16] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                      Lương tăng ca OT (đ/giờ)
                    </label>
                    <input 
                      type="number"
                      value={policyForm.overtimeHourlyRate}
                      onChange={(e) => setPolicyForm({ ...policyForm, overtimeHourlyRate: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:border-[#FF4B16] focus:bg-white"
                    />
                  </div>
                </div>

                {/* 5. Online / Showroom Split Ratio */}
                <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2">
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className="text-zinc-700">Tỷ lệ phân chia đơn Online &rarr; Showroom:</span>
                    <span className="text-[#FF4B16]">
                      {policyForm.onlineSaleSplitPercent}% Online • {100 - policyForm.onlineSaleSplitPercent}% Showroom
                    </span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={policyForm.onlineSaleSplitPercent}
                    onChange={(e) => setPolicyForm({ 
                      ...policyForm, 
                      onlineSaleSplitPercent: Number(e.target.value),
                      storeCloserSplitPercent: 100 - Number(e.target.value)
                    })}
                    className="w-full accent-[#FF4B16] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>0% (100% về Showroom)</span>
                    <span>50% / 50%</span>
                    <span>100% (100% về Online)</span>
                  </div>
                </div>

              </div>

              {/* Right Column: Live Formula Preview & Simulator (5 cols) */}
              <div className="lg:col-span-5 bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-2xl p-4 text-white flex flex-col justify-between border border-zinc-800">
                <div className="space-y-3">
                  <div className="flex items-center space-x-1.5 text-xs font-black text-orange-400 uppercase tracking-wider pb-2 border-b border-zinc-800">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Mô Phỏng Tính Lương Tức Thì</span>
                  </div>

                  <p className="text-[11px] text-zinc-400">
                    Kịch bản mẫu: Bán 10 iPhone (Lãi 18M), 5M phụ kiện, 20 điểm kỹ thuật & 6h tăng ca:
                  </p>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-zinc-800 text-zinc-300">
                      <span>Lương cứng chuẩn:</span>
                      <span className="font-bold text-white font-mono">
                        {policyForm.baseSalary.toLocaleString()} đ
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-800 text-zinc-300">
                      <span>Thưởng chuyên cần:</span>
                      <span className="font-bold text-emerald-400 font-mono">
                        +{policyForm.attendanceBonus.toLocaleString()} đ
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-800 text-zinc-300">
                      <span>HH Bán máy ({policyForm.deviceProfitPercent}% của 18M):</span>
                      <span className="font-bold text-[#FF4B16] font-mono">
                        +{Math.round(18000000 * (policyForm.deviceProfitPercent / 100)).toLocaleString()} đ
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-800 text-zinc-300">
                      <span>HH Phụ kiện ({policyForm.accessoryProfitPercent}% của 5M):</span>
                      <span className="font-bold text-blue-400 font-mono">
                        +{Math.round(5000000 * (policyForm.accessoryProfitPercent / 100)).toLocaleString()} đ
                      </span>
                    </div>
                    {policyForm.techPointRateVnd > 0 && (
                      <div className="flex justify-between py-1 border-b border-zinc-800 text-zinc-300">
                        <span>HH Kỹ thuật (20 điểm):</span>
                        <span className="font-bold text-purple-400 font-mono">
                          +{Math.round(20 * policyForm.techPointRateVnd).toLocaleString()} đ
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-b border-zinc-800 text-zinc-300">
                      <span>Lương OT (6 giờ):</span>
                      <span className="font-bold text-amber-400 font-mono">
                        +{Math.round(6 * policyForm.overtimeHourlyRate).toLocaleString()} đ
                      </span>
                    </div>
                  </div>

                  {/* Total Estimated Calculation Box */}
                  <div className="p-3 bg-zinc-800/80 rounded-xl border border-zinc-700 mt-3">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase">Ước tính thu nhập nhân viên</div>
                    <div className="text-xl font-black font-mono text-[#FF4B16] mt-0.5">
                      {(
                        policyForm.baseSalary +
                        policyForm.attendanceBonus +
                        Math.round(18000000 * (policyForm.deviceProfitPercent / 100)) +
                        Math.round(5000000 * (policyForm.accessoryProfitPercent / 100)) +
                        Math.round(20 * policyForm.techPointRateVnd) +
                        Math.round(6 * policyForm.overtimeHourlyRate)
                      ).toLocaleString()} đ
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-zinc-500 pt-3 text-center">
                  Công thức tính lương được mã hóa & đồng bộ realtime vào toàn bộ bảng lương tháng.
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-zinc-100 flex items-center justify-end space-x-3">
              <button
                onClick={() => {
                  setEditingPolicy(null);
                  setPolicyForm(null);
                }}
                className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                HỦY BỎ
              </button>

              <button
                onClick={handleSavePolicy}
                className="px-6 py-2.5 bg-[#FF4B16] hover:bg-[#E94312] text-white font-black text-xs rounded-xl shadow-lg shadow-orange-500/25 transition-all flex items-center space-x-2 cursor-pointer"
              >
                {policySaveSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>ĐÃ LƯU THÀNH CÔNG!</span>
                  </>
                ) : (
                  <>
                    <CheckCheck className="w-4 h-4 text-white" />
                    <span>LƯU CÔNG THỨC LƯƠNG</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
