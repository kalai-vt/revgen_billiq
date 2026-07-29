import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as procurementApi from '@/features/procurement/api';
import { VendorPaymentFormDialog } from '@/features/procurement/components/VendorPaymentFormDialog';
import type { VendorLedgerEntryType } from '@/features/procurement/api';

const TYPE_BADGE: Record<VendorLedgerEntryType, { label: string; className: string }> = {
  purchase: { label: 'Purchase', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  payment: { label: 'Payment', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  return: { label: 'Return', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
};

export function VendorLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['procurement-vendor-ledger', id],
    queryFn: () => procurementApi.getVendorLedger(id!),
    enabled: !!id,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link to="/procurement/vendors" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{data.vendor_name}</h1>
            <p className="text-sm text-muted-foreground">Ledger — purchases, payments, and returns.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Closing balance</p>
            <p className="text-xl font-semibold">{data.closing_balance.toFixed(2)}</p>
          </div>
          <VendorPaymentFormDialog
            vendorId={id}
            trigger={
              <Button size="sm">
                <Plus className="size-4" />
                Pay vendor
              </Button>
            }
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="hidden sm:table-cell">Description</TableHead>
            <TableHead className="text-right">Debit</TableHead>
            <TableHead className="text-right">Credit</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.entries.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No activity yet.
              </TableCell>
            </TableRow>
          )}
          {data.entries.map((entry, i) => {
            const badge = TYPE_BADGE[entry.type];
            return (
              <TableRow key={i}>
                <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={badge.className}>
                    {badge.label}
                  </Badge>
                </TableCell>
                <TableCell>{entry.reference}</TableCell>
                <TableCell className="hidden truncate text-muted-foreground sm:table-cell">{entry.description}</TableCell>
                <TableCell className="text-right">{entry.debit > 0 ? entry.debit.toFixed(2) : '—'}</TableCell>
                <TableCell className="text-right">{entry.credit > 0 ? entry.credit.toFixed(2) : '—'}</TableCell>
                <TableCell className="text-right font-medium">{entry.balance.toFixed(2)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
