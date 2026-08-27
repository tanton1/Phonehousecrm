import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  LucideIcon,
  RotateCcw,
  Truck,
  XCircle
} from 'lucide-react';

export type StatusBadgeSize = 'sm' | 'md' | 'lg';

export interface StatusBadgeProps {
  status: string;
  size?: StatusBadgeSize;
  customLabel?: string;
  label?: string;
  icon?: LucideIcon;
  className?: string;
}

type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'refund';

interface StatusConfig {
  label: string;
  tone: StatusTone;
  icon?: LucideIcon;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  in_stock: { label: 'Trong kho', tone: 'success', icon: CheckCircle2 },
  sold: { label: 'Đã bán', tone: 'neutral' },
  reserved: { label: 'Đã giữ chỗ', tone: 'warning', icon: Clock },
  transferring: { label: 'Đang chuyển', tone: 'info', icon: Truck },
  in_transit: { label: 'Đang vận chuyển', tone: 'info', icon: Truck },
  awaiting_technical: { label: 'Chờ kỹ thuật', tone: 'warning', icon: Clock },
  repairing: { label: 'Đang sửa chữa', tone: 'warning', icon: Clock },
  warranty: { label: 'Đang bảo hành', tone: 'warning', icon: Clock },
  completed: { label: 'Hoàn thành', tone: 'success', icon: CheckCircle2 },
  paid: { label: 'Đã thanh toán', tone: 'success', icon: CheckCircle2 },
  success: { label: 'Thành công', tone: 'success', icon: CheckCircle2 },
  eligible: { label: 'Đủ điều kiện', tone: 'success', icon: CheckCircle2 },
  delivered: { label: 'Đã bàn giao', tone: 'success', icon: CheckCircle2 },
  on_time: { label: 'Đúng giờ', tone: 'success', icon: CheckCircle2 },
  pending: { label: 'Chờ xử lý', tone: 'warning', icon: Clock },
  qc_checking: { label: 'Kiểm định KCS', tone: 'warning', icon: Clock },
  partial: { label: 'Thanh toán một phần', tone: 'warning', icon: Clock },
  warning: { label: 'Cần chú ý', tone: 'warning', icon: AlertCircle },
  pending_verification: { label: 'Chờ xác minh', tone: 'warning', icon: Clock },
  late: { label: 'Đi muộn', tone: 'warning', icon: Clock },
  shipping: { label: 'Đang giao hàng', tone: 'info', icon: Truck },
  info: { label: 'Đang xử lý', tone: 'info' },
  cancelled: { label: 'Đã hủy', tone: 'danger', icon: XCircle },
  unpaid: { label: 'Còn nợ', tone: 'danger', icon: XCircle },
  danger: { label: 'Có lỗi', tone: 'danger', icon: XCircle },
  rejected: { label: 'Từ chối', tone: 'danger', icon: XCircle },
  failed: { label: 'Thất bại', tone: 'danger', icon: XCircle },
  refunded: { label: 'Đã hoàn tiền', tone: 'refund', icon: RotateCcw },
  draft: { label: 'Bản nháp', tone: 'neutral', icon: AlertCircle }
};

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  neutral: 'border-zinc-200 bg-zinc-100 text-zinc-700',
  refund: 'border-violet-200 bg-violet-50 text-violet-700'
};

const DOT_CLASSES: Record<StatusTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-blue-500',
  neutral: 'bg-zinc-400',
  refund: 'bg-violet-500'
};

const SIZE_CLASSES: Record<StatusBadgeSize, string> = {
  sm: 'gap-1 px-2 py-0.5 text-[11px]',
  md: 'gap-1.5 px-2.5 py-1 text-xs',
  lg: 'gap-1.5 px-3 py-1.5 text-sm'
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'sm',
  customLabel,
  label,
  icon: CustomIcon,
  className = ''
}) => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const config = STATUS_MAP[normalizedStatus] || {
    label: normalizedStatus || 'Không xác định',
    tone: 'neutral' as StatusTone
  };
  const Icon = CustomIcon || config.icon;
  const displayLabel = label || customLabel || config.label;

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border font-bold leading-none ${TONE_CLASSES[config.tone]} ${SIZE_CLASSES[size]} ${className}`}
    >
      {Icon ? (
        <Icon className={size === 'lg' ? 'h-4 w-4 shrink-0' : 'h-3.5 w-3.5 shrink-0'} />
      ) : (
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[config.tone]}`} />
      )}
      <span className="truncate">{displayLabel}</span>
    </span>
  );
};
