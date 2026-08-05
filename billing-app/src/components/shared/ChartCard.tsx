import type { ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ExportDropdown, type ChartExportFormat } from '@/components/shared/ExportDropdown';

interface ChartCardProps {
  title: string;
  isLoading: boolean;
  isEmpty: boolean;
  emptyLabel?: string;
  onExport?: (format: ChartExportFormat) => void;
  exportFormats?: ChartExportFormat[];
  height?: string;
  children: ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  isLoading,
  isEmpty,
  emptyLabel = 'No data available for the selected period.',
  onExport,
  exportFormats,
  height = 'h-72',
  children,
  className,
}: ChartCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {onExport && <ExportDropdown onExport={onExport} formats={exportFormats} label="Export" />}
      </CardHeader>
      <CardContent className={height}>
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon={BarChart3} title={emptyLabel} />
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
