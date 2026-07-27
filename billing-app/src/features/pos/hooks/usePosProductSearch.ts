import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as productsApi from '@/features/products/api';

export function usePosProductSearch() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQ(qInput), 250);
    return () => clearTimeout(timer);
  }, [qInput]);

  const query = useQuery({
    queryKey: ['pos-product-search', q, categoryId],
    queryFn: () =>
      productsApi.listProducts({
        q: q || undefined,
        category_id: categoryId ?? undefined,
        is_active: true,
        page: 1,
        page_size: 50,
      }),
  });

  return { qInput, setQInput, categoryId, setCategoryId, ...query };
}
