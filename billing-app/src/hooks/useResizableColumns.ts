import { useCallback, useRef, useState } from 'react';

const MIN_COLUMN_WIDTH = 60;

/**
 * Lightweight drag-to-resize for table columns, applied on top of the existing shadcn
 * `<Table>` (no grid-library dependency, zero visual change unless the user actually drags a
 * handle). Widths live only in component state for the current session — not persisted, that's
 * a natural follow-up rather than something to build speculatively now.
 */
export function useResizableColumns(initialWidths: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(initialWidths);
  const dragState = useRef<{ column: string; startX: number; startWidth: number } | null>(null);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const state = dragState.current;
    if (!state) return;
    const delta = event.clientX - state.startX;
    const nextWidth = Math.max(MIN_COLUMN_WIDTH, state.startWidth + delta);
    setWidths((prev) => ({ ...prev, [state.column]: nextWidth }));
  }, []);

  const handlePointerUp = useCallback(() => {
    dragState.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  const startResize = useCallback(
    (column: string) => (event: React.PointerEvent) => {
      event.preventDefault();
      dragState.current = { column, startX: event.clientX, startWidth: widths[column] ?? MIN_COLUMN_WIDTH };
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [widths, handlePointerMove, handlePointerUp],
  );

  return { widths, startResize };
}
