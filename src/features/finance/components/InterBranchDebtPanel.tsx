import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  X
} from 'lucide-react';
import { FundAccount, InterBranchDebtLedger, StoreBranch, UserAccount } from '../../../types';
import {
  createIdempotencyKey,
  fetchInterBranchDebts,
  requestSettleInterBranchDebt
} from '../../../services/inventoryTransferApiClient';

interface InterBranchDebtPanelProps {
  currentUser: UserAccount;
  branches: StoreBranch[];
  funds: FundAccount[];
  selectedBranchId?: string;
}

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

function formatDate(value: unknown): string {
  const raw = value && typeof value === 'object' && 'toDate' in value && typeof (value as any).toDate === 'function'
    ? (value as any).toDate()
    : value;
  const parsed = raw instanceof Date ? raw : new Date(String(raw || ''));
  return Number.isNaN(parsed.getTime()) ? '—' : dateTime.format(parsed);
}

const STATUS_META: Record<string, { label: string; tone: string }> = {
  PROVISIONAL: { label: 'Tạm tính', tone: 'bg-zinc-100 text-zinc-700' },
  OPEN: { label: 'Chưa thanh toán', tone: 'bg-rose-50 text-rose-700' },
  PARTIALLY_SETTLED: { label: 'Đã trả một phần', tone: 'bg-amber-50 text-amber-700' },
  SETTLED: { label: 'Đã thanh toán', tone: 'bg-emerald-50 text-emerald-700' },
  VOID: { label: 'Không phát sinh', tone: 'bg-zinc-100 text-zinc-500' },
  REVERSED: { label: 'Đã đảo', tone: 'bg-zinc-100 text-zinc-500' }
};

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'Không thể xử lý công nợ.');
  if (message.includes('INSUFFICIENT_FUNDS')) return 'Quỹ chi của chi nhánh nhận không đủ số dư.';
  if (message.includes('PAYER_FUND_BRANCH_MISMATCH')) return 'Quỹ chi phải thuộc đúng chi nhánh nhận máy.';
  if (message.includes('RECEIVER_FUND_BRANCH_MISMATCH')) return 'Quỹ nhận phải thuộc đúng chi nhánh giao máy.';
  if (message.includes('EXCEEDS_OUTSTANDING')) return 'Số tiền thanh toán vượt quá công nợ còn lại.';
  if (message.includes('BRANCH_FORBIDDEN')) return 'Tài khoản chưa được phân quyền cho cả hai chi nhánh.';
  if (message.includes('NOT_POSTED')) return 'Phiếu chưa nhận máy nên chưa được ghi công nợ chính thức.';
  return message;
}

