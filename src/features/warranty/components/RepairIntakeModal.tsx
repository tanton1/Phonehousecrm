import React, { useEffect, useState } from 'react';
import { X, Wrench } from 'lucide-react';
import { StoreBranch, UserAccount, WarrantyTicket } from '../../../types';

interface RepairIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: StoreBranch[];
  users: UserAccount[];
  currentUser?: UserAccount | null;
  onCreate: (ticket: WarrantyTicket) => Promise<void> | void;
}

type IntakeSource = 'RETAIL_REPAIR' | 'WARRANTY' | 'STORE_ESCALATION';

const issueTypes: WarrantyTicket['issueType'][] = [
  'Nguồn / Mất Nguồn', 'Màn Hình / Cảm Ứng', 'Pin / Phù Pin', 'Face ID / Camera',
  'Sóng / Wifi', 'Loa / Mic', 'Ép Kính / Thay Lưng', 'Mainboard / IC Sạc', 'Khác'
];

export const RepairIntakeModal: React.FC<RepairIntakeModalProps> = ({
  isOpen, onClose, branches, users, currentUser, onCreate
}) => {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    source: 'RETAIL_REPAIR' as IntakeSource,
    branchId: '', customerName: '', phone: '', imei: '', model: '',
    issueType: 'Khác' as WarrantyTicket['issueType'], faultDescription: '',
    technician: '', assigneeId: '', estimatedCost: 0, expectedReturnDate: '',
    deviceAppearance: '', accessoriesIncluded: '', passcode: '', notes: ''
  });

  useEffect(() => {
    if (!isOpen) return;
    const branchId = currentUser?.branchId || branches.find(branch => branch.isActive !== false)?.id || '';
    const technicians = users.filter(user => ['TECHNICIAN', 'TECH', 'TECH_LEAD'].includes(String(user.role).toUpperCase()));
    const technician = technicians[0];
    setForm({
      source: 'RETAIL_REPAIR', branchId, customerName: '', phone: '', imei: '', model: '',
      issueType: 'Khác', faultDescription: '', technician: technician?.displayName || '',
      assigneeId: technician?.id || '', estimatedCost: 0, expectedReturnDate: '',
      deviceAppearance: '', accessoriesIncluded: '', passcode: '', notes: ''
    });
  }, [isOpen, currentUser?.branchId, branches, users]);

  if (!isOpen) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const imei = form.imei.trim();
    if (!form.branchId || !form.customerName.trim() || !form.phone.trim() || !form.model.trim() || !form.faultDescription.trim()) {
      alert('Vui lòng nhập chi nhánh, khách hàng, số điện thoại, model và mô tả lỗi.');
      return;
    }
    if (!/^\d{5,15}$/.test(imei)) {
      alert('IMEI/Serial phải gồm từ 5 đến 15 chữ số.');
      return;
    }
    const now = new Date();
    const isWarranty = form.source !== 'RETAIL_REPAIR';
    const ticket: WarrantyTicket = {
      id: `WRN-${Date.now()}`,
      ticketNumber: `SC-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`,
      taskType: form.source,
      branchId: form.branchId,
      customerName: form.customerName.trim(), phone: form.phone.trim(), imei,
      model: form.model.trim(), issueType: form.issueType,
      faultDescription: form.faultDescription.trim(),
      technician: form.technician || 'Chưa phân công', assigneeId: form.assigneeId || undefined,
      status: 'received', isWarrantyFree: isWarranty,
      repairCategory: isWarranty ? 'WARRANTY_FREE' : 'REPAIR_SERVICE',
      estimatedCost: isWarranty ? 0 : Number(form.estimatedCost || 0),
      finalCost: isWarranty ? 0 : Number(form.estimatedCost || 0),
      receivedDate: now.toISOString(), expectedReturnDate: form.expectedReturnDate,
      deviceAppearance: form.deviceAppearance || 'Chưa ghi nhận',
      accessoriesIncluded: form.accessoriesIncluded || 'Máy trần',
      passcode: form.passcode || 'Không cung cấp',
      technicianNotes: form.notes,
      paymentStatus: isWarranty ? 'PAID' : 'UNPAID',
      timeline: [{ time: now.toISOString(), action: 'Tiếp nhận máy sửa', note: `${form.source} · ${form.faultDescription.trim()}`, user: currentUser?.displayName || 'Nhân viên tiếp nhận' }]
    };
    setSaving(true);
    try {
      await onCreate(ticket);
      onClose();
    } catch (error: any) {
      alert(error?.message || 'Không thể tạo phiếu tiếp nhận.');
    } finally {
      setSaving(false);
    }
  };

  const technicians = users.filter(user => ['TECHNICIAN', 'TECH', 'TECH_LEAD'].includes(String(user.role).toUpperCase()));
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
    <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-zinc-950 px-5 py-4 text-white"><div className="flex items-center gap-3"><span className="rounded-xl bg-orange-600 p-2"><Wrench className="h-5 w-5" /></span><div><h3 className="font-black">Phiếu tiếp nhận máy sửa</h3><p className="text-xs text-zinc-300">Khách lẻ · bảo hành · máy lỗi cửa hàng chuyển lên</p></div></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5" /></button></div>
      <form onSubmit={submit} className="grid flex-1 gap-3 overflow-y-auto p-5 text-sm sm:grid-cols-2">
        <label className="space-y-1"><span className="font-bold">Nguồn tiếp nhận *</span><select value={form.source} onChange={e => setForm({ ...form, source: e.target.value as IntakeSource })} className="h-11 w-full rounded-xl border px-3"><option value="RETAIL_REPAIR">Khách lẻ sửa dịch vụ</option><option value="WARRANTY">Khách bảo hành</option><option value="STORE_ESCALATION">Máy lỗi cửa hàng chuyển lên</option></select></label>
        <label className="space-y-1"><span className="font-bold">Chi nhánh tiếp nhận *</span><select value={form.branchId} onChange={e => setForm({ ...form, branchId: e.target.value })} className="h-11 w-full rounded-xl border px-3"><option value="">Chọn chi nhánh</option>{branches.filter(branch => branch.isActive !== false).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label className="space-y-1"><span className="font-bold">Tên khách hàng *</span><input value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} className="h-11 w-full rounded-xl border px-3" /></label>
        <label className="space-y-1"><span className="font-bold">Số điện thoại *</span><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-11 w-full rounded-xl border px-3" /></label>
        <label className="space-y-1"><span className="font-bold">IMEI/Serial 5–15 số *</span><input inputMode="numeric" value={form.imei} onChange={e => setForm({ ...form, imei: e.target.value.replace(/\D/g, '').slice(0, 15) })} className="h-11 w-full rounded-xl border px-3 font-mono" /></label>
        <label className="space-y-1"><span className="font-bold">Model máy *</span><input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} className="h-11 w-full rounded-xl border px-3" /></label>
        <label className="space-y-1"><span className="font-bold">Nhóm lỗi *</span><select value={form.issueType} onChange={e => setForm({ ...form, issueType: e.target.value as WarrantyTicket['issueType'] })} className="h-11 w-full rounded-xl border px-3">{issueTypes.map(issue => <option key={issue}>{issue}</option>)}</select></label>
        <label className="space-y-1"><span className="font-bold">Kỹ thuật viên</span><select value={form.assigneeId} onChange={e => { const technician = technicians.find(item => item.id === e.target.value); setForm({ ...form, assigneeId: e.target.value, technician: technician?.displayName || '' }); }} className="h-11 w-full rounded-xl border px-3"><option value="">Chưa phân công</option>{technicians.map(user => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select></label>
        <label className="space-y-1 sm:col-span-2"><span className="font-bold">Mô tả lỗi khách báo *</span><textarea rows={3} value={form.faultDescription} onChange={e => setForm({ ...form, faultDescription: e.target.value })} className="w-full rounded-xl border p-3" /></label>
        <label className="space-y-1"><span className="font-bold">Tình trạng ngoại hình</span><input value={form.deviceAppearance} onChange={e => setForm({ ...form, deviceAppearance: e.target.value })} placeholder="Trầy góc, nứt kính..." className="h-11 w-full rounded-xl border px-3" /></label>
        <label className="space-y-1"><span className="font-bold">Phụ kiện kèm theo</span><input value={form.accessoriesIncluded} onChange={e => setForm({ ...form, accessoriesIncluded: e.target.value })} placeholder="Máy trần, sạc..." className="h-11 w-full rounded-xl border px-3" /></label>
        <label className="space-y-1"><span className="font-bold">Mật mã mở máy (nếu có)</span><input value={form.passcode} onChange={e => setForm({ ...form, passcode: e.target.value })} className="h-11 w-full rounded-xl border px-3" /></label>
        <label className="space-y-1"><span className="font-bold">Báo giá dự kiến</span><input type="number" disabled={form.source !== 'RETAIL_REPAIR'} value={form.estimatedCost} onChange={e => setForm({ ...form, estimatedCost: Number(e.target.value) })} className="h-11 w-full rounded-xl border px-3 disabled:bg-zinc-100" /></label>
        <label className="space-y-1"><span className="font-bold">Hẹn trả máy</span><input type="datetime-local" value={form.expectedReturnDate} onChange={e => setForm({ ...form, expectedReturnDate: e.target.value })} className="h-11 w-full rounded-xl border px-3" /></label>
        <label className="space-y-1 sm:col-span-2"><span className="font-bold">Ghi chú nội bộ</span><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="h-11 w-full rounded-xl border px-3" /></label>
        <div className="flex justify-end gap-2 border-t pt-4 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-xl bg-zinc-100 px-4 py-2 font-bold">Hủy</button><button disabled={saving} type="submit" className="rounded-xl bg-orange-600 px-5 py-2 font-black text-white disabled:opacity-50">{saving ? 'Đang lưu...' : 'Tạo phiếu tiếp nhận'}</button></div>
      </form>
    </div>
  </div>;
};
