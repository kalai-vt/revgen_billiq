import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as productsApi from '@/features/products/api';

export function usePosProductSearch() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQ(qInput), 250);
    return () => clearTimeout(timer);
  }, [qInput]);

  const query = useQuery({
    queryKey: ['pos-product-search', q],
    queryFn: () => productsApi.listProducts({ q: q || undefined, is_active: true, page: 1, page_size: 20 }),
  });

  return { qInput, setQInput, ...query };
}
