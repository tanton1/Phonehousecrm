import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Camera, CheckCircle2, ChevronLeft, ChevronRight,
  ClipboardCheck, ImagePlus, Loader2, PackageCheck,
  Smartphone, UserRound, Wrench, X
} from 'lucide-react';
import {
  DeviceItem, StoreBranch, TechnicalTaskTypeConfig, UserAccount, WarehouseInfo, WarrantyTicket
} from '../../../types';
import { fetchInventoryTransferMetadata } from '../../../services/inventoryTransferApiClient';
import { requestAttachIntakeEvidence, requestCreateWorkOrder } from '../../../services/technicalApiClient';
import { isTechnicalImageFile, MAX_TECHNICAL_EVIDENCE_BYTES, uploadTechnicalEvidence } from '../../../services/technicalEvidenceService';
import { HelpHint } from '../../../components/HelpHint';

interface RepairIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: StoreBranch[];
  warehouses: WarehouseInfo[];
  devices: DeviceItem[];
  users: UserAccount[];
  currentUser?: UserAccount | null;
  onCreated?: (result: { workOrderId: string; code: string }) => Promise<void> | void;
}

type IntakeSource = 'RETAIL_REPAIR' | 'WARRANTY' | 'STORE_ESCALATION';
type IntakeStep = 1 | 2 | 3 | 4;
type Priority = 'NORMAL' | 'PRIORITY' | 'URGENT';

const issueTypes: WarrantyTicket['issueType'][] = [
  'Nguồn / Mất Nguồn', 'Màn Hình / Cảm Ứng', 'Pin / Phù Pin', 'Face ID / Camera',
  'Sóng / Wifi', 'Loa / Mic', 'Ép Kính / Thay Lưng', 'Mainboard / IC Sạc', 'Khác'
];
const technicianRoles = new Set(['TECHNICIAN', 'TECH', 'TECH_LEAD']);

const initialForm = () => ({
  source: 'RETAIL_REPAIR' as IntakeSource,
  branchId: '', sourceWarehouseId: '', destinationWarehouseId: '',
  customerName: '', phone: '', imei: '', model: '',
  issueType: 'Khác' as WarrantyTicket['issueType'], faultDescription: '',
  assigneeId: '', estimatedCost: 0, expectedReturnDate: '',
  deviceAppearance: '', accessoriesIncluded: '', icloudStatus: 'Chưa kiểm tra', unlockNote: '', notes: '', priority: 'NORMAL' as Priority
});

const taskHints: Record<WarrantyTicket['issueType'], string[]> = {
  'Pin / Phù Pin': ['PIN', 'BATTERY'],
  'Màn Hình / Cảm Ứng': ['MÀN', 'MAN', 'SCREEN', 'CẢM ỨNG'],
  'Face ID / Camera': ['FACE', 'CAMERA', 'CAM'],
  'Sóng / Wifi': ['SÓNG', 'WIFI', 'WI-FI', 'ANTEN'],
  'Loa / Mic': ['LOA', 'MIC', 'AUDIO'],
  'Ép Kính / Thay Lưng': ['KÍNH', 'KINH', 'LƯNG', 'LUNG', 'VỎ', 'VO'],
  'Nguồn / Mất Nguồn': ['NGUỒN', 'NGUON', 'MAIN', 'IC'],
  'Mainboard / IC Sạc': ['MAIN', 'IC', 'SẠC', 'SAC'],
  'Khác': []
};

const taskPartSummary = (task: TechnicalTaskTypeConfig) => (task.requiredPartTemplates || [])
  .map(rule => rule.sku || rule.category)
  .filter(Boolean)
  .join(' · ');

