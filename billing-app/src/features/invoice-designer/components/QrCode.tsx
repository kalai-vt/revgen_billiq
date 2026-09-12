import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** A real, scannable QR code.
 *
 * This matters more than it looks: `TemplatePreview` is not only the Designer preview — it is
 * what `/invoices/:id/print` renders, so whatever it draws is what comes out of the printer. It
 * used to draw a fixed 4x4 grid of squares as a layout stand-in, which meant every receipt
 * printed from the app carried a pattern that no scanner could read.
 *
 * Rendered as SVG rather than a canvas so it stays sharp at printer resolution instead of being
 * upscaled from screen pixels.
 */
export function QrCode({ value, size, className }: { value: string; size: number; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, {
      type: 'svg',
      // Quiet zone: below about 1 module of white border, scanners stop finding the symbol.
      margin: 1,
      // Receipts get creased, smudged and printed on thermal paper that fades. The higher
      // correction level costs a little density and buys back a code that still reads.
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!svg) {
    // Blank space of the right size, never a fake pattern — an unreadable code that looks real
    // is worse than an obvious gap.
    return <div style={{ width: size, height: size }} className={className} aria-hidden />;
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={className}
      role="img"
      aria-label="QR code"
      // The markup is generated locally by the qrcode library from our own string — never
      // user-supplied HTML — so there is nothing here for a caller to inject.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
