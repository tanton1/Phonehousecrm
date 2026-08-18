import React, { useState } from 'react';
import { Lead, LeadStatus, StaffMember } from '../../../types';
import { Button } from '../../../shared/ui/Button/Button';
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
  Filter 
} from 'lucide-react';

export interface LeadKanbanBoardProps {
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  onUpdateLeadStatus: (leadId: string, newStatus: LeadStatus) => Promise<void> | void;
  onOpenCreateModal: () => void;
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

export const LeadKanbanBoard: React.FC<LeadKanbanBoardProps> = ({
  leads,
  onSelectLead,
  onUpdateLeadStatus,
  onOpenCreateModal
}) => {
  const [sourceFilter, setSourceFilter] = useState('ALL');

  const filteredLeads = leads.filter(l => {
    return sourceFilter === 'ALL' || l.source === sourceFilter;
  });

  return (
    <div className="space-y-4">
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
            <p className="text-[11px] text-zinc-500">Quản lý quy trình chuyển đổi từ tiếp cận đến bán hàng</p>
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
            Thêm Lead (Alt+4)
          </Button>
        </div>
      </div>

      {/* 2. Kanban Board Horizontal Scroll */}
      <div className="flex space-x-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-200 items-start min-h-[600px]">
        {STAGES.map(stage => {
          const stageLeads = filteredLeads.filter(l => {
            if (stage.id === 'deposit') {
              return l.status === 'deposit' || l.status === 'deposit_paid';
            }
            return l.status === stage.id;
          });

          return (
            <div
              key={stage.id}
              className="w-72 shrink-0 bg-zinc-100/70 border border-zinc-200/80 rounded-2xl p-3 flex flex-col max-h-[75vh]"
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
                    Không có lead
                  </div>
                ) : (
                  stageLeads.map(lead => {
                    // Calculate SLA (time since creation)
                    const createdTime = lead.createdAt ? new Date(lead.createdAt).getTime() : Date.now();
                    const hoursPassed = (Date.now() - createdTime) / (1000 * 60 * 60);
                    const isOverdue = hoursPassed > 2 && lead.status === 'new';

                    return (
                      <div
                        key={lead.id}
                        onClick={() => onSelectLead(lead)}
                        className="p-3 bg-white border border-zinc-200/80 hover:border-zinc-300 rounded-xl shadow-2xs hover:shadow-sm transition-all cursor-pointer space-y-2 select-none group"
                      >
                        {/* Top: Name & Source */}
                        <div className="flex items-center justify-between">
                          <h5 className="font-bold text-zinc-900 text-xs truncate max-w-[150px]">
                            {lead.name}
                          </h5>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${stage.badgeBg}`}>
                            {lead.source}
                          </span>
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
                        </div>

                        {/* Budget & SLA */}
                        <div className="pt-1.5 border-t border-zinc-100 flex items-center justify-between text-[10px]">
                          {lead.budget ? (
                            <span className="font-mono font-bold text-[#ff4b16]">
                              ~{(lead.budget / 1_000_000).toFixed(1)}tr
                            </span>
                          ) : (
                            <span className="text-zinc-400">Chưa rõ ngân sách</span>
                          )}

                          {lead.status === 'new' && (
                            <span className={`flex items-center space-x-0.5 font-bold ${
                              isOverdue ? 'text-rose-600' : 'text-emerald-600'
                            }`}>
                              <Clock className="w-3 h-3" />
                              <span>{isOverdue ? 'Quá 2h' : 'Mới'}</span>
                            </span>
                          )}
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
    </div>
  );
};
