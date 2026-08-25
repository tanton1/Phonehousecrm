import React, { useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle2, DollarSign, Loader2, Save, ShieldCheck, User } from 'lucide-react';
import type { AttendanceRecord, StaffMember, StoreBranch } from '../../../types';
import { fetchTechnicalCommissionLedger, type TechnicalCommissionLedgerEntry } from '../../../services/technicalApiClient';
import { approvePayrollRun, calculatePayrollRun, fetchPayrollRun, type PayrollRun } from '../../../services/payrollApiClient';
import { HRMetricCarousel, type HRMetricItem } from '../../../components/HRMetricCarousel';

export interface PayrollRecord {
  staffId: string;
  staffName: string;
  role: string;
  branchId?: string;
  branchName: string;
  baseSalary: number;
  workDays: number;
  standardWorkDays: number;
  posCommission: number;
  techCommission: number;
  allowances: number;
  advances: number;
  netSalary: number;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
}

export interface MonthlyPayrollTableProps {
  staffList: StaffMember[];
  branches: StoreBranch[];
  attendanceRecords?: AttendanceRecord[];
  selectedMonth?: string;
  selectedBranchId?: string;
  search?: string;
  recordFilter?: string;
  onApproveAndPayPayroll?: (month: string, records: PayrollRecord[]) => void;
}

const formatMoney = (value: number) => `${Math.round(Number(value || 0)).toLocaleString('vi-VN')}đ`;

