import React from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, CircleDollarSign, Clock3, Target, TrendingUp, Users } from 'lucide-react';

interface CRMServerDashboardViewProps {
  dashboard: any;
  loading?: boolean;
}

const money = (value: unknown) => `${Number(value || 0).toLocaleString('vi-VN')}đ`;

export const CRMServerDashboardView: React.FC<CRMServerDashboardViewProps> = ({ dashboard, loading }) => {
  if (loading) return <div className="rounded-3xl bg-white p-10 text-center text-sm font-bold text-zinc-500">Đang tổng hợp báo cáo CRM…</div>;
  if (!dashboard) return <div className="rounded-3xl bg-white p-10 text-center text-sm font-bold text-zinc-500">Chưa có dữ liệu báo cáo.</div>;
  const kpi = dashboard.kpis || {};
  const cards = [
    { label: 'Lead tiếp nhận', value: Number(kpi.leads || 0).toLocaleString('vi-VN'), note: 'Trong kỳ đang chọn', icon: Users, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Tỷ lệ chốt', value: `${Number(kpi.conversionRate || 0)}%`, note: `${kpi.won || 0} khách đã mua`, icon: Target, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Doanh thu từ CRM', value: money(kpi.revenue), note: 'Hóa đơn có liên kết Lead', icon: CircleDollarSign, tone: 'bg-orange-50 text-orange-700' },
    { label: 'Việc quá hạn', value: Number(kpi.overdueTasks || 0).toLocaleString('vi-VN'), note: 'Cần điều phối ngay', icon: AlertTriangle, tone: 'bg-rose-50 text-rose-700' },
    { label: 'Phản hồi đầu', value: `${Number(kpi.averageFirstResponseMinutes || 0)} phút`, note: 'Thời gian trung bình', icon: Clock3, tone: 'bg-violet-50 text-violet-700' },
    { label: 'CSKH sau bán', value: Number(kpi.postSaleCompleted || 0).toLocaleString('vi-VN'), note: 'Việc đã hoàn tất', icon: CheckCircle2, tone: 'bg-cyan-50 text-cyan-700' }
  ];
  const funnel = dashboard.funnel || {};
  const funnelRows = [
    ['Mới', funnel.new, 'bg-blue-500'], ['Đã liên hệ', funnel.contacted, 'bg-amber-500'],
    ['Đang tư vấn', funnel.consulting, 'bg-violet-500'], ['Lịch hẹn', funnel.appointment, 'bg-cyan-500'],
    ['Đặt cọc', funnel.deposit, 'bg-indigo-500'], ['Đã mua', funnel.won, 'bg-emerald-500']
  ];
  const maxFunnel = Math.max(1, ...funnelRows.map(row => Number(row[1] || 0)));

  return <div className="space-y-4 animate-fadeIn">
    <div className="flex snap-x gap-3 overflow-x-auto pb-1 scrollbar-none">
      {cards.map(({ label, value, note, icon: Icon, tone }) => <article key={label} className="min-w-[76%] snap-start rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:min-w-[250px]">
        <div className={`grid h-10 w-10 place-items-center rounded-2xl ${tone}`}><Icon className="h-5 w-5" /></div>
        <div className="mt-4 text-2xl font-black tracking-tight text-zinc-950">{value}</div>
        <div className="mt-1 text-xs font-black text-zinc-800">{label}</div>
        <div className="mt-1 text-[11px] font-semibold text-zinc-500">{note}</div>
      </article>)}
    </div>

    <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
      <section className="rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-orange-500" /><h3 className="font-black text-zinc-950">Phễu bán hàng</h3></div>
        <div className="mt-5 space-y-3">
          {funnelRows.map(([label, rawValue, color]) => {
            const value = Number(rawValue || 0);
            return <div key={String(label)}>
              <div className="mb-1.5 flex justify-between text-xs font-bold"><span className="text-zinc-600">{label}</span><span>{value}</span></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(value ? 4 : 0, value / maxFunnel * 100)}%` }} /></div>
            </div>;
          })}
        </div>
      </section>
      <section className="rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-orange-500" /><h3 className="font-black text-zinc-950">Lý do mất khách</h3></div>
        <div className="mt-4 space-y-2">
          {(dashboard.lostReasons || []).slice(0, 8).map((item: any) => <div key={item.reason} className="flex items-center justify-between rounded-2xl bg-zinc-50 px-3 py-2.5 text-xs">
            <span className="min-w-0 truncate font-bold text-zinc-700">{item.reason}</span><span className="ml-3 rounded-full bg-rose-100 px-2 py-0.5 font-black text-rose-700">{item.count}</span>
          </div>)}
          {!dashboard.lostReasons?.length && <div className="py-10 text-center text-xs font-semibold text-zinc-400">Chưa có dữ liệu mất khách.</div>}
        </div>
      </section>
    </div>
  </div>;
};

