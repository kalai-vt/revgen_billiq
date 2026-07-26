import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import * as customersApi from '@/features/customers/api';
import type { ImportUploadResult } from '@/features/customers/api';
import { ApiError } from '@/lib/api-client';

interface ImportUploadStepProps {
  onUploaded: (result: ImportUploadResult) => void;
}

export function ImportUploadStep({ onUploaded }: ImportUploadStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownloadTemplate() {
    try {
      const blob = await customersApi.downloadImportTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'customers_import_template.xlsx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not download template');
    }
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError(null);
    setIsUploading(true);
    try {
      const result = await customersApi.uploadImportFile(file);
      onUploaded(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload file');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Upload Customers File</CardTitle>
        <CardDescription>Download the template, fill it in, then upload your Excel (.xlsx) or CSV file.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <Download className="size-4" />
            Download Template
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            <Upload className="size-4" />
            {isUploading ? 'Uploading…' : 'Upload File'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileSelected}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Supported formats: .xlsx, .csv. Rows that match an existing customer (by mobile or email) update it; new
          contacts create a new customer. Files with differently named columns are fine — you'll get a chance to
          map them to the right fields next.
        </p>
      </CardContent>
    </Card>
  );
}
