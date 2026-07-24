import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ProductExportButtons } from '@/features/products/components/ProductExportButtons';
import { ProductFormDialog } from '@/features/products/components/ProductFormDialog';
import { ProductSearchBar } from '@/features/products/components/ProductSearchBar';
import { ProductTable } from '@/features/products/components/ProductTable';
import { usePaginatedProducts } from '@/features/products/hooks/usePaginatedProducts';
import type { ProductSortField } from '@/features/products/api';

const PAGE_SIZE = 20;

export function ProductsPage() {
  const { user } = useAuth();
  const canCreate = user?.role === 'owner' || user?.role === 'manager';

  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [qInput, setQInput] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<ProductSortField>('name');
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
  }, [categoryId]);

  const handleSort = useCallback(
    (field: ProductSortField) => {
      if (field === sortBy) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(field);
        setSortDir('asc');
      }
    },
    [sortBy],
  );

  const { data, isLoading } = usePaginatedProducts({
    q: q || undefined,
    category_id: categoryId || undefined,
    page,
    page_size: PAGE_SIZE,
    sort_by: sortBy,
    sort_dir: sortDir,
  });

  return (
    <ModulePage
      header={
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
            <p className="text-sm text-muted-foreground">Manage your product catalog.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProductExportButtons q={q || undefined} categoryId={categoryId || undefined} />
            {canCreate && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/products/import" />}>
                <Upload className="size-4" />
                Import
              </Button>
            )}
            {canCreate && (
              <ProductFormDialog
                trigger={
                  <Button size="sm">
                    <Plus className="size-4" />
                    New product
                  </Button>
                }
              />
            )}
          </div>
        </div>
      }
      filters={
        <ProductSearchBar q={qInput} onQChange={setQInput} categoryId={categoryId} onCategoryIdChange={setCategoryId} />
      }
      footer={
        <TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="product" />
      }
    >
      <ProductTable data={data} isLoading={isLoading} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
    </ModulePage>
  );
}
