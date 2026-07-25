import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { CustomerExportButtons } from '@/features/customers/components/CustomerExportButtons';
import { CustomerFormDialog } from '@/features/customers/components/CustomerFormDialog';
import { CustomerSearchBar } from '@/features/customers/components/CustomerSearchBar';
import { CustomerTable } from '@/features/customers/components/CustomerTable';
import { usePaginatedCustomers } from '@/features/customers/hooks/usePaginatedCustomers';
import type { CustomerSortField } from '@/features/customers/api';

const PAGE_SIZE = 20;

export function CustomersPage() {
  const { user } = useAuth();
  const canImport = user?.role === 'owner' || user?.role === 'manager';

  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [qInput, setQInput] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<CustomerSortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  const handleSort = useCallback(
    (field: CustomerSortField) => {
      if (field === sortBy) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(field);
        setSortDir('asc');
      }
    },
    [sortBy],
  );

  const { data, isLoading } = usePaginatedCustomers({
    q: q || undefined,
    page,
    page_size: PAGE_SIZE,
    sort_by: sortBy,
    sort_dir: sortDir,
  });

  return (
    <ModulePage
      header={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
            <p className="text-sm text-muted-foreground">Manage your customer base.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CustomerExportButtons q={q || undefined} />
            {canImport && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/customers/import" />}>
                <Upload className="size-4" />
                Import
              </Button>
            )}
            <CustomerFormDialog
              trigger={
                <Button size="sm">
                  <Plus className="size-4" />
                  New customer
                </Button>
              }
            />
          </div>
        </div>
      }
      filters={<CustomerSearchBar q={qInput} onQChange={setQInput} />}
      footer={
        <TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="customer" />
      }
    >
      <CustomerTable data={data} isLoading={isLoading} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
    </ModulePage>
  );
}
