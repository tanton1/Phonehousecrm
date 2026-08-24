import React from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock3, PhoneCall, RefreshCw, Sparkles } from 'lucide-react';
import { Lead, LeadAppointment, LeadCareActivity, UserAccount } from '../../../types';
import { CrmWorkQueueItem } from '../../../services/crmApiClient';
import { formatDisplayPhone } from '../../../utils/phoneUtils';

export interface MyWorkFollowUpViewProps {
  leads: Lead[];
  currentUser?: UserAccount | null;
  activities?: LeadCareActivity[];
  appointments?: LeadAppointment[];
  queueItems?: CrmWorkQueueItem[];
  queueSummary?: { total: number; overdue: number; newLeads: number; appointments: number; postSale: number };
  loading?: boolean;
  onRefresh?: () => void;
  onSelectLead: (lead: Lead) => void;
  onOpenCareModal: (lead: Lead, taskId?: string) => void;
}

const taskLabels: Record<string, string> = {
  NEW_LEAD_SLA: 'Liên hệ khách mới', CARE_FOLLOW_UP: 'Chăm sóc tiếp', APPOINTMENT_REMINDER: 'Nhắc lịch hẹn',
  NO_SHOW_RECOVERY: 'Khách lỡ hẹn', QUOTE_EXPIRY: 'Báo giá sắp hết hạn', PAYDAY_NURTURE: 'Chăm sóc theo hẹn', STOCK_AVAILABLE: 'Đã có hàng',
  CALL: 'Gọi khách', ZALO: 'Nhắn Zalo', SEND_QUOTE: 'Gửi báo giá', APPOINTMENT: 'Lịch hẹn',
  LONG_TERM_NURTURE: 'Chăm sóc lại', CLOSE_DEAL: 'Chốt đơn', POST_SALE_FOLLOW_UP: 'Chăm sóc sau bán',
  CUSTOMER_RECOVERY: 'Khôi phục khách', WARRANTY_FOLLOW_UP: 'Theo dõi bảo hành'
};

