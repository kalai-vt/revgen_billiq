import { ChevronDown, Download, FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type ExportFormat = 'excel' | 'pdf' | 'csv';

const FORMAT_CONFIG: Record<ExportFormat, { label: string; icon: typeof FileSpreadsheet }> = {
  excel: { label: 'Excel', icon: FileSpreadsheet },
  pdf: { label: 'PDF', icon: FileText },
  csv: { label: 'CSV', icon: Sheet },
};

interface ExportDropdownProps {
  onExport: (format: ExportFormat) => void;
  formats?: ExportFormat[];
  disabled?: boolean;
  align?: 'start' | 'end';
  label?: string;
}

export function ExportDropdown({
  onExport,
  formats = ['excel', 'pdf', 'csv'],
  disabled = false,
  align = 'end',
  label = 'Export',
}: ExportDropdownProps) {
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
        {formats.map((format) => {
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
