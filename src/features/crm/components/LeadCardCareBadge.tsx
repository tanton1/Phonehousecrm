import React from 'react';
import { Lead, LeadCareActivity } from '../../../types';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  ShieldCheck,
  Phone,
  MessageSquare,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export interface LeadCardCareBadgeProps {
  lead: Lead;
  activities?: LeadCareActivity[];
  onOpenCareModal?: (lead: Lead) => void;
}

export const LeadCardCareBadge: React.FC<LeadCardCareBadgeProps> = ({
  lead,
  activities = [],
  onOpenCareModal
}) => {
  const leadActivities = activities.filter(a => a.leadId === lead.id);
  const totalTouches = leadActivities.length;
  const meaningfulTouches = leadActivities.filter(a => a.isMeaningfulContact).length;

  // Touchpoint progression (L1, L2, L3)
  const l1Done = totalTouches >= 1 || lead.careStatus === 'CARE_1_DONE' || lead.careStatus === 'CARE_2_DONE' || lead.careStatus === 'CARE_3_DONE';
  const l2Done = totalTouches >= 2 || lead.careStatus === 'CARE_2_DONE' || lead.careStatus === 'CARE_3_DONE';
  const l3Done = totalTouches >= 3 || lead.careStatus === 'CARE_3_DONE';

  // SLA & Urgency computation
  const getSLAStatus = () => {
    if (lead.status === 'appointment_scheduled') {
      return { label: '🔵 Có lịch hẹn', style: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
    }
    if (lead.status === 'deposit' || lead.status === 'deposit_paid') {
      return { label: '🔥 Đã đặt cọc', style: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold' };
    }
    if (lead.careStatus === 'LONG_TERM_NURTURE') {
      return { label: '🟣 Nuôi dưỡng dài hạn', style: 'bg-purple-50 text-purple-700 border-purple-200' };
    }

    if (lead.nextActionAt) {
      const targetTime = new Date(lead.nextActionAt).getTime();
      const diffMinutes = Math.floor((targetTime - Date.now()) / (1000 * 60));

      if (diffMinutes < 0) {
        return {
          label: `🔴 Quá hạn ${Math.abs(diffMinutes)}p`,
          style: 'bg-rose-50 text-rose-700 border-rose-200 font-black animate-pulse'
        };
      }
      if (diffMinutes <= 60) {
        return {
          label: `🟡 Sắp đến hạn (${diffMinutes}p)`,
          style: 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
        };
      }
    }

    return { label: '🟢 Đúng tiến độ', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  const sla = getSLAStatus();

  return (
    <div className="space-y-1.5 pt-1.5 border-t border-zinc-100 text-xs">
      {/* 1. Touchpoint Progression: L1, L2, L3 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mr-0.5">Chăm sóc:</span>
          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${l1Done ? 'bg-emerald-100 text-emerald-800 font-black' : 'bg-zinc-100 text-zinc-400'}`}>
            {l1Done ? '● L1' : '○ L1'}
          </span>
          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${l2Done ? 'bg-emerald-100 text-emerald-800 font-black' : 'bg-zinc-100 text-zinc-400'}`}>
            {l2Done ? '● L2' : '○ L2'}
          </span>
          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${l3Done ? 'bg-emerald-100 text-emerald-800 font-black' : 'bg-zinc-100 text-zinc-400'}`}>
            {l3Done ? '● L3' : '○ L3'}
          </span>
        </div>

        {/* Quality Score */}
        {lead.careQualityScore !== undefined && (
          <span className="text-[10px] font-extrabold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
            ★ {lead.careQualityScore}đ
          </span>
        )}
      </div>

      {/* 2. SLA Badge & Next Action */}
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <span className={`px-2 py-0.5 rounded-md border font-bold text-[10px] truncate ${sla.style}`}>
          {sla.label}
        </span>

        {onOpenCareModal && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenCareModal(lead);
            }}
            className="px-2 py-1 rounded-lg bg-orange-50 hover:bg-[#ff4b16] text-[#ff4b16] hover:text-white border border-orange-200 text-[10px] font-black transition-colors flex items-center space-x-1 cursor-pointer"
            title="Mở form ghi nhận chăm sóc có bằng chứng"
          >
            <span>+ Chăm sóc</span>
            <ArrowRight className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {/* 3. Last Customer Quote / Feedback snippet */}
      {lead.lastCustomerResponse && (
        <div className="text-[11px] text-zinc-600 bg-zinc-50 p-1.5 rounded-lg border border-zinc-200/70 truncate">
          <span className="font-bold text-zinc-800">KH: </span>
          <span>"{lead.lastCustomerResponse}"</span>
        </div>
      )}
    </div>
  );
};
