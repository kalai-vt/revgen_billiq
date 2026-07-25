import { useState } from 'react';
import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import { STOCK_REASON_LABELS } from '@/features/inventory/api';
import type { StockReason } from '@/features/inventory/api';
import { useStockHistory } from '@/features/inventory/hooks/useStockHistory';

const PAGE_SIZE = 20;

function reasonLabel(reason: string): string {
  return STOCK_REASON_LABELS[reason as StockReason] ?? reason.replace(/_/g, ' ');
}

export function StockHistoryPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useStockHistory({ page, page_size: PAGE_SIZE });
  return (
    <ModulePage
      header={
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock History</h1>
          <p className="text-sm text-muted-foreground">Every stock movement, manual or automatic.</p>
        </div>
      }
      footer={
        <TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="entry" itemLabelPlural="entries" />
      }
    >
      <Table containerClassName="overflow-x-visible overflow-y-visible">
        <TableHeader>
          <TableRow>
            <TableHead className="hidden md:table-cell">Date</TableHead>
            <TableHead>Product</TableHead>
            <TableHead className="hidden text-right md:table-cell">Previous Stock</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Added</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Removed</TableHead>
            <TableHead className="text-right">Current Stock</TableHead>
            <TableHead className="hidden md:table-cell">Reason</TableHead>
            <TableHead className="hidden md:table-cell">Updated By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={8}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {!isLoading && data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={8}>
                <EmptyState icon={History} title="No stock movements yet" description="Stock adjustments and sales will appear here." />
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="hidden text-muted-foreground md:table-cell">{new Date(entry.created_at).toLocaleString()}</TableCell>
              <TableCell className="font-medium">{entry.product_name}</TableCell>
              <TableCell className="hidden text-right md:table-cell">{entry.previous_stock}</TableCell>
              <TableCell className="hidden text-right text-green-600 sm:table-cell dark:text-green-500">
                {entry.added > 0 ? `+${entry.added}` : '—'}
              </TableCell>
              <TableCell className="hidden text-right text-destructive sm:table-cell">{entry.removed > 0 ? `-${entry.removed}` : '—'}</TableCell>
              <TableCell className="text-right font-medium">{entry.current_stock}</TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="flex items-center gap-1.5">
                  <span>{reasonLabel(entry.reason)}</span>
                  {entry.source !== 'manual' && (
                    <Badge variant="outline" className="text-xs capitalize">
                      {entry.source}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{entry.created_by_name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ModulePage>
  );
}
