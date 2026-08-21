import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Headphones,
  Loader2,
  RefreshCw,
  Save,
  Settings2,
  ShoppingBag,
  Trash2,
  Warehouse,
  Wrench
} from 'lucide-react';
import {
  CustomerCareSetupConfig,
  SalesSetupConfig,
  SystemSetupCheck,
  SystemSetupStatus,
  TechnicalTaskTypeConfig
} from '../types';
import {
  fetchOperationalConfigurationState,
  fetchSystemSetupStatus,
  fetchTechnicalTaskSettings,
  saveOperationalConfig,
  saveTechnicalTaskSetting
} from '../services/configurationApiClient';
import { SOPManagementView } from './SOPManagementView';
import { StoreSettingsView, StoreSettingsViewProps } from './StoreSettingsView';

type SetupTab = 'overview' | 'organization' | 'finance' | 'sop' | 'technicalTasks' | 'sales' | 'customerCare';

interface SystemSettingsHubProps extends StoreSettingsViewProps {
  initialTab?: SetupTab;
  onNavigate: (tab: string) => void;
  onSetupStatusChange?: (status: SystemSetupStatus) => void;
}

const TAB_BY_CHECK: Record<SystemSetupCheck['id'], SetupTab> = {
  company: 'organization',
  branches: 'organization',
  warehouses: 'organization',
  funds: 'finance',
  sop: 'sop',
  technicalTasks: 'technicalTasks',
  sales: 'sales',
  customerCare: 'customerCare'
};

const tabs: Array<{ id: SetupTab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Tổng quan', icon: BadgeCheck },
  { id: 'organization', label: 'Doanh nghiệp, Chi nhánh & Kho', icon: Building2 },
  { id: 'finance', label: 'Tài khoản tài chính', icon: Banknote },
  { id: 'sop', label: 'SOP', icon: ClipboardCheck },
  { id: 'technicalTasks', label: 'Task kỹ thuật', icon: Wrench },
  { id: 'sales', label: 'Sales', icon: ShoppingBag },
  { id: 'customerCare', label: 'CSKH', icon: Headphones }
];

const emptySales = (): SalesSetupConfig => ({
  id: 'sales', policyId: '', name: '', version: '', effectiveFrom: '', effectiveTo: '', deviceProfitPercent: Number.NaN,
  accessoryProfitPercent: Number.NaN, onlineSaleSplitPercent: Number.NaN,
  maxDiscountPercent: Number.NaN, defaultMonthlyTarget: Number.NaN, commissionTags: [], isActive: true
});

const emptyCare = (): CustomerCareSetupConfig => ({
  id: 'customerCare', policyId: '', name: '', version: '', effectiveFrom: '', effectiveTo: '', firstResponseMinutes: Number.NaN,
  followUpAttempts: Number.NaN, followUpDays: [], completedFollowUpCommission: Number.NaN, requireEvidence: false,
  requireQaApproval: false, isActive: true
});

function NumberField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (value: number) => void; suffix?: string }) {
  return (
    <label className="space-y-1.5 text-sm font-semibold text-zinc-700">
      <span>{label}</span>
      <div className="relative">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? Number.NaN : Number(event.target.value))}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 outline-none focus:border-orange-500"
        />
        {suffix && <span className="absolute right-3 top-2.5 text-zinc-400">{suffix}</span>}
      </div>
    </label>
  );
}

