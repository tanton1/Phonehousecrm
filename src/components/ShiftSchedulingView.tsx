import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Send,
  Settings2,
  Users,
  WandSparkles,
  X
} from 'lucide-react';
import { ShiftDefinition, ShiftDepartmentPolicy, StaffMember, StoreBranch, WeeklyShiftSchedule } from '../types';
import {
  createShiftDefinition,
  fetchShiftBoard,
  saveShiftDepartmentPolicy,
  saveShiftBoard,
  updateShiftDefinition
} from '../services/shiftSchedulingApiClient';
import { applyFixedDepartmentPolicies, resolveStaffDepartment, ShiftDraftDay, ShiftDraftSchedule } from '../utils/shiftPolicy';
import { HRMetricCarousel } from './HRMetricCarousel';

interface ShiftSchedulingViewProps {
  currentUser?: any;
  staffList: StaffMember[];
  branches: StoreBranch[];
}

type DraftDay = ShiftDraftDay;
type DraftSchedule = ShiftDraftSchedule;

const VI_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const COLOR_OPTIONS = ['#FF4B16', '#F59E0B', '#10B981', '#0EA5E9', '#8B5CF6', '#E11D48'];

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function mondayOf(date = new Date()) {
  const base = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12));
  const day = base.getUTCDay();
  base.setUTCDate(base.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return isoDate(base);
}

function addDays(dateText: string, amount: number) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}

