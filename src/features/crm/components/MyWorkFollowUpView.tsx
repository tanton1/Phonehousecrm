import React, { useMemo } from 'react';
import { Lead, LeadCareActivity, LeadAppointment, UserAccount } from '../../../types';
import { formatDisplayPhone } from '../../../utils/phoneUtils';
import { getVietnamDateString } from '../../../utils/dateTimeUtils';
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
  Building2
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

  // 1. New Leads (<24h, not contacted or careStatus NOT_STARTED/CARE_1_PENDING)
  const newLeads = useMemo(() => {
    return myLeads.filter(l => l.status === 'new' || l.careStatus === 'NOT_STARTED' || l.careStatus === 'CARE_1_PENDING' || !l.careStatus);
  }, [myLeads]);

  // 2. Care 2 Pending (L1 completed, waiting for follow-up)
  const care2Pending = useMemo(() => {
    return myLeads.filter(l => l.careStatus === 'CARE_1_DONE' || l.careStatus === 'CARE_2_PENDING');
  }, [myLeads]);

  // 3. Care 3 Pending (L2 completed, closing touch)
  const care3Pending = useMemo(() => {
    return myLeads.filter(l => l.careStatus === 'CARE_2_DONE' || l.careStatus === 'CARE_3_PENDING');
  }, [myLeads]);

  // 4. Appointments Today
  const appointmentsToday = useMemo(() => {
    return appointments.filter(a => a.scheduledAt.startsWith(todayStr) && a.status === 'SCHEDULED');
  }, [appointments, todayStr]);

  // 5. Overdue tasks
  const overdueLeads = useMemo(() => {
    const nowTime = Date.now();
    return myLeads.filter(l => {
      if (!l.nextActionAt) return false;
      return new Date(l.nextActionAt).getTime() < nowTime && l.status !== 'won' && l.status !== 'lost';
    });
  }, [myLeads]);

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
            Ưu tiên giải quyết các Lead mới quá hạn SLA và lịch hẹn showroom hôm nay.
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
            <span className="text-[10px] text-white/80 uppercase font-bold block">Lịch Hẹn</span>
            <span className="text-base font-black text-cyan-200">{appointmentsToday.length}</span>
          </div>
          <div className="bg-white/20 backdrop-blur-sm px-3.5 py-2 rounded-2xl">
            <span className="text-[10px] text-white/80 uppercase font-bold block">Quá Hạn</span>
            <span className="text-base font-black text-rose-200">{overdueLeads.length}</span>
          </div>
        </div>
      </div>

      {/* Grid 4 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* COL 1: Lead Mới Phản Hồi Ngay */}
        <div className="bg-white rounded-3xl p-4 border border-zinc-200/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                L1
              </div>
              <h3 className="text-xs font-black uppercase text-zinc-900">1. Lead Mới Tiếp Nhận</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-black">
              {newLeads.length}
            </span>
          </div>

          <div className="space-y-2.5">
            {newLeads.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-8">Đã hoàn thành toàn bộ Lead mới!</p>
            ) : (
              newLeads.map((lead) => (
                <div 
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="p-3 bg-zinc-50 hover:bg-white border border-zinc-200/90 rounded-2xl transition-all hover:shadow-xs cursor-pointer space-y-1.5"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-zinc-900">{lead.name}</span>
                    <span className="text-[10px] text-zinc-400">{lead.source}</span>
                  </div>
                  <div className="text-[11px] text-zinc-600 font-medium">{lead.interestedModel}</div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-bold text-emerald-600">{lead.budget.toLocaleString('vi-VN')} đ</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCareModal(lead);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#FF4B16] text-white text-[10px] font-bold shadow-2xs cursor-pointer hover:bg-[#E94312]"
                    >
                      Gọi L1 ngay
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COL 2: Chăm sóc lần 2 */}
        <div className="bg-white rounded-3xl p-4 border border-zinc-200/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
                L2
              </div>
              <h3 className="text-xs font-black uppercase text-zinc-900">2. Follow-Up Lần 2</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-black">
              {care2Pending.length}
            </span>
          </div>

          <div className="space-y-2.5">
            {care2Pending.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-8">Không có Lead chờ chăm lần 2.</p>
            ) : (
              care2Pending.map((lead) => (
                <div 
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="p-3 bg-zinc-50 hover:bg-white border border-zinc-200/90 rounded-2xl transition-all hover:shadow-xs cursor-pointer space-y-1.5"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-zinc-900">{lead.name}</span>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">L2</span>
                  </div>
                  {lead.lastCustomerResponse && (
                    <p className="text-[10px] text-zinc-500 italic bg-white p-1 rounded border border-zinc-200/60 truncate">
                      "{lead.lastCustomerResponse}"
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-zinc-500 font-medium">Hẹn: {lead.nextActionAt?.split(' ')[1] || 'Hôm nay'}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCareModal(lead);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold shadow-2xs cursor-pointer"
                    >
                      Chăm L2
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COL 3: Chăm sóc lần 3 */}
        <div className="bg-white rounded-3xl p-4 border border-zinc-200/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                L3
              </div>
              <h3 className="text-xs font-black uppercase text-zinc-900">3. Chốt Deal / Nurture L3</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-black">
              {care3Pending.length}
            </span>
          </div>

          <div className="space-y-2.5">
            {care3Pending.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-8">Không có Lead chờ chốt L3.</p>
            ) : (
              care3Pending.map((lead) => (
                <div 
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="p-3 bg-zinc-50 hover:bg-white border border-zinc-200/90 rounded-2xl transition-all hover:shadow-xs cursor-pointer space-y-1.5"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-zinc-900">{lead.name}</span>
                    <span className="text-[10px] font-black text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">L3 Chốt</span>
                  </div>
                  <div className="text-[11px] text-zinc-700 font-medium">{lead.interestedModel}</div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-purple-600 font-bold">Chốt hoặc Nurture</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCareModal(lead);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold shadow-2xs cursor-pointer"
                    >
                      Xử lý L3
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COL 4: Lịch hẹn Showroom Hôm nay */}
        <div className="bg-white rounded-3xl p-4 border border-zinc-200/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center font-bold text-xs">
                📍
              </div>
              <h3 className="text-xs font-black uppercase text-zinc-900">4. Lịch Hẹn Showroom</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 text-xs font-black">
              {appointmentsToday.length}
            </span>
          </div>

          <div className="space-y-2.5">
            {appointmentsToday.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-8">Chưa có lịch hẹn nào hôm nay.</p>
            ) : (
              appointmentsToday.map((appt) => (
                <div 
                  key={appt.id}
                  className="p-3 bg-cyan-50/50 border border-cyan-200 rounded-2xl space-y-1 text-xs"
                >
                  <div className="flex justify-between font-bold text-zinc-900">
                    <span>{appt.customerName}</span>
                    <span className="text-cyan-800 font-black">{appt.scheduledAt.split(' ')[1]}</span>
                  </div>
                  <p className="text-[11px] text-zinc-600 font-medium">📱 {appt.interestedModel}</p>
                  <p className="text-[10px] text-zinc-400">📍 {appt.branchName}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