export const MonthlyPayrollTable: React.FC<MonthlyPayrollTableProps> = ({
  staffList,
  branches,
  attendanceRecords = [],
  selectedMonth = new Date().toISOString().slice(0, 7),
  selectedBranchId = 'ALL',
  search = '',
  recordFilter = 'ALL',
  onApproveAndPayPayroll
}) => {
  const month = selectedMonth;
  const [technicalLedger, setTechnicalLedger] = useState<TechnicalCommissionLedgerEntry[]>([]);
  const [ledgerError, setLedgerError] = useState('');
  const [backendRun, setBackendRun] = useState<PayrollRun | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);
  const [action, setAction] = useState<'CALCULATE' | 'APPROVE' | ''>('');
  const [runError, setRunError] = useState('');

  useEffect(() => {
    let active = true;
    setLedgerError('');
    void fetchTechnicalCommissionLedger(month)
      .then((entries) => { if (active) setTechnicalLedger(entries || []); })
      .catch((error) => { if (active) { setTechnicalLedger([]); setLedgerError(error?.message || 'Không thể tải sổ hoa hồng kỹ thuật.'); } });
    return () => { active = false; };
  }, [month]);

  useEffect(() => {
    let active = true;
    setLoadingRun(true);
    setRunError('');
    void fetchPayrollRun(month, selectedBranchId)
      .then((run) => { if (active) setBackendRun(run); })
      .catch((error) => { if (active) { setBackendRun(null); setRunError(error?.message || 'Không tải được kỳ lương đã lưu.'); } })
      .finally(() => { if (active) setLoadingRun(false); });
    return () => { active = false; };
  }, [month, selectedBranchId]);

  const previewRecords: PayrollRecord[] = useMemo(() => (staffList || [])
    .filter(Boolean)
    .filter((staff) => selectedBranchId === 'ALL' || staff.branchId === selectedBranchId || (staff.assignedBranchIds || []).includes(selectedBranchId))
    .map((staff) => {
      const baseSalary = Number(staff.baseSalary || 0);
      const staffUid = String((staff as any).authUid || staff.id);
      const staffAttendance = attendanceRecords.filter((record) => (record.staffId === staff.id || record.staffId === staffUid) && record.date.startsWith(month));
      const scheduledDates = new Set(staffAttendance.filter((record) => record.shiftId && record.shiftId !== 'OFF').map((record) => record.date));
      const actualDates = new Set(staffAttendance.filter((record) => Boolean(record.checkInTime)).map((record) => record.date));
      const standardWorkDays = scheduledDates.size;
      const workDays = actualDates.size;
      const posCommission = Number((staff as any).salesCommission || 0) + Number((staff as any).kpiSalesBonus || 0);
      const techCommission = technicalLedger
        .filter((entry) => entry.staffUid === staffUid && entry.status === 'ELIGIBLE' && !entry.payrollPostingId)
        .reduce((sum, entry) => sum + Number(entry.commissionPayable ?? entry.amount ?? 0), 0);
      const allowances = Number((staff as any).allowance || 0);
      const advances = Number((staff as any).advanceSalaryDeductions || 0);
      const proratedBase = standardWorkDays > 0 ? Math.round(baseSalary / standardWorkDays * Math.min(workDays, standardWorkDays)) : 0;
      const branch = branches.find((item) => item.id === staff.branchId);
      return {
        staffId: staff.id,
        staffName: staff.displayName || staff.name || 'Nhân viên',
        role: staff.role || 'STAFF',
        branchId: staff.branchId,
        branchName: branch?.name || 'Chưa phân chi nhánh',
        baseSalary,
        workDays,
        standardWorkDays,
        posCommission,
        techCommission,
        allowances,
        advances,
        netSalary: proratedBase + posCommission + techCommission + allowances - advances,
        status: 'DRAFT'
      };
    }), [attendanceRecords, branches, month, selectedBranchId, staffList, technicalLedger]);

  const records = backendRun?.records?.length ? backendRun.records : previewRecords;
  const searchKey = search.trim().toLowerCase();
  const visibleRecords = records
    .filter((record) => !searchKey || `${record.staffName} ${record.branchName} ${record.role}`.toLowerCase().includes(searchKey))
    .filter((record) => recordFilter === 'ALL'
      || (recordFilter === 'MISSING_SCHEDULE' && record.standardWorkDays === 0)
      || (recordFilter === 'COMMISSION' && Number(record.posCommission || 0) + Number(record.techCommission || 0) > 0));
  const totalPayroll = records.reduce((sum, record) => sum + Number(record.netSalary || 0), 0);
  const totalCommission = records.reduce((sum, record) => sum + Number(record.posCommission || 0) + Number(record.techCommission || 0), 0);
  const metrics: HRMetricItem[] = [
    { id: 'payroll', label: `Quỹ lương ${month}`, value: formatMoney(totalPayroll), note: backendRun ? `Đã lưu · ${backendRun.status}` : 'Bản xem trước chưa lưu', icon: DollarSign },
    { id: 'commission', label: 'Hoa hồng trong kỳ', value: formatMoney(totalCommission), note: 'Kỹ thuật + bán hàng đã ghi nhận', icon: Award },
    { id: 'staff', label: 'Nhân sự trong bảng', value: records.length, note: selectedBranchId === 'ALL' ? 'Tất cả chi nhánh' : branches.find((branch) => branch.id === selectedBranchId)?.name, icon: User },
    { id: 'status', label: 'Trạng thái kỳ lương', value: backendRun?.status === 'APPROVED' ? 'Đã duyệt' : backendRun ? 'Bản nháp' : 'Chưa lưu', note: backendRun?.updatedAt ? `Cập nhật ${new Date(backendRun.updatedAt).toLocaleString('vi-VN')}` : 'Bấm Tính & lưu lên server', icon: ShieldCheck }
  ];

  const calculate = async () => {
    setAction('CALCULATE');
    setRunError('');
    try {
      setBackendRun(await calculatePayrollRun(month, selectedBranchId));
    } catch (error: any) {
      setRunError(error?.message || 'Không tính và lưu được kỳ lương.');
    } finally {
      setAction('');
    }
  };

  const approve = async () => {
    if (!backendRun || !window.confirm('Duyệt kỳ lương này? Sau khi duyệt sẽ không thể tính lại và hoa hồng kỹ thuật được khóa vào kỳ.')) return;
    setAction('APPROVE');
    setRunError('');
    try {
      const approved = await approvePayrollRun(backendRun.id);
      const nextRun = { ...approved, records: backendRun.records };
      setBackendRun(nextRun);
      onApproveAndPayPayroll?.(month, nextRun.records);
    } catch (error: any) {
      setRunError(error?.message || 'Không duyệt được kỳ lương.');
    } finally {
      setAction('');
    }
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border px-4 py-3 text-xs font-semibold ${runError || ledgerError ? 'border-red-200 bg-red-50 text-red-700' : backendRun ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
        {runError || ledgerError || (backendRun ? `Kỳ lương ${month} đã được lưu trên backend với trạng thái ${backendRun.status}.` : 'Số bên dưới là bản xem trước từ dữ liệu thật. Bấm “Tính & lưu” để tạo kỳ lương trên backend.')}
      </div>

      <HRMetricCarousel items={metrics} />

      <section className="flex justify-end rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex w-full gap-2 sm:w-auto">
          <button onClick={() => void calculate()} disabled={Boolean(action) || loadingRun || backendRun?.status === 'APPROVED' || backendRun?.status === 'PAID'} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-xs font-black text-white disabled:opacity-40 sm:flex-none">{action === 'CALCULATE' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Tính & lưu</button>
          <button onClick={() => void approve()} disabled={Boolean(action) || !backendRun || backendRun.status !== 'DRAFT'} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff4b16] to-[#ff6b3d] px-4 text-xs font-black text-white shadow-sm shadow-orange-500/20 disabled:opacity-40 sm:flex-none">{action === 'APPROVE' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Duyệt kỳ</button>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        {loadingRun ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm font-bold text-zinc-500"><Loader2 className="h-5 w-5 animate-spin text-[#ff4b16]" />Đang tải kỳ lương…</div> : visibleRecords.length === 0 ? <div className="p-10 text-center text-sm font-semibold text-zinc-500">Chưa có nhân sự phù hợp bộ lọc.</div> : <>
          <div className="grid gap-3 p-3 lg:hidden">{visibleRecords.map((record) => <article key={record.staffId} className="rounded-2xl border border-zinc-200 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-black text-zinc-900">{record.staffName}</div><div className="mt-1 truncate text-xs font-semibold text-zinc-500">{record.branchName} · {record.role}</div></div><div className="text-right"><div className="text-lg font-black text-[#ff4b16]">{formatMoney(record.netSalary)}</div><div className="mt-1 text-[10px] font-bold text-zinc-500">Thực lĩnh</div></div></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-zinc-50 p-2"><div className="font-black">{record.workDays}/{record.standardWorkDays}</div><div className="mt-1 text-[10px] font-bold text-zinc-500">Ngày công</div></div><div className="rounded-xl bg-zinc-50 p-2"><div className="font-black text-zinc-800">{formatMoney(record.posCommission)}</div><div className="mt-1 text-[10px] font-bold text-zinc-500">Hoa hồng sale</div></div><div className="rounded-xl bg-zinc-50 p-2"><div className="font-black text-zinc-800">{formatMoney(record.techCommission)}</div><div className="mt-1 text-[10px] font-bold text-zinc-500">Hoa hồng KTV</div></div></div>{record.standardWorkDays === 0 && <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Chưa có lịch ca đã đăng trong tháng nên chưa thể phân bổ lương cơ bản.</div>}</article>)}</div>
          <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[1050px] text-left text-xs"><thead><tr className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-black uppercase tracking-wide text-zinc-500"><th className="px-4 py-3">Nhân viên</th><th className="px-4 py-3">Chi nhánh</th><th className="px-4 py-3 text-right">Lương cơ bản</th><th className="px-4 py-3 text-center">Ngày công</th><th className="px-4 py-3 text-right">HH bán hàng</th><th className="px-4 py-3 text-right">HH kỹ thuật</th><th className="px-4 py-3 text-right">Phụ cấp</th><th className="px-4 py-3 text-right">Thực lĩnh</th></tr></thead><tbody className="divide-y divide-zinc-100">{visibleRecords.map((record) => <tr key={record.staffId} className="hover:bg-zinc-50"><td className="px-4 py-3"><div className="font-black text-zinc-900">{record.staffName}</div><div className="mt-1 text-[10px] font-bold text-zinc-400">{record.role}</div></td><td className="px-4 py-3 font-semibold text-zinc-600">{record.branchName}</td><td className="px-4 py-3 text-right font-mono font-bold">{formatMoney(record.baseSalary)}</td><td className="px-4 py-3 text-center font-mono font-black">{record.workDays}/{record.standardWorkDays}</td><td className="px-4 py-3 text-right font-mono font-bold text-zinc-700">{formatMoney(record.posCommission)}</td><td className="px-4 py-3 text-right font-mono font-bold text-zinc-700">{formatMoney(record.techCommission)}</td><td className="px-4 py-3 text-right font-mono font-bold">{formatMoney(record.allowances)}</td><td className="px-4 py-3 text-right font-mono text-sm font-black text-[#ff4b16]">{formatMoney(record.netSalary)}</td></tr>)}</tbody></table></div>
        </>}
      </section>
    </div>
  );
};
