import React, { useMemo, useState } from 'react';
import { WarrantyTicket } from '../types';
import { KanbanSquare, Wrench, Package, ArrowRight, CheckCircle2, QrCode, AlertCircle } from 'lucide-react';
import {
  requestAcceptCustody,
  requestStartTaskLine,
  requestQCInspection
} from '../services/technicalApiClient';
import { uploadTechnicalEvidence } from '../services/technicalEvidenceService';

interface TechKanbanBoardProps {
  tasks: WarrantyTicket[];
  onTaskClick: (task: WarrantyTicket) => void;
  onOpenAddTaskModal?: () => void;
  onRefresh?: () => Promise<void> | void;
  currentUserRole?: string;
}

const QC_STEPS: Array<[string, string]> = [
  ['appearance', 'Ngoại hình, viền, lưng, kính'], ['screen_touch', 'Màn hình và cảm ứng'],
  ['battery_health', 'Pin và dung lượng'], ['face_touch_id', 'Face ID / Touch ID'],
  ['camera_front_back', 'Camera trước và sau'], ['audio_mic_speaker', 'Loa và microphone'],
  ['network_wifi_cellular', 'Sóng, Wi-Fi, Bluetooth'], ['charging_port', 'Cổng sạc'],
  ['true_tone', 'True Tone và cảm biến'], ['buttons_switches', 'Các phím vật lý'],
  ['water_seal_glue', 'Ron/keo chống nước'], ['internal_cleaning', 'Vệ sinh hoàn thiện']
];

