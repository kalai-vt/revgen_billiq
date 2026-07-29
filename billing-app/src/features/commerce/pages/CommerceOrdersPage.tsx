import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import { CommerceOrderTable } from '@/features/commerce/components/CommerceOrderTable';
import { usePaginatedCommerceOrders } from '@/features/commerce/hooks/usePaginatedCommerceOrders';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
type PlatformFilter = 'all' | 'swiggy' | 'zomato';

export function CommerceOrdersPage() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    setPage(1);
  }, [platformFilter]);

  const { data, isLoading } = usePaginatedCommerceOrders({
    q: q || undefined,
    platform: platformFilter === 'all' ? undefined : platformFilter,
    page,
    page_size: PAGE_SIZE,
  });

  return (
    <ModulePage
      header={
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Online Orders</h1>
          <p className="text-sm text-muted-foreground">Orders synced from Swiggy and Zomato.</p>
        </div>
      }
      filters={
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by order # or customer…" className="pl-8" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'swiggy', 'zomato'] as PlatformFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPlatformFilter(key)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors',
                  platformFilter === key ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:bg-muted',
                )}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      }
      footer={<TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="order" />}
    >
      <CommerceOrderTable data={data} isLoading={isLoading} />
    </ModulePage>
  );
}
