import React, { useEffect, useState } from 'react';
import { AlertTriangle, Award, CheckCircle2, Download, DollarSign, Eye, Loader2, Plus, Save, ShieldCheck, User, X, XCircle } from 'lucide-react';
import type { FundAccount, StaffMember, StoreBranch } from '../../../types';
import { approvePayrollRun, calculatePayrollRun, createPayrollAdjustment, fetchPayrollAdjustments, fetchPayrollRun, payPayrollRun as submitPayrollPayment, reviewPayrollAdjustment, type PayrollAdjustment, type PayrollRun } from '../../../services/payrollApiClient';
import { HRMetricCarousel, type HRMetricItem } from '../../../components/HRMetricCarousel';
import { getVietnamMonthString } from '../../../utils/dateTimeUtils';

export interface PayrollRecord {
  staffUid: string;
  staffId: string;
  staffName: string;
  role: string;
  branchId?: string;
  payrollBranchId?: string;
  branchName: string;
  baseSalary: number;
  proratedBaseSalary?: number;
  workDays: number;
  standardWorkDays: number;
  paidLeaveDays?: number;
  unpaidLeaveDays?: number;
  posCommission: number;
  techCommission: number;
  allowances: number;
  advances: number;
  adjustmentEarnings?: number;
  adjustmentDeductions?: number;
  netSalary: number;
  blockingIssues?: string[];
  warnings?: string[];
  status: 'DRAFT' | 'APPROVED' | 'PAID';
}

export interface MonthlyPayrollTableProps {
  branches: StoreBranch[];
  staffList?: StaffMember[];
  selectedMonth?: string;
  selectedBranchId?: string;
  search?: string;
  recordFilter?: string;
  funds?: FundAccount[];
  currentUserRole?: string;
  onApproveAndPayPayroll?: (month: string, records: PayrollRecord[]) => void;
}

const formatMoney = (value: number) => `${Math.round(Number(value || 0)).toLocaleString('vi-VN')}đ`;

const ISSUE_LABELS: Record<string, string> = {
  BASE_SALARY_MISSING: 'Chưa cấu hình lương cơ bản',
  SCHEDULE_MISSING: 'Chưa có lịch làm việc',
  DUPLICATE_USER_PROFILE: 'Trùng hồ sơ nhân viên',
  LEGACY_USER_UID_MIGRATION_REQUIRED: 'Cần chuẩn hóa UID Firebase',
  COMMISSION_LEDGER_MIGRATION_REQUIRED: 'Hoa hồng chưa chuẩn hóa',
  PAYROLL_ADJUSTMENT_MIGRATION_REQUIRED: 'Điều chỉnh lương chưa chuẩn hóa',
  NEGATIVE_NET_REQUIRES_RECOVERY_ADJUSTMENT: 'Thực lĩnh âm, cần xử lý thu hồi'
};

