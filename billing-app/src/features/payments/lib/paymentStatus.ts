import type { InvoicePaymentStatus } from '@/features/pos/api';

export const PAYMENT_STATUS_LABELS: Record<InvoicePaymentStatus, string> = {
  paid: 'Paid',
  partially_paid: 'Partially Paid',
  credit: 'Credit',
  cancelled: 'Cancelled',
};

export function paymentStatusBadgeClassName(status: string, isOverdue: boolean): string {
  if (isOverdue) return 'bg-destructive/10 text-destructive';
  switch (status) {
    case 'paid':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    case 'partially_paid':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'credit':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'cancelled':
      return 'bg-secondary text-secondary-foreground';
    default:
      return 'bg-secondary text-secondary-foreground';
  }
}

export function paymentStatusLabel(status: string, isOverdue: boolean): string {
  if (isOverdue) return 'Overdue';
  return PAYMENT_STATUS_LABELS[status as InvoicePaymentStatus] ?? status;
}
