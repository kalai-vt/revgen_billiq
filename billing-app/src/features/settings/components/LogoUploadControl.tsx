import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import * as settingsApi from '@/features/settings/api';
import { ApiError } from '@/lib/api-client';

interface LogoUploadControlProps {
  logoUrl: string | null | undefined;
}

export function LogoUploadControl({ logoUrl }: LogoUploadControlProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => settingsApi.uploadLogo(file),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      queryClient.invalidateQueries({ queryKey: ['branding'] });
      toast.success('Logo updated');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    mutation.mutate(file);
  }

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label>Company logo</Label>
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md border bg-muted/30 p-2">
          <BrandLogo logoUrl={logoUrl} size="sm" />
        </div>
        <div className="space-y-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {mutation.isPending ? 'Uploading…' : logoUrl ? 'Change logo' : 'Upload logo'}
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {!error && (
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, WebP, or SVG. Max 2MB. Shown in the sidebar, dashboard, and invoices.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
