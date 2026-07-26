import type { Invoice } from '@/features/pos/api';

interface InvoiceReceiptSummaryProps {
  invoice: Invoice;
}

export function InvoiceReceiptSummary({ invoice }: InvoiceReceiptSummaryProps) {
  return (
    <div className="space-y-1 text-sm">
      {invoice.gst_number && <p className="text-muted-foreground">GSTIN: {invoice.gst_number}</p>}
      {invoice.items.map((item) => (
        <div key={item.id} className="flex justify-between">
          <span>
            {item.product_name} × {item.quantity}
          </span>
          <span>{item.line_total.toFixed(2)}</span>
        </div>
      ))}
      <div className="mt-2 space-y-1 border-t pt-2">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{invoice.subtotal.toFixed(2)}</span>
        </div>
        {invoice.discount_amount > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Discount</span>
            <span>-{invoice.discount_amount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-muted-foreground">
          <span>Tax ({invoice.tax_percentage}%)</span>
          <span>{invoice.tax_amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span>{invoice.total_amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Payment method</span>
          <span className="uppercase">{invoice.payment_method}</span>
        </div>
        {invoice.amount_tendered !== null && (
          <div className="flex justify-between text-muted-foreground">
            <span>Amount tendered</span>
            <span>{invoice.amount_tendered.toFixed(2)}</span>
          </div>
        )}
        {invoice.change_due !== null && (
          <div className="flex justify-between text-muted-foreground">
            <span>Change due</span>
            <span>{invoice.change_due.toFixed(2)}</span>
          </div>
        )}
        {invoice.payment_status !== 'paid' && invoice.payment_status !== 'cancelled' && (
          <>
            <div className="flex justify-between text-muted-foreground">
              <span>Paid</span>
              <span>{invoice.paid_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Outstanding</span>
              <span className={invoice.is_overdue ? 'text-destructive' : ''}>{invoice.outstanding_amount.toFixed(2)}</span>
            </div>
            {invoice.due_date && (
              <div className="flex justify-between text-muted-foreground">
                <span>Due date</span>
                <span className={invoice.is_overdue ? 'text-destructive' : ''}>{invoice.due_date}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
