import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as commerceApi from '@/features/commerce/api';
import { ApiError } from '@/lib/api-client';

export function CommerceOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: order, isLoading } = useQuery({
    queryKey: ['commerce-order', id],
    queryFn: () => commerceApi.getOrder(id!),
    enabled: !!id,
  });

  const retryMutation = useMutation({
    mutationFn: () => commerceApi.retryBilling(id!),
    onSuccess: () => {
      toast.success('Order billed');
      queryClient.invalidateQueries({ queryKey: ['commerce-order', id] });
      queryClient.invalidateQueries({ queryKey: ['commerce-orders'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not bill this order'),
  });

  if (isLoading || !order) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link to="/commerce/orders" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{order.platform_order_id}</h1>
            <p className="text-sm capitalize text-muted-foreground">{order.platform} · {order.customer_name ?? 'Guest'}</p>
          </div>
        </div>
        {!order.invoice_id && (
          <Button size="sm" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
            <RefreshCw className={retryMutation.isPending ? 'size-4 animate-spin' : 'size-4'} />
            Retry billing
          </Button>
        )}
      </div>

      {order.sync_error && !order.invoice_id && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{order.sync_error}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Status">
              <Badge variant="outline" className="capitalize">
                {order.order_status}
              </Badge>
            </Row>
            <Row label="Order time">{new Date(order.order_time).toLocaleString()}</Row>
            <Row label="Customer phone">{order.customer_phone ?? '—'}</Row>
            <Row label="Billing">
              {order.invoice_id ? (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">Invoice {order.invoice_number}</span>
              ) : (
                <span className="text-muted-foreground">Not billed</span>
              )}
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payout Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Subtotal">{order.subtotal.toFixed(2)}</Row>
            <Row label="Packaging">{order.packaging_charge.toFixed(2)}</Row>
            <Row label="Tax">{order.tax_amount.toFixed(2)}</Row>
            <Row label="Platform discount">-{order.platform_discount.toFixed(2)}</Row>
            <Row label="Platform commission">-{order.platform_commission.toFixed(2)}</Row>
            <Row label="Total charged to customer">{order.total_amount.toFixed(2)}</Row>
            <Row label="Payout to you">
              <span className="font-semibold">{order.payout_amount.toFixed(2)}</span>
            </Row>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Platform SKU</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Mapped Product</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.item_name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.platform_sku}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{item.unit_price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{item.line_total.toFixed(2)}</TableCell>
                  <TableCell>
                    {item.product_id ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        Mapped
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive">
                        Unmapped
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