function StepLabel({ number, title, active, done }: { number: IntakeStep; title: string; active: boolean; done: boolean }) {
  return <div className="flex min-w-0 items-center gap-1.5"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${active ? 'bg-orange-600 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-zinc-100 text-zinc-400'}`}>{done ? '✓' : number}</span><span className={`hidden truncate text-[10px] font-bold sm:inline ${active ? 'text-zinc-900' : 'text-zinc-400'}`}>{title}</span></div>;
}

export const RepairIntakeModal: React.FC<RepairIntakeModalProps> = ({
  isOpen, onClose, branches, warehouses, devices, users, currentUser, onCreated
}) => {
  const [step, setStep] = useState<IntakeStep>(1);
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [error, setError] = useState('');
  const [taskTypes, setTaskTypes] = useState<TechnicalTaskTypeConfig[]>([]);
  const [selectedTaskTypes, setSelectedTaskTypes] = useState<string[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [createdWorkOrder, setCreatedWorkOrder] = useState<{ workOrderId: string; code: string } | null>(null);
  const [photoWarning, setPhotoWarning] = useState('');
  const [form, setForm] = useState(initialForm());

  const activeWarehouses = useMemo(() => warehouses.filter(warehouse => warehouse.isActive !== false && warehouse.isArchived !== true && warehouse.branchId === form.branchId), [warehouses, form.branchId]);
  const technicians = useMemo(() => users.filter(user => {
    if (!technicianRoles.has(String(user.role).toUpperCase()) || user.active === false) return false;
    return !form.branchId || user.branchId === form.branchId || (user.assignedBranchIds || []).includes(form.branchId);
  }), [users, form.branchId]);
  const selectedTechnician = useMemo(() => technicians.find(user => user.id === form.assigneeId), [technicians, form.assigneeId]);
  const selectedTechnicianUid = String((selectedTechnician as any)?.authUid || selectedTechnician?.id || '');
  const destinationWarehouses = useMemo(() => activeWarehouses.filter(warehouse => {
    if (warehouse.type === 'REPAIR_WARRANTY') return true;
    const custodianUid = String(warehouse.custodianUid || warehouse.technicianId || '');
    return warehouse.type === 'TECHNICIAN_SUB' && !!selectedTechnicianUid && custodianUid === selectedTechnicianUid;
  }), [activeWarehouses, selectedTechnicianUid]);
  const matchedCompanyDevice = useMemo(() => devices.find(device => String(device.imei || '').trim() === form.imei.trim()), [devices, form.imei]);
  const selectedTasks = useMemo(() => taskTypes.filter(task => selectedTaskTypes.includes(task.taskType || task.id)), [taskTypes, selectedTaskTypes]);
  const suggestedTaskTypes = useMemo(() => {
    const configured = taskTypes.filter(task => (task.intakeIssueTypes || []).includes(form.issueType));
    if (configured.length) return configured.map(task => task.taskType || task.id);
    const hints = taskHints[form.issueType] || [];
    if (!hints.length) return [];
    return taskTypes.filter(task => {
      const content = `${task.name} ${task.taskType} ${task.taskCode}`.toLocaleUpperCase('vi');
      return hints.some(hint => content.includes(hint));
    }).map(task => task.taskType || task.id);
  }, [form.issueType, taskTypes]);

  useEffect(() => {
    if (!isOpen) return;
    const branchId = currentUser?.branchId || branches.find(branch => branch.isActive !== false)?.id || '';
    const initialWarehouse = warehouses.find(warehouse => warehouse.isActive !== false && warehouse.isArchived !== true && warehouse.branchId === branchId);
    const technician = users.find(user => technicianRoles.has(String(user.role).toUpperCase()) && user.active !== false && (user.branchId === branchId || (user.assignedBranchIds || []).includes(branchId)));
    setForm({ ...initialForm(), branchId, sourceWarehouseId: initialWarehouse?.id || '', assigneeId: technician?.id || '' });
    setStep(1); setPhotos([]); setSelectedTaskTypes([]); setError(''); setCreatedWorkOrder(null); setPhotoWarning('');
    setLoadingSettings(true);
    void fetchInventoryTransferMetadata(currentUser || undefined)
      .then(result => setTaskTypes((result.taskTypes || []).filter(task => task.isActive !== false)))
      .catch(cause => setError(cause?.message || 'Không thể tải danh sách việc kỹ thuật.'))
      .finally(() => setLoadingSettings(false));
  }, [isOpen, currentUser?.id, currentUser?.branchId, branches, warehouses, users]);

  useEffect(() => {
    if (!isOpen || !form.branchId) return;
    if (!activeWarehouses.some(warehouse => warehouse.id === form.sourceWarehouseId)) setForm(current => ({ ...current, sourceWarehouseId: activeWarehouses[0]?.id || '' }));
  }, [isOpen, form.branchId, activeWarehouses, form.sourceWarehouseId]);

  useEffect(() => {
    if (!isOpen) return;
    if (!destinationWarehouses.some(warehouse => warehouse.id === form.destinationWarehouseId)) setForm(current => ({ ...current, destinationWarehouseId: destinationWarehouses[0]?.id || '' }));
  }, [isOpen, destinationWarehouses, form.destinationWarehouseId]);

  useEffect(() => {
    if (form.source !== 'STORE_ESCALATION' || !matchedCompanyDevice) return;
    setForm(current => ({ ...current, branchId: matchedCompanyDevice.branchId || current.branchId, sourceWarehouseId: String(matchedCompanyDevice.currentLocationId || matchedCompanyDevice.warehouseId || matchedCompanyDevice.warehouse || current.sourceWarehouseId), model: matchedCompanyDevice.model || current.model }));
  }, [form.source, matchedCompanyDevice?.id]);

  if (!isOpen) return null;

  const update = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));
  const requiresCustomer = form.source !== 'STORE_ESCALATION';
  const toggleTask = (taskType: string) => setSelectedTaskTypes(current => current.includes(taskType) ? current.filter(item => item !== taskType) : [...current, taskType]);

  const validateStep = (target: IntakeStep): boolean => {
    setError('');
    if (target === 1) {
      if (!form.branchId || !form.sourceWarehouseId || !form.model.trim() || !/^\d{5,15}$/.test(form.imei.trim())) {
        setError('Điền chi nhánh, vị trí tiếp nhận, IMEI/Serial 5–15 số và model máy trước khi tiếp tục.'); return false;
      }
      if (requiresCustomer && (!form.customerName.trim() || !form.phone.trim())) { setError('Máy của khách cần có tên và số điện thoại.'); return false; }
      if (form.source === 'STORE_ESCALATION' && !matchedCompanyDevice) { setError('Máy cửa hàng phải là IMEI đang có trong hệ thống.'); return false; }
    }
    if (target === 2) {
      if (!form.faultDescription.trim()) { setError('Hãy mô tả lỗi hoặc yêu cầu của khách.'); return false; }
    }
    if (target === 3) {
      if (!form.assigneeId || !form.destinationWarehouseId || selectedTaskTypes.length === 0) { setError('Chọn KTV, kho KTV và ít nhất một việc kỹ thuật.'); return false; }
      if (!selectedTechnician) { setError('KTV đã chọn không còn thuộc chi nhánh này.'); return false; }
    }
    return true;
  };

  const attachSelectedPhotos = async (workOrderId: string) => {
    if (!photos.length) return;
    const intakePhotoUrls = await uploadTechnicalEvidence(workOrderId, 'INTAKE', photos);
    await requestAttachIntakeEvidence(workOrderId, intakePhotoUrls);
  };

  const retryPhotoUpload = async () => {
    if (!createdWorkOrder) return;
    if (!photos.length) { onClose(); return; }
    setSaving(true); setError(''); setPhotoWarning('');
    try {
      await attachSelectedPhotos(createdWorkOrder.workOrderId);
      await onCreated?.(createdWorkOrder);
      onClose();
    } catch (cause: any) {
      const message = cause?.message || 'Không thể tải ảnh từ điện thoại.';
      setPhotoWarning(message);
      setError(`Phiếu ${createdWorkOrder.code} đã tạo thành công, nhưng ảnh chưa tải được. Bạn có thể thử lại hoặc đóng form để tiếp tục làm việc.`);
    } finally { setSaving(false); }
  };

  const submit = async () => {
    if (createdWorkOrder) { await retryPhotoUpload(); return; }
    if (![1, 2, 3].every(value => validateStep(value as IntakeStep))) return;
    const assignee = selectedTechnician!;
    const isCompany = form.source === 'STORE_ESCALATION';
    const workOrderType = form.source === 'RETAIL_REPAIR' ? 'CUSTOMER_SERVICE' : form.source === 'WARRANTY' ? 'WARRANTY' : 'SHOP_RETURN_REWORK';
    setSaving(true); setError('');
    try {
      const result = await requestCreateWorkOrder({
        deviceId: isCompany ? matchedCompanyDevice?.id : undefined,
        imei: form.imei.trim(), model: form.model.trim(), workOrderType, assetOwnership: isCompany ? 'COMPANY' : 'CUSTOMER',
        branchId: form.branchId, sourceWarehouseId: form.sourceWarehouseId, destinationWarehouseId: form.destinationWarehouseId,
        customerName: isCompany ? (branches.find(branch => branch.id === form.branchId)?.name || 'Máy nội bộ cửa hàng') : form.customerName.trim(),
        customerPhone: isCompany ? '' : form.phone.trim(), totalEstimatedCost: form.source === 'RETAIL_REPAIR' ? Number(form.estimatedCost || 0) : 0,
        intakeDetails: { issueType: form.issueType, faultDescription: form.faultDescription.trim(), deviceAppearance: form.deviceAppearance.trim() || 'Chưa ghi nhận', accessoriesIncluded: form.accessoriesIncluded.trim() || 'Máy trần', expectedReturnDate: form.expectedReturnDate || undefined, icloudStatus: form.icloudStatus, unlockNote: form.unlockNote.trim() || undefined },
        notes: form.notes.trim(),
        lines: selectedTasks.map(task => ({ taskType: task.taskType || task.id, priority: form.priority, assigneeUid: String((assignee as any).authUid || assignee.id), assigneeName: assignee.displayName }))
      });
      try {
        await attachSelectedPhotos(result.workOrderId);
      } catch (photoCause: any) {
        setCreatedWorkOrder(result);
        setPhotoWarning(photoCause?.message || 'Không thể tải ảnh từ điện thoại.');
        await onCreated?.(result);
        setError(`Phiếu ${result.code} đã tạo thành công, nhưng ảnh chưa tải được. Ảnh là tùy chọn; bạn có thể tải lại ngay hoặc đóng form.`);
        return;
      }
      await onCreated?.(result);
      onClose();
    } catch (cause: any) {
      setError(cause?.message || 'Không thể tạo phiếu tiếp nhận.');
    } finally { setSaving(false); }
  };

  const addPhotos = (files: FileList | null) => {
    const incoming = Array.from(files || []);
    const invalid = incoming.find(file => !isTechnicalImageFile(file) || file.size > MAX_TECHNICAL_EVIDENCE_BYTES);
    if (invalid) { setError('Chỉ nhận ảnh định dạng phổ biến (JPG, PNG, HEIC...) dưới 20MB mỗi tệp.'); return; }
    setPhotos(current => [...current, ...incoming].slice(0, 6));
  };

  return <div data-ph-fullscreen-form className="fixed inset-0 z-[120] flex items-end bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
    <div className="flex h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-zinc-50 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-3xl">
      <header className="border-b border-zinc-800 bg-zinc-950 px-4 py-3 text-white sm:px-5"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><span className="rounded-xl bg-orange-600 p-2"><Wrench className="h-5 w-5" /></span><div className="flex items-center gap-2"><h3 className="text-sm font-black">Tiếp nhận máy sửa</h3><HelpHint title="Quy trình tiếp nhận">Đi lần lượt qua bốn bước: thông tin máy, tình trạng lúc nhận, việc kỹ thuật và xác nhận. Ảnh lúc nhận là tùy chọn.</HelpHint></div></div><button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5" /></button></div><div className="mt-3 flex items-center justify-between"><StepLabel number={1} title="Máy & khách" active={step === 1} done={step > 1} /><span className="h-px flex-1 bg-zinc-700" /><StepLabel number={2} title="Tình trạng" active={step === 2} done={step > 2} /><span className="h-px flex-1 bg-zinc-700" /><StepLabel number={3} title="Việc sửa" active={step === 3} done={step > 3} /><span className="h-px flex-1 bg-zinc-700" /><StepLabel number={4} title="Xác nhận" active={step === 4} done={false} /></div></header>
      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {error && <div className="mb-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
        {photoWarning && <div className="mb-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800"><ImagePlus className="h-4 w-4 shrink-0" />Ảnh chưa tải: {photoWarning}</div>}
        {step === 1 && <section className="space-y-4"><div><h4 className="text-base font-black text-zinc-900">Máy và người gửi</h4><p className="mt-1 text-xs text-zinc-500">Nhập thông tin tối thiểu trước. Các phần còn lại làm ở bước sau.</p></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Nguồn tiếp nhận" required><select value={form.source} onChange={event => update({ source: event.target.value as IntakeSource })}><option value="RETAIL_REPAIR">Khách lẻ sửa dịch vụ</option><option value="WARRANTY">Khách bảo hành</option><option value="STORE_ESCALATION">Máy lỗi cửa hàng chuyển lên</option></select></Field><Field label="Chi nhánh" required><select value={form.branchId} onChange={event => update({ branchId: event.target.value })}><option value="">Chọn chi nhánh</option>{branches.filter(branch => branch.isActive !== false).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field><Field label="Vị trí tiếp nhận" required><select value={form.sourceWarehouseId} onChange={event => update({ sourceWarehouseId: event.target.value })}><option value="">Chọn kho/vị trí</option>{activeWarehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field><Field label="IMEI / Serial" required><input inputMode="numeric" value={form.imei} onChange={event => update({ imei: event.target.value.replace(/\D/g, '').slice(0, 15) })} placeholder="5–15 số" className="font-mono" />{form.source === 'STORE_ESCALATION' && form.imei && <small className={matchedCompanyDevice ? 'text-emerald-700' : 'text-red-600'}>{matchedCompanyDevice ? `Đã khớp: ${matchedCompanyDevice.model}` : 'Chưa thấy IMEI trong hệ thống'}</small>}</Field><Field label="Model máy" required><input value={form.model} onChange={event => update({ model: event.target.value })} placeholder="Ví dụ: iPhone 15 Pro Max" /></Field>{requiresCustomer ? <><Field label="Tên khách" required><input value={form.customerName} onChange={event => update({ customerName: event.target.value })} /></Field><Field label="Số điện thoại" required><input inputMode="tel" value={form.phone} onChange={event => update({ phone: event.target.value })} /></Field></> : <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 sm:col-span-2">Máy nội bộ: hệ thống tự đối chiếu IMEI, chi nhánh và kho đang giữ máy.</div>}</div></section>}
        {step === 2 && <section className="space-y-4"><div><h4 className="text-base font-black text-zinc-900">Tình trạng lúc nhận máy</h4><p className="mt-1 text-xs text-zinc-500">Ảnh giúp đối chiếu rõ tình trạng, nhưng không bắt buộc để tiếp tục.</p></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Nhóm lỗi"><select value={form.issueType} onChange={event => update({ issueType: event.target.value as WarrantyTicket['issueType'] })}>{issueTypes.map(issue => <option key={issue}>{issue}</option>)}</select></Field><Field label="Hẹn trả máy"><input type="datetime-local" value={form.expectedReturnDate} onChange={event => update({ expectedReturnDate: event.target.value })} /></Field><Field label="Ngoại hình"><input value={form.deviceAppearance} onChange={event => update({ deviceAppearance: event.target.value })} placeholder="Trầy góc, nứt kính..." /></Field><Field label="Phụ kiện đi kèm"><input value={form.accessoriesIncluded} onChange={event => update({ accessoriesIncluded: event.target.value })} placeholder="Máy trần, sạc, hộp..." /></Field><Field label="Báo giá dự kiến"><input disabled={form.source !== 'RETAIL_REPAIR'} type="number" value={form.estimatedCost} onChange={event => update({ estimatedCost: Number(event.target.value) })} /></Field><Field label="Tình trạng iCloud / mở máy (không bắt buộc)"><select value={form.icloudStatus} onChange={event => update({ icloudStatus: event.target.value })}><option>Chưa kiểm tra</option><option>Đã đăng xuất iCloud</option><option>iCloud đang đăng nhập</option><option>Khách hỗ trợ mở máy khi cần</option><option>Không áp dụng</option></select><small className="text-zinc-500">Không nhập tài khoản hoặc mật khẩu iCloud.</small></Field><Field label="Ghi chú mở máy (không bắt buộc)" className="sm:col-span-2"><input value={form.unlockNote} onChange={event => update({ unlockNote: event.target.value })} placeholder="Ví dụ: khách sẽ có mặt để mở máy khi kiểm tra" /></Field><Field label="Lỗi/yêu cầu của khách" required className="sm:col-span-2"><textarea rows={3} value={form.faultDescription} onChange={event => update({ faultDescription: event.target.value })} placeholder="Mô tả triệu chứng, lịch sử lỗi, yêu cầu cần xử lý..." /></Field></div><section className="rounded-2xl border border-orange-200 bg-orange-50/50 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-orange-950">Ảnh tình trạng lúc nhận (không bắt buộc)</p><p className="mt-1 text-[11px] leading-4 text-orange-800">Chọn tối đa 6 ảnh từ máy hoặc chụp mới, mỗi ảnh dưới 20MB.</p></div><label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-2 text-xs font-black text-white"><ImagePlus className="h-4 w-4" />Chọn ảnh<input type="file" accept="image/*" multiple className="hidden" onChange={event => { addPhotos(event.target.files); event.currentTarget.value = ''; }} /></label></div><div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">{photos.map((photo, index) => <div key={`${photo.name}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-orange-200 bg-white"><img src={URL.createObjectURL(photo)} alt={`Ảnh nhận máy ${index + 1}`} className="h-full w-full object-cover" /><button type="button" onClick={() => setPhotos(current => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded-full bg-black/65 p-1 text-white"><X className="h-3 w-3" /></button></div>)}{!photos.length && <label className="col-span-3 flex aspect-[3/1] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-orange-300 text-orange-700 sm:col-span-6"><Camera className="h-5 w-5" /><span className="mt-1 text-[10px] font-bold">Chưa có ảnh · vẫn có thể tiếp tục</span><input type="file" accept="image/*" multiple className="hidden" onChange={event => { addPhotos(event.target.files); event.currentTarget.value = ''; }} /></label>}</div></section><Field label="Ghi chú nội bộ"><input value={form.notes} onChange={event => update({ notes: event.target.value })} /></Field></section>}
        {step === 3 && <section className="space-y-4"><div><h4 className="text-base font-black text-zinc-900">Chọn việc kỹ thuật</h4><p className="mt-1 text-xs text-zinc-500">Chọn một hoặc nhiều việc. Mỗi việc tự mang theo đúng quy tắc linh kiện đã thiết lập.</p></div>{!loadingSettings && !taskTypes.length && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">Chưa có việc kỹ thuật đang dùng. Vào Cài đặt → Task kỹ thuật để tạo trước.</div>}<div className="grid gap-3 sm:grid-cols-2"><Field label="Kỹ thuật viên" required><select value={form.assigneeId} onChange={event => update({ assigneeId: event.target.value })}><option value="">Chọn KTV</option>{technicians.map(user => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></Field><Field label="Kho KTV thực hiện" required><select value={form.destinationWarehouseId} onChange={event => update({ destinationWarehouseId: event.target.value })}><option value="">Chọn kho KTV</option>{destinationWarehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>{form.assigneeId && !destinationWarehouses.length && <small className="text-red-600">KTV này chưa được gán kho con.</small>}</Field><Field label="Mức ưu tiên"><select value={form.priority} onChange={event => update({ priority: event.target.value as Priority })}><option value="NORMAL">Bình thường</option><option value="PRIORITY">Ưu tiên</option><option value="URGENT">Khẩn</option></select></Field></div>{suggestedTaskTypes.length > 0 && <button type="button" onClick={() => setSelectedTaskTypes(current => [...new Set([...current, ...suggestedTaskTypes])])} className="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-left text-xs font-bold text-sky-800">Gợi ý theo lỗi “{form.issueType}”: thêm {suggestedTaskTypes.length} việc phù hợp</button>}<div className="grid gap-2 sm:grid-cols-2">{taskTypes.map(task => { const taskType = task.taskType || task.id; const selected = selectedTaskTypes.includes(taskType); const parts = taskPartSummary(task); return <button type="button" key={taskType} onClick={() => toggleTask(taskType)} className={`rounded-2xl border p-3 text-left transition ${selected ? 'border-orange-500 bg-orange-50 shadow-sm' : 'border-zinc-200 bg-white hover:border-zinc-300'}`}><div className="flex gap-2"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] ${selected ? 'border-orange-600 bg-orange-600 text-white' : 'border-zinc-300 text-transparent'}`}>✓</span><div className="min-w-0"><p className="text-xs font-black text-zinc-900">{task.name}</p><p className="mt-0.5 font-mono text-[10px] text-zinc-500">{task.taskCode || task.taskType}</p>{parts ? <p className="mt-2 flex items-start gap-1 text-[10px] leading-4 text-sky-700"><PackageCheck className="mt-0.5 h-3 w-3 shrink-0" />Dùng được: {parts}</p> : <p className="mt-2 text-[10px] text-zinc-400">Chưa có linh kiện tự dùng</p>}</div></div></button>; })}</div>{selectedTasks.length > 0 && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><b>Đã chọn {selectedTasks.length} việc:</b> {selectedTasks.map(task => task.name).join(' · ')}. KTV sẽ chỉ thấy linh kiện phù hợp với từng việc.</div>}</section>}
        {step === 4 && <section className="space-y-4"><div><h4 className="text-base font-black text-zinc-900">Kiểm tra trước khi tạo phiếu</h4><p className="mt-1 text-xs text-zinc-500">Sau khi tạo, KTV quét lại IMEI và xác nhận nhận máy trước khi bắt đầu sửa.</p></div><div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-3 text-xs"><Summary icon={Smartphone} label="Máy" value={`${form.model} · ${form.imei}`} /><Summary icon={UserRound} label="Khách" value={requiresCustomer ? `${form.customerName} · ${form.phone}` : 'Máy nội bộ cửa hàng'} /><Summary icon={ClipboardCheck} label="Việc kỹ thuật" value={selectedTasks.map(task => task.name).join(' · ')} /><Summary icon={PackageCheck} label="KTV / kho" value={`${selectedTechnician?.displayName || '—'} · ${destinationWarehouses.find(item => item.id === form.destinationWarehouseId)?.name || '—'}`} /><Summary icon={Camera} label="Ảnh lúc nhận" value={`${photos.length} ảnh`} /></div><div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-[11px] leading-5 text-sky-900"><b>Cách hệ thống hỗ trợ nhanh:</b> từng việc sẽ lưu kèm nhóm linh kiện được phép. Ví dụ “Thay pin” chỉ hiện pin; muốn dùng màn hình hoặc linh kiện khác phải gửi yêu cầu để Kho/Admin duyệt.</div></section>}
      </main>
      <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-white p-3 sm:p-4"><button type="button" onClick={() => createdWorkOrder || step === 1 ? onClose() : setStep(current => (current - 1) as IntakeStep)} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100">{createdWorkOrder || step === 1 ? 'Đóng' : <><ChevronLeft className="h-4 w-4" />Quay lại</>}</button>{step < 4 ? <button type="button" disabled={loadingSettings && step === 3} onClick={() => { if (validateStep(step)) setStep(current => (current + 1) as IntakeStep); }} className="inline-flex items-center gap-1 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">Tiếp tục<ChevronRight className="h-4 w-4" /></button> : createdWorkOrder ? <button type="button" disabled={saving} onClick={() => void retryPhotoUpload()} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{photos.length ? 'Tải ảnh lại' : 'Đóng form'}</button> : <button type="button" disabled={saving} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{saving ? (photos.length ? 'Đang tạo & tải ảnh...' : 'Đang tạo phiếu...') : 'Tạo phiếu tiếp nhận'}</button>}</footer>
    </div>
  </div>;
};

function Field({ label, required = false, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  const isTextarea = React.isValidElement(children) && children.type === 'textarea';
  const controlClass = isTextarea
    ? 'min-h-24 w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs font-semibold outline-none focus:border-orange-500 disabled:bg-zinc-100'
    : 'h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold outline-none focus:border-orange-500 disabled:bg-zinc-100';
  return <label className={`space-y-1 text-xs font-bold text-zinc-700 ${className}`}><span>{label}{required && <span className="ml-0.5 text-rose-500">*</span>}</span>{React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<any>, { className: `${(children as any).props.className || ''} ${controlClass}` }) : children}</label>;
}

function Summary({ icon: Icon, label, value }: { icon: typeof Smartphone; label: string; value: string }) {
  return <div className="flex gap-2 border-b border-zinc-100 pb-2 last:border-0 last:pb-0"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" /><div><p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{label}</p><p className="mt-0.5 text-xs font-bold text-zinc-800">{value || '—'}</p></div></div>;
}
