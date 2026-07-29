import { memo } from 'react';
import { Wallet } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { VendorPaymentListResult } from '@/features/procurement/api';

interface VendorPaymentTableProps {
  data?: VendorPaymentListResult;
  isLoading: boolean;
}

export const VendorPaymentTable = memo(function VendorPaymentTable({ data, isLoading }: VendorPaymentTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Payment #</TableHead>
          <TableHead>Vendor</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="hidden sm:table-cell">Method</TableHead>
          <TableHead className="hidden md:table-cell">Applied to</TableHead>
          <TableHead className="hidden lg:table-cell">Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell colSpan={6}>
                <Skeleton className="h-5 w-full" />
              </TableCell>
            </TableRow>
          ))}
        {!isLoading && data?.items.length === 0 && (
          <TableRow>
            <TableCell colSpan={6}>
              <EmptyState icon={Wallet} title="No vendor payments found" description="Payments made against vendor purchases will show up here." />
            </TableCell>
          </TableRow>
        )}
        {data?.items.map((payment) => (
          <TableRow key={payment.id}>
            <TableCell className="font-medium">{payment.payment_number}</TableCell>
            <TableCell className="max-w-[160px] truncate">{payment.vendor_name}</TableCell>
            <TableCell className="text-right font-medium">{payment.amount.toFixed(2)}</TableCell>
            <TableCell className="hidden capitalize sm:table-cell">{payment.payment_method.replace('_', ' ')}</TableCell>
            <TableCell className="hidden truncate text-muted-foreground md:table-cell">
              {payment.allocations.map((a) => a.purchase_number).join(', ') || '—'}
            </TableCell>
            <TableCell className="hidden lg:table-cell">{new Date(payment.created_at).toLocaleDateString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});
