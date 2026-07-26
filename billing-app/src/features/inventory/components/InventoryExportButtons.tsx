import { toast } from 'sonner';
import { FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as inventoryApi from '@/features/inventory/api';
import { ApiError } from '@/lib/api-client';

interface InventoryExportButtonsProps {
  q?: string;
  categoryId?: string;
  stockStatus?: 'low' | 'out';
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
  excel: 'inventory.xlsx',
  pdf: 'inventory.pdf',
  csv: 'inventory.csv',
};

export function InventoryExportButtons({ q, categoryId, stockStatus }: InventoryExportButtonsProps) {
  async function handleExport(format: 'excel' | 'pdf' | 'csv') {
    try {
      const blob = await inventoryApi.exportInventory(format, { q, category_id: categoryId, stock_status: stockStatus });
      downloadBlob(blob, FILENAMES[format]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not export inventory');
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
