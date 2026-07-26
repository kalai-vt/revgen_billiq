import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { createScrollRestoration } from '@/hooks/useScrollRestoration';

const useModuleScrollRestoration = createScrollRestoration();

interface ModulePageProps {
  /** Title/description/primary-action row. Stays pinned above the scrolling content. */
  header: ReactNode;
  /** Search bar / filter controls, rendered below the header. Also stays pinned. */
  filters?: ReactNode;
  /** Pagination or other bottom controls. Stays pinned below the scrolling content. */
  footer?: ReactNode;
  /** The scrollable body — typically a `<Table>`. */
  children: ReactNode;
  className?: string;
  /** Class applied to the scrollable body wrapper (e.g. to drop the default border). */
  bodyClassName?: string;
}

/**
 * Standard "desktop app" module layout: header and filters stay fixed at the top, footer
 * (pagination) stays fixed at the bottom, and only the body in between scrolls. Fills the
 * height of its container — AppShell's `<main>` — rather than growing past it.
 */
export function ModulePage({ header, filters, footer, children, className, bodyClassName }: ModulePageProps) {
  const scrollRef = useModuleScrollRestoration<HTMLDivElement>();

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="shrink-0 space-y-4 pb-4">
        {header}
        {filters}
      </div>
      <div
        ref={scrollRef}
        className={cn(
          'min-h-0 flex-1 overflow-auto overscroll-contain rounded-md border',
          bodyClassName,
        )}
      >
        {children}
      </div>
      {footer && <div className="shrink-0 pt-4">{footer}</div>}
    </div>
  );
}
