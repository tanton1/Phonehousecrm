import React, { useState, useMemo, useRef } from 'react';
import { 
  ClipboardCheck, 
  Check, 
  Clock, 
  Plus, 
  Camera, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Send, 
  ShieldCheck, 
  Lock, 
  Sparkles, 
  DollarSign, 
  Building2, 
  ChevronDown, 
  ChevronUp, 
  Info,
  ListTodo,
  Layers,
  Smartphone,
  Wrench,
  Trash2,
  Edit3,
  ShoppingBag,
  MessageSquare,
  Scan,
  Package,
  Truck,
  Coffee,
  Footprints,
  ChevronLeft,
  ChevronRight,
  Activity
} from 'lucide-react';
import { 
  SOPTemplateItem, 
  DailyShiftChecklistItem, 
  ShiftHandoverReport, 
  SOPCategory, 
  StaffRole 
} from '../types';
import { INITIAL_SOP_TEMPLATES } from '../data/sopTemplatesData';
import { 
  addShiftHandoverToFirestore, 
  addDailyChecklistItemToFirestore, 
  updateDailyChecklistItemInFirestore 
} from '../services/firestoreService';

interface ShiftChecklistModuleProps {
  staffId: string;
  staffName: string;
  staffRole: string; // 'SALES' | 'TECHNICIAN' | 'CASHIER' ...
  branchName?: string;
  currentActivity?: string;
  onChangeActivity?: (activity: string) => void;
  onHandoverSubmit?: (report: Partial<ShiftHandoverReport>) => void;
}

