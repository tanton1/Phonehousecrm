import React, { useState } from 'react';
import { 
  INITIAL_STAFF_MEMBERS,
  INITIAL_TODAY_ATTENDANCE_LIST,
  INITIAL_WEEKLY_SCHEDULES,
  INITIAL_COMMISSIONS,
  INITIAL_LEAVE_REQUESTS,
  INITIAL_PAYROLL_LEDGER_CURRENT_USER,
  INITIAL_MONTHLY_PAYROLL_SLIPS,
  INITIAL_POLICIES
} from '../data/attendanceData';
import { INITIAL_BRANCHES } from '../data/initialData';

import { AttendanceAdminView } from './AttendanceAdminView';
import { 
  Clock, 
  Building2,
  Calendar,
  FileText,
  DollarSign,
  CheckCheck,
  Sliders,
  ShieldCheck,
  ChevronRight,
  Activity,
  Coins,
  CalendarDays,
  SlidersHorizontal,
  Wrench,
  Users,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { LeaveRequest, SalesInvoice, WarrantyTicket, StoreBranch, SalaryPolicy } from '../types';

export interface HRHubViewProps {
  attendanceRecords?: import('../types').AttendanceRecord[];
  invoices?: SalesInvoice[];
  warrantyTickets?: WarrantyTicket[];
  branches?: StoreBranch[];
}

// 3 Core Functional Groups under HR & Governance
export type HRGroupCategory = 'OPERATIONS' | 'PAYROLL' | 'GOVERNANCE';

export type HRSubModule = 
  // Nhóm 1: VẬN HÀNH & CHẤM CÔNG
  | 'OVERVIEW'           // Chấm Công Realtime
  | 'SHIFTS'             // Lịch & Xếp Ca Tuần
  // Nhóm 2: TIỀN LƯƠNG & HOA HỒNG
  | 'TIMESHEET'          // Bảng Công Tháng
  | 'PAYROLL'            // Bảng Tính Lương & Thu Nhập
  | 'TECH_COMMISSION'    // Hoa Hồng Kỹ Thuật Viên
  // Nhóm 3: PHÊ DUYỆT & QUẢN TRỊ
  | 'APPROVAL'           // Quy Trình Duyệt Lương 5 Cấp
  | 'POLICIES';          // Cấu Hình Chính Sách Lương

export const HRHubView: React.FC<HRHubViewProps> = ({ 
  attendanceRecords = [], 
  invoices = [], 
  warrantyTickets = [],
  branches = []
}) => {
  // Navigation State: Active Group + Sub-Module
  const [activeGroup, setActiveGroup] = useState<HRGroupCategory>('OPERATIONS');
  const [activeSubModule, setActiveSubModule] = useState<HRSubModule>('OVERVIEW');

  // Single-Row Filters
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-08');

  // Core Mock State
  const [staffList, setStaffList] = useState(INITIAL_STAFF_MEMBERS);
  const [currentStaffId] = useState<string>('STAFF_001');
  const [todayAttendance, setTodayAttendance] = useState(INITIAL_TODAY_ATTENDANCE_LIST);
  const currentAttendanceList = attendanceRecords.length > 0 ? attendanceRecords : todayAttendance;
  const [weeklySchedules, setWeeklySchedules] = useState(INITIAL_WEEKLY_SCHEDULES);
  const [leaveRequests, setLeaveRequests] = useState(INITIAL_LEAVE_REQUESTS);
  const [commissions] = useState(INITIAL_COMMISSIONS);
  const [payrollSlips, setPayrollSlips] = useState(INITIAL_MONTHLY_PAYROLL_SLIPS);
  const [policies, setPolicies] = useState(INITIAL_POLICIES);

  // Active current staff member object
  const currentStaff = staffList.find(s => s.id === currentStaffId) || staffList[0] || INITIAL_STAFF_MEMBERS[0];

  // Live Summary Metrics for Badges
  const activeCount = currentAttendanceList.filter(a => a.status === 'IN_PROGRESS' || a.status === 'COMPLETED').length;
  const lateCount = currentAttendanceList.filter(a => a.status === 'LATE').length;
  const pendingLeaveCount = leaveRequests.filter(l => l.status === 'PENDING').length;
  const pendingPayrollCount = payrollSlips.filter(p => p.approvalStep < 4).length;

  const handleApproveLeave = (leaveId: string) => {
    setLeaveRequests(leaveRequests.map(l => l.id === leaveId ? { ...l, status: 'APPROVED' } : l));
  };

  const handleAdvancePayrollApproval = (slipId: string, nextStep: number, approverName: string, notes: string) => {
    setPayrollSlips(payrollSlips.map(s => {
      if (s.id === slipId) {
        return {
          ...s,
          approvalStep: nextStep as any,
          status: nextStep >= 4 ? 'LOCKED' : 'STORE_APPROVED'
        };
      }
      return s;
    }));
  };

  const handleUpdateShift = (staffId: string, dateKey: string, shiftName: string) => {
    setWeeklySchedules(weeklySchedules.map(sch => {
      if (sch.staffId === staffId) {
        return {
          ...sch,
          days: {
            ...sch.days,
            [dateKey]: {
              shiftId: `SHIFT_${shiftName}`,
              shiftName,
              startTime: shiftName === 'Ca sáng' ? '08:00' : shiftName === 'Ca chiều' ? '14:00' : '17:00',
              endTime: shiftName === 'Ca sáng' ? '17:00' : shiftName === 'Ca chiều' ? '21:00' : '22:00',
              status: shiftName === 'Nghỉ' ? 'OFF' : 'SCHEDULED'
            }
          }
        };
      }
      return sch;
    }));
  };

  const handleUpdatePolicy = (updatedPolicy: SalaryPolicy) => {
    setPolicies(policies.map(p => p.id === updatedPolicy.id ? updatedPolicy : p));
  };

  // Group Definitions under "Nhóm Nhân Sự & Quản Trị"
  const HR_GROUPS = [
    {
      id: 'OPERATIONS' as const,
      title: '1. Vận Hành & Chấm Công',
      subtitle: 'Giám sát vào ca, GPS & ma trận xếp ca',
      icon: Clock,
      badge: `${activeCount}/${staffList.length} Vào ca`,
      subModules: [
        { id: 'OVERVIEW' as const, label: 'Chấm Công Realtime', desc: 'Quân số, GPS, đi trễ & trạng thái ca', icon: Activity },
        { id: 'SHIFTS' as const, label: 'Lịch & Xếp Ca Tuần', desc: 'Ma trận 3 ca, AI chia ca & nghỉ phép', icon: CalendarDays, badge: pendingLeaveCount > 0 ? `${pendingLeaveCount} đơn nghỉ` : undefined }
      ]
    },
    {
      id: 'PAYROLL' as const,
      title: '2. Tiền Lương & Hoa Hồng',
      subtitle: 'Bảng công tháng, tính lương & ví kỹ thuật',
      icon: Coins,
      badge: `${payrollSlips.length} Nhân sự`,
      subModules: [
        { id: 'TIMESHEET' as const, label: 'Bảng Tổng Hợp Công', desc: 'Công chuẩn, đi trễ, OT & xuất Excel', icon: FileText },
        { id: 'PAYROLL' as const, label: 'Bảng Tính Lương & Thu Nhập', desc: 'Lương cứng, KPI, phụ cấp & in phiếu', icon: DollarSign },
        { id: 'TECH_COMMISSION' as const, label: 'Hoa Hồng Kỹ Thuật Viên', desc: 'KCS máy cũ, sửa chữa & thay thế', icon: Wrench }
      ]
    },
    {
      id: 'GOVERNANCE' as const,
      title: '3. Phê Duyệt & Chính Sách',
      subtitle: 'Duyệt lương 5 cấp & cấu hình định mức',
      icon: ShieldCheck,
      badge: pendingPayrollCount > 0 ? `${pendingPayrollCount} Chờ duyệt` : 'Đã khóa',
      subModules: [
        { id: 'APPROVAL' as const, label: 'Quy Trình Duyệt Lương 5 Cấp', desc: 'CHT → Kế toán → BGĐ → Khóa sổ', icon: CheckCheck, badge: pendingPayrollCount > 0 ? `${pendingPayrollCount} phiếu` : undefined },
        { id: 'POLICIES' as const, label: 'Chính Sách & Định Mức Lương', desc: 'Bậc lương, % hoa hồng & phụ cấp', icon: SlidersHorizontal }
      ]
    }
  ];

  // Helper to switch group and activate its first subModule
  const handleSelectGroup = (group: HRGroupCategory) => {
    setActiveGroup(group);
    if (group === 'OPERATIONS') setActiveSubModule('OVERVIEW');
    if (group === 'PAYROLL') setActiveSubModule('TIMESHEET');
    if (group === 'GOVERNANCE') setActiveSubModule('APPROVAL');
  };

  const currentGroupObj = HR_GROUPS.find(g => g.id === activeGroup) || HR_GROUPS[0];

  return (
    <div className="w-full space-y-4 font-sans animate-fadeIn">
      
      {/* 1. SINGLE-ROW CONCISE HEADER & GLOBAL FILTERS */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-zinc-200/80 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Identity & Current Group Badge */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF4B16] to-orange-500 text-white flex items-center justify-center font-black text-sm shadow-md shadow-orange-500/20 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-bold uppercase tracking-wider">
                <span>Nhân Sự & Quản Trị</span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                <span className="text-[#FF4B16] font-extrabold">{currentGroupObj.title}</span>
              </div>
              <h1 className="text-base sm:text-lg font-black text-zinc-900 truncate">
                Quản Trị Nhân Sự, Chấm Công & Tiền Lương
              </h1>
            </div>
          </div>

          {/* 1-ROW COHESIVE FILTER TOOLBAR */}
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 sm:pb-0 shrink-0">
            {/* Quick Status Indicator Pill */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-800 text-xs font-bold whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              <span>{activeCount}/{staffList.length} Vào ca</span>
              {lateCount > 0 && (
                <span className="text-orange-600 ml-1">({lateCount} trễ)</span>
              )}
            </div>

            {/* Branch Filter */}
            <div className="flex items-center bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-800 shadow-2xs hover:border-zinc-300">
              <span className="text-zinc-400 mr-1.5 text-[11px]">📍 Chi nhánh:</span>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="bg-transparent font-bold text-zinc-900 focus:outline-none cursor-pointer pr-1"
              >
                <option value="ALL">Tất cả chi nhánh</option>
                {(branches.length > 0 ? branches : INITIAL_BRANCHES).map(br => (
                  <option key={br.id} value={br.id}>{br.name}</option>
                ))}
              </select>
            </div>

            {/* Period Filter */}
            <div className="flex items-center bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-zinc-800 shadow-2xs hover:border-zinc-300">
              <span className="text-zinc-400 mr-1.5 text-[11px]">📅 Kỳ lương:</span>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-transparent font-bold text-zinc-900 focus:outline-none cursor-pointer pr-1"
              >
                <option value="2026-08">Tháng 08/2026</option>
                <option value="2026-07">Tháng 07/2026</option>
                <option value="2026-06">Tháng 06/2026</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2. PRIMARY 3 HR GROUPS (Vận hành - Lương - Chính sách) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3.5 pt-3.5 border-t border-zinc-100">
          {HR_GROUPS.map((grp) => {
            const Icon = grp.icon;
            const isSelected = activeGroup === grp.id;
            return (
              <button
                key={grp.id}
                onClick={() => handleSelectGroup(grp.id)}
                className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-orange-50/60 border-orange-400 ring-2 ring-orange-400/20 shadow-xs'
                    : 'bg-zinc-50/70 hover:bg-zinc-100/80 border-zinc-200/80 text-zinc-600'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`p-2 rounded-lg border shrink-0 transition-transform ${
                    isSelected
                      ? 'bg-[#FF4B16] text-white border-orange-500 shadow-xs'
                      : 'bg-white text-zinc-600 border-zinc-200'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-xs font-black truncate ${isSelected ? 'text-zinc-900' : 'text-zinc-700'}`}>
                      {grp.title}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {grp.subtitle}
                    </div>
                  </div>
                </div>

                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                  isSelected 
                    ? 'bg-[#FF4B16] text-white' 
                    : 'bg-zinc-200/80 text-zinc-600'
                }`}>
                  {grp.badge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. SUB-MODULE TABS FOR THE CURRENTLY ACTIVE GROUP */}
      <div className="bg-white rounded-2xl p-2 border border-zinc-200/80 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
          {currentGroupObj.subModules.map((sub) => {
            const SubIcon = sub.icon;
            const isActive = activeSubModule === sub.id;
            return (
              <button
                key={sub.id}
                onClick={() => setActiveSubModule(sub.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer border shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-r from-orange-500 to-orange-500 text-white border-orange-500 shadow-sm shadow-orange-500/25'
                    : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200/80 hover:border-zinc-300'
                }`}
              >
                <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-orange-500'}`} />
                <span>{sub.label}</span>
                {sub.badge && (
                  <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-md ml-0.5 ${
                    isActive ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {sub.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. ACTIVE SUB-MODULE CONTENT RENDERING */}
      <div className="space-y-4">
        <AttendanceAdminView
          staffList={staffList}
          todayAttendance={currentAttendanceList}
          weeklySchedules={weeklySchedules}
          leaveRequests={leaveRequests}
          payrollSlips={payrollSlips}
          policies={policies}
          commissions={commissions}
          branches={branches.length > 0 ? branches : INITIAL_BRANCHES}
          activeAdminTab={activeSubModule as any}
          onSelectAdminTab={(tab) => setActiveSubModule(tab as any)}
          onApproveLeave={handleApproveLeave}
          onAdvancePayrollApproval={handleAdvancePayrollApproval}
          onUpdateShift={handleUpdateShift}
          onUpdatePolicy={handleUpdatePolicy}
          invoices={invoices}
          warrantyTickets={warrantyTickets}
          hideHeaderAndTabs={true}
        />
      </div>
    </div>
  );
};
