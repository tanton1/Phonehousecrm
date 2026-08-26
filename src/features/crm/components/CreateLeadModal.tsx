import React, { useState, useMemo } from 'react';
import { Lead, StoreBranch, UserAccount, StaffMember, LeadNextAction } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { normalizeVietnamPhone, isValidVietnamPhone, formatDisplayPhone } from '../../../utils/phoneUtils';
import { Users, X, Sparkles, AlertCircle, AlertTriangle, Phone, Calendar, Clock, DollarSign, UserCheck, User, Smartphone, Plus } from 'lucide-react';

interface CreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveLead: (lead: Lead) => Promise<void> | void;
  branches: StoreBranch[];
  existingLeads?: Lead[];
  currentUser?: UserAccount | null;
  staffList?: (StaffMember | UserAccount)[];
  currentBranchId?: string;
  currentBranch?: StoreBranch;
}

export const CreateLeadModal: React.FC<CreateLeadModalProps> = ({
  isOpen,
  onClose,
  onSaveLead,
  branches,
  existingLeads = [],
  currentUser,
  staffList = [],
  currentBranchId,
  currentBranch: suppliedCurrentBranch
}) => {
  const currentBranch = suppliedCurrentBranch
    || branches.find(branch => branch.id === currentBranchId)
    || branches.find(branch => branch.id === currentUser?.branchId)
    || { id: currentUser?.branchId || '', name: 'Chi nhánh hiện tại' };
  const canChooseStaff = ['ADMIN', 'MANAGER'].includes(String(currentUser?.role || ''));

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [zalo, setZalo] = useState('');
  const [source, setSource] = useState<Lead['source']>('Facebook Ads');
  const [demandModel, setDemandModel] = useState('');
  const [budget, setBudget] = useState<number>(15000000);
  const [notes, setNotes] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('AUTO');
  const [nextActionType, setNextActionType] = useState<LeadNextAction['type']>('CALL');
  const [nextActionDate, setNextActionDate] = useState<string>(
    new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 16)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Real-time duplicate phone checking with normalized phone
  const duplicateLead = useMemo(() => {
    if (!phone || phone.trim().length < 6) return null;
    const currentNorm = normalizeVietnamPhone(phone);
    return existingLeads.find(l => {
      const existingNorm = normalizeVietnamPhone(l.phone || l.phoneNormalized);
      return existingNorm === currentNorm;
    });
  }, [phone, existingLeads]);

  if (!isOpen) return null;

  const assignedStaffObj = staffList.find(s => s.id === selectedStaffId || (s as any).uid === selectedStaffId);
  const assignedStaffName = selectedStaffId === 'AUTO'
    ? 'Hệ thống tự phân công'
    : assignedStaffObj?.name || (assignedStaffObj as any)?.displayName || currentUser?.displayName || 'Nhân viên tư vấn';

  const handleApplyDuplicate = () => {
    if (duplicateLead) {
      setName(duplicateLead.name);
      if (duplicateLead.zalo) setZalo(duplicateLead.zalo);
      if (duplicateLead.source) setSource(duplicateLead.source);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Vui lòng nhập tên khách hàng.');
      return;
    }

    if (!isValidVietnamPhone(phone)) {
      alert('Số điện thoại không hợp lệ. Vui lòng nhập đúng 10 số di động Việt Nam (đầu số 03x, 05x, 07x, 08x, 09x).');
      return;
    }

    const normPhone = normalizeVietnamPhone(phone);

    setIsSubmitting(true);
    try {
      const newLead: Lead = {
        id: `LEAD-${Date.now()}`,
        branchId: currentBranch.id,
        name: name.trim(),
        phone: phone.trim(),
        phoneNormalized: normPhone,
        zalo: zalo.trim() || undefined,
        source,
        status: 'new',
        interestedModel: demandModel,
        budget,
        tradeInRequirose: false,
        notes: notes.trim() || '',
        assignedStaff: assignedStaffName,
        assignedStaffId: selectedStaffId === 'AUTO' ? undefined : selectedStaffId,
        followUpDate: nextActionDate,
        nextAction: {
          type: nextActionType,
          dueAt: nextActionDate,
          notes: notes.trim() || undefined,
          assignedTo: assignedStaffName
        },
        createdAt: new Date().toISOString()
      };

      await onSaveLead(newLead);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 sm:items-center sm:p-5">
      <div className="flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[94vh] sm:rounded-3xl sm:border sm:border-zinc-100">
        <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 text-[#ff4b16] flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900">Thêm Khách Tiềm Năng (Lead CRM)</h3>
              <p className="text-xs text-zinc-500">Tiếp nhận thông tin khách quan tâm mua máy</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Real-time Duplicate Detection Alert */}
        {duplicateLead && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start justify-between gap-2 text-xs text-amber-900 animate-in fade-in duration-150">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Khách hàng đã tồn tại: </span>
                <span>{duplicateLead.name} ({formatDisplayPhone(duplicateLead.phone)})</span>
                <span className="block text-[11px] text-amber-700 mt-0.5">
                  Nhu cầu gần nhất: <strong>{duplicateLead.interestedModel}</strong> • Sale: {duplicateLead.assignedStaff}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleApplyDuplicate}
              className="text-[11px] font-bold text-amber-800 bg-amber-200/80 hover:bg-amber-300 px-2.5 py-1 rounded-lg shrink-0 cursor-pointer"
            >
              Tự điền
            </button>
          </div>
        )}

        {/* Form Body */}
        <div className="space-y-3 text-xs">
          {/* Customer Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-zinc-800 block">Họ và Tên Khách Hàng (*):</label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="e.g. Anh Hoàng"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-none focus:border-[#ff4b16]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-zinc-800 block">Số Điện Thoại (*):</label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="tel"
                  placeholder="09..."
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:border-[#ff4b16]"
                />
              </div>
            </div>
          </div>

          {/* Source & Demand Model */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-zinc-800 block">Nguồn Tiếp Nhận:</label>
              <select
                value={source}
                onChange={e => setSource(e.target.value as any)}
                className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
              >
                <option value="Facebook Ads">Facebook Ads</option>
                <option value="TikTok">TikTok</option>
                <option value="Zalo OA">Zalo OA</option>
                <option value="Khách Vãng Lai">Khách Vãng Lai Đến Shop</option>
                <option value="Khách Quen Giới Thiệu">Khách Quen Giới Thiệu</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-zinc-800 block">Dòng Máy Quan Tâm:</label>
              <div className="relative">
                <Smartphone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="e.g. iPhone 15 Pro Max 256GB"
                  value={demandModel}
                  onChange={e => setDemandModel(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-none focus:border-[#ff4b16]"
                />
              </div>
            </div>
          </div>

          {/* Budget & automatic assignment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-zinc-800 block">Ngân Sách Dự Kiến (VNĐ):</label>
              <input
                type="number"
                value={budget}
                onChange={e => setBudget(parseInt(e.target.value, 10) || 0)}
                className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono font-bold text-zinc-900 focus:outline-none focus:border-[#ff4b16]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-zinc-800 flex items-center gap-1.5">Người phụ trách <span title="Hệ thống ưu tiên nhân viên đang trong ca và có ít việc hơn." className="text-zinc-400">?</span></label>
              {canChooseStaff ? <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)} className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]">
                <option value="AUTO">Tự động theo ca & tải việc</option>
                {staffList.filter(s => {
                  const active = (s as any).active !== false && (s as any).isActive !== false;
                  const branchIds = [(s as any).branchId, ...((s as any).assignedBranchIds || [])].filter(Boolean);
                  return active && ['SALES', 'CUSTOMER_CARE'].includes(String(s.role)) && (!currentBranch.id || branchIds.includes(currentBranch.id));
                }).map(s => <option key={s.id || s.uid} value={s.id || s.uid}>{s.name || s.displayName}</option>)}
              </select> : <div className="flex h-9 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 font-bold text-emerald-700">Tự động theo ca & tải việc</div>}
            </div>
          </div>

          {/* Next Action Plan */}
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-2">
            <label className="font-bold text-zinc-800 block flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#ff4b16]" />
              <span>Việc cần làm tiếp theo</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={nextActionType}
                onChange={e => setNextActionType(e.target.value as any)}
                className="w-full h-8 px-2.5 bg-white border border-zinc-200 rounded-lg font-semibold text-zinc-700 focus:outline-none"
              >
                <option value="CALL">📞 Gọi điện thoại tư vấn</option>
                <option value="MESSAGE">💬 Nhắn tin Zalo / Facebook</option>
                <option value="APPOINTMENT">🏢 Hẹn khách qua showroom</option>
                <option value="SEND_QUOTE">🏷️ Gửi bảng báo giá chi tiết</option>
                <option value="CHECK_STOCK">📦 Kiểm tra tồn kho & giữ máy</option>
              </select>
              <input
                type="datetime-local"
                value={nextActionDate}
                onChange={e => setNextActionDate(e.target.value)}
                className="w-full h-8 px-2.5 bg-white border border-zinc-200 rounded-lg text-zinc-700 font-semibold focus:outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="font-bold text-zinc-800 block">Ghi Chú Nhu Cầu / Chi Tiết Tư Vấn:</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Khách muốn mua trả góp 0%, cần máy màu Titan tự nhiên..."
              className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl resize-none focus:outline-none focus:border-[#ff4b16]"
            />
          </div>
        </div>

        </div>
        {/* Footer Actions */}
        <div className="flex shrink-0 items-center justify-end space-x-2.5 border-t border-zinc-100 bg-white p-4 sm:px-6">
          <Button variant="outline" size="md" onClick={onClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            variant="primary"
            size="md"
            isLoading={isSubmitting}
            onClick={handleSave}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Lưu & phân công
          </Button>
        </div>
      </div>
    </div>
  );
};
