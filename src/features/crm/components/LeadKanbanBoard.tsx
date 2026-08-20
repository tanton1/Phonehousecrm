import React, { useState } from 'react';
import { Lead, LeadStatus, StaffMember, LeadCareActivity } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
import { LeadCardCareBadge } from './LeadCardCareBadge';
import { 
  Users, 
  Plus, 
  Phone, 
  Clock, 
  ChevronRight, 
  Smartphone, 
  AlertCircle, 
  CheckCircle2, 
  DollarSign, 
  Filter,
  XCircle,
  AlertTriangle,
  X
} from 'lucide-react';

export interface LeadKanbanBoardProps {
  leads: Lead[];
  activities?: LeadCareActivity[];
  onSelectLead: (lead: Lead) => void;
  onUpdateLeadStatus: (leadId: string, newStatus: LeadStatus, lostReason?: string) => Promise<void> | void;
  onOpenCreateModal: () => void;
  onOpenCareModal?: (lead: Lead) => void;
}

const STAGES: { id: LeadStatus; label: string; color: string; badgeBg: string }[] = [
  { id: 'new', label: 'Mới Tiếp Nhận', color: 'border-blue-500', badgeBg: 'bg-blue-50 text-blue-700' },
  { id: 'contacted', label: 'Đã Liên Hệ', color: 'border-amber-500', badgeBg: 'bg-amber-50 text-amber-700' },
  { id: 'negotiating', label: 'Đang Tư Vấn', color: 'border-purple-500', badgeBg: 'bg-purple-50 text-purple-700' },
  { id: 'appointment_scheduled', label: 'Hẹn Qua Shop', color: 'border-cyan-500', badgeBg: 'bg-cyan-50 text-cyan-700' },
  { id: 'deposit', label: 'Đã Đặt Cọc', color: 'border-indigo-500', badgeBg: 'bg-indigo-50 text-indigo-700' },
  { id: 'won', label: 'Đã Mua (Thành Công)', color: 'border-emerald-500', badgeBg: 'bg-emerald-50 text-emerald-700' },
  { id: 'lost', label: 'Thất Bại / Hủy', color: 'border-rose-500', badgeBg: 'bg-rose-50 text-rose-700' }
];

const LOST_REASONS = [
  'Giá cao / Chênh lệch ngân sách',
  'Không liên hệ được / Không nghe máy',
  'Đã mua tại cửa hàng khác',
  'Chưa đủ tài chính cá nhân',
  'Không duyệt hồ sơ trả góp ngân hàng',
  'Đổi nhu cầu / Mua dòng máy khác',
  'Cửa hàng tạm hết máy sẵn phù hợp',
  'Khách hoãn kế hoạch mua máy',
  'Spam / Khách bấm nhầm số',
  'Khác'
];

