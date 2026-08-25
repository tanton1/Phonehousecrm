import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  HelpCircle,
  Loader2,
  Search,
  UserCheck,
  Users,
  WalletCards
} from 'lucide-react';
import type { AttendanceRecord, LeaveRequest, SalesInvoice, StaffMember, StoreBranch, WarrantyTicket } from '../types';
import { getVietnamDateString } from '../utils/dateTimeUtils';
import ShiftSchedulingView from './ShiftSchedulingView';
import { MonthlyPayrollTable } from '../features/payroll/components/MonthlyPayrollTable';
import { HRMetricCarousel, type HRMetricItem } from './HRMetricCarousel';

export type HRSubModule = 'OVERVIEW' | 'SHIFTS' | 'TIMESHEET' | 'PAYROLL';

export interface HRHubViewProps {
  currentUser?: any;
  staffList?: StaffMember[];
  attendanceRecords?: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  invoices?: SalesInvoice[];
  warrantyTickets?: WarrantyTicket[];
  branches?: StoreBranch[];
  initialSubModule?: HRSubModule;
  onApproveLeave?: (request: LeaveRequest) => Promise<void> | void;
}

const currentPeriod = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit'
}).format(new Date()).slice(0, 7);

function attendanceMatchesStaff(record: AttendanceRecord, staff: StaffMember) {
  return record.staffId === staff.id || record.staffId === String((staff as any).authUid || '');
}