export function InterBranchDebtPanel({ currentUser, branches, funds, selectedBranchId = 'ALL' }: InterBranchDebtPanelProps) {
  const [debts, setDebts] = useState<InterBranchDebtLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [selected, setSelected] = useState<InterBranchDebtLedger | null>(null);
  const [form, setForm] = useState({ amount: 0, payerFundId: '', receiverFundId: '', note: '' });

  const canSettle = ['ADMIN', 'ACCOUNTANT'].includes(String(currentUser.role || '').toUpperCase());
  const activeFunds = useMemo(() => funds.filter(fund => fund.isActive !== false && fund.isArchived !== true), [funds]);
  const branchName = useCallback((id: string) => branches.find(branch => branch.id === id)?.name || id, [branches]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchInterBranchDebts({
        branchId: selectedBranchId,
        financialStatus: status
      }, currentUser);
      setDebts(result.debts || []);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, [currentUser, selectedBranchId, status]);

  useEffect(() => { void load(); }, [load]);

  const visibleDebts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return debts;
    return debts.filter(debt => [
      debt.transferCode,
      debt.sourceBranchName,
      debt.destinationBranchName,
      ...debt.imeis.flatMap(item => [item.imei, item.name])
    ].some(value => String(value || '').toLowerCase().includes(normalized)));
  }, [debts, query]);

  const totals = useMemo(() => ({
    outstanding: debts.reduce((sum, debt) => sum + Number(debt.outstandingAmount || 0), 0),
    settled: debts.reduce((sum, debt) => sum + Number(debt.settledAmount || 0), 0),
    open: debts.filter(debt => ['OPEN', 'PARTIALLY_SETTLED'].includes(debt.financialStatus)).length,
    settledCount: debts.filter(debt => debt.financialStatus === 'SETTLED').length
  }), [debts]);

  const openDebt = (debt: InterBranchDebtLedger) => {
    const payerFunds = activeFunds.filter(fund => fund.branchId === debt.destinationBranchId);
    const receiverFunds = activeFunds.filter(fund => fund.branchId === debt.sourceBranchId);
    setSelected(debt);
    setError('');
    setNotice('');
    setForm({
      amount: Number(debt.outstandingAmount || 0),
      payerFundId: payerFunds[0]?.id || '',
      receiverFundId: receiverFunds[0]?.id || '',
      note: ''
    });
  };

  const submitSettlement = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await requestSettleInterBranchDebt(selected.transferId, {
        amount: Number(form.amount),
        payerFundId: form.payerFundId,
        receiverFundId: form.receiverFundId,
        note: form.note.trim() || undefined,
        idempotencyKey: createIdempotencyKey(`settle-inter-branch-${selected.transferId}`)
      }, currentUser);
      setDebts(current => current.map(item => item.id === result.debt.id ? result.debt : item));
      setSelected(result.debt);
      setForm(current => ({ ...current, amount: Number(result.debt.outstandingAmount || 0), note: '' }));
      setNotice(`Đã tạo phiếu chi và phiếu thu ${money.format(Number(result.settlement.amount || 0))}.`);
    } catch (settlementError) {
      setError(friendlyError(settlementError));
    } finally {
      setSubmitting(false);
    }
  };

  const payerFunds = selected ? activeFunds.filter(fund => fund.branchId === selected.destinationBranchId) : [];
  const receiverFunds = selected ? activeFunds.filter(fund => fund.branchId === selected.sourceBranchId) : [];
  const selectedStatus = selected ? (STATUS_META[selected.financialStatus] || STATUS_META.OPEN) : STATUS_META.OPEN;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[720px] grid-cols-4 gap-3">
          {[
            { label: 'Công nợ còn lại', value: money.format(totals.outstanding), icon: CircleDollarSign, tone: 'text-rose-600 bg-rose-50' },
            { label: 'Đã đối soát', value: money.format(totals.settled), icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-50' },
            { label: 'Phiếu còn nợ', value: String(totals.open), icon: Clock3, tone: 'text-amber-600 bg-amber-50' },
            { label: 'Phiếu đã trả đủ', value: String(totals.settledCount), icon: ShieldCheck, tone: 'text-blue-600 bg-blue-50' }
          ].map(card => <div key={card.label} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className={`inline-flex rounded-xl p-2 ${card.tone}`}><card.icon className="h-4 w-4" /></div><p className="mt-3 text-xs font-bold text-zinc-500">{card.label}</p><p className="mt-1 text-lg font-black text-zinc-950">{card.value}</p></div>)}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-black text-zinc-950">Công nợ điều chuyển máy</h2><p className="mt-1 text-xs text-zinc-500">Nhận IMEI mới ghi nợ; thanh toán mới thay đổi hai quỹ.</p></div>
            <button onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-xs font-black text-zinc-700"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới</button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_190px]">
            <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm mã phiếu, IMEI hoặc chi nhánh" className="h-10 w-full rounded-xl border border-zinc-200 pl-10 pr-3 text-sm" /></label>
            <select value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"><option value="ALL">Tất cả trạng thái</option><option value="OPEN">Chưa thanh toán</option><option value="PARTIALLY_SETTLED">Đã trả một phần</option><option value="SETTLED">Đã thanh toán</option><option value="PROVISIONAL">Tạm tính</option></select>
          </div>
          {error && !selected && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
        </div>

        {loading ? <div className="flex min-h-48 items-center justify-center text-sm font-bold text-zinc-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang tải công nợ...</div> : visibleDebts.length === 0 ? <div className="p-10 text-center"><Building2 className="mx-auto h-9 w-9 text-zinc-300" /><p className="mt-3 font-bold text-zinc-700">Chưa có công nợ phù hợp</p><p className="mt-1 text-sm text-zinc-500">Công nợ chỉ được ghi sau khi chi nhánh nhận quét đúng IMEI.</p></div> : <div className="divide-y divide-zinc-100">{visibleDebts.map(debt => {
          const meta = STATUS_META[debt.financialStatus] || STATUS_META.OPEN;
          return <button key={debt.id} onClick={() => openDebt(debt)} className="grid w-full gap-3 p-4 text-left transition hover:bg-orange-50/30 sm:grid-cols-[minmax(190px,1.2fr)_minmax(210px,1.5fr)_130px_130px] sm:items-center">
            <div><div className="flex items-center gap-2"><span className="font-mono text-sm font-black text-zinc-950">{debt.transferCode || debt.transferId}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black ${meta.tone}`}>{meta.label}</span></div><p className="mt-1 text-xs text-zinc-500">{debt.imeis.length} IMEI · {formatDate(debt.createdAt)}</p></div>
            <div className="flex items-center gap-2 text-sm"><span className="truncate font-bold">{debt.sourceBranchName || branchName(debt.sourceBranchId)}</span><ArrowRight className="h-4 w-4 shrink-0 text-orange-500" /><span className="truncate font-bold">{debt.destinationBranchName || branchName(debt.destinationBranchId)}</span></div>
            <div><p className="text-[10px] font-black uppercase text-zinc-400">Đã trả</p><p className="mt-1 text-sm font-black text-emerald-700">{money.format(debt.settledAmount)}</p></div>
            <div><p className="text-[10px] font-black uppercase text-zinc-400">Còn nợ</p><p className="mt-1 text-sm font-black text-rose-700">{money.format(debt.outstandingAmount)}</p></div>
          </button>;
        })}</div>}
      </section>

      {selected && <div className="fixed inset-0 z-[120] flex items-end bg-zinc-950/50 sm:items-center sm:justify-center sm:p-4" onMouseDown={event => event.target === event.currentTarget && setSelected(null)}><section className="flex max-h-[96dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-[#fbfaf8] shadow-2xl sm:rounded-3xl"><header className="flex items-start justify-between border-b bg-white p-5"><div><div className="flex items-center gap-2"><h3 className="font-mono text-lg font-black">{selected.transferCode || selected.transferId}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-black ${selectedStatus.tone}`}>{selectedStatus.label}</span></div><p className="mt-1 text-xs text-zinc-500">{selected.sourceBranchName} → {selected.destinationBranchName}</p></div><button onClick={() => setSelected(null)} className="rounded-xl border p-2 text-zinc-500"><X className="h-5 w-5" /></button></header>
        <div className="overflow-y-auto p-5">
          <div className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-zinc-100 p-3"><p className="text-[10px] font-black text-zinc-500">Đã ghi nợ</p><p className="mt-1 text-sm font-black">{money.format(selected.postedAmount)}</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-[10px] font-black text-emerald-700">Đã trả</p><p className="mt-1 text-sm font-black text-emerald-800">{money.format(selected.settledAmount)}</p></div><div className="rounded-xl bg-rose-50 p-3"><p className="text-[10px] font-black text-rose-700">Còn nợ</p><p className="mt-1 text-sm font-black text-rose-800">{money.format(selected.outstandingAmount)}</p></div></div>

          <section className="mt-4 overflow-hidden rounded-2xl border bg-white"><div className="border-b bg-zinc-50 px-4 py-3 text-xs font-black uppercase text-zinc-500">IMEI liên kết</div><div className="max-h-40 divide-y overflow-y-auto">{selected.imeis.map(item => <div key={item.imei} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="font-mono text-xs font-black">{item.imei}</p><p className="mt-0.5 truncate text-xs text-zinc-500">{item.name || 'Máy điều chuyển'} · {item.receiptStatus || '—'}</p></div><p className="shrink-0 text-sm font-black">{money.format(item.amount)}</p></div>)}</div></section>

          {!!selected.settlements?.length && <section className="mt-4 overflow-hidden rounded-2xl border bg-white"><div className="border-b bg-zinc-50 px-4 py-3 text-xs font-black uppercase text-zinc-500">Lịch sử thanh toán</div><div className="divide-y">{selected.settlements.slice().reverse().map(item => <div key={item.id} className="p-4"><div className="flex items-center justify-between gap-3"><p className="font-black text-emerald-700">{money.format(item.amount)}</p><p className="text-xs text-zinc-500">{formatDate(item.createdAt)}</p></div><p className="mt-1 text-xs text-zinc-600">{item.payerFundName} → {item.receiverFundName}</p>{item.note && <p className="mt-1 text-xs text-zinc-500">{item.note}</p>}</div>)}</div></section>}

          {selected.outstandingAmount > 0 && canSettle && <section className="mt-4 rounded-2xl border border-orange-200 bg-orange-50/50 p-4"><h4 className="font-black text-zinc-950">Thanh toán công nợ</h4><p className="mt-1 text-xs text-zinc-600">Hệ thống tạo đồng thời phiếu chi tại chi nhánh nhận và phiếu thu tại chi nhánh giao.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="text-xs font-black text-zinc-600">Quỹ chi · {selected.destinationBranchName}</span><select value={form.payerFundId} onChange={event => setForm(current => ({ ...current, payerFundId: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm"><option value="">Chọn quỹ chi</option>{payerFunds.map(fund => <option key={fund.id} value={fund.id}>{fund.name} · {money.format(fund.currentBalance)}</option>)}</select></label><label><span className="text-xs font-black text-zinc-600">Quỹ nhận · {selected.sourceBranchName}</span><select value={form.receiverFundId} onChange={event => setForm(current => ({ ...current, receiverFundId: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm"><option value="">Chọn quỹ nhận</option>{receiverFunds.map(fund => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label><label><span className="text-xs font-black text-zinc-600">Số tiền</span><input type="number" min={1} max={selected.outstandingAmount} value={form.amount} onChange={event => setForm(current => ({ ...current, amount: Math.max(0, Number(event.target.value || 0)) }))} className="mt-1 h-11 w-full rounded-xl border bg-white px-3 font-bold" /></label><label><span className="text-xs font-black text-zinc-600">Ghi chú</span><input value={form.note} onChange={event => setForm(current => ({ ...current, note: event.target.value }))} placeholder="Không bắt buộc" className="mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm" /></label></div><button disabled={submitting || !form.payerFundId || !form.receiverFundId || form.amount <= 0 || form.amount > selected.outstandingAmount} onClick={() => void submitSettlement()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 py-3 text-sm font-black text-white disabled:opacity-40">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ArrowUpRight className="h-4 w-4" /><ArrowDownLeft className="h-4 w-4" /></>} Xác nhận tạo phiếu chi và phiếu thu</button></section>}
          {selected.outstandingAmount > 0 && !canSettle && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Chỉ Kế toán hoặc Admin được thanh toán công nợ liên chi nhánh.</p>}
          {notice && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{notice}</p>}
          {error && selected && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
        </div>
      </section></div>}
    </div>
  );
}
