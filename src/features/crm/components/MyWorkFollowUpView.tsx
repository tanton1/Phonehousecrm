import React, { useMemo } from 'react';
import { Lead, LeadCareActivity, LeadAppointment, UserAccount } from '../../../types';
import { formatDisplayPhone } from '../../../utils/phoneUtils';
import { getVietnamDateString } from '../../../utils/dateTimeUtils';
import { calculateLeadPriority, calculateLeadTemperature } from '../utils/crmEngine';
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  Phone, 
  MessageSquare, 
  Sparkles, 
  ArrowRight, 
  Plus, 
  User, 
  Flame,
  Building2,
  Zap,
  Tag
} from 'lucide-react';

export interface MyWorkFollowUpViewProps {
  leads: Lead[];
  currentUser?: UserAccount | null;
  activities?: LeadCareActivity[];
  appointments?: LeadAppointment[];
  onSelectLead: (lead: Lead) => void;
  onOpenCareModal: (lead: Lead) => void;
}

export const MyWorkFollowUpView: React.FC<MyWorkFollowUpViewProps> = ({
  leads,
  currentUser,
  activities = [],
  appointments = [],
  onSelectLead,
  onOpenCareModal
}) => {
  const todayStr = getVietnamDateString();

  // Filter leads assigned to current user or active showroom
  const myLeads = useMemo(() => {
    if (!currentUser) return leads;
    if (currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER') return leads;
    return leads.filter(l => l.assignedStaffId === currentUser.id || l.assignedStaff === currentUser.displayName);
  }, [leads, currentUser]);

  // Appointments today map
  const leadAppointmentTodaySet = useMemo(() => {
    const set = new Set<string>();
    appointments.forEach(a => {
      if (a.scheduledAt.startsWith(todayStr) && (a.status === 'SCHEDULED' || a.status === 'CONFIRMED')) {
        set.add(a.leadId);
      }
    });
    return set;
  }, [appointments, todayStr]);

  // Helper to enrich and sort leads by Priority Score
  const sortLeadsByPriority = (leadList: Lead[]) => {
    return [...leadList].sort((a, b) => {
      const hasApptA = leadAppointmentTodaySet.has(a.id);
      const hasApptB = leadAppointmentTodaySet.has(b.id);
      const prioA = calculateLeadPriority(a, hasApptA);
      const prioB = calculateLeadPriority(b, hasApptB);
      return prioB.score - prioA.score;
    });
  };

  // 1. New Leads (<24h, not contacted or careStatus NOT_STARTED/CARE_1_PENDING)
  const newLeads = useMemo(() => {
    const raw = myLeads.filter(l => l.status === 'new' || l.careStatus === 'NOT_STARTED' || l.careStatus === 'CARE_1_PENDING' || !l.careStatus);
    return sortLeadsByPriority(raw);
  }, [myLeads, leadAppointmentTodaySet]);

  // 2. Care 2 Pending (L1 completed, waiting for follow-up)
  const care2Pending = useMemo(() => {
    const raw = myLeads.filter(l => l.careStatus === 'CARE_1_DONE' || l.careStatus === 'CARE_2_PENDING');
    return sortLeadsByPriority(raw);
  }, [myLeads, leadAppointmentTodaySet]);

  // 3. Care 3 Pending (L2 completed, closing touch)
  const care3Pending = useMemo(() => {
    const raw = myLeads.filter(l => l.careStatus === 'CARE_2_DONE' || l.careStatus === 'CARE_3_PENDING');
    return sortLeadsByPriority(raw);
  }, [myLeads, leadAppointmentTodaySet]);

  // 4. Appointments Today
  const appointmentsToday = useMemo(() => {
    return appointments.filter(a => a.scheduledAt.startsWith(todayStr) && (a.status === 'SCHEDULED' || a.status === 'CONFIRMED' || a.status === 'ARRIVED'));
  }, [appointments, todayStr]);

  // 5. Overdue tasks
  const overdueLeads = useMemo(() => {
    const nowTime = Date.now();
    const raw = myLeads.filter(l => {
      if (!l.nextActionAt) return false;
      return new Date(l.nextActionAt).getTime() < nowTime && l.status !== 'won' && l.status !== 'lost';
    });
    return sortLeadsByPriority(raw);
  }, [myLeads, leadAppointmentTodaySet]);

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Morning Summary Banner */}
      <div className="bg-gradient-to-r from-orange-500 via-[#FF4B16] to-amber-500 rounded-3xl p-5 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-white/90 uppercase tracking-wider mb-1">
            <Sparkles className="w-4 h-4 text-amber-200" />
            <span>Kế Hoạch Chăm Sóc Hôm Nay ({todayStr})</span>
          </div>
          <h2 className="text-xl font-black tracking-tight text-white">
            Chào {currentUser?.displayName || 'Chuyên viên'}, bạn có {myLeads.length} Lead cần xử lý!
          </h2>
          <p className="text-xs text-white/85 mt-0.5">
            Sắp xếp theo thuật toán ưu tiên P0/P1/P2/P3 và nhiệt độ khách hàng (🔥 HOT).
          </p>
        </div>

        {/* Quick KPI counters */}
        <div className="flex items-center gap-2 text-center text-xs">
          <div className="bg-white/20 backdrop-blur-sm px-3.5 py-2 rounded-2xl">
            <span className="text-[10px] text-white/80 uppercase font-bold block">Lead Mới</span>
            <span className="text-base font-black text-white">{newLeads.length}</span>
          </div>
          <div className="bg-white/20 backdrop-blur-sm px-3.5 py-2 rounded-2xl">
            <span className="text-[10px] text-white/80 uppercase font-bold block">Chăm L2/L3</span>
            <span className="text-base font-black text-amber-200">{care2Pending.length + care3Pending.length}</span>
          </div>
          <div className="bg-white/20 backdrop-blur-sm px-3.5 py-2 rounded-2xl">
            <span className="text-[10px] text-white/80 uppercase font-bold block">Lịch Hẹn Hôm Nay</span>
            <span className="text-base font-black text-purple-200">{appointmentsToday.length}</span>
          </div>
          <div className="bg-white/20 backdrop-blur-sm px-3.5 py-2 rounded-2xl">
            <span className="text-[10px] text-white/80 uppercase font-bold block">Quá Hạn</span>
            <span className="text-base font-black text-rose-200">{overdueLeads.length}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: 5 Action Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
        
        {/* COL 1: NEW LEADS / L1 */}
        <div className="bg-zinc-50 rounded-2xl p-3.5 border border-zinc-200/80 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 font-black text-xs text-zinc-900 uppercase tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
              <span>Lead Mới / Chăm L1</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
              {newLeads.length}
            </span>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[70vh] pr-0.5">
            {newLeads.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400 font-medium">
                Không có lead mới chờ chăm sóc L1.
              </div>
            ) : (
              newLeads.map(lead => renderLeadCard(lead, 'L1', onSelectLead, onOpenCareModal, leadAppointmentTodaySet.has(lead.id)))
            )}
          </div>
        </div>

        {/* COL 2: CARE L2 (FOLLOW-UP) */}
        <div className="bg-zinc-50 rounded-2xl p-3.5 border border-zinc-200/80 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 font-black text-xs text-zinc-900 uppercase tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span>Chăm L2 (Follow-up)</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
              {care2Pending.length}
            </span>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[70vh] pr-0.5">
            {care2Pending.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400 font-medium">
                Chưa có lead cần chăm sóc L2.
              </div>
            ) : (
              care2Pending.map(lead => renderLeadCard(lead, 'L2', onSelectLead, onOpenCareModal, leadAppointmentTodaySet.has(lead.id)))
            )}
          </div>
        </div>

        {/* COL 3: CARE L3 (CLOSING / RETENTION) */}
        <div className="bg-zinc-50 rounded-2xl p-3.5 border border-zinc-200/80 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 font-black text-xs text-zinc-900 uppercase tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
              <span>Chăm L3 (Chốt deal)</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-[10px] font-bold">
              {care3Pending.length}
            </span>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[70vh] pr-0.5">
            {care3Pending.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400 font-medium">
                Chưa có lead cần chăm sóc L3.
              </div>
            ) : (
              care3Pending.map(lead => renderLeadCard(lead, 'L3', onSelectLead, onOpenCareModal, leadAppointmentTodaySet.has(lead.id)))
            )}
          </div>
        </div>

        {/* COL 4: APPOINTMENTS TODAY */}
        <div className="bg-zinc-50 rounded-2xl p-3.5 border border-zinc-200/80 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 font-black text-xs text-purple-900 uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5 text-purple-600" />
              <span>Hẹn Hôm Nay</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">
              {appointmentsToday.length}
            </span>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[70vh] pr-0.5">
            {appointmentsToday.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400 font-medium">
                Hôm nay chưa có lịch hẹn showroom.
              </div>
            ) : (
              appointmentsToday.map(appt => {
                const lead = leads.find(l => l.id === appt.leadId);
                return (
                  <div 
                    key={appt.id}
                    className="bg-white rounded-2xl p-3 border border-purple-200/80 shadow-2xs hover:shadow-md transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-purple-900">{appt.customerName}</span>
                      <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold text-[10px]">
                        {appt.scheduledAt.split(' ')[1] || 'Hôm nay'}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-600 font-medium">
                      Máy quan tâm: <strong>{appt.interestedModel}</strong>
                    </div>
                    {lead && (
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
                        <button
                          onClick={() => onSelectLead(lead)}
                          className="text-[11px] font-bold text-purple-700 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>Xem chi tiết</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onOpenCareModal(lead)}
                          className="px-2 py-1 rounded-lg bg-[#FF4B16] text-white text-[10px] font-bold cursor-pointer hover:bg-[#E94312]"
                        >
                          Chăm sóc
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COL 5: OVERDUE LEADS */}
        <div className="bg-zinc-50 rounded-2xl p-3.5 border border-zinc-200/80 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 font-black text-xs text-rose-900 uppercase tracking-wider">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Quá Hạn Follow-up</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
              {overdueLeads.length}
            </span>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[70vh] pr-0.5">
            {overdueLeads.length === 0 ? (
              <div className="py-8 text-center text-xs text-emerald-600 font-bold">
                ✓ Tuyệt vời! Không có lead nào bị quá hạn.
              </div>
            ) : (
              overdueLeads.map(lead => renderLeadCard(lead, 'OVERDUE', onSelectLead, onOpenCareModal, leadAppointmentTodaySet.has(lead.id)))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

// Render Individual Lead Card inside Columns
function renderLeadCard(
  lead: Lead, 
  columnType: string, 
  onSelectLead: (lead: Lead) => void,
  onOpenCareModal: (lead: Lead) => void,
  hasApptToday = false
) {
  const prio = calculateLeadPriority(lead, hasApptToday);
  const temp = calculateLeadTemperature(lead);

  return (
    <div
      key={lead.id}
      className="bg-white rounded-2xl p-3.5 border border-zinc-200/80 shadow-2xs hover:shadow-md hover:border-zinc-300 transition-all space-y-2 text-xs relative group"
    >
      {/* Priority Rank & Temperature Badge */}
      <div className="flex items-center justify-between gap-1">
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${prio.badgeStyle}`}>
          {prio.rank}
        </span>

        <div className="flex items-center gap-1">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
            temp.temperature === 'HOT' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
            temp.temperature === 'WARM' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
            'bg-zinc-100 text-zinc-600'
          }`}>
            {temp.temperature === 'HOT' ? '🔥 HOT' : temp.temperature === 'WARM' ? '⚡ WARM' : '❄️ COLD'}
          </span>
          <span className="text-[10px] text-zinc-400 font-mono">({temp.score}đ)</span>
        </div>
      </div>

      {/* Customer Name & Phone */}
      <div>
        <div className="font-bold text-zinc-900 text-xs flex items-center justify-between">
          <span className="truncate">{lead.name}</span>
          <span className="text-[10px] text-zinc-400 font-mono font-normal">
            {formatDisplayPhone(lead.phone)}
          </span>
        </div>
        <div className="text-[11px] text-zinc-500 truncate mt-0.5">
          {lead.interestedModel} • {lead.budget ? `${(lead.budget / 1000000).toFixed(1)}Tr` : 'Chưa rõ ngân sách'}
        </div>
      </div>

      {/* Touch status & Last Customer response */}
      {lead.lastCustomerResponse && (
        <div className="bg-zinc-50 p-2 rounded-xl border border-zinc-100 text-[11px] text-zinc-700 line-clamp-2">
          <span className="font-bold text-zinc-900">Khách: </span>
          "{lead.lastCustomerResponse}"
        </div>
      )}

      {/* Next Action SLA */}
      {lead.nextActionAt && (
        <div className="flex items-center gap-1 text-[10px] font-medium text-orange-800 bg-orange-50/70 p-1.5 rounded-lg">
          <Clock className="w-3 h-3 text-[#FF4B16]" />
          <span>Hẹn: {lead.nextActionAt}</span>
        </div>
      )}

      {/* Bottom CTA Row */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
        <button
          onClick={() => onSelectLead(lead)}
          className="text-[11px] font-bold text-zinc-600 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
        >
          <span>Chi tiết</span>
          <ArrowRight className="w-3 h-3" />
        </button>

        <button
          onClick={() => onOpenCareModal(lead)}
          className="px-2.5 py-1 rounded-xl bg-[#FF4B16] hover:bg-[#E94312] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 transition-transform"
        >
          <Sparkles className="w-3 h-3" />
          <span>Chăm sóc</span>
        </button>
      </div>
    </div>
  );
}
