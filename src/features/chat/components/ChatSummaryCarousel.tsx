import React from 'react';
import { Clock3, Headphones, MessageCircleWarning, PhoneCall, Target, UserRoundCheck, UsersRound } from 'lucide-react';
import { PancakeChatSummary } from '../../../services/pancakeApiClient';

export interface ChatSummaryCarouselProps {
  summary: PancakeChatSummary | null;
  loading?: boolean;
}

function responseTime(seconds: number) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}p`;
  return `${Math.round(seconds / 360) / 10}h`;
}

export const ChatSummaryCarousel: React.FC<ChatSummaryCarouselProps> = ({ summary, loading = false }) => {
  const cards = summary ? [
    { label: 'Hội thoại', value: summary.total, tone: 'text-zinc-900', icon: UsersRound },
    { label: 'Chưa nhận', value: summary.unassigned, tone: summary.unassigned ? 'text-amber-700' : 'text-emerald-700', icon: UserRoundCheck },
    { label: 'Chờ trả lời', value: summary.awaitingReply, tone: summary.awaitingReply ? 'text-blue-700' : 'text-emerald-700', icon: PhoneCall },
    { label: 'Trễ SLA', value: summary.overdue, tone: summary.overdue ? 'text-rose-700' : 'text-emerald-700', icon: MessageCircleWarning },
    { label: 'CSKH đến hạn', value: summary.followUpDue, tone: summary.followUpDue ? 'text-violet-700' : 'text-emerald-700', icon: Headphones },
    { label: 'Đã chốt', value: summary.won, tone: 'text-emerald-700', icon: Target },
    { label: 'Tỷ lệ chốt', value: `${summary.conversionRate}%`, tone: 'text-[#ff4b16]', icon: Target },
    { label: 'Phản hồi TB', value: responseTime(summary.averageFirstResponseSeconds), tone: 'text-zinc-900', icon: Clock3 }
  ] : [];

  return (
    <section className="shrink-0 rounded-2xl border border-zinc-200/80 bg-white px-2.5 py-2 shadow-sm">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <p className="text-[10px] font-black uppercase tracking-[0.13em] text-zinc-500">Báo cáo CSKH {summary?.periodDays || 30} ngày</p>
        {summary?.sampleCapped && <span className="text-[9px] font-bold text-amber-700" title="Báo cáo đang tính trên 2.000 hội thoại gần nhất.">Dữ liệu lớn ?</span>}
      </div>
      <div className="flex snap-x gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loading && !summary
          ? Array.from({ length: 5 }, (_, index) => <div key={index} className="h-[58px] min-w-[124px] animate-pulse snap-start rounded-xl bg-zinc-100" />)
          : cards.map(card => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="flex min-w-[124px] snap-start items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50/80 px-2.5 py-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#ff4b16] shadow-sm"><Icon className="h-3.5 w-3.5" /></span>
                <div className="min-w-0">
                  <p className={`font-mono text-base font-black leading-none ${card.tone}`}>{card.value}</p>
                  <p className="mt-1 truncate text-[9px] font-bold text-zinc-500">{card.label}</p>
                </div>
              </article>
            );
          })}
      </div>
    </section>
  );
};
