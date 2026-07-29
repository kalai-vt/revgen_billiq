import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import { PurchaseReturnTable } from '@/features/procurement/components/PurchaseReturnTable';
import { usePaginatedReturns } from '@/features/procurement/hooks/usePaginatedReturns';

const PAGE_SIZE = 20;

export function PurchaseReturnsPage() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  const { data, isLoading } = usePaginatedReturns({ q: q || undefined, page, page_size: PAGE_SIZE });

  return (
    <ModulePage
      header={
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase Returns</h1>
          <p className="text-sm text-muted-foreground">Stock returned to vendors and the resulting credits.</p>
        </div>
      }
      filters={
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by return #, purchase #, or vendor…"
            className="pl-8"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
      }
      footer={<TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="return" />}
    >
      <PurchaseReturnTable data={data} isLoading={isLoading} />
    </ModulePage>
  );
}
