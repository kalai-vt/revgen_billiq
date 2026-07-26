import { Search, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { usePosProductSearch } from '@/features/pos/hooks/usePosProductSearch';
import { useProductConfig } from '@/features/settings/hooks/useProductConfig';
import type { PrimarySearchField } from '@/features/settings/api';
import type { Product } from '@/features/products/api';

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
  const { qInput, setQInput, data, isLoading } = usePosProductSearch();
  const { data: productConfig } = useProductConfig();

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

      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
        {!isLoading && data?.items.length === 0 && (
          <EmptyState icon={Search} title="No products found" className="py-4" />
        )}
        {data?.items.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => onAdd(product)}
            className="flex w-full items-center justify-between rounded-md border bg-card px-3 py-2 text-left text-sm hover:border-primary hover:bg-muted"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{product.name}</span>
              <span className="block text-xs text-muted-foreground">
                {product.identifier_value}
                {product.category_name ? ` · ${product.category_name}` : ''}
              </span>
            </span>
            <span className="ml-3 flex shrink-0 items-center gap-2">
              <span className="font-medium">{product.selling_price.toFixed(2)}</span>
              <Plus className="size-4 text-muted-foreground" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
