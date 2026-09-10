import type { ReactNode } from 'react';
import type { AutoPrintPaperSize } from '@/features/settings/api';

/** Wraps a standalone print-preview page's content with the CSS `@page` rule the browser needs
 * to size the printed output correctly. Nothing in this app declared one before — every print
 * silently fell back to the browser's own default page (roughly Letter/A4 with ~0.4in margins on
 * each side). That's harmless for A4/Letter output, but it silently crushes a thermal receipt:
 * ~19mm of a ~72mm printable width was gone before a single pixel of receipt content was even
 * considered, and the print page's own wrapper padding ate further into what was left.
 *
 * For thermal sizes, content is sized to the printer's actual PRINTABLE width (72mm for an 80mm
 * roll, 48mm for a 58mm roll) rather than the roll's nominal full width — matching the 48/32
 * character-column assumptions `lib/printing/escpos.ts` already uses, since thermal print heads
 * reserve a small, fixed dead margin on both edges of the roll that the "80mm"/"58mm" nominal
 * width doesn't actually print into. */

const THERMAL_ROLL_WIDTH_MM: Record<'58mm' | '80mm', number> = { '58mm': 58, '80mm': 80 };
const THERMAL_PRINTABLE_WIDTH_MM: Record<'58mm' | '80mm', number> = { '58mm': 48, '80mm': 72 };
const PAGE_SIZE_KEYWORD: Record<'A4' | 'A5' | 'letter' | 'legal', string> = {
  A4: 'A4',
  A5: 'A5',
  letter: 'letter',
  legal: 'legal',
};

function isThermal(size: AutoPrintPaperSize): size is '58mm' | '80mm' {
  return size === '58mm' || size === '80mm';
}

interface PrintPageProps {
  paperSize: AutoPrintPaperSize;
  children: ReactNode;
}

export function PrintPage({ paperSize, children }: PrintPageProps) {
  const thermal = isThermal(paperSize);
  const pageSize = thermal ? `${THERMAL_ROLL_WIDTH_MM[paperSize]}mm auto` : PAGE_SIZE_KEYWORD[paperSize];
  // Non-thermal pages keep a real page margin (handled by @page, which repeats it on every
  // physical page if content overflows one sheet) instead of a one-off wrapper div padding.
  const pageMargin = thermal ? '0' : '15mm';

  return (
    <>
      <style>{`
        @page { size: ${pageSize}; margin: ${pageMargin}; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; }
        }
      `}</style>
      <div
        style={{
          width: thermal ? `${THERMAL_PRINTABLE_WIDTH_MM[paperSize]}mm` : undefined,
          maxWidth: thermal ? `${THERMAL_PRINTABLE_WIDTH_MM[paperSize]}mm` : undefined,
          margin: thermal ? '0 auto' : undefined,
          // Browsers drop background colors/fills by default when printing — this keeps the
          // filled table header and Grand Total band from printing blank.
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        {children}
      </div>
    </>
  );
}
