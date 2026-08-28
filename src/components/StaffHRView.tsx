import React, { useEffect, useState, useMemo } from 'react';
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Camera,
  MapPin,
  Zap,
  TrendingUp,
  FileText,
  Send,
  UserCheck,
  DollarSign,
  ShieldCheck,
  Smartphone,
  Wrench,
  RefreshCw,
  ArrowUpRight,
  Plus,
  ArrowLeftRight,
  Building2,
  Phone,
  Mail,
  CalendarDays,
  Coffee,
  Truck,
  Briefcase,
  Layers,
  ChevronRight,
  Sparkles,
  Info,
  ClipboardCheck,
  CheckSquare,
  ListTodo,
  Check,
  Filter,
  Trash2,
  Edit3,
  MessageSquare,
  LogOut
} from 'lucide-react';
import { UserAccount, StaffMember, AttendanceRecord, StoreBranch, LeaveRequest } from '../types';
import { ShiftChecklistModule } from './ShiftChecklistModule';
import { fetchShiftBoard } from '../services/shiftSchedulingApiClient';
import { fetchTechnicalCommissionLedger, type TechnicalCommissionLedgerEntry } from '../services/technicalApiClient';
import { fetchMyPayrollSlip } from '../services/payrollApiClient';
import type { PayrollRecord } from '../features/payroll/components/MonthlyPayrollTable';

export interface ShiftChecklistItem {
  id: string;
  title: string;
  category: 'OPENING' | 'MID_SHIFT' | 'CLOSING';
  categoryName: string;
  timeHint: string;
  isCompleted: boolean;
  completedAt?: string;
  priority?: 'HIGH' | 'MEDIUM' | 'NORMAL';
  note?: string;
}

interface StaffHRViewProps {
  currentUser?: UserAccount | null;
  roleType: 'SALES' | 'TECH';
  branches?: StoreBranch[];
  onCheckIn?: (time: string) => void;
  onCheckOut?: (time: string) => void;
  checkedInState?: boolean;
  initialCheckInTime?: string | null;
  onOpenCheckInModal?: () => void;
  attendanceRecord?: AttendanceRecord;
  leaveRequests?: LeaveRequest[];
  onCreateLeaveRequest?: (request: LeaveRequest) => Promise<void> | void;
}

