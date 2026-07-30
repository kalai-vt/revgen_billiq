import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NumericInput } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as posApi from '@/features/pos/api';
import {
  CONDITION_DEFAULT_ACTION,
  INVENTORY_ACTION_LABELS,
  INVENTORY_ACTIONS,
  REFUND_METHOD_LABELS,
  REFUND_METHODS,
  RETURN_CONDITION_LABELS,
  RETURN_CONDITIONS,
  RETURN_REASON_LABELS,
  RETURN_REASONS,
} from '@/features/pos/api';
import type { InventoryAction, RefundMethod, ReturnCondition, ReturnReason } from '@/features/pos/api';
import { ApiError } from '@/lib/api-client';

interface ReturnDialogProps {
  invoiceId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface LineState {
  quantity: number;
  reason: ReturnReason;
  condition: ReturnCondition;
  inventoryAction: InventoryAction;
}

function remaining(item: { quantity: number; returned_quantity: number }) {
  return Math.max(0, item.quantity - item.returned_quantity);
}

export function ReturnDialog({ invoiceId, onClose, onSuccess }: ReturnDialogProps) {
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('cash');

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => posApi.getInvoice(invoiceId!),
    enabled: !!invoiceId,
  });

  useEffect(() => {
    // Keyed on invoiceId (not the query's `invoice` data object) — a background refetch of
    // the same invoice must not wipe what the user is already entering.
    setLines({});
    setStep('select');
  }, [invoiceId]);

  useEffect(() => {
    if (invoice) setRefundMethod((invoice.payment_method as RefundMethod) ?? 'cash');
  }, [invoice]);

  function updateLine(itemId: string, patch: Partial<LineState>) {
    setLines((prev) => {
      const current = prev[itemId] ?? { quantity: 0, reason: 'other', condition: 'sellable', inventoryAction: 'return_to_stock' };
      const next = { ...current, ...patch };
      if (patch.condition && !patch.inventoryAction) {
        next.inventoryAction = CONDITION_DEFAULT_ACTION[patch.condition];
      }
      return { ...prev, [itemId]: next };
    });
  }

  function returnEntireInvoice() {
    if (!invoice) return;
    const next: Record<string, LineState> = {};
    for (const item of invoice.items) {
      const max = remaining(item);
      if (max > 0) next[item.id] = { quantity: max, reason: 'other', condition: 'sellable', inventoryAction: 'return_to_stock' };
    }
    setLines(next);
  }

  const activeLines = useMemo(
    () => Object.entries(lines).filter(([, line]) => line.quantity > 0),
    [lines],
  );

  const summary = useMemo(() => {
    if (!invoice) return { subtotal: 0, discount: 0, tax: 0, refund: 0 };
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    let refund = 0;
    for (const [itemId, line] of activeLines) {
      const item = invoice.items.find((i) => i.id === itemId);
      if (!item || item.quantity === 0) continue;
      const share = line.quantity / item.quantity;
      subtotal += item.line_subtotal * share;
      discount += (item.line_subtotal - (item.line_total - item.tax_amount)) * share;
      tax += item.tax_amount * share;
      refund += (item.line_total / item.quantity) * line.quantity;
    }
    return { subtotal, discount, tax, refund };
  }, [activeLines, invoice]);

  const returnMutation = useMutation({
    mutationFn: () => {
      const payloadLines = activeLines.map(([invoice_item_id, line]) => ({
        invoice_item_id,
        quantity: line.quantity,
        reason: line.reason,
        condition: line.condition,
        inventory_action: line.inventoryAction,
      }));
      return posApi.createReturn(invoiceId!, payloadLines, refundMethod);
    },
    onSuccess: (result) => {
      toast.success(`Return ${result.return_number} processed successfully.`);
      onSuccess();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const hasAnyQuantity = activeLines.length > 0;

  return (
    <Dialog open={!!invoiceId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        {isLoading || !invoice ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : step === 'select' ? (
          <>
            <DialogHeader>
              <DialogTitle>Return items — {invoice.invoice_number}</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm text-muted-foreground sm:grid-cols-4">
              <p>Date: {new Date(invoice.created_at).toLocaleDateString()}</p>
              <p>Customer: {invoice.customer_name ?? 'Walk-in'}</p>
              <p>Cashier: {invoice.created_by_name || '—'}</p>
              <p>Payment: <span className="uppercase">{invoice.payment_method}</span></p>
            </div>

            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={returnEntireInvoice}>
                Return entire invoice
              </Button>
            </div>

            {/* Mobile: stacked cards so the qty input and reason picker (the actual point of
                this screen) are never scrolled off-screen inside a cramped table row. */}
            <div className="max-h-80 space-y-2 overflow-y-auto sm:hidden">
              {invoice.items.map((item) => {
                const max = remaining(item);
                const line = lines[item.id];
                return (
                  <div key={item.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate font-medium">{item.product_name}</p>
                      <p className="shrink-0 text-xs text-muted-foreground">{item.identifier_value}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Purchased {item.quantity} · Returned {item.returned_quantity} · Available {max}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground" htmlFor={`qty-${item.id}`}>
                          Return Qty
                        </label>
                        <NumericInput
                          id={`qty-${item.id}`}
                          value={line?.quantity ?? 0}
                          onChange={(value) => updateLine(item.id, { quantity: value ?? 0 })}
                          min={0}
                          max={max}
                          allowDecimal
                          disabled={max <= 0}
                          aria-label={`Return quantity for ${item.product_name}`}
                        />
                      </div>
                      <div className="space-y-1">
                        {/* Plain caption, not a form <label>: the Select below already carries its own aria-label. */}
                        <span className="text-xs text-muted-foreground">Reason</span>
                        <Select
                          value={line?.reason ?? 'other'}
                          onValueChange={(value) => updateLine(item.id, { reason: value as ReturnReason })}
                          disabled={max <= 0}
                        >
                          <SelectTrigger className="h-8 text-xs" aria-label={`Reason for returning ${item.product_name}`}>
                            <SelectValue>{(value: string | null) => RETURN_REASON_LABELS[(value as ReturnReason) ?? 'other']}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {RETURN_REASONS.map((reason) => (
                              <SelectItem key={reason} value={reason}>
                                {RETURN_REASON_LABELS[reason]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden max-h-80 overflow-y-auto overflow-x-auto rounded-md border sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="hidden sm:table-cell">SKU</TableHead>
                    <TableHead className="text-right">Purchased</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Returned</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="w-24 text-right">Return Qty</TableHead>
                    <TableHead className="w-40">Reason</TableHead>
                    <TableHead className="hidden w-36 lg:table-cell">Condition</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map((item) => {
                    const max = remaining(item);
                    const line = lines[item.id];
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="max-w-[160px] truncate font-medium">{item.product_name}</TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{item.identifier_value}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="hidden text-right text-muted-foreground md:table-cell">{item.returned_quantity}</TableCell>
                        <TableCell className="text-right">{max}</TableCell>
                        <TableCell className="text-right">
                          <NumericInput
                            value={line?.quantity ?? 0}
                            onChange={(value) => updateLine(item.id, { quantity: value ?? 0 })}
                            min={0}
                            max={max}
                            allowDecimal
                            disabled={max <= 0}
                            className="text-right"
                            aria-label={`Return quantity for ${item.product_name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={line?.reason ?? 'other'}
                            onValueChange={(value) => updateLine(item.id, { reason: value as ReturnReason })}
                            disabled={max <= 0}
                          >
                            <SelectTrigger className="h-8 text-xs" aria-label={`Reason for returning ${item.product_name}`}>
                              <SelectValue>{(value: string | null) => RETURN_REASON_LABELS[(value as ReturnReason) ?? 'other']}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {RETURN_REASONS.map((reason) => (
                                <SelectItem key={reason} value={reason}>
                                  {RETURN_REASON_LABELS[reason]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Select
                            value={line?.condition ?? 'sellable'}
                            onValueChange={(value) => updateLine(item.id, { condition: value as ReturnCondition })}
                            disabled={max <= 0}
                          >
                            <SelectTrigger className="h-8 text-xs" aria-label={`Condition of returned ${item.product_name}`}>
                              <SelectValue>{(value: string | null) => RETURN_CONDITION_LABELS[(value as ReturnCondition) ?? 'sellable']}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {RETURN_CONDITIONS.map((condition) => (
                                <SelectItem key={condition} value={condition}>
                                  {RETURN_CONDITION_LABELS[condition]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {hasAnyQuantity && (
              <div className="grid gap-x-6 gap-y-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{summary.subtotal.toFixed(2)}</span>
                  </div>
                  {summary.discount > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Discount adjustment</span>
                      <span>-{summary.discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax adjustment</span>
                    <span>{summary.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 text-base font-semibold">
                    <span>Grand Refund</span>
                    <span>{summary.refund.toFixed(2)}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground" htmlFor="refund-method">
                    Refund Method
                  </label>
                  <Select value={refundMethod} onValueChange={(value) => setRefundMethod(value as RefundMethod)}>
                    <SelectTrigger id="refund-method">
                      <SelectValue>{(value: string | null) => REFUND_METHOD_LABELS[(value as RefundMethod) ?? 'cash']}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {REFUND_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {REFUND_METHOD_LABELS[method]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={!hasAnyQuantity} onClick={() => setStep('confirm')}>
                Review return
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirm return — {invoice.invoice_number}</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                <p>Invoice: {invoice.invoice_number}</p>
                <p>Customer: {invoice.customer_name ?? 'Walk-in'}</p>
                <p>Refund Method: {REFUND_METHOD_LABELS[refundMethod]}</p>
                <p>Grand Refund: <span className="font-semibold text-foreground">{summary.refund.toFixed(2)}</span></p>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Inventory Action</TableHead>
                      <TableHead className="text-right">Refund</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
    {activeLines.map(([itemId, line]) => {
                      const item = invoice.items.find((i) => i.id === itemId);
                      if (!item) return null;
                      const lineRefund = (item.line_total / item.quantity) * line.quantity;
                      return (
                        <TableRow key={itemId}>
                          <TableCell className="max-w-[140px] truncate font-medium">{item.product_name}</TableCell>
                          <TableCell className="text-right">{line.quantity}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{RETURN_REASON_LABELS[line.reason]}</Badge>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={line.inventoryAction}
                              onValueChange={(value) => updateLine(itemId, { inventoryAction: value as InventoryAction })}
                            >
                              <SelectTrigger className="h-8 text-xs" aria-label={`Inventory action for ${item.product_name}`}>
                                <SelectValue>
                                  {(value: string | null) => INVENTORY_ACTION_LABELS[(value as InventoryAction) ?? 'return_to_stock']}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {INVENTORY_ACTIONS.map((action) => (
                                  <SelectItem key={action} value={action}>
                                    {INVENTORY_ACTION_LABELS[action]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">{lineRefund.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select')} disabled={returnMutation.isPending}>
                Back
              </Button>
              <Button disabled={returnMutation.isPending} onClick={() => returnMutation.mutate()}>
                {returnMutation.isPending ? 'Processing…' : 'Confirm Return'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
