import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Loader2, RefreshCw, Wrench, X, XCircle } from 'lucide-react';
import type { StaffMember, UserAccount, WarehouseInfo } from '../types';
import { apiJson } from '../services/apiClient';

type RequestRow = { id: string; requestType: string; model: string; imei: string; customerName: string; customerPhone: string; description: string; issueType?: string; branchId: string; branchName: string; status: string; createdAt: string; preferredVisitAt?: string | null; convertedWorkOrderId?: string | null };
type TaskType = { taskType: string; name: string; isActive?: boolean };
const staffUid = (staff?: StaffMember | null) => String((staff as any)?.authUid || staff?.id || '');

export function CustomerServiceRequestsView({ currentUser, warehouses, staffMembers }: { currentUser?: UserAccount | null; warehouses: WarehouseInfo[]; staffMembers: StaffMember[] }) {
  const [items, setItems] = useState<RequestRow[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [converting, setConverting] = useState<RequestRow | null>(null);
  const [form, setForm] = useState({ sourceWarehouseId: '', destinationWarehouseId: '', assigneeUid: '', taskType: '', priority: 'NORMAL', expectedReturnDate: '', customerApprovedQuote: 0, notes: '' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const statusQuery = status ? `&status=${encodeURIComponent(status)}` : '';
      const [requests, metadata] = await Promise.all([
        apiJson<{ success: boolean; data: RequestRow[] }>(`/api/customer-portal/staff/service-requests?branchId=${encodeURIComponent(currentUser?.branchId || '')}${statusQuery}`),
        apiJson<{ success: boolean; data: { taskTypes: TaskType[] } }>('/api/inventory-transfers/metadata')
      ]);
      setItems(requests.data || []);
      setTaskTypes((metadata.data?.taskTypes || []).filter(item => item.isActive !== false));
    } catch (e: any) { setError(e?.message || 'Không tải được yêu cầu khách hàng.'); }
    finally { setLoading(false); }
  }, [currentUser?.branchId, status]);
  useEffect(() => { void load(); }, [load]);

  const review = async (item: RequestRow, nextStatus: 'UNDER_REVIEW' | 'REJECTED') => {
    setBusy(item.id); setError('');
    try {
      await apiJson(`/api/customer-portal/staff/service-requests/${encodeURIComponent(item.id)}/review`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      await load();
    } catch (e: any) { setError(e?.message || 'Không cập nhật được yêu cầu.'); }
    finally { setBusy(''); }
  };

  const branchWarehouses = useMemo(() => warehouses.filter(item => item.branchId === converting?.branchId && item.isActive !== false && item.active !== false), [converting?.branchId, warehouses]);
  const sourceWarehouses = branchWarehouses.filter(item => !['TECHNICIAN_SUB', 'REPAIR_WARRANTY'].includes(String(item.type || '')));
  const destinationWarehouses = branchWarehouses.filter(item => ['TECHNICIAN_SUB', 'REPAIR_WARRANTY'].includes(String(item.type || '')));
  const technicians = useMemo(() => staffMembers.filter(item => item.status === 'ACTIVE' && ['TECHNICIAN', 'TECH', 'TECH_LEAD'].includes(String(item.role)) && (item.branchId === converting?.branchId || item.assignedBranchIds?.includes(String(converting?.branchId || '')))), [converting?.branchId, staffMembers]);

  const startConvert = (item: RequestRow) => {
    const branchSources = warehouses.filter(warehouse => warehouse.branchId === item.branchId && warehouse.isActive !== false && !['TECHNICIAN_SUB', 'REPAIR_WARRANTY'].includes(String(warehouse.type || '')));
    const branchDestinations = warehouses.filter(warehouse => warehouse.branchId === item.branchId && warehouse.isActive !== false && ['TECHNICIAN_SUB', 'REPAIR_WARRANTY'].includes(String(warehouse.type || '')));
    const branchTechnicians = staffMembers.filter(staff => staff.status === 'ACTIVE' && ['TECHNICIAN', 'TECH', 'TECH_LEAD'].includes(String(staff.role)) && (staff.branchId === item.branchId || staff.assignedBranchIds?.includes(item.branchId)));
    const initialDestination = branchDestinations[0];
    const destinationCustodian = String(initialDestination?.custodianUid || initialDestination?.technicianId || '');
    setForm({
      sourceWarehouseId: String(branchSources[0]?.id || ''), destinationWarehouseId: String(branchDestinations[0]?.id || ''),
      assigneeUid: destinationCustodian || staffUid(branchTechnicians[0]), taskType: taskTypes[0]?.taskType || '', priority: 'NORMAL',
      expectedReturnDate: item.preferredVisitAt ? String(item.preferredVisitAt).slice(0, 16) : '', customerApprovedQuote: 0, notes: ''
    });
    setConverting(item);
  };

  const changeDestination = (destinationWarehouseId: string) => {
    const destination = destinationWarehouses.find(item => String(item.id) === destinationWarehouseId);
    const custodianUid = String(destination?.custodianUid || destination?.technicianId || '');
    setForm(current => ({ ...current, destinationWarehouseId, ...(destination?.type === 'TECHNICIAN_SUB' && custodianUid ? { assigneeUid: custodianUid } : {}) }));
  };

  const convert = async () => {
    if (!converting) return;
    const staff = technicians.find(item => staffUid(item) === form.assigneeUid);
    setBusy(converting.id); setError('');
    try {
      await apiJson(`/api/customer-portal/staff/service-requests/${encodeURIComponent(converting.id)}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          sourceWarehouseId: form.sourceWarehouseId,
          destinationWarehouseId: form.destinationWarehouseId,
          expectedReturnDate: form.expectedReturnDate ? new Date(form.expectedReturnDate).toISOString() : null,
          customerApprovedQuote: Number(form.customerApprovedQuote || 0),
          totalEstimatedCost: 0,
          notes: form.notes,
          lines: [{ taskType: form.taskType, priority: form.priority, assigneeUid: form.assigneeUid, assigneeName: staff?.name || form.assigneeUid }]
        })
      });
      setConverting(null); await load();
    } catch (e: any) { setError(e?.message || 'Không tạo được Work Order.'); }
    finally { setBusy(''); }
  };

  return <main className="space-y-4">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#ff4b16]">PhoneHouse Care</p><h1 className="mt-1 text-2xl font-black">Yêu cầu sửa chữa từ khách</h1><p className="mt-1 text-sm text-zinc-500">Xác minh yêu cầu rồi chuyển một lần thành Work Order kỹ thuật chính thức.</p></div><button onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-zinc-200 bg-white px-3 text-xs font-black"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />Làm mới</button></div>
    <div className="flex gap-2 overflow-x-auto pb-1">{[['','Tất cả'],['SUBMITTED','Mới gửi'],['UNDER_REVIEW','Đang xem'],['CONVERTED','Đã tạo WO'],['REJECTED','Cần bổ sung']].map(([value,label]) => <button key={value} onClick={() => setStatus(value)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${status === value ? 'bg-zinc-950 text-white' : 'border border-zinc-200 bg-white text-zinc-600'}`}>{label}</button>)}</div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}
    {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div> : !items.length ? <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-zinc-500"><ClipboardList className="mx-auto mb-2 h-8 w-8 text-zinc-300" />Chưa có yêu cầu phù hợp.</div> : <div className="space-y-3">{items.map(item => <article key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-zinc-900">{item.model}</h2><span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-700">{item.requestType === 'WARRANTY' ? 'Bảo hành' : 'Sửa dịch vụ'}</span><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-600">{item.status}</span></div><p className="mt-1 font-mono text-xs text-zinc-500">{item.imei} · {item.customerName} · {item.customerPhone}</p><p className="mt-3 text-sm leading-6 text-zinc-700">{item.description}</p><p className="mt-2 text-xs text-zinc-400">{item.branchName} · gửi {new Date(item.createdAt).toLocaleString('vi-VN')}</p>{item.convertedWorkOrderId && <p className="mt-2 text-xs font-black text-emerald-700">Work Order: {item.convertedWorkOrderId}</p>}</div><div className="flex shrink-0 flex-wrap gap-2">{item.status === 'SUBMITTED' && <><button onClick={() => void review(item, 'UNDER_REVIEW')} disabled={busy === item.id} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white"><CheckCircle2 className="h-4 w-4" />Tiếp nhận</button><button onClick={() => void review(item, 'REJECTED')} disabled={busy === item.id} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-rose-200 px-3 text-xs font-black text-rose-600"><XCircle className="h-4 w-4" />Bổ sung</button></>}{['SUBMITTED', 'UNDER_REVIEW'].includes(item.status) && <button onClick={() => startConvert(item)} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-zinc-950 px-3 text-xs font-black text-white"><Wrench className="h-4 w-4" />Tạo Work Order</button>}</div></div></article>)}</div>}
    {converting && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-0 sm:p-6"><div className="mx-auto min-h-full max-w-xl bg-white sm:min-h-0 sm:rounded-3xl"><div className="flex items-center justify-between border-b px-4 py-3"><div><p className="font-black">Chuyển thành Work Order</p><p className="text-xs text-zinc-500">{converting.model} · {converting.imei}</p></div><button onClick={() => setConverting(null)} className="flex h-11 w-11 items-center justify-center rounded-xl"><X className="h-5 w-5" /></button></div><div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6"><label className="text-sm font-bold">Kho tiếp nhận<select value={form.sourceWarehouseId} onChange={e => setForm({ ...form, sourceWarehouseId: e.target.value })} className="mt-1 h-12 w-full rounded-xl border px-3"><option value="">Chọn kho</option>{sourceWarehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-bold">Kho kỹ thuật đích<select value={form.destinationWarehouseId} onChange={e => changeDestination(e.target.value)} className="mt-1 h-12 w-full rounded-xl border px-3"><option value="">Chọn kho</option>{destinationWarehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-bold">Kỹ thuật viên<select value={form.assigneeUid} onChange={e => setForm({ ...form, assigneeUid: e.target.value })} className="mt-1 h-12 w-full rounded-xl border px-3"><option value="">Chọn KTV</option>{technicians.map(item => <option key={item.id} value={staffUid(item)}>{item.name}</option>)}</select></label><label className="text-sm font-bold">Hạng mục<select value={form.taskType} onChange={e => setForm({ ...form, taskType: e.target.value })} className="mt-1 h-12 w-full rounded-xl border px-3"><option value="">Chọn task</option>{taskTypes.map(item => <option key={item.taskType} value={item.taskType}>{item.name}</option>)}</select></label><label className="text-sm font-bold">Ưu tiên<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="mt-1 h-12 w-full rounded-xl border px-3"><option value="NORMAL">Bình thường</option><option value="PRIORITY">Ưu tiên</option><option value="URGENT">Khẩn</option></select></label><label className="text-sm font-bold">Hẹn trả dự kiến<input type="datetime-local" value={form.expectedReturnDate} onChange={e => setForm({ ...form, expectedReturnDate: e.target.value })} className="mt-1 h-12 w-full rounded-xl border px-3" /></label><label className="text-sm font-bold sm:col-span-2">Báo giá ban đầu (VNĐ)<input type="number" min="0" step="1000" value={form.customerApprovedQuote} onChange={e => setForm({ ...form, customerApprovedQuote: Number(e.target.value) })} className="mt-1 h-12 w-full rounded-xl border px-3" /><span className="mt-1 block text-xs font-normal text-zinc-500">Giá dự kiến; báo giá chính thức vẫn phải qua quy trình duyệt và OTP khách hàng.</span></label><label className="text-sm font-bold sm:col-span-2">Ghi chú nội bộ<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1 min-h-24 w-full rounded-xl border p-3" /></label>{(!sourceWarehouses.length || !destinationWarehouses.length || !technicians.length || !taskTypes.length) && <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800 sm:col-span-2">Chi nhánh cần có kho tiếp nhận, kho kỹ thuật, KTV hoạt động và task type trước khi tạo Work Order.</p>}<div className="flex justify-end gap-2 sm:col-span-2"><button onClick={() => setConverting(null)} className="min-h-11 rounded-xl border px-4 text-sm font-black">Hủy</button><button onClick={() => void convert()} disabled={busy === converting.id || !form.sourceWarehouseId || !form.destinationWarehouseId || !form.assigneeUid || !form.taskType} className="min-h-11 rounded-xl bg-[#ff4b16] px-5 text-sm font-black text-white disabled:opacity-40">{busy === converting.id ? 'Đang tạo…' : 'Xác nhận tạo Work Order'}</button></div></div></div></div>}
  </main>;
}

export default CustomerServiceRequestsView;
