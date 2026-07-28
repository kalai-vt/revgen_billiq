import { useQuery } from '@tanstack/react-query';
import { Search, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { usePosProductSearch } from '@/features/pos/hooks/usePosProductSearch';
import { useProductConfig } from '@/features/settings/hooks/useProductConfig';
import * as categoriesApi from '@/features/categories/api';
import type { PrimarySearchField } from '@/features/settings/api';
import type { Product } from '@/features/products/api';
import { cn } from '@/lib/utils';

interface ProductSearchPanelProps {
  onAdd: (product: Product) => void;
}

const SEARCH_PLACEHOLDER: Record<PrimarySearchField, string> = {
  name: 'Search products by name…',
  identifier_value: 'Search products by name or identifier…',
  barcode: 'Search products by name or barcode…',
  category: 'Search products by name or category…',
};

export function ProductSearchPanel({ onAdd }: ProductSearchPanelProps) {
  const { qInput, setQInput, categoryId, setCategoryId, data, isLoading } = usePosProductSearch();
  const { data: productConfig } = useProductConfig();
  const { data: categoriesData } = useQuery({
    queryKey: ['categories', 'pos-filter'],
    queryFn: () => categoriesApi.listCategories({ sort_by: 'name', sort_dir: 'asc' }),
  });

  const categories = categoriesData?.items.filter((c) => c.is_active) ?? [];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          placeholder={SEARCH_PLACEHOLDER[productConfig?.primary_search_field ?? 'identifier_value']}
          className="pl-8"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
      </div>

      {categories.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <CategoryPill label="All" active={categoryId === null} onClick={() => setCategoryId(null)} />
          {categories.map((category) => (
            <CategoryPill
              key={category.id}
              label={category.name}
              active={categoryId === category.id}
              onClick={() => setCategoryId(category.id)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-1 gap-2 overflow-x-auto lg:flex-col lg:gap-1.5 lg:overflow-x-visible lg:overflow-y-auto lg:scrollbar-thin">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-36 shrink-0 lg:h-11 lg:w-full lg:shrink" />
          ))}
        {!isLoading && data?.items.length === 0 && (
          <EmptyState icon={Search} title="No products found" className="w-full py-4" />
        )}
        {data?.items.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => onAdd(product)}
            className="flex w-36 shrink-0 flex-col items-start justify-between gap-1 rounded-xl border bg-card px-3 py-2 text-left text-sm shadow-sm transition-colors hover:border-[#6C47FF] hover:bg-[#6C47FF]/5 lg:w-full lg:shrink lg:flex-row lg:items-center"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{product.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {product.identifier_value}
                {product.category_name ? ` · ${product.category_name}` : ''}
              </span>
            </span>
            <span className="flex w-full shrink-0 items-center justify-between gap-2 lg:w-auto lg:justify-end">
              <span className="font-medium">₹{product.selling_price.toFixed(2)}</span>
              <span className="flex size-6 items-center justify-center rounded-full bg-[#6C47FF]/10 text-[#6C47FF]">
                <Plus className="size-3.5" />
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
        <span>Total Products</span>
        <span className="font-medium text-foreground">{data?.total ?? 0}</span>
      </div>
    </div>
  );
}

function CategoryPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors',
        active ? 'bg-[#6C47FF] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70',
      )}
    >
      {label}
    </button>
  );
}
