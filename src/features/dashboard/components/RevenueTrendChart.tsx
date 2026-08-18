import React from 'react';
import { Card } from '../../../shared/ui/Card/Card';
import { DailyRevenueItem } from '../hooks/useDashboardMetrics';
import { EmptyState } from '../../../shared/ui/EmptyState/EmptyState';
import { BarChart3, TrendingUp } from 'lucide-react';

export interface RevenueTrendChartProps {
  data: DailyRevenueItem[];
}

export const RevenueTrendChart: React.FC<RevenueTrendChartProps> = ({ data }) => {
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  const totalPeriodRevenue = data.reduce((sum, d) => sum + d.revenue, 0);

  if (totalPeriodRevenue === 0) {
    return (
      <Card radius={16} padding="md" className="h-full flex flex-col justify-between">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-4">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-[#ff4b16]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
              Xu Hướng Doanh Thu 7 Ngày
            </h3>
          </div>
        </div>
        <EmptyState
          icon={<BarChart3 className="w-6 h-6" />}
          title="Chưa có dữ liệu trong kỳ đã chọn"
          description="Doanh thu 7 ngày qua chưa phát sinh đơn hàng đã thanh toán."
          className="border-0 shadow-none p-6"
        />
      </Card>
    );
  }

  return (
    <Card radius={16} padding="md" className="h-full flex flex-col justify-between">
      <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-4 h-4 text-[#ff4b16]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
            Xu Hướng Doanh Thu 7 Ngày
          </h3>
        </div>
        <span className="text-xs font-bold font-mono text-zinc-900">
          Tổng: {totalPeriodRevenue.toLocaleString('vi-VN')}đ
        </span>
      </div>

      {/* Bar Chart Visualization */}
      <div className="grid grid-cols-7 gap-2 items-end h-44 pt-6 pb-2">
        {data.map(day => {
          const heightPercent = Math.max(8, Math.round((day.revenue / maxRevenue) * 100));
          const isToday = day.date === new Date().toISOString().split('T')[0];

          return (
            <div key={day.date} className="flex flex-col items-center h-full justify-end group">
              {/* Tooltip on hover */}
              <div className="text-[10px] font-mono font-bold text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity mb-1 whitespace-nowrap">
                {(day.revenue / 1_000_000).toFixed(1)}tr
              </div>

              {/* Bar */}
              <div className="w-full max-w-[28px] bg-zinc-100 rounded-t-lg overflow-hidden flex flex-col justify-end h-32">
                <div
                  style={{ height: `${heightPercent}%` }}
                  className={`w-full rounded-t-lg transition-all duration-500 ${
                    isToday
                      ? 'bg-gradient-to-t from-[#ff4b16] to-[#ff7a52]'
                      : 'bg-gradient-to-t from-zinc-300 to-zinc-400 group-hover:from-orange-400 group-hover:to-orange-500'
                  }`}
                />
              </div>

              {/* Labels */}
              <div className="mt-2 text-center">
                <span
                  className={`text-[11px] font-bold block ${
                    isToday ? 'text-[#ff4b16]' : 'text-zinc-600'
                  }`}
                >
                  {day.dayName}
                </span>
                <span className="text-[9px] text-zinc-400 font-mono block">
                  {day.date.slice(8)}/{day.date.slice(5, 7)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
