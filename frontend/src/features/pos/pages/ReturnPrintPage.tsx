import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import * as posApi from '@/features/pos/api';
import { RETURN_REASON_LABELS } from '@/features/pos/api';
import type { ReturnReason } from '@/features/pos/api';
import { returnStatusLabel } from '@/features/pos/lib/returnStatus';

export function ReturnPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { data: ret, isLoading } = useQuery({
    queryKey: ['return', id],
    queryFn: () => posApi.getReturn(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (ret) {
      const timer = setTimeout(() => window.print(), 300);
      return () => clearTimeout(timer);
    }
  }, [ret]);

  if (isLoading || !ret) {
    return <div className="p-8 text-sm text-muted-foreground">Loading return…</div>;
  }

  return (
    <div className="mx-auto max-w-xl p-8 text-sm">
      <div className="mb-4 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      <h1 className="text-xl font-semibold">Return Receipt {ret.return_number}</h1>
      <p className="text-muted-foreground">Against Invoice {ret.invoice_number}</p>
      <p className="text-muted-foreground">{new Date(ret.created_at).toLocaleString()}</p>
      {ret.customer_name && <p className="mt-2">Customer: {ret.customer_name}</p>}
      <p>Status: {returnStatusLabel(ret.status)}</p>

      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="border-b">
            <th className="py-1">Item</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1">Reason</th>
            <th className="py-1 text-right">Refund</th>
          </tr>
        </thead>
        <tbody>
          {ret.items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-1">{item.product_name}</td>
              <td className="py-1 text-right">{item.quantity_returned}</td>
              <td className="py-1">{RETURN_REASON_LABELS[item.reason as ReturnReason] ?? item.reason}</td>
              <td className="py-1 text-right">{item.line_refund_amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{ret.subtotal_amount.toFixed(2)}</span>
        </div>
        {ret.discount_adjustment > 0 && (
          <div className="flex justify-between">
            <span>Discount adjustment</span>
            <span>-{ret.discount_adjustment.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Tax adjustment</span>
          <span>{ret.tax_adjustment.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>Grand Refund</span>
          <span>{ret.refund_amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Refund method</span>
          <span className="uppercase">{ret.refund_method}</span>
        </div>
      </div>
    </div>
  );
}
