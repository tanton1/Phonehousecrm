import React, { useState, useMemo } from 'react';
import { CashTransaction, FundAccount, StoreBranch } from '../../../types';
import { StatusBadge } from '../../../shared/ui/StatusBadge/StatusBadge';
import { Wallet, ArrowDownRight, ArrowUpRight, Filter, Search, Calendar, Plus, Building2 } from 'lucide-react';

export interface CashLedgerTableProps {
  transactions: CashTransaction[];
  funds: FundAccount[];
  branches: StoreBranch[];
  selectedBranchId?: string;
  onOpenCreateModal: (type: 'RECEIPT' | 'PAYMENT') => void;
}

export const CashLedgerTable: React.FC<CashLedgerTableProps> = ({
  transactions,
  funds,
  branches,
  selectedBranchId,
  onOpenCreateModal
}) => {
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'RECEIPT' | 'PAYMENT'>('ALL');
  const [fundFilter, setFundFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtered transactions
  const filteredTxs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return transactions.filter(tx => {
      const matchBranch = !selectedBranchId || selectedBranchId === 'ALL' || !tx.branchId || tx.branchId === selectedBranchId;
      const matchType = typeFilter === 'ALL' || tx.type === typeFilter;
      const matchFund = fundFilter === 'ALL' || tx.fundId === fundFilter;
      const matchSearch =
        !q ||
        tx.code?.toLowerCase().includes(q) ||
        tx.partnerName?.toLowerCase().includes(q) ||
        tx.categoryName?.toLowerCase().includes(q) ||
        tx.notes?.toLowerCase().includes(q) ||
        tx.referenceCode?.toLowerCase().includes(q);

      return matchBranch && matchType && matchFund;
    });
  }, [transactions, selectedBranchId, typeFilter, fundFilter, searchQuery]);

  // Aggregate totals
  const totalReceipts = useMemo(() => {
    return filteredTxs.filter(t => t.type === 'RECEIPT').reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [filteredTxs]);

  const totalPayments = useMemo(() => {
    return filteredTxs.filter(t => t.type === 'PAYMENT').reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [filteredTxs]);

  return (
    <div className="space-y-4">
      {/* 1. Top Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-emerald-800 block">Tổng Thu (Phiếu Thu)</span>
            <span className="text-lg font-black font-mono text-emerald-600 mt-1 block">
              +{totalReceipts.toLocaleString('vi-VN')}đ
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <ArrowDownRight className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-rose-50/80 border border-rose-200/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-rose-800 block">Tổng Chi (Phiếu Chi)</span>
            <span className="text-lg font-black font-mono text-rose-600 mt-1 block">
              -{totalPayments.toLocaleString('vi-VN')}đ
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-orange-50/80 border border-orange-200/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-[#ff4b16] block">Chênh Lệch Dòng Tiền</span>
            <span className="text-lg font-black font-mono text-zinc-900 mt-1 block">
              {(totalReceipts - totalPayments).toLocaleString('vi-VN')}đ
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#ff4b16] flex items-center justify-center">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. Filter & Action Bar */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Tìm mã phiếu, đối tác, danh mục..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-8 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:border-[#ff4b16]"
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            className="h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 focus:outline-none focus:border-[#ff4b16]"
          >
            <option value="ALL">Tất Cả Loại Phiếu</option>
            <option value="RECEIPT">Chỉ Phiếu Thu (+)</option>
            <option value="PAYMENT">Chỉ Phiếu Chi (-)</option>
          </select>

          {/* Fund Filter */}
          <select
            value={fundFilter}
            onChange={e => setFundFilter(e.target.value)}
            className="h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 focus:outline-none focus:border-[#ff4b16]"
          >
            <option value="ALL">Tất Cả Quỹ Tiền</option>
            {funds.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onOpenCreateModal('RECEIPT')}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Lập Phiếu Thu</span>
          </button>

          <button
            onClick={() => onOpenCreateModal('PAYMENT')}
            className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Lập Phiếu Chi</span>
          </button>
        </div>
      </div>

      {/* 3. Transaction Table */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-50/80 border-b border-zinc-200/80 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                <th className="py-3 px-4">Mã Phiếu / Ngày</th>
                <th className="py-3 px-4">Loại & Danh Mục</th>
                <th className="py-3 px-4">Đối Tác / Khách Hàng</th>
                <th className="py-3 px-4">Quỹ Tiền</th>
                <th className="py-3 px-4 text-right">Số Tiền (VNĐ)</th>
                <th className="py-3 px-4 text-center">Người Lập</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredTxs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400">
                    Không có giao dịch nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredTxs.map(tx => {
                  const isReceipt = tx.type === 'RECEIPT';

                  return (
                    <tr key={tx.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-zinc-900 block">{tx.code || tx.id}</span>
                        <span className="text-[10px] text-zinc-400 font-mono block">{tx.date}</span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isReceipt ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <span className="font-bold text-zinc-800">{tx.categoryName || tx.category}</span>
                        </div>
                        {tx.notes && (
                          <span className="text-[10px] text-zinc-500 block truncate max-w-xs mt-0.5">
                            {tx.notes}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-medium text-zinc-800">
                        {tx.partnerName || 'Khách vãng lai'}
                        {tx.partnerPhone && (
                          <span className="text-[10px] text-zinc-400 font-mono block">{tx.partnerPhone}</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-zinc-600">
                        <span className="font-semibold text-zinc-800 block truncate max-w-[140px]">
                          {tx.fundName || tx.fundId}
                        </span>
                        <span className="text-[10px] text-zinc-400 uppercase font-mono">{tx.fundType}</span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-black">
                        <span className={isReceipt ? 'text-emerald-600' : 'text-rose-600'}>
                          {isReceipt ? '+' : '-'}{tx.amount.toLocaleString('vi-VN')}đ
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center text-zinc-500 text-[11px]">
                        {tx.creator || 'Admin'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
