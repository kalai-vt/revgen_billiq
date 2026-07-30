import { Monitor, Printer, RefreshCw, Smartphone, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PREVIEW_MODES, type PreviewMode } from '@/features/invoice-designer/components/TemplatePreview';

const PRINT_MODES: PreviewMode[] = ['a4', 'a5', '80mm', '58mm', 'pdf'];
const PRINT_MODE_OPTIONS = PREVIEW_MODES.filter((m) => PRINT_MODES.includes(m.value));

export const ZOOM_MIN = 50;
export const ZOOM_MAX = 150;
export const ZOOM_STEP = 10;
export const ZOOM_DEFAULT = 100;

interface PreviewControlsProps {
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onRefresh: () => void;
}

/** Desktop/Mobile/Print icon toggle (replacing the old plain size dropdown) plus zoom and
 * refresh — Print groups the five paper-based sizes (A4/A5/80mm/58mm/PDF) behind a secondary
 * dropdown rather than five separate icon buttons, since those five only differ by paper
 * dimensions, not by device class the way Desktop/Mobile do. */
export function PreviewControls({ mode, onModeChange, zoom, onZoomChange, onRefresh }: PreviewControlsProps) {
  const isPrintMode = PRINT_MODES.includes(mode);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
        <Button
          type="button"
          size="icon"
          variant={mode === 'desktop' ? 'secondary' : 'ghost'}
          className="size-7"
          onClick={() => onModeChange('desktop')}
          title="Desktop preview"
        >
          <Monitor className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={mode === 'mobile' ? 'secondary' : 'ghost'}
          className="size-7"
          onClick={() => onModeChange('mobile')}
          title="Mobile preview"
        >
          <Smartphone className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={isPrintMode ? 'secondary' : 'ghost'}
          className="size-7"
          onClick={() => onModeChange('a4')}
          title="Print preview"
        >
          <Printer className="size-4" />
        </Button>
      </div>

      {isPrintMode && (
        <Select value={mode} onValueChange={(v) => onModeChange(v as PreviewMode)}>
          <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRINT_MODE_OPTIONS.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="ml-auto flex items-center gap-0.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => onZoomChange(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}
          disabled={zoom <= ZOOM_MIN}
          title="Zoom out"
        >
          <ZoomOut className="size-4" />
        </Button>
        <button
          type="button"
          onClick={() => onZoomChange(ZOOM_DEFAULT)}
          className="w-10 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground"
          title="Reset zoom"
        >
          {zoom}%
        </button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => onZoomChange(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}
          disabled={zoom >= ZOOM_MAX}
          title="Zoom in"
        >
          <ZoomIn className="size-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-7" onClick={onRefresh} title="Refresh preview">
          <RefreshCw className="size-4" />
        </Button>
      </div>
    </div>
  );
}
