import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import * as posApi from '@/features/pos/api';

const PAGE_SIZE = 20;

export function ReturnHistoryPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['returns', page],
    queryFn: () => posApi.listReturns(page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });
  return (
    <ModulePage
      header={
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Return History</h1>
          <p className="text-sm text-muted-foreground">Every return and refund processed against an invoice.</p>
        </div>
      }
      footer={
        <TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="return" />
      }
    >
      <Table containerClassName="overflow-x-visible overflow-y-visible">
        <TableHeader>
          <TableRow>
            <TableHead className="hidden sm:table-cell">Date</TableHead>
            <TableHead>Return #</TableHead>
            <TableHead className="hidden sm:table-cell">Invoice #</TableHead>
            <TableHead className="hidden md:table-cell">Items</TableHead>
            <TableHead className="hidden md:table-cell">Reason</TableHead>
            <TableHead className="text-right">Refund Amount</TableHead>
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
                <EmptyState icon={Undo2} title="No returns yet" description="Returns processed against invoices will show up here." />
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((ret) => (
            <TableRow key={ret.id}>
              <TableCell className="hidden text-muted-foreground sm:table-cell">{new Date(ret.created_at).toLocaleString()}</TableCell>
              <TableCell className="font-medium">{ret.return_number}</TableCell>
              <TableCell className="hidden sm:table-cell">{ret.invoice_number}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {ret.items.map((item) => `${item.product_name} ×${item.quantity_returned}`).join(', ')}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{ret.reason ?? '—'}</TableCell>
              <TableCell className="text-right font-medium">{ret.refund_amount.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ModulePage>
  );
}
