import React, { useMemo, useState } from 'react';
import { WarrantyTicket } from '../types';
import { KanbanSquare, Wrench, Package, ArrowRight, CheckCircle2, QrCode, AlertCircle } from 'lucide-react';
import {
  requestAcceptCustody,
  requestStartTaskLine,
  requestCompleteTaskLine
} from '../services/technicalApiClient';

interface TechKanbanBoardProps {
  tasks: WarrantyTicket[];
  onTaskClick: (task: WarrantyTicket) => void;
  onOpenAddTaskModal?: () => void;
  onRefresh?: () => void;
}

export const TechKanbanBoard: React.FC<TechKanbanBoardProps> = ({ tasks, onTaskClick, onOpenAddTaskModal, onRefresh }) => {
  const [scanModalTaskId, setScanModalTaskId] = useState<string | null>(null);
  const [scannedImei, setScannedImei] = useState('');
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    { id: 'IN_PROGRESS', title: 'Đang Xử Lý', statuses: ['inspecting', 'repairing', 'IN_PROGRESS', 'ACCEPTED'] },
    { id: 'PENDING_PARTS', title: 'Chờ Linh Kiện', statuses: ['waiting_parts', 'WAITING_PARTS'] },
    { id: 'DONE', title: 'Hoàn Thành (Chờ QC / Đã QC)', statuses: ['ready', 'delivered', 'TECH_COMPLETED', 'QC_PASSED', 'VERIFIED'] }
  ];

  const groupedTasks = useMemo(() => {
    const groups: Record<string, WarrantyTicket[]> = {
      'TODO': [],
      'IN_PROGRESS': [],
      'PENDING_PARTS': [],
      'DONE': []
    };

    tasks.forEach(task => {
      const status = task.status || 'received';
      if (COLUMNS[0].statuses.includes(status)) groups['TODO'].push(task);
      else if (COLUMNS[1].statuses.includes(status)) groups['IN_PROGRESS'].push(task);
      else if (COLUMNS[2].statuses.includes(status)) groups['PENDING_PARTS'].push(task);
      else if (COLUMNS[3].statuses.includes(status)) groups['DONE'].push(task);
      else groups['TODO'].push(task);
    });

    return groups;
  }, [tasks]);

  const handleAcceptCustodySubmit = async (task: WarrantyTicket) => {
    if (!scannedImei.trim()) {
      setActionError('Vui lòng quét hoặc nhập số IMEI thực tế của máy để nhận bàn giao.');
      return;
    }

    setLoadingTaskId(task.id);
    setActionError(null);
    try {
      await requestAcceptCustody(task.id, scannedImei.trim(), preRepairInspection);
      setScanModalTaskId(null);
      setScannedImei('');
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
      await requestStartTaskLine(task.id, `WOL_${task.id}_1`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('[Start Task Error]:', err);
      setActionError(err?.message || 'Không thể bắt đầu công việc.');
    } finally {
      setLoadingTaskId(null);
    }
  };

  const handleCompleteTask = async (task: WarrantyTicket) => {
    setLoadingTaskId(task.id);
    setActionError(null);
    try {
      await requestCompleteTaskLine(task.id, `WOL_${task.id}_1`, [], 'KTV báo hoàn thành xử lý.');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('[Complete Task Error]:', err);
      setActionError(err?.message || 'Không thể báo hoàn thành.');
    } finally {
      setLoadingTaskId(null);
    }
  };

  const getStatusAction = (columnId: string, task: WarrantyTicket) => {
    const isBusy = loadingTaskId === task.id;

    switch (columnId) {
      case 'TODO':
        return (
          <button 
            disabled={isBusy}
            onClick={(e) => {
              e.stopPropagation();
              setScanModalTaskId(task.id);
              setScannedImei(task.imei || '');
              setActionError(null);
            }}
            className="w-full mt-3 py-1.5 bg-orange-50 text-orange-600 text-xs font-semibold rounded hover:bg-orange-100 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <QrCode className="w-3.5 h-3.5 mr-1" />
            {isBusy ? 'Đang nhận...' : 'Quét IMEI Nhận Máy'}
          </button>
        );
      case 'IN_PROGRESS':
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
              onClick={(e) => { e.stopPropagation(); handleCompleteTask(task); }}
              className="flex-1 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-semibold rounded hover:bg-emerald-100 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              {isBusy ? 'Đang gửi...' : 'Xong (Gửi QC)'}
            </button>
          </div>
        );
      case 'PENDING_PARTS':
        return (
          <button 
            disabled={isBusy}
            onClick={(e) => { e.stopPropagation(); handleStartTask(task); }}
            className="w-full mt-3 py-1.5 bg-orange-50 text-orange-600 text-xs font-semibold rounded hover:bg-orange-100 flex items-center justify-center transition-colors disabled:opacity-50"
          >
            <ArrowRight className="w-3.5 h-3.5 mr-1" />
            {isBusy ? 'Đang xử lý...' : 'Tiếp Tục Làm'}
          </button>
        );
      case 'DONE':
        return (
          <div className="mt-3 text-center text-xs font-medium text-zinc-500 bg-zinc-50 py-1.5 rounded">
            {String(task.status) === 'delivered' || String(task.status) === 'DELIVERED_TO_CUSTOMER' ? '✅ Đã giao khách' : '⏳ Chờ KCS / Nhập Kho'}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map(col => {
          const colTasks = groupedTasks[col.id] || [];
          return (
            <div key={col.id} className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex flex-col h-full min-h-[500px]">
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
            </div>
          );
        })}
      </div>
    </div>
  );
};
