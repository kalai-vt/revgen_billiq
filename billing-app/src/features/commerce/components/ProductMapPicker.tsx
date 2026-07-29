import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import * as commerceApi from '@/features/commerce/api';
import type { CommercePlatform } from '@/features/commerce/api';
import * as productsApi from '@/features/products/api';
import { ApiError } from '@/lib/api-client';

interface ProductMapPickerProps {
  platform: CommercePlatform;
  platformSku: string;
}

export function ProductMapPicker({ platform, platformSku }: ProductMapPickerProps) {
  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();

  const { data: results, isFetching } = useQuery({
    queryKey: ['commerce-product-map-search', query],
    queryFn: () => productsApi.listProducts({ q: query, page: 1, page_size: 6, is_active: true }),
    enabled: query.trim().length > 0,
  });

  const mutation = useMutation({
    mutationFn: (productId: string) => commerceApi.createProductMapping(platform, platformSku, productId),
    onSuccess: () => {
      toast.success('Mapped — existing unbilled orders with this item will retry automatically next visit.');
      queryClient.invalidateQueries({ queryKey: ['commerce-unmapped-skus'] });
      queryClient.invalidateQueries({ queryKey: ['commerce-product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['commerce-orders'] });
      setQuery('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <div className="relative w-56">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Map to a product…"
        className="h-8 pl-7 text-xs"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={mutation.isPending}
      />
      {query.trim() && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
          {isFetching && <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>}
          {!isFetching && results?.items.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No products found.</p>}
          {results?.items.map((product) => (
            <button
              key={product.id}
              type="button"
              className="block w-full truncate px-3 py-2 text-left text-xs hover:bg-muted"
              onClick={() => mutation.mutate(product.id)}
            >
              {product.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
