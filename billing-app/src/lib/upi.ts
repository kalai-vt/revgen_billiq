/** Builds `upi://pay` deep links for payment QR codes — the browser-side twin of the backend's
 * `app/core/upi.py`, kept deliberately identical so a QR on a thermal receipt, a PDF invoice and
 * the on-screen preview are the same link.
 *
 * Getting this subtly wrong is invisible until a real customer tries to pay: the app's original
 * thermal payment QR encoded `upi://pay?pn=<company>&am=<amount>` with no `pa=` at all. `pa`
 * (payee address — the merchant VPA) is the one *required* field in the UPI deep-link spec;
 * without it there is no payee, so every UPI app rejects the link. The QR scanned, looked
 * plausible on the receipt, and could never actually be paid.
 *
 * Scanning a QR is NOT proof of payment — nothing here confirms anything.
 */

export class UpiConfigError extends Error {}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** Whether a payable QR can be built at all. Callers use this to hide the QR rather than
 * rendering one that cannot be paid. */
export function isUpiConfigured(vpa: string | null | undefined): boolean {
  return clean(vpa).length > 0;
}

export interface UpiUriOptions {
  vpa: string | null | undefined;
  payeeName?: string | null;
  /** Omit for a static (customer-enters-amount) QR. */
  amount?: number | null;
  transactionRef?: string | null;
  transactionNote?: string | null;
  currency?: string;
}

/** @throws UpiConfigError when no VPA is configured — never returns a link that cannot be paid. */
export function buildUpiUri({
  vpa,
  payeeName,
  amount,
  transactionRef,
  transactionNote,
  currency = 'INR',
}: UpiUriOptions): string {
  const payeeVpa = clean(vpa);
  if (!payeeVpa) throw new UpiConfigError('No UPI ID is configured for this business.');

  // `pa` first, then `pn`, matching the order every UPI app documents. Values are percent-encoded
  // so a merchant name containing "&" or "=" can't corrupt the query.
  const params: [string, string][] = [['pa', payeeVpa]];

  const name = clean(payeeName);
  if (name) params.push(['pn', name]);

  // A negative or zero amount is not a payable request, so it falls back to a static (no-amount)
  // link rather than emitting something a bank app would reject.
  if (amount != null && amount > 0) {
    params.push(['am', amount.toFixed(2)]);
    params.push(['cu', currency]);
  }

  const ref = clean(transactionRef);
  if (ref) params.push(['tr', ref]);

  const note = clean(transactionNote);
  if (note) params.push(['tn', note]);

  return `upi://pay?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}

/** Either switch turns the payment QR on.
 *
 * The richer PaymentQrConfig replaced a bare `qr_barcode.payment_qr` boolean; templates saved
 * before it exists still carry only the old flag, and their QR must not silently vanish.
 */
export function paymentQrEnabled(qrBarcodePaymentQr: boolean, paymentQrEnabledFlag: boolean): boolean {
  return Boolean(qrBarcodePaymentQr || paymentQrEnabledFlag);
}

/** The visibility rule on its own, without the VPA check — the Designer preview shares this so
 * it shows exactly what will print, while still drawing a sample QR for a tenant who hasn't set
 * a UPI ID yet (the panel warns about that separately). */
export function paymentQrVisibleForAmount(visibility: string, amountDue: number): boolean {
  if (visibility === 'never') return false;
  // A scannable QR on a settled bill invites a second payment.
  if (visibility === 'unpaid_only' && amountDue <= 0) return false;
  return true;
}

/** Whether a payment QR belongs on this particular document. Mirrors the backend's
 * `should_render_payment_qr` so the thermal receipt, the PDF and the on-screen preview can never
 * disagree about whether a bill shows a QR. */
export function shouldRenderPaymentQr({
  enabled,
  visibility,
  amountDue,
  vpa,
}: {
  enabled: boolean;
  visibility: string;
  amountDue: number;
  vpa: string | null | undefined;
}): boolean {
  if (!enabled) return false;
  // No merchant VPA means the only QR we could draw is an unpayable one. Better to omit it.
  if (!isUpiConfigured(vpa)) return false;
  return paymentQrVisibleForAmount(visibility, amountDue);
}

/** The one place that decides what a thermal "Scan to Pay" QR contains, so the receipt agrees
 * with the PDF. Returns null when this bill should not carry a QR at all. */
export function buildPaymentQrEntry(options: {
  qrBarcodePaymentQr: boolean;
  paymentQr: { enabled: boolean; label: string; show_amount: boolean; visibility: string };
  amountDue: number;
  vpa: string | null | undefined;
  payeeName: string | null | undefined;
  reference?: string | null;
}): { caption: string; data: string } | null {
  const { qrBarcodePaymentQr, paymentQr, amountDue, vpa, payeeName, reference } = options;
  const enabled = paymentQrEnabled(qrBarcodePaymentQr, paymentQr.enabled);
  if (!shouldRenderPaymentQr({ enabled, visibility: paymentQr.visibility, amountDue, vpa })) return null;

  return {
    caption: paymentQr.label || 'Scan to Pay',
    data: buildUpiUri({
      vpa,
      payeeName,
      // Amount off makes it a static QR the customer types the amount into.
      amount: paymentQr.show_amount ? amountDue : null,
      transactionRef: reference,
      transactionNote: reference ? `Invoice ${reference}` : null,
    }),
  };
}
