import { Button } from '@/components/ui/button';

interface TablePaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel: string;
  itemLabelPlural?: string;
}

export function TablePagination({ total, page, pageSize, onPageChange, itemLabel, itemLabelPlural }: TablePaginationProps) {
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const label = total === 1 ? itemLabel : (itemLabelPlural ?? `${itemLabel}s`);

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <p>
        {total} {label} · page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
