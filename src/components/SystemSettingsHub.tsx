import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Banknote,
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Headphones,
  Globe2,
  Loader2,
  Tags,
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
  RetailPricingSetupConfig,
  SalesSetupConfig,
  SystemSetupCheck,
  SystemSetupStatus,
  TechnicalTaskTypeConfig,
  UserAccount
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
import { deviceModelVariantKey } from '../utils/retailPricing';
import { QuickQuoteRequestsView } from './QuickQuoteRequestsView';

type SetupTab = 'overview' | 'telegram' | 'organization' | 'finance' | 'sop' | 'technicalTasks' | 'sales' | 'retailPricing' | 'customerCare' | 'phoneHouseCare';

interface SystemSettingsHubProps extends Omit<StoreSettingsViewProps, 'initialTab'> {
  initialTab?: SetupTab;
  onNavigate: (tab: string) => void;
  onSetupStatusChange?: (status: SystemSetupStatus) => void;
  currentUser?: UserAccount | null;
}

const TAB_BY_CHECK: Record<SystemSetupCheck['id'], SetupTab> = {
  company: 'organization',
  branches: 'organization',
  warehouses: 'organization',
  funds: 'finance',
  sop: 'sop',
  technicalTasks: 'technicalTasks',
  sales: 'sales',
  retailPricing: 'retailPricing',
  customerCare: 'customerCare'
};

const tabs: Array<{ id: SetupTab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Tổng quan', icon: BadgeCheck },
  { id: 'telegram', label: 'Bot Telegram', icon: Bot },
  { id: 'organization', label: 'Doanh nghiệp, Chi nhánh & Kho', icon: Building2 },
  { id: 'finance', label: 'Tài khoản tài chính', icon: Banknote },
  { id: 'sop', label: 'SOP', icon: ClipboardCheck },
  { id: 'technicalTasks', label: 'Task kỹ thuật', icon: Wrench },
  { id: 'sales', label: 'Sales', icon: ShoppingBag },
  { id: 'retailPricing', label: 'Giá bán lẻ', icon: Tags },
  { id: 'customerCare', label: 'CSKH', icon: Headphones },
  { id: 'phoneHouseCare', label: 'PhoneHouse Care · Miniweb', icon: Globe2 }
];

const emptySales = (): SalesSetupConfig => ({
  id: 'sales', policyId: '', name: '', version: '', effectiveFrom: '', effectiveTo: '', deviceProfitPercent: Number.NaN,
  accessoryProfitPercent: Number.NaN, onlineSaleSplitPercent: Number.NaN,
  maxDiscountPercent: Number.NaN, defaultMonthlyTarget: Number.NaN, commissionTags: [], isActive: false
});

const emptyCare = (): CustomerCareSetupConfig => ({
  id: 'customerCare', policyId: '', name: '', version: '', effectiveFrom: '', effectiveTo: '', firstResponseMinutes: Number.NaN,
  followUpAttempts: Number.NaN, followUpDays: [], completedFollowUpCommission: Number.NaN, requireEvidence: false,
  requireQaApproval: false, isActive: false
});

