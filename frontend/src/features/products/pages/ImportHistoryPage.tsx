import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, FileClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import * as productsApi from '@/features/products/api';
import { useImportHistory } from '@/features/products/hooks/useImportHistory';
import { ApiError } from '@/lib/api-client';

const PAGE_SIZE = 20;

const STATUS_VARIANT: Record<string, 'secondary' | 'destructive' | 'outline'> = {
  completed: 'secondary',
  partial: 'outline',
  failed: 'destructive',
  validated: 'outline',
  mapping_required: 'outline',
  uploaded: 'outline',
};

export function ImportHistoryPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useImportHistory(page, PAGE_SIZE);
  async function handleDownloadErrorReport(importId: string) {
    try {
      const blob = await productsApi.downloadImportErrorReport(importId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `import_${importId}_errors.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not download error report');
    }
  }

  return (
    <ModulePage
      header={
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Import History</h1>
            <p className="text-sm text-muted-foreground">Every bulk product import, with its outcome.</p>
          </div>
          <Link to="/products/import" className="text-sm text-primary hover:underline">
            New import
          </Link>
        </div>
      }
      footer={
        <TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="import" />
      }
    >
      <Table containerClassName="overflow-x-visible overflow-y-visible">
        <TableHeader>
          <TableRow>
            <TableHead>Import Date</TableHead>
            <TableHead>File Name</TableHead>
            <TableHead className="text-right">Rows Imported</TableHead>
            <TableHead className="text-right">Rows Failed</TableHead>
            <TableHead>Imported By</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={7}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {!isLoading && data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>
                <EmptyState icon={FileClock} title="No imports yet" description="Bulk product imports will show up here." />
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</TableCell>
              <TableCell className="font-medium">{entry.file_name}</TableCell>
              <TableCell className="text-right">{entry.rows_imported}</TableCell>
              <TableCell className="text-right">{entry.rows_failed}</TableCell>
              <TableCell className="text-muted-foreground">{entry.imported_by_name}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[entry.status] ?? 'outline'} className="capitalize">
                  {entry.status.replace(/_/g, ' ')}
                </Badge>
              </TableCell>
              <TableCell>
                {entry.rows_failed > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Download error report for ${entry.file_name}`}
                    onClick={() => handleDownloadErrorReport(entry.id)}
                  >
                    <Download className="size-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ModulePage>
  );
}