const formatTime = (value?: string) => {
  if (!value) return 'Chưa đặt hạn';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

export const MyWorkFollowUpView: React.FC<MyWorkFollowUpViewProps> = ({
  leads, currentUser, queueItems = [], queueSummary, loading, onRefresh, onSelectLead, onOpenCareModal
}) => {
  const fallbackItems: CrmWorkQueueItem[] = queueItems.length ? [] : leads
    .filter(lead => !['won', 'lost'].includes(lead.status))
    .filter(lead => !currentUser || ['ADMIN', 'MANAGER'].includes(currentUser.role) || lead.assignedStaffId === currentUser.id)
    .map(lead => ({
      lead,
      overdue: Boolean(lead.nextActionAt && new Date(lead.nextActionAt).getTime() < Date.now()),
      task: {
        id: `legacy-${lead.id}`,
        leadId: lead.id,
        branchId: lead.branchId,
        assignedStaffId: lead.assignedStaffId || '',
        assignedStaffName: lead.assignedStaff || '',
        type: 'CARE_FOLLOW_UP',
        status: 'PENDING',
        dueAt: lead.nextActionAt || lead.followUpDate || '',
        priority: 'P2',
        title: `Chăm sóc ${lead.name}`,
        createdAt: lead.createdAt || ''
      } as CrmWorkQueueItem['task']
    }));
  const items = queueItems.length ? queueItems : fallbackItems;
  const summary = queueSummary || {
    total: items.length,
    overdue: items.filter(item => item.overdue).length,
    newLeads: items.filter(item => item.lead?.status === 'new').length,
    appointments: items.filter(item => item.task.type === 'APPOINTMENT').length,
    postSale: items.filter(item => item.task.scope === 'POST_SALE').length
  };

  return <div className="space-y-4">
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-950 via-zinc-900 to-orange-950 p-5 text-white shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.16em] text-orange-300"><Sparkles className="h-4 w-4" /> Việc cần làm hôm nay</div>
          <h2 className="mt-2 text-xl font-black">Chào {currentUser?.displayName || 'bạn'}, ưu tiên khách cần xử lý trước.</h2>
        </div>
        {onRefresh && <button onClick={onRefresh} disabled={loading} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 hover:bg-white/20 disabled:opacity-50" aria-label="Tải lại"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>}
      </div>
      <div className="mt-5 flex snap-x gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          ['Tổng việc', summary.total, Clock3], ['Quá hạn', summary.overdue, AlertTriangle], ['Khách mới', summary.newLeads, PhoneCall],
          ['Lịch hẹn', summary.appointments, CalendarClock], ['Sau bán', summary.postSale, CheckCircle2]
        ].map(([label, value, Icon]: any) => <div key={label} className="min-w-[112px] snap-start rounded-2xl bg-white/10 px-3 py-3 backdrop-blur">
          <Icon className="h-4 w-4 text-orange-300" /><div className="mt-2 text-xl font-black">{value}</div><div className="text-[10px] font-bold text-white/65">{label}</div>
        </div>)}
      </div>
    </section>

    <div className="flex gap-2 overflow-x-auto pb-1 text-[11px] font-black scrollbar-none">
      <span className="whitespace-nowrap rounded-full bg-rose-50 px-3 py-1.5 text-rose-700">Quá hạn trước</span>
      <span className="whitespace-nowrap rounded-full bg-orange-50 px-3 py-1.5 text-orange-700">Đến hạn tiếp theo</span>
      <span className="whitespace-nowrap rounded-full bg-zinc-100 px-3 py-1.5 text-zinc-600">Một danh sách, không chia cột</span>
    </div>

    <section className="space-y-3">
      {loading && !items.length && <div className="rounded-3xl border border-zinc-200 bg-white p-10 text-center text-sm font-bold text-zinc-500">Đang lấy lịch chăm sóc…</div>}
      {!loading && !items.length && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-10 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-3 text-sm font-black text-emerald-800">Đã xử lý hết việc hiện tại.</p></div>}
      {items.map(({ task, lead, overdue }) => <article key={task.id} className={`rounded-3xl border bg-white p-4 shadow-sm ${overdue ? 'border-rose-200' : 'border-zinc-200/80'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${overdue ? 'bg-rose-100 text-rose-700' : 'bg-orange-50 text-orange-700'}`}>{overdue ? 'QUÁ HẠN' : taskLabels[task.type] || task.type}</span>
              {task.scope === 'POST_SALE' && <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-black text-cyan-700">SAU BÁN</span>}
            </div>
            <h3 className="mt-2 truncate text-base font-black text-zinc-950">{lead?.name || task.title || 'Công việc CRM'}</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">{lead ? `${formatDisplayPhone(lead.phone)} · ${lead.interestedModel || 'Chưa chọn sản phẩm'}` : task.title}</p>
          </div>
          <div className="shrink-0 text-right text-[10px] font-bold text-zinc-500"><Clock3 className="mb-1 ml-auto h-4 w-4" />{formatTime(task.dueAt)}</div>
        </div>
        {task.description && <p className="mt-3 line-clamp-2 rounded-2xl bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-600">{task.description}</p>}
        <div className="mt-4 flex gap-2 border-t border-zinc-100 pt-3">
          {lead && <button onClick={() => onSelectLead(lead)} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-zinc-100 px-3 py-2.5 text-xs font-black text-zinc-700">Chi tiết <ArrowRight className="h-3.5 w-3.5" /></button>}
          {lead && <button onClick={() => onOpenCareModal(lead, task.id)} className="flex flex-[1.25] items-center justify-center gap-1.5 rounded-2xl bg-[#FF4B16] px-3 py-2.5 text-xs font-black text-white shadow-sm"><PhoneCall className="h-3.5 w-3.5" /> Ghi nhận chăm sóc</button>}
        </div>
      </article>)}
    </section>
  </div>;
};
