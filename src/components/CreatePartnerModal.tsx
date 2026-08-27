import React, { useState, useEffect } from 'react';
import { X, User, Building2, Phone, Mail, MapPin, FileText, Check } from 'lucide-react';
import { CustomerTier, Partner, PartnerType, StoreBranch, SupplierCategory } from '../types';
import { HelpHint } from './HelpHint';

interface CreatePartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: PartnerType;
  initialPhone?: string;
  initialName?: string;
  branchId?: string;
  branches?: StoreBranch[];
  branchLocked?: boolean;
  lockType?: boolean;
  onSavePartner: (partner: Partner) => Partner | void | Promise<Partner | void>;
}

export const CreatePartnerModal: React.FC<CreatePartnerModalProps> = ({
  isOpen,
  onClose,
  defaultType = 'CUSTOMER',
  initialPhone = '',
  initialName = '',
  branchId = '',
  branches = [],
  branchLocked = true,
  lockType = false,
  onSavePartner
}) => {
  const [partnerType, setPartnerType] = useState<PartnerType>(defaultType);
  const [selectedBranchId, setSelectedBranchId] = useState(branchId);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [customerTier, setCustomerTier] = useState<CustomerTier>('STANDARD');
  const [supplierCategory, setSupplierCategory] = useState<SupplierCategory>('LIKE_NEW_WHOLESALER');
  const [creditLimit, setCreditLimit] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPartnerType(defaultType);
      setSelectedBranchId(branchId);
      setName(initialName);
      setPhone(initialPhone);
      setEmail('');
      setAddress('');
      setTaxCode('');
      setCustomerTier('STANDARD');
      setSupplierCategory('LIKE_NEW_WHOLESALER');
      setCreditLimit(0);
      setNotes('');
    }
  }, [branchId, isOpen, defaultType, initialName, initialPhone]);

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
    if (!selectedBranchId || selectedBranchId === 'ALL') {
      alert('Vui lòng chọn một chi nhánh cụ thể trước khi tạo đối tác.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newPartner: Partner = {
        id: `${partnerType === 'SUPPLIER' ? 'SUP' : partnerType === 'CUSTOMER' ? 'CUS' : 'PAR'}-${Date.now()}`,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        taxCode: taxCode.trim() || undefined,
        type: partnerType,
        branchId: selectedBranchId,
        ...(['CUSTOMER', 'BOTH'].includes(partnerType) ? { customerTier } : {}),
        ...(['SUPPLIER', 'BOTH'].includes(partnerType) ? { supplierCategory } : {}),
        creditLimit: Math.max(0, Number(creditLimit || 0)),
        outstandingDebt: 0,
        createdAt: new Date().toISOString().split('T')[0],
        notes: notes.trim()
      };

      await onSavePartner(newPartner);
      onClose();
    } catch (error: any) {
      console.error('Error saving partner:', error);
      const message = String(error?.message || '');
      if (message.includes('PARTNER_BRANCH_FORBIDDEN')) {
        alert('Không thể tạo nhà cung cấp: chi nhánh chưa được chọn hoặc tài khoản không có quyền tại chi nhánh này.');
      } else if (message.includes('FORBIDDEN_ROLE')) {
        alert('Tài khoản hiện tại chưa có quyền tạo nhà cung cấp cho chi nhánh này.');
      } else if (message.includes('PARTNER_CREATE_HANDLER_MISSING')) {
        alert('Form nhập hàng chưa được kết nối chức năng lưu nhà cung cấp. Vui lòng tải lại trang.');
      } else if (message.includes('PARTNER_CREATE_NO_SERVER_RESPONSE')) {
        alert('Máy chủ chưa xác nhận nhà cung cấp đã được lưu. Dữ liệu chưa được chọn vào phiếu; vui lòng thử lại.');
      } else if (message.includes('PARTNER_CREATE_BRANCH_MISMATCH')) {
        alert('Nhà cung cấp trả về không thuộc chi nhánh của phiếu nhập. Vui lòng kiểm tra lại chi nhánh.');
      } else if (message.includes('PARTNER_ACCOUNT_TYPE_CONFLICT')) {
        alert('Số điện thoại này đang thuộc một loại đối tác không thể chuyển thành nhà cung cấp.');
      } else if (message.includes('PARTNER_REQUIRED_FIELDS')) {
        alert('Vui lòng nhập đủ tên và số điện thoại nhà cung cấp.');
      } else {
        alert(message ? `Không thể lưu đối tác: ${message}` : 'Không thể lưu đối tác. Vui lòng thử lại!');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div data-ph-fullscreen-form className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[130] flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-none sm:rounded-3xl w-full h-[100dvh] sm:h-auto sm:max-w-lg overflow-hidden shadow-2xl border-0 sm:border border-zinc-200/80 flex flex-col sm:max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-orange-50/80 to-amber-50/50 border-b border-orange-100/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#ff4b16] text-white flex items-center justify-center shadow-sm font-bold">
              {partnerType === 'SUPPLIER' ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-zinc-900 text-base">
                {partnerType === 'SUPPLIER' ? 'Thêm Nhà Cung Cấp Mới' : partnerType === 'BOTH' ? 'Thêm Đối Tác Hai Chiều' : 'Thêm Khách Hàng Mới'}
              </h3>
              <HelpHint title="Tạo đối tác">Sau khi lưu, đối tác được thêm vào danh bạ và tự chọn cho form đang mở.</HelpHint>
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
          <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-black text-zinc-800">Chi nhánh quản lý <span className="text-rose-500">*</span></label>
              <HelpHint title="Đối tác theo chi nhánh">Công nợ, phiếu nhập, hóa đơn và thanh toán của đối tác chỉ thuộc chi nhánh này. Sau khi phát sinh giao dịch, không được đổi chi nhánh.</HelpHint>
            </div>
            <select
              required
              disabled={branchLocked}
              value={selectedBranchId}
              onChange={event => setSelectedBranchId(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-orange-200 bg-white px-3 text-sm font-bold text-zinc-900 outline-none focus:border-[#ff4b16] disabled:cursor-not-allowed disabled:bg-orange-50 disabled:text-zinc-700"
            >
              <option value="">-- Chọn chi nhánh --</option>
              {branches.filter(branch => branch.isActive !== false).map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
              {selectedBranchId && !branches.some(branch => branch.id === selectedBranchId) && (
                <option value={selectedBranchId}>{selectedBranchId}</option>
              )}
            </select>
            <p className="mt-1.5 text-[10px] leading-4 text-orange-900/70">
              {branchLocked ? 'Được lấy từ chi nhánh đang làm việc/phiếu nhập và khóa để tránh tạo nhầm.' : 'Admin phải chọn một chi nhánh cụ thể trước khi lưu.'}
            </p>
          </div>

          {/* Partner Type Toggle */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1.5">Loại Đối Tác</label>
            <div className={`grid grid-cols-3 gap-2 ${lockType ? 'pointer-events-none opacity-80' : ''}`}>
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

          {/* Business classification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['SUPPLIER', 'BOTH'].includes(partnerType)) && <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">Nhóm Nhà Cung Cấp</label>
              <select
                value={supplierCategory}
                onChange={e => setSupplierCategory(e.target.value as SupplierCategory)}
                className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all"
              >
                <option value="OFFICIAL_DISTRIBUTOR">Nhà phân phối chính hãng</option>
                <option value="LIKE_NEW_WHOLESALER">Nguồn máy / Hàng sỉ</option>
                <option value="COMPONENTS">Linh kiện &amp; Phụ kiện</option>
                {!lockType && <option value="FINANCE_PARTNER">Đối tác tài chính</option>}
              </select>
            </div>}

            {(['CUSTOMER', 'BOTH'].includes(partnerType)) && <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">Nhóm Khách Hàng</label>
              <select value={customerTier} onChange={e => setCustomerTier(e.target.value as CustomerTier)} className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all">
                <option value="STANDARD">Khách tiêu chuẩn</option>
                <option value="SILVER">Khách Bạc</option>
                <option value="GOLD">Khách Vàng</option>
                <option value="DIAMOND">Khách Kim cương</option>
                <option value="WHOLESALE">Khách sỉ / Đại lý</option>
              </select>
            </div>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

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

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">Hạn Mức Công Nợ</label>
              <input type="number" min="0" step="1000" value={creditLimit} onChange={e => setCreditLimit(Number(e.target.value))} className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono font-medium focus:bg-white focus:outline-none focus:border-[#ff4b16] transition-all" />
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
