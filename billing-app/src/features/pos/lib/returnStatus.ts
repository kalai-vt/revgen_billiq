import type { ReturnStatus } from '@/features/pos/api';

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  fully_refunded: 'Fully Refunded',
  partially_refunded: 'Partially Refunded',
  cancelled: 'Cancelled',
};

export function returnStatusBadgeClassName(status: string): string {
  switch (status) {
    case 'cancelled':
      return 'bg-destructive/10 text-destructive';
    case 'partially_refunded':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'fully_refunded':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    default:
      return 'bg-secondary text-secondary-foreground';
  }
}

export function returnStatusLabel(status: string): string {
  return RETURN_STATUS_LABELS[status as ReturnStatus] ?? status;
}
