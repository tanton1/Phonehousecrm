import React, { useState, useEffect } from 'react';
import { X, User, Building2, Phone, Mail, MapPin, FileText, Check } from 'lucide-react';
import { Partner, PartnerType } from '../types';

interface CreatePartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: PartnerType;
  initialPhone?: string;
  initialName?: string;
  branchId?: string;
  onSavePartner: (partner: Partner) => void | Promise<void>;
}

export const CreatePartnerModal: React.FC<CreatePartnerModalProps> = ({
  isOpen,
  onClose,
  defaultType = 'CUSTOMER',
  initialPhone = '',
  initialName = '',
  branchId = '',
  onSavePartner
}) => {
  const [partnerType, setPartnerType] = useState<PartnerType>(defaultType);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [group, setGroup] = useState<'Khách lẻ' | 'Khách quen' | 'VIP' | 'Thợ / Đại lý' | 'NCC Uy tín'>('Khách lẻ');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPartnerType(defaultType);
      setName(initialName);
      setPhone(initialPhone);
      setEmail('');
      setAddress('');
      setTaxCode('');
      setGroup(defaultType === 'SUPPLIER' ? 'NCC Uy tín' : 'Khách lẻ');
      setNotes('');
    }
  }, [isOpen, defaultType, initialName, initialPhone]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Vui lòng nhập họ tên hoặc tên công ty đối tác!');
      return;
    }
    if (!phone.trim()) {
      alert('Vui lòng nhập số điện thoại liên hệ!');
      return;
    }
    if (!branchId || branchId === 'ALL') {
      alert('Vui lòng chọn một chi nhánh cụ thể trước khi tạo đối tác.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newPartner: Partner = {
        id: `${partnerType === 'SUPPLIER' ? 'SUP' : 'CUS'}-${Date.now()}`,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        taxCode: taxCode.trim() || undefined,
        type: partnerType,
        branchId,
        outstandingDebt: 0,
        createdAt: new Date().toISOString().split('T')[0],
        notes: notes.trim() ? `[${group}] ${notes.trim()}` : `[${group}] Tạo từ form nhanh`
      };

      await onSavePartner(newPartner);
      onClose();
    } catch (error) {
      console.error('Error saving partner:', error);
      alert('Không thể lưu đối tác. Vui lòng thử lại!');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-zinc-200/80 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-orange-50/80 to-amber-50/50 border-b border-orange-100/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#ff4b16] text-white flex items-center justify-center shadow-sm font-bold">
              {partnerType === 'SUPPLIER' ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-black text-zinc-900 text-base">
                {partnerType === 'SUPPLIER' ? 'Thêm Nhà Cung Cấp Mới' : 'Thêm Khách Hàng Mới'}
              </h3>
              <p className="text-[11px] text-zinc-500 font-medium">
                Lưu vào danh bạ và tự động chọn vào biểu mẫu đang thao tác
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-white rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* Partner Type Toggle */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1.5">Loại Đối Tác</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'CUSTOMER', label: '👤 Khách Hàng' },
                { id: 'SUPPLIER', label: '🏢 Nhà Cung Cấp' },
                { id: 'BOTH', label: '🔄 Cả Hai' }
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPartnerType(t.id as PartnerType)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    partnerType === t.id
                      ? 'bg-[#ff4b16] text-white shadow-xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                {partnerType === 'SUPPLIER' ? 'Tên Nhà Cung Cấp *' : 'Họ & Tên Khách Hàng *'}
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  required
                  placeholder={partnerType === 'SUPPLIER' ? 'VD: Kho Apple Phúc Khang...' : 'VD: Anh Tuấn, Chị Lan...'}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">Số Điện Thoại / Hotline *</label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="tel"
                  required
                  placeholder="0987654321..."
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
                />
              </div>
            </div>
          </div>

          {/* Group & Tax code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">Phân Nhóm Đối Tác</label>
              <select
                value={group}
                onChange={e => setGroup(e.target.value as any)}
                className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
              >
                {partnerType === 'SUPPLIER' ? (
                  <>
                    <option value="NCC Uy tín">NCC Uy tín / Chiến lược</option>
                    <option value="NCC Phụ kiện">NCC Phụ kiện & Đồ chơi</option>
                    <option value="Thợ / Đại lý">Thợ sỉ / Cửa hàng liên kết</option>
                  </>
                ) : (
                  <>
                    <option value="Khách lẻ">Khách Mua Lẻ Thường</option>
                    <option value="Khách quen">Khách Quen / Giới Thiệu</option>
                    <option value="VIP">Khách Hàng VIP</option>
                    <option value="Thợ / Đại lý">Khách Thợ Sỉ / Đại Lý</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">Mã Số Thuế / CCCD (nếu có)</label>
              <div className="relative">
                <FileText className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="MST công ty hoặc CCCD..."
                  value={taxCode}
                  onChange={e => setTaxCode(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
                />
              </div>
            </div>
          </div>

          {/* Address & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">Địa Chỉ / Tỉnh Thành</label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="VD: 123 Lê Duẩn, Đà Nẵng..."
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">Email / Zalo</label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="email@example.com hoặc Zalo..."
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">Ghi Chú Bổ Sung</label>
            <textarea
              rows={2}
              placeholder="Thông tin thêm về sở thích, chiết khấu, lịch hẹn..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-zinc-100 flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Hủy Bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-[2] py-2.5 bg-[#ff4b16] hover:bg-[#e03e0e] text-white font-bold text-xs rounded-xl shadow-md shadow-orange-500/20 transition-all cursor-pointer flex items-center justify-center space-x-1.5 active:scale-95 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Đang Lưu...' : 'Lưu & Chọn Ngay'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
