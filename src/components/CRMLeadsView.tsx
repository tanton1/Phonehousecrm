import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, HelpCircle, LayoutDashboard, ListFilter, Loader2, MessageSquare, Plus, RefreshCw, Search, Users } from 'lucide-react';
import {
  DeviceItem, EvidenceVerificationStatus, Lead, LeadAppointment, LeadCareActivity, LeadQuote, SalesInvoice,
  StoreBranch, UserAccount, WarrantyTicket
} from '../types';
import {
  CrmLeadPage, CrmWorkQueueResult, requestCreateCrmAppointment, requestCreateCrmLead, requestCreateCrmQuote,
  requestCrmCareActivities, requestCrmCustomer360, requestCrmDashboard, requestCrmDispatch, requestCrmLeadPage,
  requestCrmWorkQueue, requestLeadStateTransition, requestRecordCrmCare,
  requestServerCareReview, requestUpdateCrmAppointment
} from '../services/crmApiClient';
import { CreateLeadModal } from '../features/crm/components/CreateLeadModal';
import { LeadKanbanBoard } from '../features/crm/components/LeadKanbanBoard';
import { CompleteCareActivityModal } from '../features/crm/components/CompleteCareActivityModal';
import { LeadOperationalDrawer } from '../features/crm/components/LeadOperationalDrawer';
import { MyWorkFollowUpView } from '../features/crm/components/MyWorkFollowUpView';
import { CareQAManagerView } from '../features/crm/components/CareQAManagerView';
import { CRMServerDashboardView } from '../features/crm/components/CRMServerDashboardView';
import { CRMDispatchView } from '../features/crm/components/CRMDispatchView';
import { formatDisplayPhone } from '../utils/phoneUtils';

interface CRMLeadsViewProps {
  currentUser?: UserAccount | null;
  branches?: StoreBranch[];
  users?: UserAccount[];
  leads?: Lead[];
  devices?: DeviceItem[];
  invoices?: SalesInvoice[];
  warrantyTickets?: WarrantyTicket[];
  attendanceRecords?: unknown[];
  onAddLead?: (lead: Lead) => void;
  onUpdateLead?: (lead: Lead) => void;
  onConvertLeadToSale: (lead: Lead) => void;
  onNavigateToOmnichannelChat?: () => void;
}

type ViewMode = 'MY_WORK' | 'PIPELINE' | 'LIST' | 'DISPATCH' | 'CARE_QA' | 'ANALYTICS';

const MANAGER_ROLES = new Set(['ADMIN', 'MANAGER', 'STORE_MANAGER', 'REGIONAL_MANAGER']);
const statusLabel: Record<string, string> = {
  new: 'Mới nhận', contacted: 'Đã liên hệ', consulting: 'Đang tư vấn', negotiating: 'Đang tư vấn',
  appointment_scheduled: 'Đã hẹn', deposit: 'Đặt cọc', deposit_paid: 'Đặt cọc', won: 'Đã mua', lost: 'Không thành công'
};
const statusTone: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700', contacted: 'bg-amber-50 text-amber-700', consulting: 'bg-violet-50 text-violet-700',
  negotiating: 'bg-violet-50 text-violet-700', appointment_scheduled: 'bg-cyan-50 text-cyan-700', deposit: 'bg-indigo-50 text-indigo-700',
  deposit_paid: 'bg-indigo-50 text-indigo-700', won: 'bg-emerald-50 text-emerald-700', lost: 'bg-rose-50 text-rose-700'
};

