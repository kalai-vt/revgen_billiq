import type { AutoPrintPaperSize } from '@/features/settings/api';

/** Page geometry for the browser-print fallback (the tab opened when no silent transport is
 * configured or one failed).
 *
 * The app previously declared no `@page` rule at all, so this tab printed at the browser's
 * default page size and default ~0.4in margins. Combined with the print wrapper's `p-8` and the
 * preview root's `max-width: 100%`, an 80mm receipt silently rendered at ~131px instead of its
 * intended width — roughly a 110px text column, which is where "NOT / A / FINAL / INVOICE" and
 * three-line item names came from. `max-width` made it shrink rather than overflow, so nothing
 * looked broken until it reached paper.
 *
 * `contentWidthPx` is the *printable* width, not the paper width: an 80mm roll prints 72mm
 * (576 dots at 203dpi = the 48 columns escpos.ts already assumes) and a 58mm roll prints 48mm
 * (384 dots = 32 columns). Rendering at the full paper width is what pushes content under the
 * printer's own dead margin and clips the edges off. Margins are zero here on purpose — the
 * preview supplies its own padding from the template's `paper.margin_mm`, so a page margin on
 * top of that would double it.
 */
export const PRINT_GEOMETRY: Record<AutoPrintPaperSize, { pageCss: string; contentWidthPx: number }> = {
  '58mm': { pageCss: '48mm auto', contentWidthPx: 181 },
  '80mm': { pageCss: '72mm auto', contentWidthPx: 272 },
  A5: { pageCss: 'A5', contentWidthPx: 559 },
  A4: { pageCss: 'A4', contentWidthPx: 794 },
  letter: { pageCss: 'letter', contentWidthPx: 816 },
  legal: { pageCss: 'legal', contentWidthPx: 816 },
};

/** Emits the `@page` size and the print-only overrides for one print page. Rendered by each of
 * the three print routes, driven by the same `auto_print_paper_size` the silent ESC/POS path
 * uses — so the fallback prints the same document on the same paper rather than whatever the
 * Invoice Designer template happened to be set to. */
export function PrintPaperStyle({ paperSize }: { paperSize: AutoPrintPaperSize }) {
  const { pageCss, contentWidthPx } = PRINT_GEOMETRY[paperSize];
  const css = `
@page { size: ${pageCss}; margin: 0; }
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
  }
  [data-slot="print-sheet"] {
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  [data-slot="template-preview"] {
    width: ${contentWidthPx}px !important;
    max-width: none !important;
    margin: 0 auto !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    /* The item-table header and Grand Total blocks are filled colour. Browsers drop background
       fills when printing unless asked not to, which would print those bands white-on-white. */
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