export const LeadKanbanBoard: React.FC<LeadKanbanBoardProps> = ({
  leads,
  activities = [],
  onSelectLead,
  onUpdateLeadStatus,
  onOpenCreateModal,
  onOpenCareModal
}) => {
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [selectedMobileStage, setSelectedMobileStage] = useState<string>('ALL');

  // Lost Reason Dialog State
  const [lostTargetLead, setLostTargetLead] = useState<Lead | null>(null);
  const [selectedLostReason, setSelectedLostReason] = useState(LOST_REASONS[0]);
  const [lostReasonDetails, setLostReasonDetails] = useState('');
  const [isSubmittingLost, setIsSubmittingLost] = useState(false);

  const filteredLeads = leads.filter(l => {
    return sourceFilter === 'ALL' || l.source === sourceFilter;
  });

  const nextStageMap: Record<LeadStatus, LeadStatus | null> = {
    new: 'contacted',
    contacted: 'negotiating',
    negotiating: 'appointment_scheduled',
    consulting: 'appointment_scheduled',
    appointment_scheduled: 'deposit',
    deposit: 'won',
    deposit_paid: 'won',
    won: null,
    lost: null
  };

  const handleConfirmLost = async () => {
    if (!lostTargetLead) return;
    setIsSubmittingLost(true);
    try {
      const fullReason = lostReasonDetails.trim() 
        ? `${selectedLostReason} - ${lostReasonDetails.trim()}` 
        : selectedLostReason;
      await onUpdateLeadStatus(lostTargetLead.id, 'lost', fullReason);
      setLostTargetLead(null);
      setLostReasonDetails('');
    } finally {
      setIsSubmittingLost(false);
    }
  };

  const getSLABadge = (lead: Lead) => {
    if (lead.status !== 'new' && lead.status !== 'contacted') return null;
    const createdTime = lead.createdAt ? new Date(lead.createdAt).getTime() : Date.now();
    const minutesPassed = Math.floor((Date.now() - createdTime) / (1000 * 60));

    if (minutesPassed < 5) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          ⚡ &lt;5p
        </span>
      );
    }
    if (minutesPassed <= 15) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          ⚠️ {minutesPassed}p
        </span>
      );
    }
    if (minutesPassed <= 30) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
          ⏳ {minutesPassed}p
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse flex items-center gap-0.5">
        <AlertTriangle className="w-2.5 h-2.5" />
        <span>Quá SLA ({minutesPassed}p)</span>
      </span>
    );
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 1. Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#ff4b16] flex items-center justify-center font-bold">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
              Pipeline Khách Hàng Tiềm Năng ({leads.length} Leads)
            </h3>
            <p className="text-[11px] text-zinc-500">Quản lý quy trình chuyển đổi và SLA chăm sóc khách hàng</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 focus:outline-none focus:border-[#ff4b16]"
          >
            <option value="ALL">Tất Cả Nguồn Lead</option>
            <option value="Facebook Ads">Facebook Ads</option>
            <option value="TikTok">TikTok</option>
            <option value="Zalo OA">Zalo OA</option>
            <option value="Khách Vãng Lai">Khách Vãng Lai</option>
            <option value="Khách Quen Giới Thiệu">Khách Quen</option>
          </select>

          <Button
            variant="primary"
            size="sm"
            onClick={onOpenCreateModal}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Thêm Lead
          </Button>
        </div>
      </div>

      {/* 2. Mobile Stage Tabs (lg:hidden) */}
      <div className="lg:hidden flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedMobileStage('ALL')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            selectedMobileStage === 'ALL'
              ? 'bg-[#ff4b16] text-white shadow-xs'
              : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          Tất Cả ({filteredLeads.length})
        </button>
        {STAGES.map(stage => {
          const count = filteredLeads.filter(l => {
            if (stage.id === 'deposit') return l.status === 'deposit' || l.status === 'deposit_paid';
            return l.status === stage.id;
          }).length;

          return (
            <button
              key={stage.id}
              onClick={() => setSelectedMobileStage(stage.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
                selectedMobileStage === stage.id
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              <span>{stage.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                selectedMobileStage === stage.id ? 'bg-zinc-700 text-white' : 'bg-zinc-100 text-zinc-600'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Kanban Board Horizontal / Filtered View */}
      <div className="flex space-x-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-200 items-start min-h-[550px]">
        {STAGES.filter(stage => selectedMobileStage === 'ALL' || selectedMobileStage === stage.id).map(stage => {
          const stageLeads = filteredLeads.filter(l => {
            if (stage.id === 'deposit') {
              return l.status === 'deposit' || l.status === 'deposit_paid';
            }
            return l.status === stage.id;
          });

          return (
            <div
              key={stage.id}
              className={`shrink-0 bg-zinc-100/70 border border-zinc-200/80 rounded-2xl p-3 flex flex-col max-h-[75vh] ${
                selectedMobileStage !== 'ALL' ? 'w-full' : 'w-72'
              }`}
            >
              {/* Stage Header */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200/80">
                <div className="flex items-center space-x-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full border-2 ${stage.color} bg-white`} />
                  <h4 className="text-xs font-bold text-zinc-800 truncate">{stage.label}</h4>
                </div>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-white text-zinc-600 border border-zinc-200">
                  {stageLeads.length}
                </span>
              </div>

              {/* Stage Cards List */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin scrollbar-thumb-zinc-200">
                {stageLeads.length === 0 ? (
                  <div className="p-4 text-center text-zinc-400 text-[11px] italic">
                    Không có khách hàng ở giai đoạn này
                  </div>
                ) : (
                  stageLeads.map(lead => {
                    const nextStage = nextStageMap[lead.status];

                    return (
                      <div
                        key={lead.id}
                        onClick={() => onSelectLead(lead)}
                        className="p-3 bg-white border border-zinc-200/80 hover:border-zinc-300 rounded-xl shadow-2xs hover:shadow-sm transition-all cursor-pointer space-y-2 select-none group"
                      >
                        {/* Top: Name & Source / SLA */}
                        <div className="flex items-center justify-between gap-1">
                          <h5 className="font-bold text-zinc-900 text-xs truncate max-w-[130px]">
                            {lead.name}
                          </h5>
                          <div className="flex items-center space-x-1 shrink-0">
                            {getSLABadge(lead)}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${stage.badgeBg}`}>
                              {lead.source}
                            </span>
                          </div>
                        </div>

                        {/* Phone & Model */}
                        <div className="space-y-1 text-[11px] text-zinc-600">
                          <div className="flex items-center space-x-1 font-mono text-zinc-800 font-semibold">
                            <Phone className="w-3 h-3 text-zinc-400" />
                            <span>{lead.phone}</span>
                          </div>

                          {lead.interestedModel && (
                            <div className="flex items-center space-x-1 text-zinc-600 truncate">
                              <Smartphone className="w-3 h-3 text-zinc-400 shrink-0" />
                              <span className="truncate">{lead.interestedModel}</span>
                            </div>
                          )}

                          {lead.lostReason && stage.id === 'lost' && (
                            <div className="p-1.5 bg-rose-50 border border-rose-200 rounded text-[10px] text-rose-800 font-medium">
                              Lý do: {lead.lostReason}
                            </div>
                          )}
                        </div>

                        {/* Care Progress & SLA Badge */}
                        <LeadCardCareBadge
                          lead={lead}
                          activities={activities}
                          onOpenCareModal={onOpenCareModal}
                        />

                        {/* Budget & Actions */}
                        <div className="pt-1.5 border-t border-zinc-100 flex items-center justify-between text-[10px]">
                          {lead.budget ? (
                            <span className="font-mono font-bold text-[#ff4b16]">
                              ~{(lead.budget / 1_000_000).toFixed(1)}tr
                            </span>
                          ) : (
                            <span className="text-zinc-400">Chưa rõ ngân sách</span>
                          )}

                          <div className="flex items-center space-x-1">
                            {stage.id !== 'won' && stage.id !== 'lost' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLostTargetLead(lead);
                                }}
                                className="p-1 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 rounded transition-colors"
                                title="Đánh dấu thất bại / hủy"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {nextStage && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateLeadStatus(lead.id, nextStage);
                                }}
                                className="px-2 py-1 bg-zinc-100 hover:bg-orange-100 text-zinc-700 hover:text-[#ff4b16] font-bold rounded-lg transition-colors flex items-center space-x-1 cursor-pointer active:scale-95"
                                title="Chuyển sang giai đoạn tiếp theo"
                              >
                                <span>Chuyển ➔</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Lost Reason Dialog Modal */}
      {lostTargetLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-zinc-100 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                  <XCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-900">Lý Do Lead Thất Bại</h4>
                  <p className="text-[11px] text-zinc-500">{lostTargetLead.name} ({lostTargetLead.interestedModel})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLostTargetLead(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-zinc-800 block">Chọn Lý Do Thất Bại (*):</label>
                <select
                  value={selectedLostReason}
                  onChange={e => setSelectedLostReason(e.target.value)}
                  className="w-full h-9 px-3 bg-zinc-50 border border-zinc-200 rounded-xl font-semibold text-zinc-800 focus:outline-none focus:border-rose-500"
                >
                  {LOST_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-zinc-800 block">Chi Tiết Bổ Sung (Tùy chọn):</label>
                <textarea
                  rows={2}
                  value={lostReasonDetails}
                  onChange={e => setLostReasonDetails(e.target.value)}
                  placeholder="Ghi chú thêm phản hồi của khách hàng..."
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl resize-none focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-100">
              <Button variant="outline" size="sm" onClick={() => setLostTargetLead(null)}>
                Hủy
              </Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={isSubmittingLost}
                onClick={handleConfirmLost}
              >
                Xác Nhận Thất Bại
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
