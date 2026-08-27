import React, { useMemo, useState } from 'react';
import { WarrantyTicket } from '../types';
import { KanbanSquare, Wrench, Package, ArrowRight, CheckCircle2, QrCode, AlertCircle } from 'lucide-react';
import {
  requestAcceptCustody,
  requestStartTaskLine,
  requestQCInspection
} from '../services/technicalApiClient';
import { uploadTechnicalEvidence } from '../services/technicalEvidenceService';
import { HelpHint } from './HelpHint';

interface TechKanbanBoardProps {
  tasks: WarrantyTicket[];
  onTaskClick: (task: WarrantyTicket) => void;
  onOpenAddTaskModal?: () => void;
  onRefresh?: () => Promise<void> | void;
  currentUserRole?: string;
  currentUserId?: string;
}

const QC_STEPS: Array<[string, string]> = [
  ['appearance', 'Ngoại hình, viền, lưng, kính'], ['screen_touch', 'Màn hình và cảm ứng'],
  ['battery_health', 'Pin và dung lượng'], ['face_touch_id', 'Face ID / Touch ID'],
  ['camera_front_back', 'Camera trước và sau'], ['audio_mic_speaker', 'Loa và microphone'],
  ['network_wifi_cellular', 'Sóng, Wi-Fi, Bluetooth'], ['charging_port', 'Cổng sạc'],
  ['true_tone', 'True Tone và cảm biến'], ['buttons_switches', 'Các phím vật lý'],
  ['water_seal_glue', 'Ron/keo chống nước'], ['internal_cleaning', 'Vệ sinh hoàn thiện']
];

