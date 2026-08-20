import React, { useState, useMemo } from 'react';
import { Lead, LeadCareActivity, UserAccount, StoreBranch, EvidenceVerificationStatus } from '../../../types';
import { formatDisplayPhone } from '../../../utils/phoneUtils';
import { getVietnamDateTimeString } from '../../../utils/dateTimeUtils';
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
  Eye,
  HelpCircle,
  History
} from 'lucide-react';

export interface CareQAManagerViewProps {
  leads: Lead[];
  activities: LeadCareActivity[];
  staffList?: UserAccount[];
  branches?: StoreBranch[];
  currentUser?: UserAccount | null;
  onUpdateActivityVerification?: (
    activityId: string, 
    status: EvidenceVerificationStatus, 
    note?: string,
    reviewer?: { id: string; name: string }
  ) => Promise<void> | void;
}

export const CareQAManagerView: React.FC<CareQAManagerViewProps> = ({
  leads,
  activities,
  staffList = [],
  branches = [],
  currentUser,
  onUpdateActivityVerification
}) => {
  const [selectedStaffFilter, setSelectedStaffFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActivityForAudit, setSelectedActivityForAudit] = useState<LeadCareActivity | null>(null);
  const [auditNote, setAuditNote] = useState('');
  const [isSubmittingAudit, setIsSubmittingAudit] = useState(false);

  // Calculate Overall Metrics
  const totalActivities = activities.length;
  const verifiedActivities = activities.filter(a => a.verificationStatus === 'MANAGER_VERIFIED' || a.verificationStatus === 'SYSTEM_CAPTURED').length;
  const selfReportedActivities = activities.filter(a => a.verificationStatus === 'SELF_REPORTED' || a.verificationStatus === 'PENDING_EVIDENCE').length;
  const needsEvidenceActivities = activities.filter(a => a.verificationStatus === 'NEEDS_EVIDENCE').length;
  const flaggedActivities = activities.filter(a => a.verificationStatus === 'FLAGGED').length;
  const evidenceRate = totalActivities > 0 ? Math.round((verifiedActivities / totalActivities) * 100) : 100;

  // Staff Performance Matrix Grouped strictly by staffId
  const staffMatrix = useMemo(() => {
    const staffMap = new Map<string, {
      staffId: string;
      name: string;
      role?: string;
      branchId?: string;
      leadsCount: number;
      touchesCount: number;
      meaningfulCount: number;
      l1Count: number;
      l2Count: number;
      l3Count: number;
      verifiedCount: number;
      wonCount: number;
    }>();

    // Initialize staff map with active sales / tech staff
    staffList.forEach(st => {
      staffMap.set(st.id, {
        staffId: st.id,
        name: st.displayName || st.email,
        role: st.role,
        branchId: st.branchId,
        leadsCount: 0,
        touchesCount: 0,
        meaningfulCount: 0,
        l1Count: 0,
        l2Count: 0,
        l3Count: 0,
        verifiedCount: 0,
        wonCount: 0
      });
    });

    leads.forEach(l => {
      const sId = l.assignedStaffId || 'UNASSIGNED';
      if (!staffMap.has(sId)) {
        staffMap.set(sId, {
          staffId: sId,
          name: l.assignedStaff || 'Chưa phân bổ',
          leadsCount: 0,
          touchesCount: 0,
          meaningfulCount: 0,
          l1Count: 0,
          l2Count: 0,
          l3Count: 0,
          verifiedCount: 0,
          wonCount: 0
        });
      }
      const entry = staffMap.get(sId)!;
      entry.leadsCount++;
      if (l.status === 'won') entry.wonCount++;
    });

    activities.forEach(a => {
      const sId = a.staffId || 'UNASSIGNED';
      if (!staffMap.has(sId)) {
        staffMap.set(sId, {
          staffId: sId,
          name: a.staffName || 'Chuyên viên',
          leadsCount: 0,
          touchesCount: 0,
          meaningfulCount: 0,
          l1Count: 0,
          l2Count: 0,
          l3Count: 0,
          verifiedCount: 0,
          wonCount: 0
        });
      }
      const entry = staffMap.get(sId)!;
      entry.touchesCount++;
      if (a.isMeaningfulContact) entry.meaningfulCount++;
      if (a.meaningfulCareNo === 1 || (!a.meaningfulCareNo && a.sequence === 1)) entry.l1Count++;
      if (a.meaningfulCareNo === 2 || (!a.meaningfulCareNo && a.sequence === 2)) entry.l2Count++;
      if (a.meaningfulCareNo === 3 || (!a.meaningfulCareNo && a.sequence === 3)) entry.l3Count++;
      if (a.verificationStatus === 'MANAGER_VERIFIED' || a.verificationStatus === 'SYSTEM_CAPTURED') entry.verifiedCount++;
    });

    return Array.from(staffMap.values()).filter(s => s.leadsCount > 0 || s.touchesCount > 0);
  }, [leads, activities, staffList]);

  // Filtered Activities
  const filteredActivities = useMemo(() => {
    return activities.filter(a => {
      if (selectedStaffFilter !== 'ALL' && a.staffId !== selectedStaffFilter) return false;
      if (selectedStatusFilter !== 'ALL' && a.verificationStatus !== selectedStatusFilter) return false;
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const lead = leads.find(l => l.id === a.leadId);
        const matchName = lead?.name.toLowerCase().includes(query);
        const matchPhone = lead?.phone.includes(query);
        const matchStaff = a.staffName.toLowerCase().includes(query);
        const matchText = a.customerResponseText?.toLowerCase().includes(query);
        if (!matchName && !matchPhone && !matchStaff && !matchText) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [activities, selectedStaffFilter, selectedStatusFilter, searchTerm, leads]);

  const handlePerformAudit = async (newStatus: EvidenceVerificationStatus) => {
    if (!selectedActivityForAudit || !onUpdateActivityVerification) return;
    setIsSubmittingAudit(true);
    try {
      const reviewer = currentUser ? { id: currentUser.id, name: currentUser.displayName } : { id: 'QA_MGR', name: 'Quản Lý QA' };
      await onUpdateActivityVerification(selectedActivityForAudit.id, newStatus, auditNote, reviewer);
      setSelectedActivityForAudit(null);
      setAuditNote('');
    } catch (e) {
      console.error('Audit update error:', e);
      alert('Lỗi cập nhật thẩm định QA. Vui lòng thử lại.');
    } finally {
      setIsSubmittingAudit(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      
      {/* 1. QA KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Tỷ lệ bằng chứng</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{evidenceRate}%</div>
          <div className="text-[11px] text-zinc-400 mt-0.5">{verifiedActivities}/{totalActivities} hoạt động đạt chuẩn</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Đã xác minh (QA)</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{verifiedActivities}</div>
          <div className="text-[11px] text-emerald-600 font-bold mt-0.5">✓ Đủ điều kiện tính KPI</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Chờ duyệt / Tự khai</div>
          <div className="text-2xl font-black text-amber-600 mt-1">{selfReportedActivities}</div>
          <div className="text-[11px] text-amber-700 font-bold mt-0.5">⚠️ Cần QA kiểm tra</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Yêu cầu bổ sung</div>
          <div className="text-2xl font-black text-blue-600 mt-1">{needsEvidenceActivities}</div>
          <div className="text-[11px] text-blue-600 font-bold mt-0.5">Chờ Sale upload thêm</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Gắn cờ / Vi phạm</div>
          <div className="text-2xl font-black text-rose-600 mt-1">{flaggedActivities}</div>
          <div className="text-[11px] text-rose-600 font-bold mt-0.5">Đã trừ điểm chất lượng</div>
        </div>
      </div>

      {/* 2. Staff Care Compliance Matrix */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-zinc-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#FF4B16]" />
            <span>Ma Trận Tuân Thủ Chăm Sóc Theo Nhân Sự (Staff Compliance Matrix)</span>
          </h3>
          <span className="text-xs text-zinc-500 font-medium">{staffMatrix.length} Nhân sự phụ trách</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-zinc-50 text-zinc-600 font-bold uppercase text-[10px] border-y border-zinc-200">
              <tr>
                <th className="py-2.5 px-3">Nhân viên</th>
                <th className="py-2.5 px-2 text-center">Tổng Lead</th>
                <th className="py-2.5 px-2 text-center">Số lượt chạm</th>
                <th className="py-2.5 px-2 text-center">Ý nghĩa</th>
                <th className="py-2.5 px-2 text-center">L1</th>
                <th className="py-2.5 px-2 text-center">L2</th>
                <th className="py-2.5 px-2 text-center">L3</th>
                <th className="py-2.5 px-2 text-center">Tỷ lệ bằng chứng</th>
                <th className="py-2.5 px-2 text-center">Chốt Won</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {staffMatrix.map(s => {
                const sRate = s.touchesCount > 0 ? Math.round((s.verifiedCount / s.touchesCount) * 100) : 100;
                return (
                  <tr key={s.staffId} className="hover:bg-zinc-50/50">
                    <td className="py-2.5 px-3 font-bold text-zinc-900">
                      <div>{s.name}</div>
                      <div className="text-[10px] text-zinc-400 font-mono font-normal">{s.staffId}</div>
                    </td>
                    <td className="py-2.5 px-2 text-center font-semibold">{s.leadsCount}</td>
                    <td className="py-2.5 px-2 text-center font-bold text-zinc-700">{s.touchesCount}</td>
                    <td className="py-2.5 px-2 text-center font-bold text-blue-600">{s.meaningfulCount}</td>
                    <td className="py-2.5 px-2 text-center text-zinc-600">{s.l1Count}</td>
                    <td className="py-2.5 px-2 text-center text-zinc-600">{s.l2Count}</td>
                    <td className="py-2.5 px-2 text-center text-zinc-600">{s.l3Count}</td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        sRate >= 80 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        sRate >= 50 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {sRate}%
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center font-extrabold text-[#FF4B16]">
                      {s.wonCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. QA Activity Audit Feed */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-zinc-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wider">
              Nhật Ký Thẩm Định Bằng Chứng Chăm Sóc (Audit Feed)
            </h3>
            <p className="text-xs text-zinc-500">Xem xét và phê duyệt tính xác thực của các lượt chăm sóc</p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Tìm khách hàng / Sale..."
                className="pl-8 pr-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-[#FF4B16]"
              />
            </div>

            <select
              value={selectedStatusFilter}
              onChange={e => setSelectedStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 focus:outline-none"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="SELF_REPORTED">Chờ duyệt (Tự khai)</option>
              <option value="NEEDS_EVIDENCE">Yêu cầu bổ sung</option>
              <option value="MANAGER_VERIFIED">Đã duyệt hợp lệ</option>
              <option value="FLAGGED">Gắn cờ vi phạm</option>
            </select>
          </div>
        </div>

        {/* Feed List */}
        <div className="divide-y divide-zinc-100">
          {filteredActivities.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-xs font-medium">
              Không có hoạt động chăm sóc nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            filteredActivities.map(act => {
              const lead = leads.find(l => l.id === act.leadId);
              return (
                <div key={act.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50/50 rounded-xl px-2 transition-colors">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-zinc-900">
                        {lead?.name || 'Khách hàng'}
                      </span>
                      <span className="text-[11px] text-zinc-400 font-mono">
                        ({lead ? formatDisplayPhone(lead.phone) : ''})
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 font-bold text-[10px]">
                        Lượt chạm #{act.attemptNo || act.sequence} {act.meaningfulCareNo ? `(L${act.meaningfulCareNo})` : ''}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-orange-50 text-[#FF4B16] font-bold text-[10px]">
                        {act.channel} • {act.action}
                      </span>
                      {act.qualityScoreBreakdown && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-black text-[10px] border border-emerald-200">
                          Quality: {act.qualityScoreBreakdown.totalScore}/100
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-zinc-700">
                      <strong>Phản hồi:</strong> {act.customerResponseText || act.customerResponseCode || 'Không có ghi chú'}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                      <span>Bởi: <strong>{act.staffName}</strong></span>
                      <span>Lúc: {act.createdAt}</span>
                      {act.evidenceType === 'CALL_LOG' && (
                        <span className="text-emerald-600 font-bold">✓ Call Log ({act.evidenceData?.callDurationSeconds}s)</span>
                      )}
                      {act.evidenceType === 'SCREENSHOT_UPLOAD' && (
                        <span className="text-blue-600 font-bold">✓ Có ảnh chụp màn hình</span>
                      )}
                      {act.qaReview && (
                        <span className="text-purple-600 font-bold">
                          Duyệt bởi: {act.qaReview.reviewedByName} ({act.qaReview.reviewedAt})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions & Status Pill */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2.5 py-1 rounded-xl text-xs font-bold ${
                      act.verificationStatus === 'MANAGER_VERIFIED' || act.verificationStatus === 'SYSTEM_CAPTURED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : act.verificationStatus === 'NEEDS_EVIDENCE'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : act.verificationStatus === 'FLAGGED'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {act.verificationStatus === 'MANAGER_VERIFIED' ? '✓ Đã xác minh' :
                       act.verificationStatus === 'SYSTEM_CAPTURED' ? '✓ System Log' :
                       act.verificationStatus === 'NEEDS_EVIDENCE' ? '⚠️ Cần bổ sung' :
                       act.verificationStatus === 'FLAGGED' ? '❌ Đã gắn cờ' :
                       '⚠️ Tự khai báo'}
                    </span>

                    <button
                      onClick={() => {
                        setSelectedActivityForAudit(act);
                        setAuditNote(act.evidenceData?.managerNote || act.qaReview?.note || '');
                      }}
                      className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      title="Thẩm định bằng chứng"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Thẩm định</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. QA Audit Review Modal */}
      {selectedActivityForAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-zinc-200 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#FF4B16]" />
                <h3 className="text-base font-black text-zinc-900">Thẩm Định Bằng Chứng Chăm Sóc</h3>
              </div>
              <button 
                onClick={() => setSelectedActivityForAudit(null)}
                className="w-7 h-7 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-zinc-700 bg-zinc-50 p-4 rounded-2xl">
              <div><strong>Nhân viên thực hiện:</strong> {selectedActivityForAudit.staffName} ({selectedActivityForAudit.staffId})</div>
              <div><strong>Kênh & Hành động:</strong> {selectedActivityForAudit.channel} • {selectedActivityForAudit.action}</div>
              <div><strong>Kết quả:</strong> {selectedActivityForAudit.outcome} • Phản hồi: {selectedActivityForAudit.customerResponseCode}</div>
              <div><strong>Nội dung:</strong> {selectedActivityForAudit.customerResponseText || 'Không có nội dung'}</div>
              <div><strong>Loại bằng chứng:</strong> {selectedActivityForAudit.evidenceType}</div>
              {selectedActivityForAudit.evidenceData?.callDurationSeconds && (
                <div><strong>Thời lượng cuộc gọi:</strong> {selectedActivityForAudit.evidenceData.callDurationSeconds}s</div>
              )}
              {selectedActivityForAudit.evidenceData?.screenshotUrl && (
                <div className="pt-2">
                  <span className="font-bold block mb-1">Ảnh bằng chứng đính kèm:</span>
                  <img 
                    src={selectedActivityForAudit.evidenceData.screenshotUrl} 
                    alt="Bằng chứng chat" 
                    className="max-h-48 rounded-xl border border-zinc-200 object-contain mx-auto"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-700 uppercase tracking-wider block mb-1.5">
                Ghi chú thẩm định của Quản lý QA
              </label>
              <textarea
                rows={2}
                value={auditNote}
                onChange={e => setAuditNote(e.target.value)}
                placeholder="Ví dụ: Đã đối chiếu số điện thoại trên tổng đài, cuộc gọi hợp lệ..."
                className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-[#FF4B16]"
              />
            </div>

            {/* QA 3 Action Buttons */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              <button
                disabled={isSubmittingAudit}
                onClick={() => handlePerformAudit('FLAGGED')}
                className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Gắn Cờ</span>
              </button>

              <button
                disabled={isSubmittingAudit}
                onClick={() => handlePerformAudit('NEEDS_EVIDENCE')}
                className="py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Bổ Sung</span>
              </button>

              <button
                disabled={isSubmittingAudit}
                onClick={() => handlePerformAudit('MANAGER_VERIFIED')}
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Duyệt Hợp Lệ</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
