import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImageUp, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadQrImage, type QrKind } from '@/features/invoice-designer/api';
import { apiErrorMessage } from '@/lib/query-error';

const ACCEPT = 'image/png,image/jpeg,image/webp';

/** The upload half of one QR type: shows the tenant's own image when they have one, otherwise
 * offers to take one. Only rendered for a type that is switched on — uploading an image for a QR
 * that will not print is a way to waste someone's afternoon. */
export function QrImageUpload({
  kind,
  url,
  dynamic,
  onChange,
}: {
  kind: QrKind;
  url: string | undefined;
  dynamic?: string;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { url: uploaded } = await uploadQrImage(kind, file);
      onChange(uploaded);
      toast.success('QR image uploaded — save the template to use it');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not upload that image'));
    } finally {
      setBusy(false);
      // Clearing lets the same file be picked again after a failure.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="mt-1.5 pl-1">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {url ? (
        <div className="flex items-center gap-2">
          <img
            src={url}
            alt={`Your ${kind.replace(/_/g, ' ')}`}
            className="size-10 shrink-0 rounded border bg-white object-contain p-0.5"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[11px] font-medium">Your own QR</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="text-[11px] underline-offset-2 hover:underline"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                Replace
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[11px] text-destructive underline-offset-2 hover:underline"
                disabled={busy}
                onClick={() => onChange(null)}
              >
                <X className="size-3" />
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <ImageUp className="size-3" />}
          Upload your QR
        </Button>
      )}
      {url && dynamic && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">{dynamic}</p>}
    </div>
  );
}
