// Compatibility export for older feature imports. All status presentation now
// comes from the shared PhoneHouse design-system component.
export {
  StatusBadge,
  type StatusBadgeProps,
  type StatusBadgeSize
} from '../../shared/ui/StatusBadge/StatusBadge';

export type StatusBadgeVariant =
  | 'completed' | 'COMPLETED' | 'PAID' | 'success'
  | 'pending' | 'PENDING' | 'QC_CHECKING' | 'PARTIAL' | 'warning'
  | 'shipping' | 'SHIPPING' | 'info'
  | 'cancelled' | 'CANCELLED' | 'UNPAID' | 'danger'
  | 'refunded' | 'REFUNDED' | 'purple'
  | 'draft' | 'DRAFT' | 'neutral';
