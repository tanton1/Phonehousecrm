import React, { useState } from 'react';
import { 
  INITIAL_STAFF_MEMBERS,
  INITIAL_SHIFTS,
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
import { AttendanceStaffMobileView } from './AttendanceStaffMobileView';
import { StandaloneCheckInView } from './StandaloneCheckInView';
import { 
  Smartphone, 
  Monitor, 
  Users, 
  Clock, 
  Sparkles,
  RefreshCw,
  Building2,
  ChevronDown,
  Calendar,
  FileText,
  DollarSign,
  CheckCheck,
  Sliders,
  Coffee,
  ShieldCheck,
  TrendingUp,
  MapPin,
  Wifi,
  ScanFace,
  QrCode,
  Compass,
  Zap
} from 'lucide-react';
import { LeaveRequest, SalesInvoice, WarrantyTicket, StoreBranch } from '../types';

export interface HRHubViewProps {
  attendanceRecords?: import('../types').AttendanceRecord[];
  invoices?: SalesInvoice[];
  warrantyTickets?: WarrantyTicket[];
  branches?: StoreBranch[];
  onNavigateToCheckIn?: () => void;
}

export const HRHubView: React.FC<HRHubViewProps> = ({ 
  attendanceRecords = [], 
  invoices = [], 
  warrantyTickets = [],
  branches = [],
  onNavigateToCheckIn
}) => {
  // Mode: 'ADMIN_DESKTOP' | 'CHECKIN_PORTAL' | 'STAFF_MOBILE'
  const [activeViewMode, setActiveViewMode] = useState<'ADMIN_DESKTOP' | 'CHECKIN_PORTAL' | 'STAFF_MOBILE'>('ADMIN_DESKTOP');
  const [adminSubTab, setAdminSubTab] = useState<'OVERVIEW' | 'SHIFTS' | 'TIMESHEET' | 'PAYROLL' | 'TECH_COMMISSION' | 'APPROVAL' | 'POLICIES'>('OVERVIEW');

  // State
  const [staffList, setStaffList] = useState(INITIAL_STAFF_MEMBERS);
  const [currentStaffId, setCurrentStaffId] = useState<string>('STAFF_001');
  const [todayAttendance, setTodayAttendance] = useState(INITIAL_TODAY_ATTENDANCE_LIST);
  const currentAttendanceList = attendanceRecords.length > 0 ? attendanceRecords : todayAttendance;
  const [weeklySchedules, setWeeklySchedules] = useState(INITIAL_WEEKLY_SCHEDULES);
  const [leaveRequests, setLeaveRequests] = useState(INITIAL_LEAVE_REQUESTS);
  const [commissions, setCommissions] = useState(INITIAL_COMMISSIONS);
  const [payrollSlips, setPayrollSlips] = useState(INITIAL_MONTHLY_PAYROLL_SLIPS);
  const [payrollLedgers, setPayrollLedgers] = useState(INITIAL_PAYROLL_LEDGER_CURRENT_USER);
  const [policies, setPolicies] = useState(INITIAL_POLICIES);

  // Active current staff member object
  const currentStaff = staffList.find(s => s.id === currentStaffId) || staffList[0] || INITIAL_STAFF_MEMBERS[0];
  const currentAttendance = todayAttendance.find(a => a.staffId === currentStaffId) || todayAttendance[0];
  const currentSchedule = weeklySchedules.find(w => w.staffId === currentStaffId) || weeklySchedules[0];
  const currentPayrollSlip = payrollSlips.find(p => p.employeeId === currentStaffId) || payrollSlips[0];

  // Actions
  const handleCheckIn = (verificationData: any) => {
    const updated = todayAttendance.map(item => {
      if (item.staffId === currentStaff.id) {
        return {
          ...item,
          status: 'IN_PROGRESS' as const,
          checkInTime: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          verification: {
            ...item.verification,
            ...verificationData
          }
        };
      }
      return item;
    });
    setTodayAttendance(updated);
  };

  const handleCheckOut = () => {
    const updated = todayAttendance.map(item => {
      if (item.staffId === currentStaff.id) {
        return {
          ...item,
          status: 'COMPLETED' as const,
          checkOutTime: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
      }
      return item;
    });
    setTodayAttendance(updated);
  };

  const handleChangeActivity = (activity: 'WORKING' | 'BREAK' | 'OUTSIDE' | 'DELIVERY' | 'SUPPORT_TECH') => {
    const updated = todayAttendance.map(item => {
      if (item.staffId === currentStaff.id) {
        return {
          ...item,
          currentActivity: activity,
          activityHistory: [
            ...item.activityHistory,
            {
              timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
              action: `Chuyển trạng thái: ${activity}`
            }
          ]
        };
      }
      return item;
    });
    setTodayAttendance(updated);
  };

  const handleCreateLeaveRequest = (req: Partial<LeaveRequest>) => {
    const newReq: LeaveRequest = {
      id: `LEAVE_${Date.now()}`,
      code: `NP-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${leaveRequests.length + 1}`,
      staffId: currentStaff.id,
      staffName: currentStaff.name,
      role: currentStaff.role,
      branchName: currentStaff.branchName,
      type: req.type || 'ANNUAL_LEAVE',
      startDate: req.startDate || '2026-08-16',
      endDate: req.endDate || '2026-08-16',
      totalDays: req.totalDays || 1,
      reason: req.reason || '',
      swapWithStaffName: req.swapWithStaffName,
      status: 'PENDING',
      createdAt: new Date().toLocaleDateString('vi-VN')
    };
    setLeaveRequests([newReq, ...leaveRequests]);
  };

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

  const handleUpdatePolicy = (updatedPolicy: any) => {
    setPolicies(policies.map(p => p.id === updatedPolicy.id ? updatedPolicy : p));
  };

  // Quick module navigation items with distinct icons & colors
  const hrModuleIcons = [
    {
      id: 'OVERVIEW',
      label: 'Chấm Công Realtime',
      desc: 'GPS, Wi-Fi, Face ID & QR Code',
      icon: Clock,
      color: 'text-orange-600 bg-orange-50 border-orange-200',
      mode: 'ADMIN_DESKTOP' as const,
      adminTab: 'OVERVIEW' as const
    },
    {
      id: 'SHIFTS',
      label: 'Ma Trận Xếp Ca',
      desc: 'Phân ca 3 ca sáng-chiều-tối & AI xếp lịch',
      icon: Calendar,
      color: 'text-orange-600 bg-blue-50 border-blue-200',
      mode: 'ADMIN_DESKTOP' as const,
      adminTab: 'SHIFTS' as const
    },
    {
      id: 'TIMESHEET',
      label: 'Bảng Công Tháng',
      desc: 'Công chuẩn, đi trễ, tăng ca OT & xuất Excel',
      icon: FileText,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      mode: 'ADMIN_DESKTOP' as const,
      adminTab: 'TIMESHEET' as const
    },
    {
      id: 'PAYROLL',
      label: 'Bảng Lương & Hoa Hồng',
      desc: 'Tính lương, thưởng & in phiếu lương nhân viên',
      icon: DollarSign,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
      mode: 'ADMIN_DESKTOP' as const,
      adminTab: 'PAYROLL' as const
    },
    {
      id: 'TECH_COMMISSION',
      label: 'Hoa hồng Kỹ thuật',
      desc: 'Quản lý thu nhập kỹ thuật viên (KCS, Sửa chữa)',
      icon: Monitor,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      mode: 'ADMIN_DESKTOP' as const,
      adminTab: 'TECH_COMMISSION' as const
    },
    {
      id: 'APPROVAL',
      label: 'Duyệt Lương 5 Cấp',
      desc: 'CHT → Kế toán → Ban Giám Đốc → Khóa sổ',
      icon: CheckCheck,
      color: 'text-purple-600 bg-purple-50 border-purple-200',
      mode: 'ADMIN_DESKTOP' as const,
      adminTab: 'APPROVAL' as const
    },
    {
      id: 'POLICIES',
      label: 'Chính Sách Lương',
      desc: 'Công thức lương cơ bản, bậc % & Point KTV',
      icon: Sliders,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      mode: 'ADMIN_DESKTOP' as const,
      adminTab: 'POLICIES' as const
    },
    
  ];

  return (
    <div className="space-y-4">
      {/* HEADER WITH 3 WORKSPACE MODES */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF4B16] to-amber-500 text-white flex items-center justify-center font-black text-sm shadow-xs shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="font-extrabold text-sm text-zinc-900 flex items-center space-x-1.5">
              <span>Quản Trị Nhân Sự & Điểm Danh PhoneHouse</span>
              <span className="bg-orange-100 text-[#FF4B16] text-[10px] font-black px-2 py-0.5 rounded-full">
                {activeViewMode === 'ADMIN_DESKTOP' ? 'Admin / Quản Trị' : activeViewMode === 'CHECKIN_PORTAL' ? 'Cổng Điểm Danh Face ID' : 'App Nhân Viên Mobile'}
              </span>
            </div>
            <div className="text-xs text-zinc-500">
              {activeViewMode === 'ADMIN_DESKTOP'
                ? 'Quản lý chấm công realtime, tính lương, xếp ca và chính sách hoa hồng.'
                : activeViewMode === 'CHECKIN_PORTAL'
                ? 'Cổng chấm công sinh trắc học 4-bước: Hồ sơ, GPS bán kính, Wi-Fi và Face ID AI.'
                : 'Mô phỏng ứng dụng di động chấm công 4-bước dành cho nhân viên.'}
            </div>
          </div>
        </div>

        {/* 3 WORKSPACE MODE TOGGLE BUTTONS */}
        <div className="flex flex-wrap items-center bg-zinc-100 p-1 rounded-xl shrink-0 gap-1">
          <button
            onClick={() => setActiveViewMode('ADMIN_DESKTOP')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeViewMode === 'ADMIN_DESKTOP'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Monitor className="w-3.5 h-3.5 text-blue-600" />
            <span>Quản Trị HR (Desktop)</span>
          </button>
          
          <button
            onClick={() => {
              if (onNavigateToCheckIn) {
                onNavigateToCheckIn();
              } else {
                setActiveViewMode('CHECKIN_PORTAL');
              }
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              activeViewMode === 'CHECKIN_PORTAL'
                ? 'bg-[#FF4B16] text-white shadow-xs'
                : 'bg-orange-50 text-[#FF4B16] hover:bg-orange-100 border border-orange-200'
            }`}
          >
            <ScanFace className="w-3.5 h-3.5" />
            <span>⚡ Cổng Điểm Danh Face ID</span>
          </button>

          <button
            onClick={() => setActiveViewMode('STAFF_MOBILE')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeViewMode === 'STAFF_MOBILE'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
            <span>Check-in NV (Mobile)</span>
          </button>
        </div>
      </div>

      {activeViewMode === 'CHECKIN_PORTAL' ? (
        <StandaloneCheckInView
          currentUser={currentStaff}
          branches={branches.length > 0 ? branches : INITIAL_BRANCHES}
          attendanceRecords={currentAttendanceList}
          onCheckInSuccess={(record) => {
            setTodayAttendance([record, ...todayAttendance]);
          }}
          onNavigateToHR={() => setActiveViewMode('ADMIN_DESKTOP')}
        />
      ) : activeViewMode === 'STAFF_MOBILE' ? (
        <div className="max-w-2xl mx-auto py-2">
          <AttendanceStaffMobileView
            currentUser={currentStaff}
            attendanceRecord={currentAttendance}
            weeklySchedule={currentSchedule}
            leaveRequests={leaveRequests}
            commissions={commissions}
            payrollSlip={currentPayrollSlip}
            payrollLedgers={payrollLedgers}
            branches={branches.length > 0 ? branches : INITIAL_BRANCHES}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onChangeActivity={() => {}}
            onCreateLeaveRequest={() => {}}
          />
        </div>
      ) : (
        <>
          {/* FAST CHECK-IN HERO ACTION BANNER */}
          <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-[#FF4B16] rounded-2xl p-4 sm:p-5 text-white shadow-md shadow-orange-500/15 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 text-[10px] font-black uppercase tracking-wider">
                <ScanFace className="w-3 h-3" />
                <span>Cổng Điểm Danh Sinh Trắc Học Tự Động</span>
              </div>
              <h2 className="text-base sm:text-lg font-black">
                Nhân viên vào ca? Bấm để mở Cổng Điểm Danh 4 Bước (Face ID & GPS)
              </h2>
              <p className="text-xs text-orange-100 max-w-xl">
                Quy trình xác thực gồm: Chọn hồ sơ → Định vị GPS chi nhánh → Kiểm tra Wi-Fi nội bộ → Quét khuôn mặt Face ID chống giả mạo.
              </p>
            </div>

            <button
              onClick={() => {
                if (onNavigateToCheckIn) {
                  onNavigateToCheckIn();
                } else {
                  setActiveViewMode('CHECKIN_PORTAL');
                }
              }}
              className="bg-white hover:bg-orange-50 text-[#FF4B16] font-black text-xs px-4 py-2.5 rounded-xl flex items-center justify-center space-x-2 shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <ScanFace className="w-4 h-4" />
              <span>Vào Trang Điểm Danh Ngay</span>
            </button>
          </div>

          {/* ICON NAVIGATION MATRIX & QUICK SUB-MODULE LAUNCHER */}
          <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Compass className="w-4 h-4 text-[#FF4B16]" />
                <h3 className="text-xs font-black text-zinc-900 uppercase tracking-wider">
                  Danh Mục Phân Hệ & Icon Chức Năng Nhân Sự - Tiền Lương
                </h3>
              </div>
              <span className="text-[11px] text-zinc-400 font-semibold hidden sm:inline">
                Click vào icon để chuyển nhanh trực tiếp đến phân hệ tương ứng
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {hrModuleIcons.map((mod) => {
                const Icon = mod.icon;
                const isSelected = adminSubTab === mod.adminTab;
                return (
                  <button
                    key={mod.id}
                    onClick={() => {
                      setAdminSubTab(mod.adminTab);
                    }}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer group ${
                      isSelected
                        ? 'bg-orange-50/90 border-[#FF4B16] ring-2 ring-[#FF4B16]/20 shadow-xs'
                        : 'bg-zinc-50/70 hover:bg-white border-zinc-200/80 hover:border-orange-300 hover:shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`p-2 rounded-xl border ${mod.color} group-hover:scale-105 transition-transform`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-[#FF4B16] animate-ping" />
                      )}
                    </div>
                    <div>
                      <div className="font-extrabold text-xs text-zinc-900 leading-snug">
                        {mod.label}
                      </div>
                      <div className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                        {mod.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RENDER ACTIVE VIEW */}
          <AttendanceAdminView
            staffList={staffList}
            todayAttendance={currentAttendanceList}
            weeklySchedules={weeklySchedules}
            leaveRequests={leaveRequests}
            payrollSlips={payrollSlips}
            policies={policies}
            commissions={commissions}
            branches={branches.length > 0 ? branches : INITIAL_BRANCHES}
            activeAdminTab={adminSubTab}
            onSelectAdminTab={setAdminSubTab}
            onApproveLeave={handleApproveLeave}
            onAdvancePayrollApproval={handleAdvancePayrollApproval}
            onUpdateShift={handleUpdateShift}
            onUpdatePolicy={handleUpdatePolicy}
            invoices={invoices}
            warrantyTickets={warrantyTickets}
          />
        </>
      )}
    </div>
  );
};
