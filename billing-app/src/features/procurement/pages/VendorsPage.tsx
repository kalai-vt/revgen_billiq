import { useCallback, useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import { VendorFormDialog } from '@/features/procurement/components/VendorFormDialog';
import { VendorTable } from '@/features/procurement/components/VendorTable';
import { usePaginatedVendors } from '@/features/procurement/hooks/usePaginatedVendors';
import type { VendorSortField } from '@/features/procurement/api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
type StatusFilter = 'all' | 'active' | 'inactive';

export function VendorsPage() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<VendorSortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
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
    (field: VendorSortField) => {
      if (field === sortBy) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(field);
        setSortDir('asc');
      }
    },
    [sortBy],
  );

  const { data, isLoading } = usePaginatedVendors({
    q: q || undefined,
    page,
    page_size: PAGE_SIZE,
    sort_by: sortBy,
    sort_dir: sortDir,
    is_active: statusFilter === 'all' ? undefined : statusFilter === 'active',
  });

  return (
    <ModulePage
      header={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
            <p className="text-sm text-muted-foreground">Manage vendors you purchase stock from.</p>
          </div>
          <VendorFormDialog
            trigger={
              <Button size="sm">
                <Plus className="size-4" />
                New vendor
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
              placeholder="Search vendors by name, company, or phone…"
              className="pl-8"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'active', 'inactive'] as StatusFilter[]).map((key) => (
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
        <TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="vendor" />
      }
    >
      <VendorTable data={data} isLoading={isLoading} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
    </ModulePage>
  );
}
