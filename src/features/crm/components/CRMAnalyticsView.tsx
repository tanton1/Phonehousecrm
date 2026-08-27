import React, { useMemo } from 'react';
import { Lead, LeadCareActivity } from '../../../types';
import {
  DollarSign,
  TrendingUp,
  Sparkles,
  AlertTriangle,
  Users,
  CheckCircle2,
  Calendar,
  PieChart,
  Layers,
  ArrowRight
} from 'lucide-react';

export interface CRMAnalyticsViewProps {
  leads: Lead[];
  activities: LeadCareActivity[];
}

export const CRMAnalyticsView: React.FC<CRMAnalyticsViewProps> = ({
  leads,
  activities
}) => {
  // Conversion Funnel Metrics
  const totalLeads = leads.length;
  const contactedLeads = leads.filter(l => l.status !== 'new').length;
  const care2Leads = leads.filter(l => (l.careAttempts || 0) >= 2 || l.careStatus === 'CARE_2_DONE' || l.careStatus === 'CARE_3_DONE').length;
  const apptLeads = leads.filter(l => l.status === 'appointment_scheduled' || l.status === 'deposit' || l.status === 'won').length;
  const wonLeads = leads.filter(l => l.status === 'won').length;
  const lostLeads = leads.filter(l => l.status === 'lost').length;
  const nurtureLeads = leads.filter(l => l.careStatus === 'LONG_TERM_NURTURE').length;

  // Lost Reason Distribution
  const lostReasonMap = useMemo(() => {
    const map = new Map<string, number>();
    leads.filter(l => l.status === 'lost').forEach(l => {
      const reason = l.lostReason || 'Chưa rõ lý do';
      map.set(reason, (map.get(reason) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  // Price Gap Analytics
  const priceGapStats = useMemo(() => {
    const gaps = activities
      .filter(a => a.objectionCode === 'PRICE_GAP' && a.priceDetails?.priceGap)
      .map(a => a.priceDetails!.priceGap!);

    if (gaps.length === 0) return { count: 0, avgGap: 0, maxGap: 0 };
    const sum = gaps.reduce((acc, v) => acc + v, 0);
    const avgGap = Math.round(sum / gaps.length);
    const maxGap = Math.max(...gaps);
    return { count: gaps.length, avgGap, maxGap };
  }, [activities]);

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* 1. Conversion Funnel */}
      <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#ff4b16]" />
              <span>Phễu Chuyển Đổi Quy Trình Chăm Sóc Khách Hàng</span>
            </h3>
            <p className="text-[11px] text-zinc-500">Hiệu quả qua từng bước tiếp cận L1, L2, L3 và chốt đơn</p>
          </div>
          <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200">
            Tỷ lệ chốt tổng thể: {totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0}%
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-center text-xs">
          {[
            { step: '1. Tiếp nhận', count: totalLeads, rate: '100%', bg: 'bg-blue-50 text-blue-900 border-blue-200' },
            { step: '2. Đã chăm L1', count: contactedLeads, rate: `${totalLeads > 0 ? Math.round((contactedLeads/totalLeads)*100) : 0}%`, bg: 'bg-indigo-50 text-indigo-900 border-indigo-200' },
            { step: '3. Follow-up L2', count: care2Leads, rate: `${totalLeads > 0 ? Math.round((care2Leads/totalLeads)*100) : 0}%`, bg: 'bg-amber-50 text-amber-900 border-amber-200' },
            { step: '4. Hẹn / Cọc', count: apptLeads, rate: `${totalLeads > 0 ? Math.round((apptLeads/totalLeads)*100) : 0}%`, bg: 'bg-purple-50 text-purple-900 border-purple-200' },
            { step: '5. Chốt Deal', count: wonLeads, rate: `${totalLeads > 0 ? Math.round((wonLeads/totalLeads)*100) : 0}%`, bg: 'bg-emerald-50 text-emerald-900 border-emerald-200 font-bold' }
          ].map((f) => (
            <div key={f.step} className={`p-3.5 rounded-2xl border ${f.bg} space-y-1 shadow-2xs`}>
              <span className="text-[10px] font-bold uppercase tracking-wider block">{f.step}</span>
              <span className="text-xl font-black block">{f.count}</span>
              <span className="text-[10px] font-semibold opacity-80">Tỷ lệ: {f.rate}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Lost Reason & Price Gap Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Lost Reasons */}
        <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-2xs space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <span>Phân Tích Lý Do Mất Khách (Lost Reasons)</span>
          </h3>

          <div className="space-y-2">
            {lostReasonMap.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">Không có dữ liệu lead thất bại.</p>
            ) : (
              lostReasonMap.map(([reason, count]) => {
                const percent = lostLeads > 0 ? Math.round((count / lostLeads) * 100) : 0;
                return (
                  <div key={reason} className="space-y-1 text-xs">
                    <div className="flex justify-between font-bold text-zinc-800">
                      <span>{reason}</span>
                      <span className="text-rose-600">{count} Lead ({percent}%)</span>
                    </div>
                    <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-rose-500 h-2 rounded-full" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Price Gap Intelligence */}
        <div className="bg-white rounded-3xl p-5 border border-zinc-200/80 shadow-2xs space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-500" />
            <span>Thống Kê Chênh Lệch Giá So Với Đối Thủ</span>
          </h3>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-3 bg-orange-50 rounded-2xl border border-orange-200">
              <span className="text-[10px] text-zinc-400 block font-bold uppercase">Số Lần Báo Giá Đắt</span>
              <span className="text-base font-black text-orange-700">{priceGapStats.count}</span>
            </div>
            <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200">
              <span className="text-[10px] text-zinc-400 block font-bold uppercase">Chênh Lệch Trung Bình</span>
              <span className="text-base font-black text-rose-700">~{priceGapStats.avgGap.toLocaleString('vi-VN')} đ</span>
            </div>
            <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200">
              <span className="text-[10px] text-zinc-400 block font-bold uppercase">Chênh Lệch Cao Nhất</span>
              <span className="text-base font-black text-purple-700">+{priceGapStats.maxGap.toLocaleString('vi-VN')} đ</span>
            </div>
          </div>

          <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 text-xs text-zinc-600 space-y-1">
            <span className="font-bold text-zinc-800">💡 Đề xuất điều hành giá từ AI CRM:</span>
            <p className="text-[11px] leading-relaxed">
              Các dòng máy như iPhone 16 Pro Max đang chênh trung bình ~{priceGapStats.avgGap.toLocaleString('vi-VN')}đ so với đối thủ. Có thể bù đắp bằng chính sách trợ giá thu cũ +500.000đ hoặc tặng gói Bảo Hành VIP 1 đổi 1 để nâng cao tỷ lệ chốt mà không cần giảm giá niêm yết.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
