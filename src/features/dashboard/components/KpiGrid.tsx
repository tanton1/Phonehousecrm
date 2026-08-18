import React from 'react';
import { StatCard } from '../../../shared/ui/StatCard/StatCard';
import { DollarSign, ShoppingCart, Package, Wallet, Users, Wrench } from 'lucide-react';
import { DashboardMetricsResult } from '../hooks/useDashboardMetrics';

export interface KpiGridProps {
  metrics: DashboardMetricsResult;
}

export const KpiGrid: React.FC<KpiGridProps> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* 1. Doanh thu hôm nay */}
      <StatCard
        title="Doanh thu hôm nay"
        value={`${metrics.todayRevenue.toLocaleString('vi-VN')}đ`}
        subtitle={`${metrics.todayOrderCount} đơn hàng`}
        variant="brand"
        icon={<DollarSign className="w-4 h-4" />}
      />

      {/* 2. Doanh thu tháng này */}
      <StatCard
        title="Doanh thu tháng này"
        value={`${metrics.monthRevenue.toLocaleString('vi-VN')}đ`}
        subtitle={`${metrics.monthOrderCount} đơn đã bán`}
        variant="success"
        icon={<ShoppingCart className="w-4 h-4" />}
      />

      {/* 3. Tồn kho máy */}
      <StatCard
        title="Máy sẵn hàng"
        value={`${metrics.inStockDeviceCount} cây`}
        subtitle={`Giá trị ~${(metrics.inStockTotalValue / 1_000_000).toFixed(0)}tr`}
        variant="warning"
        icon={<Package className="w-4 h-4" />}
      />

      {/* 4. Tổng quỹ tiền & ngân hàng */}
      <StatCard
        title="Tổng quỹ khả dụng"
        value={`${(metrics.totalCashFundBalance + metrics.totalBankFundBalance).toLocaleString('vi-VN')}đ`}
        subtitle={`Mặt: ${(metrics.totalCashFundBalance / 1_000_000).toFixed(0)}tr • Bank: ${(metrics.totalBankFundBalance / 1_000_000).toFixed(0)}tr`}
        variant="neutral"
        icon={<Wallet className="w-4 h-4" />}
      />
    </div>
  );
};