function OperationalPolicyPanel({ kind, policies, onSaved }: {
  kind: 'sales' | 'customerCare';
  policies: Array<SalesSetupConfig | CustomerCareSetupConfig>;
  onSaved: () => Promise<void>;
}) {
  const createEmpty = () => kind === 'sales' ? emptySales() : emptyCare();
  const [draft, setDraft] = useState<SalesSetupConfig | CustomerCareSetupConfig>(createEmpty);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const editing = policies.some(policy => policy.policyId === draft.policyId);

  useEffect(() => {
    setDraft(current => policies.find(policy => policy.policyId === current.policyId) || policies[0] || createEmpty());
  }, [policies, kind]);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      await saveOperationalConfig(kind, draft);
      await onSaved();
      setMessage('Đã lưu phiên bản chính sách.');
    } catch (error: any) {
      setMessage(error?.message || 'Không thể lưu cấu hình.');
    } finally {
      setSaving(false);
    }
  };

  const sales = kind === 'sales' ? draft as SalesSetupConfig : null;
  const care = kind === 'customerCare' ? draft as CustomerCareSetupConfig : null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  const statusOf = (policy: SalesSetupConfig | CustomerCareSetupConfig) => {
    if (!policy.isActive) return { label: 'Đã tắt', className: 'bg-zinc-100 text-zinc-500' };
    if (policy.effectiveFrom > today) return { label: 'Sắp hiệu lực', className: 'bg-blue-50 text-blue-700' };
    if (policy.effectiveTo && policy.effectiveTo < today) return { label: 'Hết hiệu lực', className: 'bg-zinc-100 text-zinc-500' };
    return { label: 'Đang áp dụng', className: 'bg-emerald-50 text-emerald-700' };
  };
  return (
    <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
        <h2 className="text-lg font-black text-zinc-900">{kind === 'sales' ? 'Chính sách Sales' : 'Quy trình CSKH'}</h2>
        <p className="mt-1 text-sm text-zinc-500">Lưu nhiều phiên bản, mỗi phiên bản có lịch hiệu lực riêng.</p>
        </div>
        <button type="button" onClick={() => { setDraft(createEmpty()); setMessage(''); }} className="shrink-0 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-black text-white">+ Tạo mới</button>
      </div>
      <div className="space-y-2">
        {policies.length === 0 && <div className="rounded-xl border border-dashed p-4 text-sm text-zinc-500">Chưa có phiên bản nào.</div>}
        {policies.map(policy => { const status = statusOf(policy); return <button key={policy.policyId} type="button" onClick={() => { setDraft(policy); setMessage(''); }} className={`w-full rounded-xl border p-3 text-left ${draft.policyId === policy.policyId ? 'border-orange-500 bg-orange-50' : 'border-zinc-200 hover:border-orange-300'}`}>
          <div className="flex items-start justify-between gap-2"><div><p className="font-black text-zinc-900">{policy.name}</p><p className="text-xs text-zinc-500">{policy.policyId} · {policy.version}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${status.className}`}>{status.label}</span></div>
          <p className="mt-2 text-xs text-zinc-600">{policy.effectiveFrom} → {policy.effectiveTo || 'Không giới hạn'}</p>
        </button>; })}
      </div>
    </section>
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-5"><h3 className="font-black text-zinc-900">{editing ? 'Chỉnh sửa phiên bản' : 'Tạo phiên bản mới'}</h3><p className="text-xs text-zinc-500">Các phiên bản đang bật không được chồng lấn thời gian hiệu lực.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5 text-sm font-semibold text-zinc-700">
          <span>Mã chính sách</span>
          <input disabled={editing} value={draft.policyId} onChange={e => setDraft({ ...draft, policyId: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} placeholder={kind === 'sales' ? 'SALE_2026_Q4' : 'CSKH_2026_Q4'} className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 disabled:bg-zinc-100" />
        </label>
        <label className="space-y-1.5 text-sm font-semibold text-zinc-700">
          <span>Tên chính sách</span>
          <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 outline-none focus:border-orange-500" />
        </label>
        <label className="space-y-1.5 text-sm font-semibold text-zinc-700"><span>Hiệu lực từ</span><input type="date" value={draft.effectiveFrom} onChange={e => setDraft({ ...draft, effectiveFrom: e.target.value })} className="w-full rounded-xl border border-zinc-200 px-3 py-2.5" /></label>
        <label className="space-y-1.5 text-sm font-semibold text-zinc-700"><span>Hiệu lực đến (để trống nếu không giới hạn)</span><input type="date" value={draft.effectiveTo || ''} onChange={e => setDraft({ ...draft, effectiveTo: e.target.value })} className="w-full rounded-xl border border-zinc-200 px-3 py-2.5" /></label>
        <label className="space-y-1.5 text-sm font-semibold text-zinc-700">
          <span>Phiên bản</span>
          <input value={draft.version} onChange={e => setDraft({ ...draft, version: e.target.value })} placeholder="Ví dụ: 2026.01" className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 outline-none focus:border-orange-500" />
        </label>
        {sales && <>
          <NumberField label="Tỷ lệ nền cho máy không có tag (dữ liệu cũ)" value={sales.deviceProfitPercent} suffix="%" onChange={value => setDraft({ ...sales, deviceProfitPercent: value })} />
          <NumberField label="Tỷ lệ nền cho phụ kiện không có tag (dữ liệu cũ)" value={sales.accessoryProfitPercent} suffix="%" onChange={value => setDraft({ ...sales, accessoryProfitPercent: value })} />
          <NumberField label="Tỷ lệ chia đơn online" value={sales.onlineSaleSplitPercent} suffix="%" onChange={value => setDraft({ ...sales, onlineSaleSplitPercent: value })} />
          <NumberField label="Mức giảm giá tối đa" value={sales.maxDiscountPercent} suffix="%" onChange={value => setDraft({ ...sales, maxDiscountPercent: value })} />
          <NumberField label="Chỉ tiêu doanh thu tháng" value={sales.defaultMonthlyTarget} onChange={value => setDraft({ ...sales, defaultMonthlyTarget: value })} />
        </>}
        {care && <>
          <NumberField label="Phản hồi đầu tiên trong" value={care.firstResponseMinutes} suffix="phút" onChange={value => setDraft({ ...care, firstResponseMinutes: value })} />
          <NumberField label="Số lần theo dõi tối thiểu" value={care.followUpAttempts} onChange={value => setDraft({ ...care, followUpAttempts: value })} />
          <NumberField label="Hoa hồng mỗi lượt CSKH hoàn tất đạt chuẩn" value={care.completedFollowUpCommission} suffix="đ" onChange={value => setDraft({ ...care, completedFollowUpCommission: value })} />
          <label className="space-y-1.5 text-sm font-semibold text-zinc-700 md:col-span-2">
            <span>Các ngày chăm sóc sau giao dịch (phân cách dấu phẩy)</span>
            <input value={care.followUpDays.join(', ')} onChange={e => setDraft({ ...care, followUpDays: e.target.value.split(',').map(v => Number(v.trim())).filter(Number.isFinite) })} placeholder="Ví dụ: 1, 3, 7, 30" className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 outline-none focus:border-orange-500" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={care.requireEvidence} onChange={e => setDraft({ ...care, requireEvidence: e.target.checked })} /> Bắt buộc bằng chứng CSKH</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={care.requireQaApproval} onChange={e => setDraft({ ...care, requireQaApproval: e.target.checked })} /> Bắt buộc QA duyệt</label>
        </>}
      </div>
      {sales && <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50/40 p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div><h3 className="font-black text-zinc-900">Tag phân loại & hoa hồng POS</h3><p className="text-xs text-zinc-600">Admin tự tạo tag. Nhân viên bắt buộc chọn tag phù hợp trên từng dòng Máy/Phụ kiện khi bán.</p></div>
          <button type="button" onClick={() => setDraft({ ...sales, commissionTags: [...(sales.commissionTags || []), { id: '', name: '', appliesTo: 'DEVICE', calculationType: 'FLAT', value: Number.NaN, description: '', isActive: true }] })} className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-black text-white">+ Thêm tag</button>
        </div>
        <div className="mt-4 space-y-3">
          {(sales.commissionTags || []).length === 0 && <div className="rounded-xl border border-dashed border-orange-300 bg-white p-4 text-sm text-orange-800">Chưa có tag. Ví dụ tên: Máy full BH, Máy trần, Máy bóc; mã do Admin tự đặt.</div>}
          {(sales.commissionTags || []).map((tag, index) => {
            const tags = sales.commissionTags || [];
            const updateTag = (value: typeof tag) => setDraft({ ...sales, commissionTags: tags.map((item, itemIndex) => itemIndex === index ? value : item) });
            return <div key={`${tag.id}-${index}`} className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-3 md:grid-cols-2 xl:grid-cols-6">
              <label className="space-y-1 text-xs font-bold"><span>Mã tag</span><input value={tag.id} onChange={e => updateTag({ ...tag, id: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} placeholder="MAY_FULL_BH" className="w-full rounded-lg border px-2.5 py-2" /></label>
              <label className="space-y-1 text-xs font-bold"><span>Tên hiển thị</span><input value={tag.name} onChange={e => updateTag({ ...tag, name: e.target.value })} placeholder="Máy full BH" className="w-full rounded-lg border px-2.5 py-2" /></label>
              <label className="space-y-1 text-xs font-bold"><span>Áp dụng</span><select value={tag.appliesTo} onChange={e => updateTag({ ...tag, appliesTo: e.target.value as typeof tag.appliesTo })} className="w-full rounded-lg border px-2.5 py-2"><option value="DEVICE">Máy</option><option value="ACCESSORY">Phụ kiện</option></select></label>
              <label className="space-y-1 text-xs font-bold"><span>Cách tính</span><select value={tag.calculationType} onChange={e => updateTag({ ...tag, calculationType: e.target.value as typeof tag.calculationType })} className="w-full rounded-lg border px-2.5 py-2"><option value="FLAT">Tiền cố định</option><option value="PERCENT">% doanh thu</option></select></label>
              <NumberField label={tag.calculationType === 'FLAT' ? 'Mức hưởng (đ)' : 'Mức hưởng (%)'} value={tag.value} onChange={value => updateTag({ ...tag, value })} />
              <div className="flex items-end gap-2 pb-1"><label className="flex flex-1 items-center gap-2 text-xs font-bold"><input type="checkbox" checked={tag.isActive} onChange={e => updateTag({ ...tag, isActive: e.target.checked })} /> Đang dùng</label><button type="button" onClick={() => setDraft({ ...sales, commissionTags: tags.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Xóa tag"><Trash2 className="h-4 w-4" /></button></div>
              <label className="space-y-1 text-xs font-bold md:col-span-2 xl:col-span-6"><span>Ghi chú</span><input value={tag.description || ''} onChange={e => updateTag({ ...tag, description: e.target.value })} placeholder="Điều kiện áp dụng để nhân viên chọn đúng" className="w-full rounded-lg border px-2.5 py-2" /></label>
            </div>;
          })}
        </div>
      </div>}
      <label className="mt-4 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.isActive} onChange={e => setDraft({ ...draft, isActive: e.target.checked })} /> Bật phiên bản này để hệ thống xét áp dụng</label>
      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu phiên bản
        </button>
        {message && <span className="text-sm text-zinc-600">{message}</span>}
      </div>
    </section></div>
  );
}

const emptyTask = (): TechnicalTaskTypeConfig => ({
  id: '', taskType: '', name: '', taskCode: '', baseCommission: Number.NaN,
  normalSlaHours: Number.NaN, prioritySlaHours: Number.NaN, urgentSlaHours: Number.NaN,
  priorityMultiplier: { NORMAL: Number.NaN, PRIORITY: Number.NaN, URGENT: Number.NaN },
  requiresQc: true, isActive: true, version: ''
});

function TechnicalTaskPanel({ onSaved }: { onSaved: () => Promise<void> }) {
  const [items, setItems] = useState<TechnicalTaskTypeConfig[]>([]);
  const [draft, setDraft] = useState<TechnicalTaskTypeConfig>(emptyTask());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const editing = items.some(item => item.taskType === draft.taskType);
  const load = useCallback(async () => setItems(await fetchTechnicalTaskSettings()), []);
  useEffect(() => { load().catch(error => setMessage(error.message)); }, [load]);

  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const normalized = { ...draft, id: draft.taskType, taskType: draft.taskType.trim().toUpperCase(), taskCode: draft.taskCode.trim().toUpperCase() };
      await saveTechnicalTaskSetting(normalized);
      await Promise.all([load(), onSaved()]);
      setDraft(emptyTask());
      setMessage('Đã lưu task kỹ thuật.');
    } catch (error: any) { setMessage(error?.message || 'Không thể lưu task.'); }
    finally { setSaving(false); }
  };

  return <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">Task & hoa hồng kỹ thuật</h2><p className="text-sm text-zinc-500">Mỗi task phải được khai báo trước khi điều chuyển máy cho KTV.</p></div><button onClick={() => setDraft(emptyTask())} className="rounded-lg border px-3 py-2 text-xs font-bold">Tạo mới</button></div>
      <div className="space-y-2">{items.length === 0 && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Chưa có task nào. Hệ thống sẽ không tự tạo task mặc định.</div>}{items.map(item => <button key={item.taskType} onClick={() => setDraft(item)} className="flex w-full items-center justify-between rounded-xl border p-3 text-left hover:border-orange-400"><div><p className="font-bold">{item.name}</p><p className="text-xs text-zinc-500">{item.taskCode} • {item.baseCommission.toLocaleString('vi-VN')}đ</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${item.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{item.isActive ? 'Đang dùng' : 'Tạm ngưng'}</span></button>)}</div>
    </section>
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-black">{editing ? 'Chỉnh sửa task' : 'Tạo task mới'}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold"><span>Mã định danh</span><input disabled={editing} value={draft.taskType} onChange={e => setDraft({ ...draft, taskType: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} placeholder="THAY_PIN" className="w-full rounded-xl border px-3 py-2.5 disabled:bg-zinc-100" /></label>
        <label className="space-y-1 text-sm font-semibold"><span>Mã hạch toán</span><input value={draft.taskCode} onChange={e => setDraft({ ...draft, taskCode: e.target.value })} className="w-full rounded-xl border px-3 py-2.5" /></label>
        <label className="space-y-1 text-sm font-semibold md:col-span-2"><span>Tên task</span><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="w-full rounded-xl border px-3 py-2.5" /></label>
        <NumberField label="Hoa hồng cơ bản" value={draft.baseCommission} onChange={value => setDraft({ ...draft, baseCommission: value })} />
        <label className="space-y-1 text-sm font-semibold"><span>Phiên bản</span><input value={draft.version} onChange={e => setDraft({ ...draft, version: e.target.value })} className="w-full rounded-xl border px-3 py-2.5" /></label>
        <NumberField label="SLA thường (giờ)" value={draft.normalSlaHours} onChange={value => setDraft({ ...draft, normalSlaHours: value })} />
        <NumberField label="SLA ưu tiên (giờ)" value={draft.prioritySlaHours ?? Number.NaN} onChange={value => setDraft({ ...draft, prioritySlaHours: value })} />
        <NumberField label="SLA khẩn (giờ)" value={draft.urgentSlaHours} onChange={value => setDraft({ ...draft, urgentSlaHours: value })} />
        <NumberField label="Hệ số thường" value={draft.priorityMultiplier.NORMAL} onChange={value => setDraft({ ...draft, priorityMultiplier: { ...draft.priorityMultiplier, NORMAL: value } })} />
        <NumberField label="Hệ số ưu tiên" value={draft.priorityMultiplier.PRIORITY} onChange={value => setDraft({ ...draft, priorityMultiplier: { ...draft.priorityMultiplier, PRIORITY: value } })} />
        <NumberField label="Hệ số khẩn" value={draft.priorityMultiplier.URGENT} onChange={value => setDraft({ ...draft, priorityMultiplier: { ...draft.priorityMultiplier, URGENT: value } })} />
      </div>
      <div className="mt-4 flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.requiresQc} onChange={e => setDraft({ ...draft, requiresQc: e.target.checked })} /> Bắt buộc KCS</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.isActive} onChange={e => setDraft({ ...draft, isActive: e.target.checked })} /> Kích hoạt</label></div>
      <div className="mt-5 flex items-center gap-3"><button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu task</button>{message && <span className="text-sm text-zinc-600">{message}</span>}</div>
    </section>
  </div>;
}

export const SystemSettingsHub: React.FC<SystemSettingsHubProps> = ({ initialTab = 'overview', onNavigate, onSetupStatusChange, ...storeProps }) => {
  const [activeTab, setActiveTab] = useState<SetupTab>(initialTab);
  const [status, setStatus] = useState<SystemSetupStatus | null>(null);
  const [policyVersions, setPolicyVersions] = useState<{ sales: SalesSetupConfig[]; customerCare: CustomerCareSetupConfig[] }>({ sales: [], customerCare: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [nextStatus, configurationState] = await Promise.all([fetchSystemSetupStatus(), fetchOperationalConfigurationState()]);
      setStatus(nextStatus); setPolicyVersions(configurationState.policyVersions); onSetupStatusChange?.(nextStatus);
    } catch (loadError: any) { setError(loadError?.message || 'Không tải được trạng thái khởi tạo.'); }
    finally { setLoading(false); }
  }, [onSetupStatusChange]);
  useEffect(() => { load(); }, [load]);
  const completed = useMemo(() => status?.checks.filter(item => item.complete).length || 0, [status]);

  return <div className="space-y-5">
    <div className="rounded-2xl bg-gradient-to-r from-zinc-950 to-zinc-800 p-5 text-white shadow-lg">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><div className="mb-2 flex items-center gap-2 text-orange-400"><Settings2 className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-widest">Thiết lập tập trung</span></div><h1 className="text-2xl font-black">Cài đặt & Khởi tạo hệ thống</h1><p className="mt-1 text-sm text-zinc-300">Mọi dữ liệu nghiệp vụ phải được tạo tại đây, không lấy giá trị mặc định trong mã nguồn.</p></div><div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3">{status?.complete ? <CheckCircle2 className="h-7 w-7 text-emerald-400" /> : <CircleAlert className="h-7 w-7 text-amber-400" />}<div><p className="text-xs text-zinc-300">Tiến độ khởi tạo</p><p className="font-black">{completed}/{status?.checks.length || 8} hạng mục</p></div><button onClick={load} className="ml-2 rounded-lg p-2 hover:bg-white/10"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div></div>
    </div>
    <div className="flex gap-2 overflow-x-auto pb-1">{tabs.map(tab => { const Icon = tab.icon; return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold ${activeTab === tab.id ? 'bg-orange-600 text-white shadow' : 'border border-zinc-200 bg-white text-zinc-600'}`}><Icon className="h-4 w-4" />{tab.label}</button>; })}</div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {activeTab === 'overview' && <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Checklist bắt buộc trước vận hành</h2><p className="mb-4 mt-1 text-sm text-zinc-500">Hệ thống chỉ sẵn sàng khi tất cả hạng mục đều hoàn tất.</p><div className="grid gap-3 md:grid-cols-2">{status?.checks.map(check => <button key={check.id} onClick={() => setActiveTab(TAB_BY_CHECK[check.id])} className="flex items-center gap-3 rounded-xl border p-4 text-left hover:border-orange-400"><span className={`rounded-full p-2 ${check.complete ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{check.complete ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><p className="font-black text-zinc-900">{check.label}</p><p className="text-xs text-zinc-500">{check.detail}</p></div><ChevronRight className="h-4 w-4 text-zinc-400" /></button>)}</div></section>}
    {activeTab === 'organization' && <StoreSettingsView
      {...storeProps}
      onAddBranch={async value => { await storeProps.onAddBranch(value); await load(); }}
      onUpdateBranch={async value => { await storeProps.onUpdateBranch(value); await load(); }}
      onDeleteBranch={async value => { await storeProps.onDeleteBranch(value); await load(); }}
      onAddWarehouse={async value => { await storeProps.onAddWarehouse(value); await load(); }}
      onUpdateWarehouse={async value => { await storeProps.onUpdateWarehouse(value); await load(); }}
      onDeleteWarehouse={async value => { await storeProps.onDeleteWarehouse(value); await load(); }}
      onSaveSettings={async value => { await storeProps.onSaveSettings(value); await load(); }}
      onNavigateToCashbook={(branchId) => { if (branchId) sessionStorage.setItem('phonehouse_target_branch', branchId); onNavigate('funds'); }}
    />}
    {activeTab === 'finance' && <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><h2 className="text-lg font-black">Tài khoản tài chính theo chi nhánh</h2><p className="text-sm text-zinc-500">Mỗi quỹ tiền mặt và tài khoản ngân hàng bắt buộc có branchId.</p></div><button onClick={() => onNavigate('funds')} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white">Mở thiết lập tài khoản & Sổ quỹ</button></div><div className="mt-5 grid gap-3 md:grid-cols-2">{storeProps.branches.filter(b => b.isActive !== false).map(branch => { const accounts = (storeProps.funds || []).filter(f => f.branchId === branch.id && (f as any).isArchived !== true); return <div key={branch.id} className="rounded-xl border p-4"><div className="flex items-center gap-2 font-black"><Building2 className="h-4 w-4 text-orange-600" />{branch.name}</div><p className="mt-2 text-sm text-zinc-600">{accounts.length ? `${accounts.length} tài khoản đã định danh` : 'Chưa tạo tài khoản'}</p></div>; })}</div></section>}
    {activeTab === 'sop' && <SOPManagementView branches={storeProps.branches} staffMembers={storeProps.staffMembers} onNotify={() => { void load(); }} />}
    {activeTab === 'technicalTasks' && <TechnicalTaskPanel onSaved={load} />}
    {activeTab === 'sales' && <OperationalPolicyPanel kind="sales" policies={policyVersions.sales} onSaved={load} />}
    {activeTab === 'customerCare' && <OperationalPolicyPanel kind="customerCare" policies={policyVersions.customerCare} onSaved={load} />}
  </div>;
};