export const StaffHRView: React.FC<StaffHRViewProps> = ({
  currentUser,
  roleType,
  branches = [],
  onCheckIn,
  onCheckOut,
  checkedInState = false,
  initialCheckInTime = null,
  onOpenCheckInModal,
  attendanceRecord,
  leaveRequests = [],
  onCreateLeaveRequest
}) => {
  const currentBranch = branches.find((branch) => branch.id === currentUser?.branchId) || null;

  // Active Tab: CHECKLIST (Checklist trong ngày), ATTENDANCE (Chấm công & Lịch ca), EARNINGS (Ví hoa hồng & KPI), PAYROLL (Phiếu lương), REQUESTS (Đơn từ)
  const [activeTab, setActiveTab] = useState<'CHECKLIST' | 'ATTENDANCE' | 'EARNINGS' | 'PAYROLL' | 'REQUESTS'>('CHECKLIST');

  // Staff identity
  const staffMember: StaffMember = useMemo(() => {
    return {
      id: currentUser?.id || '',
      code: (currentUser as any)?.employeeCode || currentUser?.id || '',
      name: currentUser?.displayName || 'Nhân viên',
      avatar: currentUser?.avatarUrl || '',
      role: roleType === 'SALES' ? 'SALES' : 'TECHNICIAN',
      roleTitle: roleType === 'SALES' ? 'Nhân viên bán hàng' : 'Kỹ thuật viên',
      phone: currentUser?.phone || '',
      email: currentUser?.email || '',
      branchId: currentUser?.branchId || currentBranch?.id || '',
      branchName: currentBranch?.name || 'Chưa phân chi nhánh',
      baseSalary: Number(currentUser?.baseSalary || 0),
      monthlyTargetRevenue: Number(currentUser?.kpiTargetRevenue || 0),
      monthlyTargetOrders: Number(currentUser?.kpiTargetOrders || 0),
      status: 'ACTIVE',
      joinDate: currentUser?.createdAt || '',
      allowedWifiSSID: currentBranch?.allowedWifiSSID || '',
      assignedFaceEmbedding: Boolean(currentUser?.assignedFaceEmbedding)
    };
  }, [currentUser, roleType, currentBranch]);

  // Attendance state
  const [attendance, setAttendance] = useState<AttendanceRecord>(() => attendanceRecord || ({
    id: '',
    staffId: staffMember.id,
    staffName: staffMember.name,
    role: staffMember.role,
    branchId: staffMember.branchId,
    branchName: staffMember.branchName,
    date: new Date().toISOString().slice(0, 10),
    shiftName: '',
    scheduledStart: '',
    scheduledEnd: '',
    checkInTime: initialCheckInTime || (checkedInState ? '08:00:00' : undefined),
    workDurationMinutes: 0,
    breakDurationMinutes: 0,
    netWorkMinutes: 0,
    verification: { gpsVerified: false, wifiVerified: false, faceVerified: false, qrScanned: false },
    status: checkedInState || initialCheckInTime ? 'ON_TIME' : 'PENDING_VERIFICATION',
    lateMinutes: 0,
    earlyMinutes: 0,
    otMinutes: 0,
    kpiProgress: { consultedCount: 0, targetConsulted: 0, orderCount: 0, targetOrders: 0, revenue: 0, targetRevenue: 0 },
    activityHistory: []
  }));

  useEffect(() => {
    if (attendanceRecord) setAttendance(attendanceRecord);
  }, [attendanceRecord]);

  // Current Live Activity State
  const [currentActivity, setCurrentActivity] = useState<string>(roleType === 'SALES' ? 'Bán hàng Showroom' : 'Sửa chữa & KCS');

  // Daily Shift Checklist State
  const initialChecklist: ShiftChecklistItem[] = useMemo(() => {
    if (roleType === 'SALES') {
      return [
        {
          id: 'CL-01',
          title: 'Lau chùi tủ kính trưng bày & vệ sinh bàn tiếp đón khách',
          category: 'OPENING',
          categoryName: 'Đầu ca trực',
          timeHint: '08:00 - 08:30',
          isCompleted: true,
          completedAt: '08:15',
          priority: 'HIGH'
        },
        {
          id: 'CL-02',
          title: 'Bật nguồn điện thoại demo, sạc 100% pin & kiểm tra chuông chống trộm',
          category: 'OPENING',
          categoryName: 'Đầu ca trực',
          timeHint: '08:00 - 08:30',
          isCompleted: true,
          completedAt: '08:20',
          priority: 'HIGH'
        },
        {
          id: 'CL-03',
          title: 'Kiểm đếm tiền mặt két thu ngân & nhận bàn giao quỹ ca trước',
          category: 'OPENING',
          categoryName: 'Đầu ca trực',
          timeHint: '08:15 - 08:30',
          isCompleted: true,
          completedAt: '08:25',
          priority: 'HIGH',
          note: 'Đã nhận đủ 5.000.000đ tiền mặt lẻ phục vụ thối tiền'
        },
        {
          id: 'CL-04',
          title: 'Rà soát tin nhắn Zalo OA, Fanpage & danh sách Lead CRM chưa chăm sóc',
          category: 'OPENING',
          categoryName: 'Đầu ca trực',
          timeHint: '08:30 - 09:00',
          isCompleted: true,
          completedAt: '08:50',
          priority: 'MEDIUM'
        },
        {
          id: 'CL-05',
          title: 'Tư vấn bán máy & thuyết phục khách nâng cấp gói Bảo Hành Rơi Vỡ VIP',
          category: 'MID_SHIFT',
          categoryName: 'Trong ca làm',
          timeHint: '09:00 - 19:00',
          isCompleted: true,
          completedAt: '10:45',
          priority: 'HIGH',
          note: 'Đã chốt 2 gói BH 12 tháng iPhone 15 Pro Max'
        },
        {
          id: 'CL-06',
          title: 'Chuyển máy khách bán lại / Trade-in cho KTV thẩm định đúng quy trình',
          category: 'MID_SHIFT',
          categoryName: 'Trong ca làm',
          timeHint: 'Theo phát sinh',
          isCompleted: false,
          priority: 'MEDIUM'
        },
        {
          id: 'CL-07',
          title: 'Kiểm tra bổ sung phụ kiện (kính cường lực, ốp lưng, củ cáp 20W) lên kệ',
          category: 'MID_SHIFT',
          categoryName: 'Trong ca làm',
          timeHint: '14:00 - 15:00',
          isCompleted: true,
          completedAt: '14:20',
          priority: 'NORMAL'
        },
        {
          id: 'CL-08',
          title: 'Cập nhật ghi chú tiến độ chăm sóc khách hàng và lịch hẹn lấy máy trên CRM',
          category: 'MID_SHIFT',
          categoryName: 'Trong ca làm',
          timeHint: '16:00 - 17:00',
          isCompleted: false,
          priority: 'MEDIUM'
        },
        {
          id: 'CL-09',
          title: 'Khóa toàn bộ tủ kính trưng bày máy & đối chiếu số lượng máy thực tế',
          category: 'CLOSING',
          categoryName: 'Cuối ca trực',
          timeHint: '21:00 - 21:30',
          isCompleted: false,
          priority: 'HIGH'
        },
        {
          id: 'CL-10',
          title: 'Chốt sổ quỹ tiền mặt két thu ngân & đối soát biên lai chuyển khoản POS',
          category: 'CLOSING',
          categoryName: 'Cuối ca trực',
          timeHint: '21:15 - 21:30',
          isCompleted: false,
          priority: 'HIGH'
        },
        {
          id: 'CL-11',
          title: 'Lập biên bản bàn giao ca trực & ghi chú khách hẹn lấy máy cho ca hôm sau',
          category: 'CLOSING',
          categoryName: 'Cuối ca trực',
          timeHint: '21:20 - 21:30',
          isCompleted: false,
          priority: 'HIGH'
        }
      ];
    } else {
      return [
        {
          id: 'CLT-01',
          title: 'Vệ sinh bàn kỹ thuật, kiểm tra nhiệt độ máy khò/hàn & máy ép kính chân không',
          category: 'OPENING',
          categoryName: 'Đầu ca trực',
          timeHint: '08:00 - 08:30',
          isCompleted: true,
          completedAt: '08:10',
          priority: 'HIGH'
        },
        {
          id: 'CLT-02',
          title: 'Rà soát danh sách máy sửa chữa tồn qua đêm, phân loại ca cần ưu tiên lấy gấp',
          category: 'OPENING',
          categoryName: 'Đầu ca trực',
          timeHint: '08:15 - 08:45',
          isCompleted: true,
          completedAt: '08:30',
          priority: 'HIGH'
        },
        {
          id: 'CLT-03',
          title: 'Nhận bàn giao linh kiện thay thế (Màn hình GX, Pin Pisen/Desay) từ thủ kho',
          category: 'OPENING',
          categoryName: 'Đầu ca trực',
          timeHint: '08:45 - 09:15',
          isCompleted: true,
          completedAt: '09:00',
          priority: 'MEDIUM'
        },
        {
          id: 'CLT-04',
          title: 'KCS kiểm định 100% máy nhập kho / máy thu cũ theo bảng 24 tiêu chí kỹ thuật',
          category: 'MID_SHIFT',
          categoryName: 'Trong ca làm',
          timeHint: '09:30 - 17:00',
          isCompleted: true,
          completedAt: '11:15',
          priority: 'HIGH',
          note: 'Đã hoàn tất KCS 8 máy iPhone 15 Plus'
        },
        {
          id: 'CLT-05',
          title: 'Tiến hành ép kính, thay màn hình & sàng cáp IC fix pin theo phiếu giao việc',
          category: 'MID_SHIFT',
          categoryName: 'Trong ca làm',
          timeHint: '10:00 - 18:30',
          isCompleted: true,
          completedAt: '14:40',
          priority: 'HIGH'
        },
        {
          id: 'CLT-06',
          title: 'Test lại full chức năng (Face ID, TrueTone, Loa, Mic, Camera) trước khi trả khách',
          category: 'MID_SHIFT',
          categoryName: 'Trong ca làm',
          timeHint: 'Theo từng ca máy',
          isCompleted: false,
          priority: 'HIGH'
        },
        {
          id: 'CLT-07',
          title: 'Ngắt nguồn toàn bộ thiết bị nhiệt (máy hàn, khò, hấp keo), dọn sạch bàn làm việc',
          category: 'CLOSING',
          categoryName: 'Cuối ca trực',
          timeHint: '21:00 - 21:20',
          isCompleted: false,
          priority: 'HIGH'
        },
        {
          id: 'CLT-08',
          title: 'Cất toàn bộ máy khách đang sửa dở vào tủ khóa an toàn & dán tem niêm phong',
          category: 'CLOSING',
          categoryName: 'Cuối ca trực',
          timeHint: '21:15 - 21:30',
          isCompleted: false,
          priority: 'HIGH'
        },
        {
          id: 'CLT-09',
          title: 'Bàn giao danh sách linh kiện đã xuất dùng & thống kê hoa hồng KTV trong ngày',
          category: 'CLOSING',
          categoryName: 'Cuối ca trực',
          timeHint: '21:20 - 21:30',
          isCompleted: false,
          priority: 'HIGH'
        }
      ];
    }
  }, [roleType]);

  const [checklistItems, setChecklistItems] = useState<ShiftChecklistItem[]>(initialChecklist);
  const [checklistFilter, setChecklistFilter] = useState<'ALL' | 'OPENING' | 'MID_SHIFT' | 'CLOSING'>('ALL');
  const [handoverNote, setHandoverNote] = useState<string>('');
  const [isHandoverSubmitted, setIsHandoverSubmitted] = useState<boolean>(false);
  const [isAddingCustomTask, setIsAddingCustomTask] = useState<boolean>(false);
  const [customTaskTitle, setCustomTaskTitle] = useState<string>('');
  const [customTaskCategory, setCustomTaskCategory] = useState<'OPENING' | 'MID_SHIFT' | 'CLOSING'>('MID_SHIFT');

  // Leave Requests state
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [newRequestType, setNewRequestType] = useState<'ANNUAL_LEAVE' | 'SICK_LEAVE' | 'UNPAID_LEAVE' | 'SHIFT_SWAP' | 'OVERTIME'>('ANNUAL_LEAVE');
  const [newRequestReason, setNewRequestReason] = useState('');
  const [newRequestDate, setNewRequestDate] = useState(new Date().toISOString().split('T')[0]);
  const [leaveRequestError, setLeaveRequestError] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [commissionEntries, setCommissionEntries] = useState<TechnicalCommissionLedgerEntry[]>([]);
  const [weeklySchedule, setWeeklySchedule] = useState<Record<string, any>>({});
  const [myPayrollSlip, setMyPayrollSlip] = useState<(PayrollRecord & { runStatus?: string; approvedAt?: string }) | null>(null);
  const payrollPeriod = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);

  useEffect(() => {
    let active = true;
    void fetchTechnicalCommissionLedger(payrollPeriod)
      .then((entries) => { if (active) setCommissionEntries(entries || []); })
      .catch(() => { if (active) setCommissionEntries([]); });
    void fetchMyPayrollSlip(payrollPeriod)
      .then((slip) => { if (active) setMyPayrollSlip(slip); })
      .catch(() => { if (active) setMyPayrollSlip(null); });
    return () => { active = false; };
  }, [payrollPeriod]);

  useEffect(() => {
    if (!staffMember.branchId) return;
    const now = new Date();
    const monday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
    const day = monday.getUTCDay();
    monday.setUTCDate(monday.getUTCDate() + (day === 0 ? -6 : 1 - day));
    const weekStart = monday.toISOString().slice(0, 10);
    let active = true;
    void fetchShiftBoard(weekStart, staffMember.branchId)
      .then((board) => {
        if (!active) return;
        const schedule = board.schedules.find((item) => item.staffId === staffMember.id) || board.schedules[0];
        setWeeklySchedule(schedule?.days || {});
      })
      .catch(() => { if (active) setWeeklySchedule({}); });
    return () => { active = false; };
  }, [staffMember.branchId, staffMember.id]);

  const isCheckedIn = !!attendance.checkInTime && !attendance.checkOutTime;
  const isCheckedOut = !!attendance.checkOutTime;

  const completedCount = checklistItems.filter(i => i.isCompleted).length;
  const progressPercent = Math.round((completedCount / checklistItems.length) * 100);

  const formatVND = (num: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  const handleToggleCheckItem = (id: string) => {
    setChecklistItems(prev => prev.map(item => {
      if (item.id === id) {
        const nextState = !item.isCompleted;
        const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        return {
          ...item,
          isCompleted: nextState,
          completedAt: nextState ? nowStr : undefined
        };
      }
      return item;
    }));
  };

  const handleAddCustomTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTaskTitle.trim()) return;

    const newTask: ShiftChecklistItem = {
      id: `CL-CUSTOM-${Date.now()}`,
      title: customTaskTitle.trim(),
      category: customTaskCategory,
      categoryName: customTaskCategory === 'OPENING' ? 'Đầu ca trực' : customTaskCategory === 'MID_SHIFT' ? 'Trong ca làm' : 'Cuối ca trực',
      timeHint: 'Việc phát sinh',
      isCompleted: false,
      priority: 'NORMAL'
    };

    setChecklistItems([...checklistItems, newTask]);
    setCustomTaskTitle('');
    setIsAddingCustomTask(false);
  };

  const handleSelfCheckIn = () => {
    if (onOpenCheckInModal) {
      onOpenCheckInModal();
      return;
    }
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setAttendance(prev => ({
      ...prev,
      checkInTime: timeStr,
      status: 'ON_TIME',
      verification: { gpsVerified: false, wifiVerified: false, faceVerified: false, qrScanned: false }
    }));
    if (onCheckIn) onCheckIn(timeStr);
  };

  const handleSelfCheckOut = () => {
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setAttendance(prev => ({
      ...prev,
      checkOutTime: timeStr,
      status: 'COMPLETED'
    }));
    if (onCheckOut) onCheckOut(timeStr);
  };

  const handleCreateLeaveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequestReason.trim() || submittingLeave) return;

    const newReq: LeaveRequest = {
      id: `LR_${Date.now()}`,
      code: `NP-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(10 + Math.random() * 90)}`,
      staffId: staffMember.id,
      staffName: staffMember.name,
      role: staffMember.role,
      branchName: staffMember.branchName,
      type: newRequestType === 'OVERTIME' ? 'HALF_DAY' : (newRequestType === 'UNPAID_LEAVE' ? 'UNPAID' : newRequestType),
      startDate: newRequestDate,
      endDate: newRequestDate,
      totalDays: 1,
      reason: newRequestReason,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    setSubmittingLeave(true);
    setLeaveRequestError('');
    try {
      if (!onCreateLeaveRequest) throw new Error('Chức năng gửi đơn chưa được kết nối backend.');
      await onCreateLeaveRequest(newReq);
      setNewRequestReason('');
      setIsNewRequestOpen(false);
    } catch (error: any) {
      setLeaveRequestError(error?.message || 'Không gửi được đơn.');
    } finally {
      setSubmittingLeave(false);
    }
  };
  const configuredAllowance = Number((currentUser as any)?.allowance || 0);

  const roleCommissions = useMemo(() => {
    const eligible = commissionEntries.filter((entry) => entry.status === 'ELIGIBLE' && !entry.payrollPostingId);
    const kcs = eligible.filter((entry) => String(entry.taskCode || entry.taskName || '').toUpperCase().includes('KCS'));
    const warranty = eligible.filter((entry) => String(entry.workOrderType || '').toUpperCase().includes('WARRANTY'));
    const repair = eligible.filter((entry) => !kcs.includes(entry) && !warranty.includes(entry));
    const sum = (entries: TechnicalCommissionLedgerEntry[]) => entries.reduce((total, entry) => total + Number(entry.commissionPayable ?? entry.amount ?? 0), 0);
    const transactions = eligible.map((entry) => ({
      id: entry.id,
      code: entry.workOrderId,
      product: entry.taskName || entry.taskCode || 'Task kỹ thuật',
      date: entry.eligibleAt || entry.createdAt || '',
      amount: Number(entry.commissionPayable ?? entry.amount ?? 0),
      type: entry.workOrderType || 'KỸ THUẬT'
    }));
    return {
      revenueTotal: 0,
      revenueTarget: Number(staffMember.monthlyTargetRevenue || 0),
      ordersCount: 0,
      deviceCommission: 0,
      accessoryCommission: 0,
      warrantyBonus: 0,
      kpiBonus: 0,
      kcsCount: kcs.length,
      kcsAmount: sum(kcs),
      repairCount: repair.length,
      repairAmount: sum(repair),
      warrantyCount: warranty.length,
      warrantyAmount: sum(warranty),
      tradeInCount: 0,
      tradeInAmount: 0,
      totalEarnings: sum(eligible),
      transactions
    };
  }, [commissionEntries, staffMember.monthlyTargetRevenue]);

  const weeklyDays = useMemo(() => Object.entries(weeklySchedule).sort(([left], [right]) => left.localeCompare(right)).map(([date, assignment]: [string, any]) => ({
    day: new Date(`${date}T12:00:00Z`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }),
    shift: assignment?.shiftId === 'OFF' ? 'Nghỉ' : `${assignment?.shiftName || 'Ca làm'} (${assignment?.startTime || '--:--'} - ${assignment?.endTime || '--:--'})`,
    status: assignment?.shiftId === 'OFF' ? 'OFF' : 'SCHEDULED',
    note: assignment?.note || (assignment?.shiftId === 'OFF' ? 'Ngày nghỉ' : 'Lịch đã đăng trên server')
  })), [weeklySchedule]);

  const filteredChecklist = useMemo(() => {
    if (checklistFilter === 'ALL') return checklistItems;
    return checklistItems.filter(i => i.category === checklistFilter);
  }, [checklistItems, checklistFilter]);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 animate-fadeIn font-sans pb-12">
      {/* 1. TOP PROFILE & LIVE STATUS CARD (Clean, Compact, Space-Optimized Header) */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-900 text-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-lg border border-zinc-800/80 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-full bg-gradient-to-l from-orange-500/10 to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Avatar & Info */}
          <div className="flex items-center gap-3 sm:gap-3.5">
            <div className="relative shrink-0">
              <img
                src={staffMember.avatar}
                alt={staffMember.name}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl object-cover border-2 border-orange-500/80 shadow-md"
              />
              <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-zinc-900 ${
                isCheckedIn ? 'bg-orange-500 animate-pulse' : isCheckedOut ? 'bg-zinc-400' : 'bg-orange-400'
              }`} />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-black uppercase px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  {staffMember.code}
                </span>
                <span className="text-[11px] text-zinc-300 font-medium truncate">
                  {staffMember.roleTitle}
                </span>
                <span className="text-[11px] text-zinc-500">•</span>
                <span className="text-[11px] text-orange-400/90 flex items-center gap-1 font-medium truncate">
                  <Building2 className="w-3 h-3 text-orange-400 shrink-0" />
                  {staffMember.branchName}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white truncate">
                {staffMember.name}
              </h2>
            </div>
          </div>

          {/* Compact Attendance Status Button (Tối ưu hiển thị, tiết kiệm không gian) */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5 bg-white/5 border border-white/10 px-3.5 py-2 rounded-2xl backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isCheckedIn ? 'bg-orange-400 animate-pulse ring-2 ring-orange-400/20' : isCheckedOut ? 'bg-orange-400' : 'bg-orange-400 animate-bounce'
              }`} />
              <div className="text-left">
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider leading-tight">
                  {isCheckedIn ? 'Đang Trong Ca' : isCheckedOut ? 'Đã Tan Ca' : 'Chưa Check-In'}
                </div>
                <div className="text-xs font-black text-white leading-tight font-mono">
                  {isCheckedIn ? attendance.checkInTime : isCheckedOut ? attendance.checkOutTime : attendance.scheduledStart ? `Ca: ${attendance.scheduledStart} - ${attendance.scheduledEnd}` : 'Chưa có ca đã đăng'}
                </div>
              </div>
            </div>

            <div className="h-6 w-px bg-white/15 mx-1" />

            {/* Quick Action Button */}
            {!isCheckedIn && !isCheckedOut && (
              <button
                onClick={handleSelfCheckIn}
                className="bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white text-xs font-black px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                title="Điểm danh GPS và ảnh tại cửa hàng"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Điểm Danh Vào Ca</span>
              </button>
            )}

            {isCheckedIn && (
              <button
                onClick={handleSelfCheckOut}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-black px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm shadow-rose-600/30 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                title="Xác nhận kết thúc ca làm việc hôm nay"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Chốt Ca Ra</span>
              </button>
            )}

            {isCheckedOut && (
              <button
                onClick={handleSelfCheckIn}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Quét Lại</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-zinc-200 overflow-x-auto pb-1">
        {[
          { id: 'CHECKLIST', label: 'Checklist Trong Ngày', icon: ClipboardCheck, count: `${completedCount}/${checklistItems.length} xong` },
          { id: 'ATTENDANCE', label: 'Lịch Ca & Chấm Công', icon: CalendarDays, count: '24/26 ngày' },
          { id: 'EARNINGS', label: roleType === 'SALES' ? 'Ví Doanh Số & Hoa Hồng' : 'Ví Kỹ Thuật & Thù Lao', icon: Zap, count: formatVND(roleCommissions.totalEarnings) },
          { id: 'PAYROLL', label: 'Phiếu Lương Tạm Tính', icon: DollarSign },
          { id: 'REQUESTS', label: 'Quản Lý Đơn Từ (Nghỉ/Đổi Ca)', icon: FileText, count: `${leaveRequests.length}` }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 rounded-2xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200/80'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                  isActive ? 'bg-white/20 text-white' : 'bg-orange-50 text-orange-600 font-bold'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. TAB CONTENT */}

      {/* ================= TAB 0: CHECKLIST TRONG NGÀY (DEDICATED STANDARDIZED SOP MODULE) ================= */}
      {activeTab === 'CHECKLIST' && (
        <div className="space-y-5 animate-fadeIn">
          <ShiftChecklistModule
            staffId={staffMember.id}
            staffName={staffMember.name}
            staffRole={staffMember.role}
            branchId={staffMember.branchId}
            branchName={staffMember.branchName}
            currentActivity={currentActivity}
            onChangeActivity={setCurrentActivity}
            onHandoverSubmit={(report) => {
              console.log('Handover submitted:', report);
            }}
          />
        </div>
      )}

      {/* ================= TAB 1: LỊCH CA & CHẤM CÔNG ================= */}
      {activeTab === 'ATTENDANCE' && (
        <div className="space-y-5 animate-fadeIn">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs">
              <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Ngày Công Đạt</div>
              <div className="text-2xl font-black text-zinc-900 font-mono mt-1">24 / 26</div>
              <div className="text-[11px] text-orange-600 font-bold mt-0.5">✓ Đạt 92.3% chuẩn tháng</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs">
              <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Tổng Giờ Làm Việc</div>
              <div className="text-2xl font-black text-zinc-900 font-mono mt-1">182.5 h</div>
              <div className="text-[11px] text-orange-600 font-bold mt-0.5">+10.5h tăng ca (OT)</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs">
              <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Đi Muộn / Về Sớm</div>
              <div className="text-2xl font-black text-orange-600 font-mono mt-1">0 lần</div>
              <div className="text-[11px] text-orange-600 font-bold mt-0.5">Thưởng chuyên cần: +500k</div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs">
              <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Phép Năm Còn Lại</div>
              <div className="text-2xl font-black text-rose-600 font-mono mt-1">10.0 ngày</div>
              <div className="text-[11px] text-zinc-400 font-bold mt-0.5">Đã dùng 2.0 ngày</div>
            </div>
          </div>

          {/* 7-DAY SHIFT SCHEDULE */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-zinc-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100">
              <div>
                <h3 className="text-sm sm:text-base font-black text-zinc-900 flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-orange-500" />
                  <span>Lịch phân ca tuần này</span>
                </h3>
                <p className="text-xs text-zinc-500">Phân ca trực thuộc: {staffMember.branchName}</p>
              </div>

              <button
                onClick={() => {
                  setNewRequestType('SHIFT_SWAP');
                  setIsNewRequestOpen(true);
                  setActiveTab('REQUESTS');
                }}
                className="px-3.5 py-2 bg-orange-50 hover:bg-orange-100 text-orange-600 text-xs font-bold rounded-xl border border-orange-200 transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Đề xuất đổi ca</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
              {weeklyDays.length === 0 && <div className="col-span-full rounded-2xl bg-zinc-50 p-6 text-center text-xs font-semibold text-zinc-500">Tuần này chưa có lịch đã đăng trên server.</div>}
              {weeklyDays.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-2xl border transition-all ${
                    item.status === 'IN_PROGRESS'
                      ? 'bg-orange-50/80 border-orange-300 ring-2 ring-orange-500/20'
                      : item.status === 'COMPLETED'
                      ? 'bg-orange-50/40 border-orange-200'
                      : item.status === 'OFF'
                      ? 'bg-zinc-50 border-zinc-200 opacity-60'
                      : 'bg-white border-zinc-200'
                  }`}
                >
                  <div className="text-xs font-black text-zinc-800">{item.day}</div>
                  <div className="text-xs font-bold text-zinc-600 mt-1">{item.shift}</div>
                  <div className="mt-2 pt-2 border-t border-zinc-100 flex items-center justify-between">
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                      item.status === 'COMPLETED' ? 'bg-orange-100 text-orange-800' :
                      item.status === 'IN_PROGRESS' ? 'bg-orange-500 text-white' :
                      item.status === 'OFF' ? 'bg-zinc-200 text-zinc-700' : 'bg-zinc-100 text-zinc-600'
                    }`}>
                      {item.status === 'COMPLETED' ? '✓ Đạt' :
                       item.status === 'IN_PROGRESS' ? 'Đang trực' :
                       item.status === 'OFF' ? 'Nghỉ' : 'Sắp tới'}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1">{item.note}</div>
                </div>
              ))}
            </div>
          </div>

          {/* SENSOR VERIFICATION AUDIT */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-zinc-200 shadow-2xs space-y-4">
            <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wide flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-orange-600" />
              <span>Nhật Ký Cảm Biến Điểm Danh Gần Nhất</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-800">Định Vị GPS</div>
                  <div className={`text-xs font-black ${attendance.verification?.gpsVerified ? 'text-emerald-600' : 'text-zinc-500'}`}>{attendance.verification?.gpsVerified ? `Hợp lệ • ${Math.round(attendance.verification.distanceMeters ?? attendance.verification.gpsDistanceMeters ?? 0)}m` : 'Chưa xác minh GPS'}</div>
                  <div className="text-[10px] text-zinc-400">Dữ liệu từ lần chấm công gần nhất</div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-800">Ảnh Tại Cửa Hàng</div>
                  <div className={`text-xs font-black ${attendance.verification?.photoCaptured || attendance.verification?.photoEvidenceId ? 'text-emerald-600' : 'text-zinc-500'}`}>{attendance.verification?.photoCaptured || attendance.verification?.photoEvidenceId ? 'Đã lưu bằng chứng' : 'Chưa có ảnh'}</div>
                  <div className="text-[10px] text-zinc-400">Ảnh gắn với bản ghi chấm công</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: VÍ THU NHẬP & HOA HỒNG ================= */}
      {activeTab === 'EARNINGS' && (
        <div className="space-y-5 animate-fadeIn">
          {/* Earnings Hero Banner */}
          <div className="bg-gradient-to-r from-orange-600 via-orange-600 to-orange-700 rounded-3xl p-5 sm:p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-white text-orange-600 text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                  {roleType === 'SALES' ? 'Ví Bán Hàng & KPI' : 'Ví Kỹ Thuật & KCS'}
                </span>
                <span className="text-xs text-orange-100">Cập nhật tự động thời gian thực</span>
              </div>
              <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight">
                {formatVND(roleCommissions.totalEarnings)}
              </div>
              <p className="text-xs text-orange-100 mt-1">
                {roleType === 'SALES'
                  ? 'Hoa hồng bán hàng chỉ hiển thị khi có sổ hoa hồng đã kết nối.'
                  : `Tích lũy từ ${(roleCommissions as any).kcsCount} máy KCS + ${(roleCommissions as any).repairCount} ca sửa chữa`}
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 min-w-[200px] text-xs space-y-1">
              <div className="text-orange-200">Lương cơ bản: <strong>{formatVND(staffMember.baseSalary)}</strong></div>
              <div className="text-orange-200">Phụ cấp đã cấu hình: <strong>{formatVND(configuredAllowance)}</strong></div>
              <div className="text-white font-extrabold pt-1 border-t border-white/20">
                Tổng thu nhập ước tính: {formatVND(staffMember.baseSalary + configuredAllowance + roleCommissions.totalEarnings)}
              </div>
            </div>
          </div>

          {/* Breakdown cards depending on role */}
          {roleType === 'SALES' ? (
            <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="min-w-[72%] snap-start bg-gradient-to-br from-orange-500 to-amber-500 p-4 rounded-2xl text-white shadow-md sm:min-w-52 [&_*]:text-white">
                <div className="text-[10px] font-bold text-orange-600 uppercase">Hoa Hồng Máy Mới</div>
                <div className="text-xl font-black text-zinc-900 font-mono mt-1">+{formatVND((roleCommissions as any).deviceCommission)}</div>
                <div className="text-[10px] text-zinc-400 mt-1">1.2% trên doanh số máy</div>
              </div>

              <div className="min-w-[72%] snap-start bg-gradient-to-br from-emerald-600 to-teal-500 p-4 rounded-2xl text-white shadow-md sm:min-w-52 [&_*]:text-white">
                <div className="text-[10px] font-bold text-orange-600 uppercase">Hoa Hồng Phụ Kiện</div>
                <div className="text-xl font-black text-zinc-900 font-mono mt-1">+{formatVND((roleCommissions as any).accessoryCommission)}</div>
                <div className="text-[10px] text-zinc-400 mt-1">5% giá trị phụ kiện</div>
              </div>

              <div className="min-w-[72%] snap-start rounded-2xl bg-gradient-to-br from-zinc-900 to-[#e94112] p-4 text-white shadow-md sm:min-w-52 [&_*]:text-white">
                <div className="text-[10px] font-bold text-orange-600 uppercase">Thưởng Bảo Hành Mở Rộng</div>
                <div className="text-xl font-black text-zinc-900 font-mono mt-1">+{formatVND((roleCommissions as any).warrantyBonus)}</div>
                <div className="text-[10px] text-zinc-400 mt-1">10% gói bảo hành rơi vỡ</div>
              </div>

              <div className="min-w-[72%] snap-start bg-gradient-to-br from-fuchsia-600 to-rose-500 p-4 rounded-2xl text-white shadow-md sm:min-w-52 [&_*]:text-white">
                <div className="text-[10px] font-bold text-rose-600 uppercase">Thưởng Vượt KPI</div>
                <div className="text-xl font-black text-zinc-900 font-mono mt-1">+{formatVND((roleCommissions as any).kpiBonus)}</div>
                <div className="text-[10px] text-zinc-400 mt-1">Thưởng mốc &gt; 120% target</div>
              </div>
            </div>
          ) : (
            <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="min-w-[72%] snap-start bg-gradient-to-br from-orange-500 to-amber-500 p-4 rounded-2xl text-white shadow-md sm:min-w-52 [&_*]:text-white">
                <div className="text-[10px] font-bold text-orange-600 uppercase">KCS Kiểm Định ({ (roleCommissions as any).kcsCount } máy)</div>
                <div className="text-xl font-black text-zinc-900 font-mono mt-1">+{formatVND((roleCommissions as any).kcsAmount)}</div>
                <div className="text-[10px] text-zinc-400 mt-1">35.000 đ / máy nhập</div>
              </div>

              <div className="min-w-[72%] snap-start bg-gradient-to-br from-emerald-600 to-teal-500 p-4 rounded-2xl text-white shadow-md sm:min-w-52 [&_*]:text-white">
                <div className="text-[10px] font-bold text-orange-600 uppercase">Sửa Chữa ({ (roleCommissions as any).repairCount } ca)</div>
                <div className="text-xl font-black text-zinc-900 font-mono mt-1">+{formatVND((roleCommissions as any).repairAmount)}</div>
                <div className="text-[10px] text-zinc-400 mt-1">Ép kính, thay màn/pin, main</div>
              </div>

              <div className="min-w-[72%] snap-start rounded-2xl bg-gradient-to-br from-zinc-900 to-[#e94112] p-4 text-white shadow-md sm:min-w-52 [&_*]:text-white">
                <div className="text-[10px] font-bold text-orange-600 uppercase">Bảo Hành Tiêu Chuẩn</div>
                <div className="text-xl font-black text-zinc-900 font-mono mt-1">+{formatVND((roleCommissions as any).warrantyAmount)}</div>
                <div className="text-[10px] text-zinc-400 mt-1">50.000 đ / máy bảo hành</div>
              </div>

              <div className="min-w-[72%] snap-start bg-gradient-to-br from-fuchsia-600 to-rose-500 p-4 rounded-2xl text-white shadow-md sm:min-w-52 [&_*]:text-white">
                <div className="text-[10px] font-bold text-rose-600 uppercase">Test Thu Cũ ({ (roleCommissions as any).tradeInCount } máy)</div>
                <div className="text-xl font-black text-zinc-900 font-mono mt-1">+{formatVND((roleCommissions as any).tradeInAmount)}</div>
                <div className="text-[10px] text-zinc-400 mt-1">50.000 đ / máy thu cũ</div>
              </div>
            </div>
          )}

          {/* Transactions list */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
              <h3 className="font-black text-xs sm:text-sm text-zinc-900 uppercase tracking-wide">
                Lịch Sử Biến Động Hoa Hồng Gần Đây
              </h3>
              <span className="text-xs text-zinc-400">Trích xuất tự động</span>
            </div>

            <div className="divide-y divide-zinc-100">
              {roleCommissions.transactions.length === 0 && <div className="p-8 text-center text-xs font-semibold text-zinc-500">Chưa có giao dịch hoa hồng hợp lệ trong kỳ này.</div>}
              {roleCommissions.transactions.map((tx: any) => (
                <div key={tx.id} className="p-4 hover:bg-orange-50/20 transition-colors flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-extrabold text-zinc-900">{tx.product}</div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                        <span className="font-mono font-bold text-orange-600">{tx.code}</span>
                        <span>•</span>
                        <span>{tx.date}</span>
                        <span>•</span>
                        <span className="bg-zinc-100 px-1.5 py-0.2 rounded text-zinc-600">{tx.type}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-black text-orange-600 font-mono text-sm">+{formatVND(tx.amount)}</div>
                    <span className="text-[10px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                      ✓ Đã cộng ví
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: PHIẾU LƯƠNG TẠM TÍNH ================= */}
      {activeTab === 'PAYROLL' && (
        <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-2xs space-y-6 animate-fadeIn max-w-3xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100">
            <div>
              <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-orange-100 text-orange-800">
                Kỳ lương {payrollPeriod}
              </span>
              <h3 className="text-xl font-black text-zinc-900 mt-1">Phiếu Lương & Thu Nhập Chi Tiết</h3>
              <p className="text-xs text-zinc-500">Mã nhân sự: {staffMember.code} • {staffMember.name}</p>
            </div>

            <div className="text-left sm:text-right">
              <div className="text-xs text-zinc-400 font-bold uppercase">Thực Nhận Tạm Tính</div>
              <div className="text-2xl font-black text-orange-600 font-mono">
                {myPayrollSlip ? formatVND(myPayrollSlip.netSalary) : 'Chưa chốt kỳ'}
              </div>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <h4 className="font-bold text-zinc-700 uppercase tracking-wider text-[11px]">1. Các Khoản Thu Nhập (+)</h4>
            <div className="bg-zinc-50 rounded-2xl p-4 space-y-2.5 border border-zinc-200">
              <div className="flex justify-between items-center font-bold">
                <span className="text-zinc-600">Lương vị trí theo hợp đồng:</span>
                <span className="font-mono text-zinc-900 font-black">{formatVND(myPayrollSlip?.baseSalary ?? staffMember.baseSalary)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-600">Phụ cấp đã cấu hình:</span>
                <span className="font-mono text-zinc-900">{formatVND(myPayrollSlip?.allowances ?? configuredAllowance)}</span>
              </div>
              <div className="flex justify-between items-center text-orange-600 font-bold">
                <span>Tổng hoa hồng & thù lao (Từ Ví):</span>
                <span className="font-mono font-black">{formatVND(roleCommissions.totalEarnings)}</span>
              </div>
            </div>

            <h4 className="font-bold text-zinc-700 uppercase tracking-wider text-[11px] pt-2">2. Các Khoản Trừ (-)</h4>
            <div className="bg-zinc-50 rounded-2xl p-4 space-y-2.5 border border-zinc-200">
              <div className="flex justify-between items-center text-zinc-500">
                <span>Tạm ứng lương:</span>
                <span className="font-mono">-{formatVND(myPayrollSlip?.advances || 0)}</span>
              </div>
              <div className="flex justify-between items-center text-zinc-500">
                <span>Phạt vi phạm quy chế / Đi muộn:</span>
                <span className="font-mono">0 đ</span>
              </div>
            </div>
          </div>

          <div className={`${myPayrollSlip ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'} rounded-2xl p-4 border flex items-center justify-between text-xs`}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-orange-600" />
              <div>
                <div className="font-bold text-zinc-900">Trạng thái kỳ lương:</div>
                <div className="text-zinc-600 text-[11px]">{myPayrollSlip ? `Đã được duyệt trên server lúc ${myPayrollSlip.approvedAt ? new Date(myPayrollSlip.approvedAt).toLocaleString('vi-VN') : ''}` : 'Chưa có kỳ lương đã duyệt. Các số tạm tính không được xem là phiếu lương chính thức.'}</div>
              </div>
            </div>
            <span className={`font-bold px-3 py-1 rounded-xl ${myPayrollSlip ? 'text-emerald-700 bg-emerald-100' : 'text-amber-700 bg-amber-100'}`}>{myPayrollSlip ? myPayrollSlip.runStatus || 'ĐÃ DUYỆT' : 'CHƯA CHỐT'}</span>
          </div>
        </div>
      )}

      {/* ================= TAB 4: ĐƠN TỪ & ĐỀ XUẤT ================= */}
      {activeTab === 'REQUESTS' && (
        <div className="space-y-5 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-zinc-200 shadow-2xs">
            <div>
              <h3 className="text-base font-black text-zinc-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-500" />
                <span>Quản Lý Đơn Từ & Đề Xuất Của Tôi</span>
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">Tạo đơn xin nghỉ phép, đổi ca với đồng nghiệp, đăng ký tăng ca</p>
            </div>

            <button
              onClick={() => setIsNewRequestOpen(!isNewRequestOpen)}
              className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-black rounded-xl shadow-md shadow-orange-500/25 flex items-center gap-1.5 cursor-pointer self-start sm:self-auto active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo Đơn Mới</span>
            </button>
          </div>

          {/* Create New Request Form */}
          {isNewRequestOpen && (
            <form onSubmit={handleCreateLeaveRequest} className="bg-white rounded-3xl p-5 sm:p-6 border border-orange-200 shadow-md space-y-4 animate-scaleIn">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                <h4 className="text-sm font-black text-zinc-900">Gửi Đề Xuất / Đơn Từ Mới</h4>
                <button
                  type="button"
                  onClick={() => setIsNewRequestOpen(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-700"
                >
                  ✕ Đóng
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-zinc-700">Loại Đề Xuất / Đơn:</label>
                  <select
                    value={newRequestType}
                    onChange={(e) => setNewRequestType(e.target.value as any)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-zinc-800 outline-none focus:border-orange-500"
                  >
                    <option value="ANNUAL_LEAVE">Nghỉ Phép Năm (Hưởng nguyên lương)</option>
                    <option value="SHIFT_SWAP">Đổi Ca Làm Việc Với Đồng Nghiệp</option>
                    <option value="OVERTIME">Đăng Ký Tăng Ca (OT)</option>
                    <option value="SICK_LEAVE">Nghỉ Ốm Đau (Hưởng BHXH)</option>
                    <option value="UNPAID_LEAVE">Nghỉ Việc Riêng Không Hưởng Lương</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-zinc-700">Ngày áp dụng:</label>
                  <input
                    type="date"
                    value={newRequestDate}
                    onChange={(e) => setNewRequestDate(e.target.value)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-zinc-800 outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="space-y-1 text-xs">
                <label className="font-bold text-zinc-700">Lý do chi tiết & Người phối hợp:</label>
                <textarea
                  rows={3}
                  value={newRequestReason}
                  onChange={(e) => setNewRequestReason(e.target.value)}
                  placeholder="Nhập lý do chi tiết, người đổi ca (nếu có)..."
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-800 outline-none focus:border-orange-500"
                  required
                />
              </div>

              {leaveRequestError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{leaveRequestError}</div>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewRequestOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingLeave}
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-black rounded-xl shadow-md shadow-orange-500/20 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submittingLeave ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{submittingLeave ? 'Đang lưu…' : 'Gửi Đơn Cho Quản Lý'}</span>
                </button>
              </div>
            </form>
          )}

          {/* List of leave requests */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="divide-y divide-zinc-100">
              {leaveRequests.map((req) => (
                <div key={req.id} className="p-4 sm:p-5 hover:bg-zinc-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-zinc-900 text-sm">{req.reason}</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        req.type === 'ANNUAL_LEAVE' ? 'bg-rose-100 text-rose-800' :
                        req.type === 'SHIFT_SWAP' ? 'bg-orange-100 text-orange-800' :
                        req.type === 'OVERTIME' ? 'bg-orange-100 text-orange-800' : 'bg-zinc-100 text-zinc-700'
                      }`}>
                        {req.type === 'ANNUAL_LEAVE' ? 'Phép năm' :
                         req.type === 'SHIFT_SWAP' ? 'Đổi ca' :
                         req.type === 'OVERTIME' ? 'Tăng ca OT' : 'Nghỉ riêng'}
                      </span>
                    </div>
                    <div className="text-zinc-400 mt-1 flex items-center gap-2 text-[11px]">
                      <span>Ngày: {req.startDate}</span>
                      <span>•</span>
                      <span>Tạo lúc: {req.createdAt}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className={`text-xs font-bold px-3 py-1 rounded-xl ${
                      req.status === 'APPROVED' ? 'bg-orange-100 text-orange-800' :
                      req.status === 'PENDING' ? 'bg-orange-100 text-orange-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {req.status === 'APPROVED' ? '✓ Đã Phê Duyệt' :
                       req.status === 'PENDING' ? '⏳ Chờ CHT Duyệt' : '✕ Từ Chối'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ActivityIcon: React.FC<{ role: 'SALES' | 'TECH' }> = ({ role }) => {
  if (role === 'SALES') {
    return <Briefcase className="w-3.5 h-3.5 text-orange-400" />;
  }
  return <Wrench className="w-3.5 h-3.5 text-rose-400" />;
};