export const ShiftChecklistModule: React.FC<ShiftChecklistModuleProps> = ({
  staffId,
  staffName,
  staffRole,
  branchName = 'Showroom Hải Châu',
  currentActivity = staffRole === 'SALES' ? 'Bán hàng Showroom' : 'Sửa chữa & KCS',
  onChangeActivity,
  onHandoverSubmit
}) => {
  // Load relevant SOP templates based on role
  const initialChecklist = useMemo<DailyShiftChecklistItem[]>(() => {
    const roleKey = staffRole === 'SALES' ? 'SALES' : (staffRole === 'TECHNICIAN' ? 'TECHNICIAN' : 'CASHIER');
    const matchedSOPs = INITIAL_SOP_TEMPLATES.filter(
      t => t.isActive && (t.targetRole === roleKey || t.targetRole === 'ALL')
    );

    return matchedSOPs.map((sop, idx) => ({
      id: `CHECK-${staffId}-${sop.id}`,
      templateId: sop.id,
      date: new Date().toISOString().split('T')[0],
      staffId,
      staffName,
      staffRole,
      branchName,
      title: sop.title,
      category: sop.category,
      categoryName: sop.categoryName,
      timeHint: sop.timeHint,
      priority: sop.priority,
      isCompleted: idx < 3, // mock first 3 tasks completed
      completedAt: idx < 3 ? `08:${15 + idx * 7}` : undefined,
      completedBy: idx < 3 ? staffName : undefined,
      note: sop.code === 'SOP-SALES-03' ? 'Đã nhận đủ 5.000.000đ tiền lẻ két' : undefined
    }));
  }, [staffId, staffName, staffRole, branchName]);

  const [checklistItems, setChecklistItems] = useState<DailyShiftChecklistItem[]>(initialChecklist);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'ALL' | SOPCategory>('ALL');
  const [expandedGuidelines, setExpandedGuidelines] = useState<Record<string, boolean>>({});

  // Handover state
  const [isHandoverOpen, setIsHandoverOpen] = useState(false);
  const [handoverCashSafe, setHandoverCashSafe] = useState('12450000');
  const [handoverRevenue, setHandoverRevenue] = useState('85000000');
  const [handoverNote, setHandoverNote] = useState('Đã đối soát khớp tiền két; Khách anh Hoàng hẹn 15:30 chiều mai lấy iPhone 15 Pro Max.');
  const [isGlassLocked, setIsGlassLocked] = useState(true);
  const [isHeatTurnedOff, setIsHeatTurnedOff] = useState(true);
  const [isHandoverSuccess, setIsHandoverSuccess] = useState(false);

  // Add custom emergent task state
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customCategory, setCustomCategory] = useState<SOPCategory>('MID_SHIFT');

  const completedCount = checklistItems.filter(i => i.isCompleted).length;
  const progressPercent = Math.round((completedCount / checklistItems.length) * 100);

  const formatVND = (num: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  const handleToggleTask = (id: string) => {
    setChecklistItems(prev => prev.map(item => {
      if (item.id === id) {
        const nextDone = !item.isCompleted;
        const timeNow = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const updated: DailyShiftChecklistItem = {
          ...item,
          isCompleted: nextDone,
          completedAt: nextDone ? timeNow : undefined,
          completedBy: nextDone ? staffName : undefined
        };
        updateDailyChecklistItemInFirestore(updated);
        return updated;
      }
      return item;
    }));
  };

  const handleUpdateNote = (id: string, text: string) => {
    setChecklistItems(prev => prev.map(item => item.id === id ? { ...item, note: text } : item));
  };

  const handleAddCustomTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) return;

    const newTask: DailyShiftChecklistItem = {
      id: `CUSTOM-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      staffId,
      staffName,
      staffRole,
      branchName,
      title: customTitle.trim(),
      category: customCategory,
      categoryName: customCategory === 'OPENING' ? 'Đầu ca trực' : customCategory === 'MID_SHIFT' ? 'Trong ca làm' : 'Cuối ca trực & Bàn giao',
      timeHint: 'Việc phát sinh',
      priority: 'NORMAL',
      isCompleted: false,
      isCustomTask: true
    };

    setChecklistItems([...checklistItems, newTask]);
    addDailyChecklistItemToFirestore(newTask);
    setCustomTitle('');
    setIsAddingCustom(false);
  };

  const handleSubmitHandover = (e: React.FormEvent) => {
    e.preventDefault();
    const handoverId = `HO-${Date.now()}`;
    const fullReport: ShiftHandoverReport = {
      id: handoverId,
      code: `BG-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(10 + Math.random() * 90)}`,
      date: new Date().toISOString().split('T')[0],
      shiftName: 'Ca trực hôm nay',
      branchId: 'BRANCH_1',
      branchName,
      staffId,
      staffName,
      staffRole,
      cashInSafe: Number(handoverCashSafe) || 0,
      cashRevenueToday: Number(handoverRevenue) || 0,
      posCardRevenueToday: 0,
      qrBankRevenueToday: 0,
      totalRevenueToday: Number(handoverRevenue) || 0,
      demoDevicesCount: 8,
      demoDevicesLocked: true,
      glassShowcasesLocked: isGlassLocked,
      powerHeatDevicesTurnedOff: isHeatTurnedOff,
      pendingRepairsCount: 0,
      pendingTradeInsCount: 0,
      pendingAppointmentsNote: '',
      generalNotes: handoverNote,
      completedTasksCount: completedCount,
      totalTasksCount: checklistItems.length,
      status: 'SUBMITTED',
      createdAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    addShiftHandoverToFirestore(fullReport);

    if (onHandoverSubmit) {
      onHandoverSubmit(fullReport);
    }

    setIsHandoverSuccess(true);
    setTimeout(() => {
      setIsHandoverSuccess(false);
      setIsHandoverOpen(false);
    }, 2500);
  };

  const filteredTasks = useMemo(() => {
    if (activeCategoryFilter === 'ALL') return checklistItems;
    return checklistItems.filter(i => i.category === activeCategoryFilter);
  }, [checklistItems, activeCategoryFilter]);

  return (
    <div className="space-y-5 animate-fadeIn font-sans">
      {/* 1. PROGRESS & LIVE ACTIVITY DASHBOARD */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-zinc-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 border border-orange-200">
                SOP CHUẨN HOÁ
              </span>
              <span className="text-xs text-zinc-500 font-medium">
                {branchName} • Ngày: {new Date().toLocaleDateString('vi-VN')}
              </span>
            </div>
            <h3 className="text-lg font-black text-zinc-900 mt-1 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-orange-500" />
              <span>Checklist Quy Trình Chuẩn (SOP) Trong Ngày</span>
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddingCustom(!isAddingCustom)}
              className="px-3.5 py-2 bg-orange-50 hover:bg-orange-100 text-orange-600 text-xs font-bold rounded-xl border border-orange-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm việc phát sinh</span>
            </button>
            <button
              onClick={() => setIsHandoverOpen(true)}
              className="px-4 py-2 bg-zinc-900 hover:bg-orange-600 text-white text-xs font-black rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Biên Bản Bàn Giao Ca</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-extrabold text-zinc-700">
              Tiến độ hoàn thành: <strong className="text-orange-600">{completedCount}/{checklistItems.length} nhiệm vụ</strong> ({progressPercent}%)
            </span>
            <span className={`font-black text-xs px-2.5 py-0.5 rounded-full ${
              progressPercent === 100 
                ? 'bg-orange-100 text-orange-800' 
                : progressPercent >= 50 
                ? 'bg-orange-100 text-orange-800' 
                : 'bg-zinc-100 text-zinc-700'
            }`}>
              {progressPercent === 100 ? '✓ Đạt 100% Tiêu Chuẩn SOP' : 'Đang thực hiện'}
            </span>
          </div>
          <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200">
            <div 
              className="h-full bg-gradient-to-r from-orange-500 to-orange-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Live Activity State: Horizontal Tab Bar (Tab chạy ngang để chọn) */}
        <div className="pt-3 border-t border-zinc-100">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-extrabold text-zinc-700 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-orange-500 animate-pulse" />
              <span>Trạng thái đang làm việc:</span>
              <span className="text-[11px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200 ml-1">
                {currentActivity}
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 font-medium hidden sm:inline">
              Trượt ngang để chọn nhanh • Cập nhật tức thì
            </span>
          </div>

          {/* Horizontal Scrollable Tabs */}
          <div className="relative">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-zinc-300 scroll-smooth snap-x">
              {[
                { 
                  id: staffRole === 'SALES' ? 'Bán hàng Showroom' : 'Sửa chữa & KCS', 
                  label: staffRole === 'SALES' ? 'Bán hàng Showroom' : 'Sửa chữa & KCS', 
                  icon: staffRole === 'SALES' ? ShoppingBag : Wrench 
                },
                { 
                  id: staffRole === 'SALES' ? 'Tư vấn online CRM' : 'Kiểm tra máy thu cũ', 
                  label: staffRole === 'SALES' ? 'Tư vấn online CRM' : 'Kiểm tra máy thu cũ', 
                  icon: staffRole === 'SALES' ? MessageSquare : Scan 
                },
                { 
                  id: 'Kiểm kê hàng hoá', 
                  label: 'Kiểm kê hàng hoá', 
                  icon: Package 
                },
                { 
                  id: 'Đi giao hàng', 
                  label: 'Đi giao hàng', 
                  icon: Truck 
                },
                { 
                  id: 'Tạm nghỉ trưa (30p)', 
                  label: 'Nghỉ trưa (30p)', 
                  icon: Coffee 
                },
                { 
                  id: 'Ra ngoài có việc (15p)', 
                  label: 'Ra ngoài (15p)', 
                  icon: Footprints 
                }
              ].map((act) => {
                const Icon = act.icon;
                const isActive = currentActivity === act.id;
                return (
                  <button
                    key={act.id}
                    onClick={() => onChangeActivity && onChangeActivity(act.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap snap-start transition-all cursor-pointer border ${
                      isActive
                        ? 'bg-gradient-to-r from-orange-500 to-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/25 scale-[1.02]'
                        : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200/80 hover:border-zinc-300'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-orange-500'}`} />
                    <span>{act.label}</span>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 2. ADD CUSTOM TASK INLINE FORM */}
      {isAddingCustom && (
        <form onSubmit={handleAddCustomTask} className="bg-white rounded-3xl p-5 border border-orange-200 shadow-md space-y-3 animate-scaleIn">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase text-zinc-900">Thêm nhiệm vụ phát sinh trong ca</h4>
            <button type="button" onClick={() => setIsAddingCustom(false)} className="text-xs text-zinc-400 hover:text-zinc-700">✕ Đóng</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <input
                type="text"
                placeholder="Nhập tên công việc phát sinh (Ví dụ: Test lô tai nghe mới, vệ sinh kho phụ kiện...)"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium text-zinc-900 outline-none focus:border-orange-500"
                autoFocus
                required
              />
            </div>
            <div>
              <select
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value as any)}
                className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 outline-none focus:border-orange-500"
              >
                <option value="OPENING">1. Đầu ca trực</option>
                <option value="MID_SHIFT">2. Trong ca làm</option>
                <option value="CLOSING">3. Cuối ca trực</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddingCustom(false)}
              className="px-3.5 py-1.5 bg-zinc-100 text-zinc-600 rounded-xl text-xs font-bold"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-orange-500 text-white rounded-xl text-xs font-black shadow-sm"
            >
              Thêm Việc
            </button>
          </div>
        </form>
      )}

      {/* 3. PHASE FILTER TABS */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {[
          { id: 'ALL', label: 'Tất cả nhiệm vụ', count: checklistItems.length },
          { id: 'OPENING', label: '1. Đầu ca trực (Opening)', count: checklistItems.filter(i => i.category === 'OPENING').length },
          { id: 'MID_SHIFT', label: '2. Trong ca làm (Mid-shift)', count: checklistItems.filter(i => i.category === 'MID_SHIFT').length },
          { id: 'CLOSING', label: '3. Cuối ca & Bàn giao (Closing)', count: checklistItems.filter(i => i.category === 'CLOSING').length },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setActiveCategoryFilter(f.id as any)}
            className={`px-3.5 py-2 rounded-2xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeCategoryFilter === f.id
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
            }`}
          >
            <span>{f.label}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
              activeCategoryFilter === f.id ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-600 font-bold'
            }`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* 4. INTERACTIVE CHECKLIST ITEMS */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xs overflow-hidden divide-y divide-zinc-100">
        {filteredTasks.map((item) => {
          const matchedTemplate = INITIAL_SOP_TEMPLATES.find(t => t.id === item.templateId);
          const isExpanded = expandedGuidelines[item.id];

          return (
            <div 
              key={item.id}
              className={`p-4 sm:p-5 transition-all ${
                item.isCompleted ? 'bg-orange-50/15' : 'hover:bg-zinc-50/70'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5 flex-1">
                  {/* Custom Checkbox */}
                  <button
                    type="button"
                    onClick={() => handleToggleTask(item.id)}
                    className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all mt-0.5 shrink-0 cursor-pointer ${
                      item.isCompleted
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'border-2 border-zinc-300 hover:border-orange-500 bg-white'
                    }`}
                  >
                    {item.isCompleted && <Check className="w-4 h-4 stroke-[3]" />}
                  </button>

                  {/* Task Content */}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        item.category === 'OPENING' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                        item.category === 'MID_SHIFT' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                        'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {item.categoryName}
                      </span>

                      {item.priority === 'HIGH' && (
                        <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                          Bắt buộc
                        </span>
                      )}

                      <span className="text-[11px] text-zinc-400 flex items-center gap-1 font-medium">
                        <Clock className="w-3 h-3" />
                        <span>{item.timeHint}</span>
                      </span>

                      {matchedTemplate?.bonusPoints ? (
                        <span className="text-[10px] font-bold text-orange-600 font-mono">
                          +{matchedTemplate.bonusPoints}đ
                        </span>
                      ) : null}
                    </div>

                    <h4 
                      onClick={() => handleToggleTask(item.id)}
                      className={`text-sm font-extrabold mt-1.5 leading-snug cursor-pointer select-none transition-colors ${
                        item.isCompleted ? 'line-through text-zinc-400 font-medium' : 'text-zinc-900'
                      }`}
                    >
                      {item.title}
                    </h4>

                    {/* SOP Guidelines expander */}
                    {matchedTemplate?.guidelines && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => setExpandedGuidelines({ ...expandedGuidelines, [item.id]: !isExpanded })}
                          className="text-[11px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer"
                        >
                          <Info className="w-3.5 h-3.5" />
                          <span>{isExpanded ? 'Thu gọn hướng dẫn SOP' : 'Xem tiêu chuẩn SOP chi tiết'}</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 bg-zinc-50 p-3 rounded-2xl border border-zinc-200 space-y-1 text-xs text-zinc-700 animate-fadeIn">
                            <div className="font-bold text-zinc-800 mb-1">{matchedTemplate.description}</div>
                            {matchedTemplate.guidelines.map((g, gIdx) => (
                              <div key={gIdx} className="flex items-start gap-1.5">
                                <Check className="w-3 h-3 text-orange-600 mt-0.5 shrink-0" />
                                <span>{g}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Note Input */}
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Ghi chú số liệu thực hiện (Ví dụ: Đã nhận đủ tiền lẻ 5 triệu, đã test 8 máy...)"
                        value={item.note || ''}
                        onChange={(e) => handleUpdateNote(item.id, e.target.value)}
                        className="w-full max-w-lg p-2 bg-zinc-50 border border-zinc-200/80 rounded-xl text-xs text-zinc-800 placeholder:text-zinc-400 outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Status */}
                <div className="text-right shrink-0">
                  {item.isCompleted ? (
                    <div className="flex flex-col items-end">
                      <span className="text-[11px] font-bold text-orange-700 bg-orange-100 px-2.5 py-1 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Xong lúc {item.completedAt}</span>
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] font-medium text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded-full">
                      Chưa hoàn thành
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. SHIFT HANDOVER FORM / DRAWER */}
      {isHandoverOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl border border-zinc-200 animate-scaleIn my-6">
            <div className="bg-zinc-900 text-white p-5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  BIÊN BẢN BÀN GIAO CA
                </span>
                <h3 className="text-base font-black text-white mt-1">
                  Chốt Sổ Quỹ & Bàn Giao Ca Trực Cho CHT
                </h3>
              </div>
              <button 
                onClick={() => setIsHandoverOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitHandover} className="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-zinc-700 uppercase mb-1">Tiền mặt két bàn giao (đ)</label>
                  <input
                    type="number"
                    value={handoverCashSafe}
                    onChange={(e) => setHandoverCashSafe(e.target.value)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-bold text-zinc-900 outline-none focus:border-orange-500"
                    required
                  />
                  <div className="text-[10px] text-zinc-400 mt-1 font-mono">
                    = {formatVND(Number(handoverCashSafe) || 0)}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-zinc-700 uppercase mb-1">Doanh thu POS/QR trong ca (đ)</label>
                  <input
                    type="number"
                    value={handoverRevenue}
                    onChange={(e) => setHandoverRevenue(e.target.value)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-bold text-zinc-900 outline-none focus:border-orange-500"
                    required
                  />
                  <div className="text-[10px] text-zinc-400 mt-1 font-mono">
                    = {formatVND(Number(handoverRevenue) || 0)}
                  </div>
                </div>
              </div>

              {/* Safety checks */}
              <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-2.5">
                <div className="text-xs font-black text-zinc-800 uppercase">Cam kết an toàn cửa hàng</div>
                
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isGlassLocked}
                    onChange={(e) => setIsGlassLocked(e.target.checked)}
                    className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
                  />
                  <span className="text-xs font-bold text-zinc-800">Đã khóa chốt 100% tủ kính trưng bày máy</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isHeatTurnedOff}
                    onChange={(e) => setIsHeatTurnedOff(e.target.checked)}
                    className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
                  />
                  <span className="text-xs font-bold text-zinc-800">Đã ngắt nguồn máy khò, máy hàn, bình nén khí</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-black text-zinc-700 uppercase mb-1">
                  Nội dung bàn giao (Khách hẹn ngày mai, máy cần giao gấp...)
                </label>
                <textarea
                  rows={3}
                  value={handoverNote}
                  onChange={(e) => setHandoverNote(e.target.value)}
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-zinc-100">
                <div className="text-xs text-zinc-500">
                  Tiến độ SOP: <strong>{completedCount}/{checklistItems.length} việc</strong>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsHandoverOpen(false)}
                    className="px-4 py-2 bg-zinc-100 text-zinc-700 text-xs font-bold rounded-xl"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className={`px-5 py-2 rounded-xl text-xs font-black text-white shadow-md flex items-center gap-1.5 ${
                      isHandoverSuccess ? 'bg-orange-600' : 'bg-orange-500 hover:bg-orange-600'
                    }`}
                  >
                    {isHandoverSuccess ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>✓ Đã Gửi Báo Cáo Ca!</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Gửi Bàn Giao Ca</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
