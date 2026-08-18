import React, { useState } from 'react';
import { WarrantyTicket, StoreBranch, StaffMember } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { Wrench, Plus, User, Phone, Smartphone, Lock, ShieldCheck, AlertCircle, X } from 'lucide-react';

export interface CreateWarrantyTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: StoreBranch[];
  staffList: StaffMember[];
  currentBranch: StoreBranch;
  currentUser?: StaffMember | null;
  onSaveTicket: (ticket: WarrantyTicket) => Promise<void> | void;
}

export const CreateWarrantyTicketModal: React.FC<CreateWarrantyTicketModalProps> = ({
  isOpen,
  onClose,
  branches,
  staffList,
  currentBranch,
  currentUser,
  onSaveTicket
}) => {
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [model, setModel] = useState('iPhone 13 Pro Max');
  const [imei, setImei] = useState('');
  const [color, setColor] = useState('Xanh Sierra');
  const [storage, setStorage] = useState('128GB');
  const [passcode, setPasscode] = useState('');
  const [icloudStatus, setIcloudStatus] = useState('Đã Thoát / Clean');
  const [deviceAppearance, setDeviceAppearance] = useState('Trầy nhẹ viền, màn đẹp');
  const [issueType, setIssueType] = useState<WarrantyTicket['issueType']>('Pin / Phù Pin');
  const [faultDescription, setFaultDescription] = useState('Pin tụt nhanh, báo bảo trì 74%');
  const [isWarrantyFree, setIsWarrantyFree] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState(650000);
  const [technician, setTechnician] = useState(
    staffList.find(s => s.role === 'TECH' || s.role === 'TECH_LEAD')?.displayName || 'KTV Trưởng'
  );
  const [expectedReturnDate, setExpectedReturnDate] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!customerName.trim() || !phone.trim() || !model.trim()) {
      alert('Vui lòng nhập tên khách hàng, số điện thoại và dòng máy.');
      return;
    }

    setIsSubmitting(true);
    try {
      const ticketNumber = `BH-${new Date().toISOString().slice(2, 7).replace('-', '')}-${Date.now().toString().slice(-4)}`;
      const newTicket: WarrantyTicket = {
        id: `TICKET-${Date.now()}`,
        ticketNumber,
        branchId: currentBranch.id,
        customerName: customerName.trim(),
        phone: phone.trim(),
        model: model.trim(),
        imei: imei.trim() || 'N/A',
        color,
        storage,
        passcode: passcode.trim() || undefined,
        icloudStatus,
        deviceAppearance,
        issueType,
        faultDescription: faultDescription.trim(),
        technician,
        status: 'received',
        isWarrantyFree,
        repairCategory: isWarrantyFree ? 'WARRANTY_FREE' : 'REPAIR_SERVICE',
        estimatedCost: isWarrantyFree ? 0 : estimatedCost,
        finalCost: isWarrantyFree ? 0 : estimatedCost,
        receivedDate: new Date().toISOString().split('T')[0],
        expectedReturnDate,
        partsUsed: []
      };

      await onSaveTicket(newTicket);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-zinc-100">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 text-[#ff4b16] flex items-center justify-center font-bold">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900">Phiếu Tiếp Nhận Bảo Hành & Sửa Chữa</h3>
              <p className="text-xs text-zinc-500">Ghi nhận lỗi, thẩm định máy và gán Kỹ Thuật Viên</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Customer info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-zinc-800 block">Tên Khách Hàng (*):</label>
              <input
                type="text"
                placeholder="Tên khách..."
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-none focus:border-[#ff4b16]"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-zinc-800 block">Số Điện Thoại (*):</label>
              <input
                type="tel"
                placeholder="09..."
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:border-[#ff4b16]"
              />
            </div>
          </div>

          {/* Device details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="space-y-1">
              <label className="font-bold text-zinc-700 block">Dòng Máy (*):</label>
              <input
                type="text"
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full h-9 px-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold focus:border-[#ff4b16]"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-zinc-700 block">IMEI / Seri:</label>
              <input
                type="text"
                placeholder="15 số..."
                value={imei}
                onChange={e => setImei(e.target.value)}
                className="w-full h-9 px-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-zinc-800 focus:border-[#ff4b16]"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-zinc-700 block">Mật Khẩu Màn Hình:</label>
              <input
                type="text"
                placeholder="e.g. 123456"
                value={passcode}
                onChange={e => setPasscode(e.target.value)}
                className="w-full h-9 px-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-[#ff4b16] font-bold focus:border-[#ff4b16]"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-zinc-700 block">Tình Trạng iCloud:</label>
              <select
                value={icloudStatus}
                onChange={e => setIcloudStatus(e.target.value)}
                className="w-full h-9 px-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-medium focus:border-[#ff4b16]"
              >
                <option value="Đã Thoát / Clean">Đã Thoát / Clean</option>
                <option value="Khách Giữ Pass">Khách Giữ Pass</option>
                <option value="Dính iCloud Ẩn">iCloud Ẩn</option>
              </select>
            </div>
          </div>

          {/* Fault & Issue Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-zinc-800 block">Nhóm Lỗi Phần Cứng:</label>
              <select
                value={issueType}
                onChange={e => setIssueType(e.target.value as any)}
                className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:border-[#ff4b16]"
              >
                <option value="Pin / Phù Pin">Pin / Chai Pin / Phù Pin</option>
                <option value="Màn Hình / Cảm Ứng">Màn Hình / Cảm Ứng / Sọc Màn</option>
                <option value="Ép Kính / Thay Lưng">Ép Kính / Thay Lưng</option>
                <option value="Nguồn / Mất Nguồn">Nguồn / Mất Nguồn / Treo Táo</option>
                <option value="Face ID / Camera">Face ID / Camera</option>
                <option value="Sóng / Wifi">Sóng / Wifi / Bluetooth</option>
                <option value="Loa / Mic">Loa / Mic / Rung</option>
                <option value="Mainboard / IC Sạc">Mainboard / IC Sạc</option>
                <option value="Khác">Lỗi Khác</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-zinc-800 block">Kỹ Thuật Viên Tiếp Nhận:</label>
              <input
                type="text"
                value={technician}
                onChange={e => setTechnician(e.target.value)}
                className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold focus:border-[#ff4b16]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-zinc-800 block">Mô Tả Chi Tiết Tình Trạng Lỗi:</label>
            <textarea
              rows={2}
              value={faultDescription}
              onChange={e => setFaultDescription(e.target.value)}
              placeholder="Chi tiết lỗi khách báo hoặc biểu hiện khi test..."
              className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl resize-none focus:outline-none focus:border-[#ff4b16]"
            />
          </div>

          {/* Pricing & Free Warranty Mode */}
          <div className="p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-zinc-800">Chính Sách Bảo Hành / Sửa Chữa:</span>
              </div>

              <div className="flex items-center space-x-2 bg-white p-1 rounded-xl border border-zinc-200">
                <button
                  type="button"
                  onClick={() => setIsWarrantyFree(true)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isWarrantyFree ? 'bg-emerald-600 text-white' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Bảo Hành Miễn Phí (0đ)
                </button>
                <button
                  type="button"
                  onClick={() => setIsWarrantyFree(false)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !isWarrantyFree ? 'bg-[#ff4b16] text-white' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Sửa Dịch Vụ Có Phí
                </button>
              </div>
            </div>

            {!isWarrantyFree && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-200/60">
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 block">Chi Phí Báo Khách Dự Kiến (VNĐ):</label>
                  <input
                    type="number"
                    value={estimatedCost}
                    onChange={e => setEstimatedCost(parseInt(e.target.value, 10) || 0)}
                    className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl font-mono font-bold text-[#ff4b16] focus:border-[#ff4b16]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 block">Ngày Hẹn Trả Máy:</label>
                  <input
                    type="date"
                    value={expectedReturnDate}
                    onChange={e => setExpectedReturnDate(e.target.value)}
                    className="w-full h-9 px-3 bg-white border border-zinc-200 rounded-xl focus:border-[#ff4b16]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 flex items-center justify-end space-x-2.5">
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
            Tạo Phiếu Tiếp Nhận
          </Button>
        </div>
      </div>
    </div>
  );
};
