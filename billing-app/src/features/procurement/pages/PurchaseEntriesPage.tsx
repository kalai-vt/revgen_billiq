import { useCallback, useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import { PurchaseEntryFormDialog } from '@/features/procurement/components/PurchaseEntryFormDialog';
import { PurchaseEntryTable } from '@/features/procurement/components/PurchaseEntryTable';
import { usePaginatedPurchases } from '@/features/procurement/hooks/usePaginatedPurchases';
import type { PurchaseSortField } from '@/features/procurement/api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
type StatusFilter = 'all' | 'draft' | 'received' | 'cancelled';

export function PurchaseEntriesPage() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<PurchaseSortField>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const handleSort = useCallback(
    (field: PurchaseSortField) => {
      if (field === sortBy) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(field);
        setSortDir('desc');
      }
    },
    [sortBy],
  );

  const { data, isLoading } = usePaginatedPurchases({
    q: q || undefined,
    page,
    page_size: PAGE_SIZE,
    sort_by: sortBy,
    sort_dir: sortDir,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  return (
    <ModulePage
      header={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Purchase Entry</h1>
            <p className="text-sm text-muted-foreground">Record and track purchases from vendors.</p>
          </div>
          <PurchaseEntryFormDialog
            trigger={
              <Button size="sm">
                <Plus className="size-4" />
                New purchase
              </Button>
            }
          />
        </div>
      }
      filters={
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by purchase #, invoice #, or vendor…"
              className="pl-8"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'draft', 'received', 'cancelled'] as StatusFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors',
                  statusFilter === key
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground hover:bg-muted',
                )}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      }
      footer={
        <TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="purchase" />
      }
    >
      <PurchaseEntryTable data={data} isLoading={isLoading} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
    </ModulePage>
  );
}