function weekDates(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year.slice(-2)}`;
}

function scheduleToDraft(schedules: WeeklyShiftSchedule[]): DraftSchedule {
  const next: DraftSchedule = {};
  schedules.forEach((schedule) => {
    next[schedule.staffId] = {};
    Object.entries(schedule.days || {}).forEach(([date, assignment]) => {
      if (!assignment?.shiftId) return;
      next[schedule.staffId][date] = { shiftId: assignment.shiftId, note: assignment.note || '' };
    });
  });
  return next;
}

const ShiftSchedulingView: React.FC<ShiftSchedulingViewProps> = ({ currentUser, staffList, branches }) => {
  const role = String(currentUser?.role || '').toUpperCase();
  const roleCanManage = ['ADMIN', 'MANAGER', 'STORE_MANAGER'].includes(role);
  const accessibleBranches = useMemo(() => {
    if (role === 'ADMIN') return branches.filter((branch) => branch?.isActive !== false);
    const ids = new Set([currentUser?.branchId, ...(currentUser?.assignedBranchIds || [])].filter(Boolean));
    return branches.filter((branch) => ids.has(branch.id) && branch?.isActive !== false);
  }, [branches, currentUser?.assignedBranchIds, currentUser?.branchId, role]);

  const [selectedBranchId, setSelectedBranchId] = useState(() => currentUser?.branchId || accessibleBranches[0]?.id || '');
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const [selectedMobileDate, setSelectedMobileDate] = useState(dates[0]);
  const [selectedDepartment, setSelectedDepartment] = useState('ALL');
  const [search, setSearch] = useState('');
  const [schedules, setSchedules] = useState<WeeklyShiftSchedule[]>([]);
  const [definitions, setDefinitions] = useState<ShiftDefinition[]>([]);
  const [policies, setPolicies] = useState<ShiftDepartmentPolicy[]>([]);
  const [draft, setDraft] = useState<DraftSchedule>({});
  const [canManage, setCanManage] = useState(roleCanManage);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [autoSaveBlocked, setAutoSaveBlocked] = useState(false);
  const revisionRef = useRef(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<{ staff: StaffMember; date: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [bulkShiftId, setBulkShiftId] = useState('');
  const [bulkDates, setBulkDates] = useState<string[]>(dates);
  const [showSettings, setShowSettings] = useState(false);
  const [showPolicySettings, setShowPolicySettings] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<ShiftDefinition | null>(null);
  const [definitionForm, setDefinitionForm] = useState({ name: '', startTime: '08:00', endTime: '17:00', breakDurationMinutes: 60, color: COLOR_OPTIONS[0], branchId: selectedBranchId });
  const [policyForm, setPolicyForm] = useState<{ departmentId: string; departmentName: string; mode: 'FIXED' | 'ROTATING'; defaultShiftId: string; workDayIndexes: number[] }>({
    departmentId: '', departmentName: '', mode: 'FIXED', defaultShiftId: '', workDayIndexes: [0, 1, 2, 3, 4, 5]
  });

  const recoveryKey = `phonehouse_shift_draft_v1_${selectedBranchId}_${weekStart}`;
  const markDirty = () => {
    revisionRef.current += 1;
    setAutoSaveBlocked(false);
    setDirty(true);
  };

  useEffect(() => {
    if (!selectedBranchId && accessibleBranches[0]?.id) setSelectedBranchId(accessibleBranches[0].id);
  }, [accessibleBranches, selectedBranchId]);

  useEffect(() => {
    setSelectedMobileDate(dates[0]);
    setBulkDates(dates);
  }, [dates]);

  const loadBoard = async () => {
    if (!selectedBranchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const result = await fetchShiftBoard(weekStart, selectedBranchId);
      setSchedules(result.schedules || []);
      setDefinitions(result.definitions || []);
      setPolicies(result.policies || []);
      const serverDraft = scheduleToDraft(result.schedules || []);
      const recoveryRaw = window.localStorage.getItem(recoveryKey);
      if (recoveryRaw) {
        try {
          const recovery = JSON.parse(recoveryRaw);
          setDraft(recovery?.draft && typeof recovery.draft === 'object' ? recovery.draft : serverDraft);
          revisionRef.current += 1;
          setDirty(true);
          setMessage({ type: 'success', text: 'Đã khôi phục thay đổi chưa kịp đồng bộ. Hệ thống đang tự lưu lại lên server.' });
        } catch {
          window.localStorage.removeItem(recoveryKey);
          setDraft(serverDraft);
          setDirty(false);
        }
      } else {
        setDraft(serverDraft);
        setDirty(false);
      }
      setCanManage(Boolean(result.permissions?.canManage));
      const latestSavedAt = (result.schedules || []).reduce((latest, item) => String(item.updatedAt || '') > latest ? String(item.updatedAt || '') : latest, '');
      setLastSavedAt(latestSavedAt);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Không tải được lịch làm việc.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, weekStart]);

  const branchStaff = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return staffList
      .filter((staff) => staff.status === 'ACTIVE')
      .filter((staff) => staff.branchId === selectedBranchId || (staff.assignedBranchIds || []).includes(selectedBranchId))
      .filter((staff) => selectedDepartment === 'ALL' || resolveStaffDepartment(staff).id === selectedDepartment)
      .filter((staff) => !normalizedSearch || `${staff.name} ${staff.code} ${staff.roleTitle}`.toLowerCase().includes(normalizedSearch));
  }, [search, selectedBranchId, selectedDepartment, staffList]);

  const allBranchStaff = useMemo(() => staffList
    .filter((staff) => staff.status === 'ACTIVE')
    .filter((staff) => staff.branchId === selectedBranchId || (staff.assignedBranchIds || []).includes(selectedBranchId)), [selectedBranchId, staffList]);

  const departments = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    allBranchStaff.forEach((staff) => {
      const department = resolveStaffDepartment(staff);
      const current = map.get(department.id);
      map.set(department.id, { ...department, count: (current?.count || 0) + 1 });
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [allBranchStaff]);

  const definitionMap = useMemo(() => new Map(definitions.map((definition) => [definition.id, definition])), [definitions]);
  const policyMap = useMemo(() => new Map(policies.map((policy) => [policy.departmentId, policy])), [policies]);
  const fixedStaffCount = allBranchStaff.filter((staff) => policyMap.get(resolveStaffDepartment(staff).id)?.mode === 'FIXED').length;
  const assignedCount = allBranchStaff.filter((staff) => dates.every((date) => Boolean(draft[staff.id]?.[date]?.shiftId))).length;
  const publishedCount = schedules.filter((schedule) => schedule.status === 'PUBLISHED').length;
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);

  useEffect(() => {
    if (!dirty || !selectedBranchId) return;
    window.localStorage.setItem(recoveryKey, JSON.stringify({ draft, savedAt: new Date().toISOString() }));
  }, [dirty, draft, recoveryKey, selectedBranchId]);

  useEffect(() => {
    if (!dirty || autoSaveBlocked || loading || saving || !canManage || !selectedBranchId) return;
    const existingStaffIds = new Set(schedules.map((schedule) => schedule.staffId));
    const entries = allBranchStaff
      .map((staff) => ({ staffId: staff.id, days: draft[staff.id] || {} }))
      .filter((entry) => Object.keys(entry.days).length > 0 || existingStaffIds.has(entry.staffId));
    if (entries.length === 0) return;

    const revisionAtStart = revisionRef.current;
    const timer = window.setTimeout(() => {
      setSaving(true);
      void saveShiftBoard({ branchId: selectedBranchId, weekStart, status: 'DRAFT', entries, operationKey: `SHIFT_AUTO_${selectedBranchId}_${weekStart}_${Date.now()}` })
        .then((result) => {
          if (revisionRef.current !== revisionAtStart) return;
          window.localStorage.removeItem(recoveryKey);
          setLastSavedAt(result.savedAt || new Date().toISOString());
          setDirty(false);
          setMessage({ type: 'success', text: `Đã tự lưu ${result.saved} lịch lên server.` });
        })
        .catch((error: any) => {
          setAutoSaveBlocked(true);
          setMessage({ type: 'error', text: `${error?.message || 'Không tự lưu được lịch.'} Bản nháp vẫn được giữ trên máy; hãy bấm Lưu để thử lại.` });
        })
        .finally(() => setSaving(false));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [allBranchStaff, autoSaveBlocked, canManage, dirty, draft, loading, recoveryKey, saving, schedules, selectedBranchId, weekStart]);

  const applyPolicies = (notify = true) => {
    const result = applyFixedDepartmentPolicies({
      draft,
      policies,
      staffList: allBranchStaff,
      dates,
      validShiftIds: new Set(definitions.map((definition) => definition.id))
    });
    if (result.appliedCells > 0) {
      setDraft(result.draft);
      markDirty();
      if (notify) setMessage({ type: 'success', text: `Đã tự điền ${result.appliedCells} ô theo giờ hành chính. Lịch đã xếp tay trước đó được giữ nguyên.` });
    } else if (notify) {
      setMessage({ type: 'success', text: 'Lịch cố định đã đầy đủ; không có ô trống cần tự điền.' });
    }
  };

  const policySignature = useMemo(() => JSON.stringify(policies.map((policy) => ({ id: policy.id, mode: policy.mode, shift: policy.defaultShiftId, days: policy.workDayIndexes }))), [policies]);
  useEffect(() => {
    if (loading || !policySignature || policies.length === 0 || allBranchStaff.length === 0) return;
    const result = applyFixedDepartmentPolicies({
      draft,
      policies,
      staffList: allBranchStaff,
      dates,
      validShiftIds: new Set(definitions.map((definition) => definition.id))
    });
    if (result.appliedCells > 0) {
      setDraft(result.draft);
      markDirty();
      setMessage({ type: 'success', text: `Đã tự điền lịch cố định cho ${result.fixedStaffIds.size} nhân viên. NVBH & CSKH vẫn để quản lý xếp xoay ca.` });
    }
    // Reapply only when the saved policy/week/staff set changes; manual exceptions must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policySignature, weekStart, selectedBranchId, allBranchStaff.length, loading]);

  const setAssignment = (staffId: string, date: string, shiftId: string, note = '') => {
    setDraft((current) => ({
      ...current,
      [staffId]: {
        ...(current[staffId] || {}),
        ...(shiftId ? { [date]: { shiftId, note } } : {})
      }
    }));
    if (!shiftId) {
      setDraft((current) => {
        const staffDays = { ...(current[staffId] || {}) };
        delete staffDays[date];
        return { ...current, [staffId]: staffDays };
      });
    }
    markDirty();
  };

  const openAssignment = (staff: StaffMember, date: string) => {
    if (!canManage) return;
    setAssignmentTarget({ staff, date });
    setNoteDraft(draft[staff.id]?.[date]?.note || '');
  };

  const persist = async (status: 'DRAFT' | 'PUBLISHED') => {
    const existingStaffIds = new Set(schedules.map((schedule) => schedule.staffId));
    const entries = allBranchStaff
      .map((staff) => ({ staffId: staff.id, days: draft[staff.id] || {} }))
      .filter((entry) => Object.keys(entry.days).length > 0 || existingStaffIds.has(entry.staffId));
    if (entries.length === 0) {
      setMessage({ type: 'error', text: 'Chưa có ca nào được xếp. Hãy chọn một ô nhân viên/ngày trước.' });
      return;
    }
    if (status === 'PUBLISHED' && !window.confirm('Đăng lịch tuần này? Nhân viên sẽ dùng lịch này để chấm công.')) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveShiftBoard({
        branchId: selectedBranchId,
        weekStart,
        status,
        entries,
        operationKey: `SHIFT_${selectedBranchId}_${weekStart}_${status}_${Date.now()}`
      });
      window.localStorage.removeItem(recoveryKey);
      setLastSavedAt(result.savedAt || new Date().toISOString());
      setMessage({ type: 'success', text: status === 'PUBLISHED' ? `Đã đăng lịch cho ${entries.length} nhân viên.` : `Đã lưu bản nháp cho ${entries.length} nhân viên.` });
      await loadBoard();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Không lưu được lịch.' });
    } finally {
      setSaving(false);
    }
  };

  const copyPreviousWeek = async () => {
    if (!selectedBranchId) return;
    setSaving(true);
    setMessage(null);
    try {
      const previousWeek = addDays(weekStart, -7);
      const previous = await fetchShiftBoard(previousWeek, selectedBranchId);
      if (!previous.schedules.length) throw new Error('Tuần trước chưa có lịch để sao chép.');
      const previousDates = weekDates(previousWeek);
      const nextDraft: DraftSchedule = { ...draft };
      previous.schedules.forEach((schedule) => {
        nextDraft[schedule.staffId] = {};
        previousDates.forEach((oldDate, index) => {
          const oldAssignment = schedule.days?.[oldDate];
          if (oldAssignment?.shiftId) nextDraft[schedule.staffId][dates[index]] = { shiftId: oldAssignment.shiftId, note: oldAssignment.note || '' };
        });
      });
      setDraft(nextDraft);
      markDirty();
      setMessage({ type: 'success', text: 'Đã sao chép lịch tuần trước vào bản nháp. Hãy kiểm tra rồi bấm Lưu.' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Không sao chép được lịch tuần trước.' });
    } finally {
      setSaving(false);
    }
  };

  const applyBulk = () => {
    if (!bulkShiftId || bulkDates.length === 0 || branchStaff.length === 0) return;
    setDraft((current) => {
      const next = { ...current };
      branchStaff.forEach((staff) => {
        const staffDays = { ...(next[staff.id] || {}) };
        bulkDates.forEach((date) => { staffDays[date] = { shiftId: bulkShiftId }; });
        next[staff.id] = staffDays;
      });
      return next;
    });
    markDirty();
    setShowBulk(false);
    setMessage({ type: 'success', text: `Đã gán nhanh cho ${branchStaff.length} nhân viên đang lọc. Hãy bấm Lưu bản nháp.` });
  };

  const openDefinitionForm = (definition?: ShiftDefinition) => {
    setEditingDefinition(definition || null);
    setDefinitionForm(definition ? {
      name: definition.name,
      startTime: definition.startTime,
      endTime: definition.endTime,
      breakDurationMinutes: definition.breakDurationMinutes,
      color: definition.color || COLOR_OPTIONS[0],
      branchId: definition.branchId || selectedBranchId
    } : { name: '', startTime: '08:00', endTime: '17:00', breakDurationMinutes: 60, color: COLOR_OPTIONS[0], branchId: selectedBranchId });
    setShowSettings(true);
  };

  const persistDefinition = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (editingDefinition) await updateShiftDefinition(editingDefinition.id, definitionForm);
      else await createShiftDefinition(definitionForm);
      setShowSettings(false);
      setEditingDefinition(null);
      setMessage({ type: 'success', text: editingDefinition ? 'Đã cập nhật ca làm.' : 'Đã tạo ca làm mới.' });
      await loadBoard();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Không lưu được ca làm.' });
    } finally {
      setSaving(false);
    }
  };

  const openPolicyForm = (departmentId?: string) => {
    const department = departments.find((item) => item.id === departmentId) || departments[0];
    const existing = department ? policyMap.get(department.id) : undefined;
    setPolicyForm({
      departmentId: department?.id || '',
      departmentName: department?.name || '',
      mode: existing?.mode || (department?.id === 'SALES' ? 'ROTATING' : 'FIXED'),
      defaultShiftId: existing?.defaultShiftId || definitions[0]?.id || '',
      workDayIndexes: existing?.workDayIndexes?.length ? existing.workDayIndexes : [0, 1, 2, 3, 4, 5]
    });
    setShowPolicySettings(true);
  };

  const persistPolicy = async () => {
    if (!policyForm.departmentId) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveShiftDepartmentPolicy({ ...policyForm, branchId: selectedBranchId });
      setShowPolicySettings(false);
      setMessage({ type: 'success', text: `Đã lưu quy tắc cho ${policyForm.departmentName}.` });
      await loadBoard();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Không lưu được quy tắc bộ phận.' });
    } finally {
      setSaving(false);
    }
  };

  const quickSetupPolicies = async () => {
    if (!policyForm.defaultShiftId) {
      setMessage({ type: 'error', text: 'Hãy chọn ca giờ hành chính trước.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await Promise.all(departments.map((department) => saveShiftDepartmentPolicy({
        branchId: selectedBranchId,
        departmentId: department.id,
        departmentName: department.name,
        mode: department.id === 'SALES' ? 'ROTATING' : 'FIXED',
        defaultShiftId: department.id === 'SALES' ? undefined : policyForm.defaultShiftId,
        workDayIndexes: department.id === 'SALES' ? [] : policyForm.workDayIndexes
      })));
      setShowPolicySettings(false);
      setMessage({ type: 'success', text: 'Đã thiết lập: Bán hàng & CSKH xoay ca; các bộ phận còn lại theo giờ hành chính.' });
      await loadBoard();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Không thiết lập nhanh được quy tắc.' });
    } finally {
      setSaving(false);
    }
  };

  const assignmentLabel = (assignment?: DraftDay) => {
    if (!assignment?.shiftId) return { name: 'Chưa xếp', time: '', color: '#A1A1AA' };
    if (assignment.shiftId === 'OFF') return { name: 'Nghỉ', time: '', color: '#71717A' };
    const definition = definitionMap.get(assignment.shiftId);
    return {
      name: definition?.name || 'Ca đã ngừng dùng',
      time: definition ? `${definition.startTime}–${definition.endTime}` : '',
      color: definition?.color || '#F97316'
    };
  };

  if (!selectedBranchId && !loading) {
    return <div className="rounded-3xl border border-orange-200 bg-orange-50 p-6 text-sm font-bold text-orange-900">Chưa có chi nhánh hoạt động để xếp ca. Hãy tạo chi nhánh và gán nhân viên trước.</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-black text-zinc-950"><CalendarDays className="h-4 w-4 text-[#ff4b16]" /> Lịch làm việc theo tuần</div>
            <div className="mt-1 inline-flex items-center gap-2 text-[11px] font-bold text-zinc-500">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : dirty ? <Clock3 className="h-3.5 w-3.5 text-amber-500" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
              {saving ? 'Đang lưu lên server…' : dirty ? 'Có thay đổi đang chờ lưu' : lastSavedAt ? `Đã lưu lúc ${new Date(lastSavedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Dữ liệu đang đồng bộ từ server'}
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {canManage && <button onClick={() => openDefinitionForm()} title="Thiết lập ca làm việc" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-700"><Settings2 className="h-4 w-4" /><span className="hidden sm:inline">Ca làm</span></button>}
            {canManage && <button onClick={() => openPolicyForm()} title="Quy tắc theo bộ phận" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-700"><Users className="h-4 w-4" /><span className="hidden sm:inline">Quy tắc</span></button>}
            {canManage && <button onClick={() => void persist('DRAFT')} disabled={saving || !dirty} title="Lưu ngay" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-700 disabled:opacity-40"><Save className="h-4 w-4" /><span className="hidden sm:inline">Lưu</span></button>}
            {canManage && <button onClick={() => void persist('PUBLISHED')} disabled={saving} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#ff4b16] to-[#ff6b3d] px-3 text-xs font-black text-white shadow-sm shadow-orange-500/20 disabled:opacity-40"><Send className="h-4 w-4" /> Đăng lịch</button>}
          </div>
        </div>
      </section>

      {message && <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{message.text}</div>}

      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button aria-label="Tuần trước" onClick={() => setWeekStart(addDays(weekStart, -7))} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-700"><ChevronLeft className="h-4 w-4" /></button>
            <div className="min-w-36 shrink-0 rounded-lg bg-zinc-100 px-2 py-2 text-center text-[11px] font-black text-zinc-900">{formatShortDate(dates[0])} – {formatShortDate(dates[6])}</div>
            <button aria-label="Tuần sau" onClick={() => setWeekStart(addDays(weekStart, 7))} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-700"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={() => setWeekStart(mondayOf())} className="h-9 shrink-0 rounded-lg border border-zinc-200 px-2 text-[11px] font-bold text-zinc-700">Tuần này</button>
            <select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} className="h-9 min-w-36 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-bold outline-none focus:border-[#ff4b16]">
              {accessibleBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <select value={selectedDepartment} onChange={(event) => setSelectedDepartment(event.target.value)} className="h-9 min-w-32 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-bold outline-none focus:border-[#ff4b16]"><option value="ALL">Tất cả bộ phận</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name} · {department.count}</option>)}</select>
            <div className="relative min-w-40 flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm nhân viên" className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-2 text-[11px] font-semibold outline-none focus:border-[#ff4b16]" /></div>
            {canManage && <button onClick={() => void copyPreviousWeek()} disabled={saving} title="Sao chép tuần trước" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-zinc-200 text-zinc-600"><Copy className="h-4 w-4" /></button>}
            {canManage && fixedStaffCount > 0 && <button onClick={() => applyPolicies(true)} title="Điền giờ hành chính" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-zinc-200 text-zinc-600"><Clock3 className="h-4 w-4" /></button>}
            {canManage && <button onClick={() => { setBulkShiftId(definitions[0]?.id || 'OFF'); setShowBulk(true); }} className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-[11px] font-black text-white"><WandSparkles className="h-4 w-4" /> Gán nhanh</button>}
        </div>
      </section>

      <HRMetricCarousel items={[
        { id: 'staff', label: 'Nhân viên', value: allBranchStaff.length, note: selectedBranch?.name, icon: Users },
        { id: 'complete', label: 'Đã đủ 7 ngày', value: assignedCount, note: 'Bao gồm ngày nghỉ', icon: Check },
        { id: 'missing', label: 'Còn thiếu lịch', value: Math.max(0, allBranchStaff.length - assignedCount), note: 'Cần hoàn tất trước khi đăng', icon: Clock3 },
        { id: 'published', label: 'Lịch đã đăng', value: publishedCount, note: 'Đang dùng để chấm công', icon: Send }
      ]} />

      {definitions.length === 0 && !loading && canManage && <section className="rounded-3xl border border-orange-200 bg-orange-50 p-5"><h3 className="font-black text-orange-950">Chưa có ca làm việc</h3><p className="mt-1 text-sm text-orange-800">Tạo ít nhất một ca (ví dụ 08:00–17:00) trước khi xếp lịch. Ngày nghỉ luôn có sẵn.</p><button onClick={() => openDefinitionForm()} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-black text-white"><Plus className="h-4 w-4" /> Tạo ca đầu tiên</button></section>}

      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        {loading ? <div className="flex min-h-64 items-center justify-center gap-2 text-sm font-bold text-zinc-500"><Loader2 className="h-5 w-5 animate-spin text-orange-500" /> Đang tải lịch...</div> : branchStaff.length === 0 ? <div className="p-10 text-center text-sm font-bold text-zinc-500">Không có nhân viên phù hợp bộ lọc tại {selectedBranch?.name || 'chi nhánh này'}.</div> : <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1050px] border-collapse text-left">
              <thead><tr className="bg-zinc-50 text-xs font-black text-zinc-600"><th className="sticky left-0 z-10 min-w-56 border-b border-r border-zinc-200 bg-zinc-50 px-4 py-3">Nhân viên / Bộ phận</th>{dates.map((date, index) => <th key={date} className="min-w-28 border-b border-zinc-200 px-2 py-3 text-center"><div>{VI_DAYS[index]}</div><div className="mt-0.5 text-[10px] text-zinc-400">{formatShortDate(date)}</div></th>)}</tr></thead>
              <tbody>{branchStaff.map((staff) => <tr key={staff.id} className="border-b border-zinc-100 last:border-0"><td className="sticky left-0 z-10 border-r border-zinc-100 bg-white px-4 py-3"><div className="font-black text-zinc-900">{staff.name}</div><div className="mt-1 text-[11px] font-bold text-zinc-500">{resolveStaffDepartment(staff).name} · {staff.roleTitle}</div></td>{dates.map((date) => { const label = assignmentLabel(draft[staff.id]?.[date]); return <td key={date} className="p-1.5"><button onClick={() => openAssignment(staff, date)} disabled={!canManage} className="min-h-14 w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 text-left transition hover:border-orange-300 disabled:cursor-default"><span className="block truncate text-xs font-black" style={{ color: label.color }}>{label.name}</span>{label.time && <span className="mt-1 block text-[10px] font-semibold text-zinc-500">{label.time}</span>}</button></td>; })}</tr>)}</tbody>
            </table>
          </div>

          <div className="lg:hidden">
            <div className="flex gap-2 overflow-x-auto border-b border-zinc-200 p-3">{dates.map((date, index) => <button key={date} onClick={() => setSelectedMobileDate(date)} className={`min-w-16 rounded-xl px-3 py-2 text-center ${selectedMobileDate === date ? 'bg-[#ff4b16] text-white' : 'bg-zinc-100 text-zinc-700'}`}><span className="block text-xs font-black">{VI_DAYS[index]}</span><span className="mt-0.5 block text-[10px] font-bold">{formatShortDate(date).slice(0, 5)}</span></button>)}</div>
            <div className="divide-y divide-zinc-100">{branchStaff.map((staff) => { const label = assignmentLabel(draft[staff.id]?.[selectedMobileDate]); return <button key={staff.id} onClick={() => openAssignment(staff, selectedMobileDate)} disabled={!canManage} className="flex w-full items-center justify-between gap-3 p-4 text-left disabled:cursor-default"><div className="min-w-0"><div className="truncate text-sm font-black text-zinc-900">{staff.name}</div><div className="mt-1 truncate text-xs font-semibold text-zinc-500">{resolveStaffDepartment(staff).name} · {staff.roleTitle}</div></div><div className="min-w-28 rounded-xl bg-zinc-50 px-3 py-2 text-right"><div className="text-xs font-black" style={{ color: label.color }}>{label.name}</div>{label.time && <div className="mt-1 text-[10px] font-semibold text-zinc-500">{label.time}</div>}</div></button>; })}</div>
          </div>
        </>}
      </section>

      {assignmentTarget && <div className="fixed inset-0 z-[120] flex items-end bg-black/50 sm:items-center sm:justify-center" onMouseDown={(event) => { if (event.target === event.currentTarget) setAssignmentTarget(null); }}><div className="flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl"><div className="flex items-center justify-between border-b border-zinc-200 p-4"><div><div className="text-xs font-black uppercase text-orange-600">{formatShortDate(assignmentTarget.date)}</div><h3 className="mt-1 text-lg font-black text-zinc-900">{assignmentTarget.staff.name}</h3></div><button onClick={() => setAssignmentTarget(null)} className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100"><X className="h-5 w-5" /></button></div><div className="overflow-y-auto p-4"><div className="grid gap-2">{definitions.map((definition) => <button key={definition.id} onClick={() => setAssignment(assignmentTarget.staff.id, assignmentTarget.date, definition.id, noteDraft)} className={`flex items-center justify-between rounded-2xl border p-4 text-left ${draft[assignmentTarget.staff.id]?.[assignmentTarget.date]?.shiftId === definition.id ? 'border-orange-500 bg-orange-50' : 'border-zinc-200'}`}><div><div className="font-black text-zinc-900">{definition.name}</div><div className="mt-1 text-xs font-semibold text-zinc-500">{definition.startTime}–{definition.endTime} · nghỉ {definition.breakDurationMinutes || 0} phút</div></div><span className="h-4 w-4 rounded-full" style={{ backgroundColor: definition.color || '#FF4B16' }} /></button>)}<button onClick={() => setAssignment(assignmentTarget.staff.id, assignmentTarget.date, 'OFF', noteDraft)} className={`rounded-2xl border p-4 text-left font-black ${draft[assignmentTarget.staff.id]?.[assignmentTarget.date]?.shiftId === 'OFF' ? 'border-zinc-800 bg-zinc-100' : 'border-zinc-200'}`}>Nghỉ</button><button onClick={() => setAssignment(assignmentTarget.staff.id, assignmentTarget.date, '')} className="rounded-2xl border border-dashed border-zinc-300 p-4 text-left font-black text-zinc-500">Bỏ xếp ca ngày này</button></div><label className="mt-4 block text-xs font-black text-zinc-600">Ghi chú (không bắt buộc)</label><input value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Ví dụ: đổi ca với Nam" className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-orange-400" /></div><div className="border-t border-zinc-200 p-4"><button onClick={() => { const current = draft[assignmentTarget.staff.id]?.[assignmentTarget.date]; if (current?.shiftId) setAssignment(assignmentTarget.staff.id, assignmentTarget.date, current.shiftId, noteDraft); setAssignmentTarget(null); }} className="h-12 w-full rounded-2xl bg-orange-500 text-sm font-black text-white">Xong</button></div></div></div>}

      {showBulk && <div className="fixed inset-0 z-[120] flex items-end bg-black/50 sm:items-center sm:justify-center"><div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 sm:max-w-xl sm:rounded-3xl sm:p-6"><div className="flex items-center justify-between"><div><div className="text-xs font-black uppercase text-orange-600">Gán nhanh theo bộ phận</div><h3 className="mt-1 text-xl font-black">{selectedDepartment === 'ALL' ? 'Tất cả nhân viên đang lọc' : departments.find((item) => item.id === selectedDepartment)?.name}</h3></div><button onClick={() => setShowBulk(false)} className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100"><X className="h-5 w-5" /></button></div><div className="mt-5"><label className="text-xs font-black text-zinc-600">Ca áp dụng</label><select value={bulkShiftId} onChange={(event) => setBulkShiftId(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 font-bold"><option value="">Chọn ca</option>{definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name} ({definition.startTime}–{definition.endTime})</option>)}<option value="OFF">Nghỉ</option></select></div><div className="mt-5"><div className="text-xs font-black text-zinc-600">Ngày áp dụng</div><div className="mt-2 grid grid-cols-4 gap-2">{dates.map((date, index) => <button key={date} onClick={() => setBulkDates((current) => current.includes(date) ? current.filter((item) => item !== date) : [...current, date])} className={`rounded-xl px-2 py-3 text-xs font-black ${bulkDates.includes(date) ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{VI_DAYS[index]}<span className="mt-1 block text-[10px]">{formatShortDate(date).slice(0, 5)}</span></button>)}</div></div><div className="mt-5 rounded-2xl bg-orange-50 p-4 text-sm font-bold text-orange-900">Áp dụng cho {branchStaff.length} nhân viên đang hiển thị. Bạn vẫn có thể sửa từng ô trước khi lưu.</div><button onClick={applyBulk} disabled={!bulkShiftId || bulkDates.length === 0} className="mt-5 h-12 w-full rounded-2xl bg-orange-500 text-sm font-black text-white disabled:opacity-40">Gán ca</button></div></div>}

      {showPolicySettings && <div className="fixed inset-0 z-[125] overflow-y-auto bg-zinc-50 sm:flex sm:items-center sm:justify-center sm:bg-black/50 sm:p-4">
        <div className="min-h-full w-full bg-white sm:min-h-0 sm:max-h-[94vh] sm:max-w-3xl sm:overflow-y-auto sm:rounded-3xl">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white p-4 sm:p-5">
            <div><div className="text-xs font-black uppercase text-orange-600">Tối ưu xếp ca</div><h3 className="mt-1 text-xl font-black">Quy tắc theo bộ phận</h3></div>
            <button onClick={() => setShowPolicySettings(false)} className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100"><X className="h-5 w-5" /></button>
          </div>
          <div className="space-y-5 p-4 sm:p-5">
            <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
              <h4 className="font-black text-orange-950">Thiết lập nhanh cho PhoneHouse</h4>
              <p className="mt-1 text-sm leading-6 text-orange-800">Bán hàng & CSKH sẽ xếp xoay ca. Kỹ thuật, Kho, Kế toán và Quản lý được tự điền theo ca hành chính bên dưới.</p>
              <label className="mt-4 block text-xs font-black text-orange-900">Chọn ca giờ hành chính</label>
              <select value={policyForm.defaultShiftId} onChange={(event) => setPolicyForm((current) => ({ ...current, defaultShiftId: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-orange-200 bg-white px-3 font-bold">
                <option value="">Chọn ca đã thiết lập</option>
                {definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name} ({definition.startTime}–{definition.endTime})</option>)}
              </select>
              <div className="mt-4 text-xs font-black text-orange-900">Ngày làm hành chính</div>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">{VI_DAYS.map((day, index) => <button key={day} onClick={() => setPolicyForm((current) => ({ ...current, workDayIndexes: current.workDayIndexes.includes(index) ? current.workDayIndexes.filter((item) => item !== index) : [...current.workDayIndexes, index].sort() }))} className={`rounded-xl px-2 py-3 text-xs font-black ${policyForm.workDayIndexes.includes(index) ? 'bg-orange-500 text-white' : 'border border-orange-200 bg-white text-orange-800'}`}>{day}</button>)}</div>
              <button onClick={() => void quickSetupPolicies()} disabled={saving || !policyForm.defaultShiftId || departments.length === 0} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 text-sm font-black text-white disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />} Áp dụng nhanh cho toàn chi nhánh</button>
            </section>

            <section className="rounded-2xl border border-zinc-200 p-4">
              <h4 className="font-black text-zinc-900">Điều chỉnh riêng một bộ phận</h4>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label><span className="text-xs font-black text-zinc-600">Bộ phận</span><select value={policyForm.departmentId} onChange={(event) => openPolicyForm(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 font-bold"><option value="">Chọn bộ phận</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
                <label><span className="text-xs font-black text-zinc-600">Cách xếp ca</span><select value={policyForm.mode} onChange={(event) => setPolicyForm((current) => ({ ...current, mode: event.target.value as 'FIXED' | 'ROTATING' }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 font-bold"><option value="ROTATING">Xoay ca — quản lý tự xếp</option><option value="FIXED">Cố định — hệ thống tự điền</option></select></label>
                {policyForm.mode === 'FIXED' && <><label className="sm:col-span-2"><span className="text-xs font-black text-zinc-600">Ca cố định</span><select value={policyForm.defaultShiftId} onChange={(event) => setPolicyForm((current) => ({ ...current, defaultShiftId: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 font-bold"><option value="">Chọn ca</option>{definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name} ({definition.startTime}–{definition.endTime})</option>)}</select></label><div className="sm:col-span-2"><span className="text-xs font-black text-zinc-600">Ngày làm việc</span><div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">{VI_DAYS.map((day, index) => <button key={day} onClick={() => setPolicyForm((current) => ({ ...current, workDayIndexes: current.workDayIndexes.includes(index) ? current.workDayIndexes.filter((item) => item !== index) : [...current.workDayIndexes, index].sort() }))} className={`rounded-xl px-2 py-3 text-xs font-black ${policyForm.workDayIndexes.includes(index) ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{day}</button>)}</div></div></>}
              </div>
              <button onClick={() => void persistPolicy()} disabled={saving || !policyForm.departmentId || (policyForm.mode === 'FIXED' && !policyForm.defaultShiftId)} className="mt-5 h-12 w-full rounded-2xl bg-zinc-900 text-sm font-black text-white disabled:opacity-40">Lưu quy tắc bộ phận</button>
            </section>

            {departments.length > 0 && <section><div className="mb-2 text-xs font-black uppercase tracking-wide text-zinc-500">Đang áp dụng tại {selectedBranch?.name}</div><div className="grid gap-2 sm:grid-cols-2">{departments.map((department) => { const policy = policyMap.get(department.id); const shift = policy?.defaultShiftId ? definitionMap.get(policy.defaultShiftId) : undefined; return <button key={department.id} onClick={() => openPolicyForm(department.id)} className="rounded-2xl border border-zinc-200 p-4 text-left"><div className="flex items-center justify-between"><span className="font-black text-zinc-900">{department.name}</span><Pencil className="h-4 w-4 text-zinc-400" /></div><div className="mt-2 text-xs font-bold text-zinc-500">{!policy ? 'Chưa thiết lập' : policy.mode === 'ROTATING' ? 'Xoay ca — xếp thủ công' : `${shift?.name || 'Ca cố định'} · ${policy.workDayIndexes.map((index) => VI_DAYS[index]).join(', ')}`}</div></button>; })}</div></section>}
          </div>
        </div>
      </div>}

      {showSettings && <div className="fixed inset-0 z-[120] overflow-y-auto bg-zinc-50 sm:flex sm:items-center sm:justify-center sm:bg-black/50 sm:p-4"><div className="min-h-full w-full bg-white sm:min-h-0 sm:max-w-2xl sm:rounded-3xl"><div className="flex items-center justify-between border-b border-zinc-200 p-4 sm:p-5"><div><div className="text-xs font-black uppercase text-orange-600">Thiết lập ca làm</div><h3 className="mt-1 text-xl font-black">{editingDefinition ? 'Sửa ca làm' : 'Tạo ca mới'}</h3></div><button onClick={() => { setShowSettings(false); setEditingDefinition(null); }} className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100"><X className="h-5 w-5" /></button></div><div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5"><label className="sm:col-span-2"><span className="text-xs font-black text-zinc-600">Tên ca</span><input value={definitionForm.name} onChange={(event) => setDefinitionForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ví dụ: Ca cửa hàng sáng" className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 font-bold outline-none focus:border-orange-400" /></label><label><span className="text-xs font-black text-zinc-600">Bắt đầu</span><input type="time" value={definitionForm.startTime} onChange={(event) => setDefinitionForm((current) => ({ ...current, startTime: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 font-bold" /></label><label><span className="text-xs font-black text-zinc-600">Kết thúc</span><input type="time" value={definitionForm.endTime} onChange={(event) => setDefinitionForm((current) => ({ ...current, endTime: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 font-bold" /></label><label><span className="text-xs font-black text-zinc-600">Thời gian nghỉ (phút)</span><input type="number" min="0" max="240" value={definitionForm.breakDurationMinutes} onChange={(event) => setDefinitionForm((current) => ({ ...current, breakDurationMinutes: Number(event.target.value) }))} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-3 font-bold" /></label><div><span className="text-xs font-black text-zinc-600">Màu nhận biết</span><div className="mt-3 flex gap-2">{COLOR_OPTIONS.map((color) => <button key={color} onClick={() => setDefinitionForm((current) => ({ ...current, color }))} className={`h-8 w-8 rounded-full ${definitionForm.color === color ? 'ring-2 ring-zinc-900 ring-offset-2' : ''}`} style={{ backgroundColor: color }} />)}</div></div>{definitions.length > 0 && !editingDefinition && <div className="sm:col-span-2"><div className="mb-2 text-xs font-black text-zinc-600">Các ca đang dùng</div><div className="grid gap-2">{definitions.map((definition) => <button key={definition.id} onClick={() => openDefinitionForm(definition)} className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 text-left"><div><div className="font-black">{definition.name}</div><div className="mt-1 text-xs text-zinc-500">{definition.startTime}–{definition.endTime}</div></div><Pencil className="h-4 w-4 text-zinc-400" /></button>)}</div></div>}</div><div className="flex gap-2 border-t border-zinc-200 p-4 sm:p-5">{editingDefinition && <button onClick={async () => { if (!window.confirm('Ngừng dùng ca này? Lịch đã đăng trước đây vẫn giữ nguyên.')) return; setSaving(true); try { await updateShiftDefinition(editingDefinition.id, { ...definitionForm, active: false }); setShowSettings(false); await loadBoard(); } catch (error: any) { setMessage({ type: 'error', text: error?.message || 'Không ngừng được ca.' }); } finally { setSaving(false); } }} className="h-12 rounded-2xl border border-red-200 px-4 text-sm font-black text-red-700">Ngừng dùng</button>}<button onClick={() => void persistDefinition()} disabled={saving || !definitionForm.name.trim()} className="ml-auto inline-flex h-12 items-center gap-2 rounded-2xl bg-orange-500 px-5 text-sm font-black text-white disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu ca</button></div></div></div>}
    </div>
  );
};

export default ShiftSchedulingView;
