import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, FileClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import * as customersApi from '@/features/customers/api';
import { useImportHistory } from '@/features/customers/hooks/useImportHistory';
import { ApiError } from '@/lib/api-client';
import { downloadBlob } from '@/lib/download-blob';

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
      const blob = await customersApi.downloadImportErrorReport(importId);
      downloadBlob(blob, `import_${importId}_errors.csv`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not download error report');
    }
  }

  return (
    <ModulePage
      header={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Import History</h1>
            <p className="text-sm text-muted-foreground">Every bulk customer import, with its outcome.</p>
          </div>
          <Link to="/customers/import" className="text-sm text-primary hover:underline">
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
            <TableHead className="hidden md:table-cell">Import Date</TableHead>
            <TableHead>File Name</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Rows Imported</TableHead>
            <TableHead className="hidden text-right md:table-cell">Rows Failed</TableHead>
            <TableHead className="hidden md:table-cell">Imported By</TableHead>
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
                <EmptyState icon={FileClock} title="No imports yet" description="Bulk customer imports will show up here." />
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="hidden text-muted-foreground md:table-cell">{new Date(entry.created_at).toLocaleString()}</TableCell>
              <TableCell className="truncate font-medium">{entry.file_name}</TableCell>
              <TableCell className="hidden text-right sm:table-cell">{entry.rows_imported}</TableCell>
              <TableCell className="hidden text-right md:table-cell">{entry.rows_failed}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{entry.imported_by_name}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[entry.status] ?? 'outline'} className="capitalize">
                  {entry.status.replace(/_/g, ' ')}
                </Badge>
              </TableCell>
              <TableCell>
                {entry.rows_failed > 0 && (
                  <IconButton
                    tooltip="Download Error Report"
                    className="size-8"
                    aria-label={`Download error report for ${entry.file_name}`}
                    onClick={() => handleDownloadErrorReport(entry.id)}
                  >
                    <Download className="size-4" />
                  </IconButton>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ModulePage>
  );
}
