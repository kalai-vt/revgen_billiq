import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import * as customersApi from '@/features/customers/api';
import type { ImportConfirmResult, ImportRow } from '@/features/customers/api';
import { ImportPreviewGrid } from '@/features/customers/components/import/ImportPreviewGrid';
import { ApiError } from '@/lib/api-client';

interface ImportPreviewStepProps {
  importId: string;
  initialRows: ImportRow[];
  initialCounts: { ready: number; warning: number; error: number; skipped: number };
  onConfirmed: (result: ImportConfirmResult) => void;
}

export function ImportPreviewStep({ importId, initialRows, initialCounts, onConfirmed }: ImportPreviewStepProps) {
  const [rows, setRows] = useState(initialRows);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readyCount = rows.filter((r) => !r.is_skipped && r.status === 'ready').length;
  const warningCount = rows.filter((r) => !r.is_skipped && r.status === 'warning').length;
  const errorCount = rows.filter((r) => !r.is_skipped && r.status === 'error').length;
  const skippedCount = rows.filter((r) => r.is_skipped).length;
  const updatableCount = readyCount + warningCount;

  async function handleConfirm() {
    setError(null);
    setIsConfirming(true);
    try {
      const result = await customersApi.confirmImport(importId);
      if (result.rows_failed > 0) {
        toast.warning(`Imported ${result.rows_imported} rows — ${result.rows_failed} failed`);
      } else {
        toast.success(`Imported ${result.rows_imported} rows`);
      }
      onConfirmed(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update customers');
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Review &amp; Confirm</CardTitle>
        <CardDescription>
          Every value below is editable. Fix errors, adjust details, or skip a row — nothing is saved until you click
          Update Customers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{readyCount} Ready</Badge>
          <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-500">
            {warningCount} Warning
          </Badge>
          <Badge variant="destructive">{errorCount} Error</Badge>
          <Badge variant="outline">{skippedCount} Skipped</Badge>
          <span className="text-xs text-muted-foreground">
            (initially {initialCounts.ready + initialCounts.warning} ready/warning, {initialCounts.error} error)
          </span>
        </div>

        <ImportPreviewGrid importId={importId} rows={rows} onRowsChange={setRows} />

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={handleConfirm} disabled={isConfirming || updatableCount === 0}>
            {isConfirming ? 'Updating…' : `Update Customers (${updatableCount} row${updatableCount === 1 ? '' : 's'})`}
          </Button>
          {errorCount > 0 && (
            <p className="text-xs text-muted-foreground">Rows with errors will be skipped automatically.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
