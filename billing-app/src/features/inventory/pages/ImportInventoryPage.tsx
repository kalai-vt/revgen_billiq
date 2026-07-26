import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImportUploadStep } from '@/features/inventory/components/import/ImportUploadStep';
import { ImportMappingStep } from '@/features/inventory/components/import/ImportMappingStep';
import { ImportPreviewStep } from '@/features/inventory/components/import/ImportPreviewStep';
import { ImportSuccessReport } from '@/features/inventory/components/import/ImportSuccessReport';
import type { ImportConfirmResult, ImportRowListResult, ImportUploadResult } from '@/features/inventory/api';
import * as inventoryApi from '@/features/inventory/api';

type WizardStep = 'upload' | 'mapping' | 'preview' | 'success';

export function ImportInventoryPage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>('upload');
  const [uploadResult, setUploadResult] = useState<ImportUploadResult | null>(null);
  const [rowsResult, setRowsResult] = useState<ImportRowListResult | null>(null);
  const [confirmResult, setConfirmResult] = useState<ImportConfirmResult | null>(null);

  async function handleUploaded(result: ImportUploadResult) {
    setUploadResult(result);
    if (result.requires_mapping) {
      setStep('mapping');
    } else {
      const rows = await inventoryApi.getImportRows(result.import_id);
      setRowsResult(rows);
      setStep('preview');
    }
  }

  function handleMapped(result: ImportRowListResult) {
    setRowsResult(result);
    setStep('preview');
  }

  function handleConfirmed(result: ImportConfirmResult) {
    setConfirmResult(result);
    setStep('success');
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['stock-history'] });
  }

  function reset() {
    setStep('upload');
    setUploadResult(null);
    setRowsResult(null);
    setConfirmResult(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Download the template, upload your file, review, and confirm — nothing changes until you approve it.
        </p>
      </div>

      {step === 'upload' && <ImportUploadStep onUploaded={handleUploaded} />}

      {step === 'mapping' && uploadResult && (
        <ImportMappingStep
          importId={uploadResult.import_id}
          detectedHeaders={uploadResult.detected_headers}
          initialMapping={uploadResult.auto_mapping}
          onMapped={handleMapped}
        />
      )}

      {step === 'preview' && uploadResult && rowsResult && (
        <ImportPreviewStep
          importId={uploadResult.import_id}
          initialRows={rowsResult.items}
          initialCounts={{
            ready: rowsResult.ready_count,
            warning: rowsResult.warning_count,
            error: rowsResult.error_count,
            skipped: rowsResult.skipped_count,
          }}
          onConfirmed={handleConfirmed}
        />
      )}

      {step === 'success' && uploadResult && confirmResult && (
        <ImportSuccessReport importId={uploadResult.import_id} result={confirmResult} onStartNewImport={reset} />
      )}
    </div>
  );
}