export const TechKanbanBoard: React.FC<TechKanbanBoardProps> = ({ tasks, onTaskClick, onOpenAddTaskModal, onRefresh, currentUserRole }) => {
  const [scanModalTaskId, setScanModalTaskId] = useState<string | null>(null);
  const [scannedImei, setScannedImei] = useState('');
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [qcTask, setQcTask] = useState<WarrantyTicket | null>(null);
  const [qcChecks, setQcChecks] = useState<Record<string, boolean>>({});
  const [qcResult, setQcResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [qcReason, setQcReason] = useState('');
  const [qcFiles, setQcFiles] = useState<File[]>([]);
  const [acceptanceFiles, setAcceptanceFiles] = useState<File[]>([]);
  const [technicianFilter, setTechnicianFilter] = useState('ALL');

  const [preRepairInspection, setPreRepairInspection] = useState({
    appearance: 'GOOD' as 'GOOD' | 'SCRATCHED' | 'DENTED',
    screen: 'OK' as 'OK' | 'DEFECTIVE' | 'NOT_TESTABLE',
    power: 'OK' as 'OK' | 'NO_POWER',
    biometrics: 'OK' as 'OK' | 'DEFECTIVE' | 'NOT_TESTABLE',
    technicianNotes: ''
  });

  // Columns Definition
  const COLUMNS = [
    { id: 'TODO', title: 'Chờ Tiếp Nhận', statuses: ['received', 'ASSIGNED'] },
    { id: 'IN_PROGRESS', title: 'Đang Xử Lý', statuses: ['inspecting', 'repairing', 'IN_PROGRESS', 'ACCEPTED', 'REWORK_REQUIRED'] },
    { id: 'PENDING_PARTS', title: 'Chờ Linh Kiện', statuses: ['waiting_parts', 'WAITING_PARTS'] },
    { id: 'DONE', title: 'Hoàn Thành (Chờ QC / Đã QC)', statuses: ['ready', 'delivered', 'COMPLETED', 'TECH_COMPLETED', 'QC_PASSED', 'VERIFIED'] }
  ];

  const canFilterTechnician = ['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(String(currentUserRole || '').toUpperCase());
  const technicians = useMemo(() => [...new Set(tasks.map(task => String(task.technician || 'Chưa gán KTV')).filter(Boolean))], [tasks]);
  const visibleTasks = useMemo(() => technicianFilter === 'ALL' ? tasks : tasks.filter(task => String(task.technician || 'Chưa gán KTV') === technicianFilter), [tasks, technicianFilter]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, WarrantyTicket[]> = {
      'TODO': [],
      'IN_PROGRESS': [],
      'PENDING_PARTS': [],
      'DONE': []
    };

    visibleTasks.forEach(task => {
      const status = task.status || 'received';
      if (COLUMNS[0].statuses.includes(status)) groups['TODO'].push(task);
      else if (COLUMNS[1].statuses.includes(status)) groups['IN_PROGRESS'].push(task);
      else if (COLUMNS[2].statuses.includes(status)) groups['PENDING_PARTS'].push(task);
      else if (COLUMNS[3].statuses.includes(status)) groups['DONE'].push(task);
      else groups['TODO'].push(task);
    });

    return groups;
  }, [visibleTasks]);

  const handleAcceptCustodySubmit = async (task: WarrantyTicket) => {
    if (!scannedImei.trim()) {
      setActionError('Vui lòng quét hoặc nhập số IMEI thực tế của máy để nhận bàn giao.');
      return;
    }
    if (acceptanceFiles.length === 0) {
      setActionError('Bắt buộc chụp ít nhất một ảnh tình trạng máy khi nhận.');
      return;
    }

    setLoadingTaskId(task.id);
    setActionError(null);
    try {
      const workOrderId = String((task as any).workOrderId || task.id);
      const urls = await uploadTechnicalEvidence(workOrderId, `acceptance-${String((task as any).lineId || 'device')}`, acceptanceFiles);
      await requestAcceptCustody(workOrderId, scannedImei.trim(), { ...preRepairInspection, handoverPhotoUrls: urls });
      setScanModalTaskId(null);
      setScannedImei('');
      setAcceptanceFiles([]);
      // Reset inspection form
      setPreRepairInspection({
        appearance: 'GOOD',
        screen: 'OK',
        power: 'OK',
        biometrics: 'OK',
        technicianNotes: ''
      });
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('[Accept Custody Error]:', err);
      setActionError(err?.message || 'Không thể nhận máy.');
    } finally {
      setLoadingTaskId(null);
    }
  };

  const handleStartTask = async (task: WarrantyTicket) => {
    setLoadingTaskId(task.id);
    setActionError(null);
    try {
      const workOrderId = String((task as any).workOrderId || task.id);
      const lineId = String((task as any).lineId || (task as any).technicalLineId || '');
      if (!lineId) throw new Error('Không tìm thấy mã hạng mục kỹ thuật. Hãy đồng bộ lại bảng công việc.');
      await requestStartTaskLine(workOrderId, lineId);
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      console.error('[Start Task Error]:', err);
      setActionError(err?.message || 'Không thể bắt đầu công việc.');
    } finally {
      setLoadingTaskId(null);
    }
  };

  const submitQc = async () => {
    if (!qcTask) return;
    if (qcResult === 'PASS' && QC_STEPS.some(([key]) => !qcChecks[key])) {
      setActionError('KCS đạt yêu cầu phải xác nhận đủ 12 tiêu chí.');
      return;
    }
    if (qcResult === 'FAIL' && !qcReason.trim()) {
      setActionError('Vui lòng ghi rõ lý do KCS không đạt để trả lại KTV.');
      return;
    }
    if (qcFiles.length === 0) {
      setActionError('KCS bắt buộc có ít nhất một ảnh bằng chứng.');
      return;
    }
    setLoadingTaskId(qcTask.id);
    try {
      const workOrderId = String((qcTask as any).workOrderId);
      const photoEvidenceUrls = await uploadTechnicalEvidence(workOrderId, 'qc-inspection', qcFiles);
      await requestQCInspection(String((qcTask as any).workOrderId), {
        checklistVersion: 'QC_STANDARD_12_STEPS_V2', checklistResults: qcChecks,
        overallResult: qcResult, failedReason: qcReason.trim() || undefined, photoEvidenceUrls
      });
      setQcTask(null); setQcChecks({}); setQcReason(''); setQcResult('PASS'); setQcFiles([]); setActionError(null);
      if (onRefresh) await onRefresh();
    } catch (error: any) {
      setActionError(error?.message || 'Không thể hoàn tất KCS.');
    } finally {
      setLoadingTaskId(null);
    }
  };

  const getStatusAction = (columnId: string, task: WarrantyTicket) => {
    const isBusy = loadingTaskId === task.id;

    switch (columnId) {
      case 'TODO':
        if ((task as any).sourceKind === 'TECHNICAL_WORK_ORDER') {
          return (
            <button
              disabled={isBusy}
              onClick={(e) => { e.stopPropagation(); setScanModalTaskId(task.id); setScannedImei(''); setAcceptanceFiles([]); setActionError(null); }}
              className="w-full mt-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded hover:bg-emerald-700 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Quét IMEI · nhận máy
            </button>
          );
        }
        return <div className="mt-3 rounded bg-zinc-100 py-1.5 text-center text-xs font-semibold text-zinc-500">Phiếu cũ chỉ đọc · cần chuyển đổi dữ liệu</div>;
      case 'IN_PROGRESS':
        if ((task as any).sourceKind === 'TECHNICAL_WORK_ORDER' && ['ACCEPTED', 'REWORK_REQUIRED'].includes(String(task.status))) {
          return (
            <button disabled={isBusy} onClick={(e) => { e.stopPropagation(); void handleStartTask(task); }} className="w-full mt-3 py-1.5 bg-orange-600 text-white text-xs font-bold rounded hover:bg-orange-700 flex items-center justify-center disabled:opacity-50">
              <ArrowRight className="w-3.5 h-3.5 mr-1" />{isBusy ? 'Đang bắt đầu...' : 'Bắt đầu hạng mục'}
            </button>
          );
        }
        if ((task as any).sourceKind !== 'TECHNICAL_WORK_ORDER') return <div className="mt-3 rounded bg-zinc-100 py-1.5 text-center text-xs font-semibold text-zinc-500">Phiếu cũ chỉ đọc</div>;
        return (
          <div className="flex space-x-2 mt-3">
            <button 
              disabled={isBusy}
              onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
              className="flex-1 py-1.5 bg-zinc-100 text-zinc-700 text-xs font-semibold rounded hover:bg-zinc-200 flex items-center justify-center transition-colors"
            >
              <Package className="w-3.5 h-3.5 mr-1" />
              Linh Kiện
            </button>
            <button 
              disabled={isBusy}
              onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
              className="flex-1 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-semibold rounded hover:bg-emerald-100 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Hồ sơ & hoàn thành
            </button>
          </div>
        );
      case 'PENDING_PARTS':
        return (
          <button 
            disabled={isBusy}
            onClick={(e) => { e.stopPropagation(); if ((task as any).sourceKind === 'TECHNICAL_WORK_ORDER') void handleStartTask(task); else onTaskClick(task); }}
            className="w-full mt-3 py-1.5 bg-orange-50 text-orange-600 text-xs font-semibold rounded hover:bg-orange-100 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <ArrowRight className="w-3.5 h-3.5 mr-1" />
            {isBusy ? 'Đang xử lý...' : 'Tiếp Tục Làm'}
          </button>
        );
      case 'DONE':
        if ((task as any).sourceKind === 'TECHNICAL_WORK_ORDER' && String(task.status) === 'COMPLETED' && ['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(String(currentUserRole || '').toUpperCase())) {
          return <button disabled={isBusy} onClick={(e) => { e.stopPropagation(); setQcTask(task); setQcChecks({}); setQcResult('PASS'); setQcReason(''); setQcFiles([]); }} className="w-full mt-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded hover:bg-violet-700 disabled:opacity-50">KCS độc lập · Duyệt 12 bước</button>;
        }
        if ((task as any).sourceKind !== 'TECHNICAL_WORK_ORDER') return <div className="mt-3 rounded bg-zinc-100 py-1.5 text-center text-xs font-semibold text-zinc-500">Phiếu cũ chỉ đọc</div>;
        return (
          <div className="mt-3 text-center text-xs font-medium text-zinc-500 bg-zinc-50 py-1.5 rounded">
            {String(task.status) === 'delivered' || String(task.status) === 'DELIVERED_TO_CUSTOMER'
              ? '✅ Đã giao khách'
              : String((task as any).workOrderStatus) === 'QC_PASSED' || String(task.status) === 'VERIFIED'
                ? '✅ KCS đạt · Chờ nhập kho/giao khách'
                : '⏳ Chờ KCS độc lập'}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center text-xs text-red-700">
          <AlertCircle className="w-4 h-4 mr-2 text-red-500 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {canFilterTechnician && <div className="flex gap-2 overflow-x-auto pb-1"><button onClick={() => setTechnicianFilter('ALL')} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${technicianFilter === 'ALL' ? 'bg-zinc-900 text-white' : 'border bg-white text-zinc-600'}`}>Tất cả · {tasks.length}</button>{technicians.map(technician => <button key={technician} onClick={() => setTechnicianFilter(technician)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${technicianFilter === technician ? 'bg-orange-600 text-white' : 'border bg-white text-zinc-600'}`}>{technician} · {tasks.filter(task => String(task.technician || 'Chưa gán KTV') === technician).length}</button>)}</div>}

      {/* Modal Quét IMEI nhận máy vật lý */}
      {scanModalTaskId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-zinc-200">
            <h3 className="text-base font-bold text-zinc-900 mb-2 flex items-center">
              <QrCode className="w-5 h-5 text-orange-500 mr-2" />
              Xác Nhận Quét IMEI Nhận Bàn Giao Vật Lý
            </h3>
            <p className="text-xs text-zinc-500 mb-4">
              Theo quy trình bảo mật PhoneHouse, KTV bắt buộc phải quét hoặc nhập chính xác mã IMEI vật lý của máy trước khi chịu trách nhiệm xử lý.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Mã IMEI Quét Được:</label>
                <input
                  type="text"
                  value={scannedImei}
                  onChange={(e) => setScannedImei(e.target.value)}
                  placeholder="Nhập hoặc quét mã IMEI 15 số..."
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                  autoFocus
                />
              </div>

              {/* BƯỚC TEST MÁY ĐẦU VÀO (PRE-REPAIR INSPECTION) */}
              <div className="pt-3 mt-3 border-t border-zinc-100">
                <h4 className="text-xs font-bold text-zinc-800 mb-2">Checklist Tình Trạng Máy Nhận (Bắt Buộc):</h4>
                
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-600 font-medium w-24">Ngoại hình:</span>
                    <select
                      value={preRepairInspection.appearance}
                      onChange={(e) => setPreRepairInspection(prev => ({ ...prev, appearance: e.target.value as any }))}
                      className="flex-1 ml-2 p-1.5 border border-zinc-300 rounded text-xs outline-none focus:border-orange-500 bg-zinc-50"
                    >
                      <option value="GOOD">Tốt / Mới</option>
                      <option value="SCRATCHED">Xước dăm / Xước lông mèo</option>
                      <option value="DENTED">Cấn góc / Trầy nặng / Vỡ kính</option>
                    </select>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-600 font-medium w-24">Màn hình:</span>
                    <select
                      value={preRepairInspection.screen}
                      onChange={(e) => setPreRepairInspection(prev => ({ ...prev, screen: e.target.value as any }))}
                      className="flex-1 ml-2 p-1.5 border border-zinc-300 rounded text-xs outline-none focus:border-orange-500 bg-zinc-50"
                    >
                      <option value="OK">Bình thường</option>
                      <option value="DEFECTIVE">Lỗi hiển thị / Cảm ứng / Ám</option>
                      <option value="NOT_TESTABLE">Không thể test (Mất nguồn/Bể nát)</option>
                    </select>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-600 font-medium w-24">Nguồn/Pin:</span>
                    <select
                      value={preRepairInspection.power}
                      onChange={(e) => setPreRepairInspection(prev => ({ ...prev, power: e.target.value as any }))}
                      className="flex-1 ml-2 p-1.5 border border-zinc-300 rounded text-xs outline-none focus:border-orange-500 bg-zinc-50"
                    >
                      <option value="OK">Lên nguồn tốt</option>
                      <option value="NO_POWER">Sập nguồn / Chập chờn</option>
                    </select>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-600 font-medium w-24">Sinh trắc học:</span>
                    <select
                      value={preRepairInspection.biometrics}
                      onChange={(e) => setPreRepairInspection(prev => ({ ...prev, biometrics: e.target.value as any }))}
                      className="flex-1 ml-2 p-1.5 border border-zinc-300 rounded text-xs outline-none focus:border-orange-500 bg-zinc-50"
                    >
                      <option value="OK">Face ID / Vân tay OK</option>
                      <option value="DEFECTIVE">Mất Face ID / Vân tay</option>
                      <option value="NOT_TESTABLE">Không thể test</option>
                    </select>
                  </div>

                  <div>
                    <input
                      type="text"
                      placeholder="Ghi chú thêm (VD: Máy móp góc phải dưới...)"
                      value={preRepairInspection.technicianNotes}
                      onChange={(e) => setPreRepairInspection(prev => ({ ...prev, technicianNotes: e.target.value }))}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none bg-zinc-50"
                    />
                  </div>
                  <label className="block rounded-lg border border-dashed border-orange-300 bg-orange-50 p-3 text-xs">
                    <span className="font-bold text-orange-900">Ảnh tình trạng lúc nhận *</span>
                    <input type="file" accept="image/*" multiple onChange={event => setAcceptanceFiles(Array.from(event.target.files || []).slice(0, 6))} className="mt-2 block w-full" />
                    <span className="mt-1 block text-orange-700">Đã chọn {acceptanceFiles.length} ảnh · tối đa 6 ảnh.</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => { setScanModalTaskId(null); setActionError(null); }}
                  className="px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded-lg"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  disabled={loadingTaskId === scanModalTaskId}
                  onClick={() => {
                    const task = tasks.find(t => t.id === scanModalTaskId);
                    if (task) handleAcceptCustodySubmit(task);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm flex items-center disabled:opacity-50"
                >
                  <Wrench className="w-4 h-4 mr-1.5" />
                  {loadingTaskId === scanModalTaskId ? 'Đang Xác Nhận...' : 'Xác Nhận Nhận Máy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {qcTask && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm"><div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-zinc-950">KCS độc lập · 12 tiêu chí</h3><p className="text-xs text-zinc-500">{qcTask.ticketNumber} · IMEI {qcTask.imei}</p></div><button onClick={() => setQcTask(null)} className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-bold">Đóng</button></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{QC_STEPS.map(([key, label]) => <label key={key} className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${qcChecks[key] ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}><input type="checkbox" checked={Boolean(qcChecks[key])} onChange={e => setQcChecks(current => ({ ...current, [key]: e.target.checked }))} />{label}</label>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-bold"><span>Kết quả KCS</span><select value={qcResult} onChange={e => setQcResult(e.target.value as 'PASS' | 'FAIL')} className="h-10 w-full rounded-xl border px-3"><option value="PASS">Đạt · chuyển bước tiếp</option><option value="FAIL">Không đạt · trả KTV làm lại</option></select></label><label className="space-y-1 text-xs font-bold"><span>Lý do/Ghi chú</span><input value={qcReason} onChange={e => setQcReason(e.target.value)} className="h-10 w-full rounded-xl border px-3" placeholder={qcResult === 'FAIL' ? 'Bắt buộc khi không đạt' : 'Ghi chú KCS'} /></label></div><label className="mt-4 block rounded-xl border border-dashed p-3 text-xs font-bold"><span>Ảnh bằng chứng KCS (bắt buộc)</span><input type="file" accept="image/*" multiple onChange={event => setQcFiles(Array.from(event.target.files || []))} className="mt-2 block w-full text-xs"/><span className="mt-1 block font-normal text-zinc-500">Đã chọn {qcFiles.length} ảnh · tối đa 8 ảnh, 10MB/ảnh.</span></label><button disabled={loadingTaskId === qcTask.id} onClick={() => void submitQc()} className="mt-4 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-black text-white disabled:opacity-50">{loadingTaskId === qcTask.id ? 'Đang ghi nhận...' : 'Xác nhận kết quả KCS'}</button></div></div>}

      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4">
        {COLUMNS.map(col => {
          const colTasks = groupedTasks[col.id] || [];
          return (
            <section key={col.id} className="flex min-h-[500px] w-[86vw] max-w-sm shrink-0 snap-start flex-col rounded-2xl border border-zinc-200 bg-zinc-50 p-3 md:w-80">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 mb-3">
                <div className="flex items-center space-x-2">
                  <KanbanSquare className="w-4 h-4 text-zinc-400" />
                  <span className="font-bold text-xs uppercase tracking-wider text-zinc-700">{col.title}</span>
                </div>
                <span className="bg-zinc-200 text-zinc-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {colTasks.length}
                </span>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto">
                {colTasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => onTaskClick(task)}
                    className="bg-white border border-zinc-200 hover:border-orange-500 rounded-lg p-3 shadow-sm hover:shadow transition-all cursor-pointer group"
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="text-xs font-mono font-bold text-zinc-500 group-hover:text-orange-600">
                        {task.ticketCode || task.id}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        task.priority === 'URGENT' || task.priority === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-600'
                      }`}>
                        {task.priority || 'NORMAL'}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-zinc-900 leading-snug mb-1">
                      {task.deviceModel || 'iPhone'}
                    </h4>

                    {task.imei && (
                      <p className="text-[11px] font-mono text-zinc-500 mb-1.5">
                        IMEI: {task.imei}
                      </p>
                    )}

                    <p className="text-xs text-zinc-600 line-clamp-2 mb-2 bg-zinc-50 p-1.5 rounded border border-zinc-100">
                      {task.issueDescription || task.faultDescription || 'Chưa ghi nhận lỗi chi tiết'}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2 border-t border-zinc-100">
                      <span>{task.technician || 'Chưa gán KTV'}</span>
                      <span className="font-mono text-orange-600 font-bold">
                        {(task.estimatedLaborCost || task.estimatedCost || 0).toLocaleString('vi-VN')} đ
                      </span>
                    </div>

                    {getStatusAction(col.id, task)}
                  </div>
                ))}

                {colTasks.length === 0 && (
                  <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 rounded-lg text-zinc-400 text-xs">
                    Trống
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
