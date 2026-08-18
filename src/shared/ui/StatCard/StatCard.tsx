import React from 'react';
import { Card } from '../Card/Card';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  changePercent?: number;
  icon?: React.ReactNode;
  variant?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  changePercent,
  icon,
  variant = 'neutral',
  className = ''
}) => {
  const iconBgClasses = {
    brand: 'bg-orange-50 text-[#ff4b16]',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-rose-50 text-rose-600',
    neutral: 'bg-zinc-100 text-zinc-700'
  };

  return (
    <Card radius={16} padding="md" className={`flex flex-col justify-between ${className}`}>
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</span>
        {icon && (
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBgClasses[variant]}`}>
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="text-2xl font-black font-mono tracking-tight text-zinc-900">
          {value}
        </div>

        <div className="flex items-center space-x-2 mt-1">
          {changePercent !== undefined && (
            <span
              className={`inline-flex items-center text-xs font-bold font-mono ${
                changePercent > 0
                  ? 'text-emerald-600'
                  : changePercent < 0
                  ? 'text-rose-600'
                  : 'text-zinc-500'
              }`}
            >
              {changePercent > 0 ? (
                <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
              ) : changePercent < 0 ? (
                <TrendingDown className="w-3.5 h-3.5 mr-0.5" />
              ) : null}
              {changePercent > 0 ? `+${changePercent}%` : `${changePercent}%`}
            </span>
          )}
          {subtitle && <span className="text-xs text-zinc-500 truncate">{subtitle}</span>}
        </div>
      </div>
    </Card>
  );
};
