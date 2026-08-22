import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, DollarSign, Loader2, Package, RefreshCw, ScanLine, Wrench, X } from 'lucide-react';
import { UserAccount, WarehouseInfo, WarrantyTicket } from '../types';
import {
  fetchTechnicalCostBreakdown,
  fetchTechnicalSpareParts,
  requestAddTechnicalExternalCost,
  requestAddTechnicalRecovery,
  requestCompleteTaskLine,
  requestDecideTechnicalExternalCost,
  requestDecideTechnicalRecovery,
  requestDeliverToCustomer,
  requestConsumeSparePart,
  requestCancelSparePartReservation,
  requestCancelSparePartIssue,
  requestFinalizeTechnicalCost,
  requestIssueSparePart,
  requestReserveSparePart,
  requestRevealTechnicalPasscode,
  requestTechnicalHandoff,
  requestReturnSparePart,
  requestScrapSparePart,
  requestReturnToStock
} from '../services/technicalApiClient';
import { uploadTechnicalEvidence } from '../services/technicalEvidenceService';

interface TechnicalWorkOrderDrawerProps {
  task: WarrantyTicket | null;
  warehouses: WarehouseInfo[];
  currentUser?: UserAccount | null;
  onClose: () => void;
  onRefresh?: () => Promise<void> | void;
}

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const ACTIVE_LINE_STATUSES = ['ACCEPTED', 'IN_PROGRESS', 'WAITING_PARTS', 'REWORK_REQUIRED'];