const emptyRetailPricing = (): RetailPricingSetupConfig => ({
  id: 'retailPricing', policyId: '', name: '', version: '', effectiveFrom: '', effectiveTo: '', entries: [], isActive: false
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
      const policyToSave = draft.policyId ? draft : {
        ...draft,
        policyId: `${kind === 'sales' ? 'SALE' : 'CSKH'}_DRAFT_${Date.now()}`
      };
      setDraft(policyToSave);
      await saveOperationalConfig(kind, policyToSave);
      await onSaved();
      setMessage(policyToSave.isActive ? 'Đã lưu và bật chính sách.' : 'Đã lưu bản nháp.');
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
    if (!policy.isActive) return { label: 'Bản nháp / Đã tắt', className: 'bg-zinc-100 text-zinc-500' };
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
        <button type="button" onClick={() => { setDraft(createEmpty()); setMessage(''); }} className="shrink-0 rounded-xl bg-[#ff4b16] px-3 py-2 text-xs font-black text-white hover:bg-[#e94112]">+ Tạo mới</button>
      </div>
      <div className="space-y-2">
        {policies.length === 0 && <div className="rounded-xl border border-dashed p-4 text-sm text-zinc-500">Chưa có phiên bản nào.</div>}
        {policies.map(policy => { const status = statusOf(policy); return <button key={policy.policyId} type="button" onClick={() => { setDraft(policy); setMessage(''); }} className={`w-full rounded-xl border p-3 text-left ${draft.policyId === policy.policyId ? 'border-orange-500 bg-orange-50' : 'border-zinc-200 hover:border-orange-300'}`}>
          <div className="flex items-start justify-between gap-2"><div><p className="font-black text-zinc-900">{policy.name || 'Chính sách chưa đặt tên'}</p><p className="text-xs text-zinc-500">{policy.policyId} · {policy.version || 'Chưa có phiên bản'}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${status.className}`}>{status.label}</span></div>
          <p className="mt-2 text-xs text-zinc-600">{policy.effectiveFrom || 'Chưa đặt ngày'} → {policy.effectiveTo || 'Không giới hạn'}</p>
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
          <button type="button" onClick={() => setDraft({ ...sales, commissionTags: [...(sales.commissionTags || []), { id: '', name: '', appliesTo: 'DEVICE', calculationType: 'FLAT', value: Number.NaN, description: '', isActive: true }] })} className="rounded-xl bg-[#ff4b16] px-3 py-2 text-xs font-black text-white hover:bg-[#e94112]">+ Thêm tag</button>
        </div>
        <div className="mt-4 space-y-3">
          {(sales.commissionTags || []).length === 0 && <div className="rounded-xl border border-dashed border-orange-300 bg-white p-4 text-sm text-orange-800">Chưa có tag. Ví dụ tên: Máy full BH, Máy trần, Máy bóc; mã do Admin tự đặt.</div>}
          {(sales.commissionTags || []).map((tag, index) => {
            const tags = sales.commissionTags || [];
            const updateTag = (value: typeof tag) => setDraft({ ...sales, commissionTags: tags.map((item, itemIndex) => itemIndex === index ? value : item) });
            return <div key={`commission-tag-${index}`} className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-3 md:grid-cols-2 xl:grid-cols-6">
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
      <p className="mt-1 text-xs text-zinc-500">Có thể lưu bản nháp khi chưa nhập đủ. Chỉ khi bật áp dụng, hệ thống mới yêu cầu đầy đủ tên, thời gian, thông số và ít nhất một Tag đang dùng.</p>
      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu phiên bản
        </button>
        {message && <span className="text-sm text-zinc-600">{message}</span>}
      </div>
    </section></div>
  );
}

function RetailPricingPanel({ policies, branches, devices = [], products = [], onSaved }: {
  policies: RetailPricingSetupConfig[];
  branches: StoreSettingsViewProps['branches'];
  devices?: NonNullable<StoreSettingsViewProps['devices']>;
  products?: NonNullable<StoreSettingsViewProps['products']>;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<RetailPricingSetupConfig>(emptyRetailPricing());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const editing = policies.some(policy => policy.policyId === draft.policyId);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

  const catalog = useMemo(() => {
    const variants = new Map<string, { itemName: string; retailPrice: number }>();
    devices.forEach(device => {
      const itemKey = deviceModelVariantKey(device);
      if (!variants.has(itemKey)) variants.set(itemKey, {
        itemName: [device.model, device.storage, device.condition].filter(Boolean).join(' · '),
        retailPrice: Number(device.sellPrice || 0)
      });
    });
    return [
      ...[...variants.entries()].map(([itemKey, item]) => ({ itemType: 'DEVICE' as const, matchType: 'MODEL_VARIANT' as const, itemKey, ...item })),
      ...products.filter(product => product.status !== 'inactive').map(product => ({
        itemType: 'ACCESSORY' as const,
        matchType: 'ITEM_ID' as const,
        itemKey: product.id,
        itemName: `${product.name}${product.sku ? ` · ${product.sku}` : ''}`,
        retailPrice: Number(product.sellPrice || 0)
      }))
    ];
  }, [devices, products]);

  useEffect(() => {
    setDraft(current => policies.find(policy => policy.policyId === current.policyId) || policies[0] || emptyRetailPricing());
  }, [policies]);

  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const policy = draft.policyId ? draft : { ...draft, policyId: `RETAIL_DRAFT_${Date.now()}` };
      setDraft(policy);
      await saveOperationalConfig('retailPricing', policy);
      await onSaved();
      setMessage(policy.isActive ? 'Đã lưu và lên lịch bảng giá.' : 'Đã lưu bản nháp bảng giá.');
    } catch (error: any) { setMessage(error?.message || 'Không thể lưu bảng giá.'); }
    finally { setSaving(false); }
  };
  const addEntry = () => {
    const item = catalog[0];
    setDraft(current => ({ ...current, entries: [...current.entries, {
      id: `PRICE_${Date.now()}`,
      itemType: item?.itemType || 'DEVICE',
      matchType: item?.matchType || 'MODEL_VARIANT',
      itemKey: item?.itemKey || '',
      itemName: item?.itemName || '',
      branchId: 'ALL',
      retailPrice: item?.retailPrice || Number.NaN,
      minimumPrice: Number.NaN,
      isActive: true
    }] }));
  };

  return <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">Bảng giá bán lẻ</h2><p className="mt-1 text-sm text-zinc-500">Tạo nhiều bảng giá theo khoảng thời gian, không ghi cứng giá vào mã nguồn.</p></div><button type="button" onClick={() => { setDraft(emptyRetailPricing()); setMessage(''); }} className="shrink-0 rounded-xl bg-[#ff4b16] px-3 py-2 text-xs font-black text-white hover:bg-[#e94112]">+ Tạo mới</button></div>
      <div className="space-y-2">{policies.length === 0 && <div className="rounded-xl border border-dashed p-4 text-sm text-zinc-500">Chưa có bảng giá nào.</div>}{policies.map(policy => {
        const activeNow = policy.isActive && policy.effectiveFrom <= today && (!policy.effectiveTo || policy.effectiveTo >= today);
        return <button key={policy.policyId} type="button" onClick={() => { setDraft(policy); setMessage(''); }} className={`w-full rounded-xl border p-3 text-left ${draft.policyId === policy.policyId ? 'border-orange-500 bg-orange-50' : 'border-zinc-200 hover:border-orange-300'}`}><div className="flex items-start justify-between gap-2"><div><p className="font-black">{policy.name || 'Bảng giá chưa đặt tên'}</p><p className="text-xs text-zinc-500">{policy.version || 'Chưa có phiên bản'} · {policy.entries?.filter(entry => entry.isActive).length || 0} dòng</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${activeNow ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{activeNow ? 'Đang áp dụng' : policy.isActive ? 'Đã lên lịch' : 'Bản nháp / Đã tắt'}</span></div><p className="mt-2 text-xs text-zinc-600">{policy.effectiveFrom || 'Chưa đặt ngày'} → {policy.effectiveTo || 'Không giới hạn'}</p></button>;
      })}</div>
    </section>
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold"><span>Mã bảng giá</span><input disabled={editing} value={draft.policyId} onChange={event => setDraft({ ...draft, policyId: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} placeholder="GIA_LE_2026_Q4" className="w-full rounded-xl border px-3 py-2.5 disabled:bg-zinc-100" /></label>
        <label className="space-y-1 text-sm font-semibold"><span>Tên bảng giá</span><input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Giá bán lẻ quý 4/2026" className="w-full rounded-xl border px-3 py-2.5" /></label>
        <label className="space-y-1 text-sm font-semibold"><span>Hiệu lực từ</span><input type="date" value={draft.effectiveFrom} onChange={event => setDraft({ ...draft, effectiveFrom: event.target.value })} className="w-full rounded-xl border px-3 py-2.5" /></label>
        <label className="space-y-1 text-sm font-semibold"><span>Hiệu lực đến</span><input type="date" value={draft.effectiveTo || ''} onChange={event => setDraft({ ...draft, effectiveTo: event.target.value })} className="w-full rounded-xl border px-3 py-2.5" /></label>
        <label className="space-y-1 text-sm font-semibold"><span>Phiên bản</span><input value={draft.version} onChange={event => setDraft({ ...draft, version: event.target.value })} placeholder="2026.10" className="w-full rounded-xl border px-3 py-2.5" /></label>
        <label className="flex items-end gap-2 pb-2 text-sm font-bold"><input type="checkbox" checked={draft.isActive} onChange={event => setDraft({ ...draft, isActive: event.target.checked })} /> Bật để xét áp dụng theo ngày</label>
      </div>
      <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50/30 p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="font-black">Giá theo mặt hàng và chi nhánh</h3><p className="text-xs text-zinc-600">POS tự lấy bảng đang hiệu lực. Nhân viên vẫn có thể sửa giá trên phiếu và phải ghi lý do.</p></div><button type="button" onClick={addEntry} className="rounded-xl bg-[#ff4b16] px-3 py-2 text-xs font-black text-white hover:bg-[#e94112]">+ Thêm dòng giá</button></div>
        <div className="mt-4 space-y-3">{draft.entries.length === 0 && <div className="rounded-xl border border-dashed bg-white p-4 text-sm text-zinc-500">Chưa có dòng giá. Hãy thêm model máy hoặc phụ kiện từ danh mục hiện tại.</div>}{draft.entries.map((entry, index) => {
          const update = (value: typeof entry) => setDraft({ ...draft, entries: draft.entries.map((item, itemIndex) => itemIndex === index ? value : item) });
          const selectedCatalogValue = `${entry.itemType}::${entry.matchType}::${encodeURIComponent(entry.itemKey)}`;
          return <div key={entry.id || index} className="grid gap-3 rounded-xl border bg-white p-3 md:grid-cols-2 xl:grid-cols-7">
            <label className="space-y-1 text-xs font-bold md:col-span-2"><span>Mặt hàng</span><select value={selectedCatalogValue} onChange={event => { const [itemType, matchType, encodedKey] = event.target.value.split('::'); const itemKey = decodeURIComponent(encodedKey); const catalogItem = catalog.find(item => item.itemType === itemType && item.matchType === matchType && item.itemKey === itemKey); update({ ...entry, itemType: itemType as any, matchType: matchType as any, itemKey, itemName: catalogItem?.itemName || itemKey, retailPrice: catalogItem?.retailPrice || entry.retailPrice }); }} className="w-full rounded-lg border px-2.5 py-2"><option value={selectedCatalogValue}>{entry.itemName || entry.itemKey || 'Chọn mặt hàng'}</option>{catalog.filter(item => `${item.itemType}::${item.matchType}::${encodeURIComponent(item.itemKey)}` !== selectedCatalogValue).map(item => <option key={`${item.itemType}-${item.itemKey}`} value={`${item.itemType}::${item.matchType}::${encodeURIComponent(item.itemKey)}`}>{item.itemType === 'DEVICE' ? 'Máy' : 'Phụ kiện'} · {item.itemName}</option>)}</select></label>
            <label className="space-y-1 text-xs font-bold"><span>Chi nhánh</span><select value={entry.branchId} onChange={event => update({ ...entry, branchId: event.target.value })} className="w-full rounded-lg border px-2.5 py-2"><option value="ALL">Toàn hệ thống</option>{branches.filter(branch => branch.isActive !== false).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <NumberField label="Giá bán lẻ" value={entry.retailPrice} onChange={value => update({ ...entry, retailPrice: value })} />
            <NumberField label="Giá sàn" value={entry.minimumPrice ?? Number.NaN} onChange={value => update({ ...entry, minimumPrice: value })} />
            <label className="flex items-end gap-2 pb-2 text-xs font-bold"><input type="checkbox" checked={entry.isActive} onChange={event => update({ ...entry, isActive: event.target.checked })} /> Đang dùng</label>
            <div className="flex items-end justify-end"><button type="button" onClick={() => setDraft({ ...draft, entries: draft.entries.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Xóa dòng"><Trash2 className="h-4 w-4" /></button></div>
          </div>;
        })}</div>
      </div>
      <p className="mt-3 text-xs text-zinc-500">Có thể lưu bản nháp chưa đầy đủ. Khi bật áp dụng, các bảng giá không được chồng lấn thời gian và mỗi dòng đang dùng phải có giá hợp lệ.</p>
      <div className="mt-5 flex items-center gap-3"><button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu bảng giá</button>{message && <span className="text-sm text-zinc-600">{message}</span>}</div>
    </section>
  </div>;
}

type TaskPartTemplate = NonNullable<TechnicalTaskTypeConfig['requiredPartTemplates']>[number];

const emptyPartTemplate = (): TaskPartTemplate => ({
  category: '',
  sku: '',
  quantity: 1,
  maxQuantity: 1,
  allowSubstitution: true
});

const normalizePartTemplates = (templates: TaskPartTemplate[] = []): TaskPartTemplate[] => templates
  .reduce<TaskPartTemplate[]>((normalized, template) => {
    const category = String(template.category || '').trim().toUpperCase();
    const sku = String(template.sku || '').trim().toUpperCase();
    const partId = String(template.partId || '').trim();
    const maxQuantity = Number(template.maxQuantity ?? template.quantity);
    if (!category && !sku && !partId) return normalized;
    if (!Number.isFinite(maxQuantity) || maxQuantity <= 0) {
      throw new Error('Số lượng tối đa của linh kiện phải lớn hơn 0.');
    }
    normalized.push({
      ...(category ? { category } : {}),
      ...(sku ? { sku } : {}),
      ...(partId ? { partId } : {}),
      quantity: maxQuantity,
      maxQuantity,
      allowSubstitution: template.allowSubstitution === true
    });
    return normalized;
  }, []);

const INTAKE_ISSUE_OPTIONS = [
  'Nguồn / Mất Nguồn', 'Màn Hình / Cảm Ứng', 'Pin / Phù Pin', 'Face ID / Camera',
  'Sóng / Wifi', 'Loa / Mic', 'Ép Kính / Thay Lưng', 'Mainboard / IC Sạc', 'Khác'
];

const PART_GROUP_OPTIONS = ['PIN', 'MAN_HINH', 'CAMERA', 'CAP_SAC', 'LOA', 'MIC', 'FACE', 'VO', 'KINH', 'MAINBOARD', 'IC', 'ANTEN', 'RUNG', 'KHAC'];

const ISSUE_PART_GROUPS: Record<string, string[]> = {
  'Pin / Phù Pin': ['PIN'],
  'Màn Hình / Cảm Ứng': ['MAN_HINH'],
  'Face ID / Camera': ['FACE', 'CAMERA'],
  'Sóng / Wifi': ['ANTEN', 'IC'],
  'Loa / Mic': ['LOA', 'MIC'],
  'Ép Kính / Thay Lưng': ['KINH', 'VO'],
  'Nguồn / Mất Nguồn': ['MAINBOARD', 'IC'],
  'Mainboard / IC Sạc': ['MAINBOARD', 'IC', 'CAP_SAC'],
  'Khác': []
};

const suggestedPartGroups = (issueTypes: string[] = []) => [...new Set(issueTypes.flatMap(issue => ISSUE_PART_GROUPS[issue] || []))];

const emptyTask = (): TechnicalTaskTypeConfig => ({
  id: '', taskType: '', name: '', taskCode: '', baseCommission: Number.NaN,
  laborCostToDevice: Number.NaN, capitalizeLaborCost: true, reworkCommissionPolicy: 'NO_EXTRA_COMMISSION', requiredEvidenceTypes: ['AFTER_PHOTO', 'RESULT_NOTES'],
  quoteGate: 'APPROVAL_REQUIRED',
  requiredPartTemplates: [], intakeIssueTypes: [],
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
      const normalized = {
        ...draft,
        id: draft.taskType,
        taskType: draft.taskType.trim().toUpperCase(),
        taskCode: draft.taskCode.trim().toUpperCase(),
        requiredPartTemplates: normalizePartTemplates(draft.requiredPartTemplates),
        intakeIssueTypes: [...new Set((draft.intakeIssueTypes || []).map(value => String(value).trim()).filter(Boolean))]
      };
      await saveTechnicalTaskSetting(normalized);
      await Promise.all([load(), onSaved()]);
      setDraft(emptyTask());
      setMessage('Đã lưu task kỹ thuật.');
    } catch (error: any) { setMessage(error?.message || 'Không thể lưu task.'); }
    finally { setSaving(false); }
  };
  const addPartGroup = (category: string) => setDraft(current => {
    const currentRules = current.requiredPartTemplates || [];
    if (currentRules.some(rule => String(rule.category || '').toUpperCase() === category)) return current;
    return { ...current, requiredPartTemplates: [...currentRules, { ...emptyPartTemplate(), category }] };
  });
  const applyIssueSuggestions = () => suggestedPartGroups(draft.intakeIssueTypes || []).forEach(addPartGroup);

  return <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">Task & hoa hồng kỹ thuật</h2><p className="text-sm text-zinc-500">Mỗi task phải được khai báo trước khi điều chuyển máy cho KTV.</p></div><button onClick={() => setDraft(emptyTask())} className="rounded-lg border px-3 py-2 text-xs font-bold">Tạo mới</button></div>
      <div className="space-y-2">{items.length === 0 && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Chưa có task nào. Hệ thống sẽ không tự tạo task mặc định.</div>}{items.map(item => <button key={item.taskType} onClick={() => setDraft(item)} className="flex w-full items-center justify-between rounded-xl border p-3 text-left hover:border-orange-400"><div><p className="font-bold">{item.name}</p><p className="text-xs text-zinc-500">{item.taskCode} • {item.baseCommission.toLocaleString('vi-VN')}đ</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${item.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{item.isActive ? 'Đang dùng' : 'Tạm ngưng'}</span></button>)}</div>
    </section>
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-black">{editing ? 'Chỉnh sửa task' : 'Tạo task mới'}</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold"><span>Mã công việc</span><input disabled={editing} value={draft.taskType} onChange={e => setDraft({ ...draft, taskType: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} placeholder="THAY_PIN" className="w-full rounded-xl border px-3 py-2.5 disabled:bg-zinc-100" /></label>
        <label className="space-y-1 text-sm font-semibold"><span>Mã nội bộ</span><input value={draft.taskCode} onChange={e => setDraft({ ...draft, taskCode: e.target.value })} className="w-full rounded-xl border px-3 py-2.5" /></label>
        <label className="space-y-1 text-sm font-semibold md:col-span-2"><span>Tên công việc</span><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="w-full rounded-xl border px-3 py-2.5" /></label>
        <NumberField label="Hoa hồng trả KTV" value={draft.baseCommission} onChange={value => setDraft({ ...draft, baseCommission: value })} />
        <NumberField label="Công tính vào giá vốn máy" value={draft.laborCostToDevice ?? Number.NaN} onChange={value => setDraft({ ...draft, laborCostToDevice: value })} />
        <label className="space-y-1 text-sm font-semibold"><span>Phiên bản</span><input value={draft.version} onChange={e => setDraft({ ...draft, version: e.target.value })} className="w-full rounded-xl border px-3 py-2.5" /></label>
        <label className="space-y-1 text-sm font-semibold"><span>Điều kiện báo giá</span><select value={draft.quoteGate || 'APPROVAL_REQUIRED'} onChange={e => setDraft({ ...draft, quoteGate: e.target.value as TechnicalTaskTypeConfig['quoteGate'] })} className="w-full rounded-xl border px-3 py-2.5"><option value="APPROVAL_REQUIRED">Phải duyệt giá trước khi làm</option><option value="DIAGNOSIS_ALLOWED">Được chẩn đoán trước</option><option value="NOT_APPLICABLE">Không áp dụng báo giá</option></select></label>
        <NumberField label="SLA thường (giờ)" value={draft.normalSlaHours} onChange={value => setDraft({ ...draft, normalSlaHours: value })} />
        <NumberField label="SLA ưu tiên (giờ)" value={draft.prioritySlaHours ?? Number.NaN} onChange={value => setDraft({ ...draft, prioritySlaHours: value })} />
        <NumberField label="SLA khẩn (giờ)" value={draft.urgentSlaHours} onChange={value => setDraft({ ...draft, urgentSlaHours: value })} />
        <NumberField label="Hệ số thường" value={draft.priorityMultiplier.NORMAL} onChange={value => setDraft({ ...draft, priorityMultiplier: { ...draft.priorityMultiplier, NORMAL: value } })} />
        <NumberField label="Hệ số ưu tiên" value={draft.priorityMultiplier.PRIORITY} onChange={value => setDraft({ ...draft, priorityMultiplier: { ...draft.priorityMultiplier, PRIORITY: value } })} />
        <NumberField label="Hệ số khẩn" value={draft.priorityMultiplier.URGENT} onChange={value => setDraft({ ...draft, priorityMultiplier: { ...draft.priorityMultiplier, URGENT: value } })} />
      </div>
      <section className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
        <div className="flex flex-col gap-1"><h4 className="font-black text-zinc-900">1. Nhóm lỗi nhận máy</h4><p className="text-xs text-zinc-600">Chọn nhóm lỗi để phiếu tiếp nhận tự gợi ý đúng công việc. Có thể chọn nhiều nhóm.</p></div>
        <div className="mt-3 flex flex-wrap gap-2">{INTAKE_ISSUE_OPTIONS.map(issue => { const checked = (draft.intakeIssueTypes || []).includes(issue as any); return <label key={issue} className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-bold ${checked ? 'border-[#ff4b16] bg-[#ff4b16] text-white' : 'border-orange-200 bg-white text-orange-900'}`}><input className="sr-only" type="checkbox" checked={checked} onChange={event => setDraft(current => ({ ...current, intakeIssueTypes: event.target.checked ? [...new Set([...(current.intakeIssueTypes || []), issue as any])] : (current.intakeIssueTypes || []).filter(value => value !== issue) }))} />{issue}</label>; })}</div>
        {(draft.intakeIssueTypes || []).length > 0 && <button type="button" onClick={applyIssueSuggestions} className="mt-3 rounded-xl border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-800">Gợi ý nhóm linh kiện theo lỗi đã chọn</button>}
      </section>
      <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h4 className="font-black text-zinc-900">2. Linh kiện đi kèm</h4><p className="mt-1 max-w-2xl text-xs text-zinc-600">KTV chỉ được xuất linh kiện đúng nhóm đã chọn. Ví dụ <strong>Thay pin → PIN</strong>; xuất màn hình sẽ bị chặn và cần Kho/Admin duyệt.</p></div><button type="button" onClick={() => setDraft({ ...draft, requiredPartTemplates: [...(draft.requiredPartTemplates || []), emptyPartTemplate()] })} className="shrink-0 rounded-xl bg-[#ff4b16] px-3 py-2 text-xs font-black text-white hover:bg-[#e94112]">+ Thêm nhóm</button></div>
        <div className="mt-3 flex flex-wrap gap-2">{PART_GROUP_OPTIONS.map(category => <button type="button" key={category} onClick={() => addPartGroup(category)} className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-blue-800 hover:border-blue-500">+ {category}</button>)}</div>
        <div className="mt-4 space-y-3">
          {(draft.requiredPartTemplates || []).length === 0 && <div className="rounded-xl border border-dashed border-blue-200 bg-white/70 p-3 text-sm text-blue-900">Chưa khai báo linh kiện. Task này sẽ không cho KTV tự xuất bất kỳ linh kiện nào cho đến khi có quy tắc hoặc được Kho/Admin duyệt ngoại lệ.</div>}
          {(draft.requiredPartTemplates || []).map((rule, index) => {
            const updateRule = (nextRule: TaskPartTemplate) => setDraft({ ...draft, requiredPartTemplates: (draft.requiredPartTemplates || []).map((item, itemIndex) => itemIndex === index ? nextRule : item) });
            const limit = Number(rule.maxQuantity ?? rule.quantity ?? 1);
            return <div key={`${rule.category || rule.sku || rule.partId || 'part'}-${index}`} className="grid gap-3 rounded-xl border bg-white p-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_150px_1fr_auto]">
              <label className="space-y-1 text-xs font-bold"><span>Nhóm linh kiện</span><input list="technical-part-groups" value={rule.category || ''} onChange={event => updateRule({ ...rule, category: event.target.value.toUpperCase() })} placeholder="Chọn hoặc nhập nhóm" className="w-full rounded-lg border px-2.5 py-2" /></label>
              <label className="space-y-1 text-xs font-bold"><span>SKU cụ thể (tuỳ chọn)</span><input value={rule.sku || ''} onChange={event => updateRule({ ...rule, sku: event.target.value.toUpperCase() })} placeholder="PIN-IPHONE-15-PRO" className="w-full rounded-lg border px-2.5 py-2" /></label>
              <NumberField label="Tối đa / task" value={limit} onChange={value => updateRule({ ...rule, quantity: value, maxQuantity: value })} />
              <label className="flex items-end gap-2 pb-2 text-xs font-bold"><input type="checkbox" checked={rule.allowSubstitution === true} onChange={event => updateRule({ ...rule, allowSubstitution: event.target.checked })} /> Cho phép SKU thay thế cùng nhóm</label>
              <div className="flex items-end justify-end"><button type="button" onClick={() => setDraft({ ...draft, requiredPartTemplates: (draft.requiredPartTemplates || []).filter((_, itemIndex) => itemIndex !== index) })} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Xóa quy tắc"><Trash2 className="h-4 w-4" /></button></div>
              {rule.partId && <p className="text-[11px] text-zinc-400 md:col-span-2 xl:col-span-5">Mã linh kiện cũ đang được giữ để tương thích: {rule.partId}</p>}
            </div>;
          })}
        </div>
        <datalist id="technical-part-groups">{PART_GROUP_OPTIONS.map(category => <option key={category} value={category} />)}</datalist>
      </section>
      <div className="mt-4 flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.requiresQc} onChange={e => setDraft({ ...draft, requiresQc: e.target.checked })} /> Bắt buộc KCS</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.capitalizeLaborCost !== false} onChange={e => setDraft({ ...draft, capitalizeLaborCost: e.target.checked })} /> Cộng nhân công vào giá vốn máy</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={(draft.requiredEvidenceTypes || []).includes('AFTER_PHOTO')} onChange={e => setDraft({ ...draft, requiredEvidenceTypes: e.target.checked ? [...new Set([...(draft.requiredEvidenceTypes || []), 'AFTER_PHOTO' as const, 'RESULT_NOTES' as const])] : (draft.requiredEvidenceTypes || []).filter(item => item !== 'AFTER_PHOTO') })} /> Bắt buộc ảnh sau sửa</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.isActive} onChange={e => setDraft({ ...draft, isActive: e.target.checked })} /> Kích hoạt</label></div>
      <div className="mt-5 flex items-center gap-3"><button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu task</button>{message && <span className="text-sm text-zinc-600">{message}</span>}</div>
    </section>
  </div>;
}

export const SystemSettingsHub: React.FC<SystemSettingsHubProps> = ({ initialTab = 'overview', onNavigate, onSetupStatusChange, ...storeProps }) => {
  const [activeTab, setActiveTab] = useState<SetupTab>(initialTab);
  const [status, setStatus] = useState<SystemSetupStatus | null>(null);
  const [policyVersions, setPolicyVersions] = useState<{ sales: SalesSetupConfig[]; customerCare: CustomerCareSetupConfig[]; retailPricing: RetailPricingSetupConfig[] }>({ sales: [], customerCare: [], retailPricing: [] });
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
  const incompleteChecks = useMemo(() => status?.checks.filter(item => !item.complete) || [], [status]);

  return <div className="space-y-5">
    <div className="rounded-2xl bg-gradient-to-r from-zinc-950 to-zinc-800 p-5 text-white shadow-lg">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><div className="mb-2 flex items-center gap-2 text-orange-400"><Settings2 className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-widest">Thiết lập tập trung</span></div><h1 className="text-xl font-black tracking-tight sm:text-2xl">Cài đặt & Khởi tạo hệ thống</h1><p className="mt-1 text-sm text-zinc-300">Mọi dữ liệu nghiệp vụ phải được tạo tại đây, không lấy giá trị mặc định trong mã nguồn.</p></div><div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3">{status?.complete ? <CheckCircle2 className="h-7 w-7 text-emerald-400" /> : <CircleAlert className="h-7 w-7 text-amber-400" />}<div><p className="text-xs text-zinc-300">Tiến độ khởi tạo</p><p className="font-black">{completed}/{status?.checks.length || 8} hạng mục</p></div><button onClick={load} className="ml-2 rounded-lg p-2 hover:bg-white/10"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div></div>
    </div>
    <div className="flex gap-2 overflow-x-auto pb-1">{tabs.map(tab => { const Icon = tab.icon; return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold ${activeTab === tab.id ? 'bg-orange-600 text-white shadow' : 'border border-zinc-200 bg-white text-zinc-600'}`}><Icon className="h-4 w-4" />{tab.label}</button>; })}</div>
    {incompleteChecks.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-black text-amber-900">Hệ thống còn bị chặn bởi {incompleteChecks.length} hạng mục:</p><div className="mt-2 flex flex-wrap gap-2">{incompleteChecks.map(check => <button key={check.id} onClick={() => setActiveTab(TAB_BY_CHECK[check.id])} className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:border-orange-400">{check.label}: {check.detail}</button>)}</div></div>}
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {activeTab === 'overview' && <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Checklist bắt buộc trước vận hành</h2><p className="mb-4 mt-1 text-sm text-zinc-500">Hệ thống chỉ sẵn sàng khi tất cả hạng mục đều hoàn tất.</p><div className="grid gap-3 md:grid-cols-2">{status?.checks.map(check => <button key={check.id} onClick={() => setActiveTab(TAB_BY_CHECK[check.id])} className="flex items-center gap-3 rounded-xl border p-4 text-left hover:border-orange-400"><span className={`rounded-full p-2 ${check.complete ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{check.complete ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><p className="font-black text-zinc-900">{check.label}</p><p className="text-xs text-zinc-500">{check.detail}</p></div><ChevronRight className="h-4 w-4 text-zinc-400" /></button>)}</div></section>}
    {activeTab === 'organization' && <StoreSettingsView
      initialTab="branches"
      {...storeProps}
      onAddBranch={async value => { await storeProps.onAddBranch(value); await load(); }}
      onUpdateBranch={async value => { await storeProps.onUpdateBranch(value); await load(); }}
      onDeleteBranch={async value => { await storeProps.onDeleteBranch(value); await load(); }}
      onAddWarehouse={async value => { await storeProps.onAddWarehouse(value); await load(); }}
      onUpdateWarehouse={async value => { await storeProps.onUpdateWarehouse(value); await load(); }}
      onDeleteWarehouse={async value => { await storeProps.onDeleteWarehouse(value); await load(); }}
      onRestoreWarehouse={async value => { await storeProps.onRestoreWarehouse(value); await load(); }}
      onSaveSettings={async value => { await storeProps.onSaveSettings(value); await load(); }}
      onNavigateToCashbook={(branchId) => { if (branchId) sessionStorage.setItem('phonehouse_target_branch', branchId); onNavigate('funds'); }}
    />}
    {activeTab === 'telegram' && <StoreSettingsView
      initialTab="notifications"
      {...storeProps}
      onAddBranch={storeProps.onAddBranch}
      onUpdateBranch={storeProps.onUpdateBranch}
      onDeleteBranch={storeProps.onDeleteBranch}
      onAddWarehouse={storeProps.onAddWarehouse}
      onUpdateWarehouse={storeProps.onUpdateWarehouse}
      onDeleteWarehouse={storeProps.onDeleteWarehouse}
      onRestoreWarehouse={storeProps.onRestoreWarehouse}
      onSaveSettings={storeProps.onSaveSettings}
      onNavigateToCashbook={(branchId) => { if (branchId) sessionStorage.setItem('phonehouse_target_branch', branchId); onNavigate('funds'); }}
    />}
    {activeTab === 'finance' && <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><h2 className="text-lg font-black">Tài khoản tài chính theo chi nhánh</h2><p className="text-sm text-zinc-500">Mỗi quỹ tiền mặt và tài khoản ngân hàng bắt buộc có branchId.</p></div><button onClick={() => onNavigate('funds')} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white">Mở thiết lập tài khoản & Sổ quỹ</button></div><div className="mt-5 grid gap-3 md:grid-cols-2">{storeProps.branches.filter(b => b.isActive !== false).map(branch => { const accounts = (storeProps.funds || []).filter(f => f.branchId === branch.id && (f as any).isArchived !== true); return <div key={branch.id} className="rounded-xl border p-4"><div className="flex items-center gap-2 font-black"><Building2 className="h-4 w-4 text-orange-600" />{branch.name}</div><p className="mt-2 text-sm text-zinc-600">{accounts.length ? `${accounts.length} tài khoản đã định danh` : 'Chưa tạo tài khoản'}</p></div>; })}</div></section>}
    {activeTab === 'sop' && <SOPManagementView branches={storeProps.branches} staffMembers={storeProps.staffMembers} currentUser={storeProps.currentUser} onNotify={() => { void load(); }} />}
    {activeTab === 'technicalTasks' && <TechnicalTaskPanel onSaved={load} />}
    {activeTab === 'sales' && <OperationalPolicyPanel kind="sales" policies={policyVersions.sales} onSaved={load} />}
    {activeTab === 'retailPricing' && <RetailPricingPanel policies={policyVersions.retailPricing} branches={storeProps.branches} devices={storeProps.devices} products={storeProps.products} onSaved={load} />}
    {activeTab === 'customerCare' && <OperationalPolicyPanel kind="customerCare" policies={policyVersions.customerCare} onSaved={load} />}
    {activeTab === 'phoneHouseCare' && <QuickQuoteRequestsView currentUser={storeProps.currentUser} branches={storeProps.branches} initialMode="SETTINGS" settingsOnly />}
  </div>;
};