function issueLabel(value: string) {
  return ISSUE_LABELS[value] || value.replaceAll('_', ' ').toLowerCase();
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export const MonthlyPayrollTable: React.FC<MonthlyPayrollTableProps> = ({
  branches,
  staffList = [],
  selectedMonth = getVietnamMonthString(),
  selectedBranchId = 'ALL',
  search = '',
  recordFilter = 'ALL',
  funds = [],
  currentUserRole = '',
  onApproveAndPayPayroll
}) => {
  const month = selectedMonth;
  const [backendRun, setBackendRun] = useState<PayrollRun | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);
  const [action, setAction] = useState<'CALCULATE' | 'APPROVE' | 'PAY' | ''>('');
  const [runError, setRunError] = useState('');
  const [paymentFundId, setPaymentFundId] = useState('');
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]);
  const [adjustmentAction, setAdjustmentAction] = useState('');
  const [adjustmentForm, setAdjustmentForm] = useState({ staffUid: '', type: 'EARNING' as PayrollAdjustment['type'], category: 'OVERTIME' as PayrollAdjustment['category'], amount: '', reason: '' });
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingRun(true);
    setRunError('');
    setBackendRun(null);
    setSelectedRecord(null);
    setPaymentFundId('');
    void fetchPayrollRun(month, selectedBranchId)
      .then((run) => { if (active) setBackendRun(run); })
      .catch((error) => { if (active) { setBackendRun(null); setRunError(error?.message || 'Không tải được kỳ lương đã lưu.'); } })
      .finally(() => { if (active) setLoadingRun(false); });
    return () => { active = false; };
  }, [month, selectedBranchId]);

  useEffect(() => {
    setAdjustments([]);
    if (selectedBranchId === 'ALL') {
      return;
    }
    let active = true;
    void fetchPayrollAdjustments(month, selectedBranchId)
      .then((items) => { if (active) setAdjustments(items); })
      .catch((error) => { if (active) setRunError(error?.message || 'Không tải được điều chỉnh tăng/giảm lương.'); });
    return () => { active = false; };
  }, [month, selectedBranchId]);

  const records = backendRun?.records || [];
  const searchKey = search.trim().toLowerCase();
  const visibleRecords = records
    .filter((record) => !searchKey || `${record.staffName} ${record.branchName} ${record.role}`.toLowerCase().includes(searchKey))
    .filter((record) => recordFilter === 'ALL'
      || (recordFilter === 'MISSING_SCHEDULE' && record.standardWorkDays === 0)
      || (recordFilter === 'COMMISSION' && Number(record.posCommission || 0) + Number(record.techCommission || 0) > 0)
      || (recordFilter === 'ISSUES' && ((record.blockingIssues?.length || 0) > 0 || (record.warnings?.length || 0) > 0)));
  const totalPayroll = records.reduce((sum, record) => sum + Number(record.netSalary || 0), 0);
  const totalCommission = records.reduce((sum, record) => sum + Number(record.posCommission || 0) + Number(record.techCommission || 0), 0);
  const blockingRecordCount = records.filter((record) => (record.blockingIssues?.length || 0) > 0).length;
  const warningRecordCount = records.filter((record) => (record.warnings?.length || 0) > 0).length;
  const pendingAdjustmentCount = adjustments.filter((item) => item.status === 'PENDING').length;
  const metrics: HRMetricItem[] = [
    { id: 'payroll', label: `Quỹ lương ${month}`, value: formatMoney(totalPayroll), note: backendRun ? `Đã tính server · ${backendRun.status}` : 'Chưa tính trên server', icon: DollarSign },
    { id: 'commission', label: 'Hoa hồng trong kỳ', value: formatMoney(totalCommission), note: 'Kỹ thuật + bán hàng đã ghi nhận', icon: Award },
    { id: 'staff', label: 'Nhân sự trong bảng', value: records.length, note: selectedBranchId === 'ALL' ? 'Tất cả chi nhánh' : branches.find((branch) => branch.id === selectedBranchId)?.name, icon: User },
    { id: 'status', label: 'Trạng thái kỳ lương', value: backendRun?.status === 'PAID' ? 'Đã chi' : backendRun?.status === 'APPROVED' ? 'Đã duyệt' : backendRun ? 'Bản nháp' : 'Chưa lưu', note: backendRun?.updatedAt ? `Cập nhật ${new Date(backendRun.updatedAt).toLocaleString('vi-VN')}` : 'Bấm Tính & lưu lên server', icon: ShieldCheck }
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
    if (!backendRun || Number(backendRun.blockingIssueCount || 0) > 0 || !window.confirm('Duyệt kỳ lương này? Sau khi duyệt sẽ không thể tính lại và hoa hồng được khóa vào kỳ. Người đã tính kỳ phải khác người duyệt.')) return;
    setAction('APPROVE');
    setRunError('');
    try {
      const approved = await approvePayrollRun(backendRun.id);
      const nextRun = {
        ...approved,
        records: backendRun.records.map((record) => ({ ...record, status: 'APPROVED' as const }))
      };
      setBackendRun(nextRun);
      onApproveAndPayPayroll?.(month, nextRun.records);
    } catch (error: any) {
      setRunError(error?.message || 'Không duyệt được kỳ lương.');
    } finally {
      setAction('');
    }
  };

  const availablePaymentFunds = funds.filter((fund) => fund.branchId === selectedBranchId && fund.isActive !== false && fund.isArchived !== true);
  const pay = async () => {
    if (!backendRun || !paymentFundId || !window.confirm(`Xác nhận chi ${formatMoney(backendRun.totalPayroll)} từ quỹ đã chọn? Người chi phải khác người duyệt.`)) return;
    setAction('PAY');
    setRunError('');
    try {
      const result = await submitPayrollPayment(backendRun.id, {
        fundId: paymentFundId,
        idempotencyKey: `PAYROLL_${backendRun.id}_${paymentFundId}`,
        note: `Chi lương kỳ ${backendRun.period}`
      });
      setBackendRun({
        ...backendRun,
        status: 'PAID',
        paidAt: result.paidAt,
        records: backendRun.records.map((record) => ({ ...record, status: 'PAID' as const }))
      });
    } catch (error: any) {
      setRunError(error?.message || 'Không chi được kỳ lương.');
    } finally {
      setAction('');
    }
  };

  const submitAdjustment = async () => {
    const amount = Number(adjustmentForm.amount);
    if (!adjustmentForm.staffUid || !Number.isSafeInteger(amount) || amount <= 0 || adjustmentForm.reason.trim().length < 5) {
      setRunError('Chọn nhân viên, nhập số tiền VNĐ nguyên và lý do ít nhất 5 ký tự.');
      return;
    }
    setAdjustmentAction('CREATE');
    setRunError('');
    try {
      const created = await createPayrollAdjustment({ ...adjustmentForm, amount, period: month });
      setAdjustments((items) => [created, ...items]);
      setAdjustmentForm((form) => ({ ...form, amount: '', reason: '' }));
    } catch (error: any) {
      setRunError(error?.message || 'Không tạo được phiếu điều chỉnh lương.');
    } finally {
      setAdjustmentAction('');
    }
  };

  const decideAdjustment = async (item: PayrollAdjustment, decision: 'APPROVE' | 'REJECT') => {
    const reason = decision === 'REJECT' ? window.prompt('Lý do từ chối (ít nhất 5 ký tự):', '') || '' : '';
    if (decision === 'REJECT' && reason.trim().length < 5) return;
    setAdjustmentAction(item.id);
    setRunError('');
    try {
      const reviewed = await reviewPayrollAdjustment(item.id, decision, reason);
      setAdjustments((items) => items.map((entry) => entry.id === reviewed.id ? reviewed : entry));
    } catch (error: any) {
      setRunError(error?.message || 'Không duyệt được phiếu điều chỉnh lương.');
    } finally {
      setAdjustmentAction('');
    }
  };

  const exportCsv = () => {
    if (!records.length) return;
    const header = ['Nhân viên', 'UID Firebase', 'Chi nhánh', 'Lương cơ bản', 'Lương theo công', 'Công thực tế', 'Công chuẩn', 'Phép hưởng lương', 'Phép không lương', 'HH bán hàng', 'HH kỹ thuật', 'Phụ cấp', 'Tạm ứng/khấu trừ', 'Điều chỉnh cộng', 'Thực lĩnh', 'Trạng thái', 'Cảnh báo'];
    const rows = records.map((record) => [
      record.staffName,
      record.staffUid,
      record.branchName,
      record.baseSalary,
      record.proratedBaseSalary ?? record.baseSalary,
      record.workDays,
      record.standardWorkDays,
      record.paidLeaveDays || 0,
      record.unpaidLeaveDays || 0,
      record.posCommission,
      record.techCommission,
      record.allowances,
      record.advances,
      record.adjustmentEarnings || 0,
      record.netSalary,
      backendRun?.status || record.status,
      [...(record.blockingIssues || []), ...(record.warnings || [])].map(issueLabel).join('; ')
    ]);
    const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bang-luong-${month}${selectedBranchId !== 'ALL' ? `-${selectedBranchId}` : ''}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const eligibleStaff = staffList.filter((staff) => {
    const workplaceIds = [...new Set([staff.branchId, ...(staff.assignedBranchIds || [])].filter(Boolean))];
    const payrollBranchId = staff.payrollBranchId || (workplaceIds.length === 1 ? workplaceIds[0] : '');
    return payrollBranchId === selectedBranchId;
  });

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border px-4 py-3 text-xs font-semibold ${runError ? 'border-red-200 bg-red-50 text-red-700' : backendRun ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
        {runError || (backendRun ? `Kỳ lương ${month} đã được tính trên backend với trạng thái ${backendRun.status}.` : 'Chưa có kỳ lương server-authoritative. Bấm “Tính & lưu” để máy chủ tổng hợp công, phép và hoa hồng.')}
      </div>
      {backendRun && Number(backendRun.blockingIssueCount || 0) > 0 && <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">Có {backendRun.blockingIssueCount} lỗi chặn duyệt: thiếu lương cơ bản hoặc lịch ca. Hãy cấu hình đủ rồi tính lại kỳ.</div>}
      {backendRun && Number(backendRun.warningCount || 0) > 0 && <div className="flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Có {backendRun.warningCount} cảnh báo nguồn dữ liệu. Có thể xem từng nhân viên trước khi duyệt.</div>}
      {selectedBranchId === 'ALL' && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-900">Bảng “Tất cả chi nhánh” chỉ dùng để tổng hợp. Hãy chọn một chi nhánh cụ thể để duyệt và chi lương.</div>}

      <HRMetricCarousel items={metrics} />

      <section className="flex justify-end rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
          <button onClick={() => void calculate()} disabled={Boolean(action) || loadingRun || backendRun?.status === 'APPROVED' || backendRun?.status === 'PAID'} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-xs font-black text-white disabled:opacity-40 sm:flex-none">{action === 'CALCULATE' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Tính & lưu</button>
          <button onClick={() => void approve()} disabled={Boolean(action) || !backendRun || backendRun.status !== 'DRAFT' || selectedBranchId === 'ALL' || Number(backendRun.blockingIssueCount || 0) > 0} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ff4b16] to-[#ff6b3d] px-4 text-xs font-black text-white shadow-sm shadow-orange-500/20 disabled:opacity-40 sm:flex-none">{action === 'APPROVE' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Duyệt kỳ</button>
          <button onClick={exportCsv} disabled={!records.length} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-800 disabled:opacity-40 sm:flex-none"><Download className="h-4 w-4" />Xuất CSV</button>
          {backendRun?.status === 'APPROVED' && ['ADMIN', 'ACCOUNTANT'].includes(currentUserRole.toUpperCase()) && <><select value={paymentFundId} onChange={(event) => setPaymentFundId(event.target.value)} className="h-10 min-w-40 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold"><option value="">Chọn quỹ chi lương</option>{availablePaymentFunds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select><button onClick={() => void pay()} disabled={Boolean(action) || !paymentFundId} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white disabled:opacity-40 sm:flex-none">{action === 'PAY' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}Chi lương</button></>}
        </div>
      </section>

      {backendRun && <div className="grid gap-2 sm:grid-cols-3">
        <div className={`rounded-2xl border px-3 py-2 text-xs font-bold ${blockingRecordCount ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{blockingRecordCount ? `${blockingRecordCount} nhân viên đang chặn duyệt` : 'Không có lỗi chặn duyệt'}</div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">{warningRecordCount} nhân viên có cảnh báo nguồn</div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-700">{pendingAdjustmentCount} phiếu điều chỉnh chờ duyệt</div>
      </div>}

      {selectedBranchId !== 'ALL' && <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-black text-zinc-900">Tăng/giảm lương trong kỳ</h3><p className="mt-1 text-xs font-semibold text-zinc-500">OT, thưởng, tạm ứng và khấu trừ phải được duyệt trước khi tính lại bảng lương.</p></div><span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-black text-zinc-600">{pendingAdjustmentCount} chờ duyệt</span></div>
        <div className="mt-4 grid gap-2 md:grid-cols-6">
          <select value={adjustmentForm.staffUid} onChange={(event) => setAdjustmentForm((form) => ({ ...form, staffUid: event.target.value }))} disabled={backendRun?.status === 'APPROVED' || backendRun?.status === 'PAID'} className="h-10 rounded-xl border border-zinc-200 px-3 text-xs font-bold md:col-span-2"><option value="">Chọn nhân viên</option>{eligibleStaff.map((staff) => <option key={staff.id} value={String((staff as any).authUid || staff.id)}>{staff.name}</option>)}</select>
          <select value={adjustmentForm.type} onChange={(event) => setAdjustmentForm((form) => ({ ...form, type: event.target.value as PayrollAdjustment['type'], category: event.target.value === 'EARNING' ? 'OVERTIME' : 'ADVANCE' }))} className="h-10 rounded-xl border border-zinc-200 px-3 text-xs font-bold"><option value="EARNING">Khoản cộng</option><option value="DEDUCTION">Khoản trừ</option></select>
          <select value={adjustmentForm.category} onChange={(event) => setAdjustmentForm((form) => ({ ...form, category: event.target.value as PayrollAdjustment['category'] }))} className="h-10 rounded-xl border border-zinc-200 px-3 text-xs font-bold">{adjustmentForm.type === 'EARNING' ? <><option value="OVERTIME">Tăng ca</option><option value="ATTENDANCE_BONUS">Thưởng chuyên cần</option><option value="MANUAL">Thưởng khác</option></> : <><option value="ADVANCE">Tạm ứng</option><option value="PENALTY">Khấu trừ</option><option value="MANUAL">Điều chỉnh khác</option></>}</select>
          <input inputMode="numeric" value={adjustmentForm.amount} onChange={(event) => setAdjustmentForm((form) => ({ ...form, amount: event.target.value.replace(/\D/g, '') }))} placeholder="Số tiền VNĐ" className="h-10 rounded-xl border border-zinc-200 px-3 text-xs font-bold" />
          <button onClick={() => void submitAdjustment()} disabled={Boolean(adjustmentAction) || backendRun?.status === 'APPROVED' || backendRun?.status === 'PAID'} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-3 text-xs font-black text-white disabled:opacity-40"><Plus className="h-4 w-4" />Tạo phiếu</button>
          <input value={adjustmentForm.reason} onChange={(event) => setAdjustmentForm((form) => ({ ...form, reason: event.target.value }))} placeholder="Lý do/diễn giải bắt buộc" className="h-10 rounded-xl border border-zinc-200 px-3 text-xs font-semibold md:col-span-6" />
        </div>
        {adjustments.length > 0 && <div className="mt-4 divide-y divide-zinc-100 rounded-2xl border border-zinc-200">{adjustments.slice(0, 20).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div><div className="text-xs font-black text-zinc-900">{item.staffName} · {item.category}</div><div className="mt-1 text-[11px] font-semibold text-zinc-500">{item.reason}</div></div><div className="flex items-center gap-2"><span className={`font-mono text-sm font-black ${item.type === 'EARNING' ? 'text-emerald-600' : 'text-red-600'}`}>{item.type === 'EARNING' ? '+' : '-'}{formatMoney(item.amount)}</span><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black">{item.status}</span>{item.status === 'PENDING' && ['ADMIN', 'ACCOUNTANT'].includes(currentUserRole.toUpperCase()) && <><button title="Duyệt" onClick={() => void decideAdjustment(item, 'APPROVE')} disabled={Boolean(adjustmentAction)} className="rounded-lg bg-emerald-50 p-2 text-emerald-700 disabled:opacity-40"><CheckCircle2 className="h-4 w-4" /></button><button title="Từ chối" onClick={() => void decideAdjustment(item, 'REJECT')} disabled={Boolean(adjustmentAction)} className="rounded-lg bg-red-50 p-2 text-red-700 disabled:opacity-40"><XCircle className="h-4 w-4" /></button></>}</div></div>)}</div>}
      </section>}

      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        {loadingRun ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm font-bold text-zinc-500"><Loader2 className="h-5 w-5 animate-spin text-[#ff4b16]" />Đang tải kỳ lương…</div> : visibleRecords.length === 0 ? <div className="p-10 text-center text-sm font-semibold text-zinc-500">Chưa có nhân sự phù hợp bộ lọc.</div> : <>
          <div className="grid gap-3 p-3 lg:hidden">{visibleRecords.map((record) => <article key={record.staffId} className="rounded-2xl border border-zinc-200 p-4"><button type="button" onClick={() => setSelectedRecord(record)} className="w-full text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-black text-zinc-900">{record.staffName}</div><div className="mt-1 truncate text-xs font-semibold text-zinc-500">{record.branchName} · {record.role}</div></div><div className="text-right"><div className="text-lg font-black text-[#ff4b16]">{formatMoney(record.netSalary)}</div><div className="mt-1 text-[10px] font-bold text-zinc-500">Thực lĩnh</div></div></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-zinc-50 p-2"><div className="font-black">{record.workDays}/{record.standardWorkDays}</div><div className="mt-1 text-[10px] font-bold text-zinc-500">Công · phép {record.paidLeaveDays || 0}</div></div><div className="rounded-xl bg-zinc-50 p-2"><div className="font-black text-zinc-800">{formatMoney(record.posCommission)}</div><div className="mt-1 text-[10px] font-bold text-zinc-500">Hoa hồng sale</div></div><div className="rounded-xl bg-zinc-50 p-2"><div className="font-black text-zinc-800">{formatMoney(record.techCommission)}</div><div className="mt-1 text-[10px] font-bold text-zinc-500">Hoa hồng KTV</div></div></div>{((record.blockingIssues?.length || 0) > 0 || (record.warnings?.length || 0) > 0) && <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Cần xem: {[...(record.blockingIssues || []), ...(record.warnings || [])].map(issueLabel).join(' · ')}</div>}<div className="mt-3 inline-flex items-center gap-1 text-[11px] font-black text-[#ff4b16]">Xem chi tiết <Eye className="h-3.5 w-3.5" /></div></button></article>)}</div>
          <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[1050px] text-left text-xs"><thead><tr className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-black uppercase tracking-wide text-zinc-500"><th className="px-4 py-3">Nhân viên</th><th className="px-4 py-3">Chi nhánh</th><th className="px-4 py-3 text-right">Lương theo công</th><th className="px-4 py-3 text-center">Ngày công</th><th className="px-4 py-3 text-right">HH bán hàng</th><th className="px-4 py-3 text-right">HH kỹ thuật</th><th className="px-4 py-3 text-right">Phụ cấp</th><th className="px-4 py-3 text-right">Thực lĩnh</th><th className="px-4 py-3 text-right">Xem</th></tr></thead><tbody className="divide-y divide-zinc-100">{visibleRecords.map((record) => <tr key={record.staffId} className="hover:bg-zinc-50"><td className="px-4 py-3"><div className="font-black text-zinc-900">{record.staffName}</div><div className="mt-1 text-[10px] font-bold text-zinc-400">{record.role}{(record.blockingIssues?.length || 0) > 0 ? ` · ${(record.blockingIssues || []).map(issueLabel).join(', ')}` : ''}</div></td><td className="px-4 py-3 font-semibold text-zinc-600">{record.branchName}</td><td className="px-4 py-3 text-right font-mono font-bold"><div>{formatMoney(record.proratedBaseSalary ?? record.baseSalary)}</div><div className="text-[10px] text-zinc-400">Chuẩn {formatMoney(record.baseSalary)}</div></td><td className="px-4 py-3 text-center font-mono font-black">{record.workDays}/{record.standardWorkDays}<div className="text-[10px] text-zinc-400">Phép {record.paidLeaveDays || 0}</div></td><td className="px-4 py-3 text-right font-mono font-bold text-zinc-700">{formatMoney(record.posCommission)}</td><td className="px-4 py-3 text-right font-mono font-bold text-zinc-700">{formatMoney(record.techCommission)}</td><td className="px-4 py-3 text-right font-mono font-bold">{formatMoney(record.allowances)}</td><td className="px-4 py-3 text-right font-mono text-sm font-black text-[#ff4b16]">{formatMoney(record.netSalary)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => setSelectedRecord(record)} aria-label={`Xem chi tiết ${record.staffName}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-[#ff4b16] hover:bg-orange-100"><Eye className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
        </>}
      </section>

      {selectedRecord && <PayrollRecordDrawer record={selectedRecord} period={month} onClose={() => setSelectedRecord(null)} />}
    </div>
  );
};

function PayrollRecordDrawer({ record, period, onClose }: { record: PayrollRecord; period: string; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const lines = [
    ['Lương cơ bản', formatMoney(record.baseSalary)],
    ['Lương theo công', formatMoney(record.proratedBaseSalary ?? record.baseSalary)],
    ['Công thực tế / công chuẩn', `${record.workDays} / ${record.standardWorkDays}`],
    ['Phép hưởng lương', `${record.paidLeaveDays || 0} ngày`],
    ['Phép không lương', `${record.unpaidLeaveDays || 0} ngày`],
    ['Hoa hồng bán hàng', formatMoney(record.posCommission)],
    ['Hoa hồng kỹ thuật', formatMoney(record.techCommission)],
    ['Phụ cấp', formatMoney(record.allowances)],
    ['Tạm ứng / khấu trừ', formatMoney(record.advances)],
    ['Điều chỉnh cộng', formatMoney(record.adjustmentEarnings || 0)],
    ['Thực lĩnh', formatMoney(record.netSalary)]
  ];
  return <div role="dialog" aria-modal="true" aria-label={`Chi tiết phiếu lương ${record.staffName}`} className="fixed inset-0 z-[150] flex justify-end bg-black/35 backdrop-blur-[2px]" onClick={onClose}>
    <aside className="flex h-full w-full max-w-xl flex-col bg-[#f7f7f8] shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <header className="border-b border-zinc-200 bg-white px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ff4b16]">Phiếu lương chi tiết · {period}</div><h2 className="mt-1 truncate text-xl font-black text-zinc-950">{record.staffName}</h2><p className="mt-1 truncate text-xs font-semibold text-zinc-500">{record.role} · {record.branchName}</p></div><button type="button" onClick={onClose} aria-label="Đóng" className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100"><X className="h-5 w-5" /></button></div>
        <div className="mt-4 flex items-end justify-between rounded-2xl bg-zinc-950 p-4 text-white"><div><div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Thực lĩnh</div><div className="mt-1 text-2xl font-black tabular-nums">{formatMoney(record.netSalary)}</div></div><span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black">{record.status === 'PAID' ? 'Đã chi' : record.status === 'APPROVED' ? 'Đã duyệt' : 'Bản nháp'}</span></div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-2 gap-2">{lines.map(([label, value]) => <div key={label} className={`rounded-xl p-3 ${label === 'Thực lĩnh' ? 'bg-orange-50 ring-1 ring-orange-200' : 'bg-white'}`}><div className="text-[10px] font-bold text-zinc-500">{label}</div><div className={`mt-1 text-sm font-black ${label === 'Thực lĩnh' ? 'text-[#ff4b16]' : 'text-zinc-900'}`}>{value}</div></div>)}</div>
        {((record.blockingIssues?.length || 0) > 0 || (record.warnings?.length || 0) > 0) && <section className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 text-xs font-black text-amber-900"><AlertTriangle className="h-4 w-4" /> Kiểm tra trước khi duyệt</div>{[...(record.blockingIssues || []).map((item) => `Lỗi: ${issueLabel(item)}`), ...(record.warnings || []).map((item) => `Cảnh báo: ${issueLabel(item)}`)].map((item) => <div key={item} className="mt-2 text-xs font-semibold text-amber-800">• {item}</div>)}</section>}
        <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600"><div className="font-black text-zinc-900">Nguyên tắc</div><p className="mt-1 leading-5">Lương theo công được máy chủ tính từ chấm công đã hoàn tất, lịch ca đã đăng và phép đã duyệt. Chỉ kỳ đã duyệt mới được khóa dữ liệu; phiếu lương đã chi không thể tính lại.</p></div>
      </main>
    </aside>
  </div>;
}
