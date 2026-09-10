import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeftRight, ChefHat, Loader2, Merge, Printer, Receipt, Split, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductSearchPanel } from '@/features/pos/components/ProductSearchPanel';
import { BillOrderDialog } from '@/features/restaurant/components/BillOrderDialog';
import { MergeOrdersDialog } from '@/features/restaurant/components/MergeOrdersDialog';
import { SplitOrderDialog, type SplitSelection } from '@/features/restaurant/components/SplitOrderDialog';
import { TransferTableDialog } from '@/features/restaurant/components/TransferTableDialog';
import * as restaurantApi from '@/features/restaurant/api';
import type { BillOrderPayload, Kot, OrderItem, RestaurantOrder } from '@/features/restaurant/api';
import { kotPrintFailureMessage, printKot, type KotPrintResult } from '@/features/restaurant/lib/kotPrint';
import { useFeatureFlag } from '@/features/settings/hooks/useFeatureFlags';
import type { Product } from '@/features/products/api';
import { ApiError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/query-error';
import { cn } from '@/lib/utils';

const KOT_STATUS_STYLES: Record<restaurantApi.KotStatus, string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  preparing: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  ready: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  served: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
};

function OrderLine({
  item,
  onChangeQuantity,
  onRemove,
  disabled,
}: {
  item: OrderItem;
  onChangeQuantity: (quantity: number) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  // Anything already with the kitchen can't be quietly reduced or removed here — the server
  // rejects it, so the UI shows why rather than letting the click fail.
  const sent = item.sent_quantity > 0;
  return (
    <div className="flex items-center gap-2 border-b py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.product_name}</p>
        <p className="text-[11px] text-muted-foreground">
          {item.unit_price.toFixed(2)} each
          {sent && ` · ${item.sent_quantity} sent to kitchen`}
        </p>
        {item.notes && <p className="text-[11px] italic text-muted-foreground">{item.notes}</p>}
      </div>
      <Input
        type="number"
        min={item.sent_quantity || 1}
        step="1"
        value={item.quantity}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (next > 0) onChangeQuantity(next);
        }}
        className="h-8 w-16 text-center"
      />
      <span className="w-20 text-right text-sm font-medium">{item.line_total.toFixed(2)}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={disabled || sent}
        title={sent ? 'Already sent to the kitchen — cancel its KOT instead' : 'Remove'}
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

export function RestaurantOrderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingKotId, setCancellingKotId] = useState<string | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);

  // Each of these is separately enableable per tenant (see the restaurant keys in the backend
  // feature catalog), and the endpoints reject a disabled one with a 402 — so hide the button
  // rather than offering an action that is guaranteed to fail.
  const kotEnabled = useFeatureFlag('kot');
  const transferEnabled = useFeatureFlag('table_transfer');
  const mergeEnabled = useFeatureFlag('table_merge');
  const splitEnabled = useFeatureFlag('table_split');

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['restaurant', 'order', id],
    queryFn: () => restaurantApi.getOrder(id!),
    enabled: !!id,
  });

  function refresh(updated?: RestaurantOrder) {
    if (updated) queryClient.setQueryData(['restaurant', 'order', id], updated);
    queryClient.invalidateQueries({ queryKey: ['restaurant', 'order', id] });
    queryClient.invalidateQueries({ queryKey: ['restaurant', 'layout'] });
  }

  function fail(err: unknown, fallback: string) {
    toast.error(err instanceof ApiError ? err.message : fallback);
  }

  const addItem = useMutation({
    mutationFn: (product: Product) =>
      restaurantApi.addOrderItems(id!, [{ product_id: product.id, quantity: 1 }]),
    onSuccess: (updated) => refresh(updated),
    onError: (err) => fail(err, 'Could not add that item'),
  });

  const changeQuantity = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      restaurantApi.updateOrderItem(id!, itemId, { quantity }),
    onSuccess: (updated) => refresh(updated),
    onError: (err) => fail(err, 'Could not update that item'),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => restaurantApi.removeOrderItem(id!, itemId),
    onSuccess: (updated) => refresh(updated),
    onError: (err) => fail(err, 'Could not remove that item'),
  });

  /** Printing is deliberately *not* allowed to fail the mutation: the KOT already exists on the
   * server and shows on the kitchen screen, so a dead printer must not look like "the order was
   * never sent". It downgrades to a warning telling staff to walk the ticket over instead. */
  async function printAndRecord(kot: Kot, order: RestaurantOrder, reprint: boolean): Promise<KotPrintResult> {
    const result = await printKot(kot, order, reprint);
    // print_count means "times this ticket physically came out of a printer", so only a real
    // print bumps it — otherwise a failed reprint would read as a successful one.
    if (result.ok) await restaurantApi.markKotPrinted(kot.id).catch(() => undefined);
    // A failure is recorded rather than swallowed, so the ticket shows as unprinted on the order
    // and can be retried instead of quietly never reaching the kitchen.
    else await restaurantApi.markKotPrintFailed(kot.id, kotPrintFailureMessage(result)).catch(() => undefined);
    return result;
  }

  const sendKot = useMutation({
    mutationFn: async () => {
      const kot = await restaurantApi.createKot(id!, {});
      return { kot, print: await printAndRecord(kot, order!, false) };
    },
    onSuccess: ({ kot, print }) => {
      toast.success(`${kot.kot_number} sent to the kitchen`);
      if (!print.ok) toast.warning(kotPrintFailureMessage(print));
      refresh();
    },
    onError: (err) => fail(err, 'Could not send this order to the kitchen'),
  });

  const reprintKot = useMutation({
    mutationFn: async (kot: Kot) => printAndRecord(kot, order!, true),
    onSuccess: (print) => {
      if (print.ok) toast.success('KOT reprinted');
      else toast.warning(kotPrintFailureMessage(print));
      refresh();
    },
    onError: (err) => fail(err, 'Could not reprint that KOT'),
  });

  const cancelKot = useMutation({
    mutationFn: ({ kotId, reason }: { kotId: string; reason: string }) => restaurantApi.cancelKot(kotId, reason),
    onSuccess: () => {
      toast.success('KOT cancelled');
      setCancellingKotId(null);
      setCancelReason('');
      refresh();
    },
    onError: (err) => fail(err, 'Could not cancel that KOT'),
  });

  const billOrder = useMutation({
    mutationFn: (payload: BillOrderPayload) => restaurantApi.billOrder(id!, payload),
    onSuccess: (result) => {
      toast.success(`Billed as ${result.invoice_number}`);
      setBillOpen(false);
      refresh();
      navigate('/restaurant/tables');
    },
    onError: (err) => fail(err, 'Could not bill this order'),
  });

  const transferOrder = useMutation({
    mutationFn: (toTableId: string) => restaurantApi.transferOrder(id!, toTableId),
    onSuccess: (updated) => {
      toast.success(`Moved to Table ${updated.table_name}`);
      setTransferOpen(false);
      refresh(updated);
    },
    onError: (err) => fail(err, 'Could not move this order'),
  });

  const mergeOrders = useMutation({
    mutationFn: (sourceOrderIds: string[]) => restaurantApi.mergeOrders(id!, sourceOrderIds),
    onSuccess: (updated, sourceOrderIds) => {
      toast.success(`Merged ${sourceOrderIds.length} order${sourceOrderIds.length === 1 ? '' : 's'} into ${updated.order_number}`);
      setMergeOpen(false);
      // The merged-away orders and their tables are gone now, so the board and the open-order
      // list this dialog reads are both stale.
      queryClient.invalidateQueries({ queryKey: ['restaurant'] });
      refresh(updated);
    },
    onError: (err) => fail(err, 'Could not merge those orders'),
  });

  const splitOrder = useMutation({
    mutationFn: (selection: SplitSelection) => restaurantApi.splitOrder(id!, selection.items, selection.toTableId),
    onSuccess: (newOrder) => {
      toast.success(`Split into ${newOrder.order_number}`);
      setSplitOpen(false);
      queryClient.invalidateQueries({ queryKey: ['restaurant'] });
      // Land on the new bill: the reason to split is to take payment for it, and that happens on
      // the new order, not this one.
      navigate(`/restaurant/orders/${newOrder.id}`);
    },
    onError: (err) => fail(err, 'Could not split this order'),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load this order"
        description={apiErrorMessage(error, 'Something went wrong loading the order.')}
      />
    );
  }

  const isOpen = order.status === 'open';
  const unsent = order.items.reduce((sum, item) => sum + Math.max(0, item.quantity - item.sent_quantity), 0);
  const activeKots = order.kots.filter((k) => k.status !== 'cancelled');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            {order.table_name ? `Table ${order.table_name}` : 'Takeaway'}
            <Badge variant="secondary">{order.order_number}</Badge>
            {!isOpen && <Badge variant="outline">{order.status}</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {order.items.length} item{order.items.length === 1 ? '' : 's'} · Total{' '}
            {(order.totals?.total ?? 0).toFixed(2)}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/restaurant/tables')}>
          Back to tables
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {isOpen && (
            <Card className="h-[320px] p-3">
              <ProductSearchPanel onAdd={(product) => addItem.mutate(product)} />
            </Card>
          )}

          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Order items</p>
              {unsent > 0 && <Badge variant="outline">{unsent} not yet sent</Badge>}
            </div>
            {order.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing on this order yet — search for a dish above to add it.
              </p>
            ) : (
              order.items.map((item) => (
                <OrderLine
                  key={item.id}
                  item={item}
                  disabled={!isOpen}
                  onChangeQuantity={(quantity) => changeQuantity.mutate({ itemId: item.id, quantity })}
                  onRemove={() => removeItem.mutate(item.id)}
                />
              ))
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{(order.totals?.subtotal ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span>{(order.totals?.tax_amount ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <span>Total</span>
                <span>{(order.totals?.total ?? 0).toFixed(2)}</span>
              </div>
            </div>

            {isOpen && (
              <div className="space-y-2">
                {kotEnabled && (
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={unsent === 0 || sendKot.isPending}
                    onClick={() => sendKot.mutate()}
                    title={unsent === 0 ? 'Everything has already gone to the kitchen' : undefined}
                  >
                    {sendKot.isPending ? <Loader2 className="size-4 animate-spin" /> : <ChefHat className="size-4" />}
                    Send to kitchen
                  </Button>
                )}
                <Button
                  className="w-full"
                  disabled={order.items.length === 0 || billOrder.isPending}
                  onClick={() => setBillOpen(true)}
                >
                  {billOrder.isPending ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />}
                  Bill & close table
                </Button>
                {transferEnabled && (
                  <Button className="w-full" variant="ghost" onClick={() => setTransferOpen(true)}>
                    <ArrowLeftRight className="size-4" />
                    Move to another table
                  </Button>
                )}
                {(mergeEnabled || splitEnabled) && (
                  <div className={cn('grid gap-2', mergeEnabled && splitEnabled ? 'grid-cols-2' : 'grid-cols-1')}>
                    {mergeEnabled && (
                      <Button variant="ghost" onClick={() => setMergeOpen(true)}>
                        <Merge className="size-4" />
                        Merge
                      </Button>
                    )}
                    {splitEnabled && (
                      <Button variant="ghost" disabled={order.items.length === 0} onClick={() => setSplitOpen(true)}>
                        <Split className="size-4" />
                        Split
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* The whole kitchen-ticket panel is meaningless without the KOT module. */}
          {kotEnabled && (
            <Card className="p-4">
              <p className="mb-2 text-sm font-medium">Kitchen tickets</p>
              {activeKots.length === 0 && order.kots.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">Nothing sent to the kitchen yet.</p>
              ) : (
                <div className="space-y-2">
                  {order.kots.map((kot) => (
                    <div key={kot.id} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{kot.kot_number}</span>
                        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', KOT_STATUS_STYLES[kot.status])}>
                          {restaurantApi.KOT_STATUS_LABELS[kot.status]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {kot.items.map((i) => `${i.quantity} × ${i.product_name}`).join(', ')}
                      </p>
                      {kot.print_status === 'failed' && kot.status !== 'cancelled' && (
                      <div className="mt-1 rounded-md border border-destructive/40 bg-destructive/5 p-2">
                        <p className="text-[11px] text-destructive">
                          ⚠ {kot.last_print_error ?? 'This ticket did not print.'}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1 h-7 text-[11px]"
                          disabled={reprintKot.isPending}
                          onClick={() => reprintKot.mutate(kot)}
                        >
                          Retry print
                        </Button>
                      </div>
                    )}
                    {kot.cancel_reason && (
                        <p className="mt-0.5 text-[11px] italic text-destructive">Cancelled: {kot.cancel_reason}</p>
                      )}
                      {kot.status !== 'cancelled' && (
                        <div className="mt-1.5 flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => reprintKot.mutate(kot)}
                          >
                            <Printer className="size-3" />
                            Reprint{kot.print_count > 0 ? ` (${kot.print_count})` : ''}
                          </Button>
                          {kot.status !== 'served' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-destructive"
                              onClick={() => setCancellingKotId(cancellingKotId === kot.id ? null : kot.id)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      )}
                      {cancellingKotId === kot.id && (
                        <div className="mt-2 space-y-1.5">
                          {/* A reason is required: cancelling means food may already be cooking, so
                              the trail for why it was pulled matters. */}
                          <Input
                            placeholder="Reason for cancelling…"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            className="h-8 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 w-full text-xs"
                            disabled={!cancelReason.trim() || cancelKot.isPending}
                            onClick={() => cancelKot.mutate({ kotId: kot.id, reason: cancelReason.trim() })}
                          >
                            Confirm cancellation
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Mounted only while open so each dialog starts empty every time. A dialog kept mounted
          keeps whatever was picked last time, which after a move or a merge means offering a
          table or an order that is no longer free. */}
      {billOpen && (
        <BillOrderDialog
          order={order}
          open
          onOpenChange={setBillOpen}
          isPending={billOrder.isPending}
          onConfirm={(payload) => billOrder.mutate(payload)}
        />
      )}
      {transferOpen && (
        <TransferTableDialog
          currentTableId={order.table_id}
          open
          onOpenChange={setTransferOpen}
          isPending={transferOrder.isPending}
          onConfirm={(tableId) => transferOrder.mutate(tableId)}
        />
      )}
      {mergeOpen && (
        <MergeOrdersDialog
          order={order}
          open
          onOpenChange={setMergeOpen}
          isPending={mergeOrders.isPending}
          onConfirm={(sourceOrderIds) => mergeOrders.mutate(sourceOrderIds)}
        />
      )}
      {splitOpen && (
        <SplitOrderDialog
          order={order}
          open
          onOpenChange={setSplitOpen}
          isPending={splitOrder.isPending}
          onConfirm={(selection) => splitOrder.mutate(selection)}
        />
      )}
    </div>
  );
}
