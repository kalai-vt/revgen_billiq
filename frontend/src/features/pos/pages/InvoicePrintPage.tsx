import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import * as posApi from '@/features/pos/api';

export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => posApi.getInvoice(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (invoice) {
      const timer = setTimeout(() => window.print(), 300);
      return () => clearTimeout(timer);
    }
  }, [invoice]);

  if (isLoading || !invoice) {
    return <div className="p-8 text-sm text-muted-foreground">Loading invoice…</div>;
  }

  return (
    <div className="mx-auto max-w-xl p-8 text-sm">
      <div className="mb-4 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      <h1 className="text-xl font-semibold">Invoice {invoice.invoice_number}</h1>
      {invoice.gst_number && <p className="text-muted-foreground">GSTIN: {invoice.gst_number}</p>}
      <p className="text-muted-foreground">{new Date(invoice.created_at).toLocaleString()}</p>
      {invoice.customer_name && <p className="mt-2">Customer: {invoice.customer_name}</p>}
      {invoice.customer_phone && <p>Phone: {invoice.customer_phone}</p>}

      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="border-b">
            <th className="py-1">Item</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Price</th>
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-1">{item.product_name}</td>
              <td className="py-1 text-right">{item.quantity}</td>
              <td className="py-1 text-right">{item.unit_price.toFixed(2)}</td>
              <td className="py-1 text-right">{item.line_total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{invoice.subtotal.toFixed(2)}</span>
        </div>
        {invoice.discount_amount > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-{invoice.discount_amount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between">
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
      </div>
    </div>
  );
}
