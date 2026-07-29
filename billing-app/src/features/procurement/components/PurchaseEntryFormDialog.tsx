import { useEffect, useState, type ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconButton } from '@/components/ui/icon-button';
import { VendorPicker } from '@/features/procurement/components/VendorPicker';
import * as procurementApi from '@/features/procurement/api';
import * as productsApi from '@/features/products/api';
import type { Product } from '@/features/products/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { tenantLocalToday } from '@/lib/date-range';
import { ApiError } from '@/lib/api-client';

const PAYMENT_MODE_LABELS: Record<string, string> = {
  credit: 'Credit (pay later)',
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
};

interface LineItem {
  key: string;
  product: Product;
  quantity: number;
  unitCostPrice: number;
  taxRatePercent: number;
  discountAmount: number;
}

interface PurchaseEntryFormDialogProps {
  trigger: ReactElement;
}

export function PurchaseEntryFormDialog({ trigger }: PurchaseEntryFormDialogProps) {
  const { tenant } = useAuth();
  const timezone = tenant?.timezone ?? 'UTC';
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(() => tenantLocalToday(timezone));
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState('');
  const [paymentMode, setPaymentMode] = useState<string>('credit');
  const [dueDate, setDueDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setVendorId(null);
      setPurchaseDate(tenantLocalToday(timezone));
      setVendorInvoiceNumber('');
      setPaymentMode('credit');
      setDueDate('');
      setRemarks('');
      setLines([]);
      setProductQuery('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: productResults, isFetching: searching } = useQuery({
    queryKey: ['procurement-product-search', productQuery],
    queryFn: () => productsApi.listProducts({ q: productQuery, page: 1, page_size: 8, is_active: true }),
    enabled: productQuery.trim().length > 0,
  });

  function addProduct(product: Product) {
    setLines((prev) => {
      if (prev.some((l) => l.product.id === product.id)) return prev;
      return [
        ...prev,
        {
          key: product.id,
          product,
          quantity: 1,
          unitCostPrice: product.cost_price,
          taxRatePercent: product.tax_rate_percent,
          discountAmount: 0,
        },
      ];
    });
    setProductQuery('');
  }

  function updateLine(key: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitCostPrice, 0);
  const taxTotal = lines.reduce((sum, l) => sum + (l.quantity * l.unitCostPrice * l.taxRatePercent) / 100, 0);
  const discountTotal = lines.reduce((sum, l) => sum + l.discountAmount, 0);
  const total = subtotal + taxTotal - discountTotal;

  const mutation = useMutation({
    mutationFn: (status: 'draft' | 'received') => {
      if (!vendorId) throw new ApiError(400, 'Select a vendor first');
      if (lines.length === 0) throw new ApiError(400, 'Add at least one product');
      return procurementApi.createPurchase({
        vendor_id: vendorId,
        vendor_invoice_number: vendorInvoiceNumber || null,
        purchase_date: purchaseDate,
        payment_mode: paymentMode || null,
        due_date: dueDate || null,
        remarks: remarks || null,
        status,
        items: lines.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          unit_cost_price: l.unitCostPrice,
          tax_rate_percent: l.taxRatePercent,
          discount_amount: l.discountAmount,
        })),
      });
    },
    onSuccess: (_data, status) => {
      toast.success(status === 'draft' ? 'Purchase saved as draft' : 'Purchase recorded');
      queryClient.invalidateQueries({ queryKey: ['procurement-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['procurement-vendors'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setOpen(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New purchase entry</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <VendorPicker vendorId={vendorId} onSelect={setVendorId} />
            <div className="space-y-1.5">
              <Label htmlFor="pe-date">Purchase date</Label>
              <Input id="pe-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pe-invoice">Vendor invoice number</Label>
              <Input id="pe-invoice" value={vendorInvoiceNumber} onChange={(e) => setVendorInvoiceNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment mode</Label>
              <Select value={paymentMode} onValueChange={(value) => setPaymentMode(value ?? 'credit')}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => PAYMENT_MODE_LABELS[paymentMode] ?? 'Credit'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_MODE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {paymentMode === 'credit' && (
              <div className="space-y-1.5">
                <Label htmlFor="pe-due">Due date</Label>
                <Input id="pe-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pe-product-search">Add product</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="pe-product-search"
                placeholder="Search products to add…"
                className="pl-8"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
              />
              {productQuery.trim() && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                  {searching && <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>}
                  {!searching && productResults?.items.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No products found.</p>
                  )}
                  {productResults?.items.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => addProduct(product)}
                    >
                      <span className="truncate">{product.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">Cost {product.cost_price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {lines.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-28">Cost price</TableHead>
                  <TableHead className="w-20">Tax %</TableHead>
                  <TableHead className="w-24 text-right">Line total</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => {
                  const lineSubtotal = line.quantity * line.unitCostPrice;
                  const lineTax = (lineSubtotal * line.taxRatePercent) / 100;
                  const lineTotal = lineSubtotal + lineTax - line.discountAmount;
                  return (
                    <TableRow key={line.key}>
                      <TableCell className="max-w-[160px] truncate">{line.product.name}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={line.quantity}
                          onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.unitCostPrice}
                          onChange={(e) => updateLine(line.key, { unitCostPrice: Number(e.target.value) })}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={line.taxRatePercent}
                          onChange={(e) => updateLine(line.key, { taxRatePercent: Number(e.target.value) })}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">{lineTotal.toFixed(2)}</TableCell>
                      <TableCell>
                        <IconButton
                          tooltip="Remove"
                          className="size-8"
                          aria-label={`Remove ${line.product.name}`}
                          onClick={() => removeLine(line.key)}
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pe-remarks">Remarks</Label>
            <Input id="pe-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>

          {lines.length > 0 && (
            <div className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{taxTotal.toFixed(2)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span>-{discountTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span>{total.toFixed(2)}</span>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate('draft')}>
            Save draft
          </Button>
          <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate('received')}>
            {mutation.isPending ? 'Saving…' : 'Save purchase'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