export const TechnicalWorkOrderDrawer: React.FC<TechnicalWorkOrderDrawerProps> = ({ task, warehouses, currentUser, onClose, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'TASKS' | 'PARTS' | 'COST' | 'QC' | 'TIMELINE' | 'RETURN'>('OVERVIEW');
  const [details, setDetails] = useState<any>(null);
  const [parts, setParts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedLineId, setSelectedLineId] = useState('');
  const [selectedPartId, setSelectedPartId] = useState('');
  const [partsWarehouseId, setPartsWarehouseId] = useState('');
  const [selectedLotId, setSelectedLotId] = useState('');
  const [issueQuantity, setIssueQuantity] = useState(1);
  const [settleQuantities, setSettleQuantities] = useState<Record<string, number>>({});
  const [settleNotes, setSettleNotes] = useState<Record<string, string>>({});
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionFiles, setCompletionFiles] = useState<File[]>([]);
  const [replacementSerials, setReplacementSerials] = useState('');
  const [externalCost, setExternalCost] = useState({ category: 'OUTSOURCED_REPAIR', amount: 0, note: '' });
  const [recovery, setRecovery] = useState({ category: 'SUPPLIER_RECOVERY', amount: 0, note: '' });
  const [returnWarehouseId, setReturnWarehouseId] = useState('');
  const [returnScannedImei, setReturnScannedImei] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [revealedPasscode, setRevealedPasscode] = useState<string | null>(null);
  const [handoffTargetWarehouseId, setHandoffTargetWarehouseId] = useState('');
  const [handoffScannedImei, setHandoffScannedImei] = useState('');
  const [handoffReason, setHandoffReason] = useState('');
  const [handoffFiles, setHandoffFiles] = useState<File[]>([]);

  const workOrderId = String((task as any)?.workOrderId || task?.id || '');
  const role = String(currentUser?.role || '').toUpperCase();
  const canFinalizeCost = ['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(role);
  const canReturnStock = ['ADMIN', 'MANAGER', 'INVENTORY_MANAGER'].includes(role);
  const canManagePartExceptions = ['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(role);
  const canDeliverCustomer = ['ADMIN', 'MANAGER', 'SALES', 'SALE', 'TECH_LEAD'].includes(role);

  const load = async () => {
    if (!workOrderId) return;
    setLoading(true); setError('');
    try {
      const [nextDetails, nextParts] = await Promise.all([
        fetchTechnicalCostBreakdown(workOrderId),
        fetchTechnicalSpareParts(partsWarehouseId || undefined)
      ]);
      setDetails(nextDetails);
      setParts(nextParts || []);
      const firstLine = nextDetails?.taskLines?.find((line: any) => line.id === (task as any)?.lineId) || nextDetails?.taskLines?.[0];
      if (!selectedLineId && firstLine) setSelectedLineId(firstLine.id);
      if (!selectedPartId && nextParts?.[0]) setSelectedPartId(nextParts[0].id);
      if (!partsWarehouseId) {
        const preferred = warehouses.find(item => item.id === nextDetails?.workOrder?.currentLocationId)
          || warehouses.find(item => item.branchId === nextDetails?.workOrder?.branchId && item.isActive !== false);
        if (preferred) setPartsWarehouseId(preferred.id);
      }
      if (!returnWarehouseId) {
        const target = warehouses.find(item => item.branchId === nextDetails?.workOrder?.branchId && item.isActive !== false && ['CENTRAL', 'RETAIL_STORE'].includes(String(item.type || '')));
        if (target) setReturnWarehouseId(target.id);
      }
    } catch (cause: any) {
      setError(cause?.message || 'Không thể tải hồ sơ kỹ thuật.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    setRevealedPasscode(null);
    if (!task) return;
    setActiveTab('OVERVIEW'); setDetails(null); setError(''); setMessage(''); setSelectedLineId(String((task as any).lineId || ''));
    void load();
  }, [workOrderId]);

  useEffect(() => {
    const part = parts.find((item: any) => item.id === selectedPartId);
    const firstAvailableLot = Array.isArray(part?.lots)
      ? part.lots.find((lot: any) => Number(lot.availableQuantity || 0) > 0)
      : null;
    setSelectedLotId(firstAvailableLot?.id || '');
  }, [selectedPartId, parts]);

  const run = async (operation: () => Promise<any>, success: string) => {
    setSaving(true); setError(''); setMessage('');
    try {
      await operation();
      setMessage(success);
      await load();
      await onRefresh?.();
    } catch (cause: any) {
      setError(cause?.message || 'Không thể hoàn tất thao tác.');
    } finally { setSaving(false); }
  };

  const selectedLine = details?.taskLines?.find((line: any) => line.id === selectedLineId);
  const selectedPart = parts.find((part: any) => part.id === selectedPartId);
  const selectedPartLots = Array.isArray(selectedPart?.lots) ? selectedPart.lots.filter((lot: any) => Number(lot.availableQuantity || 0) > 0) : [];
  const eligiblePartWarehouses = useMemo(() => warehouses.filter(item => item.isActive !== false && (!details?.workOrder?.branchId || item.branchId === details.workOrder.branchId)), [warehouses, details?.workOrder?.branchId]);
  const eligibleHandoffWarehouses = useMemo(() => warehouses.filter(item =>
    item.isActive !== false
    && !item.isArchived
    && item.type === 'TECHNICIAN_SUB'
    && item.branchId === details?.workOrder?.branchId
    && item.id !== details?.workOrder?.currentLocationId
    && !!item.custodianUid
  ), [warehouses, details?.workOrder?.branchId, details?.workOrder?.currentLocationId]);

  if (!task) return null;
  const workOrder = details?.workOrder || {};
  const breakdown = details?.breakdown;
  const partsSettled = (details?.partIssues || []).every((issue: any) =>
    Number(issue.quantityIssued || 0) === Number(issue.quantityConsumed || 0) + Number(issue.quantityReturned || 0) + Number(issue.quantityScrapped || 0)
  ) && (details?.partReservations || []).every((reservation: any) =>
    Number(reservation.quantityReserved || 0) === Number(reservation.quantityIssued || 0) + Number(reservation.quantityCancelled || 0)
  );
  const canRequestHandoff = ['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(role)
    || workOrder.currentCustodianUid === currentUser?.id;

  const completeSelectedTask = async () => {
    if (!selectedLine) throw new Error('Hãy chọn hạng mục cần báo hoàn thành.');
    if (completionNotes.trim().length < 10) throw new Error('Ghi chú kết quả phải có ít nhất 10 ký tự.');
    const requiredEvidence = Array.isArray(selectedLine.requiredEvidenceTypes) ? selectedLine.requiredEvidenceTypes : [];
    if (requiredEvidence.includes('AFTER_PHOTO') && completionFiles.length === 0) throw new Error('Hạng mục này bắt buộc có ảnh sau sửa.');
    const normalizedSerials = replacementSerials.split(/[\n,]+/).map(value => value.trim()).filter(Boolean);
    if (requiredEvidence.includes('REPLACEMENT_SERIAL') && normalizedSerials.length === 0) throw new Error('Hạng mục này bắt buộc ghi serial linh kiện thay thế.');
    const urls = await uploadTechnicalEvidence(workOrderId, selectedLine.id, completionFiles);
    await requestCompleteTaskLine(workOrderId, selectedLine.id, urls, completionNotes.trim(), { replacementSerials: normalizedSerials });
    setCompletionNotes(''); setCompletionFiles([]); setReplacementSerials('');
  };

  const revealPasscode = async () => {
    setSaving(true); setError('');
    try {
      const result = await requestRevealTechnicalPasscode(workOrderId);
      setRevealedPasscode(result.passcode || 'Không có mật mã');
    } catch (cause: any) {
      setError(cause?.message || 'Không thể xem mật mã mở máy.');
    } finally { setSaving(false); }
  };

  const requestHandoff = async () => {
    const targetWarehouse = eligibleHandoffWarehouses.find(item => item.id === handoffTargetWarehouseId);
    if (!targetWarehouse?.custodianUid) throw new Error('Kho KTV nhận phải gắn đúng tài khoản chịu trách nhiệm.');
    if (handoffReason.trim().length < 5) throw new Error('Lý do bàn giao phải có ít nhất 5 ký tự.');
    if (handoffFiles.length < 1) throw new Error('Bắt buộc có ảnh bàn giao máy.');
    const handoverPhotoUrls = await uploadTechnicalEvidence(workOrderId, 'handoff-request', handoffFiles);
    await requestTechnicalHandoff(workOrderId, {
      targetWarehouseId: targetWarehouse.id,
      targetTechnicianUid: targetWarehouse.custodianUid,
      targetTechnicianName: targetWarehouse.custodianName || targetWarehouse.technicianName,
      scannedImei: handoffScannedImei,
      reason: handoffReason.trim(),
      handoverPhotoUrls
    });
    setHandoffFiles([]);
    setHandoffReason('');
    setHandoffScannedImei('');
    setHandoffTargetWarehouseId('');
  };

  return <div className="fixed inset-0 z-[145] flex justify-end bg-black/55 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="flex h-full w-full max-w-5xl flex-col bg-zinc-50 shadow-2xl">
      <header className="flex items-start justify-between gap-4 bg-zinc-950 px-5 py-4 text-white">
        <div><div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-orange-400"/><h2 className="font-black">{workOrder.model || task.model || 'Hồ sơ kỹ thuật'}</h2></div><p className="mt-1 font-mono text-xs text-zinc-300">{workOrder.code || task.ticketNumber} · IMEI {workOrder.imei || task.imei}</p><p className="mt-1 text-xs text-orange-300">{workOrder.currentLocationId || 'Chưa xác định vị trí'} · {workOrder.status || task.status}</p></div>
        <div className="flex gap-2"><button onClick={() => void load()} className="rounded-xl bg-white/10 p-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/></button><button onClick={onClose} className="rounded-xl bg-white/10 p-2"><X className="h-5 w-5"/></button></div>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b bg-white px-3 py-2">{[
        ['OVERVIEW','Tổng quan'],['TASKS','Task & bằng chứng'],['PARTS','Linh kiện'],['COST','Giá vốn'],['QC','QC/KCS'],['TIMELINE','Timeline'],['RETURN','Nhận lại kho']
      ].map(([id,label]) => <button key={id} onClick={() => setActiveTab(id as any)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-black ${activeTab === id ? 'bg-orange-600 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>{label}</button>)}</nav>
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        {error && <div className="mb-4 flex gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"><AlertCircle className="h-5 w-5 shrink-0"/>{error}</div>}
        {message && <div className="mb-4 flex gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5 shrink-0"/>{message}</div>}
        {loading && !details ? <div className="grid h-48 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-orange-600"/></div> : <>
          {activeTab === 'OVERVIEW' && <div className="grid gap-4 md:grid-cols-2"><section className="rounded-2xl border bg-white p-5"><h3 className="font-black">Thiết bị và trách nhiệm</h3><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-zinc-500">Nguồn máy</dt><dd className="font-bold">{workOrder.workOrderType || '—'}</dd></div><div><dt className="text-xs text-zinc-500">Chủ sở hữu</dt><dd className="font-bold">{workOrder.assetOwnership || '—'}</dd></div><div><dt className="text-xs text-zinc-500">Người giữ</dt><dd className="font-bold">{workOrder.currentCustodianName || '—'}</dd></div><div><dt className="text-xs text-zinc-500">Số task</dt><dd className="font-bold">{details?.taskLines?.length || 0}</dd></div></dl>{workOrder.hasPasscode && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-bold">Mật mã mở máy</span>{revealedPasscode === null ? <button disabled={saving} onClick={() => void revealPasscode()} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-black text-white">Xem có ghi audit</button> : <button onClick={() => setRevealedPasscode(null)} className="text-xs font-bold text-zinc-600">Ẩn</button>}</div>{revealedPasscode !== null && <p className="mt-2 select-all font-mono text-lg font-black">{revealedPasscode}</p>}</div>}</section><section className="rounded-2xl border bg-white p-5"><h3 className="font-black">Trạng thái hồ sơ</h3><div className="mt-4 space-y-2 text-sm"><p className="flex justify-between"><span>QC/KCS</span><strong>{workOrder.qcStatus || 'CHƯA QC'}</strong></p><p className="flex justify-between"><span>Đối soát linh kiện</span><strong>{partsSettled ? 'ĐÃ KHỚP' : 'CHƯA KHỚP'}</strong></p><p className="flex justify-between"><span>Kết chuyển giá vốn</span><strong>{details?.costPostingStatus || 'NOT_READY'}</strong></p></div></section></div>}

          {activeTab === 'OVERVIEW' && canRequestHandoff && <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/40 p-5"><h3 className="font-black text-zinc-900">Bàn giao trách nhiệm sang KTV khác</h3><p className="mt-1 text-xs text-zinc-500">Task đang chạy phải dừng, linh kiện phải đối soát. Trách nhiệm chỉ đổi sau khi KTV nhận quét đúng IMEI và chụp ảnh.</p>{workOrder.activeHandoffId ? <div className="mt-3 rounded-xl bg-amber-100 p-3 text-sm font-bold text-amber-800">Đang chờ KTV đích xác nhận bàn giao: {workOrder.activeHandoffId}</div> : <><div className="mt-4 grid gap-3 sm:grid-cols-2"><select value={handoffTargetWarehouseId} onChange={event => setHandoffTargetWarehouseId(event.target.value)} className="h-11 rounded-xl border bg-white px-3 text-sm"><option value="">Chọn kho/KTV nhận</option>{eligibleHandoffWarehouses.map(item => <option key={item.id} value={item.id}>{item.name} · {item.custodianName || item.technicianName}</option>)}</select><input value={handoffScannedImei} onChange={event => setHandoffScannedImei(event.target.value.replace(/\D/g, '').slice(0, 15))} placeholder="Quét IMEI bàn giao" className="h-11 rounded-xl border px-3 font-mono text-sm"/><input value={handoffReason} onChange={event => setHandoffReason(event.target.value)} placeholder="Lý do bàn giao" className="h-11 rounded-xl border px-3 text-sm sm:col-span-2"/><label className="rounded-xl border border-dashed bg-white p-3 text-xs font-bold sm:col-span-2">Ảnh tình trạng lúc bàn giao<input type="file" accept="image/*" multiple onChange={event => setHandoffFiles(Array.from(event.target.files || []))} className="mt-2 block w-full text-xs"/></label></div><button disabled={saving || !handoffTargetWarehouseId || !handoffScannedImei || handoffReason.trim().length < 5 || handoffFiles.length < 1} onClick={() => void run(requestHandoff, 'Đã tạo yêu cầu; trách nhiệm vẫn thuộc KTV hiện tại cho đến khi người nhận xác nhận.')} className="mt-3 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40">Tạo yêu cầu bàn giao</button></>}</section>}

          {activeTab === 'TASKS' && <div className="space-y-4"><section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b px-4 py-3 font-black">Danh sách hạng mục</div><div className="divide-y">{(details?.taskLines || []).map((line: any) => <button key={line.id} onClick={() => setSelectedLineId(line.id)} className={`grid w-full gap-1 p-4 text-left sm:grid-cols-[1fr_170px_130px] ${selectedLineId === line.id ? 'bg-orange-50' : ''}`}><span><strong>{line.taskName}</strong><span className="mt-1 block text-xs text-zinc-500">{line.assigneeName} · {line.priority || 'NORMAL'}</span></span><span className="text-xs font-bold text-zinc-600">SLA: {line.deadlineAt ? new Date(line.deadlineAt).toLocaleString('vi-VN') : '—'}</span><span className="text-xs font-black text-orange-700">{line.status}</span></button>)}</div></section>{selectedLine && ACTIVE_LINE_STATUSES.includes(String(selectedLine.status)) && <section className="rounded-2xl border bg-white p-5"><h3 className="font-black">Báo hoàn thành: {selectedLine.taskName}</h3><textarea value={completionNotes} onChange={event => setCompletionNotes(event.target.value)} rows={3} placeholder="Mô tả kết quả trước/sau, thông số thay đổi..." className="mt-3 w-full rounded-xl border p-3 text-sm"/>{Array.isArray(selectedLine.requiredEvidenceTypes) && selectedLine.requiredEvidenceTypes.includes('REPLACEMENT_SERIAL') && <textarea value={replacementSerials} onChange={event => setReplacementSerials(event.target.value)} rows={2} placeholder="Serial linh kiện thay thế, mỗi serial một dòng" className="mt-3 w-full rounded-xl border p-3 font-mono text-sm"/>}<label className="mt-3 block rounded-xl border border-dashed p-4 text-sm"><span className="font-bold">Ảnh bằng chứng trước/sau</span><input type="file" accept="image/*" multiple onChange={event => setCompletionFiles(Array.from(event.target.files || []))} className="mt-2 block w-full text-xs"/><span className="mt-1 block text-xs text-zinc-500">Đã chọn {completionFiles.length} ảnh, tối đa 8 ảnh · 10MB/ảnh.</span></label><button disabled={saving} onClick={() => void run(completeSelectedTask, 'Đã gửi hạng mục sang chờ KCS.')} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">Hoàn thành hạng mục</button></section>}</div>}

          {activeTab === 'PARTS' && <div className="space-y-4">
            <section className="rounded-2xl border bg-white p-5">
              <h3 className="font-black">Giữ trước hoặc xuất linh kiện cho task</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <select value={selectedLineId} onChange={event => setSelectedLineId(event.target.value)} className="h-11 rounded-xl border px-3 text-sm">{(details?.taskLines || []).map((line: any) => <option key={line.id} value={line.id}>{line.taskName}</option>)}</select>
                <select value={partsWarehouseId} onChange={event => setPartsWarehouseId(event.target.value)} className="h-11 rounded-xl border px-3 text-sm"><option value="">Chọn kho xuất</option>{eligiblePartWarehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <select value={selectedPartId} onChange={event => setSelectedPartId(event.target.value)} className="h-11 rounded-xl border px-3 text-sm"><option value="">Chọn linh kiện</option>{parts.filter(item => item.availableQuantity > 0).map(item => <option key={item.id} value={item.id}>{item.name} · còn {item.availableQuantity}</option>)}</select>
                <select value={selectedLotId} onChange={event => setSelectedLotId(event.target.value)} disabled={selectedPartLots.length === 0} className="h-11 rounded-xl border px-3 text-sm disabled:bg-zinc-100"><option value="">{selectedPartLots.length ? 'Chọn lô xuất' : 'Không quản lý theo lô'}</option>{selectedPartLots.map((lot: any) => <option key={lot.id} value={lot.id}>{lot.lotCode} · còn {lot.availableQuantity}</option>)}</select>
                <input type="number" min={1} value={issueQuantity} onChange={event => setIssueQuantity(Number(event.target.value))} className="h-11 rounded-xl border px-3"/>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={saving || !selectedLineId || !selectedPartId || !partsWarehouseId || (selectedPartLots.length > 0 && !selectedLotId)} onClick={() => void run(() => requestReserveSparePart(workOrderId, selectedLineId, selectedPartId, partsWarehouseId, issueQuantity, selectedLotId || undefined), 'Đã giữ linh kiện cho đúng task.' )} className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">Giữ trước</button>
                <button disabled={saving || !selectedLineId || !selectedPartId || !partsWarehouseId || (selectedPartLots.length > 0 && !selectedLotId)} onClick={() => void run(() => requestIssueSparePart(workOrderId, selectedLineId, selectedPartId, partsWarehouseId, issueQuantity, selectedLotId || undefined), 'Đã xuất linh kiện và snapshot giá vốn.' )} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Package className="mr-2 inline h-4 w-4"/>Xuất ngay</button>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border bg-white">
              <div className="border-b px-4 py-3 font-black">Linh kiện đang giữ trước</div>
              <div className="divide-y">{(details?.partReservations || []).map((reservation: any) => { const outstanding = Number(reservation.quantityReserved || 0) - Number(reservation.quantityIssued || 0) - Number(reservation.quantityCancelled || 0); const reason = settleNotes[reservation.id] || ''; return <div key={reservation.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{reservation.partName}</strong><p className="text-xs text-zinc-500">Giữ {reservation.quantityReserved} · Đã xuất {reservation.quantityIssued || 0} · Còn {outstanding} · {reservation.lotId ? `Lô ${reservation.lotId}` : 'Bình quân kho'}</p></div><span className="text-xs font-black">{reservation.status}</span></div>{outstanding > 0 && <div className="mt-3 flex flex-wrap gap-2"><button disabled={saving} onClick={() => void run(() => requestIssueSparePart(workOrderId, reservation.workOrderLineId, reservation.partId, reservation.warehouseId, outstanding, reservation.lotId || undefined, reservation.id), 'Đã phát hành linh kiện từ phần giữ trước.')} className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-black text-white">Xuất phần đã giữ</button><input value={reason} onChange={event => setSettleNotes(current => ({ ...current, [reservation.id]: event.target.value }))} placeholder="Lý do hủy giữ" className="h-9 min-w-52 flex-1 rounded-lg border px-2 text-xs"/><button disabled={saving || reason.trim().length < 5} onClick={() => void run(() => requestCancelSparePartReservation(workOrderId, reservation.id, reason.trim()), 'Đã giải phóng tồn giữ trước.')} className="rounded-lg bg-red-50 px-3 text-xs font-black text-red-700 disabled:opacity-40">Hủy giữ</button></div>}</div>; })}{!details?.partReservations?.length && <p className="p-6 text-sm text-zinc-500">Chưa có linh kiện giữ trước.</p>}</div>
            </section>

            <section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b px-4 py-3 font-black">Đối soát linh kiện đã xuất</div><div className="divide-y">{(details?.partIssues || []).map((issue: any) => { const outstanding = Number(issue.quantityIssued || 0) - Number(issue.quantityConsumed || 0) - Number(issue.quantityReturned || 0) - Number(issue.quantityScrapped || 0); const quantity = settleQuantities[issue.id] || outstanding || 1; const exceptionReason = settleNotes[issue.id] || ''; return <div key={issue.id} className="p-4"><div className="flex flex-wrap justify-between gap-2"><div><strong>{issue.partName}</strong><p className="text-xs text-zinc-500">Xuất {issue.quantityIssued} · Dùng {issue.quantityConsumed} · Trả {issue.quantityReturned} · Hỏng {issue.quantityScrapped || 0}</p></div><span className="text-xs font-black">{issue.status}</span></div>{outstanding > 0 && <div className="mt-3 flex flex-wrap gap-2"><input type="number" min={1} max={outstanding} value={quantity} onChange={event => setSettleQuantities(current => ({ ...current, [issue.id]: Number(event.target.value) }))} className="h-9 w-24 rounded-lg border px-2"/><button disabled={saving} onClick={() => void run(() => requestConsumeSparePart(workOrderId, issue.id, quantity), 'Đã ghi nhận linh kiện thực dùng.')} className="rounded-lg bg-emerald-600 px-3 text-xs font-black text-white">Xác nhận dùng</button><button disabled={saving} onClick={() => void run(() => requestReturnSparePart(workOrderId, issue.id, quantity), 'Đã trả linh kiện về đúng kho.')} className="rounded-lg bg-zinc-800 px-3 text-xs font-black text-white">Trả lại kho</button>{canManagePartExceptions && <><input value={exceptionReason} onChange={event => setSettleNotes(current => ({ ...current, [issue.id]: event.target.value }))} placeholder="Lý do hỏng/hủy" className="h-9 min-w-44 flex-1 rounded-lg border px-2 text-xs"/><button disabled={saving || exceptionReason.trim().length < 5} onClick={() => void run(() => requestScrapSparePart(workOrderId, issue.id, quantity, exceptionReason.trim(), true), 'Đã ghi nhận linh kiện hỏng và ledger chi phí.')} className="rounded-lg bg-amber-100 px-3 text-xs font-black text-amber-800 disabled:opacity-40">Báo hỏng</button>{outstanding === Number(issue.quantityIssued || 0) && <button disabled={saving || exceptionReason.trim().length < 5} onClick={() => void run(() => requestCancelSparePartIssue(workOrderId, issue.id, exceptionReason.trim()), 'Đã đảo phiếu xuất và hoàn tồn kho.')} className="rounded-lg bg-red-50 px-3 text-xs font-black text-red-700 disabled:opacity-40">Hủy xuất</button>}</>}</div>}</div>; })}{!details?.partIssues?.length && <p className="p-6 text-sm text-zinc-500">Chưa xuất linh kiện nào.</p>}</div></section>
          </div>}

          {activeTab === 'COST' && <div className="space-y-4">{details?.canViewCost ? <><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Giá vốn đầu kỳ',breakdown?.openingDeviceCost],['Linh kiện',breakdown?.partsCost],['Công kỹ thuật',breakdown?.laborCost],['Chi phí ngoài',Number(breakdown?.externalCost || 0)+Number(breakdown?.otherCost || 0)],['Thu hồi/hoàn trả',-Number(breakdown?.recoveryAmount || 0)],['Giá vốn mới',breakdown?.closingDeviceCost]].map(([label,value]) => <div key={String(label)} className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold text-zinc-500">{label}</p><p className="mt-1 text-lg font-black">{money.format(Number(value || 0))}</p></div>)}</section><section className="rounded-2xl border bg-white p-5"><h3 className="font-black">Thêm chi phí ngoài</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><select value={externalCost.category} onChange={event => setExternalCost(current => ({ ...current, category: event.target.value }))} className="h-11 rounded-xl border px-3"><option value="OUTSOURCED_REPAIR">Sửa ngoài</option><option value="TRANSPORT">Vận chuyển</option><option value="MATERIAL">Vật tư</option><option value="OTHER">Chi phí khác</option></select><input type="number" value={externalCost.amount} onChange={event => setExternalCost(current => ({ ...current, amount: Number(event.target.value) }))} placeholder="Số tiền" className="h-11 rounded-xl border px-3"/><input value={externalCost.note} onChange={event => setExternalCost(current => ({ ...current, note: event.target.value }))} placeholder="Nội dung/chứng từ" className="h-11 rounded-xl border px-3"/></div><div className="mt-3 flex gap-2"><button disabled={saving} onClick={() => void run(() => requestAddTechnicalExternalCost(workOrderId, externalCost), 'Đã ghi nhận chi phí.' )} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-black text-white">Ghi chi phí</button>{canFinalizeCost && workOrder.status === 'QC_PASSED' && details.costPostingStatus !== 'POSTED' && <button disabled={saving} onClick={() => void run(() => requestFinalizeTechnicalCost(workOrderId), 'Đã chốt giá vốn mới cho IMEI.' )} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white"><DollarSign className="mr-1 inline h-4 w-4"/>Chốt giá vốn</button>}</div></section><section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b px-4 py-3 font-black">Đối soát chi phí ngoài</div><div className="divide-y">{(details.externalCosts || []).map((cost: any) => <div key={cost.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-bold">{cost.note}</p><p className="mt-1 text-xs text-zinc-500">{cost.category} · {money.format(Number(cost.amount || 0))}</p></div><div className="flex items-center gap-2"><span className="text-xs font-black">{cost.approvalStatus}</span>{canFinalizeCost && cost.approvalStatus === 'PENDING' && <><button disabled={saving} onClick={() => void run(() => requestDecideTechnicalExternalCost(workOrderId, cost.id, 'APPROVED'), 'Đã duyệt chi phí.')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white">Duyệt</button><button disabled={saving} onClick={() => void run(() => requestDecideTechnicalExternalCost(workOrderId, cost.id, 'REJECTED'), 'Đã từ chối chi phí.')} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-black text-red-700">Từ chối</button></>}</div></div>)}{!details.externalCosts?.length && <p className="p-5 text-sm text-zinc-500">Chưa có chi phí ngoài.</p>}</div></section></> : <div className="rounded-2xl border bg-white p-8 text-center text-sm text-zinc-500">Tài khoản của bạn không có quyền xem giá vốn. Bạn vẫn có thể đối soát số lượng linh kiện ở tab Linh kiện.</div>}</div>}

          {activeTab === 'COST' && details?.canViewCost && <section className="rounded-2xl border bg-white p-5"><h3 className="font-black">Thu hồi / NCC bồi hoàn</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><select value={recovery.category} onChange={event => setRecovery(current => ({ ...current, category: event.target.value }))} className="h-11 rounded-xl border px-3"><option value="SUPPLIER_RECOVERY">NCC bồi hoàn</option><option value="WARRANTY_COMPENSATION">Bồi hoàn bảo hành</option><option value="OTHER">Khoản thu hồi khác</option></select><input type="number" value={recovery.amount} onChange={event => setRecovery(current => ({ ...current, amount: Number(event.target.value) }))} placeholder="Số tiền giảm vốn" className="h-11 rounded-xl border px-3"/><input value={recovery.note} onChange={event => setRecovery(current => ({ ...current, note: event.target.value }))} placeholder="Nội dung/chứng từ" className="h-11 rounded-xl border px-3"/></div><button disabled={saving || recovery.amount <= 0 || recovery.note.trim().length < 3} onClick={() => void run(() => requestAddTechnicalRecovery(workOrderId, recovery), 'Đã ghi nhận khoản bồi hoàn/thu hồi.')} className="mt-3 rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Ghi khoản giảm giá vốn</button><div className="mt-4 divide-y rounded-xl border">{(details.recoveries || []).map((item: any) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div><p className="font-bold">{item.note}</p><p className="text-xs text-zinc-500">{item.category} · {money.format(Number(item.amount || 0))}</p></div><div className="flex gap-2"><span className="text-xs font-black">{item.approvalStatus}</span>{canFinalizeCost && item.approvalStatus === 'PENDING' && <><button disabled={saving} onClick={() => void run(() => requestDecideTechnicalRecovery(workOrderId, item.id, 'APPROVED'), 'Đã duyệt khoản thu hồi.')} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-black text-white">Duyệt</button><button disabled={saving} onClick={() => void run(() => requestDecideTechnicalRecovery(workOrderId, item.id, 'REJECTED'), 'Đã từ chối khoản thu hồi.')} className="rounded-lg bg-red-50 px-3 py-1 text-xs font-black text-red-700">Từ chối</button></>}</div></div>)}{!details.recoveries?.length && <p className="p-3 text-sm text-zinc-500">Chưa có khoản thu hồi.</p>}</div></section>}

          {activeTab === 'QC' && <div className="space-y-3">{(details?.qcInspections || []).map((inspection: any) => <section key={inspection.id} className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">KCS {inspection.overallResult}</h3><p className="mt-1 text-xs text-zinc-500">{inspection.inspectorName || inspection.inspectorUid || 'Không có dữ liệu người QC'} · {inspection.inspectedAt ? new Date(inspection.inspectedAt).toLocaleString('vi-VN') : 'Không có thời gian'}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${inspection.overallResult === 'PASS' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{inspection.overallResult}</span></div>{inspection.failedReason && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{inspection.failedReason}</p>}<div className="mt-4 grid gap-2 sm:grid-cols-2">{Object.entries(inspection.checklistResults || {}).map(([key,value]) => <p key={key} className="flex justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs"><span>{key}</span><strong className={value ? 'text-emerald-700' : 'text-red-700'}>{value ? 'Đạt' : 'Không đạt'}</strong></p>)}</div></section>)}{!details?.qcInspections?.length && <div className="rounded-2xl border bg-white p-8 text-center text-sm text-zinc-500">Chưa có biên bản QC/KCS.</div>}</div>}

          {activeTab === 'TIMELINE' && <section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b px-4 py-3 font-black">Ledger theo thời gian thực</div><div className="divide-y">{(details?.timeline || []).map((event: any) => <div key={event.id} className="grid gap-2 p-4 sm:grid-cols-[170px_1fr]"><time className="text-xs font-bold text-zinc-500">{new Date(event.occurredAt).toLocaleString('vi-VN')}</time><div><p className="font-bold">{event.title}</p><p className="mt-1 text-xs text-zinc-500">{event.actorName || event.actorUid || 'Không có dữ liệu người thực hiện'}{event.fromLocationId || event.toLocationId ? ` · ${event.fromLocationId || '—'} → ${event.toLocationId || '—'}` : ''}</p>{details.canViewCost && event.amount != null && <p className="mt-1 text-xs font-black text-orange-700">Biến động {money.format(Number(event.amount))} · Giá vốn sau {money.format(Number(event.costAfter || 0))}</p>}</div></div>)}{!details?.timeline?.length && <p className="p-8 text-center text-sm text-zinc-500">Không có dữ liệu lịch sử từ ledger.</p>}</div></section>}

          {activeTab === 'RETURN' && (workOrder.assetOwnership === 'CUSTOMER' ? <section className="mx-auto max-w-xl rounded-2xl border bg-white p-5"><h3 className="font-black">Bàn giao máy cho khách</h3><p className="mt-1 text-sm text-zinc-500">Chỉ giao sau khi KCS đạt. Mật mã mở máy mã hóa sẽ bị xóa sau khi xác nhận.</p><textarea value={deliveryNotes} onChange={event => setDeliveryNotes(event.target.value)} rows={3} placeholder="Tình trạng bàn giao, phụ kiện đi kèm, người nhận..." className="mt-4 w-full rounded-xl border p-3 text-sm"/><button disabled={saving || !canDeliverCustomer || workOrder.status !== 'QC_PASSED' || deliveryNotes.trim().length < 5} onClick={() => void run(() => requestDeliverToCustomer(workOrderId, deliveryNotes.trim()), 'Đã bàn giao máy cho khách và chốt điều kiện hoa hồng.')} className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white disabled:opacity-40">Xác nhận bàn giao khách</button>{!canDeliverCustomer && <p className="mt-2 text-xs text-amber-700">Chỉ Sales, Trưởng kỹ thuật, Manager hoặc Admin được bàn giao.</p>}</section> : <section className="mx-auto max-w-xl rounded-2xl border bg-white p-5"><h3 className="font-black">Kho quét nhận máy sau sửa</h3><p className="mt-1 text-sm text-zinc-500">Chỉ mở nhập kho khi QC đạt, linh kiện đã đối soát và giá vốn đã POSTED.</p><select value={returnWarehouseId} onChange={event => setReturnWarehouseId(event.target.value)} className="mt-4 h-11 w-full rounded-xl border px-3"><option value="">Chọn kho nhận</option>{eligiblePartWarehouses.filter(item => ['CENTRAL','RETAIL_STORE'].includes(String(item.type || ''))).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><label className="mt-3 block"><span className="text-xs font-black">Quét IMEI thực nhận</span><div className="relative mt-1"><ScanLine className="absolute left-3 top-3 h-5 w-5 text-zinc-400"/><input value={returnScannedImei} onChange={event => setReturnScannedImei(event.target.value.replace(/\D/g,'').slice(0,15))} className="h-11 w-full rounded-xl border pl-11 pr-3 font-mono" placeholder={workOrder.imei || 'IMEI 5–15 số'}/></div></label><div className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm"><p className="flex justify-between"><span>QC</span><strong>{workOrder.status === 'QC_PASSED' ? 'Đạt' : workOrder.status}</strong></p><p className="mt-2 flex justify-between"><span>Giá vốn</span><strong>{details?.costPostingStatus}</strong></p></div><button disabled={saving || !canReturnStock || details?.costPostingStatus !== 'POSTED' || !returnWarehouseId || !returnScannedImei} onClick={() => void run(() => requestReturnToStock(workOrderId, returnWarehouseId, returnScannedImei), 'Đã nhận lại đúng IMEI và mở tồn kho bán.' )} className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white disabled:opacity-40">Quét nhận và nhập lại kho</button>{!canReturnStock && <p className="mt-2 text-xs text-amber-700">Chỉ quản lý kho, Manager hoặc Admin được xác nhận nhận lại.</p>}</section>)}
        </>}
      </main>
    </aside>
  </div>;
};
