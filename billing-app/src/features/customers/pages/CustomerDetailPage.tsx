import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  FileText,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  ScrollText,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExportDropdown, type ExportFormat } from '@/components/shared/ExportDropdown';
import { ModulePage } from '@/components/layout/ModulePage';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as customersApi from '@/features/customers/api';
import type { CustomerPayload } from '@/features/customers/api';
import * as paymentsApi from '@/features/payments/api';
import { ReceivePaymentDialog } from '@/features/payments/components/ReceivePaymentDialog';
import { paymentStatusBadgeClassName, paymentStatusLabel } from '@/features/payments/lib/paymentStatus';
import { ApiError } from '@/lib/api-client';
import { downloadBlob } from '@/lib/download-blob';

const LEDGER_TYPE_ICON: Record<string, typeof FileText> = {
  invoice: FileText,
  payment: Banknote,
  return: RotateCcw,
  adjustment: ScrollText,
};

const LEDGER_TYPE_LABEL: Record<string, string> = {
  invoice: 'Invoice',
  payment: 'Payment',
  return: 'Return',
  adjustment: 'Adjustment',
};

function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <input
        type="checkbox"
        aria-label={label}
        className="size-4 shrink-0 rounded border-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === 'owner' || user?.role === 'manager';
  const isOwner = user?.role === 'owner';
  const queryClient = useQueryClient();

  const [receivePaymentOpen, setReceivePaymentOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState<number | null>(null);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [creditForm, setCreditForm] = useState<CustomerPayload | null>(null);

  const { data: customer, isLoading: customerLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customersApi.getCustomer(id!),
    enabled: !!id,
  });

  const { data: creditSummary } = useQuery({
    queryKey: ['credit-summary', id],
    queryFn: () => paymentsApi.getCreditSummary(id!),
    enabled: !!id,
  });

  const { data: outstandingInvoices } = useQuery({
    queryKey: ['outstanding-invoices', id],
    queryFn: () => paymentsApi.getOutstandingInvoices(id!),
    enabled: !!id,
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ['customer-ledger', id],
    queryFn: () => paymentsApi.getCustomerLedger(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (customer && !creditForm) {
      setCreditForm({
        name: customer.name,
        is_credit_enabled: customer.is_credit_enabled,
        credit_limit: customer.credit_limit,
        credit_days: customer.credit_days,
        allow_credit_beyond_limit: customer.allow_credit_beyond_limit,
        require_manager_approval: customer.require_manager_approval,
        auto_block_credit: customer.auto_block_credit,
      });
    }
  }, [customer, creditForm]);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['customer', id] });
    queryClient.invalidateQueries({ queryKey: ['credit-summary', id] });
    queryClient.invalidateQueries({ queryKey: ['outstanding-invoices', id] });
    queryClient.invalidateQueries({ queryKey: ['customer-ledger', id] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  }

  const creditSettingsMutation = useMutation({
    mutationFn: () =>
      customersApi.updateCustomer(id!, {
        is_credit_enabled: creditForm!.is_credit_enabled,
        credit_limit: creditForm!.credit_limit,
        credit_days: creditForm!.credit_days,
        allow_credit_beyond_limit: creditForm!.allow_credit_beyond_limit,
        require_manager_approval: creditForm!.require_manager_approval,
        auto_block_credit: creditForm!.auto_block_credit,
      }),
    onSuccess: () => {
      toast.success('Credit settings updated');
      invalidateAll();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const adjustmentMutation = useMutation({
    mutationFn: () => paymentsApi.createLedgerAdjustment(id!, adjustmentAmount ?? 0, adjustmentReason),
    onSuccess: () => {
      toast.success('Ledger adjustment recorded');
      invalidateAll();
      setAdjustmentOpen(false);
      setAdjustmentAmount(null);
      setAdjustmentReason('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  async function handleExportLedger(format: ExportFormat) {
    try {
      const blob = await paymentsApi.exportCustomerLedger(id!, format);
      downloadBlob(blob, `ledger-${customer?.name ?? id}.${format === 'excel' ? 'xlsx' : format}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not export ledger');
    }
  }

  if (customerLoading || !customer) {
    return (
      <ModulePage header={<Skeleton className="h-8 w-64" />} bodyClassName="border-0 p-0">
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ModulePage>
    );
  }

  return (
    <>
      <ModulePage
        header={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <IconButton tooltip="Back to Customers" className="size-8" aria-label="Back to customers" onClick={() => navigate('/customers')}>
                <ArrowLeft className="size-4" />
              </IconButton>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {customer.mobile ?? 'No mobile'} · {customer.email ?? 'No email'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {customer.is_credit_enabled && (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  Credit Enabled
                </Badge>
              )}
              {customer.outstanding_amount > 0 && (
                <Button size="sm" onClick={() => setReceivePaymentOpen(true)}>
                  <Wallet className="size-4" />
                  Receive Payment
                </Button>
              )}
            </div>
          </div>
        }
        bodyClassName="space-y-4 border-0 p-0 overflow-visible"
      >
        <Tabs defaultValue="overview" className="flex flex-col gap-4">
          <TabsList className="w-fit">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="credit">Credit &amp; Outstanding</TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact details</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Mobile</p>
                  <p className="text-sm font-medium">{customer.mobile ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{customer.email ?? '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="text-sm font-medium">{customer.address ?? '—'}</p>
                </div>
              </CardContent>
            </Card>

            {creditForm && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Credit settings</CardTitle>
                  {!canManage && <Badge variant="outline">View only</Badge>}
                </CardHeader>
                <CardContent className="space-y-4">
                  <SettingToggle
                    label="Enable credit sales"
                    description="Allow this customer to be billed partially or fully on credit."
                    checked={creditForm.is_credit_enabled ?? false}
                    onChange={(checked) => setCreditForm((prev) => ({ ...prev!, is_credit_enabled: checked }))}
                    disabled={!canManage}
                  />

                  {creditForm.is_credit_enabled && (
                    <>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Credit limit (optional, blank = unlimited)</Label>
                          <NumericInput
                            value={creditForm.credit_limit ?? null}
                            onChange={(v) => setCreditForm((prev) => ({ ...prev!, credit_limit: v }))}
                            min={0}
                            required={false}
                            disabled={!canManage}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Credit days (payment terms)</Label>
                          <NumericInput
                            value={creditForm.credit_days ?? null}
                            onChange={(v) => setCreditForm((prev) => ({ ...prev!, credit_days: v }))}
                            min={0}
                            required={false}
                            disabled={!canManage}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <SettingToggle
                          label="Allow credit sales beyond limit"
                          description="If off, only owner/manager may exceed the limit; staff are blocked."
                          checked={creditForm.allow_credit_beyond_limit ?? false}
                          onChange={(checked) => setCreditForm((prev) => ({ ...prev!, allow_credit_beyond_limit: checked }))}
                          disabled={!canManage}
                        />
                        <SettingToggle
                          label="Require manager approval"
                          description="Every credit sale to this customer needs an owner/manager, regardless of amount."
                          checked={creditForm.require_manager_approval ?? false}
                          onChange={(checked) => setCreditForm((prev) => ({ ...prev!, require_manager_approval: checked }))}
                          disabled={!canManage}
                        />
                        <SettingToggle
                          label="Auto-block over limit"
                          description="Hard block credit sales beyond the limit for everyone, including owner/manager."
                          checked={creditForm.auto_block_credit ?? false}
                          onChange={(checked) => setCreditForm((prev) => ({ ...prev!, auto_block_credit: checked }))}
                          disabled={!canManage}
                        />
                      </div>
                    </>
                  )}

                  {canManage && (
                    <Button size="sm" disabled={creditSettingsMutation.isPending} onClick={() => creditSettingsMutation.mutate()}>
                      <Pencil className="size-4" />
                      {creditSettingsMutation.isPending ? 'Saving…' : 'Save credit settings'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="credit" className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tracking-tight">{(creditSummary?.current_outstanding ?? 0).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{creditSummary?.total_outstanding_invoices ?? 0} invoices</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tracking-tight text-destructive">
                    {(creditSummary?.total_overdue_amount ?? 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">{creditSummary?.total_overdue_invoices ?? 0} invoices</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Last Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tracking-tight">
                    {creditSummary?.last_payment_date ? new Date(creditSummary.last_payment_date).toLocaleDateString() : '—'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Payment Days</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tracking-tight">
                    {creditSummary?.average_payment_days != null ? creditSummary.average_payment_days.toFixed(1) : '—'}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Outstanding invoices</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table containerClassName="overflow-x-visible overflow-y-visible">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead className="hidden sm:table-cell">Due Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outstandingInvoices?.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <EmptyState icon={Receipt} title="No outstanding invoices" description="This customer is fully paid up." />
                        </TableCell>
                      </TableRow>
                    )}
                    {outstandingInvoices?.items.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">{inv.due_date ?? '—'}</TableCell>
                        <TableCell className="text-right">{inv.total_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">{inv.outstanding_amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={paymentStatusBadgeClassName(inv.payment_status, inv.is_overdue)}>
                            {paymentStatusLabel(inv.payment_status, inv.is_overdue)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ledger" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-4 text-sm">
                <span className="text-muted-foreground">
                  Opening balance <span className="font-medium text-foreground">{(ledger?.opening_balance ?? 0).toFixed(2)}</span>
                </span>
                <span className="text-muted-foreground">
                  Closing balance <span className="font-medium text-foreground">{(ledger?.closing_balance ?? 0).toFixed(2)}</span>
                </span>
              </div>
              <div className="flex gap-2">
                {isOwner && (
                  <Button variant="outline" size="sm" onClick={() => setAdjustmentOpen(true)}>
                    <Plus className="size-4" />
                    Adjustment
                  </Button>
                )}
                <ExportDropdown onExport={handleExportLedger} />
              </div>
            </div>

            <div className="rounded-md border">
              <Table containerClassName="overflow-x-visible overflow-y-visible">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden sm:table-cell">Reference</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerLoading &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={7}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}
                  {!ledgerLoading && ledger?.entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <EmptyState icon={ScrollText} title="No ledger entries yet" description="Invoices, payments, and returns for this customer will appear here." />
                      </TableCell>
                    </TableRow>
                  )}
                  {ledger?.entries.map((entry, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{new Date(entry.date).toLocaleDateString()}</TableCell>
                      <TableCell className="capitalize">{LEDGER_TYPE_LABEL[entry.type] ?? entry.type}</TableCell>
                      <TableCell className="hidden sm:table-cell">{entry.reference}</TableCell>
                      <TableCell className="hidden max-w-[220px] truncate text-muted-foreground md:table-cell">{entry.description}</TableCell>
                      <TableCell className="text-right">{entry.debit > 0 ? entry.debit.toFixed(2) : '—'}</TableCell>
                      <TableCell className="text-right">{entry.credit > 0 ? entry.credit.toFixed(2) : '—'}</TableCell>
                      <TableCell className="text-right font-medium">{entry.balance.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="timeline">
            {ledger?.entries.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No history yet" description="This customer's invoices, payments, and adjustments will show up here in order." />
            ) : (
              <div className="space-y-3">
                {[...(ledger?.entries ?? [])].reverse().map((entry, i) => {
                  const Icon = LEDGER_TYPE_ICON[entry.type] ?? Landmark;
                  return (
                    <div key={i} className="flex gap-3 rounded-md border p-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            {LEDGER_TYPE_LABEL[entry.type] ?? entry.type} · {entry.reference}
                          </p>
                          <p className="shrink-0 text-xs text-muted-foreground">{new Date(entry.date).toLocaleString()}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">{entry.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.debit > 0 ? `Debit ${entry.debit.toFixed(2)}` : `Credit ${entry.credit.toFixed(2)}`} · Balance{' '}
                          {entry.balance.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ModulePage>

      <ReceivePaymentDialog open={receivePaymentOpen} customerId={id} onClose={() => setReceivePaymentOpen(false)} />

      <Dialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ledger adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Amount (positive increases outstanding, negative reduces it)</Label>
              <NumericInput value={adjustmentAmount} onChange={setAdjustmentAmount} min={-999999999} required={false} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Reason</Label>
              <Input value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} placeholder="e.g. Write-off, correction…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustmentOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={adjustmentAmount === null || !adjustmentReason.trim() || adjustmentMutation.isPending}
              onClick={() => adjustmentMutation.mutate()}
            >
              {adjustmentMutation.isPending ? 'Saving…' : 'Record adjustment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
