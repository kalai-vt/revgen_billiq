import { ChevronDown, Download, FileImage, FileSpreadsheet, FileText, Sheet, Table } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Server-generated (analyticsApi.exportDashboardWidget and equivalents elsewhere).
// Kept narrow and unchanged so the many non-chart consumers of this component
// (invoices, customers, inventory, products, procurement reports...) that switch
// exhaustively on this type are unaffected by the chart-only formats below.
export type ExportFormat = 'excel' | 'pdf' | 'csv';

// 'image_png' | 'data_csv' are chart-only: instant client-side export straight from
// the chart's own canvas/data, no server round-trip. `data_csv` is named distinctly
// from the server's `csv` since the two are independent export paths with different
// formats. Only ChartCard (and its 13 chart consumers) use this wider type.
export type ChartExportFormat = ExportFormat | 'image_png' | 'data_csv';

const FORMAT_CONFIG: Record<ChartExportFormat, { label: string; icon: typeof FileSpreadsheet }> = {
  excel: { label: 'Excel', icon: FileSpreadsheet },
  pdf: { label: 'PDF', icon: FileText },
  csv: { label: 'CSV', icon: Sheet },
  image_png: { label: 'Image (PNG)', icon: FileImage },
  data_csv: { label: 'Data (CSV)', icon: Table },
};

interface ExportDropdownProps<T extends ChartExportFormat> {
  onExport: (format: T) => void;
  formats?: T[];
  disabled?: boolean;
  align?: 'start' | 'end';
  label?: string;
}

const DEFAULT_FORMATS: ExportFormat[] = ['excel', 'pdf', 'csv'];

export function ExportDropdown<T extends ChartExportFormat = ExportFormat>({
  onExport,
  formats,
  disabled = false,
  align = 'end',
  label = 'Export',
}: ExportDropdownProps<T>) {
  const resolvedFormats = formats ?? (DEFAULT_FORMATS as T[]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={disabled} aria-label={label}>
            <Download className="size-4" />
            <span className="hidden sm:inline">{label}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align={align}>
        {resolvedFormats.map((format) => {
          const { label: formatLabel, icon: Icon } = FORMAT_CONFIG[format];
          return (
            <DropdownMenuItem key={format} onClick={() => onExport(format)}>
              <Icon className="size-4" />
              {formatLabel}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
