import React, { useState, useEffect } from 'react';
import { 
  Wrench, 
  Edit3, 
  Save, 
  RotateCcw, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  ShieldAlert, 
  Sliders, 
  Calculator,
  Smartphone,
  Info,
  Layers,
  Percent
} from 'lucide-react';
import { 
  TechCommissionMatrixConfig, 
  DEFAULT_TECH_COMMISSION_MATRIX, 
  getLiveTechCommissionMatrix, 
  saveLiveTechCommissionMatrix, 
  resetTechCommissionMatrix 
} from '../data/techCommissionMatrix';

interface TechCommissionMatrixEditorProps {
  onMatrixUpdated?: (matrix: TechCommissionMatrixConfig) => void;
}

export const TechCommissionMatrixEditor: React.FC<TechCommissionMatrixEditorProps> = ({ onMatrixUpdated }) => {
  const [matrix, setMatrix] = useState<TechCommissionMatrixConfig>(getLiveTechCommissionMatrix);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'MATRIX' | 'COMPENSATION' | 'SIMULATOR'>('MATRIX');

  // New task modal
  const [showAddTaskModal, setShowAddTaskModal] = useState<boolean>(false);
  const [newTaskName, setNewTaskName] = useState<string>('');
  const [defaultRateK, setDefaultRateK] = useState<number>(50);

  // New model group modal
  const [showAddModelModal, setShowAddModelModal] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupKeywords, setNewGroupKeywords] = useState<string>('');

  // Live Simulator state
  const [simModel, setSimModel] = useState<string>('g8');
  const [simTasks, setSimTasks] = useState<string[]>(['t1', 't6']);
  const [simErrorType, setSimErrorType] = useState<'NONE' | 'GENERAL' | 'SCREEN_GLASS'>('NONE');
  const [simErrorGlassRate, setSimErrorGlassRate] = useState<number>(0.8);
  const [simDamageCost, setSimDamageCost] = useState<number>(2000000);

  // Mobile state
  const [mobileSelectedModel, setMobileSelectedModel] = useState<string>('g8');
  const [searchTaskTerm, setSearchTaskTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'AUTO' | 'CARD' | 'TABLE'>('AUTO');

  useEffect(() => {
    const handleUpdate = () => {
      setMatrix(getLiveTechCommissionMatrix());
    };
    window.addEventListener('tech-matrix-updated', handleUpdate);
    return () => window.removeEventListener('tech-matrix-updated', handleUpdate);
  }, []);

  const handleRateChange = (taskId: string, modelId: string, valueK: number) => {
    const valVnd = (valueK || 0) * 1000;
    setMatrix(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => {
        if (t.id === taskId) {
          return {
            ...t,
            rates: {
              ...t.rates,
              [modelId]: valVnd
            }
          };
        }
        return t;
      })
    }));
  };

  const handleSave = () => {
    saveLiveTechCommissionMatrix(matrix);
    if (onMatrixUpdated) {
      onMatrixUpdated(matrix);
    }
    setSaveSuccess(true);
    setIsEditing(false);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleReset = () => {
    if (window.confirm('Bạn có chắc chắn muốn khôi phục ma trận hoa hồng về bảng giá gốc mẫu không?')) {
      const def = resetTechCommissionMatrix();
      setMatrix(def);
      if (onMatrixUpdated) onMatrixUpdated(def);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const handleAddTask = () => {
    if (!newTaskName.trim()) return;
    const newId = `t_${Date.now()}`;
    const rates: Record<string, number> = {};
    matrix.models.forEach(m => {
      rates[m.id] = defaultRateK * 1000;
    });

    const updated: TechCommissionMatrixConfig = {
      ...matrix,
      tasks: [...matrix.tasks, { id: newId, name: newTaskName.trim(), rates }]
    };
    setMatrix(updated);
    saveLiveTechCommissionMatrix(updated);
    if (onMatrixUpdated) onMatrixUpdated(updated);
    setNewTaskName('');
    setShowAddTaskModal(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleDeleteTask = (taskId: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa hạng mục sửa chữa này?')) {
      const updated: TechCommissionMatrixConfig = {
        ...matrix,
        tasks: matrix.tasks.filter(t => t.id !== taskId)
      };
      setMatrix(updated);
      saveLiveTechCommissionMatrix(updated);
      if (onMatrixUpdated) onMatrixUpdated(updated);
    }
  };

  const handleAddModelGroup = () => {
    if (!newGroupName.trim()) return;
    const newId = `g_${Date.now()}`;
    const kws = newGroupKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

    const updated: TechCommissionMatrixConfig = {
      ...matrix,
      models: [...matrix.models, { id: newId, name: newGroupName.trim(), keywords: kws.length > 0 ? kws : [newGroupName.trim().toLowerCase()] }],
      tasks: matrix.tasks.map(t => ({
        ...t,
        rates: {
          ...t.rates,
          [newId]: defaultRateK * 1000
        }
      }))
    };
    setMatrix(updated);
    saveLiveTechCommissionMatrix(updated);
    if (onMatrixUpdated) onMatrixUpdated(updated);
    setNewGroupName('');
    setNewGroupKeywords('');
    setShowAddModelModal(false);
  };

  // Simulator calculations
  const simTotalGross = simTasks.reduce((sum, taskId) => {
    const task = matrix.tasks.find(t => t.id === taskId);
    if (!task) return sum;
    return sum + (task.rates[simModel] || 0);
  }, 0);

  let simShopSupportAmount = 0;
  let simTechPenaltyAmount = 0;

  if (simErrorType === 'GENERAL') {
    const shopPercent = matrix.compensationPolicy.generalShopSupportPercent || 30;
    simShopSupportAmount = Math.round(simDamageCost * (shopPercent / 100));
    simTechPenaltyAmount = simDamageCost - simShopSupportAmount;
  } else if (simErrorType === 'SCREEN_GLASS') {
    let shopPercent = 50;
    if (simErrorGlassRate < 1) {
      shopPercent = matrix.compensationPolicy.screenGlassTiers[0]?.shopSupportPercent || 80;
    } else if (simErrorGlassRate < 5) {
      shopPercent = matrix.compensationPolicy.screenGlassTiers[1]?.shopSupportPercent || 70;
    } else {
      shopPercent = matrix.compensationPolicy.screenGlassTiers[2]?.shopSupportPercent || 50;
    }
    simShopSupportAmount = Math.round(simDamageCost * (shopPercent / 100));
    simTechPenaltyAmount = simDamageCost - simShopSupportAmount;
  }

  const simNetIncome = simTotalGross - simTechPenaltyAmount;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 1. TOP HEADER & CONTROLS */}
      <div className="bg-white p-5 rounded-3xl border border-zinc-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 font-black">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg sm:text-xl font-black text-zinc-900 tracking-tight">
                Bảng Hoa Hồng Kỹ Thuật & Cơ Chế Đền Bù
              </h2>
              <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-amber-200">
                {matrix.tasks.length} Hạng Mục • {matrix.models.length} Phân Nhóm Máy
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Áp dụng tính hoa hồng sửa chữa KTV tự động từ Phiếu Bảo Hành & Đồng bộ vào Bảng Lương tháng
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {saveSuccess && (
            <div className="flex items-center space-x-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 animate-pulse">
              <CheckCircle2 className="w-4 h-4" />
              <span>Đã lưu & áp dụng ngay!</span>
            </div>
          )}

          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              isEditing 
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20' 
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditing ? 'Đang Chỉnh Sửa' : 'Chỉnh Sửa Đơn Giá'}</span>
          </button>

          {isEditing && (
            <button
              onClick={handleSave}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-4 py-2 rounded-xl flex items-center space-x-1.5 shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu Ma Trận</span>
            </button>
          )}

          <button
            onClick={() => setShowAddTaskModal(true)}
            className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Hạng Mục</span>
          </button>

          <button
            onClick={() => setShowAddModelModal(true)}
            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold px-3 py-2 rounded-xl flex items-center space-x-1 cursor-pointer"
            title="Thêm phân nhóm máy (VD: iPhone 16)"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>+ Nhóm Máy</span>
          </button>

          <button
            onClick={handleReset}
            className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
            title="Khôi phục về bảng chuẩn mẫu ban đầu"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. SUB NAVIGATION TABS */}
      <div className="flex items-center space-x-2 border-b border-zinc-200 pb-2">
        <button
          onClick={() => setActiveSubTab('MATRIX')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
            activeSubTab === 'MATRIX'
              ? 'bg-amber-500 text-white shadow-xs font-black'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Ma Trận Hoa Hồng KTV (Matrix Grid)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('COMPENSATION')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
            activeSubTab === 'COMPENSATION'
              ? 'bg-red-600 text-white shadow-xs font-black'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Quy Định Đền Bù & Hỗ Trợ Lỗi</span>
        </button>

        <button
          onClick={() => setActiveSubTab('SIMULATOR')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
            activeSubTab === 'SIMULATOR'
              ? 'bg-indigo-600 text-white shadow-xs font-black'
              : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
          }`}
        >
          <Calculator className="w-3.5 h-3.5" />
          <span>Mô Phỏng & Test Tính Lương KTV</span>
        </button>
      </div>

      {/* 3. TAB CONTENT: MATRIX GRID */}
      {activeSubTab === 'MATRIX' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-zinc-200 shadow-xs space-y-4">
            
            {/* Banner Guide */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs text-amber-950">
              <div className="flex items-center space-x-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Đơn vị hiển thị:</strong> Nghìn đồng (k). Số <strong>20</strong> = 20.000 đ, <strong>100</strong> = 100.000 đ, dấu <strong>-</strong> = Không áp dụng (0 đ).
                </span>
              </div>
              {isEditing ? (
                <span className="font-bold text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded-md text-[11px]">
                  ✍️ Đang mở ô nhập liệu - Sửa xong bấm "Lưu Ma Trận"
                </span>
              ) : (
                <span className="text-zinc-500 text-[11px]">
                  Bấm <strong>"Chỉnh Sửa Đơn Giá"</strong> để thay đổi bất kỳ ô nào
                </span>
              )}
            </div>

            {/* Mobile / View controls */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
              <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-2xl self-start">
                <button
                  type="button"
                  onClick={() => setViewMode('AUTO')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    viewMode === 'AUTO' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  📱 Tự Động
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('CARD')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    viewMode === 'CARD' ? 'bg-amber-500 text-white shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  📲 Dạng Thẻ (iPhone Mobile)
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('TABLE')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    viewMode === 'TABLE' ? 'bg-amber-500 text-white shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  📊 Dạng Bảng Rộng
                </button>
              </div>

              {/* Search tasks for mobile & desktop */}
              <div className="relative flex-1 sm:max-w-xs">
                <input
                  type="text"
                  placeholder="Tìm tác vụ (ép kính, pin, nguồn...)"
                  value={searchTaskTerm}
                  onChange={(e) => setSearchTaskTerm(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-1.5 text-xs text-zinc-900 focus:bg-white focus:border-amber-500"
                />
              </div>
            </div>

            {/* MOBILE IPHONE CARD VIEW */}
            {(viewMode === 'CARD' || (viewMode === 'AUTO' && typeof window !== 'undefined' && window.innerWidth < 640)) && (
              <div className="space-y-3 block sm:hidden">
                {/* Horizontal Model Selector Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
                  {matrix.models.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMobileSelectedModel(m.id)}
                      className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                        mobileSelectedModel === m.id
                          ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20 font-black scale-105'
                          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      📱 {m.name}
                    </button>
                  ))}
                </div>

                {/* Mobile Tasks List */}
                <div className="grid grid-cols-1 gap-2.5">
                  {matrix.tasks
                    .filter(t => !searchTaskTerm || t.name.toLowerCase().includes(searchTaskTerm.toLowerCase()))
                    .map((task, idx) => {
                      const valVnd = task.rates[mobileSelectedModel] || 0;
                      const valK = valVnd / 1000;
                      const selectedGroup = matrix.models.find(m => m.id === mobileSelectedModel);

                      return (
                        <div 
                          key={task.id}
                          className="bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-2xs space-y-2 flex flex-col justify-between"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-center space-x-2">
                              <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <div>
                                <h4 className="font-bold text-zinc-900 text-xs">{task.name}</h4>
                                <span className="text-[10px] text-zinc-500">
                                  Dòng: <strong className="text-amber-800">{selectedGroup?.name}</strong>
                                </span>
                              </div>
                            </div>

                            {isEditing && (
                              <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="p-1 text-zinc-300 hover:text-red-600 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                            <span className="text-xs text-zinc-500 font-bold">Mức hoa hồng:</span>
                            {isEditing ? (
                              <div className="flex items-center space-x-1">
                                <button
                                  type="button"
                                  onClick={() => handleRateChange(task.id, mobileSelectedModel, Math.max(0, valK - 10))}
                                  className="w-7 h-7 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-xs font-bold text-zinc-700 flex items-center justify-center cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  step="5"
                                  value={valK === 0 ? '' : valK}
                                  placeholder="0"
                                  onChange={(e) => handleRateChange(task.id, mobileSelectedModel, Number(e.target.value) || 0)}
                                  className="w-16 text-center py-1 bg-amber-50 border border-amber-300 rounded-lg text-xs font-bold font-mono text-zinc-900"
                                />
                                <span className="text-xs font-bold text-zinc-600">k</span>
                                <button
                                  type="button"
                                  onClick={() => handleRateChange(task.id, mobileSelectedModel, valK + 10)}
                                  className="w-7 h-7 bg-amber-100 hover:bg-amber-200 rounded-lg text-xs font-bold text-amber-800 flex items-center justify-center cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <span className="font-mono font-black text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl">
                                {valVnd > 0 ? `${valVnd.toLocaleString('vi-VN')} đ` : 'Không áp dụng'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* THE MASTER TABLE (Desktop / Responsive Table View) */}
            {(viewMode === 'TABLE' || viewMode === 'AUTO' || (typeof window !== 'undefined' && window.innerWidth >= 640)) && (
              <div className="overflow-x-auto rounded-2xl border border-zinc-200">
                <table className="w-full text-center text-xs border-collapse min-w-[850px]">
                  <thead>
                    {/* Table Header: Golden Yellow Theme like the user's Excel */}
                    <tr className="bg-[#FFF2B2] text-zinc-900 border-b border-amber-300 font-black text-[11px]">
                      <th className="py-3 px-4 text-left border-r border-amber-200 w-48 sticky left-0 bg-[#FFF2B2] z-10">
                        Hạng Mục Kỹ Thuật
                      </th>
                      {matrix.models.map(m => (
                        <th key={m.id} className="py-3 px-2 border-r border-amber-200 last:border-r-0">
                          <div className="font-black">{m.name}</div>
                          <div className="text-[9px] text-zinc-500 font-normal mt-0.5 font-mono">
                            {m.keywords.slice(0, 3).join(', ')}
                          </div>
                        </th>
                      ))}
                      {isEditing && (
                        <th className="py-3 px-2 text-center text-red-600 w-16">
                          Xóa
                        </th>
                      )}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-200 bg-white">
                    {matrix.tasks
                      .filter(t => !searchTaskTerm || t.name.toLowerCase().includes(searchTaskTerm.toLowerCase()))
                      .map((task, idx) => (
                        <tr 
                          key={task.id} 
                          className={`hover:bg-amber-50/40 transition-colors ${idx % 2 === 1 ? 'bg-zinc-50/50' : 'bg-white'}`}
                        >
                          {/* Task Name */}
                          <td className="py-2.5 px-4 text-left font-bold text-zinc-900 border-r border-zinc-200 sticky left-0 bg-inherit z-10">
                            <div className="flex items-center space-x-2">
                              <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[10px] flex items-center justify-center font-mono font-bold shrink-0">
                                {idx + 1}
                              </span>
                              <span>{task.name}</span>
                            </div>
                          </td>

                          {/* Rates per Model Group */}
                          {matrix.models.map(model => {
                            const valVnd = task.rates[model.id] || 0;
                            const valK = valVnd > 0 ? valVnd / 1000 : 0;

                            return (
                              <td key={model.id} className="py-2 px-2 border-r border-zinc-200 last:border-r-0">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="0"
                                    step="5"
                                    value={valK === 0 ? '' : valK}
                                    placeholder="-"
                                    onChange={(e) => handleRateChange(task.id, model.id, Number(e.target.value) || 0)}
                                    className="w-16 text-center py-1 bg-amber-50/60 border border-amber-300 rounded-lg text-xs font-bold font-mono text-zinc-900 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-amber-500"
                                  />
                                ) : (
                                  <span className={`font-mono font-bold ${valK > 0 ? 'text-zinc-900' : 'text-zinc-300'}`}>
                                    {valK > 0 ? `${valK}` : '-'}
                                  </span>
                                )}
                              </td>
                            );
                          })}

                          {isEditing && (
                            <td className="py-2 px-2 text-center">
                              <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="p-1 text-zinc-300 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                                title="Xóa hạng mục"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Quick Summary Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs text-zinc-500 border-t border-zinc-100">
              <div>
                Đang áp dụng: <strong>{matrix.tasks.length} tác vụ</strong> cho tất cả dòng iPhone từ đời 8 Plus đến 15 Pro Max.
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="font-bold text-amber-600 hover:underline cursor-pointer"
                >
                  {isEditing ? 'Đóng chế độ sửa' : 'Chỉnh sửa ma trận này'}
                </button>
                <span>•</span>
                <button
                  onClick={() => setActiveSubTab('COMPENSATION')}
                  className="font-bold text-red-600 hover:underline cursor-pointer"
                >
                  Xem quy chế đền bù lỗi &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB CONTENT: COMPENSATION POLICY */}
      {activeSubTab === 'COMPENSATION' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-xs space-y-6">
            <div>
              <div className="flex items-center space-x-2 text-xs font-bold text-red-600 uppercase">
                <ShieldAlert className="w-4 h-4" />
                <span>Chính Sách Hỗ Trợ Đền Bù Rủi Ro Kỹ Thuật</span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-zinc-900 mt-1">
                Quy Định Phân Chia Chi Phí Đền Bù Giữa Cửa Hàng & Kỹ Thuật Viên
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Quy tắc chia sẻ rủi ro khi xảy ra sự cố hỏng màn hình, chết main hoặc phát sinh chi phí linh kiện trong quá trình sửa chữa
              </p>
            </div>

            {/* 2 MAIN COMPENSATION RULES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* RULE 1: GENERAL DAMAGE */}
              <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50/50 border border-amber-200 rounded-3xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="bg-amber-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                    Quy định 1
                  </span>
                  <Percent className="w-4 h-4 text-amber-600" />
                </div>

                <div>
                  <h4 className="font-black text-sm text-zinc-900">
                    Các Lỗi Phát Sinh Trong Quá Trình Xử Lý Máy
                  </h4>
                  <p className="text-xs text-zinc-600 mt-1">
                    (Lỗi sửa nguồn, gãy socket, chết camera, đứt cáp vân tay/Face ID...)
                  </p>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-amber-200/80 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-700">Tỷ lệ Cửa Hàng hỗ trợ:</span>
                    <div className="flex items-center space-x-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={matrix.compensationPolicy.generalShopSupportPercent}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          const updated = {
                            ...matrix,
                            compensationPolicy: {
                              ...matrix.compensationPolicy,
                              generalShopSupportPercent: val
                            }
                          };
                          setMatrix(updated);
                          saveLiveTechCommissionMatrix(updated);
                        }}
                        className="w-16 text-center py-1 bg-amber-50 border border-amber-300 rounded-lg font-mono font-black text-amber-700 text-xs focus:outline-hidden"
                      />
                      <span className="font-bold text-amber-700">%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-100">
                    <span className="font-bold text-zinc-700">Tỷ lệ KTV chịu chi phí:</span>
                    <span className="font-mono font-black text-red-600 text-sm">
                      {100 - matrix.compensationPolicy.generalShopSupportPercent}%
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-amber-900 bg-amber-100/60 p-3 rounded-xl">
                  💡 <em>Ví dụ:</em> Đền cụm Face ID 1.000.000 đ &rarr; Cửa hàng chi: <strong>{((1000000 * matrix.compensationPolicy.generalShopSupportPercent) / 100).toLocaleString()} đ</strong>, KTV trừ lương: <strong>{((1000000 * (100 - matrix.compensationPolicy.generalShopSupportPercent)) / 100).toLocaleString()} đ</strong>.
                </div>
              </div>

              {/* RULE 2: SCREEN GLASS TIERED SUPPORT */}
              <div className="p-5 bg-gradient-to-br from-red-50 to-rose-50/50 border border-red-200 rounded-3xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="bg-red-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                    Quy định 2 (Đặc thù ép kính)
                  </span>
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                </div>

                <div>
                  <h4 className="font-black text-sm text-zinc-900">
                    Riêng Lỗi Ép Kính Dẫn Tới Hư Màn Hình
                  </h4>
                  <p className="text-xs text-zinc-600 mt-1">
                    Tỷ lệ hỗ trợ phụ thuộc trực tiếp vào % tỷ lệ lỗi ép kính của KTV trong tháng:
                  </p>
                </div>

                <div className="space-y-2 text-xs">
                  {matrix.compensationPolicy.screenGlassTiers.map((tier, idx) => (
                    <div key={tier.id} className="p-3 bg-white rounded-2xl border border-red-200/80 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-zinc-900">{tier.label}</div>
                        <div className="text-[10px] text-zinc-500">
                          {idx === 0 ? 'KTV tay nghề xuất sắc' : idx === 1 ? 'Mức chuẩn cho phép' : 'Vượt ngưỡng an toàn'}
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          <span className="text-[10px] text-zinc-400 block">Cửa hàng hỗ trợ</span>
                          <div className="flex items-center space-x-0.5 justify-end">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={tier.shopSupportPercent}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                const newTiers = [...matrix.compensationPolicy.screenGlassTiers];
                                newTiers[idx] = {
                                  ...newTiers[idx],
                                  shopSupportPercent: val,
                                  techPenaltyPercent: 100 - val
                                };
                                const updated = {
                                  ...matrix,
                                  compensationPolicy: {
                                    ...matrix.compensationPolicy,
                                    screenGlassTiers: newTiers
                                  }
                                };
                                setMatrix(updated);
                                saveLiveTechCommissionMatrix(updated);
                              }}
                              className="w-12 text-center py-0.5 bg-red-50 border border-red-200 rounded font-mono font-bold text-emerald-700 text-xs"
                            />
                            <span className="font-bold text-emerald-700">%</span>
                          </div>
                        </div>

                        <div className="text-right pl-2 border-l border-zinc-100">
                          <span className="text-[10px] text-zinc-400 block">KTV đền</span>
                          <span className="font-mono font-black text-red-600">
                            {100 - tier.shopSupportPercent}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-[11px] text-red-900 bg-red-100/60 p-3 rounded-xl">
                  ✨ <em>Khuyến khích tay nghề:</em> Ép kính chuẩn dưới 1% lỗi, KTV chỉ phải đền <strong>20%</strong> khi sự cố xảy ra!
                </div>
              </div>

            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleSave}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs cursor-pointer flex items-center space-x-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Lưu & Cập Nhật Quy Chế Đền Bù</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT: LIVE SIMULATOR */}
      {activeSubTab === 'SIMULATOR' && (
        <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-xs space-y-6">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold text-indigo-600 uppercase">
              <Calculator className="w-4 h-4" />
              <span>Công Cụ Thử Nghiệm Tính Lương KTV</span>
            </div>
            <h3 className="text-base sm:text-lg font-black text-zinc-900 mt-1">
              Mô Phỏng Trực Tiếp Thu Nhập Ca Sửa Chữa & Khấu Trừ Rủi Ro
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Controls (7 cols) */}
            <div className="lg:col-span-7 space-y-4 text-xs">
              
              {/* Select Model Group */}
              <div>
                <label className="block font-bold text-zinc-700 mb-1.5">
                  1. Chọn dòng máy tiếp nhận:
                </label>
                <select
                  value={simModel}
                  onChange={(e) => setSimModel(e.target.value)}
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-zinc-900 focus:outline-hidden focus:border-indigo-500"
                >
                  {matrix.models.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Select Tasks */}
              <div>
                <label className="block font-bold text-zinc-700 mb-1.5">
                  2. Chọn các tác vụ KTV thực hiện trên máy này:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-zinc-50 rounded-2xl border border-zinc-200">
                  {matrix.tasks.map(t => {
                    const isChecked = simTasks.includes(t.id);
                    const rate = t.rates[simModel] || 0;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          if (isChecked) {
                            setSimTasks(simTasks.filter(id => id !== t.id));
                          } else {
                            setSimTasks([...simTasks, t.id]);
                          }
                        }}
                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                          isChecked 
                            ? 'bg-amber-100/80 border-amber-300 text-amber-950 font-bold' 
                            : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                        }`}
                      >
                        <div className="truncate text-xs">{t.name}</div>
                        <div className="text-[10px] font-mono text-amber-700 mt-0.5">
                          +{rate.toLocaleString()} đ
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Select Error/Damage Scenario */}
              <div>
                <label className="block font-bold text-zinc-700 mb-1.5">
                  3. Tình huống sự cố / đền bù (nếu có):
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setSimErrorType('NONE')}
                    className={`p-2.5 rounded-xl border text-center font-bold cursor-pointer ${
                      simErrorType === 'NONE' 
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 ring-2 ring-emerald-500/20' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                    }`}
                  >
                    ✓ Hoàn hảo (Không lỗi)
                  </button>

                  <button
                    onClick={() => setSimErrorType('GENERAL')}
                    className={`p-2.5 rounded-xl border text-center font-bold cursor-pointer ${
                      simErrorType === 'GENERAL' 
                        ? 'bg-amber-50 border-amber-300 text-amber-800 ring-2 ring-amber-500/20' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                    }`}
                  >
                    ⚠️ Lỗi linh kiện chung
                  </button>

                  <button
                    onClick={() => setSimErrorType('SCREEN_GLASS')}
                    className={`p-2.5 rounded-xl border text-center font-bold cursor-pointer ${
                      simErrorType === 'SCREEN_GLASS' 
                        ? 'bg-red-50 border-red-300 text-red-800 ring-2 ring-red-500/20' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                    }`}
                  >
                    💥 Hư màn do ép kính
                  </button>
                </div>
              </div>

              {simErrorType !== 'NONE' && (
                <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-600 mb-1">
                        Chi phí thiệt hại / Giá màn thay mới:
                      </label>
                      <input
                        type="number"
                        step="100000"
                        value={simDamageCost}
                        onChange={(e) => setSimDamageCost(Number(e.target.value) || 0)}
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-bold font-mono text-zinc-900"
                      />
                    </div>

                    {simErrorType === 'SCREEN_GLASS' && (
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-600 mb-1">
                          Tỷ lệ lỗi ép kính của KTV (%):
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={simErrorGlassRate}
                          onChange={(e) => setSimErrorGlassRate(Number(e.target.value) || 0)}
                          className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-bold font-mono text-zinc-900"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right Simulator Result Card (5 cols) */}
            <div className="lg:col-span-5 bg-gradient-to-b from-zinc-900 to-zinc-950 rounded-3xl p-5 text-white flex flex-col justify-between border border-zinc-800">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-xs font-black text-amber-400 uppercase tracking-wider pb-3 border-b border-zinc-800">
                  <Calculator className="w-4 h-4" />
                  <span>Kết Quả Thu Nhập Phiếu Này</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between text-zinc-300">
                    <span>Tổng hoa hồng các tác vụ:</span>
                    <span className="font-bold text-emerald-400 font-mono text-sm">
                      +{simTotalGross.toLocaleString()} đ
                    </span>
                  </div>

                  {simErrorType !== 'NONE' && (
                    <>
                      <div className="flex justify-between text-zinc-400 pt-2 border-t border-zinc-800">
                        <span>Giá trị đền bù:</span>
                        <span className="font-mono text-zinc-300">{simDamageCost.toLocaleString()} đ</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Cửa hàng hỗ trợ:</span>
                        <span className="font-bold text-blue-400 font-mono">
                          +{simShopSupportAmount.toLocaleString()} đ
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>KTV bị khấu trừ:</span>
                        <span className="font-bold text-red-400 font-mono">
                          -{simTechPenaltyAmount.toLocaleString()} đ
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Total Card */}
              <div className="mt-6 p-4 rounded-2xl bg-zinc-800/80 border border-zinc-700 space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">
                  Thu nhập thực cộng vào Ví Kỹ Thuật:
                </span>
                <div className={`text-2xl font-black font-mono ${simNetIncome >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                  {simNetIncome.toLocaleString()} đ
                </div>
                <div className="text-[10px] text-zinc-400">
                  Được cộng trực tiếp vào Phiếu Lương tháng của Kỹ thuật viên phụ trách.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD NEW TASK */}
      {showAddTaskModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-zinc-200 space-y-4">
            <h3 className="text-base font-black text-zinc-900">
              Thêm Hạng Mục Sửa Chữa Mới Vào Ma Trận
            </h3>
            <p className="text-xs text-zinc-500">
              Tác vụ mới sẽ được thêm vào bảng và có thể cấu hình đơn giá cho từng đời máy
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Tên hạng mục kỹ thuật:
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Thay cáp sạc, Độ vỏ Titan, Sửa Face ID..."
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-zinc-900 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Đơn giá khởi tạo mặc định (nghìn đồng k):
                </label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={defaultRateK}
                  onChange={(e) => setDefaultRateK(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl font-bold font-mono text-zinc-900"
                />
              </div>
            </div>

            <div className="pt-3 flex space-x-2">
              <button
                onClick={() => setShowAddTaskModal(false)}
                className="flex-1 py-2.5 bg-zinc-100 text-zinc-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleAddTask}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl cursor-pointer shadow-xs"
              >
                Thêm Vào Ma Trận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD MODEL GROUP */}
      {showAddModelModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-zinc-200 space-y-4">
            <h3 className="text-base font-black text-zinc-900">
              Thêm Phân Nhóm Model Máy Mới
            </h3>
            <p className="text-xs text-zinc-500">
              Thêm cột mới vào Ma trận (Ví dụ: 16 - 16 prm, iPad Pro, Apple Watch...)
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Tên hiển thị nhóm máy:
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: 16 - 16 prm, iPad Air/Pro..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-zinc-900 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Từ khóa nhận diện tự động (cách nhau bởi dấu phẩy):
                </label>
                <input
                  type="text"
                  placeholder="16, 16 plus, 16 pro, 16 pro max"
                  value={newGroupKeywords}
                  onChange={(e) => setNewGroupKeywords(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl font-medium text-zinc-900"
                />
              </div>
            </div>

            <div className="pt-3 flex space-x-2">
              <button
                onClick={() => setShowAddModelModal(false)}
                className="flex-1 py-2.5 bg-zinc-100 text-zinc-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleAddModelGroup}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl cursor-pointer shadow-xs"
              >
                Thêm Nhóm Máy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
