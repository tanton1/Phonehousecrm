import React, { useState } from 'react';
import { Lead, DeviceItem } from '../types';
import { 
  Users, 
  Plus, 
  Search, 
  Sparkles, 
  MessageSquare, 
  Phone, 
  Calendar, 
  CheckCircle, 
  DollarSign, 
  ArrowRight, 
  Copy, 
  Check, 
  RefreshCw, 
  ExternalLink,
  Flame,
  UserCheck,
  Send,
  Zap,
  Tag
} from 'lucide-react';

interface CRMLeadsViewProps {
  leads: Lead[];
  devices: DeviceItem[];
  onAddLead: (lead: Lead) => void;
  onUpdateLead: (lead: Lead) => void;
  onConvertLeadToSale: (lead: Lead) => void;
}

export const CRMLeadsView: React.FC<CRMLeadsViewProps> = ({
  leads,
  devices,
  onAddLead,
  onUpdateLead,
  onConvertLeadToSale
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [activeAIModalLead, setActiveAIModalLead] = useState<Lead | null>(null);

  // AI Message Generation State
  const [aiScenario, setAiScenario] = useState('Chốt deal giữ máy iPhone hot');
  const [aiGeneratedText, setAiGeneratedText] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // New Lead Form State
  const [formData, setFormData] = useState<Partial<Lead>>({
    name: '',
    phone: '',
    zalo: '',
    source: 'Facebook Ads',
    interestedModel: 'iPhone 16 Pro Max 256GB Desert',
    budget: 34000000,
    tradeInRequired: false,
    tradeInModel: '',
    status: 'new',
    assignedStaff: 'Tuấn Bán Hàng',
    followUpDate: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const filteredLeads = leads.filter(l => {
    const matchesSearch = 
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.phone.includes(searchTerm) ||
      l.interestedModel.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.notes && l.notes.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = selectedStatusFilter === 'ALL' || l.status === selectedStatusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleSaveLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      alert('Vui lòng nhập tên và số điện thoại khách hàng!');
      return;
    }

    const newLead: Lead = {
      id: `LEAD-${Date.now().toString().slice(-4)}`,
      name: formData.name,
      phone: formData.phone,
      zalo: formData.zalo || formData.phone,
      source: (formData.source as any) || 'Facebook Ads',
      interestedModel: formData.interestedModel || 'iPhone 15 Pro Max',
      budget: Number(formData.budget) || 20000000,
      tradeInRequired: Boolean(formData.tradeInRequired),
      tradeInModel: formData.tradeInModel || '',
      status: (formData.status as any) || 'new',
      assignedStaff: formData.assignedStaff || 'Tuấn Bán Hàng',
      followUpDate: formData.followUpDate || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString().split('T')[0],
      notes: formData.notes || ''
    };

    onAddLead(newLead);
    setIsAddLeadModalOpen(false);
    setFormData({
      name: '',
      phone: '',
      zalo: '',
      source: 'Facebook Ads',
      interestedModel: 'iPhone 16 Pro Max 256GB Desert',
      budget: 34000000,
      tradeInRequired: false,
      tradeInModel: '',
      status: 'new',
      assignedStaff: 'Tuấn Bán Hàng',
      followUpDate: new Date().toISOString().split('T')[0],
      notes: ''
    });
  };

  const handleGenerateScript = (lead: Lead) => {
    setActiveAIModalLead(lead);
    setIsGeneratingAI(true);
    setAiGeneratedText('');

    setTimeout(() => {
      let script = '';
      if (aiScenario.includes('Chốt deal')) {
        script = `Dạ em chào anh/chị ${lead.name} ạ! Em là ${lead.assignedStaff} từ iStore Pro. Bên em vừa về đúng 1 cây ${lead.interestedModel} zin keng ${lead.tradeInRequired ? `(hỗ trợ thu cũ lên đời trợ giá đến 2.000.000đ cho cây ${lead.tradeInModel || 'cũ'})` : ''}. Em đang giữ ưu đãi tặng gói dán cường lực KingKong trọn đời và củ sạc nhanh 20W cho anh/chị hôm nay. Anh/chị ghé shop em lúc 15h hay 18h để trải nghiệm máy trực tiếp ạ?`;
      } else if (aiScenario.includes('Thu cũ')) {
        script = `Chào ${lead.name} thân mến! Về chương trình Thu Cũ Đổi Mới ${lead.tradeInModel || 'máy cũ'} lên ${lead.interestedModel}, iStore Pro đang trợ giá thêm 1.500.000đ trực tiếp vào giá máy mới. Phần chênh lệch mình có thể quẹt thẻ trả góp 0% lãi suất mỗi tháng chỉ từ 800k. Em xin phép gửi bảng định giá chi tiết qua Zalo nhé ạ!`;
      } else {
        script = `Dạ ${lead.name} ơi, cây ${lead.interestedModel} anh/chị quan tâm hôm nay đang có voucher giảm trực tiếp 500k cho khách hàng đặt cọc online trước. Shop cam kết pin zin chuẩn, bao test 1 đổi 1 trong 30 ngày. Anh/chị có muốn em giữ máy đến tối nay không ạ?`;
      }
      setAiGeneratedText(script);
      setIsGeneratingAI(false);
    }, 600);
  };

  const getStatusBadge = (status: Lead['status']) => {
    switch (status) {
      case 'new':
        return <span className="bg-orange-50 text-orange-700 border border-orange-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold">Mới Nhận</span>;
      case 'contacted':
        return <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold">Đã Tư Vấn</span>;
      case 'negotiating':
        return <span className="bg-yellow-50 text-yellow-800 border border-yellow-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold">Đang Thương Lượng</span>;
      case 'deposit':
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold">Đã Đặt Cọc</span>;
      case 'won':
        return <span className="bg-emerald-600 text-white text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold shadow-xs">Đã Chốt Sale</span>;
      case 'lost':
        return <span className="bg-zinc-100 text-zinc-600 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-medium">Hủy / Mất Khách</span>;
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 flex items-center space-x-2">
            <span>Quản Lý Quan Hệ Khách Hàng (CRM)</span>
            <span className="bg-orange-50 text-orange-700 border border-orange-200 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {filteredLeads.length} Lead
            </span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Theo dõi khách hàng tiềm năng đa kênh (Facebook Ads, TikTok, Zalo, Giới thiệu) và kịch bản chốt sale
          </p>
        </div>

        <button
          onClick={() => setIsAddLeadModalOpen(true)}
          className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-orange-500/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>+ Thêm Lead Khách Hàng</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-orange-100 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo tên, SĐT, máy quan tâm, ghi chú..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-orange-500"
            />
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full sm:w-auto bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-800 focus:outline-none focus:border-orange-500 font-bold"
            >
              <option value="ALL">Tất Cả Trạng Thái</option>
              <option value="new">Mới Nhận (Chưa Gọi)</option>
              <option value="contacted">Đang Tư Vấn</option>
              <option value="appraisal_scheduled">Hẹn Thẩm Định / Xem Máy</option>
              <option value="deposit_paid">Đã Cọc Giữ Máy</option>
              <option value="won">Thành Công (Đã Mua)</option>
              <option value="lost">Đã Mất Lead</option>
            </select>
          </div>
        </div>
      </div>

      {/* Leads List: Mobile Cards + Desktop Responsive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredLeads.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white rounded-2xl border border-dashed border-zinc-300 text-zinc-500 text-xs">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30 text-zinc-400" />
            <p>Không tìm thấy khách hàng nào khớp điều kiện tìm kiếm.</p>
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <div 
              key={lead.id}
              className="bg-white border border-orange-100 hover:border-orange-300 rounded-2xl p-4 space-y-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              {/* Header */}
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-black text-zinc-900 text-base">{lead.name}</h3>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <a href={`tel:${lead.phone}`} className="text-xs font-mono text-orange-600 font-bold hover:underline flex items-center space-x-1">
                        <Phone className="w-3 h-3" />
                        <span>{lead.phone}</span>
                      </a>
                      <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.2 rounded font-medium">
                        {lead.source}
                      </span>
                    </div>
                  </div>
                  {getStatusBadge(lead.status)}
                </div>

                {/* Demand & Trade-in Info */}
                <div className="mt-3 p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Máy quan tâm:</span>
                    <strong className="text-zinc-900 font-bold">{lead.interestedModel}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Ngân sách:</span>
                    <span className="text-orange-600 font-bold font-mono">{lead.budget.toLocaleString('vi-VN')} đ</span>
                  </div>
                  {lead.tradeInRequired && (
                    <div className="flex items-center justify-between text-amber-800 font-medium pt-1 border-t border-zinc-200">
                      <span className="flex items-center space-x-1">
                        <RefreshCw className="w-3 h-3 text-amber-600" />
                        <span>Cần thu cũ:</span>
                      </span>
                      <span>{lead.tradeInModel || 'Chưa rõ đời'}</span>
                    </div>
                  )}
                  {lead.notes && (
                    <p className="text-[11px] text-zinc-600 italic pt-1 border-t border-zinc-200">
                      "{lead.notes}"
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Phụ trách: <strong className="text-zinc-700">{lead.assignedStaff}</strong></span>
                  <span>Hẹn: {lead.followUpDate}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleGenerateScript(lead)}
                    className="py-2 px-2.5 bg-zinc-50 hover:bg-orange-50/60 text-zinc-700 hover:text-orange-700 border border-zinc-200 hover:border-orange-300 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                    <span>AI Kịch Bản Zalo</span>
                  </button>

                  <button
                    onClick={() => onConvertLeadToSale(lead)}
                    className="py-2 px-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-xs shadow-orange-500/20 active:scale-95"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Chốt Đơn POS</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL: Thêm Lead Mới */}
      {isAddLeadModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-orange-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-r from-orange-50 via-amber-50/50 to-white px-5 py-4 border-b border-orange-100 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-orange-600" />
                <h3 className="font-black text-zinc-900 text-base">Thêm Lead Khách Hàng Tiềm Năng</h3>
              </div>
              <button onClick={() => setIsAddLeadModalOpen(false)} className="text-zinc-400 hover:text-zinc-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveLead} className="p-5 space-y-3.5 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Tên Khách Hàng *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="VD: Anh Minh"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Số Điện Thoại / Zalo *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value, zalo: e.target.value })}
                    placeholder="0909xxxxxx"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Nguồn Lead</label>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value as any })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-orange-500"
                  >
                    <option value="Facebook Ads">Facebook Ads</option>
                    <option value="TikTok Shop/Live">TikTok Shop / Video</option>
                    <option value="Zalo Official Account">Zalo OA</option>
                    <option value="Khách Vãng Lai Ghé Shop">Khách Vãng Lai</option>
                    <option value="Bạn Bè Giới Thiệu">Bạn Bè Giới Thiệu</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Dòng Máy Quan Tâm</label>
                  <input
                    type="text"
                    value={formData.interestedModel}
                    onChange={(e) => setFormData({ ...formData, interestedModel: e.target.value })}
                    placeholder="iPhone 16 Pro Max 256GB"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Ngân Sách Dự Kiến (VNĐ)</label>
                  <input
                    type="number"
                    step="500000"
                    value={formData.budget}
                    onChange={(e) => setFormData({ ...formData, budget: Number(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Trạng Thái Lead</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-orange-500 font-bold"
                  >
                    <option value="new">Mới Nhận (New)</option>
                    <option value="contacted">Đã Liên Hệ (Contacted)</option>
                    <option value="appraisal_scheduled">Hẹn Xem Máy / Thu Cũ</option>
                    <option value="deposit_paid">Đã Giữ Cọc</option>
                  </select>
                </div>
              </div>

              {/* Trade-in checkbox */}
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2">
                <label className="flex items-center space-x-2 text-xs text-zinc-800 cursor-pointer font-bold">
                  <input
                    type="checkbox"
                    checked={formData.tradeInRequired}
                    onChange={(e) => setFormData({ ...formData, tradeInRequired: e.target.checked })}
                    className="rounded text-orange-500 focus:ring-orange-400"
                  />
                  <span>Khách có nhu cầu Thu Cũ Đổi Mới (Trade-in)</span>
                </label>
                {formData.tradeInRequired && (
                  <input
                    type="text"
                    placeholder="Nhập tên máy cũ của khách (VD: iPhone 13 Pro 128GB Gold)"
                    value={formData.tradeInModel}
                    onChange={(e) => setFormData({ ...formData, tradeInModel: e.target.value })}
                    className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-orange-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Ghi Chú Nhu Cầu</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Ghi chú màu sắc yêu thích, ngày có lương..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:border-orange-500"
                />
              </div>

              <div className="pt-2 border-t border-zinc-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddLeadModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold rounded-xl text-xs shadow-md shadow-orange-500/20"
                >
                  Lưu Khách Hàng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AI Kịch Bản Tư Vấn Zalo */}
      {activeAIModalLead && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-orange-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-r from-orange-50 via-amber-50/50 to-white px-5 py-4 border-b border-orange-100 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-orange-600 animate-pulse" />
                <h3 className="font-black text-zinc-900 text-base">AI Copilot • Kịch Bản Chốt Deal Zalo</h3>
              </div>
              <button onClick={() => setActiveAIModalLead(null)} className="text-zinc-400 hover:text-zinc-600 font-bold">✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Chọn Kịch Bản Tư Vấn</label>
                <select
                  value={aiScenario}
                  onChange={(e) => {
                    setAiScenario(e.target.value);
                  }}
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-orange-500 font-bold"
                >
                  <option value="Chốt deal giữ máy iPhone hot">Kịch bản 1: Giữ máy + Quà tặng dán cường lực trọn đời</option>
                  <option value="Thu cũ trợ giá 2 triệu">Kịch bản 2: Thu cũ đổi mới trợ giá 2 Triệu + Trả góp 0%</option>
                  <option value="Voucher cọc trước">Kịch bản 3: Tặng voucher 500k khi đặt cọc online</option>
                </select>
              </div>

              <button
                onClick={() => handleGenerateScript(activeAIModalLead)}
                disabled={isGeneratingAI}
                className="w-full py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 shadow-xs"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isGeneratingAI ? 'Đang soạn tin nhắn AI...' : 'Tạo Kịch Bản Mới Với AI'}</span>
              </button>

              {aiGeneratedText && (
                <div className="space-y-2">
                  <div className="bg-orange-50/50 p-3.5 rounded-2xl border border-orange-200 text-xs text-zinc-800 leading-relaxed font-sans">
                    {aiGeneratedText}
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(aiGeneratedText);
                        setCopiedText(true);
                        setTimeout(() => setCopiedText(false), 2000);
                      }}
                      className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5"
                    >
                      {copiedText ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-orange-600" />}
                      <span>{copiedText ? 'Đã Sao Chép!' : 'Sao Chép Tin Nhắn'}</span>
                    </button>

                    <a
                      href={`https://zalo.me/${activeAIModalLead.phone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1"
                    >
                      <span>Mở Zalo</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
