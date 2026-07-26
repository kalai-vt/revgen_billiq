import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import * as customersApi from '@/features/customers/api';
import type { ImportConfirmResult } from '@/features/customers/api';
import { ApiError } from '@/lib/api-client';

interface ImportSuccessReportProps {
  importId: string;
  result: ImportConfirmResult;
  onStartNewImport: () => void;
}

export function ImportSuccessReport({ importId, result, onStartNewImport }: ImportSuccessReportProps) {
  async function handleDownloadErrorReport() {
    try {
      const blob = await customersApi.downloadImportErrorReport(importId);
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-green-600 dark:text-green-500" />
          Import {result.status === 'completed' ? 'Complete' : 'Finished with some errors'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="rounded-md border p-3">
            <p className="text-2xl font-semibold">{result.rows_imported}</p>
            <p className="text-xs text-muted-foreground">Rows Imported</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-2xl font-semibold text-destructive">{result.rows_failed}</p>
            <p className="text-xs text-muted-foreground">Rows Failed</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-2xl font-semibold">{result.rows_skipped}</p>
            <p className="text-xs text-muted-foreground">Rows Skipped</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {result.rows_failed > 0 && (
            <Button variant="outline" onClick={handleDownloadErrorReport}>
              Download error report
            </Button>
          )}
          <Button onClick={onStartNewImport}>Start new import</Button>
        </div>
      </CardContent>
    </Card>
  );
}
