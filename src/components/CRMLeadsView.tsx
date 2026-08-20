import React, { useState, useEffect, useMemo } from 'react';
import { 
  Lead, 
  DeviceItem, 
  UserAccount, 
  StoreBranch,
  LeadCareActivity,
  LeadAppointment,
  LeadQuote,
  SalesInvoice,
  WarrantyTicket,
  EvidenceVerificationStatus
} from '../types';
import { normalizePhoneNumber, formatPhoneDisplay } from '../utils/phoneUtils';
import { getVietnamDateString, getVietnamTimeString, getVietnamDateTimeString } from '../utils/dateTimeUtils';
import { 
  subscribeToLeadCareActivities,
  addLeadCareActivityToFirestore,
  updateLeadCareActivityInFirestore,
  subscribeToLeadAppointments,
  addLeadAppointmentToFirestore,
  updateLeadAppointmentInFirestore,
  subscribeToLeadQuotes,
  addLeadQuoteToFirestore
} from '../services/firestoreService';
import { 
  requestServerCareReview, 
  requestLeadStateTransition, 
  requestDeviceReservation, 
  requestConvertQuoteToPOS 
} from '../services/crmApiClient';

import { LeadKanbanBoard } from '../features/crm/components/LeadKanbanBoard';
import { CompleteCareActivityModal } from '../features/crm/components/CompleteCareActivityModal';
import { LeadOperationalDrawer } from '../features/crm/components/LeadOperationalDrawer';
import { MyWorkFollowUpView } from '../features/crm/components/MyWorkFollowUpView';
import { CareQAManagerView } from '../features/crm/components/CareQAManagerView';
import { CRMAnalyticsView } from '../features/crm/components/CRMAnalyticsView';
import { LeadCardCareBadge } from '../features/crm/components/LeadCardCareBadge';

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
  Tag,
  X,
  Clock,
  ShieldCheck,
  TrendingUp,
  LayoutGrid,
  ListFilter
} from 'lucide-react';

interface CRMLeadsViewProps {
  currentUser?: UserAccount | null;
  branches?: StoreBranch[];
  leads: Lead[];
  devices: DeviceItem[];
  invoices?: SalesInvoice[];
  warrantyTickets?: WarrantyTicket[];
  onAddLead: (lead: Lead) => void;
  onUpdateLead: (lead: Lead) => void;
  onConvertLeadToSale: (lead: Lead) => void;
  onNavigateToOmnichannelChat?: () => void;
}

export type CRMViewMode = 'MY_WORK' | 'PIPELINE' | 'LIST' | 'CARE_QA' | 'ANALYTICS';

