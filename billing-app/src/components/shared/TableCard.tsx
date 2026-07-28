import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Table2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ExportDropdown, type ExportFormat } from '@/components/shared/ExportDropdown';

interface TableCardProps {
  title: string;
  isLoading: boolean;
  isEmpty: boolean;
  emptyLabel?: string;
  emptyIcon?: LucideIcon;
  onExport?: (format: ExportFormat) => void;
  exportFormats?: ExportFormat[];
  children: ReactNode;
  className?: string;
}

export function TableCard({
  title,
  isLoading,
  isEmpty,
  emptyLabel = 'No data available for the selected period.',
  emptyIcon = Table2,
  onExport,
  exportFormats,
  children,
  className,
}: TableCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {onExport && <ExportDropdown onExport={onExport} formats={exportFormats} label="Export" />}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isEmpty ? (
          <EmptyState icon={emptyIcon} title={emptyLabel} className="py-10" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
