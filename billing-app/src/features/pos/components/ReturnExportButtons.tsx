import { toast } from 'sonner';
import { FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as posApi from '@/features/pos/api';
import type { ReturnListParams } from '@/features/pos/api';
import { ApiError } from '@/lib/api-client';

type ReturnExportButtonsProps = Omit<ReturnListParams, 'page' | 'page_size'>;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const FILENAMES: Record<'excel' | 'pdf' | 'csv', string> = {
  excel: 'returns.xlsx',
  pdf: 'returns.pdf',
  csv: 'returns.csv',
};

export function ReturnExportButtons(params: ReturnExportButtonsProps) {
  async function handleExport(format: 'excel' | 'pdf' | 'csv') {
    try {
      const blob = await posApi.exportReturns(format, params);
      downloadBlob(blob, FILENAMES[format]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not export returns');
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => handleExport('excel')} aria-label="Export Excel">
        <FileSpreadsheet className="size-4" />
        <span className="hidden sm:inline">Export Excel</span>
      </Button>
      <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} aria-label="Export PDF">
        <FileText className="size-4" />
        <span className="hidden sm:inline">Export PDF</span>
      </Button>
      <Button variant="outline" size="sm" onClick={() => handleExport('csv')} aria-label="Export CSV">
        <Sheet className="size-4" />
        <span className="hidden sm:inline">Export CSV</span>
      </Button>
    </div>
  );
}
