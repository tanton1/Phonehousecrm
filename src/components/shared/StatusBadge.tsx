import React from 'react';
import { LucideIcon, CheckCircle2, Clock, Truck, RotateCcw, XCircle, AlertCircle } from 'lucide-react';

export type StatusBadgeVariant = 
  | 'completed' | 'COMPLETED' | 'PAID' | 'success'
  | 'pending' | 'PENDING' | 'QC_CHECKING' | 'PARTIAL' | 'warning'
  | 'shipping' | 'SHIPPING' | 'info'
  | 'cancelled' | 'CANCELLED' | 'UNPAID' | 'danger'
  | 'refunded' | 'REFUNDED' | 'purple'
  | 'draft' | 'DRAFT' | 'neutral';

interface StatusBadgeProps {
  status: string;
  label?: string;
  icon?: LucideIcon;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  icon: CustomIcon,
  size = 'md',
  className = ''
}) => {
  const norm = status.toLowerCase();

  let bg = 'bg-zinc-100';
  let text = 'text-zinc-700';
  let border = 'border-zinc-200';
  let dot = 'bg-zinc-400';
  let defaultLabel = label || status;
  let IconComponent: LucideIcon | null = CustomIcon || null;

  if (norm === 'completed' || norm === 'paid' || norm === 'success') {
    bg = 'bg-emerald-50';
    text = 'text-emerald-700';
    border = 'border-emerald-200';
    dot = 'bg-emerald-500';
    if (!label) defaultLabel = norm === 'paid' ? 'Đã thanh toán' : 'Hoàn thành';
    if (!IconComponent) IconComponent = CheckCircle2;
  } else if (norm === 'pending' || norm === 'qc_checking' || norm === 'partial' || norm === 'warning') {
    bg = 'bg-amber-50';
    text = 'text-amber-700';
    border = 'border-amber-200';
    dot = 'bg-amber-500';
    if (!label) defaultLabel = norm === 'qc_checking' ? 'Kiểm định KCS' : norm === 'partial' ? 'Thanh toán một phần' : 'Chờ xử lý';
    if (!IconComponent) IconComponent = Clock;
  } else if (norm === 'shipping' || norm === 'info') {
    bg = 'bg-blue-50';
    text = 'text-blue-700';
    border = 'border-blue-200';
    dot = 'bg-blue-500';
    if (!label) defaultLabel = 'Đang giao hàng';
    if (!IconComponent) IconComponent = Truck;
  } else if (norm === 'cancelled' || norm === 'unpaid' || norm === 'danger') {
    bg = 'bg-rose-50';
    text = 'text-rose-700';
    border = 'border-rose-200';
    dot = 'bg-rose-500';
    if (!label) defaultLabel = norm === 'unpaid' ? 'Còn nợ NCC' : 'Đã hủy';
    if (!IconComponent) IconComponent = XCircle;
  } else if (norm === 'refunded') {
    bg = 'bg-purple-50';
    text = 'text-purple-700';
    border = 'border-purple-200';
    dot = 'bg-purple-500';
    if (!label) defaultLabel = 'Đã hoàn tiền';
    if (!IconComponent) IconComponent = RotateCcw;
  } else if (norm === 'draft') {
    bg = 'bg-zinc-100';
    text = 'text-zinc-600';
    border = 'border-zinc-200';
    dot = 'bg-zinc-400';
    if (!label) defaultLabel = 'Bản nháp';
    if (!IconComponent) IconComponent = AlertCircle;
  }

  const sizeClasses = size === 'sm' 
    ? 'px-2 py-0.5 text-[10px] gap-1' 
    : size === 'lg' 
    ? 'px-3 py-1.5 text-xs font-bold gap-1.5' 
    : 'px-2.5 py-1 text-[11px] font-bold gap-1.5';

  return (
    <span className={`inline-flex items-center rounded-full font-semibold border ${bg} ${text} ${border} ${sizeClasses} ${className}`}>
      {IconComponent ? (
        <IconComponent className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      )}
      <span>{defaultLabel}</span>
    </span>
  );
};
