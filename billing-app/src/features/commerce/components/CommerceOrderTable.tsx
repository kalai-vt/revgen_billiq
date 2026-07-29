import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CommerceOrderListResult } from '@/features/commerce/api';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  received: { label: 'Received', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  preparing: { label: 'Preparing', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  ready: { label: 'Ready', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  dispatched: { label: 'Dispatched', className: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  delivered: { label: 'Delivered', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  cancelled: { label: 'Cancelled', className: 'bg-destructive/10 text-destructive' },
};

interface CommerceOrderTableProps {
  data?: CommerceOrderListResult;
  isLoading: boolean;
}

export const CommerceOrderTable = memo(function CommerceOrderTable({ data, isLoading }: CommerceOrderTableProps) {
  const navigate = useNavigate();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order #</TableHead>
          <TableHead>Platform</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Billing</TableHead>
          <TableHead className="hidden sm:table-cell">Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell colSpan={7}>
                <Skeleton className="h-5 w-full" />
              </TableCell>
            </TableRow>
          ))}
        {!isLoading && data?.items.length === 0 && (
          <TableRow>
            <TableCell colSpan={7}>
              <EmptyState icon={ShoppingBag} title="No online orders yet" description="Orders synced from Swiggy or Zomato will show up here." />
            </TableCell>
          </TableRow>
        )}
        {data?.items.map((order) => {
          const badge = STATUS_BADGE[order.order_status];
          return (
            <TableRow key={order.id} className="cursor-pointer" onClick={() => navigate(`/commerce/orders/${order.id}`)}>
              <TableCell className="font-medium">{order.platform_order_id}</TableCell>
              <TableCell className="capitalize">{order.platform}</TableCell>
              <TableCell className="max-w-[140px] truncate">{order.customer_name ?? '—'}</TableCell>
              <TableCell>
                <Badge variant="outline" className={badge.className}>
                  {badge.label}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-medium">{order.total_amount.toFixed(2)}</TableCell>
              <TableCell>
                {order.invoice_id ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    Billed
                  </Badge>
                ) : order.sync_error ? (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive">
                    Needs attention
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">
                    Pending
                  </Badge>
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell">{new Date(order.order_time).toLocaleString()}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
});
