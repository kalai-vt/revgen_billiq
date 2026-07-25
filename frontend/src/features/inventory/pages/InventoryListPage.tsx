import { useCallback, useEffect, useState } from 'react';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import { InventoryExportButtons } from '@/features/inventory/components/InventoryExportButtons';
import { InventoryFilters } from '@/features/inventory/components/InventoryFilters';
import { InventoryTable } from '@/features/inventory/components/InventoryTable';
import { usePaginatedInventory } from '@/features/inventory/hooks/usePaginatedInventory';
import type { InventorySortField } from '@/features/inventory/api';

const PAGE_SIZE = 20;

type StockStatusFilter = 'all' | 'low' | 'out';

export function InventoryListPage() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stockStatus, setStockStatus] = useState<StockStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<InventorySortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    setPage(1);
  }, [categoryId, stockStatus]);

  const handleSort = useCallback(
    (field: InventorySortField) => {
      if (field === sortBy) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(field);
        setSortDir('asc');
      }
    },
    [sortBy],
  );

  const { data, isLoading } = usePaginatedInventory({
    q: q || undefined,
    category_id: categoryId || undefined,
    stock_status: stockStatus === 'all' ? undefined : stockStatus,
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
            <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
            <p className="text-sm text-muted-foreground">Stock levels and pricing for every product.</p>
          </div>
          <InventoryExportButtons
            q={q || undefined}
            categoryId={categoryId || undefined}
            stockStatus={stockStatus === 'all' ? undefined : stockStatus}
          />
        </div>
      }
      filters={
        <InventoryFilters
          q={qInput}
          onQChange={setQInput}
          categoryId={categoryId}
          onCategoryIdChange={setCategoryId}
          stockStatus={stockStatus}
          onStockStatusChange={setStockStatus}
        />
      }
      footer={
        <TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="product" />
      }
    >
      <InventoryTable data={data} isLoading={isLoading} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
    </ModulePage>
  );
}
