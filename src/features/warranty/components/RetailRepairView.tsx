import React, { useEffect, useMemo, useState } from 'react';
import { getVietnamDateString, getVietnamMonthString } from '../../../../shared/vietnamTime';
import { ClipboardPlus, Clock3, CreditCard, Loader2, RefreshCw, Smartphone, Wrench } from 'lucide-react';
import { FundAccount, StoreBranch, UserAccount } from '../../../types';
import {
  fetchRepairRevenueReport,
  fetchRetailRepairDashboard,
  RepairRevenueReport,
  requestDeliverToCustomer,
  RetailRepairCase,
  RetailRepairDashboard
} from '../../../services/technicalApiClient';

interface RetailRepairViewProps {
  currentUser?: UserAccount | null;
  branches?: StoreBranch[];
  funds?: FundAccount[];
  refreshKey?: number;
  onOpenIntake: () => void;
  onOpenTechDesk?: () => void;
}

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const monthStart = () => `${getVietnamMonthString()}-01`;
const today = () => getVietnamDateString();

const stageLabel: Record<string, { label: string; className: string }> = {
  WAITING_ACCEPTANCE: { label: 'Chờ KTV nhận', className: 'bg-amber-100 text-amber-800' },
  IN_PROGRESS: { label: 'Đang xử lý', className: 'bg-blue-100 text-blue-800' },
  WAITING_PARTS: { label: 'Chờ linh kiện', className: 'bg-orange-100 text-orange-800' },
  WAITING_QC: { label: 'Chờ KCS', className: 'bg-violet-100 text-violet-800' },
  WAITING_DELIVERY: { label: 'Chờ trả máy', className: 'bg-emerald-100 text-emerald-800' },
  COMPLETED: { label: 'Đã trả máy', className: 'bg-zinc-100 text-zinc-700' }
};

