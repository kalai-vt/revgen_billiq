import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/features/categories/hooks/useCategories';

interface ProductSearchBarProps {
  q: string;
  onQChange: (value: string) => void;
  categoryId: string;
  onCategoryIdChange: (value: string) => void;
}

export function ProductSearchBar({ q, onQChange, categoryId, onCategoryIdChange }: ProductSearchBarProps) {
  const { data } = useCategories();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, identifier, barcode, or category…"
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
    </div>
  );
}
