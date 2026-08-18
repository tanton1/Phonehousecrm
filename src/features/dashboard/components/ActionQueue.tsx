import React from 'react';
import { Card } from '../../../shared/ui/Card/Card';
import { Button } from '../../../shared/ui/Button/Button';
import { ActionQueueItem } from '../hooks/useDashboardMetrics';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, ChevronRight } from 'lucide-react';

export interface ActionQueueProps {
  items: ActionQueueItem[];
  onNavigateTab: (tabId: string) => void;
}

export const ActionQueue: React.FC<ActionQueueProps> = ({ items, onNavigateTab }) => {
  if (items.length === 0) {
    return (
      <Card radius={16} padding="md" className="border border-emerald-200/80 bg-emerald-50/50">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-emerald-900">Không có cảnh báo tồn đọng</h4>
            <p className="text-[11px] text-emerald-700 mt-0.5">Tất cả đơn hàng, kho và phiếu sửa chữa đều đang ở trạng thái chuẩn vận hành.</p>
          </div>
        </div>
      </Card>
    );
  }

  const severityConfig = {
    danger: {
      border: 'border-rose-200 bg-rose-50/60',
      icon: <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />,
      badge: 'bg-rose-100 text-rose-700'
    },
    warning: {
      border: 'border-amber-200 bg-amber-50/60',
      icon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />,
      badge: 'bg-amber-100 text-amber-700'
    },
    info: {
      border: 'border-blue-200 bg-blue-50/60',
      icon: <Info className="w-4 h-4 text-blue-600 shrink-0" />,
      badge: 'bg-blue-100 text-blue-700'
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
            Hàng Đợi Xử Lý Ưu Tiên ({items.length} việc)
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {items.map(item => {
          const config = severityConfig[item.severity];

          return (
            <Card
              key={item.id}
              radius={16}
              padding="sm"
              className={`flex items-center justify-between border ${config.border} transition-all`}
            >
              <div className="flex items-start space-x-2.5 min-w-0 pr-2">
                <div className="mt-0.5">{config.icon}</div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-bold text-zinc-900 truncate">{item.title}</span>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full ${config.badge}`}>
                      {item.count}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-0.5 line-clamp-1">{item.description}</p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateTab(item.targetTab)}
                rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                className="shrink-0 text-[11px] font-bold h-8 px-2.5"
              >
                {item.actionLabel}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