export const RetailRepairView: React.FC<RetailRepairViewProps> = ({ currentUser, branches = [], funds = [], refreshKey = 0, onOpenIntake, onOpenTechDesk }) => {
  const [section, setSection] = useState<'OVERVIEW' | 'PROGRESS' | 'DELIVERY' | 'REPORT'>('OVERVIEW');
  const [dashboard, setDashboard] = useState<RetailRepairDashboard | null>(null);
  const [report, setReport] = useState<RepairRevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportFrom, setReportFrom] = useState(monthStart);
  const [reportTo, setReportTo] = useState(today);
  const [deliveryCase, setDeliveryCase] = useState<RetailRepairCase | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [payment, setPayment] = useState({ finalAmount: 0, paidAmount: 0, paymentMethod: 'CASH' as 'CASH' | 'BANK' | 'DEBT', fundId: '', note: '' });
  const [savingDelivery, setSavingDelivery] = useState(false);
  const role = String(currentUser?.role || '').toUpperCase();
  const canDeliver = ['ADMIN', 'MANAGER', 'SALES', 'SALE', 'TECH_LEAD'].includes(role);

  const loadDashboard = async () => {
    setLoading(true); setError('');
    try {
      setDashboard(await fetchRetailRepairDashboard());
    } catch (cause: any) {
      setError(cause?.message || 'Không thể tải danh sách sửa chữa lẻ.');
    } finally {
      setLoading(false);
    }
  };

  const loadReport = async () => {
    setReportLoading(true); setError('');
    try {
      setReport(await fetchRepairRevenueReport(reportFrom, reportTo));
    } catch (cause: any) {
      setError(cause?.message || 'Không thể tải báo cáo sửa chữa.');
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => { void loadDashboard(); }, [currentUser?.id, refreshKey]);
  useEffect(() => { void loadReport(); }, [currentUser?.id]);

  const progressCases = useMemo(() => (dashboard?.items || []).filter(item => ['WAITING_ACCEPTANCE', 'IN_PROGRESS', 'WAITING_PARTS', 'WAITING_QC'].includes(item.stage)), [dashboard]);
  const deliveryCases = useMemo(() => (dashboard?.items || []).filter(item => item.stage === 'WAITING_DELIVERY'), [dashboard]);
  const paymentFunds = useMemo(() => funds.filter(fund => fund.isActive !== false && !fund.isArchived && fund.branchId === deliveryCase?.branchId && String(fund.type).toUpperCase() === payment.paymentMethod), [funds, deliveryCase?.branchId, payment.paymentMethod]);

  const openDelivery = (repair: RetailRepairCase) => {
    setDeliveryCase(repair);
    setDeliveryNotes('');
    setPayment({ finalAmount: Number(repair.finalAmount || 0), paidAmount: 0, paymentMethod: 'CASH', fundId: '', note: '' });
  };

  const submitDelivery = async () => {
    if (!deliveryCase || deliveryNotes.trim().length < 5) { setError('Hãy ghi rõ tình trạng bàn giao và người nhận.'); return; }
    if (payment.paidAmount < 0 || payment.finalAmount < 0 || payment.paidAmount > payment.finalAmount) { setError('Số tiền thanh toán không hợp lệ.'); return; }
    if (payment.paidAmount > 0 && payment.paymentMethod !== 'DEBT' && !payment.fundId) { setError('Chọn quỹ nhận tiền trước khi xác nhận.'); return; }
    setSavingDelivery(true); setError('');
    try {
      await requestDeliverToCustomer(deliveryCase.id, deliveryNotes.trim(), {
        paidAmount: payment.paidAmount,
        paymentMethod: payment.paymentMethod,
        fundId: payment.paidAmount > 0 && payment.paymentMethod !== 'DEBT' ? payment.fundId : undefined,
        note: payment.note.trim() || undefined
      });
      setDeliveryCase(null);
      await Promise.all([loadDashboard(), loadReport()]);
    } catch (cause: any) {
      setError(cause?.message || 'Không thể trả máy và thu tiền.');
    } finally {
      setSavingDelivery(false);
    }
  };

  const nav = [
    { id: 'OVERVIEW', label: 'Tổng quan' },
    { id: 'PROGRESS', label: `Đang sửa (${progressCases.length})` },
    { id: 'DELIVERY', label: `Chờ trả (${deliveryCases.length})` },
    { id: 'REPORT', label: 'Báo cáo' }
  ] as const;

  return <div className="mx-auto max-w-6xl space-y-4 pb-8">
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-950 via-zinc-900 to-orange-800 p-5 text-white shadow-xl sm:p-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="flex gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-500"><Wrench className="h-6 w-6" /></span><div><p className="text-xs font-black uppercase tracking-[0.16em] text-orange-200">Bộ phận bán hàng</p><h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Sửa chữa lẻ</h1><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-200">Tiếp nhận máy, theo dõi KTV, trả máy và thu tiền cho khách tại chi nhánh của bạn.</p></div></div><div className="flex flex-wrap gap-2"><button onClick={onOpenIntake} className="inline-flex items-center gap-2 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white hover:bg-orange-400"><ClipboardPlus className="h-4 w-4" />Tiếp nhận máy</button>{onOpenTechDesk && ['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(role) && <button onClick={onOpenTechDesk} className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-black hover:bg-white/15">Bàn kỹ thuật</button>}</div></div>
    </section>

    {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
    <div className="flex gap-2 overflow-x-auto border-b pb-2">{nav.map(item => <button key={item.id} onClick={() => setSection(item.id)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${section === item.id ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200'}`}>{item.label}</button>)}<button onClick={() => void loadDashboard()} className="ml-auto rounded-xl bg-white p-2 text-zinc-600 ring-1 ring-zinc-200"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div>

    {section === 'OVERVIEW' && <><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Đang xử lý" value={dashboard?.summary.inProgressCount || 0} /><Metric label="Chờ trả máy" value={dashboard?.summary.waitingDeliveryCount || 0} accent="emerald" /><Metric label="Đã trả máy" value={dashboard?.summary.deliveredCount || 0} /><Metric label="Bảo hành" value={dashboard?.summary.warrantyCount || 0} /></div><section className="rounded-3xl border bg-white p-4 sm:p-5"><div className="flex items-center justify-between"><div><h2 className="font-black">Việc cần xử lý ngay</h2><p className="mt-1 text-xs text-zinc-500">Máy đã KCS đạt cần liên hệ khách và trả máy.</p></div><button onClick={() => setSection('DELIVERY')} className="text-xs font-black text-orange-700">Xem tất cả</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{deliveryCases.slice(0, 4).map(item => <RepairCard key={item.id} repair={item} onDeliver={() => openDelivery(item)} />)}{!loading && !deliveryCases.length && <Empty text="Chưa có máy nào chờ trả khách." />}</div></section></>}

    {section === 'PROGRESS' && <section className="space-y-3"><div><h2 className="font-black text-zinc-900">Máy đang sửa</h2><p className="mt-1 text-xs text-zinc-500">NVBH theo dõi tiến độ; KTV xử lý task và linh kiện trên Bàn kỹ thuật.</p></div>{progressCases.map(item => <RepairCard key={item.id} repair={item} />)}{!loading && !progressCases.length && <Empty text="Không có máy nào đang xử lý." />}</section>}

    {section === 'DELIVERY' && <section className="space-y-3"><div><h2 className="font-black text-zinc-900">Chờ trả máy & thu tiền</h2><p className="mt-1 text-xs text-zinc-500">Chỉ máy KCS đạt mới xuất hiện ở đây.</p></div>{deliveryCases.map(item => <RepairCard key={item.id} repair={item} onDeliver={() => openDelivery(item)} />)}{!loading && !deliveryCases.length && <Empty text="Chưa có máy KCS đạt chờ trả khách." />}</section>}

    {section === 'REPORT' && <section className="space-y-4"><div className="rounded-3xl bg-zinc-900 p-4 text-white sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="text-xs font-bold">Từ ngày<input type="date" value={reportFrom} onChange={event => setReportFrom(event.target.value)} className="mt-1 block h-10 w-full rounded-xl px-3 text-zinc-900"/></label><label className="text-xs font-bold">Đến ngày<input type="date" value={reportTo} onChange={event => setReportTo(event.target.value)} className="mt-1 block h-10 w-full rounded-xl px-3 text-zinc-900"/></label><button onClick={() => void loadReport()} className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black">{reportLoading ? 'Đang tải...' : 'Xem báo cáo'}</button></div></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Doanh thu" value={money.format(report?.summary.serviceRevenue || 0)} text /><Metric label="Đã thu" value={money.format(report?.summary.cashCollected || 0)} text accent="emerald" /><Metric label="Còn nợ" value={money.format(report?.summary.outstanding || 0)} text accent="rose" /><Metric label="Máy đã trả" value={report?.summary.deliveredCount || 0} /></div><div className="overflow-hidden rounded-3xl border bg-white"><div className="border-b p-4"><h2 className="font-black">Chi tiết phiếu đã trả</h2></div><div className="divide-y">{report?.items.map(item => <article key={item.workOrderId} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]"><div><p className="font-black">{item.model} <span className="font-mono text-xs text-zinc-500">· {item.imei}</span></p><p className="mt-1 text-sm text-zinc-700">{item.customerName}{item.customerPhone ? ` · ${item.customerPhone}` : ''}</p><p className="mt-1 text-xs text-zinc-500">{item.code} · {item.type === 'WARRANTY' ? 'Bảo hành' : 'Sửa dịch vụ'} · {item.deliveredAt ? new Date(item.deliveredAt).toLocaleString('vi-VN') : '—'}</p></div><div className="grid grid-cols-3 gap-3 text-right text-xs sm:block sm:space-y-1"><p><span className="block text-zinc-500">Tổng</span><strong>{money.format(item.finalAmount)}</strong></p><p><span className="block text-zinc-500">Đã thu</span><strong className="text-emerald-700">{money.format(item.paidAmount)}</strong></p><p><span className="block text-zinc-500">Còn nợ</span><strong className="text-rose-700">{money.format(item.balanceDue)}</strong></p></div></article>)}{!reportLoading && !report?.items.length && <Empty text="Không có phiếu đã trả trong khoảng thời gian này." />}</div></div></section>}

    {deliveryCase && <div className="fixed inset-0 z-[150] flex items-end bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"><section className="max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black">Trả máy & thu tiền</h2><p className="mt-1 text-xs text-zinc-500">{deliveryCase.model} · {deliveryCase.imei}</p></div><button onClick={() => setDeliveryCase(null)} className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-black">Đóng</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Tổng tiền dịch vụ"><input type="number" min={0} value={payment.finalAmount} onChange={event => setPayment(current => ({ ...current, finalAmount: Math.max(0, Number(event.target.value || 0)) }))}/></Field><Field label="Khách thanh toán"><input type="number" min={0} value={payment.paidAmount} onChange={event => setPayment(current => ({ ...current, paidAmount: Math.max(0, Number(event.target.value || 0)) }))}/></Field><Field label="Hình thức"><select value={payment.paymentMethod} onChange={event => setPayment(current => ({ ...current, paymentMethod: event.target.value as 'CASH' | 'BANK' | 'DEBT', fundId: '' }))}><option value="CASH">Tiền mặt</option><option value="BANK">Chuyển khoản</option><option value="DEBT">Ghi nợ</option></select></Field>{payment.paidAmount > 0 && payment.paymentMethod !== 'DEBT' && <Field label="Quỹ nhận tiền"><select value={payment.fundId} onChange={event => setPayment(current => ({ ...current, fundId: event.target.value }))}><option value="">Chọn quỹ nhận</option>{paymentFunds.map(fund => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></Field>}<Field label="Ghi chú thu tiền" className="sm:col-span-2"><input value={payment.note} onChange={event => setPayment(current => ({ ...current, note: event.target.value }))} placeholder="Không bắt buộc"/></Field></div><div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm"><p className="flex justify-between"><span>Đã thu</span><strong>{money.format(payment.paidAmount)}</strong></p><p className="mt-1 flex justify-between"><span>Còn nợ</span><strong>{money.format(Math.max(0, payment.finalAmount - payment.paidAmount))}</strong></p></div><Field label="Tình trạng bàn giao và người nhận" required className="mt-3"><textarea rows={3} value={deliveryNotes} onChange={event => setDeliveryNotes(event.target.value)} placeholder="Máy, phụ kiện giao lại; người nhận..."/></Field><button disabled={!canDeliver || savingDelivery || deliveryNotes.trim().length < 5 || payment.paidAmount > payment.finalAmount || (payment.paidAmount > 0 && payment.paymentMethod !== 'DEBT' && !payment.fundId)} onClick={() => void submitDelivery()} className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white disabled:opacity-40">{savingDelivery ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin"/> : <CreditCard className="mr-2 inline h-4 w-4"/>}Xác nhận trả máy & thu tiền</button>{!canDeliver && <p className="mt-2 text-xs text-amber-700">Tài khoản này chỉ có quyền xem; NVBH hoặc quản lý thực hiện bàn giao.</p>}</section></div>}
  </div>;
};

function Metric({ label, value, accent = 'zinc', text = false }: { label: string; value: string | number; accent?: 'zinc' | 'emerald' | 'rose'; text?: boolean }) {
  const colors = { zinc: 'text-zinc-900', emerald: 'text-emerald-700', rose: 'text-rose-700' };
  return <div className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold text-zinc-500">{label}</p><p className={`mt-1 ${text ? 'text-base' : 'text-2xl'} font-black ${colors[accent]}`}>{value}</p></div>;
}

function RepairCard({ repair, onDeliver }: { key?: React.Key; repair: RetailRepairCase; onDeliver?: () => void }) {
  const badge = stageLabel[repair.stage] || stageLabel.IN_PROGRESS;
  return <article className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-black text-zinc-900">{repair.model}</p><p className="mt-1 font-mono text-xs text-zinc-500">{repair.code} · {repair.imei}</p><p className="mt-2 text-sm font-semibold text-zinc-700">{repair.customerName}{repair.customerPhone ? ` · ${repair.customerPhone}` : ''}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${badge.className}`}>{badge.label}</span></div><div className="mt-3 flex flex-wrap gap-1.5">{repair.taskLines.map(task => <span key={task.id} className="rounded-lg bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-600">{task.taskName}{task.assigneeName ? ` · ${task.assigneeName}` : ''}</span>)}</div><div className="mt-3 flex items-center justify-between border-t pt-3 text-xs"><span className="text-zinc-500">{repair.expectedReturnDate ? `Hẹn trả: ${new Date(repair.expectedReturnDate).toLocaleString('vi-VN')}` : `Nhận: ${repair.receivedAt ? new Date(repair.receivedAt).toLocaleString('vi-VN') : '—'}`}</span>{onDeliver && <button onClick={onDeliver} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Trả máy & thu tiền</button>}</div></article>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-zinc-500"><Smartphone className="mx-auto h-8 w-8 text-zinc-300" /> <p className="mt-2">{text}</p></div>; }

function Field({ label, required = false, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  const isTextarea = React.isValidElement(children) && children.type === 'textarea';
  const controlClass = isTextarea ? 'min-h-24 w-full rounded-xl border border-zinc-200 p-3 text-sm' : 'h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm';
  return <label className={`block text-xs font-bold text-zinc-700 ${className}`}><span>{label}{required && <span className="ml-0.5 text-rose-500">*</span>}</span>{React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<any>, { className: `${(children as any).props.className || ''} mt-1 ${controlClass}` }) : children}</label>;
}
