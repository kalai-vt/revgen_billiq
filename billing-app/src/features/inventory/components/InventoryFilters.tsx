import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/features/categories/hooks/useCategories';

type StockStatusFilter = 'all' | 'low' | 'out';

interface InventoryFiltersProps {
  q: string;
  onQChange: (value: string) => void;
  categoryId: string;
  onCategoryIdChange: (value: string) => void;
  stockStatus: StockStatusFilter;
  onStockStatusChange: (value: StockStatusFilter) => void;
}

const STOCK_STATUS_LABELS: Record<StockStatusFilter, string> = {
  all: 'All stock levels',
  low: 'Low stock',
  out: 'Out of stock',
};

export function InventoryFilters({
  q,
  onQChange,
  categoryId,
  onCategoryIdChange,
  stockStatus,
  onStockStatusChange,
}: InventoryFiltersProps) {
  const { data } = useCategories();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by product or identifier…"
          className="pl-8"
          value={q}
          onChange={(e) => onQChange(e.target.value)}
        />
      </div>
      <Select
        value={categoryId || 'all'}
        onValueChange={(value) => onCategoryIdChange(!value || value === 'all' ? '' : value)}
      >
        <SelectTrigger className="sm:w-48">
          <SelectValue placeholder="All categories">
            {(value: string | null) =>
              !value || value === 'all' ? 'All categories' : (data?.items.find((c) => c.id === value)?.name ?? 'All categories')
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {data?.items.map((cat) => (
            <SelectItem key={cat.id} value={cat.id}>
              {cat.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={stockStatus} onValueChange={(value) => onStockStatusChange(value as StockStatusFilter)}>
        <SelectTrigger className="sm:w-44">
          <SelectValue>{(value: string | null) => STOCK_STATUS_LABELS[(value as StockStatusFilter) ?? 'all']}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All stock levels</SelectItem>
          <SelectItem value="low">Low stock</SelectItem>
          <SelectItem value="out">Out of stock</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
