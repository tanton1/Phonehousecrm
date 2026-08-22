import React, { useEffect, useState, useMemo } from 'react';
import { AttendanceRecord, StaffMember, StoreBranch } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { DollarSign, Award, Calendar, CheckCircle2, User, Filter, ArrowDownToLine, Download } from 'lucide-react';
import { fetchTechnicalCommissionLedger, TechnicalCommissionLedgerEntry } from '../../../services/technicalApiClient';

export interface PayrollRecord {
  staffId: string;
  staffName: string;
  role: string;
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
  selectedMonth?: string; // e.g. "2026-08"
  onApproveAndPayPayroll?: (month: string, records: PayrollRecord[]) => void;
}

export const MonthlyPayrollTable: React.FC<MonthlyPayrollTableProps> = ({
  staffList,
  branches,
  attendanceRecords = [],
  selectedMonth = new Date().toISOString().slice(0, 7),
  onApproveAndPayPayroll
}) => {
  const [month, setMonth] = useState(selectedMonth);
  const [selectedBranchId, setSelectedBranchId] = useState('ALL');
  const [technicalLedger, setTechnicalLedger] = useState<TechnicalCommissionLedgerEntry[]>([]);
  const [ledgerError, setLedgerError] = useState('');

  useEffect(() => {
    let active = true;
    setLedgerError('');
    void fetchTechnicalCommissionLedger(month)
      .then(entries => { if (active) setTechnicalLedger(entries || []); })
      .catch(error => { if (active) { setTechnicalLedger([]); setLedgerError(error?.message || 'Không thể tải sổ hoa hồng kỹ thuật.'); } });
    return () => { active = false; };
  }, [month]);

  // Compute payroll records from staff data
  const payrollRecords: PayrollRecord[] = useMemo(() => {
    return (staffList || []).filter(Boolean).map(staff => {
      const baseSalary = Number(staff?.baseSalary || 0);
      const staffAttendance = attendanceRecords.filter(record => record.staffId === staff.id && record.date.startsWith(month));
      const standardDates = new Set(staffAttendance.filter(record => record.attendanceStatus !== 'ON_LEAVE').map(record => record.date));
      const actualDates = new Set(staffAttendance.filter(record => record.status !== 'ABSENT' && record.attendanceStatus !== 'ABSENT' && record.attendanceStatus !== 'ON_LEAVE' && !!record.checkInTime).map(record => record.date));
      const standardWorkDays = standardDates.size;
      const workDays = actualDates.size;
      const posCommission = Number((staff as any).salesCommission || 0) + Number((staff as any).kpiSalesBonus || 0);
      const authoritativeStaffUid = String((staff as any).authUid || staff.id);
      const techCommission = technicalLedger
        .filter(entry => entry.staffUid === authoritativeStaffUid && entry.status === 'ELIGIBLE' && !entry.payrollPostingId)
        .reduce((sum, entry) => sum + Number(entry.commissionPayable ?? entry.amount ?? 0), 0);
      const allowances = Number((staff as any).allowance || 0);
      const advances = Number((staff as any).advanceSalaryDeductions || 0);

      const proratedBase = standardWorkDays > 0 ? Math.round((baseSalary / standardWorkDays) * workDays) : 0;
      const netSalary = proratedBase + posCommission + techCommission + allowances - advances;

      const branchObj = (branches || []).find(b => b?.id === staff?.branchId);

      return {
        staffId: staff?.id || 'STAFF_001',
        staffName: staff?.displayName || staff?.name || 'Nhân viên',
        role: staff?.role || 'STAFF',
        branchName: branchObj?.name || 'Toàn hệ thống',
        baseSalary,
        workDays,
        standardWorkDays,
        posCommission,
        techCommission,
        allowances,
        advances,
        netSalary,
        status: 'DRAFT'
      };
    });
  }, [staffList, branches, attendanceRecords, technicalLedger, month]);

  const filteredRecords = useMemo(() => {
    return payrollRecords.filter(r => {
      if (selectedBranchId === 'ALL') return true;
      const staffObj = (staffList || []).find(s => s?.id === r.staffId);
      return staffObj?.branchId === selectedBranchId;
    });
  }, [payrollRecords, selectedBranchId, staffList]);

  const totalPayroll = filteredRecords.reduce((sum, r) => sum + r.netSalary, 0);
  const totalCommission = filteredRecords.reduce((sum, r) => sum + r.posCommission + r.techCommission, 0);

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-3 text-xs font-semibold ${ledgerError ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
        {ledgerError || 'Hoa hồng kỹ thuật chỉ lấy từ commissionLedger trạng thái ELIGIBLE và chưa đưa vào kỳ lương; không còn số mẫu mặc định.'}
      </div>
      {/* 1. KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-orange-50/80 border border-orange-200/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[#ff4b16] block">Tổng Quỹ Lương Tháng {month}</span>
            <span className="text-lg font-black font-mono text-zinc-900 mt-1 block">
              {totalPayroll.toLocaleString('vi-VN')}đ
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#ff4b16] flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-emerald-800 block">Tổng Hoa Hồng & Thưởng KPI</span>
            <span className="text-lg font-black font-mono text-emerald-600 mt-1 block">
              +{totalCommission.toLocaleString('vi-VN')}đ
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-blue-50/80 border border-blue-200/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-blue-800 block">Nhân Sự Hưởng Lương</span>
            <span className="text-lg font-black font-mono text-blue-600 mt-1 block">
              {filteredRecords.length} Nhân viên
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
            <User className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1.5 bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="bg-transparent font-bold text-zinc-800 focus:outline-none"
            />
          </div>

          <select
            value={selectedBranchId}
            onChange={e => setSelectedBranchId(e.target.value)}
            className="h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 focus:outline-none focus:border-[#ff4b16]"
          >
            <option value="ALL">Tất Cả Chi Nhánh</option>
            {(branches || []).filter(Boolean).map(b => (
              <option key={b?.id || b?.code || Math.random()} value={b?.id || ''}>{b?.name || 'Chi nhánh'}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          {onApproveAndPayPayroll && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onApproveAndPayPayroll(month, filteredRecords)}
              leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
            >
              Duyệt Bảng Lương
            </Button>
          )}
        </div>
      </div>

      {/* 3. Payroll Table */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-50/80 border-b border-zinc-200/80 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                <th className="py-3 px-4">Nhân Viên / Vai Trò</th>
                <th className="py-3 px-4">Chi Nhánh</th>
                <th className="py-3 px-4 text-right">Lương Cơ Bản</th>
                <th className="py-3 px-4 text-center">Ngày Công</th>
                <th className="py-3 px-4 text-right">Hoa Hồng Bán Hàng</th>
                <th className="py-3 px-4 text-right">Hoa Hồng Kỹ Thuật</th>
                <th className="py-3 px-4 text-right">Phụ Cấp</th>
                <th className="py-3 px-4 text-right">Thực Lĩnh (VNĐ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredRecords.map(r => (
                <tr key={r.staffId} className="hover:bg-zinc-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-bold text-zinc-900 block">{r.staffName}</span>
                    <span className="text-[10px] text-zinc-400 font-mono block">{r.role}</span>
                  </td>

                  <td className="py-3 px-4 text-zinc-600 font-medium">
                    {r.branchName}
                  </td>

                  <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-700">
                    {r.baseSalary.toLocaleString('vi-VN')}đ
                  </td>

                  <td className="py-3 px-4 text-center font-mono font-bold text-zinc-800">
                    {r.workDays}/{r.standardWorkDays}
                  </td>

                  <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600">
                    +{r.posCommission.toLocaleString('vi-VN')}đ
                  </td>

                  <td className="py-3 px-4 text-right font-mono font-semibold text-blue-600">
                    +{r.techCommission.toLocaleString('vi-VN')}đ
                  </td>

                  <td className="py-3 px-4 text-right font-mono text-zinc-600">
                    +{r.allowances.toLocaleString('vi-VN')}đ
                  </td>

                  <td className="py-3 px-4 text-right font-mono font-black text-sm text-[#ff4b16]">
                    {r.netSalary.toLocaleString('vi-VN')}đ
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
