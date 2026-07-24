import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModulePage } from '@/components/layout/ModulePage';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { CategoryFormDialog } from '@/features/categories/components/CategoryFormDialog';
import { CategoryTable } from '@/features/categories/components/CategoryTable';
import { useCategories } from '@/features/categories/hooks/useCategories';
import type { Category, CategorySortField } from '@/features/categories/api';

// Stable reference so the fallback for "no data yet" doesn't defeat CategoryTable's memoization
// with a fresh [] on every render (data is undefined for the whole initial-load window).
const EMPTY_CATEGORIES: Category[] = [];

export function CategoriesPage() {
  const { user } = useAuth();
  const canCreate = user?.role === 'owner' || user?.role === 'manager';
  const [sortBy, setSortBy] = useState<CategorySortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = useCallback(
    (field: CategorySortField) => {
      if (field === sortBy) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(field);
        setSortDir('asc');
      }
    },
    [sortBy],
  );

  const { data, isLoading } = useCategories({ sort_by: sortBy, sort_dir: sortDir });

  return (
    <ModulePage
      header={
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
            <p className="text-sm text-muted-foreground">Organize your product catalog.</p>
          </div>
          {canCreate && (
            <CategoryFormDialog
              trigger={
                <Button size="sm">
                  <Plus className="size-4" />
                  New category
                </Button>
              }
            />
          )}
        </div>
      }
    >
      <CategoryTable categories={data?.items ?? EMPTY_CATEGORIES} isLoading={isLoading} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
    </ModulePage>
  );
}