export const TechKanbanBoard: React.FC<TechKanbanBoardProps> = ({ tasks, onTaskClick, onOpenAddTaskModal, onRefresh, currentUserRole, currentUserId }) => {
  const [scanModalTaskId, setScanModalTaskId] = useState<string | null>(null);
  const [scannedImei, setScannedImei] = useState('');
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [qcTask, setQcTask] = useState<WarrantyTicket | null>(null);
  const [qcChecks, setQcChecks] = useState<Record<string, boolean>>({});
  const [qcResult, setQcResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [qcReason, setQcReason] = useState('');
  const [qcFiles, setQcFiles] = useState<File[]>([]);
  const [qcFailedLineIds, setQcFailedLineIds] = useState<string[]>([]);
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
    { id: 'WAITING_ACCEPTANCE', title: 'Chờ nhận' },
    { id: 'IN_PROGRESS', title: 'Đang xử lý' },
    { id: 'WAITING_PARTS', title: 'Chờ linh kiện' },
    { id: 'WAITING_QC', title: 'Chờ KCS' },
    { id: 'WAITING_DELIVERY', title: 'Chờ trả máy' }
  ];

  const canFilterTechnician = ['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(String(currentUserRole || '').toUpperCase());
  const technicians = useMemo(() => {
    const grouped = new Map<string, string>();
    tasks.forEach(task => {
      const ids = Array.isArray((task as any).technicianIds) ? (task as any).technicianIds : [];
      const names = String(task.technician || 'Chưa gán KTV').split(' · ');
      ids.forEach((id: string, index: number) => grouped.set(String(id), names[index] || 'KTV'));
    });
    return [...grouped.entries()].map(([id, name]) => ({ id, name }));
  }, [tasks]);
  const visibleTasks = useMemo(() => technicianFilter === 'ALL' ? tasks : tasks.filter(task => Array.isArray((task as any).technicianIds) && (task as any).technicianIds.includes(technicianFilter)), [tasks, technicianFilter]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, WarrantyTicket[]> = Object.fromEntries(COLUMNS.map(column => [column.id, []]));

    visibleTasks.forEach(task => {
      const stage = String((task as any).boardStage || task.status || 'WAITING_ACCEPTANCE');
      (groups[stage] || groups.WAITING_ACCEPTANCE).push(task);
    });

    return groups;
  }, [visibleTasks]);

  const handleAcceptCustodySubmit = async (task: WarrantyTicket) => {
    if (!scannedImei.trim()) {
      setActionError('Vui lòng quét hoặc nhập số IMEI thực tế của máy để nhận bàn giao.');
      return;
    }
    setLoadingTaskId(task.id);
    setActionError(null);
    try {
      const workOrderId = String((task as any).workOrderId || task.id);
      const urls = acceptanceFiles.length
        ? await uploadTechnicalEvidence(workOrderId, `acceptance-${String((task as any).lineId || 'device')}`, acceptanceFiles)
        : [];
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
    if (qcResult === 'FAIL' && qcFailedLineIds.length === 0) {
      setActionError('Chọn ít nhất một hạng mục thực sự không đạt KCS.');
      return;
    }
    setLoadingTaskId(qcTask.id);
    try {
      const workOrderId = String((qcTask as any).workOrderId);
      const photoEvidenceUrls = qcFiles.length ? await uploadTechnicalEvidence(workOrderId, 'qc-inspection', qcFiles) : [];
      await requestQCInspection(String((qcTask as any).workOrderId), {
        checklistVersion: 'QC_STANDARD_12_STEPS_V2', checklistResults: qcChecks,
        overallResult: qcResult, failedReason: qcReason.trim() || undefined, photoEvidenceUrls,
        failures: qcResult === 'FAIL' ? [{
          checklistKey: QC_STEPS.find(([key]) => qcChecks[key] === false)?.[0] || 'overall',
          affectedLineIds: qcFailedLineIds,
          reason: qcReason.trim(),
          severity: 'MAJOR'
        }] : undefined
      });
      setQcTask(null); setQcChecks({}); setQcReason(''); setQcResult('PASS'); setQcFiles([]); setQcFailedLineIds([]); setActionError(null);
      if (onRefresh) await onRefresh();
    } catch (error: any) {
      setActionError(error?.message || 'Không thể hoàn tất KCS.');
    } finally {
      setLoadingTaskId(null);
    }
  };

  const getStatusAction = (columnId: string, task: WarrantyTicket) => {
    const isBusy = loadingTaskId === task.id;
    const assignedTechnicianIds = Array.isArray((task as any).technicianIds)
      ? (task as any).technicianIds.map((id: unknown) => String(id || '')).filter(Boolean)
      : ((task as any).taskLines || []).map((line: any) => String(line.assigneeUid || '')).filter(Boolean);
    const isAssignedToCurrentUser = !currentUserId || assignedTechnicianIds.includes(String(currentUserId));

    switch (columnId) {
      case 'WAITING_ACCEPTANCE':
        if ((task as any).sourceKind === 'TECHNICAL_WORK_ORDER') {
          if (!isAssignedToCurrentUser) {
            return <div className="mt-3 rounded bg-amber-50 py-1.5 px-2 text-center text-xs font-semibold text-amber-800">Chờ KTV được giao quét IMEI nhận máy</div>;
          }
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
        if ((task as any).sourceKind === 'TECHNICAL_WORK_ORDER' && ['ACCEPTED', 'REWORK_REQUIRED'].includes(String(((task as any).taskLines || []).find((line: any) => line.id === (task as any).lineId)?.status || ''))) {
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
      case 'WAITING_PARTS':
        return (
          <button 
            disabled={isBusy}
            onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
            className="w-full mt-3 py-1.5 bg-orange-50 text-orange-600 text-xs font-semibold rounded hover:bg-orange-100 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <Package className="w-3.5 h-3.5 mr-1" />
            Mở linh kiện & yêu cầu kho
          </button>
        );
      case 'WAITING_QC':
        if ((task as any).sourceKind === 'TECHNICAL_WORK_ORDER' && ['TECH_COMPLETED', 'QC_PENDING'].includes(String((task as any).workOrderStatus || '')) && ['ADMIN', 'MANAGER', 'TECH_LEAD'].includes(String(currentUserRole || '').toUpperCase())) {
          return <button disabled={isBusy} onClick={(e) => { e.stopPropagation(); setQcTask(task); setQcChecks({}); setQcResult('PASS'); setQcReason(''); setQcFiles([]); setQcFailedLineIds([]); }} className="w-full mt-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded hover:bg-violet-700 disabled:opacity-50">KCS độc lập · Duyệt 12 bước</button>;
        }
        return <div className="mt-3 rounded bg-violet-50 py-1.5 text-center text-xs font-semibold text-violet-700">⏳ Chờ KCS độc lập</div>;
      case 'WAITING_DELIVERY':
        return <div className="mt-3 rounded bg-emerald-50 py-1.5 text-center text-xs font-semibold text-emerald-700">✅ KCS đạt · Chờ NVBH trả máy hoặc kho nhận lại</div>;
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

      {canFilterTechnician && <div className="flex gap-2 overflow-x-auto pb-1"><button onClick={() => setTechnicianFilter('ALL')} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${technicianFilter === 'ALL' ? 'bg-zinc-900 text-white' : 'border bg-white text-zinc-600'}`}>Tất cả · {tasks.length}</button>{technicians.map(technician => <button key={technician.id} onClick={() => setTechnicianFilter(technician.id)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${technicianFilter === technician.id ? 'bg-orange-600 text-white' : 'border bg-white text-zinc-600'}`}>{technician.name} · {tasks.filter(task => Array.isArray((task as any).technicianIds) && (task as any).technicianIds.includes(technician.id)).length}</button>)}</div>}

      {/* Modal Quét IMEI nhận máy vật lý */}
      {scanModalTaskId && (
        <div data-ph-fullscreen-form className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-zinc-200">
            <h3 className="text-base font-bold text-zinc-900 mb-4 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-orange-500 mr-2" />
              Xác Nhận Quét IMEI Nhận Bàn Giao Vật Lý
              <HelpHint title="Xác nhận nhận máy">
                Quét hoặc nhập đúng IMEI của máy thực nhận, rồi chọn nhanh tình trạng đầu vào. Đây là mốc KTV bắt đầu chịu trách nhiệm xử lý máy. Ảnh chỉ dùng để đối chiếu thêm, không bắt buộc.
              </HelpHint>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">Mã IMEI Quét Được:</label>
                <input
                  type="text"
                  value={scannedImei}
                  inputMode="numeric"
                  onChange={(e) => setScannedImei(e.target.value.replace(/\D/g, '').slice(0, 15))}
                  placeholder="Nhập hoặc quét IMEI 5–15 số..."
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
                    <span className="font-bold text-orange-900">Ảnh tình trạng lúc nhận (không bắt buộc)</span>
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

      {qcTask && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
        <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-2"><h3 className="font-black text-zinc-950">KCS độc lập · 12 tiêu chí</h3><HelpHint title="KCS độc lập">Người KCS đối chiếu đủ 12 tiêu chí trước khi cho máy chuyển sang bước trả khách hoặc nhập lại kho. Ảnh là tùy chọn.</HelpHint></div><p className="text-xs text-zinc-500">{qcTask.ticketNumber} · IMEI {qcTask.imei}</p></div>
            <button onClick={() => setQcTask(null)} className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-bold">Đóng</button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{QC_STEPS.map(([key, label]) => <label key={key} className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${qcChecks[key] ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}><input type="checkbox" checked={Boolean(qcChecks[key])} onChange={e => setQcChecks(current => ({ ...current, [key]: e.target.checked }))} />{label}</label>)}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-bold"><span>Kết quả KCS</span><select value={qcResult} onChange={e => setQcResult(e.target.value as 'PASS' | 'FAIL')} className="h-10 w-full rounded-xl border px-3"><option value="PASS">Đạt · chuyển bước tiếp</option><option value="FAIL">Không đạt · trả đúng task lỗi</option></select></label><label className="space-y-1 text-xs font-bold"><span>Lý do/Ghi chú</span><input value={qcReason} onChange={e => setQcReason(e.target.value)} className="h-10 w-full rounded-xl border px-3" placeholder={qcResult === 'FAIL' ? 'Bắt buộc khi không đạt' : 'Ghi chú KCS'} /></label></div>
          {qcResult === 'FAIL' && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3"><p className="text-xs font-black text-red-800">Hạng mục cần làm lại</p><p className="mt-1 text-[11px] text-red-700">Chỉ hạng mục được chọn mới bị trả về KTV.</p><div className="mt-2 space-y-2">{((qcTask as any).taskLines || []).filter((line: any) => ['COMPLETED', 'VERIFIED'].includes(String(line.status))).map((line: any) => <label key={line.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold"><input type="checkbox" checked={qcFailedLineIds.includes(String(line.id))} onChange={event => setQcFailedLineIds(current => event.target.checked ? [...new Set([...current, String(line.id)])] : current.filter(id => id !== String(line.id)))} />{line.taskName || line.taskType || line.id}</label>)}</div></div>}
          <label className="mt-4 block rounded-xl border border-dashed p-3 text-xs font-bold"><span>Ảnh bằng chứng KCS (không bắt buộc)</span><input type="file" accept="image/*" multiple onChange={event => setQcFiles(Array.from(event.target.files || []))} className="mt-2 block w-full text-xs"/><span className="mt-1 block font-normal text-zinc-500">Đã chọn {qcFiles.length} ảnh · tối đa 8 ảnh, 20MB/ảnh.</span></label>
          <button disabled={loadingTaskId === qcTask.id} onClick={() => void submitQc()} className="mt-4 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-black text-white disabled:opacity-50">{loadingTaskId === qcTask.id ? 'Đang ghi nhận...' : 'Xác nhận kết quả KCS'}</button>
        </div>
      </div>}

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

                    {Array.isArray((task as any).taskLines) && <div className="mb-2 space-y-1">{(task as any).taskLines.map((line: any) => <div key={line.id} className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1 text-[10px]"><span className="truncate font-semibold text-zinc-700">{line.taskName}</span><span className={['COMPLETED', 'VERIFIED'].includes(String(line.status)) ? 'font-black text-emerald-700' : String(line.status) === 'WAITING_PARTS' ? 'font-black text-orange-700' : 'font-bold text-zinc-500'}>{String(line.status).replaceAll('_', ' ')}</span></div>)}</div>}

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
