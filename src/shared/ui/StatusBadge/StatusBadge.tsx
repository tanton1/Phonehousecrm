import React from 'react';
import { Badge, BadgeSize, BadgeVariant } from '../Badge/Badge';

export type SystemStatus =
  | 'in_stock'
  | 'sold'
  | 'transferring'
  | 'COMPLETED'
  | 'PENDING'
  | 'CANCELLED'
  | 'ON_TIME'
  | 'LATE'
  | 'PENDING_VERIFICATION'
  | 'REJECTED';

export interface StatusBadgeProps {
  status: string;
  size?: BadgeSize;
  customLabel?: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'sm',
  customLabel,
  className = ''
}) => {
  const statusMap: Record<string, { label: string; variant: BadgeVariant }> = {
    // Inventory
    in_stock: { label: 'Trong kho', variant: 'success' },
    sold: { label: 'Đã bán', variant: 'neutral' },
    transferring: { label: 'Đang chuyển', variant: 'info' },

    // Invoices & Transactions
    COMPLETED: { label: 'Hoàn thành', variant: 'success' },
    PENDING: { label: 'Chờ duyệt', variant: 'warning' },
    CANCELLED: { label: 'Đã hủy', variant: 'danger' },

    // Attendance
    ON_TIME: { label: 'Đúng giờ', variant: 'success' },
    LATE: { label: 'Đi muộn', variant: 'warning' },
    PENDING_VERIFICATION: { label: 'Chờ duyệt AI', variant: 'warning' },
    REJECTED: { label: 'Từ chối', variant: 'danger' }
  };

  const config = statusMap[status] || {
    label: customLabel || status,
    variant: 'neutral' as BadgeVariant
  };

  return (
    <Badge
      variant={config.variant}
      size={size}
      dot
      className={className}
    >
      {customLabel || config.label}
    </Badge>
  );
};
