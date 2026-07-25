import { toast } from 'sonner';
import { FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as posApi from '@/features/pos/api';
import { ApiError } from '@/lib/api-client';

interface InvoiceExportButtonsProps {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  sortBy?: 'created_at' | 'total_amount' | 'invoice_number';
  sortDir?: 'asc' | 'desc';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const FILENAMES: Record<'excel' | 'pdf' | 'csv', string> = {
  excel: 'invoices.xlsx',
  pdf: 'invoices.pdf',
  csv: 'invoices.csv',
};

export function InvoiceExportButtons({ q, dateFrom, dateTo, status, sortBy, sortDir }: InvoiceExportButtonsProps) {
  async function handleExport(format: 'excel' | 'pdf' | 'csv') {
    try {
      const blob = await posApi.exportInvoices(format, {
        q,
        date_from: dateFrom,
        date_to: dateTo,
        status,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      downloadBlob(blob, FILENAMES[format]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not export invoices');
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
