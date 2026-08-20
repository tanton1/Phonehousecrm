import React, { useState, useMemo } from 'react';
import { Lead, StoreBranch, StaffMember, LeadNextAction } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { normalizeVietnamPhone, formatDisplayPhone } from '../../../utils/phoneUtils';
import { Users, Plus, Phone, User, MessageSquare, Smartphone, Tag, X, AlertTriangle, Calendar, CheckCircle } from 'lucide-react';

export interface CreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: StoreBranch[];
  staffList: StaffMember[];
  currentBranch: StoreBranch;
  currentUser?: StaffMember | null;
  existingLeads?: Lead[];
  onSaveLead: (lead: Lead) => Promise<void> | void;
}

export const CreateLeadModal: React.FC<CreateLeadModalProps> = ({
  isOpen,
  onClose,
  branches,
  staffList,
  currentBranch,
  currentUser,
  existingLeads = [],
  onSaveLead
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [zalo, setZalo] = useState('');
  const [source, setSource] = useState<'Facebook Ads' | 'TikTok' | 'Zalo OA' | 'Khách Vãng Lai' | 'Khách Quen Giới Thiệu'>('Facebook Ads');
  const [demandModel, setDemandModel] = useState('iPhone 15 Pro Max');
  const [budget, setBudget] = useState(25000000);
  const [selectedStaffId, setSelectedStaffId] = useState<string>(currentUser?.uid || currentUser?.id || staffList[0]?.id || staffList[0]?.uid || '');
  const [nextActionType, setNextActionType] = useState<LeadNextAction['type']>('CALL');
  const [nextActionDate, setNextActionDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Real-time Duplicate Phone Detection
  const duplicateLead = useMemo(() => {
    const norm = normalizeVietnamPhone(phone);
    if (!norm || norm.length < 9) return null;
    return existingLeads.find(l => normalizeVietnamPhone(l.phone) === norm || l.phoneNormalized === norm);
  }, [phone, existingLeads]);

  if (!isOpen) return null;

  const assignedStaffObj = staffList.find(s => s.id === selectedStaffId || s.uid === selectedStaffId);
  const assignedStaffName = assignedStaffObj?.name || assignedStaffObj?.displayName || currentUser?.displayName || 'Nhân viên tư vấn';

  const handleApplyDuplicate = () => {
    if (duplicateLead) {
      setName(duplicateLead.name);
      if (duplicateLead.zalo) setZalo(duplicateLead.zalo);
      if (duplicateLead.source) setSource(duplicateLead.source);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      alert('Vui lòng nhập tên và số điện thoại khách hàng.');
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
        assignedStaffId: selectedStaffId,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-zinc-100 space-y-4 max-h-[90vh] overflow-y-auto">
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

          {/* Budget & Assigned Staff */}
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
              <label className="font-bold text-zinc-800 block">Nhân Viên Phụ Trách:</label>
              <select
                value={selectedStaffId}
                onChange={e => setSelectedStaffId(e.target.value)}
                className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-[#ff4b16]"
              >
                {staffList.length > 0 ? (
                  staffList.map(s => (
                    <option key={s.id || s.uid} value={s.id || s.uid}>
                      {s.name || s.displayName} ({s.role})
                    </option>
                  ))
                ) : (
                  <option value={currentUser?.uid || 'STAFF_01'}>{currentUser?.displayName || 'Nhân viên tư vấn'}</option>
                )}
              </select>
            </div>
          </div>

          {/* Next Action Plan */}
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-2xl space-y-2">
            <label className="font-bold text-zinc-800 block flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#ff4b16]" />
              <span>Kế Hoạch Chăm Sóc Kế Tiếp (Next Action):</span>
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
                type="date"
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

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-zinc-100">
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
            Lưu Khách Tiềm Năng
          </Button>
        </div>
      </div>
    </div>
  );
};
