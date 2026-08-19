import React from 'react';
import { SalesInvoice, FundAccount, Partner, StoreBranch, StaffMember } from '../../../types';
import { Wallet, DollarSign, Receipt, Building2, Award, ArrowRight, Plus, CheckCircle2 } from 'lucide-react';

export interface AccountantHomeViewProps {
  invoices: SalesInvoice[];
  funds: FundAccount[];
  partners: Partner[];
  currentBranch?: StoreBranch;
  currentUser?: StaffMember | null;
  onNavigateTab: (tabId: string) => void;
}

export const AccountantHomeView: React.FC<AccountantHomeViewProps> = ({
  invoices,
  funds,
  partners,
  currentBranch,
  currentUser,
  onNavigateTab
}) => {
  const totalFundsBalance = funds.reduce((sum, f) => sum + (f.balance || 0), 0);
  const supplierDebtTotal = partners.filter(p => p.type === 'supplier').reduce((sum, p) => sum + (p.debt || 0), 0);
  const pendingInstallments = invoices.filter(inv => inv.isInstallment && inv.status !== 'cancelled');
  const pendingInstallmentsAmount = pendingInstallments.reduce((sum, inv) => sum + (inv.financeAmount || 0), 0);

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200">
      {/* 1. Accountant Greeting & Quick Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-800 p-4 sm:p-5 rounded-3xl text-white shadow-lg shadow-emerald-900/20">
        <div>
          <div className="flex items-center space-x-2 text-emerald-200 text-xs font-semibold uppercase tracking-wider">
            <Wallet className="w-4 h-4 text-emerald-300 animate-pulse" />
            <span>Bàn Làm Việc Kế Toán & Quản Trị Dòng Tiền</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black mt-1">
            Kế toán: {currentUser?.name || 'Kế toán viên'} 💼
          </h1>
          <p className="text-xs text-emerald-100 mt-0.5">
            {currentBranch?.name || 'Chi nhánh PhoneHouse'} • Giám sát tài chính & công nợ
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateTab('funds')}
            className="px-4 py-2.5 rounded-2xl bg-white text-emerald-800 font-bold text-xs shadow-md hover:bg-emerald-50 active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Lập Phiếu Thu / Chi</span>
          </button>
          <button
            onClick={() => onNavigateTab('installments')}
            className="px-3.5 py-2.5 rounded-2xl bg-emerald-900/60 hover:bg-emerald-900 border border-emerald-400/40 text-white font-bold text-xs active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Receipt className="w-4 h-4" />
            <span>Đối Soát Trả Góp</span>
          </button>
        </div>
      </div>

      {/* 2. Financial KPIs Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Tổng Quỹ Khả Dụng</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-emerald-700 mt-2 font-mono">
            {(totalFundsBalance / 1_000_000).toFixed(1)} <span className="text-xs font-bold text-zinc-500">triệu</span>
          </p>
          <span className="text-[10px] font-semibold text-zinc-400 mt-1 block">
            {funds.length} tài khoản quỹ hoạt động
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Nợ Phải Trả NCC</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-rose-600 mt-2 font-mono">
            {(supplierDebtTotal / 1_000_000).toFixed(1)} <span className="text-xs font-bold text-zinc-500">triệu</span>
          </p>
          <span className="text-[10px] font-semibold text-zinc-400 mt-1 block">
            Công nợ nhập hàng máy & linh kiện
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Chờ Cty Tài Chính Giải Ngân</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-blue-700 mt-2 font-mono">
            {(pendingInstallmentsAmount / 1_000_000).toFixed(1)} <span className="text-xs font-bold text-zinc-500">triệu</span>
          </p>
          <span className="text-[10px] font-semibold text-zinc-400 mt-1 block">
            {pendingInstallments.length} hồ sơ trả góp HD/Home
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500">Bảng Lương Tháng 8</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <p className="text-lg sm:text-xl font-black text-zinc-900 mt-2 font-mono">
            Chờ Kiểm Duyệt
          </p>
          <span className="text-[10px] font-semibold text-[#ff4b16] mt-1 block cursor-pointer hover:underline" onClick={() => onNavigateTab('payroll')}>
            Xem bảng lương ➔
          </span>
        </div>
      </div>

      {/* 3. Funds Balances & Partner Debts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funds List */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center space-x-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                Chi Tiết Số Dư Quỹ ({funds.length})
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('funds')}
              className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              Vào sổ quỹ
            </button>
          </div>

          <div className="space-y-2">
            {funds.map(f => (
              <div
                key={f.id}
                className="p-3 bg-zinc-50 border border-zinc-200/70 rounded-xl flex items-center justify-between"
              >
                <div>
                  <h5 className="text-xs font-bold text-zinc-900">{f.name}</h5>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    Loại: {f.type === 'CASH' ? 'Tiền mặt tại quầy' : 'Tài khoản ngân hàng QR'}
                  </p>
                </div>
                <span className="font-mono font-bold text-xs text-emerald-700">
                  {f.balance.toLocaleString('vi-VN')} đ
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Partners Debt Preview */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-zinc-200/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-[#ff4b16]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                Đối Tác Cần Thanh Toán Công Nợ
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('partners')}
              className="text-xs font-bold text-[#ff4b16] hover:underline cursor-pointer"
            >
              Xem công nợ
            </button>
          </div>

          <div className="space-y-2">
            {partners.filter(p => (p.debt || 0) > 0).slice(0, 5).map(p => (
              <div
                key={p.id}
                className="p-3 bg-zinc-50 border border-zinc-200/70 rounded-xl flex items-center justify-between"
              >
                <div>
                  <h5 className="text-xs font-bold text-zinc-900">{p.name}</h5>
                  <p className="text-[10px] text-zinc-500 font-mono">SĐT: {p.phone || 'N/A'}</p>
                </div>
                <span className="font-mono font-bold text-xs text-rose-600">
                  {(p.debt || 0).toLocaleString('vi-VN')} đ
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