export const HRHubView: React.FC<HRHubViewProps> = ({
  currentUser,
  staffList: rawStaff = [],
  attendanceRecords = [],
  leaveRequests = [],
  branches = [],
  initialSubModule,
  onApproveLeave
}) => {
  const role = String(currentUser?.role || '').toUpperCase();
  const canManage = ['ADMIN', 'MANAGER', 'STORE_MANAGER'].includes(role);
  const canViewPayroll = canManage || role === 'ACCOUNTANT';
  const [activeModule, setActiveModule] = useState<HRSubModule>(initialSubModule || 'OVERVIEW');
  const [selectedBranchId, setSelectedBranchId] = useState(() => role === 'ADMIN' ? 'ALL' : String(currentUser?.branchId || 'ALL'));
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [approvingId, setApprovingId] = useState('');

  useEffect(() => {
    if (initialSubModule) setActiveModule(initialSubModule);
  }, [initialSubModule]);

  useEffect(() => {
    setStatusFilter('ALL');
    setSearch('');
  }, [activeModule]);

  const accessibleBranches = useMemo(() => {
    if (role === 'ADMIN') return branches.filter((branch) => branch.isActive !== false);
    const ids = new Set([currentUser?.branchId, ...(currentUser?.assignedBranchIds || [])].filter(Boolean));
    return branches.filter((branch) => branch.isActive !== false && ids.has(branch.id));
  }, [branches, currentUser?.assignedBranchIds, currentUser?.branchId, role]);

  useEffect(() => {
    if (selectedBranchId === 'ALL' && role !== 'ADMIN') {
      setSelectedBranchId(String(currentUser?.branchId || accessibleBranches[0]?.id || ''));
    }
  }, [accessibleBranches, currentUser?.branchId, role, selectedBranchId]);

  const staffList = useMemo(() => rawStaff
    .filter((staff) => staff?.id && staff.status !== 'INACTIVE')
    .filter((staff) => selectedBranchId === 'ALL' || staff.branchId === selectedBranchId || (staff.assignedBranchIds || []).includes(selectedBranchId)), [rawStaff, selectedBranchId]);

  const scopedAttendance = useMemo(() => attendanceRecords.filter((record) => {
    if (selectedBranchId !== 'ALL' && record.branchId !== selectedBranchId) return false;
    return staffList.some((staff) => attendanceMatchesStaff(record, staff));
  }), [attendanceRecords, selectedBranchId, staffList]);

  const today = getVietnamDateString();
  const todayAttendance = useMemo(() => scopedAttendance.filter((record) => record.date === today), [scopedAttendance, today]);
  const monthAttendance = useMemo(() => scopedAttendance.filter((record) => String(record.date || '').startsWith(selectedPeriod)), [scopedAttendance, selectedPeriod]);
  const scopedLeaveRequests = useMemo(() => leaveRequests.filter((request) => {
    if (selectedBranchId === 'ALL') return true;
    const staff = staffList.find((item) => item.id === request.staffId || String((item as any).authUid || '') === request.staffId);
    return Boolean(staff);
  }), [leaveRequests, selectedBranchId, staffList]);

  const checkedInCount = todayAttendance.filter((record) => Boolean(record.checkInTime)).length;
  const lateCount = todayAttendance.filter((record) => record.status === 'LATE' || record.punctualityStatus === 'LATE' || Number(record.lateMinutes || 0) > 0).length;
  const completedCount = todayAttendance.filter((record) => record.status === 'COMPLETED' || record.attendanceStatus === 'COMPLETED').length;
  const pendingLeaveCount = scopedLeaveRequests.filter((request) => request.status === 'PENDING').length;
  const workDayKeys = new Set(monthAttendance.filter((record) => Boolean(record.checkInTime)).map((record) => `${record.staffId}_${record.date}`));

  const metrics: HRMetricItem[] = [
    { id: 'staff', label: 'Nhân sự hoạt động', value: staffList.length, note: selectedBranchId === 'ALL' ? 'Toàn hệ thống' : accessibleBranches.find((branch) => branch.id === selectedBranchId)?.name, icon: Users },
    { id: 'checked-in', label: 'Đã vào ca hôm nay', value: `${checkedInCount}/${staffList.length}`, note: `${completedCount} người đã kết thúc ca`, icon: UserCheck },
    { id: 'late', label: 'Cần kiểm tra', value: lateCount, note: lateCount ? 'Trường hợp đi trễ hôm nay' : 'Không có trường hợp đi trễ', icon: AlertTriangle },
    activeModule === 'TIMESHEET'
      ? { id: 'workdays', label: `Ngày công ${selectedPeriod}`, value: workDayKeys.size, note: 'Theo dữ liệu chấm công', icon: CalendarDays }
      : { id: 'leave', label: 'Đơn chờ duyệt', value: pendingLeaveCount, note: 'Nghỉ phép hoặc đổi ca', icon: FileText }
  ];

  const modules: Array<{ id: HRSubModule; label: string; icon: typeof Users }> = [
    { id: 'OVERVIEW', label: 'Hôm nay', icon: UserCheck },
    { id: 'SHIFTS', label: 'Xếp ca', icon: CalendarDays },
    { id: 'TIMESHEET', label: 'Bảng công', icon: Clock3 },
    ...(canViewPayroll ? [{ id: 'PAYROLL' as const, label: 'Bảng lương', icon: WalletCards }] : [])
  ];

  const timesheetRows = useMemo(() => staffList.map((staff) => {
    const records = monthAttendance.filter((record) => attendanceMatchesStaff(record, staff));
    const workedDates = new Set(records.filter((record) => Boolean(record.checkInTime)).map((record) => record.date));
    const completedDates = new Set(records.filter((record) => Boolean(record.checkOutTime)).map((record) => record.date));
    return {
      staff,
      workDays: workedDates.size,
      completedDays: completedDates.size,
      lateMinutes: records.reduce((sum, record) => sum + Number(record.lateMinutes || 0), 0),
      otMinutes: records.reduce((sum, record) => sum + Number(record.otMinutes || 0), 0),
      missingCheckout: records.filter((record) => record.checkInTime && !record.checkOutTime && record.date !== today).length
    };
  }).filter((row) => !search.trim() || `${row.staff.name} ${row.staff.code} ${row.staff.roleTitle}`.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((row) => statusFilter === 'ALL'
      || (statusFilter === 'LATE' && row.lateMinutes > 0)
      || (statusFilter === 'MISSING' && row.missingCheckout > 0)
      || (statusFilter === 'OT' && row.otMinutes > 0)), [monthAttendance, search, staffList, statusFilter, today]);

  const visibleTodayAttendance = useMemo(() => todayAttendance.filter((record) => statusFilter === 'ALL'
    || (statusFilter === 'WORKING' && Boolean(record.checkInTime) && !record.checkOutTime)
    || (statusFilter === 'LATE' && (record.status === 'LATE' || record.punctualityStatus === 'LATE' || Number(record.lateMinutes || 0) > 0))
    || (statusFilter === 'COMPLETED' && (record.status === 'COMPLETED' || record.attendanceStatus === 'COMPLETED'))), [statusFilter, todayAttendance]);

  const approveLeave = async (request: LeaveRequest) => {
    if (!onApproveLeave || !canManage) return;
    setApprovingId(request.id);
    try {
      await onApproveLeave(request);
    } finally {
      setApprovingId('');
    }
  };

  return (
    <div className="w-full space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#ff4b16]"><Building2 className="h-4 w-4" /> PhoneHouse</div>
            <h1 className="mt-1 text-2xl font-black text-zinc-950">Nhân sự & Lương</h1>
          </div>
          <button title="Chỉ hiển thị dữ liệu đã đồng bộ từ server. Kỳ lương chưa duyệt luôn được ghi rõ là bản nháp." className="p-2 text-zinc-400 hover:text-[#ff4b16]"><HelpCircle className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 flex w-full border-b border-zinc-200">
          {modules.map((module) => {
            const Icon = module.icon;
            return <button key={module.id} onClick={() => setActiveModule(module.id)} className={`flex h-10 min-w-0 flex-1 items-center justify-center gap-1 border-b-2 px-1 text-[10px] font-black transition sm:gap-2 sm:text-xs ${activeModule === module.id ? 'border-[#ff4b16] text-[#ff4b16]' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}><Icon className="hidden h-4 w-4 sm:block" />{module.label}</button>;
          })}
        </div>

        {activeModule !== 'SHIFTS' && <div className="mt-3 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} className="h-9 min-w-36 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-bold outline-none focus:border-[#ff4b16] sm:text-xs">
            {role === 'ADMIN' && <option value="ALL">Toàn hệ thống</option>}
            {accessibleBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          {(activeModule === 'TIMESHEET' || activeModule === 'PAYROLL') && <input type="month" value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)} className="h-9 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-bold outline-none focus:border-[#ff4b16] sm:text-xs" />}
          {(activeModule === 'TIMESHEET' || activeModule === 'PAYROLL') && <label className="relative min-w-36 flex-1 sm:min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm nhân viên" className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-2 text-[11px] font-bold outline-none focus:border-[#ff4b16] sm:text-xs" /></label>}
          {activeModule === 'OVERVIEW' && <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-bold outline-none focus:border-[#ff4b16]"><option value="ALL">Tất cả trạng thái</option><option value="WORKING">Đang làm</option><option value="LATE">Đi trễ</option><option value="COMPLETED">Đã kết ca</option></select>}
          {activeModule === 'TIMESHEET' && <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-bold outline-none focus:border-[#ff4b16]"><option value="ALL">Tất cả</option><option value="LATE">Có đi trễ</option><option value="MISSING">Thiếu checkout</option><option value="OT">Có tăng ca</option></select>}
          {activeModule === 'PAYROLL' && <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-bold outline-none focus:border-[#ff4b16]"><option value="ALL">Tất cả</option><option value="MISSING_SCHEDULE">Thiếu lịch</option><option value="COMMISSION">Có hoa hồng</option></select>}
        </div>}
      </section>

      {(activeModule === 'OVERVIEW' || activeModule === 'TIMESHEET') && <HRMetricCarousel items={metrics} />}

      {activeModule === 'OVERVIEW' && <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 p-4"><div><h2 className="font-black text-zinc-900">Trạng thái hôm nay</h2><p className="mt-1 text-xs font-semibold text-zinc-500">Dữ liệu chấm công cập nhật trực tiếp từ Firestore.</p></div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-[#ff4b16]">{todayAttendance.length} bản ghi</span></div>
          {visibleTodayAttendance.length === 0 ? <div className="p-8 text-center text-sm font-semibold text-zinc-500">Chưa có bản ghi phù hợp bộ lọc.</div> : <div className="divide-y divide-zinc-100">{visibleTodayAttendance.map((record) => <article key={record.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><div className="truncate text-sm font-black text-zinc-900">{record.staffName}</div><div className="mt-1 truncate text-xs font-semibold text-zinc-500">{record.branchName} · {record.shiftName || 'Chưa có ca'}</div></div><div className="text-right"><div className="text-sm font-black text-zinc-900">{record.checkInTime || '--:--'} → {record.checkOutTime || 'đang làm'}</div><div className={`mt-1 text-[11px] font-black ${Number(record.lateMinutes || 0) > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{Number(record.lateMinutes || 0) > 0 ? `Trễ ${record.lateMinutes} phút` : 'Đúng giờ'}</div></div></article>)}</div>}
        </section>

        <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 p-4"><div><h2 className="font-black text-zinc-900">Đơn nghỉ & đổi ca</h2><p className="mt-1 text-xs font-semibold text-zinc-500">Không còn dùng dữ liệu mẫu trong trình duyệt.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{pendingLeaveCount} chờ</span></div>
          {scopedLeaveRequests.length === 0 ? <div className="p-8 text-center text-sm font-semibold text-zinc-500">Chưa có đơn nào.</div> : <div className="divide-y divide-zinc-100">{scopedLeaveRequests.slice(0, 8).map((request) => <article key={request.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-black text-zinc-900">{request.staffName}</div><div className="mt-1 text-xs font-semibold text-zinc-500">{request.startDate} · {request.reason}</div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${request.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : request.status === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{request.status === 'APPROVED' ? 'Đã duyệt' : request.status === 'REJECTED' ? 'Từ chối' : 'Chờ duyệt'}</span></div>{canManage && request.status === 'PENDING' && <button onClick={() => void approveLeave(request)} disabled={approvingId === request.id} className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl bg-zinc-900 px-3 text-xs font-black text-white disabled:opacity-50">{approvingId === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Duyệt đơn</button>}</article>)}</div>}
        </section>
      </div>}

      {activeModule === 'SHIFTS' && <ShiftSchedulingView currentUser={currentUser} staffList={rawStaff} branches={branches} />}

      {activeModule === 'TIMESHEET' && <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-4"><h2 className="font-black text-zinc-900">Bảng công {selectedPeriod}</h2><p className="mt-1 text-xs font-semibold text-zinc-500">Mỗi nhân viên chỉ có một dòng; số ngày được gom theo ngày chấm công thực tế.</p></div>
        {timesheetRows.length === 0 ? <div className="p-8 text-center text-sm font-semibold text-zinc-500">Không có nhân viên phù hợp.</div> : <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">{timesheetRows.map((row) => <article key={row.staff.id} className="rounded-2xl border border-zinc-200 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-black text-zinc-900">{row.staff.name}</div><div className="mt-1 truncate text-xs font-semibold text-zinc-500">{row.staff.roleTitle}</div></div><span className="rounded-xl bg-orange-50 px-3 py-2 text-lg font-black text-[#ff4b16]">{row.workDays}</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-zinc-50 p-2"><div className="font-black text-zinc-900">{row.completedDays}</div><div className="mt-1 text-[10px] font-bold text-zinc-500">Đủ checkout</div></div><div className="rounded-xl bg-zinc-50 p-2"><div className="font-black text-[#ff4b16]">{row.lateMinutes}p</div><div className="mt-1 text-[10px] font-bold text-zinc-500">Đi trễ</div></div><div className="rounded-xl bg-zinc-50 p-2"><div className="font-black text-zinc-800">{Math.round(row.otMinutes / 60 * 10) / 10}h</div><div className="mt-1 text-[10px] font-bold text-zinc-500">Tăng ca</div></div></div>{row.missingCheckout > 0 && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Thiếu checkout {row.missingCheckout} ngày</div>}</article>)}</div>}
      </section>}

      {activeModule === 'PAYROLL' && <MonthlyPayrollTable staffList={staffList} branches={accessibleBranches} attendanceRecords={monthAttendance} selectedMonth={selectedPeriod} selectedBranchId={selectedBranchId} search={search} recordFilter={statusFilter} />}
    </div>
  );
};

export default HRHubView;
