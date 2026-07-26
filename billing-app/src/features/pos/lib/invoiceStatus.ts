export type InvoiceStatus = 'paid' | 'pending' | 'partial' | 'cancelled' | 'refunded';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  paid: 'Paid',
  pending: 'Pending',
  partial: 'Partial',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export function invoiceStatusBadgeClassName(status: string): string {
  switch (status) {
    case 'cancelled':
      return 'bg-destructive/10 text-destructive';
    case 'partial':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'refunded':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'pending':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-secondary text-secondary-foreground';
  }
}

export function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_LABELS[status as InvoiceStatus] ?? status;
}