export const CRMLeadsView: React.FC<CRMLeadsViewProps> = ({
  currentUser, branches = [], users = [], leads: legacyLeads = [], devices = [], invoices: legacyInvoices = [],
  warrantyTickets: legacyWarrantyTickets = [], onConvertLeadToSale, onNavigateToOmnichannelChat
}) => {
  const isManager = MANAGER_ROLES.has(String(currentUser?.role || '').toUpperCase());
  const allowedBranches = useMemo(() => {
    if (!currentUser || currentUser.role === 'ADMIN') return branches;
    const ids = new Set([currentUser.branchId, ...(currentUser.assignedBranchIds || [])].filter(Boolean));
    return branches.filter(branch => ids.has(branch.id));
  }, [branches, currentUser]);
  const [branchId, setBranchId] = useState(currentUser?.branchId || '');
  const [viewMode, setViewMode] = useState<ViewMode>('MY_WORK');
  const [serverLeads, setServerLeads] = useState<Lead[]>(legacyLeads);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [queue, setQueue] = useState<CrmWorkQueueResult>({ items: [], summary: { total: 0, overdue: 0, newLeads: 0, appointments: 0, postSale: 0 } });
  const [activities, setActivities] = useState<LeadCareActivity[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [dispatch, setDispatch] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [ownerId, setOwnerId] = useState('ALL');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [careLead, setCareLead] = useState<Lead | null>(null);
  const [careTaskId, setCareTaskId] = useState<string | undefined>();
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [drawerData, setDrawerData] = useState<any>(null);

  useEffect(() => {
    if (!branchId && (currentUser?.branchId || allowedBranches[0]?.id)) setBranchId(currentUser?.branchId || allowedBranches[0]?.id || '');
  }, [branchId, currentUser?.branchId, allowedBranches]);

  const mergeLead = useCallback((lead: Lead) => {
    setServerLeads(current => [lead, ...current.filter(item => item.id !== lead.id)]);
    setDrawerLead(current => current?.id === lead.id ? lead : current);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    const scope = branchId || undefined;
    const owner = isManager && ownerId !== 'ALL' ? ownerId : undefined;
    const results = await Promise.allSettled([
      requestCrmLeadPage({ branchId: scope, ownerId: owner, status: statusFilter === 'ALL' ? undefined : statusFilter, search: search || undefined, limit: 80 }),
      requestCrmWorkQueue({ branchId: scope, ownerId: owner, limit: 150 }),
      requestCrmCareActivities({ branchId: scope, staffId: owner, limit: 300 }),
      isManager ? requestCrmDashboard({ branchId: scope }) : Promise.resolve(null),
      isManager && scope ? requestCrmDispatch(scope) : Promise.resolve(null)
    ]);
    const [leadResult, queueResult, activityResult, dashboardResult, dispatchResult] = results;
    if (leadResult.status === 'fulfilled') {
      const page = leadResult.value as CrmLeadPage;
      setServerLeads(page.items); setNextCursor(page.nextCursor); setHasMore(page.hasMore);
    } else {
      setServerLeads(current => current.length ? current : legacyLeads);
      setError(leadResult.reason?.message || 'Không tải được dữ liệu CRM từ máy chủ.');
    }
    if (queueResult.status === 'fulfilled') setQueue(queueResult.value);
    if (activityResult.status === 'fulfilled') setActivities(activityResult.value.items);
    if (dashboardResult.status === 'fulfilled') setDashboard(dashboardResult.value);
    if (dispatchResult.status === 'fulfilled') setDispatch(dispatchResult.value);
    setLoading(false);
  }, [branchId, isManager, legacyLeads, ownerId, search, statusFilter]);

  useEffect(() => { void refresh(); }, [refresh]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await requestCrmLeadPage({ branchId: branchId || undefined, ownerId: isManager && ownerId !== 'ALL' ? ownerId : undefined, status: statusFilter === 'ALL' ? undefined : statusFilter, search: search || undefined, cursor: nextCursor, limit: 80 });
      setServerLeads(current => [...current, ...page.items.filter(item => !current.some(old => old.id === item.id))]);
      setNextCursor(page.nextCursor); setHasMore(page.hasMore);
    } catch (caught: any) { setError(caught?.message || 'Không tải thêm được dữ liệu.'); }
    finally { setLoadingMore(false); }
  };

  const selectLead = async (lead: Lead) => {
    setDrawerLead(lead); setDrawerData(null);
    try {
      const data = await requestCrmCustomer360(lead.id);
      setDrawerData(data); setDrawerLead(data.lead || lead);
    } catch (caught: any) { setError(caught?.message || 'Không tải đủ hồ sơ khách hàng.'); }
  };

  const openCare = (lead: Lead, taskId?: string) => { setCareTaskId(taskId); setCareLead(lead); };

  const createLead = async (draft: Lead) => {
    const result = await requestCreateCrmLead({
      branchId: draft.branchId || branchId, name: draft.name, phone: draft.phone, zalo: draft.zalo, source: draft.source,
      interestedModel: draft.interestedModel, budget: draft.budget, tradeInRequired: draft.tradeInRequirose,
      tradeInModel: draft.tradeInModel, notes: draft.notes, nextActionType: draft.nextAction?.type === 'MESSAGE' ? 'ZALO' : draft.nextAction?.type,
      nextActionAt: draft.nextAction?.dueAt || draft.nextActionAt,
      requestedAssigneeId: isManager && draft.assignedStaffId ? draft.assignedStaffId : undefined
    });
    setServerLeads(current => [result.lead, ...current.filter(item => item.id !== result.lead.id)]);
    await refresh();
  };

  const recordCare = async (activity: LeadCareActivity) => {
    if (!careLead) return;
    const result = await requestRecordCrmCare(careLead.id, {
      taskId: careTaskId, channel: activity.channel, action: activity.action, outcome: activity.outcome,
      customerResponseCode: activity.customerResponseCode, customerResponseText: activity.customerResponseText,
      objectionCategory: activity.objectionCategory, objectionCode: activity.objectionCode, priceDetails: activity.priceDetails,
      evidenceType: activity.evidenceType, evidenceData: activity.evidenceData, nextActionType: activity.nextActionType,
      nextActionAt: activity.nextActionAt, nextActionNotes: activity.nextActionNotes
    });
    setActivities(current => [result.activity, ...current.filter(item => item.id !== result.activity.id)]);
    mergeLead(result.lead); setCareTaskId(undefined);
    await refresh();
  };

  const createAppointment = async (appointment: LeadAppointment) => {
    const result = await requestCreateCrmAppointment(appointment);
    mergeLead(result.lead);
    setDrawerData((current: any) => current ? { ...current, appointments: [result.appointment, ...(current.appointments || [])] } : current);
    await refresh();
  };
  const updateAppointment = async (appointmentId: string, status: LeadAppointment['status']) => {
    const result = await requestUpdateCrmAppointment(appointmentId, status);
    setDrawerData((current: any) => current ? { ...current, appointments: (current.appointments || []).map((item: LeadAppointment) => item.id === appointmentId ? result.appointment : item) } : current);
  };
  const createQuote = async (quote: LeadQuote) => {
    const result = await requestCreateCrmQuote(quote);
    mergeLead(result.lead);
    setDrawerData((current: any) => current ? { ...current, quotes: [result.quote, ...(current.quotes || [])] } : current);
  };
  const reviewActivity = async (activityId: string, status: EvidenceVerificationStatus, note?: string) => {
    const updated = await requestServerCareReview(activityId, status, note);
    setActivities(current => current.map(item => item.id === activityId ? updated : item));
  };

  const visibleLeads = serverLeads;
  const managerUsers = users.filter(user => user.active !== false && ['SALES', 'SALE', 'SALE_ONLINE', 'CUSTOMER_CARE', 'CSKH'].includes(String(user.role)));
  const tabs: Array<{ id: ViewMode; label: string; manager?: boolean }> = [
    { id: 'MY_WORK', label: 'Việc hôm nay' }, { id: 'PIPELINE', label: 'Phễu bán hàng' }, { id: 'LIST', label: 'Khách hàng' },
    { id: 'DISPATCH', label: 'Điều phối', manager: true }, { id: 'CARE_QA', label: 'Kiểm tra CSKH', manager: true }, { id: 'ANALYTICS', label: 'Báo cáo', manager: true }
  ];

  return <div className="space-y-4 pb-14">
    <header className="rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex items-center gap-2"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-orange-100 text-orange-600"><Users className="h-5 w-5" /></div><div><h1 className="text-lg font-black text-zinc-950 sm:text-xl">Chăm sóc khách hàng</h1><p className="mt-0.5 text-xs font-semibold text-zinc-500">Tiếp nhận, tư vấn, hẹn lịch và chăm sóc sau bán tại một nơi.</p></div></div></div>
        <div className="flex shrink-0 gap-2">
          {onNavigateToOmnichannelChat && <button onClick={onNavigateToOmnichannelChat} className="grid h-10 w-10 place-items-center rounded-2xl border border-zinc-200 text-zinc-600" title="Tin nhắn đa kênh"><MessageSquare className="h-4 w-4" /></button>}
          <button onClick={() => setIsCreateOpen(true)} className="flex h-10 items-center gap-2 rounded-2xl bg-[#FF4B16] px-3 text-xs font-black text-white shadow-sm"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Thêm khách</span></button>
        </div>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {tabs.filter(tab => !tab.manager || isManager).map(tab => <button key={tab.id} onClick={() => setViewMode(tab.id)} className={`whitespace-nowrap rounded-2xl px-3 py-2 text-xs font-black ${viewMode === tab.id ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{tab.label}</button>)}
      </div>
    </header>

    <section className="flex flex-wrap items-center gap-2 rounded-3xl border border-zinc-200/80 bg-white p-3 shadow-sm">
      {isManager && allowedBranches.length > 1 && <select value={branchId} onChange={event => setBranchId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-bold sm:max-w-[220px]"><option value="">Chọn chi nhánh</option>{allowedBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}
      {isManager && <select value={ownerId} onChange={event => setOwnerId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-bold sm:max-w-[220px]"><option value="ALL">Tất cả nhân viên</option>{managerUsers.map(user => <option key={user.id} value={user.id}>{user.displayName}</option>)}</select>}
      <button onClick={() => void refresh()} disabled={loading} className="grid h-10 w-10 place-items-center rounded-2xl border border-zinc-200 text-zinc-600"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      <span title="Dữ liệu được phân quyền theo chi nhánh và nhân viên phụ trách." className="grid h-10 w-10 place-items-center rounded-2xl bg-zinc-100 text-zinc-500"><HelpCircle className="h-4 w-4" /></span>
    </section>
    {error && <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

    {viewMode === 'MY_WORK' && <MyWorkFollowUpView leads={visibleLeads} currentUser={currentUser} queueItems={queue.items} queueSummary={queue.summary} loading={loading} onRefresh={() => void refresh()} onSelectLead={selectLead} onOpenCareModal={openCare} />}
    {viewMode === 'PIPELINE' && <LeadKanbanBoard leads={visibleLeads} activities={activities} canUpdateStatus={!['CUSTOMER_CARE', 'CSKH'].includes(String(currentUser?.role || ''))} onSelectLead={selectLead} onOpenCreateModal={() => setIsCreateOpen(true)} onOpenCareModal={lead => openCare(lead)} onUpdateLeadStatus={async (leadId, newStatus, lostReason) => {
      const lead = visibleLeads.find(item => item.id === leadId); if (!lead) return;
      const result = await requestLeadStateTransition(lead.id, lead.status, newStatus, { lostReason });
      mergeLead({ ...lead, status: result.status, lostReason: lostReason || lead.lostReason }); await refresh();
    }} />}
    {viewMode === 'LIST' && <section className="space-y-3">
      <form onSubmit={event => { event.preventDefault(); setSearch(searchDraft.trim()); }} className="flex gap-2 rounded-3xl border border-zinc-200/80 bg-white p-3 shadow-sm">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input value={searchDraft} onChange={event => setSearchDraft(event.target.value)} placeholder="Tên, SĐT, máy quan tâm…" className="h-10 w-full rounded-2xl border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-xs font-semibold outline-none focus:border-orange-400" /></div>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 max-w-[42%] rounded-2xl border border-zinc-200 bg-zinc-50 px-2 text-xs font-bold"><option value="ALL">Tất cả</option>{Object.entries(statusLabel).filter(([key]) => !['consulting', 'deposit_paid'].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <button className="grid h-10 w-10 place-items-center rounded-2xl bg-zinc-950 text-white"><Search className="h-4 w-4" /></button>
      </form>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleLeads.map(lead => <button key={lead.id} onClick={() => void selectLead(lead)} className="rounded-3xl border border-zinc-200/80 bg-white p-4 text-left shadow-sm transition hover:border-orange-300">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-black text-zinc-950">{lead.name}</h3><p className="mt-1 text-xs font-semibold text-zinc-500">{formatDisplayPhone(lead.phone)}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${statusTone[lead.status] || 'bg-zinc-100 text-zinc-600'}`}>{statusLabel[lead.status] || lead.status}</span></div>
        <div className="mt-4 rounded-2xl bg-zinc-50 p-3"><div className="text-xs font-black text-zinc-800">{lead.interestedModel || 'Chưa chọn sản phẩm'}</div><div className="mt-1 text-[11px] font-semibold text-zinc-500">{lead.assignedStaff || 'Hệ thống đang phân công'} · {lead.source || 'Chưa rõ nguồn'}</div></div>
        {lead.lastActivitySummary && <p className="mt-3 line-clamp-2 text-xs font-medium text-zinc-500">{lead.lastActivitySummary}</p>}
      </button>)}</div>
      {hasMore && <button onClick={() => void loadMore()} disabled={loadingMore} className="mx-auto flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 text-xs font-black text-white disabled:opacity-50">{loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Xem thêm</button>}
    </section>}
    {viewMode === 'DISPATCH' && isManager && <CRMDispatchView data={dispatch} loading={loading} onRefresh={() => void refresh()} onSelectStaff={staffId => { setOwnerId(staffId); setViewMode('MY_WORK'); }} />}
    {viewMode === 'CARE_QA' && isManager && <CareQAManagerView leads={visibleLeads} activities={activities} staffList={users} branches={allowedBranches} currentUser={currentUser} onUpdateActivityVerification={reviewActivity} />}
    {viewMode === 'ANALYTICS' && isManager && <CRMServerDashboardView dashboard={dashboard} loading={loading} />}

    <CreateLeadModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSaveLead={createLead} branches={allowedBranches.length ? allowedBranches : branches} currentBranchId={branchId} existingLeads={visibleLeads} currentUser={currentUser} staffList={users} />
    {careLead && <CompleteCareActivityModal isOpen lead={careLead} currentUser={currentUser} branches={branches} existingActivities={activities} onClose={() => { setCareLead(null); setCareTaskId(undefined); }} onSubmitActivity={recordCare} />}
    {drawerLead && <LeadOperationalDrawer isOpen lead={drawerLead} currentUser={currentUser} branches={branches} devices={devices}
      activities={drawerData?.activities || activities.filter(item => item.leadId === drawerLead.id)} appointments={drawerData?.appointments || []} quotes={drawerData?.quotes || []}
      invoices={drawerData?.invoices || legacyInvoices.filter(item => (item as any).leadId === drawerLead.id)} warrantyTickets={drawerData?.warrantyTickets || legacyWarrantyTickets}
      onClose={() => { setDrawerLead(null); setDrawerData(null); }} onOpenCareModal={lead => openCare(lead)} onSaveAppointment={createAppointment}
      onUpdateAppointmentStatus={updateAppointment} onSaveQuote={createQuote} onConvertQuoteToPOS={(_quote, lead) => onConvertLeadToSale(lead)} />}
  </div>;
};
