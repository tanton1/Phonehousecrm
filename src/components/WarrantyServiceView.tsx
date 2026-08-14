import React, { useState } from 'react';
import { WarrantyTicket, DeviceItem } from '../types';
import { 
  Wrench, 
  Plus, 
  Search, 
  ShieldCheck, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Printer, 
  Smartphone,
  Cpu,
  UserCheck,
  Zap,
  Check
} from 'lucide-react';

interface WarrantyServiceViewProps {
  warrantyTickets: WarrantyTicket[];
  devices: DeviceItem[];
  onAddTicket: (ticket: WarrantyTicket) => void;
  onUpdateTicket: (ticket: WarrantyTicket) => void;
}

export const WarrantyServiceView: React.FC<WarrantyServiceViewProps> = ({
  warrantyTickets,
  devices,
  onAddTicket,
  onUpdateTicket
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeTicketDetails, setActiveTicketDetails] = useState<WarrantyTicket | null>(null);

  // AI Diagnostic State
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [aiDiagnosticResult, setAiDiagnosticResult] = useState<{
    likelyCause: string;
    recommendedAction: string;
    repairTime: string;
    estimatedCostRange: string;
    warrantyTerms: string;
    riskWarning: string;
  } | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<WarrantyTicket>>({
    customerName: '',
    phone: '',
    imei: '',
    model: 'iPhone 13 Pro Max',
    issueType: 'Màn Hình / Cảm Ứng',
    faultDescription: 'Màn hình bị trắng/xanh toàn bộ khi đang lướt mạng',
    technician: 'KTV Trọng',
    isWarrantyFree: true,
    estimatedCost: 0,
    expectedReturnDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]
  });

  const handleLookupDeviceByImei = (imei: string) => {
    const found = devices.find(d => d.imei === imei);
    if (found) {
      setFormData(prev => ({
        ...prev,
        imei: found.imei,
        model: found.model,
        customerName: found.customerName || prev.customerName,
        phone: found.customerPhone || prev.phone
      }));
    }
  };

  const handleRunAIDiagnostic = () => {
    if (!formData.faultDescription) {
      alert('Vui lòng nhập mô tả triệu chứng lỗi trước khi chẩn đoán!');
      return;
    }

    setIsDiagnosing(true);
    setTimeout(() => {
      let cause = 'Lỗi cáp màn hình hoặc câu dây đồng màn 120Hz';
      let action = 'Câu dây đồng xử lý màn xanh trắng không cần thay màn';
      let cost = '500.000đ - 800.000đ (Miễn phí nếu còn BH)';
      
      if (formData.issueType === 'Pin / Nguồn') {
        cause = 'Chai cell pin hoặc đứt socket nguồn IC';
        action = 'Thay pin Zin dung lượng chuẩn + sàng cáp fix % pin';
        cost = '600.000đ - 1.200.000đ';
      } else if (formData.issueType === 'Face ID / Camera') {
        cause = 'Hư hỏng mắt đọc Dot Projector hoặc ẩm nước';
        action = 'Sàng IC FaceID không cần đục keo main';
        cost = '800.000đ - 1.500.000đ';
      }

      setAiDiagnosticResult({
        likelyCause: cause,
        recommendedAction: action,
        repairTime: '1 - 3 Giờ',
        estimatedCostRange: cost,
        warrantyTerms: 'Bảo hành 6 tháng sau sửa chữa',
        riskWarning: 'Kiểm tra kỹ tình trạng sườn vỏ trước khi nhận máy'
      });
      setIsDiagnosing(false);
    }, 400);
  };

  const handleSaveTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName || !formData.phone || !formData.imei) {
      alert('Vui lòng nhập đầy đủ tên khách, SĐT và số IMEI!');
      return;
    }

    const newTicket: WarrantyTicket = {
      id: `WRN-${Date.now().toString().slice(-4)}`,
      ticketNumber: `BH-${Date.now().toString().slice(-4)}`,
      customerName: formData.customerName,
      phone: formData.phone,
      imei: formData.imei,
      model: formData.model || 'iPhone 13 Pro Max',
      issueType: formData.issueType || 'Khác',
      faultDescription: formData.faultDescription || '',
      receivedDate: new Date().toISOString().split('T')[0],
      expectedReturnDate: formData.expectedReturnDate || '',
      technician: formData.technician || 'KTV Trưởng',
      status: 'received',
      estimatedCost: Number(formData.estimatedCost) || 0,
      finalCost: Boolean(formData.isWarrantyFree) ? 0 : (Number(formData.estimatedCost) || 0),
      isWarrantyFree: Boolean(formData.isWarrantyFree),
      aiDiagnostic: aiDiagnosticResult?.recommendedAction
    };

    onAddTicket(newTicket);
    setIsAddModalOpen(false);
    setAiDiagnosticResult(null);
  };

  const filteredTickets = warrantyTickets.filter(ticket => {
    const matchesSearch = 
      ticket.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.phone.includes(searchTerm) ||
      ticket.imei.includes(searchTerm) ||
      ticket.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || ticket.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: WarrantyTicket['status']) => {
    switch (status) {
      case 'received':
        return <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold">Mới Tiếp Nhận</span>;
      case 'inspecting':
        return <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold">Đang Kiểm Tra</span>;
      case 'waiting_parts':
        return <span className="bg-purple-50 text-purple-700 border border-purple-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold">Chờ Linh Kiện</span>;
      case 'repairing':
        return <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold">Đang Sửa Chữa</span>;
      case 'ready':
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold">Đã Sửa Xong</span>;
      case 'delivered':
        return <span className="bg-zinc-100 text-zinc-600 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-medium">Đã Trả Khách</span>;
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 flex items-center space-x-2">
            <span>Bảo Hành 1 Đổi 1 & Sửa Chữa Chuyên Sâu</span>
            <span className="bg-orange-50 text-orange-700 border border-orange-200 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {filteredTickets.length} Phiếu
            </span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Quản lý phiếu tiếp nhận máy bảo hành, theo dõi tiến độ kỹ thuật viên và in phiếu biên nhận cho khách
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-orange-500/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>+ Tiếp Nhận Máy Bảo Hành</span>
        </button>
      </div>

      {/* Filter & Search */}
      <div className="bg-white border border-orange-100 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo Mã phiếu, IMEI (15 số), Tên khách, SĐT..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-orange-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:border-orange-500 font-bold"
          >
            <option value="ALL">Tất Cả Trạng Thái</option>
            <option value="received">Mới Tiếp Nhận</option>
            <option value="repairing">Đang Sửa Chữa</option>
            <option value="completed">Đã Xong (Chờ Trả)</option>
            <option value="delivered">Đã Trả Khách</option>
          </select>
        </div>
      </div>

      {/* Mobile Cards (md:hidden) */}
      <div className="md:hidden space-y-3">
        {filteredTickets.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-zinc-300 text-zinc-500 text-xs">
            Không có phiếu bảo hành nào.
          </div>
        ) : (
          filteredTickets.map((t) => (
            <div 
              key={t.id}
              className="bg-white border border-orange-100 hover:border-orange-300 rounded-2xl p-4 space-y-3 shadow-xs"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-mono text-xs font-black text-orange-600">{t.id}</span>
                  <h3 className="font-bold text-zinc-900 text-sm mt-0.5">{t.customerName} ({t.phone})</h3>
                </div>
                {getStatusBadge(t.status)}
              </div>

              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-xs space-y-1">
                <div className="flex justify-between text-zinc-500">
                  <span>Máy & IMEI:</span>
                  <strong className="text-zinc-900 font-mono">{t.model} ({t.imei.slice(-6)})</strong>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Lỗi tiếp nhận:</span>
                  <span className="text-amber-800 font-medium">{t.issueType}</span>
                </div>
                <p className="text-[11px] text-zinc-600 pt-1 italic">"{t.faultDescription}"</p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-xs text-zinc-500">
                  <span>KTV: <strong className="text-zinc-700">{t.technician}</strong></span>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setActiveTicketDetails(t)}
                    className="p-2 bg-zinc-50 hover:bg-orange-50 text-zinc-700 border border-zinc-200 rounded-xl transition-colors"
                    title="In Phiếu Tiếp Nhận"
                  >
                    <Printer className="w-4 h-4 text-orange-600" />
                  </button>

                  {t.status === 'received' && (
                    <button
                      onClick={() => onUpdateTicket({ ...t, status: 'repairing' })}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-xs"
                    >
                      Bắt Đầu Sửa
                    </button>
                  )}
                  {t.status === 'repairing' && (
                    <button
                      onClick={() => onUpdateTicket({ ...t, status: 'completed' })}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs"
                    >
                      Báo Sửa Xong
                    </button>
                  )}
                  {t.status === 'completed' && (
                    <button
                      onClick={() => onUpdateTicket({ ...t, status: 'delivered' })}
                      className="px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold rounded-xl shadow-xs"
                    >
                      Giao Máy Khách
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table (hidden md:block) */}
      <div className="hidden md:block bg-white border border-orange-100 rounded-3xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs text-zinc-700">
          <thead className="bg-zinc-50 text-zinc-500 uppercase font-bold border-b border-zinc-200 text-[11px]">
            <tr>
              <th className="px-4 py-3.5">Mã Phiếu & Khách Hàng</th>
              <th className="px-4 py-3.5">Dòng Máy & Số IMEI</th>
              <th className="px-4 py-3.5">Lỗi & Chẩn Đoán</th>
              <th className="px-4 py-3.5">Kỹ Thuật Phụ Trách</th>
              <th className="px-4 py-3.5">Chi Phí</th>
              <th className="px-4 py-3.5">Trạng Thái</th>
              <th className="px-4 py-3.5 text-right">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filteredTickets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                  <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30 text-zinc-400" />
                  <p>Không có phiếu bảo hành nào trong danh sách.</p>
                </td>
              </tr>
            ) : (
              filteredTickets.map((t) => (
                <tr key={t.id} className="hover:bg-orange-50/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-mono font-black text-orange-600">{t.id}</div>
                    <div className="font-bold text-zinc-900 text-xs">{t.customerName}</div>
                    <div className="text-[11px] text-zinc-500 font-mono">{t.phone}</div>
                  </td>

                  <td className="px-4 py-3 font-mono">
                    <div className="font-bold text-zinc-900 text-xs">{t.model}</div>
                    <span className="text-[11px] text-zinc-500 font-bold">{t.imei}</span>
                  </td>

                  <td className="px-4 py-3 max-w-xs">
                    <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold">
                      {t.issueType}
                    </span>
                    <p className="text-[11px] text-zinc-600 mt-1 line-clamp-1">{t.faultDescription}</p>
                  </td>

                  <td className="px-4 py-3">
                    <span className="font-bold text-zinc-800">{t.technician}</span>
                    <div className="text-[10px] text-zinc-500">Nhận: {t.receivedDate}</div>
                  </td>

                  <td className="px-4 py-3">
                    {t.isWarrantyFree ? (
                      <span className="text-emerald-700 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">BH Miễn Phí</span>
                    ) : (
                      <span className="text-zinc-900 font-bold font-mono">{t.estimatedCost.toLocaleString('vi-VN')}đ</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {getStatusBadge(t.status)}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end space-x-1.5">
                      <button
                        onClick={() => setActiveTicketDetails(t)}
                        className="p-1.5 bg-zinc-50 hover:bg-orange-50 text-zinc-700 rounded-lg border border-zinc-200"
                        title="In Biên Nhận K80"
                      >
                        <Printer className="w-3.5 h-3.5 text-orange-600" />
                      </button>

                      {t.status === 'received' && (
                        <button
                          onClick={() => onUpdateTicket({ ...t, status: 'repairing' })}
                          className="bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg"
                        >
                          Sửa Máy
                        </button>
                      )}
                      {t.status === 'repairing' && (
                        <button
                          onClick={() => onUpdateTicket({ ...t, status: 'completed' })}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg"
                        >
                          Đã Xong
                        </button>
                      )}
                      {t.status === 'completed' && (
                        <button
                          onClick={() => onUpdateTicket({ ...t, status: 'delivered' })}
                          className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg"
                        >
                          Trả Máy
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: Thêm Phiếu Tiếp Nhận */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-orange-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-r from-orange-50 via-amber-50/50 to-white px-5 py-4 border-b border-orange-100 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Wrench className="w-5 h-5 text-orange-600" />
                <h3 className="font-black text-zinc-900 text-base">Tiếp Nhận Máy Bảo Hành & Sửa Chữa</h3>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-zinc-400 hover:text-zinc-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveTicket} className="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Số IMEI Của Máy *</label>
                  <input
                    type="text"
                    required
                    value={formData.imei}
                    onChange={(e) => {
                      setFormData({ ...formData, imei: e.target.value });
                      handleLookupDeviceByImei(e.target.value);
                    }}
                    placeholder="Nhập 15 số IMEI..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Dòng iPhone</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Tên Khách Hàng *</label>
                  <input
                    type="text"
                    required
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Số Điện Thoại *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Nhóm Hạng Mục Lỗi</label>
                  <select
                    value={formData.issueType}
                    onChange={(e) => setFormData({ ...formData, issueType: e.target.value as any })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-orange-500"
                  >
                    <option value="Màn Hình / Cảm Ứng">Màn Hình / Cảm Ứng (Xanh, Trắng, Sọc)</option>
                    <option value="Pin / Nguồn">Pin / Chai Pin / Sập Nguồn</option>
                    <option value="Face ID / Camera">Face ID / Camera Rung Mờ</option>
                    <option value="Âm Thanh / Loa / Mic">Âm Thanh / Loa Thoại / Mic Rè</option>
                    <option value="Mainboard / IC Sạc">Mainboard / IC Nguồn / Wi-Fi</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Kỹ Thuật Phụ Trách</label>
                  <input
                    type="text"
                    value={formData.technician}
                    onChange={(e) => setFormData({ ...formData, technician: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Fault description */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-zinc-700">Mô Tả Triệu Chứng Của Máy</label>
                  <button
                    type="button"
                    onClick={handleRunAIDiagnostic}
                    disabled={isDiagnosing}
                    className="text-xs text-orange-600 font-bold flex items-center space-x-1 hover:underline"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isDiagnosing ? 'Đang chuẩn đoán...' : 'AI Chẩn Đoán & Báo Giá Nhanh'}</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={formData.faultDescription}
                  onChange={(e) => setFormData({ ...formData, faultDescription: e.target.value })}
                  placeholder="VD: Màn hình xanh trắng, rơi nhẹ đất, sạc không vào..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                />
              </div>

              {/* AI Diagnostic Card */}
              {aiDiagnosticResult && (
                <div className="p-3.5 bg-orange-50/60 border border-orange-200 rounded-2xl space-y-1.5 text-xs">
                  <div className="font-bold text-orange-700 flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>AI Gợi Ý Phương Án Xử Lý:</span>
                  </div>
                  <p className="text-zinc-900 font-medium">{aiDiagnosticResult.recommendedAction}</p>
                  <div className="text-[11px] text-zinc-600">
                    Thời gian: <strong className="text-zinc-800">{aiDiagnosticResult.repairTime}</strong> • Chi phí: <strong className="text-orange-700">{aiDiagnosticResult.estimatedCostRange}</strong>
                  </div>
                </div>
              )}

              {/* Pricing & Free checkbox */}
              <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200 flex items-center justify-between">
                <label className="flex items-center space-x-2 text-xs text-zinc-800 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isWarrantyFree}
                    onChange={(e) => setFormData({ ...formData, isWarrantyFree: e.target.checked })}
                    className="rounded text-orange-500 focus:ring-orange-400"
                  />
                  <span>Bảo Hành Miễn Phí (Theo cam kết 1 đổi 1)</span>
                </label>

                {!formData.isWarrantyFree && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-zinc-600 font-bold">Báo giá:</span>
                    <input
                      type="number"
                      step="50000"
                      value={formData.estimatedCost}
                      onChange={(e) => setFormData({ ...formData, estimatedCost: Number(e.target.value) })}
                      className="w-32 bg-white border border-zinc-300 rounded-lg px-2 py-1 text-xs text-zinc-900 font-mono focus:outline-none focus:border-orange-500"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-zinc-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20"
                >
                  Lưu & In Phiếu Tiếp Nhận
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: In Phiếu Biên Nhận Tiếp Nhận K80 */}
      {activeTicketDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-orange-200 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-3">
              <span className="font-black text-sm text-zinc-900">Phiếu Tiếp Nhận Bảo Hành K80</span>
              <button onClick={() => setActiveTicketDetails(null)} className="text-zinc-400 hover:text-zinc-600 font-bold">✕</button>
            </div>

            {/* Virtual Thermal Slip */}
            <div className="bg-zinc-50 text-black p-4 rounded-xl border border-zinc-300 text-xs font-mono space-y-2 shadow-inner">
              <div className="text-center font-black text-sm uppercase text-orange-600">iStore Care Center</div>
              <div className="text-center text-[10px] text-zinc-600">Hotline Kỹ Thuật: 1900.xxxx</div>
              <div className="border-b border-dashed border-zinc-400 my-2" />

              <div className="flex justify-between font-bold">
                <span>Số Phiếu:</span>
                <span>{activeTicketDetails.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Khách hàng:</span>
                <span>{activeTicketDetails.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span>SĐT:</span>
                <span>{activeTicketDetails.phone}</span>
              </div>
              <div className="flex justify-between">
                <span>Dòng máy:</span>
                <span>{activeTicketDetails.model}</span>
              </div>
              <div className="flex justify-between">
                <span>IMEI:</span>
                <span>{activeTicketDetails.imei}</span>
              </div>

              <div className="pt-2 border-t border-dashed border-zinc-400">
                <div className="font-bold">Tình trạng lỗi:</div>
                <p className="text-[11px] font-sans">{activeTicketDetails.faultDescription}</p>
              </div>

              <div className="pt-2 border-t border-dashed border-zinc-400 flex justify-between font-bold">
                <span>Chi phí tạm tính:</span>
                <span>{activeTicketDetails.isWarrantyFree ? '0 đ (Bảo Hành)' : `${activeTicketDetails.estimatedCost.toLocaleString('vi-VN')} đ`}</span>
              </div>

              <div className="text-[9px] text-zinc-500 pt-2 text-center font-sans">
                * Quý khách vui lòng giữ phiếu này khi nhận lại máy.
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20"
              >
                In Phiếu K80
              </button>
              <button
                onClick={() => setActiveTicketDetails(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
