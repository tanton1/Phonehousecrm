import React, { useState, useMemo } from 'react';
import { 
  ClipboardCheck, 
  Check,
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ShieldCheck, 
  Send, 
  Search, 
  Filter, 
  Layers, 
  Building2, 
  UserCheck, 
  Camera, 
  Zap, 
  DollarSign, 
  ArrowRight, 
  FileText, 
  Lock, 
  Unlock, 
  Sparkles, 
  CheckSquare, 
  ListTodo, 
  Eye, 
  ChevronRight, 
  MessageSquare, 
  Smartphone, 
  Wrench, 
  Award, 
  X,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import { 
  SOPTemplateItem, 
  DailyShiftChecklistItem, 
  ShiftHandoverReport, 
  SOPCategory, 
  SOPTargetRole, 
  TaskPriority,
  StoreBranch,
  StaffMember
} from '../types';
import {
  subscribeToSOPTemplates,
  addSOPTemplateToFirestore,
  updateSOPTemplateInFirestore,
  deleteSOPTemplateFromFirestore,
  subscribeToDailyChecklists,
  addDailyChecklistItemToFirestore,
  updateDailyChecklistItemInFirestore,
  subscribeToShiftHandovers,
  updateShiftHandoverInFirestore
} from '../services/firestoreService';

interface SOPManagementViewProps {
  branches?: StoreBranch[];
  staffMembers?: StaffMember[];
  onNotify?: (message: string) => void;
}

export const SOPManagementView: React.FC<SOPManagementViewProps> = ({
  branches = [],
  staffMembers = [],
  onNotify
}) => {
  // Main Sub-tabs for Leadership
  const [activeTab, setActiveTab] = useState<'TEMPLATES' | 'MONITOR' | 'HANDOVER'>('TEMPLATES');

  // State for SOP Templates (Admin can Create, Edit, Toggle, Delete)
  const [sopTemplates, setSopTemplates] = useState<SOPTemplateItem[]>([]);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // State for Daily Live Checklist instances
  const [dailyChecklists, setDailyChecklists] = useState<DailyShiftChecklistItem[]>([]);

  // State for Handover Reports
  const [handoverReports, setHandoverReports] = useState<ShiftHandoverReport[]>([]);

  // Real-time Firestore Subscriptions
  React.useEffect(() => {
    const unsubTemplates = subscribeToSOPTemplates((data) => {
      setSopTemplates(data || []);
    });
    const unsubChecklists = subscribeToDailyChecklists((data) => {
      setDailyChecklists(data || []);
    });
    const unsubHandovers = subscribeToShiftHandovers((data) => {
      setHandoverReports(data || []);
    });
    return () => {
      unsubTemplates();
      unsubChecklists();
      unsubHandovers();
    };
  }, []);

  // Modal State for SOP Template creation / editing
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SOPTemplateItem | null>(null);

  // Form State for SOP Template
  const [formCode, setFormCode] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formTargetRole, setFormTargetRole] = useState<SOPTargetRole>('SALES');
  const [formCategory, setFormCategory] = useState<SOPCategory>('OPENING');
  const [formTimeHint, setFormTimeHint] = useState('');
  const [formPriority, setFormPriority] = useState<TaskPriority>('HIGH');
  const [formDescription, setFormDescription] = useState('');
  const [formGuidelines, setFormGuidelines] = useState<string>('');
  const [formRequiresPhoto, setFormRequiresPhoto] = useState(false);
  const [formRequiresNote, setFormRequiresNote] = useState(false);
  const [formPenaltyPoints, setFormPenaltyPoints] = useState<number>(0);
  const [formBonusPoints, setFormBonusPoints] = useState<number>(0);

  // Quick Dispatch Task Modal (Manager assign task on the fly)
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchStaffId, setDispatchStaffId] = useState(staffMembers[0]?.id || '');
  const [dispatchTaskTitle, setDispatchTaskTitle] = useState('');
  const [dispatchCategory, setDispatchCategory] = useState<SOPCategory>('MID_SHIFT');
  const [dispatchPriority, setDispatchPriority] = useState<TaskPriority>('HIGH');
  const [dispatchTimeHint, setDispatchTimeHint] = useState('');

  // Selected Handover for Detail View
  const [viewingHandover, setViewingHandover] = useState<ShiftHandoverReport | null>(null);
  const [managerFeedbackText, setManagerFeedbackText] = useState('');

  const formatVND = (num: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  // Filtered Templates
  const filteredTemplates = useMemo(() => {
    return sopTemplates.filter(item => {
      const matchRole = selectedRoleFilter === 'ALL' || item.targetRole === selectedRoleFilter || item.targetRole === 'ALL';
      const matchCategory = selectedCategoryFilter === 'ALL' || item.category === selectedCategoryFilter;
      const matchSearch = !searchQuery.trim() || 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchRole && matchCategory && matchSearch;
    });
  }, [sopTemplates, selectedRoleFilter, selectedCategoryFilter, searchQuery]);

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setEditingTemplate(null);
    setFormCode(`SOP-${formTargetRole}-${Math.floor(10 + Math.random() * 90)}`);
    setFormTitle('');
    setFormTargetRole('SALES');
    setFormCategory('OPENING');
    setFormTimeHint('');
    setFormPriority('HIGH');
    setFormDescription('');
    setFormGuidelines('');
    setFormRequiresPhoto(false);
    setFormRequiresNote(false);
    setFormPenaltyPoints(0);
    setFormBonusPoints(0);
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (item: SOPTemplateItem) => {
    setEditingTemplate(item);
    setFormCode(item.code);
    setFormTitle(item.title);
    setFormTargetRole(item.targetRole);
    setFormCategory(item.category);
    setFormTimeHint(item.timeHint);
    setFormPriority(item.priority);
    setFormDescription(item.description);
    setFormGuidelines(item.guidelines ? item.guidelines.join('\n') : '');
    setFormRequiresPhoto(item.requiresPhotoProof || false);
    setFormRequiresNote(item.requiresNote || false);
    setFormPenaltyPoints(item.penaltyPoints || 0);
    setFormBonusPoints(item.bonusPoints || 0);
    setIsModalOpen(true);
  };

  // Save SOP Template (Create or Update)
  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const roleNameMap: Record<SOPTargetRole, string> = {
      ALL: 'Toàn bộ nhân sự',
      SALES: 'Nhân viên bán hàng Showroom',
      SALE_ONLINE: 'Sale Online & Chăm sóc CRM',
      TECHNICIAN: 'Kỹ thuật viên & KCS',
      CASHIER: 'Thu ngân Showroom',
      WAREHOUSE: 'Thủ kho & Kiểm kê',
      MANAGER: 'Cửa hàng trưởng'
    };

    const categoryNameMap: Record<SOPCategory, string> = {
      OPENING: 'Đầu ca trực',
      MID_SHIFT: 'Trong ca làm',
      CLOSING: 'Cuối ca trực & Bàn giao'
    };

    const parsedGuidelines = formGuidelines
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    if (editingTemplate) {
      // Update
      const updatedTemplate: SOPTemplateItem = {
        ...editingTemplate,
        code: formCode.trim() || editingTemplate.code,
        title: formTitle.trim(),
        targetRole: formTargetRole,
        targetRoleName: roleNameMap[formTargetRole],
        category: formCategory,
        categoryName: categoryNameMap[formCategory],
        timeHint: formTimeHint,
        priority: formPriority,
        description: formDescription.trim(),
        guidelines: parsedGuidelines.length > 0 ? parsedGuidelines : undefined,
        requiresPhotoProof: formRequiresPhoto,
        requiresNote: formRequiresNote,
        penaltyPoints: formPenaltyPoints,
        bonusPoints: formBonusPoints,
        updatedAt: new Date().toLocaleDateString('vi-VN')
      };
      setSopTemplates(prev => prev.map(t => t.id === editingTemplate.id ? updatedTemplate : t));
      updateSOPTemplateInFirestore(updatedTemplate).then(() => onNotify?.('Đã cập nhật SOP'));
    } else {
      // Create new
      const newTemplate: SOPTemplateItem = {
        id: `SOP-CUSTOM-${Date.now()}`,
        code: formCode.trim() || `SOP-${formTargetRole}-${Math.floor(10 + Math.random() * 90)}`,
        title: formTitle.trim(),
        targetRole: formTargetRole,
        targetRoleName: roleNameMap[formTargetRole],
        category: formCategory,
        categoryName: categoryNameMap[formCategory],
        timeHint: formTimeHint,
        priority: formPriority,
        description: formDescription.trim(),
        guidelines: parsedGuidelines.length > 0 ? parsedGuidelines : undefined,
        requiresPhotoProof: formRequiresPhoto,
        requiresNote: formRequiresNote,
        penaltyPoints: formPenaltyPoints,
        bonusPoints: formBonusPoints,
        isActive: true,
        orderIndex: sopTemplates.length + 1,
        createdAt: new Date().toLocaleDateString('vi-VN'),
        version: '1.0'
      };
      setSopTemplates([newTemplate, ...sopTemplates]);
      addSOPTemplateToFirestore(newTemplate).then(() => onNotify?.('Đã tạo SOP'));
    }

    setIsModalOpen(false);
  };

  // Toggle SOP Template Active State
  const handleToggleTemplateActive = (id: string) => {
    setSopTemplates(prev => prev.map(t => {
      if (t.id === id) {
        const updated = { ...t, isActive: !t.isActive };
        updateSOPTemplateInFirestore(updated).then(() => onNotify?.('Đã cập nhật trạng thái SOP'));
        return updated;
      }
      return t;
    }));
  };

  // Delete SOP Template
  const handleDeleteTemplate = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa tiêu chuẩn SOP này?')) {
      setSopTemplates(prev => prev.filter(t => t.id !== id));
      deleteSOPTemplateFromFirestore(id).then(() => onNotify?.('Đã xóa SOP'));
    }
  };

  // Manager Assigns Instant Task to Staff
  const handleDispatchTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchTaskTitle.trim()) return;

    const targetStaff = staffMembers.find(s => s.id === dispatchStaffId) || staffMembers[0];
    if (!targetStaff) {
      onNotify?.('Chưa có nhân viên để giao task');
      return;
    }

    const newTask: DailyShiftChecklistItem = {
      id: `DISPATCH-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      staffId: targetStaff.id,
      staffName: targetStaff.name,
      staffRole: targetStaff.role,
      branchId: targetStaff.branchId,
      branchName: targetStaff.branchName,
      title: dispatchTaskTitle.trim(),
      category: dispatchCategory,
      categoryName: dispatchCategory === 'OPENING' ? 'Đầu ca trực' : dispatchCategory === 'MID_SHIFT' ? 'Trong ca làm' : 'Cuối ca trực & Bàn giao',
      timeHint: dispatchTimeHint,
      priority: dispatchPriority,
      isCompleted: false,
      isCustomTask: true,
      assignedByLeaderName: 'Ban Giám Đốc / CHT'
    };

    setDailyChecklists([newTask, ...dailyChecklists]);
    addDailyChecklistItemToFirestore(newTask);
    setDispatchTaskTitle('');
    setIsDispatchModalOpen(false);
  };

  // Manager Audits / Signs off on a staff checklist
  const handleManagerAuditChecklist = (checkId: string) => {
    setDailyChecklists(prev => prev.map(item => {
      if (item.id === checkId) {
        const updated: DailyShiftChecklistItem = {
          ...item,
          verifiedByManager: true,
          verifiedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          verifiedBy: 'Cửa hàng trưởng'
        };
        updateDailyChecklistItemInFirestore(updated);
        return updated;
      }
      return item;
    }));
  };

  // Manager Approves Handover Report
  const handleApproveHandover = (reportId: string) => {
    setHandoverReports(prev => prev.map(r => {
      if (r.id === reportId) {
        const updated: ShiftHandoverReport = {
          ...r,
          status: 'APPROVED_BY_MANAGER',
          managerApprovedBy: 'Ban Giám Đốc / CHT',
          managerFeedback: managerFeedbackText || 'Đã kiểm tra đối soát, số quỹ và máy tồn chính xác 100%.'
        };
        updateShiftHandoverInFirestore(updated);
        return updated;
      }
      return r;
    }));
    setViewingHandover(null);
    setManagerFeedbackText('');
  };

  return (
    <div className="space-y-5 animate-fadeIn font-sans pb-10">
      {/* 1. TOP HEADER & METRIC SUMMARY */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-950 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-zinc-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-full bg-gradient-to-l from-orange-500/15 to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/30 shrink-0">
              <ClipboardCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  SOP & SHIFT GOVERNANCE
                </span>
                <span className="text-xs text-zinc-400 font-medium">Hệ thống phân cấp Apple Retail</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                Quản Trị Tiêu Chuẩn SOP & Checklist Theo Ca
              </h2>
              <p className="text-xs text-zinc-300 mt-1">
                Thiết lập quy trình chuẩn, giám sát tỷ lệ tuân thủ thời gian thực và xét duyệt biên bản bàn giao quỹ
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-white text-xs font-black rounded-xl shadow-lg shadow-orange-500/25 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo Tiêu Chuẩn SOP Mới</span>
            </button>

            <button
              onClick={() => setIsDispatchModalOpen(true)}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold rounded-xl border border-zinc-700 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <Zap className="w-4 h-4 text-orange-400" />
              <span>Giao Việc Phát Sinh Tức Thời</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. SUB-NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-zinc-200 overflow-x-auto pb-1">
        {[
          { 
            id: 'TEMPLATES', 
            label: '1. Thư Viện Tiêu Chuẩn SOP', 
            icon: ListTodo, 
            badge: `${sopTemplates.filter(t => t.isActive).length} SOP đang chạy` 
          },
          { 
            id: 'MONITOR', 
            label: '2. Giám Sát Checklist Realtime', 
            icon: ShieldCheck, 
            badge: `${dailyChecklists.filter(c => c.isCompleted).length}/${dailyChecklists.length} đã xong` 
          },
          { 
            id: 'HANDOVER', 
            label: '3. Sổ Bàn Giao Ca & Chốt Két', 
            icon: FileText, 
            badge: `${handoverReports.length} biên bản` 
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 rounded-2xl text-xs font-black flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200/80'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                  isActive ? 'bg-white/20 text-white' : 'bg-orange-50 text-orange-600 font-bold'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. TAB 1: SOP TEMPLATES MANAGEMENT (CẤP LÃNH ĐẠO TẠO & ĐIỀU CHỈNH) */}
      {activeTab === 'TEMPLATES' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Filter Bar */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm kiếm theo mã SOP, tên quy trình hoặc từ khóa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-orange-500 font-medium"
                />
              </div>

              {/* Role Filter */}
              <div className="flex items-center gap-2 overflow-x-auto">
                <span className="text-xs font-bold text-zinc-500 whitespace-nowrap">Vị trí:</span>
                {[
                  { id: 'ALL', label: 'Tất cả' },
                  { id: 'SALES', label: 'Bán hàng (Sales)' },
                  { id: 'TECHNICIAN', label: 'Kỹ thuật viên' },
                  { id: 'CASHIER', label: 'Thu ngân' },
                ].map((rf) => (
                  <button
                    key={rf.id}
                    onClick={() => setSelectedRoleFilter(rf.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                      selectedRoleFilter === rf.id
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    {rf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 overflow-x-auto">
              <span className="text-xs font-bold text-zinc-500 whitespace-nowrap">Giai đoạn ca:</span>
              {[
                { id: 'ALL', label: 'Tất cả giai đoạn' },
                { id: 'OPENING', label: '1. Đầu ca trực (Opening)' },
                { id: 'MID_SHIFT', label: '2. Trong ca làm (Mid-shift)' },
                { id: 'CLOSING', label: '3. Cuối ca trực & Bàn giao (Closing)' },
              ].map((cf) => (
                <button
                  key={cf.id}
                  onClick={() => setSelectedCategoryFilter(cf.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap cursor-pointer transition-all ${
                    selectedCategoryFilter === cf.id
                      ? 'bg-orange-500 text-white'
                      : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200/80'
                  }`}
                >
                  {cf.label}
                </button>
              ))}
            </div>
          </div>

          {/* SOP Master List Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTemplates.map((sop) => (
              <div 
                key={sop.id} 
                className={`bg-white rounded-3xl p-5 border transition-all shadow-2xs relative flex flex-col justify-between ${
                  sop.isActive 
                    ? 'border-zinc-200 hover:border-orange-300' 
                    : 'border-zinc-200 bg-zinc-50/60 opacity-60'
                }`}
              >
                <div>
                  {/* Top metadata tags */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-zinc-900 text-white font-mono">
                        {sop.code}
                      </span>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                        sop.targetRole === 'SALES' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        sop.targetRole === 'TECHNICIAN' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {sop.targetRoleName || sop.targetRole}
                      </span>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                        sop.category === 'OPENING' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                        sop.category === 'MID_SHIFT' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                        'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {sop.categoryName}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleTemplateActive(sop.id)}
                        className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          sop.isActive ? 'text-orange-600 bg-orange-50 hover:bg-orange-100' : 'text-zinc-400 bg-zinc-100 hover:bg-zinc-200'
                        }`}
                        title={sop.isActive ? 'Đang hoạt động (Bấm để tạm dừng)' : 'Đang tạm dừng (Bấm để kích hoạt)'}
                      >
                        {sop.isActive ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(sop)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-orange-600 hover:bg-orange-50 transition-all cursor-pointer"
                        title="Chỉnh sửa tiêu chuẩn SOP này"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(sop.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                        title="Xóa tiêu chuẩn SOP"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title & Timing */}
                  <h3 className="text-sm font-extrabold text-zinc-900 leading-snug">
                    {sop.title}
                  </h3>

                  <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1.5 mb-2">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{sop.timeHint}</span>
                    </span>
                    <span>•</span>
                    <span className={`font-black ${
                      sop.priority === 'HIGH' ? 'text-rose-600' : sop.priority === 'MEDIUM' ? 'text-orange-600' : 'text-zinc-600'
                    }`}>
                      Mức độ: {sop.priority === 'HIGH' ? 'Bắt buộc (High)' : sop.priority === 'MEDIUM' ? 'Ưu tiên (Medium)' : 'Thường'}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    {sop.description}
                  </p>

                  {/* Guidelines Checklist */}
                  {sop.guidelines && sop.guidelines.length > 0 && (
                    <div className="mt-3 bg-zinc-50 p-3 rounded-2xl border border-zinc-200/80 space-y-1.5">
                      <div className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                        Các bước thực thi chi tiết:
                      </div>
                      {sop.guidelines.map((step, idx) => (
                        <div key={idx} className="flex items-start gap-1.5 text-xs text-zinc-700 font-medium">
                          <Check className="w-3.5 h-3.5 text-orange-600 mt-0.5 shrink-0" />
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom Rules & Points */}
                <div className="mt-4 pt-3 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    {sop.requiresPhotoProof && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold flex items-center gap-1">
                        <Camera className="w-3 h-3" />
                        <span>Cần chụp ảnh</span>
                      </span>
                    )}
                    {sop.requiresNote && (
                      <span className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-bold flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        <span>Ghi chú số liệu</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    {sop.bonusPoints ? (
                      <span className="text-orange-600 font-bold">+{sop.bonusPoints}đ Thưởng</span>
                    ) : null}
                    {sop.penaltyPoints ? (
                      <span className="text-rose-600 font-bold">-{sop.penaltyPoints}đ Phạt</span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. TAB 2: LIVE STORE & BRANCH CHECKLIST MONITOR (REALTIME AUDIT) */}
      {activeTab === 'MONITOR' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Header Action Bar */}
          <div className="bg-white rounded-3xl p-5 border border-zinc-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-zinc-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-orange-600" />
                <span>Bảng Kiểm Soát Tiến Độ Thực Hiện Checklist Hôm Nay</span>
              </h3>
              <p className="text-xs text-zinc-500">
                Ngày: {new Date().toLocaleDateString('vi-VN')} • Tự động cập nhật theo thao tác của nhân viên tại quầy
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDispatchModalOpen(true)}
                className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-black rounded-xl shadow-md shadow-orange-500/20 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Giao thêm nhiệm vụ</span>
              </button>
            </div>
          </div>

          {/* Realtime Tasks Table */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xs overflow-hidden divide-y divide-zinc-100">
            {dailyChecklists.map((check) => (
              <div key={check.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-50/80 transition-colors">
                <div className="flex items-start gap-3.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    check.isCompleted 
                      ? 'bg-orange-100 text-orange-700' 
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                    {check.isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-zinc-900 text-white font-mono">
                        {check.staffName} ({check.staffRole})
                      </span>
                      <span className="text-xs text-zinc-500 font-medium">
                        {check.branchName || 'Showroom Hải Châu'}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        check.category === 'OPENING' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                        check.category === 'MID_SHIFT' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                        'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {check.categoryName}
                      </span>
                      {check.isCustomTask && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                          Việc phát sinh từ Lãnh đạo
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-extrabold text-zinc-900 mt-1.5">
                      {check.title}
                    </h4>

                    {check.note && (
                      <div className="text-xs text-zinc-600 bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-200 mt-2 font-medium">
                        📝 <strong>Ghi chú thực hiện:</strong> {check.note}
                      </div>
                    )}
                  </div>
                </div>

                {/* Verification Actions */}
                <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                  {check.isCompleted ? (
                    <div className="text-right">
                      <span className="text-xs font-black text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200 inline-block">
                        ✓ Hoàn tất lúc {check.completedAt}
                      </span>
                      {check.verifiedByManager ? (
                        <div className="text-[10px] text-zinc-400 mt-1 flex items-center justify-end gap-1 font-medium">
                          <ShieldCheck className="w-3 h-3 text-orange-600" />
                          <span>Đã ký duyệt: {check.verifiedBy} ({check.verifiedAt})</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleManagerAuditChecklist(check.id)}
                          className="mt-1.5 px-3 py-1 bg-zinc-900 hover:bg-orange-600 text-white text-[10px] font-black rounded-lg transition-colors cursor-pointer block ml-auto"
                        >
                          ✓ Ký Duyệt Audit
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-right">
                      <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
                        ⏳ Đang thực hiện ({check.timeHint})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. TAB 3: SHIFT HANDOVER & CASH AUDIT REPORTS HUB */}
      {activeTab === 'HANDOVER' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-5 border border-zinc-200 shadow-2xs">
            <h3 className="text-base font-black text-zinc-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-orange-500" />
              <span>Sổ Biên Bản Bàn Giao Ca Trực & Đối Soát Quỹ Tiền Mặt</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Cửa hàng trưởng và Ban Giám Đốc đối chiếu số dư két, máy trải nghiệm, máy tồn sửa chữa và phê duyệt thưởng quy trình
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {handoverReports.map((report) => (
              <div key={report.id} className="bg-white rounded-3xl p-5 sm:p-6 border border-zinc-200 shadow-2xs space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-zinc-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase text-orange-600 font-mono">
                        {report.code}
                      </span>
                      <span className="text-xs text-zinc-400">• {report.date}</span>
                    </div>
                    <h4 className="text-base font-black text-zinc-900 mt-1">
                      {report.staffName} — {report.shiftName}
                    </h4>
                    <div className="text-xs text-zinc-500">
                      {report.branchName} • Vị trí: {report.staffRole}
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                    report.status === 'APPROVED_BY_MANAGER'
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-orange-100 text-orange-800'
                  }`}>
                    {report.status === 'APPROVED_BY_MANAGER' ? '✓ Đã Duyệt Quỹ' : 'Chờ Duyệt'}
                  </span>
                </div>

                {/* Key Numbers Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200">
                  <div>
                    <div className="text-[10px] font-bold text-zinc-400 uppercase">Tiền Mặt Két</div>
                    <div className="text-sm font-black text-orange-600 font-mono mt-0.5">
                      {formatVND(report.cashInSafe)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-zinc-400 uppercase">Tổng Doanh Thu Ca</div>
                    <div className="text-sm font-black text-zinc-900 font-mono mt-0.5">
                      {formatVND(report.totalRevenueToday)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-zinc-400 uppercase">Checklist SOP</div>
                    <div className="text-sm font-black text-orange-600 font-mono mt-0.5">
                      {report.completedTasksCount}/{report.totalTasksCount} đạt
                    </div>
                  </div>
                </div>

                {/* Safety & Security Indicators */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between text-zinc-700 font-medium">
                    <span>Khóa tủ kính trưng bày máy:</span>
                    <span className="font-black text-orange-600">✓ Đã khóa an toàn</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-700 font-medium">
                    <span>Ngắt nguồn thiết bị nhiệt (hàn/khò/ép kính):</span>
                    <span className="font-black text-orange-600">✓ Đã ngắt điện</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-700 font-medium">
                    <span>Số máy khách gửi sửa dở / Trade-in:</span>
                    <span className="font-black text-zinc-900 font-mono">{report.pendingRepairsCount + report.pendingTradeInsCount} máy trong tủ</span>
                  </div>
                </div>

                {/* Pending Appointments Note */}
                {report.pendingAppointmentsNote && (
                  <div className="p-3 bg-orange-50/70 border border-orange-200 rounded-xl text-xs text-orange-900">
                    <strong>📌 Lịch hẹn khách giao ca:</strong> {report.pendingAppointmentsNote}
                  </div>
                )}

                {/* Manager Feedback */}
                {report.managerFeedback && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-900">
                    <strong>👨‍💼 Nhận xét của CHT:</strong> {report.managerFeedback}
                  </div>
                )}

                {/* Approval Action */}
                {report.status !== 'APPROVED_BY_MANAGER' && (
                  <div className="pt-2">
                    <button
                      onClick={() => setViewingHandover(report)}
                      className="w-full py-2.5 bg-zinc-900 hover:bg-orange-600 text-white text-xs font-black rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Kiểm Tra & Phê Duyệt Bàn Giao</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= MODAL 1: CREATE / EDIT SOP TEMPLATE ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-zinc-200 animate-scaleIn my-8">
            <div className="bg-zinc-900 text-white p-5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  {editingTemplate ? 'CHỈNH SỬA TIÊU CHUẨN' : 'TẠO TIÊU CHUẨN MỚI'}
                </span>
                <h3 className="text-lg font-black text-white mt-1">
                  {editingTemplate ? `Sửa Tiêu Chuẩn: ${editingTemplate.code}` : 'Thiết Lập Quy Trình SOP Mới Cho Cửa Hàng'}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-zinc-700 uppercase mb-1">Mã SOP</label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="Ví dụ: SOP-SALES-01"
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-bold text-zinc-900 outline-none focus:border-orange-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-zinc-700 uppercase mb-1">Vị trí áp dụng</label>
                  <select
                    value={formTargetRole}
                    onChange={(e) => setFormTargetRole(e.target.value as any)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 outline-none focus:border-orange-500"
                  >
                    <option value="SALES">Nhân viên bán hàng (Sales)</option>
                    <option value="TECHNICIAN">Kỹ thuật viên & KCS</option>
                    <option value="CASHIER">Thu ngân Showroom</option>
                    <option value="WAREHOUSE">Thủ kho</option>
                    <option value="ALL">Toàn bộ nhân sự</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-zinc-700 uppercase mb-1">Tiêu đề quy trình</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ví dụ: Vệ sinh 5S showroom, kiểm tra máy demo và sạc pin 100%..."
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-black text-zinc-700 uppercase mb-1">Giai đoạn ca</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as any)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 outline-none focus:border-orange-500"
                  >
                    <option value="OPENING">1. Đầu ca trực</option>
                    <option value="MID_SHIFT">2. Trong ca làm</option>
                    <option value="CLOSING">3. Cuối ca trực & Bàn giao</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-zinc-700 uppercase mb-1">Khung giờ chuẩn</label>
                  <input
                    type="text"
                    value={formTimeHint}
                    onChange={(e) => setFormTimeHint(e.target.value)}
                    placeholder="08:00 - 08:30"
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-zinc-700 uppercase mb-1">Mức độ ưu tiên</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as any)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 outline-none focus:border-orange-500"
                  >
                    <option value="HIGH">Bắt buộc (High)</option>
                    <option value="MEDIUM">Ưu tiên (Medium)</option>
                    <option value="NORMAL">Bình thường (Normal)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-zinc-700 uppercase mb-1">Mô tả & Mục đích kiểm soát</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Mô tả tiêu chuẩn chất lượng cần đạt được..."
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-zinc-700 uppercase mb-1">
                  Các bước thực thi chi tiết (Mỗi dòng 1 bước)
                </label>
                <textarea
                  rows={3}
                  value={formGuidelines}
                  onChange={(e) => setFormGuidelines(e.target.value)}
                  placeholder="Bước 1: Lau sạch mặt kính tủ trưng bày&#10;Bước 2: Cắm sạc máy demo&#10;Bước 3: Kiểm tra còi báo động"
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 outline-none focus:border-orange-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formRequiresPhoto}
                      onChange={(e) => setFormRequiresPhoto(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
                    />
                    <span className="text-xs font-bold text-zinc-800">Bắt buộc chụp ảnh nghiệm thu</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formRequiresNote}
                      onChange={(e) => setFormRequiresNote(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
                    />
                    <span className="text-xs font-bold text-zinc-800">Bắt buộc nhập số liệu ghi chú</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-orange-700 uppercase mb-0.5">Thưởng (Điểm)</label>
                    <input
                      type="number"
                      value={formBonusPoints}
                      onChange={(e) => setFormBonusPoints(Number(e.target.value))}
                      className="w-full p-2 bg-white border border-orange-300 rounded-xl text-xs font-bold text-orange-700 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-rose-700 uppercase mb-0.5">Phạt (Điểm)</label>
                    <input
                      type="number"
                      value={formPenaltyPoints}
                      onChange={(e) => setFormPenaltyPoints(Number(e.target.value))}
                      className="w-full p-2 bg-white border border-rose-300 rounded-xl text-xs font-bold text-rose-700 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-black rounded-xl shadow-md shadow-orange-500/25 transition-all cursor-pointer"
                >
                  {editingTemplate ? 'Lưu Thay Đổi SOP' : 'Ban Hành Tiêu Chuẩn SOP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: MANAGER INSTANT TASK DISPATCH ================= */}
      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-zinc-200 animate-scaleIn">
            <div className="bg-zinc-900 text-white p-5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  GIAO VIỆC TỨC THỜI
                </span>
                <h3 className="text-base font-black text-white mt-1">
                  Giao Thêm Việc Phát Sinh Trong Ca
                </h3>
              </div>
              <button 
                onClick={() => setIsDispatchModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDispatchTask} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-black text-zinc-700 uppercase mb-1">Chọn nhân viên nhận việc</label>
                <select
                  value={dispatchStaffId}
                  onChange={(e) => setDispatchStaffId(e.target.value)}
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 outline-none focus:border-orange-500"
                >
                  {staffMembers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code} - {s.roleTitle})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-zinc-700 uppercase mb-1">Nhiệm vụ cần thực hiện</label>
                <input
                  type="text"
                  value={dispatchTaskTitle}
                  onChange={(e) => setDispatchTaskTitle(e.target.value)}
                  placeholder="Ví dụ: KCS gấp lô 5 máy iPhone 15 Pro Max khách hẹn 11h..."
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-zinc-700 uppercase mb-1">Thời hạn xử lý</label>
                  <input
                    type="text"
                    value={dispatchTimeHint}
                    onChange={(e) => setDispatchTimeHint(e.target.value)}
                    placeholder="Trước 11:30"
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-zinc-700 uppercase mb-1">Mức độ ưu tiên</label>
                  <select
                    value={dispatchPriority}
                    onChange={(e) => setDispatchPriority(e.target.value as any)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 outline-none focus:border-orange-500"
                  >
                    <option value="HIGH">Rất gấp (High)</option>
                    <option value="MEDIUM">Ưu tiên (Medium)</option>
                    <option value="NORMAL">Bình thường</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsDispatchModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 text-zinc-700 text-xs font-bold rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-black rounded-xl shadow-md"
                >
                  Đẩy Việc Cho Nhân Viên
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: HANDOVER APPROVAL MODAL ================= */}
      {viewingHandover && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-zinc-200 animate-scaleIn">
            <div className="bg-zinc-900 text-white p-5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  DUYỆT BIÊN BẢN BÀN GIAO
                </span>
                <h3 className="text-base font-black text-white mt-1">
                  {viewingHandover.code} — {viewingHandover.staffName}
                </h3>
              </div>
              <button 
                onClick={() => setViewingHandover(null)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Tiền mặt két:</span>
                  <span className="font-black text-orange-600 font-mono">{formatVND(viewingHandover.cashInSafe)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Doanh thu ca:</span>
                  <span className="font-black text-zinc-900 font-mono">{formatVND(viewingHandover.totalRevenueToday)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Tủ kính & Thiết bị nhiệt:</span>
                  <span className="font-black text-orange-600">✓ Đã an toàn 100%</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-zinc-700 uppercase mb-1">
                  Ý kiến đánh giá & Phê duyệt của CHT / Giám Đốc
                </label>
                <textarea
                  rows={3}
                  value={managerFeedbackText}
                  onChange={(e) => setManagerFeedbackText(e.target.value)}
                  placeholder="Ghi chú đánh giá: Tiền két khớp 100%, bàn giao sạch sẽ đạt thưởng chuyên cần..."
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setViewingHandover(null)}
                  className="px-4 py-2 bg-zinc-100 text-zinc-700 font-bold rounded-xl"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => handleApproveHandover(viewingHandover.id)}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl shadow-md"
                >
                  ✓ Duyệt Biên Bản & Chốt Quỹ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
