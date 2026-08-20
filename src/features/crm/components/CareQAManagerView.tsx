import React, { useState, useMemo } from 'react';
import { Lead, LeadCareActivity, UserAccount, StoreBranch } from '../../../types';
import { formatDisplayPhone } from '../../../utils/phoneUtils';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Search, 
  Filter, 
  User, 
  Building2, 
  Phone, 
  MessageSquare, 
  Sparkles,
  Check,
  X,
  Flag,
  FileCheck,
  Eye
} from 'lucide-react';

export interface CareQAManagerViewProps {
  leads: Lead[];
  activities: LeadCareActivity[];
  staffList?: UserAccount[];
  branches?: StoreBranch[];
  onUpdateActivityVerification?: (activityId: string, status: 'VERIFIED' | 'FLAGGED', note?: string) => Promise<void> | void;
}

export const CareQAManagerView: React.FC<CareQAManagerViewProps> = ({
  leads,
  activities,
  staffList = [],
  branches = [],
  onUpdateActivityVerification
}) => {
  const [selectedStaffFilter, setSelectedStaffFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'VERIFIED' | 'SELF_REPORTED' | 'FLAGGED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActivityForAudit, setSelectedActivityForAudit] = useState<LeadCareActivity | null>(null);
  const [auditNote, setAuditNote] = useState('');

  // Calculate Overall Metrics
  const totalActivities = activities.length;
  const verifiedActivities = activities.filter(a => a.verificationStatus === 'VERIFIED').length;
  const selfReportedActivities = activities.filter(a => a.verificationStatus === 'SELF_REPORTED').length;
  const flaggedActivities = activities.filter(a => a.verificationStatus === 'FLAGGED').length;
  const evidenceRate = totalActivities > 0 ? Math.round((verifiedActivities / totalActivities) * 100) : 100;

  // Staff Performance Matrix
  const staffMatrix = useMemo(() => {
    // Unique staff IDs from activities and leads
    const staffMap = new Map<string, {
      name: string;
      leadsCount: number;
      touchesCount: number;
      l1Count: number;
      l2Count: number;
      l3Count: number;
      verifiedCount: number;
      wonCount: number;
    }>();

    leads.forEach(l => {
      const sName = l.assignedStaff || 'Chưa phân bổ';
      if (!staffMap.has(sName)) {
        staffMap.set(sName, {
          name: sName,
          leadsCount: 0,
          touchesCount: 0,
          l1Count: 0,
          l2Count: 0,
          l3Count: 0,
          verifiedCount: 0,
          wonCount: 0
        });
      }
      const entry = staffMap.get(sName)!;
      entry.leadsCount++;
      if (l.status === 'won') entry.wonCount++;
    });

    activities.forEach(a => {
      const sName = a.staffName || 'Chuyên viên';
      if (!staffMap.has(sName)) {
        staffMap.set(sName, {
          name: sName,
          leadsCount: 0,
          touchesCount: 0,
          l1Count: 0,
          l2Count: 0,
          l3Count: 0,
          verifiedCount: 0,
          wonCount: 0
        });
      }
      const entry = staffMap.get(sName)!;
      entry.touchesCount++;
      if (a.sequence === 1) entry.l1Count++;
      if (a.sequence === 2) entry.l2Count++;
      if (a.sequence >= 3) entry.l3Count++;
      if (a.verificationStatus === 'VERIFIED') entry.verifiedCount++;
    });

    return Array.from(staffMap.values());
  }, [leads, activities]);

  // Filtered Activities Feed
  const filteredActivities = useMemo(() => {
    return activities.filter(a => {
      const matchesStaff = selectedStaffFilter === 'ALL' || a.staffName === selectedStaffFilter || a.staffId === selectedStaffFilter;
      const matchesStatus = selectedStatusFilter === 'ALL' || a.verificationStatus === selectedStatusFilter;
      const matchesSearch = 
        (a.staffName && a.staffName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (a.customerResponseText && a.customerResponseText.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (a.action && a.action.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesStaff && matchesStatus && matchesSearch;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [activities, selectedStaffFilter, selectedStatusFilter, searchTerm]);

  const handleAuditSubmit = async (status: 'VERIFIED' | 'FLAGGED') => {
    if (!selectedActivityForAudit || !onUpdateActivityVerification) return;
    await onUpdateActivityVerification(selectedActivityForAudit.id, status, auditNote);
    setSelectedActivityForAudit(null);
    setAuditNote('');
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* 1. Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-3xl border border-zinc-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Tỷ Lệ Có Bằng Chứng</span>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span className="text-xl font-black text-emerald-700">{evidenceRate}%</span>
          </div>
          <span className="text-[11px] text-zinc-500 font-medium">{verifiedActivities}/{totalActivities} lượt chăm sóc xác thực</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-zinc-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Đã Xác Thực (Verified)</span>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-blue-600" />
            <span className="text-xl font-black text-blue-700">{verifiedActivities}</span>
          </div>
          <span className="text-[11px] text-zinc-500 font-medium">Cuộc gọi, Chat ID, Báo giá</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-zinc-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Tự Khai (Self Reported)</span>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <span className="text-xl font-black text-amber-700">{selfReportedActivities}</span>
          </div>
          <span className="text-[11px] text-zinc-500 font-medium">Cần quản lý kiểm duyệt</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-zinc-200/80 shadow-2xs space-y-1">
          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Bị Cảnh Báo (Flagged)</span>
          <div className="flex items-center space-x-2">
            <Flag className="w-5 h-5 text-rose-600" />
            <span className="text-xl font-black text-rose-700">{flaggedActivities}</span>
          </div>
          <span className="text-[11px] text-zinc-500 font-medium">Chưa đạt tiêu chuẩn QA</span>
        </div>
      </div>

      {/* 2. Staff QA Leaderboard Matrix */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#FF4B16]" />
          <span>Bảng Đánh Giá Tuân Thủ Quy Trình Chăm Sóc Của Đội Ngũ Sale</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-100/80 text-zinc-700 font-bold uppercase text-[11px]">
                <th className="py-2.5 px-3 rounded-l-xl">Chuyên viên Sale</th>
                <th className="py-2.5 px-3 text-center">Tổng Lead</th>
                <th className="py-2.5 px-3 text-center">Hoàn thành L1</th>
                <th className="py-2.5 px-3 text-center">Chăm L2</th>
                <th className="py-2.5 px-3 text-center">Chăm L3</th>
                <th className="py-2.5 px-3 text-center">Tỷ Lệ Bằng Chứng</th>
                <th className="py-2.5 px-3 text-center rounded-r-xl">Chốt Thành Công</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {staffMatrix.map((st) => {
                const staffEvidenceRate = st.touchesCount > 0 ? Math.round((st.verifiedCount / st.touchesCount) * 100) : 0;
                const conversionRate = st.leadsCount > 0 ? Math.round((st.wonCount / st.leadsCount) * 100) : 0;
                return (
                  <tr key={st.name} className="hover:bg-zinc-50/60 font-medium text-zinc-800">
                    <td className="py-2.5 px-3 font-bold text-zinc-900">{st.name}</td>
                    <td className="py-2.5 px-3 text-center font-bold">{st.leadsCount}</td>
                    <td className="py-2.5 px-3 text-center text-blue-600 font-bold">{st.l1Count}</td>
                    <td className="py-2.5 px-3 text-center text-amber-600 font-bold">{st.l2Count}</td>
                    <td className="py-2.5 px-3 text-center text-purple-600 font-bold">{st.l3Count}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                        staffEvidenceRate >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {staffEvidenceRate}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-black text-[11px]">
                        {conversionRate}% ({st.wonCount})
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Realtime Activity Audit Feed */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-zinc-200/80 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900">
              Nhật Ký Chăm Sóc & Kiểm Duyệt Bằng Chứng ({filteredActivities.length} Hoạt động)
            </h3>
            <p className="text-[11px] text-zinc-500">Quản lý kiểm tra tính xác thực của cuộc gọi, tin nhắn và hình ảnh</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={selectedStatusFilter}
              onChange={e => setSelectedStatusFilter(e.target.value as any)}
              className="p-2 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-zinc-700"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="VERIFIED">✓ Đã xác thực (Verified)</option>
              <option value="SELF_REPORTED">⚠️ Tự khai báo (Self-reported)</option>
              <option value="FLAGGED">🚩 Bị cảnh báo (Flagged)</option>
            </select>
          </div>
        </div>

        {/* Activity Cards List */}
        <div className="space-y-3">
          {filteredActivities.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-10">Không có hoạt động nào khớp với bộ lọc.</p>
          ) : (
            filteredActivities.map((act) => (
              <div 
                key={act.id}
                className="p-4 bg-zinc-50/70 border border-zinc-200 rounded-2xl space-y-2.5 text-xs hover:bg-white hover:shadow-xs transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded-lg bg-[#FF4B16] text-white font-black text-[10px]">
                      L{act.sequence}
                    </span>
                    <span className="font-bold text-zinc-900">{act.staffName}</span>
                    <span className="text-zinc-400">•</span>
                    <span className="text-zinc-600 font-semibold">{act.action}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      act.verificationStatus === 'VERIFIED' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : act.verificationStatus === 'FLAGGED'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {act.verificationStatus}
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-400">{act.createdAt}</span>
                </div>

                {/* Evidence Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-zinc-200/70 text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-400 block font-bold uppercase">Bằng chứng ghi nhận</span>
                    <span className="font-bold text-emerald-700">
                      {act.evidenceType === 'CALL_LOG' && `☎️ Cuộc gọi ${act.evidenceData?.callDurationSeconds || 54}s`}
                      {act.evidenceType === 'CONVERSATION_ATTACHED' && `💬 Chat Thread: ${act.evidenceData?.conversationId || 'Omnichannel'}`}
                      {act.evidenceType === 'SCREENSHOT_UPLOAD' && `🖼️ Ảnh đính kèm: ${act.evidenceData?.screenshotFileName || 'screenshot.png'}`}
                      {act.evidenceType === 'SELF_REPORTED' && '⚠️ Tự khai báo'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block font-bold uppercase">Phản hồi khách hàng</span>
                    <span className="text-zinc-800 font-medium">"{act.customerResponseText || act.customerResponseCode || 'Không có ghi chú'}"</span>
                  </div>
                </div>

                {/* Audit Controls for Manager */}
                <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
                  <div className="text-[11px] text-zinc-500 font-medium">
                    Hẹn kế tiếp: <strong className="text-zinc-800">{act.nextActionAt || 'Chưa hẹn'}</strong> ({act.nextActionType || 'CALL'})
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => onUpdateActivityVerification && onUpdateActivityVerification(act.id, 'VERIFIED')}
                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      ✓ Duyệt đạt chuẩn
                    </button>
                    <button
                      onClick={() => onUpdateActivityVerification && onUpdateActivityVerification(act.id, 'FLAGGED', 'Thiếu bằng chứng xác thực')}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                    >
                      🚩 Cảnh báo Flag
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
