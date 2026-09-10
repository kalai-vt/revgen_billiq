import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { PRINT_GEOMETRY, PrintPaperStyle } from '@/lib/printing/printPage';
import type { AutoPrintPaperSize } from '@/features/settings/api';

/** mm -> CSS px at the 96dpi the browser lays print pages out with. */
const mm = (value: number) => (value * 96) / 25.4;

function styleTextFor(paperSize: AutoPrintPaperSize): string {
  const { container } = render(<PrintPaperStyle paperSize={paperSize} />);
  const style = container.querySelector('style');
  expect(style).not.toBeNull();
  return style!.textContent ?? '';
}

describe('printPage geometry — the browser-print fallback', () => {
  it('renders thermal receipts at the printable width, not the paper width', () => {
    // escpos.ts prints 48 columns on 80mm and 32 on 58mm — i.e. 72mm and 48mm of actual print
    // area. TemplatePreview's MODE_WIDTH_PX uses the *paper* width (302px/219px), which is right
    // for showing a sheet on screen and wrong on paper: it pushes content under the printer's own
    // dead margin. Within a pixel of rounding, these must be the printable widths.
    expect(PRINT_GEOMETRY['80mm'].contentWidthPx).toBeCloseTo(mm(72), 0);
    expect(PRINT_GEOMETRY['58mm'].contentWidthPx).toBeCloseTo(mm(48), 0);
  });

  it('declares a page size for every paper size, with no page margin', () => {
    // No @page rule existed anywhere in the app before this, so the fallback tab printed at the
    // browser's default page size and ~0.4in default margins. Margins stay at 0 here because
    // TemplatePreview already pads itself from the template's paper.margin_mm — a page margin on
    // top of that would double it.
    for (const paperSize of Object.keys(PRINT_GEOMETRY) as AutoPrintPaperSize[]) {
      const css = styleTextFor(paperSize);
      expect(css).toContain(`@page { size: ${PRINT_GEOMETRY[paperSize].pageCss}; margin: 0; }`);
    }
  });

  it('stops max-width from silently shrinking the receipt', () => {
    // The original bug: `width: 302px; max-width: 100%` meant a narrow print page shrank the
    // receipt instead of overflowing, so an 80mm bill rendered at ~131px — a ~110px text column,
    // which is what wrapped "NOT A FINAL INVOICE" onto four lines.
    const css = styleTextFor('80mm');
    expect(css).toContain('max-width: none !important');
    expect(css).toContain(`width: ${PRINT_GEOMETRY['80mm'].contentWidthPx}px !important`);
  });

  it('neutralises the print wrapper padding that ate into the page', () => {
    const css = styleTextFor('80mm');
    expect(css).toMatch(/\[data-slot="print-sheet"\][^}]*padding: 0 !important/s);
    expect(css).toMatch(/\[data-slot="print-sheet"\][^}]*max-width: none !important/s);
  });

  it('keeps colour fills, so the table header and Grand Total bands are not printed blank', () => {
    const css = styleTextFor('80mm');
    expect(css).toContain('print-color-adjust: exact !important');
  });

  it('covers every paper size Settings can be set to', () => {
    // A missing key would be `undefined` at render time and take the whole print page down.
    const configurable: AutoPrintPaperSize[] = ['58mm', '80mm', 'A5', 'A4', 'letter', 'legal'];
    for (const size of configurable) {
      expect(PRINT_GEOMETRY[size]).toBeDefined();
      expect(PRINT_GEOMETRY[size].contentWidthPx).toBeGreaterThan(0);
    }
  });
});
