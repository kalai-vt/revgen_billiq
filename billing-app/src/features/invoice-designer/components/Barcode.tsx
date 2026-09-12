import { useMemo } from 'react';
import JsBarcode from 'jsbarcode';

/** A real, scannable Code 128 barcode.
 *
 * Same reason as `QrCode`: `TemplatePreview` is what `/invoices/:id/print` renders, so this is
 * printed output, not a mockup. It used to draw 28 bars of pseudo-random height, which reads as a
 * barcode to a person and as nothing at all to a scanner.
 *
 * Code 128 and the invoice number, matching what the PDF renderer encodes
 * (backend pdf_renderer.py `_barcode_flowable`), so a scan gives the same value on either output.
 */
export function Barcode({ value, className }: { value: string; className?: string }) {
  // Encoding is synchronous, so it is computed during render rather than in an effect — no
  // second pass, and nothing flashes an empty box on the way to being printed.
  const svg = useMemo(() => {
    if (!value) return null;
    try {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(el, value, {
        format: 'CODE128',
        // Thin bars disappear into thermal paper's own dot size, so the module is kept wide
        // enough to survive printing rather than sized to look neat on screen.
        width: 1.6,
        height: 38,
        // Off on purpose: jsbarcode measures the caption with a canvas, and anywhere canvas is
        // unavailable that throws and the whole barcode silently disappears from the bill. The
        // number is rendered as ordinary text below instead, which needs no measurement.
        displayValue: false,
        margin: 0,
        background: '#ffffff',
        lineColor: '#000000',
      });
      return el.outerHTML;
    } catch {
      // An unencodable value leaves a gap rather than a decorative pattern — see QrCode.
      return null;
    }
  }, [value]);

  if (!svg) return null;

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`Barcode ${value}`}
        // Markup is generated locally by jsbarcode from our own invoice number, never from
        // user-supplied HTML.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {/* What staff read out when a scanner will not cooperate. */}
      <div className="text-center text-[10px] tracking-[0.2em]">{value}</div>
    </div>
  );
}
