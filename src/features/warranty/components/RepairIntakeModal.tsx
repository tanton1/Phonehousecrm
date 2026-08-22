import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck, Wrench, X } from 'lucide-react';
import {
  DeviceItem,
  StoreBranch,
  TechnicalTaskTypeConfig,
  UserAccount,
  WarehouseInfo,
  WarrantyTicket
} from '../../../types';
import { fetchInventoryTransferMetadata } from '../../../services/inventoryTransferApiClient';
import { requestCreateWorkOrder } from '../../../services/technicalApiClient';

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

const issueTypes: WarrantyTicket['issueType'][] = [
  'Nguồn / Mất Nguồn', 'Màn Hình / Cảm Ứng', 'Pin / Phù Pin', 'Face ID / Camera',
  'Sóng / Wifi', 'Loa / Mic', 'Ép Kính / Thay Lưng', 'Mainboard / IC Sạc', 'Khác'
];
const technicianRoles = new Set(['TECHNICIAN', 'TECH', 'TECH_LEAD']);

export const RepairIntakeModal: React.FC<RepairIntakeModalProps> = ({
  isOpen, onClose, branches, warehouses, devices, users, currentUser, onCreated
}) => {
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [error, setError] = useState('');
  const [taskTypes, setTaskTypes] = useState<TechnicalTaskTypeConfig[]>([]);
  const [form, setForm] = useState({
    source: 'RETAIL_REPAIR' as IntakeSource,
    branchId: '', sourceWarehouseId: '', destinationWarehouseId: '', customerName: '', phone: '', imei: '', model: '',
    issueType: 'Khác' as WarrantyTicket['issueType'], faultDescription: '', taskType: '',
    technician: '', assigneeId: '', estimatedCost: 0, expectedReturnDate: '',
    deviceAppearance: '', accessoriesIncluded: '', passcode: '', notes: ''
  });

  const activeWarehouses = useMemo(
    () => warehouses.filter(warehouse => warehouse.isActive !== false && warehouse.branchId === form.branchId),
    [warehouses, form.branchId]
  );
  const technicians = useMemo(() => users.filter(user => {
    if (!technicianRoles.has(String(user.role).toUpperCase()) || user.active === false) return false;
    return !form.branchId || user.branchId === form.branchId || (user.assignedBranchIds || []).includes(form.branchId);
  }), [users, form.branchId]);
  const selectedTechnician = useMemo(() => technicians.find(user => user.id === form.assigneeId), [technicians, form.assigneeId]);
  const selectedTechnicianUid = String((selectedTechnician as any)?.authUid || selectedTechnician?.id || '');
  const destinationWarehouses = useMemo(() => activeWarehouses.filter(warehouse => {
    if (warehouse.type === 'REPAIR_WARRANTY') return true;
    if (warehouse.type !== 'TECHNICIAN_SUB') return false;
    const custodianUid = String(warehouse.custodianUid || warehouse.technicianId || '');
    return !!selectedTechnicianUid && custodianUid === selectedTechnicianUid;
  }), [activeWarehouses, selectedTechnicianUid]);
  const matchedCompanyDevice = useMemo(
    () => devices.find(device => String(device.imei || '').trim() === form.imei.trim()),
    [devices, form.imei]
  );

  useEffect(() => {
    if (!isOpen) return;
    const branchId = currentUser?.branchId || branches.find(branch => branch.isActive !== false)?.id || '';
    const firstWarehouse = warehouses.find(warehouse => warehouse.isActive !== false && warehouse.branchId === branchId);
    const technician = users.find(user => technicianRoles.has(String(user.role).toUpperCase()) && user.active !== false && (user.branchId === branchId || (user.assignedBranchIds || []).includes(branchId)));
    setError('');
    setForm({
      source: 'RETAIL_REPAIR', branchId, sourceWarehouseId: firstWarehouse?.id || '', destinationWarehouseId: '',
      customerName: '', phone: '', imei: '', model: '', issueType: 'Khác', faultDescription: '', taskType: '',
      technician: technician?.displayName || '', assigneeId: technician?.id || '', estimatedCost: 0,
      expectedReturnDate: '', deviceAppearance: '', accessoriesIncluded: '', passcode: '', notes: ''
    });
    setLoadingSettings(true);
    void fetchInventoryTransferMetadata(currentUser || undefined)
      .then(result => {
        const active = (result.taskTypes || []).filter(task => task.isActive !== false);
        setTaskTypes(active);
        setForm(current => ({ ...current, taskType: current.taskType || active[0]?.taskType || active[0]?.id || '' }));
      })
      .catch(cause => setError(cause?.message || 'Không thể tải cấu hình task kỹ thuật.'))
      .finally(() => setLoadingSettings(false));
  }, [isOpen, currentUser?.id, currentUser?.branchId, branches, warehouses, users]);

  useEffect(() => {
    if (!isOpen || !form.branchId) return;
    if (!activeWarehouses.some(warehouse => warehouse.id === form.sourceWarehouseId)) {
      setForm(current => ({ ...current, sourceWarehouseId: activeWarehouses[0]?.id || '' }));
    }
  }, [form.branchId, activeWarehouses, form.sourceWarehouseId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!destinationWarehouses.some(warehouse => warehouse.id === form.destinationWarehouseId)) {
      setForm(current => ({ ...current, destinationWarehouseId: destinationWarehouses[0]?.id || '' }));
    }
  }, [destinationWarehouses, form.destinationWarehouseId, isOpen]);

  useEffect(() => {
    if (form.source !== 'STORE_ESCALATION' || !matchedCompanyDevice) return;
    setForm(current => ({
      ...current,
      branchId: matchedCompanyDevice.branchId || current.branchId,
      sourceWarehouseId: String(matchedCompanyDevice.currentLocationId || matchedCompanyDevice.warehouseId || matchedCompanyDevice.warehouse || current.sourceWarehouseId),
      model: matchedCompanyDevice.model || current.model
    }));
  }, [form.source, matchedCompanyDevice?.id]);

  if (!isOpen) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const imei = form.imei.trim();
    const requiresCustomer = form.source !== 'STORE_ESCALATION';
    if (!form.branchId || !form.sourceWarehouseId || !form.destinationWarehouseId || (requiresCustomer && (!form.customerName.trim() || !form.phone.trim())) || !form.model.trim() || !form.faultDescription.trim()) {
      setError('Vui lòng nhập đủ chi nhánh, kho tiếp nhận, kho KTV, thông tin khách (nếu là máy khách), model và mô tả lỗi.');
      return;
    }
    if (!/^\d{5,15}$/.test(imei)) {
      setError('IMEI/Serial phải gồm từ 5 đến 15 chữ số.');
      return;
    }
    if (!form.taskType || !form.assigneeId) {
      setError('Phải chọn task đã thiết lập và kỹ thuật viên phụ trách.');
      return;
    }
    if (form.source === 'STORE_ESCALATION' && !matchedCompanyDevice) {
      setError('Máy lỗi cửa hàng phải là IMEI đang có trong hệ thống.');
      return;
    }
    const assignee = selectedTechnician;
    if (!assignee) {
      setError('Kỹ thuật viên không còn thuộc chi nhánh đã chọn.');
      return;
    }

    setSaving(true);
    try {
      const isCompany = form.source === 'STORE_ESCALATION';
      const workOrderType = form.source === 'RETAIL_REPAIR'
        ? 'CUSTOMER_SERVICE'
        : form.source === 'WARRANTY' ? 'WARRANTY' : 'SHOP_RETURN_REWORK';
      const result = await requestCreateWorkOrder({
        deviceId: isCompany ? matchedCompanyDevice?.id : undefined,
        imei,
        model: form.model.trim(),
        workOrderType,
        assetOwnership: isCompany ? 'COMPANY' : 'CUSTOMER',
        branchId: form.branchId,
        sourceWarehouseId: form.sourceWarehouseId,
        destinationWarehouseId: form.destinationWarehouseId,
        customerName: isCompany ? (branches.find(branch => branch.id === form.branchId)?.name || 'Máy nội bộ cửa hàng') : form.customerName.trim(),
        customerPhone: isCompany ? '' : form.phone.trim(),
        totalEstimatedCost: form.source === 'RETAIL_REPAIR' ? Number(form.estimatedCost || 0) : 0,
        passcode: form.passcode.trim() || undefined,
        intakeDetails: {
          issueType: form.issueType,
          faultDescription: form.faultDescription.trim(),
          deviceAppearance: form.deviceAppearance.trim() || 'Chưa ghi nhận',
          accessoriesIncluded: form.accessoriesIncluded.trim() || 'Máy trần',
          expectedReturnDate: form.expectedReturnDate || undefined
        },
        notes: form.notes.trim(),
        lines: [{
          taskType: form.taskType,
          priority: 'NORMAL',
          assigneeUid: String((assignee as any).authUid || assignee.id),
          assigneeName: assignee.displayName
        }]
      });
      await onCreated?.(result);
      onClose();
    } catch (cause: any) {
      setError(cause?.message || 'Không thể tạo phiếu tiếp nhận.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
    <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-zinc-950 px-5 py-4 text-white">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-orange-600 p-2"><Wrench className="h-5 w-5" /></span><div><h3 className="font-black">Phiếu tiếp nhận máy sửa</h3><p className="text-xs text-zinc-300">Dùng chung luồng Technical Work Order · hoa hồng lấy từ cấu hình</p></div></div>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5" /></button>
      </div>
      <form onSubmit={submit} className="grid flex-1 gap-3 overflow-y-auto p-5 text-sm sm:grid-cols-2">
        {error && <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 font-semibold text-red-700 sm:col-span-2"><AlertTriangle className="h-5 w-5 shrink-0" />{error}</div>}
        {!loadingSettings && taskTypes.length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 sm:col-span-2">Chưa có task kỹ thuật đang hoạt động. Admin cần tạo task tại Cài đặt → Task kỹ thuật trước khi tiếp nhận.</div>}
        <label className="space-y-1"><span className="font-bold">Nguồn tiếp nhận *</span><select value={form.source} onChange={event => setForm({ ...form, source: event.target.value as IntakeSource })} className="h-11 w-full rounded-xl border px-3"><option value="RETAIL_REPAIR">Khách lẻ sửa dịch vụ</option><option value="WARRANTY">Khách bảo hành</option><option value="STORE_ESCALATION">Máy lỗi cửa hàng chuyển lên</option></select></label>
        <label className="space-y-1"><span className="font-bold">Chi nhánh tiếp nhận *</span><select value={form.branchId} onChange={event => setForm({ ...form, branchId: event.target.value })} className="h-11 w-full rounded-xl border px-3"><option value="">Chọn chi nhánh</option>{branches.filter(branch => branch.isActive !== false).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label className="space-y-1"><span className="font-bold">Kho/vị trí tiếp nhận *</span><select value={form.sourceWarehouseId} onChange={event => setForm({ ...form, sourceWarehouseId: event.target.value })} className="h-11 w-full rounded-xl border px-3"><option value="">Chọn kho</option>{activeWarehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
        <label className="space-y-1"><span className="font-bold">Kho KTV thực hiện *</span><select value={form.destinationWarehouseId} onChange={event => setForm({ ...form, destinationWarehouseId: event.target.value })} className="h-11 w-full rounded-xl border px-3"><option value="">Chọn kho KTV</option>{destinationWarehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>{form.assigneeId && destinationWarehouses.length === 0 && <span className="text-xs text-red-600">KTV chưa được gán kho con; hãy thiết lập kho trước.</span>}</label>
        <label className="space-y-1"><span className="font-bold">Task ban đầu *</span><select disabled={loadingSettings} value={form.taskType} onChange={event => setForm({ ...form, taskType: event.target.value })} className="h-11 w-full rounded-xl border px-3 disabled:bg-zinc-100"><option value="">{loadingSettings ? 'Đang tải cấu hình...' : 'Chọn task'}</option>{taskTypes.map(task => <option key={task.id || task.taskType} value={task.taskType || task.id}>{task.name}</option>)}</select></label>
        <label className="space-y-1"><span className="font-bold">Tên khách hàng *</span><input value={form.customerName} onChange={event => setForm({ ...form, customerName: event.target.value })} className="h-11 w-full rounded-xl border px-3" /></label>
        <label className="space-y-1"><span className="font-bold">Số điện thoại *</span><input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} className="h-11 w-full rounded-xl border px-3" /></label>
        <label className="space-y-1"><span className="font-bold">IMEI/Serial 5–15 số *</span><input inputMode="numeric" value={form.imei} onChange={event => setForm({ ...form, imei: event.target.value.replace(/\D/g, '').slice(0, 15) })} className="h-11 w-full rounded-xl border px-3 font-mono" />{form.source === 'STORE_ESCALATION' && form.imei && <span className={`text-xs ${matchedCompanyDevice ? 'text-emerald-700' : 'text-red-600'}`}>{matchedCompanyDevice ? `Đã khớp máy ${matchedCompanyDevice.model}` : 'Chưa tìm thấy IMEI trong hệ thống'}</span>}</label>
        <label className="space-y-1"><span className="font-bold">Model máy *</span><input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} className="h-11 w-full rounded-xl border px-3" /></label>
        <label className="space-y-1"><span className="font-bold">Nhóm lỗi *</span><select value={form.issueType} onChange={event => setForm({ ...form, issueType: event.target.value as WarrantyTicket['issueType'] })} className="h-11 w-full rounded-xl border px-3">{issueTypes.map(issue => <option key={issue}>{issue}</option>)}</select></label>
        <label className="space-y-1"><span className="font-bold">Kỹ thuật viên *</span><select value={form.assigneeId} onChange={event => { const technician = technicians.find(item => item.id === event.target.value); setForm({ ...form, assigneeId: event.target.value, technician: technician?.displayName || '' }); }} className="h-11 w-full rounded-xl border px-3"><option value="">Chọn KTV</option>{technicians.map(user => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></label>
        <label className="space-y-1 sm:col-span-2"><span className="font-bold">Mô tả lỗi khách báo *</span><textarea rows={3} value={form.faultDescription} onChange={event => setForm({ ...form, faultDescription: event.target.value })} className="w-full rounded-xl border p-3" /></label>
        <label className="space-y-1"><span className="font-bold">Tình trạng ngoại hình</span><input value={form.deviceAppearance} onChange={event => setForm({ ...form, deviceAppearance: event.target.value })} placeholder="Trầy góc, nứt kính..." className="h-11 w-full rounded-xl border px-3" /></label>
        <label className="space-y-1"><span className="font-bold">Phụ kiện kèm theo</span><input value={form.accessoriesIncluded} onChange={event => setForm({ ...form, accessoriesIncluded: event.target.value })} placeholder="Máy trần, sạc..." className="h-11 w-full rounded-xl border px-3" /></label>
        <label className="space-y-1"><span className="font-bold">Mật mã mở máy (nếu có)</span><input type="password" autoComplete="new-password" value={form.passcode} onChange={event => setForm({ ...form, passcode: event.target.value })} className="h-11 w-full rounded-xl border px-3" /><span className="flex gap-1 text-xs text-zinc-500"><ShieldCheck className="h-4 w-4" />Mã hóa riêng trên server, không ghi vào phiếu/listener.</span></label>
        <label className="space-y-1"><span className="font-bold">Báo giá dự kiến</span><input type="number" disabled={form.source !== 'RETAIL_REPAIR'} value={form.estimatedCost} onChange={event => setForm({ ...form, estimatedCost: Number(event.target.value) })} className="h-11 w-full rounded-xl border px-3 disabled:bg-zinc-100" /></label>
        <label className="space-y-1"><span className="font-bold">Hẹn trả máy</span><input type="datetime-local" value={form.expectedReturnDate} onChange={event => setForm({ ...form, expectedReturnDate: event.target.value })} className="h-11 w-full rounded-xl border px-3" /></label>
        <label className="space-y-1 sm:col-span-2"><span className="font-bold">Ghi chú nội bộ</span><input value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} className="h-11 w-full rounded-xl border px-3" /></label>
        <div className="flex justify-end gap-2 border-t pt-4 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-xl bg-zinc-100 px-4 py-2 font-bold">Hủy</button><button disabled={saving || loadingSettings || taskTypes.length === 0} type="submit" className="flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2 font-black text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? 'Đang tạo...' : 'Tạo phiếu kỹ thuật'}</button></div>
      </form>
    </div>
  </div>;
};
