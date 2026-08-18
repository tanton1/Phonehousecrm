import React from 'react';
import { Card } from '../../../shared/ui/Card/Card';
import { Button } from '../../../shared/ui/Button/Button';
import { Package, ShieldAlert, ShoppingBag, ShoppingCart, Plus, Users } from 'lucide-react';
import { DashboardMetricsResult } from '../hooks/useDashboardMetrics';

export interface StockSummaryProps {
  metrics: DashboardMetricsResult;
  onNavigateTab: (tabId: string) => void;
}

export const StockSummary: React.FC<StockSummaryProps> = ({ metrics, onNavigateTab }) => {
  return (
    <Card radius={16} padding="md" className="h-full flex flex-col justify-between space-y-4">
      <div>
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center space-x-2">
            <Package className="w-4 h-4 text-[#ff4b16]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
              Sức Khỏe Kho Hàng & Tồn Máy
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="p-3 bg-zinc-50 border border-zinc-200/70 rounded-xl">
            <span className="text-[11px] font-semibold text-zinc-500 block">Sẵn sàng bán</span>
            <span className="text-lg font-black font-mono text-zinc-900 mt-0.5 block">
              {metrics.inventoryHealth.inStock} cây
            </span>
          </div>

          <div className="p-3 bg-zinc-50 border border-zinc-200/70 rounded-xl">
            <span className="text-[11px] font-semibold text-zinc-500 block">Đã bán tháng này</span>
            <span className="text-lg font-black font-mono text-emerald-600 mt-0.5 block">
              {metrics.inventoryHealth.soldThisMonth} cây
            </span>
          </div>
        </div>

        {metrics.inventoryHealth.agingStockCount > 0 && (
          <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2 text-amber-800">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs font-medium">Tồn trên 30 ngày: <strong>{metrics.inventoryHealth.agingStockCount} máy</strong></span>
            </div>
            <button
              onClick={() => onNavigateTab('inventory')}
              className="text-[11px] font-bold text-[#ff4b16] hover:underline cursor-pointer"
            >
              Kiểm tra
            </button>
          </div>
        )}
      </div>

      {/* Quick Launch Buttons */}
      <div className="pt-3 border-t border-zinc-100">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-2">Thao Tác Nhanh</span>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigateTab('pos')}
            leftIcon={<ShoppingCart className="w-3.5 h-3.5" />}
          >
            Bán POS (F2)
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigateTab('crm')}
            leftIcon={<Users className="w-3.5 h-3.5" />}
          >
            Thêm Lead
          </Button>
        </div>
      </div>
    </Card>
  );
};