export const CRMLeadsView: React.FC<CRMLeadsViewProps> = ({
  currentUser,
  branches = [],
  leads,
  devices,
  invoices = [],
  warrantyTickets = [],
  onAddLead,
  onUpdateLead,
  onConvertLeadToSale,
  onNavigateToOmnichannelChat
}) => {
  // Navigation View Mode
  const [viewMode, setViewMode] = useState<CRMViewMode>('MY_WORK');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  // Care domain state synced from Firestore
  const [activities, setActivities] = useState<LeadCareActivity[]>([]);
  const [appointments, setAppointments] = useState<LeadAppointment[]>([]);
  const [quotes, setQuotes] = useState<LeadQuote[]>([]);

  // Modals & Drawers
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [activeCareModalLead, setActiveCareModalLead] = useState<Lead | null>(null);
  const [activeDrawerLead, setActiveDrawerLead] = useState<Lead | null>(null);

  // Subscribe to real-time collections
  useEffect(() => {
    const filter = currentUser?.branchId ? { branchId: currentUser.branchId } : undefined;

    const unsubActivities = subscribeToLeadCareActivities((remoteActs) => {
      if (remoteActs) setActivities(remoteActs);
    }, filter);

    const unsubAppts = subscribeToLeadAppointments((remoteAppts) => {
      if (remoteAppts) setAppointments(remoteAppts);
    }, filter);

    const unsubQuotes = subscribeToLeadQuotes((remoteQuotes) => {
      if (remoteQuotes) setQuotes(remoteQuotes);
    }, filter);

    return () => {
      unsubActivities();
      unsubAppts();
      unsubQuotes();
    };
  }, [currentUser?.branchId]);

  // New Lead Form State
  const [formData, setFormData] = useState<Partial<Lead>>({
    name: '',
    phone: '',
    zalo: '',
    source: 'Facebook Ads',
    interestedModel: 'iPhone 16 Pro Max 256GB Desert',
    budget: 34000000,
    tradeInRequirose: false,
    tradeInModel: '',
    status: 'new',
    assignedStaff: currentUser?.displayName || 'Tuấn Bán Hàng',
    followUpDate: getVietnamDateString(),
    notes: '',
    branchId: currentUser?.branchId || branches[0]?.id || ''
  });

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      const matchesSearch = 
        l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.phone.includes(searchTerm) ||
        (l.phoneNormalized && l.phoneNormalized.includes(searchTerm)) ||
        l.interestedModel.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.notes && l.notes.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = selectedStatusFilter === 'ALL' || l.status === selectedStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, searchTerm, selectedStatusFilter]);

  const handleSaveLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      alert('Vui lòng nhập tên và số điện thoại khách hàng!');
      return;
    }

    const cleanPhone = normalizePhoneNumber(formData.phone);
    const existingDuplicate = leads.find(l => normalizePhoneNumber(l.phone) === cleanPhone);
    if (existingDuplicate) {
      if (!confirm(`Hệ thống phát hiện SĐT ${formData.phone} đã tồn tại ở Lead: "${existingDuplicate.name}" (${existingDuplicate.interestedModel}). Bạn có muốn tiếp tục tạo thêm Lead này không?`)) {
        return;
      }
    }

    const newLead: Lead = {
      id: `LEAD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      name: formData.name,
      phone: formData.phone,
      phoneNormalized: cleanPhone,
      zalo: formData.zalo || formData.phone,
      source: (formData.source as any) || 'Facebook Ads',
      interestedModel: formData.interestedModel || 'iPhone 16 Pro Max',
      budget: Number(formData.budget) || 20000000,
      tradeInRequirose: Boolean(formData.tradeInRequirose),
      tradeInModel: formData.tradeInModel || '',
      status: (formData.status as any) || 'new',
      careStatus: 'CARE_1_PENDING',
      careAttempts: 0,
      meaningfulCareCount: 0,
      careQualityScore: 50,
      assignedStaff: formData.assignedStaff || currentUser?.displayName || 'Chuyên viên bán hàng',
      assignedStaffId: currentUser?.id || 'STAFF',
      followUpDate: formData.followUpDate || getVietnamDateString(),
      createdAt: getVietnamDateString(),
      notes: formData.notes || '',
      branchId: formData.branchId || currentUser?.branchId || branches[0]?.id || ''
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
      tradeInRequirose: false,
      tradeInModel: '',
      status: 'new',
      assignedStaff: currentUser?.displayName || 'Tuấn Bán Hàng',
      followUpDate: getVietnamDateString(),
      notes: ''
    });
  };

  const handleCareActivitySubmit = async (activity: LeadCareActivity, updatedLeadPartial: Partial<Lead>) => {
    // 1. Add care activity to Firestore
    await addLeadCareActivityToFirestore(activity);
    setActivities(prev => [activity, ...prev]);

    // 2. Update parent lead state & Firestore
    const targetLead = leads.find(l => l.id === activity.leadId);
    if (targetLead) {
      const mergedLead: Lead = {
        ...targetLead,
        ...updatedLeadPartial
      };
      onUpdateLead(mergedLead);
      if (activeDrawerLead && activeDrawerLead.id === targetLead.id) {
        setActiveDrawerLead(mergedLead);
      }
    }
  };

  const handleSaveAppointment = async (appointment: LeadAppointment) => {
    await addLeadAppointmentToFirestore(appointment);
    setAppointments(prev => [appointment, ...prev]);

    const targetLead = leads.find(l => l.id === appointment.leadId);
    if (targetLead) {
      const updated: Lead = {
        ...targetLead,
        status: 'appointment_scheduled',
        nextActionAt: appointment.scheduledAt,
        nextActionNotes: `Hẹn đón tại showroom: ${appointment.branchName}`
      };
      onUpdateLead(updated);
    }
  };

  const handleSaveQuote = async (quote: LeadQuote) => {
    // If quote specifies an inventory device to hold, call Server Reservation API
    if (quote.reservedDeviceId) {
      try {
        await requestDeviceReservation(
          quote.reservedDeviceId,
          quote.leadId,
          quote.id,
          quote.customerId
        );
      } catch (err: any) {
        console.error('[CRM Device Reservation Error]:', err);
        alert(`Không thể giữ máy tồn kho: ${err?.message || 'Thiết bị đang bận hoặc thuộc chi nhánh khác.'}`);
        return;
      }
    }

    try {
      await addLeadQuoteToFirestore(quote);
      setQuotes(prev => [quote, ...prev]);
    } catch (err: any) {
      alert(`Lỗi lưu báo giá: ${err?.message || 'Không thể ghi nhận báo giá.'}`);
    }
  };

  const handleConvertQuoteToPOS = (quote: LeadQuote, lead: Lead) => {
    onConvertLeadToSale(lead);
  };

  const handleUpdateAppointmentStatus = async (appointmentId: string, newStatus: LeadAppointment['status']) => {
    const appt = appointments.find(a => a.id === appointmentId);
    if (appt) {
      const updated: LeadAppointment = {
        ...appt,
        status: newStatus,
        arrivedAt: newStatus === 'ARRIVED' ? getVietnamDateTimeString() : appt.arrivedAt
      };
      try {
        await updateLeadAppointmentInFirestore(updated);
        setAppointments(prev => prev.map(a => a.id === appointmentId ? updated : a));
      } catch (err: any) {
        alert(`Lỗi cập nhật lịch hẹn: ${err?.message || 'Thao tác bị từ chối.'}`);
      }
    }
  };

  const handleUpdateActivityVerification = async (
    activityId: string, 
    status: EvidenceVerificationStatus, 
    note?: string
  ) => {
    try {
      // Authoritative Backend QA Audit Request (Strict Fail-Closed)
      const serverUpdated = await requestServerCareReview(activityId, status, note);
      setActivities(prev => prev.map(a => a.id === activityId ? serverUpdated : a));
    } catch (err: any) {
      console.error('[CRM QA Server Audit Error]:', err);
      alert(`Lỗi kiểm duyệt QA từ máy chủ: ${err?.message || 'Không thể thực hiện kiểm duyệt.'}`);
    }
  };

  return (
    <div className="space-y-4 pb-12">
      {/* 1. Header with Mode Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-zinc-200/80 shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-black text-zinc-900">Quản Trị Chăm Sóc Khách Hàng (CRM 3.1)</h2>
            <span className="bg-orange-50 text-[#FF4B16] border border-orange-200 text-xs px-2.5 py-0.5 rounded-full font-black">
              {leads.length} Leads
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Quy trình chăm sóc có kiểm chứng: Đàm thoại ý nghĩa (Meaningful Care) • Bằng chứng xác thực • QA Audit
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {onNavigateToOmnichannelChat && (
            <button
              onClick={onNavigateToOmnichannelChat}
              className="bg-white hover:bg-orange-50 border border-orange-200 text-[#FF4B16] text-xs font-black px-3.5 py-2 rounded-xl flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Inbox Đa Kênh</span>
            </button>
          )}

          <button
            onClick={() => setIsAddLeadModalOpen(true)}
            className="bg-[#FF4B16] hover:bg-[#E94312] text-white text-xs font-black px-4 py-2 rounded-xl flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Tạo Lead Mới</span>
          </button>
        </div>
      </div>

      {/* 2. Sub-Navigation View Mode Switcher */}
      <div className="flex items-center space-x-1 bg-zinc-100 p-1.5 rounded-2xl overflow-x-auto text-xs">
        {[
          { id: 'MY_WORK', label: '📋 Hôm Nay (My Work)', desc: 'Bảng theo dõi cá nhân Sale' },
          { id: 'PIPELINE', label: '📊 Pipeline (Phễu Bán Hàng)', desc: 'Kanban tiến trình chuyển đổi' },
          { id: 'LIST', label: '📝 Danh Sách Lead', desc: 'Tra cứu & Lọc chi tiết' },
          { id: 'CARE_QA', label: '🔍 QA Chăm Sóc (Manager)', desc: 'Thẩm định bằng chứng & KPI' },
          { id: 'ANALYTICS', label: '📈 Báo Cáo & Funnel', desc: 'Phễu chuyển đổi & Lý do mất lead' }
        ].map((mode) => {
          const isSelected = viewMode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id as CRMViewMode)}
              className={`px-4 py-2 rounded-xl font-black transition-all cursor-pointer whitespace-nowrap ${
                isSelected 
                  ? 'bg-white text-[#FF4B16] shadow-xs' 
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/50'
              }`}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      {/* 3. Main Views Container */}
      {viewMode === 'MY_WORK' && (
        <MyWorkFollowUpView
          leads={leads}
          currentUser={currentUser}
          activities={activities}
          appointments={appointments}
          onSelectLead={(lead) => setActiveDrawerLead(lead)}
          onOpenCareModal={(lead) => setActiveCareModalLead(lead)}
        />
      )}

      {viewMode === 'PIPELINE' && (
        <LeadKanbanBoard
          leads={leads}
          activities={activities}
          onSelectLead={(lead) => setActiveDrawerLead(lead)}
          onUpdateLeadStatus={async (leadId, newStatus, lostReason) => {
            const lead = leads.find(l => l.id === leadId);
            if (lead) {
              try {
                await requestLeadStateTransition(leadId, lead.status, newStatus, { lostReason });
                onUpdateLead({ ...lead, status: newStatus, lostReason: lostReason || lead.lostReason });
              } catch (err: any) {
                alert(`Lỗi chuyển đổi trạng thái Lead: ${err?.message || 'Không thể chuyển đổi trạng thái.'}`);
              }
            }
          }}
          onOpenCreateModal={() => setIsAddLeadModalOpen(true)}
          onOpenCareModal={(lead) => setActiveCareModalLead(lead)}
        />
      )}

      {viewMode === 'LIST' && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Tìm tên, SĐT, dòng máy quan tâm..."
                className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-[#FF4B16]"
              />
            </div>
            <select
              value={selectedStatusFilter}
              onChange={e => setSelectedStatusFilter(e.target.value)}
              className="p-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700"
            >
              <option value="ALL">Tất cả giai đoạn</option>
              <option value="new">Mới nhận</option>
              <option value="contacted">Đã liên hệ</option>
              <option value="negotiating">Đang tư vấn</option>
              <option value="appointment_scheduled">Hẹn showroom</option>
              <option value="deposit">Đã đặt cọc</option>
              <option value="won">Thành công (Won)</option>
              <option value="lost">Thất bại (Lost)</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-100/80 text-zinc-700 font-bold uppercase text-[11px]">
                  <th className="py-2.5 px-3 rounded-l-xl">Khách Hàng</th>
                  <th className="py-2.5 px-3">Sản Phẩm & Ngân Sách</th>
                  <th className="py-2.5 px-3">Tiến Trình Chăm Sóc</th>
                  <th className="py-2.5 px-3">Phụ Trách</th>
                  <th className="py-2.5 px-3">Hẹn Kế Tiếp</th>
                  <th className="py-2.5 px-3 text-right rounded-r-xl">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredLeads.map((l) => (
                  <tr 
                    key={l.id} 
                    onClick={() => setActiveDrawerLead(l)}
                    className="hover:bg-zinc-50/70 cursor-pointer font-medium"
                  >
                    <td className="py-3 px-3 font-bold text-zinc-900">
                      <div>{l.name}</div>
                      <div className="text-[11px] text-zinc-500 font-mono">{formatPhoneDisplay(l.phone)}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-zinc-800">{l.interestedModel}</div>
                      <div className="text-[11px] text-emerald-600 font-bold">~{l.budget.toLocaleString('vi-VN')} đ</div>
                    </td>
                    <td className="py-3 px-3 min-w-[200px]">
                      <LeadCardCareBadge
                        lead={l}
                        activities={activities}
                        onOpenCareModal={(lead) => setActiveCareModalLead(lead)}
                      />
                    </td>
                    <td className="py-3 px-3 text-zinc-700 font-medium">
                      {l.assignedStaff}
                    </td>
                    <td className="py-3 px-3 text-zinc-600">
                      {l.nextActionAt || l.followUpDate}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveCareModalLead(l);
                        }}
                        className="px-3 py-1.5 bg-[#FF4B16] text-white rounded-lg text-xs font-bold hover:bg-[#E94312]"
                      >
                        + Chăm sóc
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'CARE_QA' && (
        <CareQAManagerView
          leads={leads}
          activities={activities}
          branches={branches}
          currentUser={currentUser}
          onUpdateActivityVerification={handleUpdateActivityVerification}
        />
      )}

      {viewMode === 'ANALYTICS' && (
        <CRMAnalyticsView
          leads={leads}
          activities={activities}
        />
      )}

      {/* 4. Complete Care Modal */}
      {activeCareModalLead && (
        <CompleteCareActivityModal
          isOpen={Boolean(activeCareModalLead)}
          lead={activeCareModalLead}
          currentUser={currentUser}
          branches={branches}
          existingActivities={activities}
          onClose={() => setActiveCareModalLead(null)}
          onSubmitActivity={handleCareActivitySubmit}
        />
      )}

      {/* 5. Lead Operational Workspace Drawer */}
      {activeDrawerLead && (
        <LeadOperationalDrawer
          isOpen={Boolean(activeDrawerLead)}
          lead={activeDrawerLead}
          currentUser={currentUser}
          branches={branches}
          devices={devices}
          activities={activities}
          appointments={appointments}
          quotes={quotes}
          invoices={invoices}
          warrantyTickets={warrantyTickets}
          onClose={() => setActiveDrawerLead(null)}
          onOpenCareModal={(l) => setActiveCareModalLead(l)}
          onSaveAppointment={handleSaveAppointment}
          onUpdateAppointmentStatus={handleUpdateAppointmentStatus}
          onSaveQuote={handleSaveQuote}
          onConvertQuoteToPOS={handleConvertQuoteToPOS}
        />
      )}

      {/* 6. Quick Create Lead Modal */}
      {isAddLeadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-zinc-100 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#FF4B16] flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black text-zinc-900">Tiếp Nhận Lead Khách Hàng Mới</h3>
              </div>
              <button 
                onClick={() => setIsAddLeadModalOpen(false)}
                className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLead} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Tên khách hàng *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="VD: Nguyễn Văn A"
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Số điện thoại *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="VD: 0905123456"
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Dòng máy quan tâm</label>
                  <input
                    type="text"
                    value={formData.interestedModel}
                    onChange={e => setFormData({ ...formData, interestedModel: e.target.value })}
                    placeholder="VD: iPhone 16 Pro Max 256GB"
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Ngân sách (VNĐ)</label>
                  <input
                    type="number"
                    value={formData.budget}
                    onChange={e => setFormData({ ...formData, budget: Number(e.target.value) })}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Nguồn khách</label>
                  <select
                    value={formData.source}
                    onChange={e => setFormData({ ...formData, source: e.target.value as any })}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold"
                  >
                    <option value="Facebook Ads">Facebook Ads</option>
                    <option value="TikTok">TikTok</option>
                    <option value="Zalo OA">Zalo OA</option>
                    <option value="Khách Vãng Lai">Khách Vãng Lai</option>
                    <option value="Khách Quen Giới Thiệu">Khách Quen Giới Thiệu</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Chuyên viên phụ trách</label>
                  <input
                    type="text"
                    value={formData.assignedStaff}
                    onChange={e => setFormData({ ...formData, assignedStaff: e.target.value })}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-zinc-700 block mb-1">Ghi chú nhu cầu</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Khách cần tư vấn màu Desert, hỏi thêm gói bảo hành VIP..."
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsAddLeadModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 font-bold rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#FF4B16] hover:bg-[#E94312] text-white font-black rounded-xl shadow-xs"
                >
                  Lưu & Phân Bổ Chăm Sóc
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
