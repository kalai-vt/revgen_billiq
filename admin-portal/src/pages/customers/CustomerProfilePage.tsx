import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Ban,
  Clock,
  CreditCard,
  KeyRound,
  LifeBuoy,
  PauseCircle,
  PlayCircle,
  Send,
  SlidersHorizontal,
  ToggleLeft,
} from 'lucide-react';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent, CardHeader } from '@shared/components/ui/card';
import { Checkbox } from '@shared/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@shared/components/ui/dialog';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Switch } from '@shared/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/components/ui/table';
import {
  activateCustomer,
  getCustomer,
  resetCustomerPassword,
  suspendCustomer,
} from '@/services/customersApi';
import {
  activateSubscription,
  expireSubscription,
  extendTrial,
  getSubscription,
  getTenantLimits,
  listTrialReminders,
  sendTrialReminder,
  suspendSubscription,
  updateSubscription,
  updateTenantLimits,
  type ReminderChannel,
  type TenantLimitItem,
} from '@/services/subscriptionsApi';
import { ApiError } from '@/lib/api-client';
import { PLAN_OPTIONS, planLabel, type PlanId } from '@/lib/plans';

const LIMIT_LABELS: Record<string, string> = {
  max_users: 'Team members',
  max_products: 'Products',
  max_customers: 'Customers',
  max_monthly_invoices: 'Monthly invoices',
  max_branches: 'Branches',
  max_warehouses: 'Warehouses',
  max_storage_mb: 'Storage (MB)',
};

const SUBSCRIPTION_STATUS_VARIANT: Record<string, 'default' | 'destructive' | 'outline'> = {
  active: 'default',
  trialing: 'outline',
  suspended: 'destructive',
  expired: 'destructive',
  cancelled: 'destructive',
};

const SUSPENSION_REASON_LABEL: Record<string, string> = {
  TRIAL_EXPIRED: 'Trial expired',
  PAYMENT_FAILED: 'Payment failed',
  ADMIN_SUSPENDED: 'Suspended by admin',
  NON_PAYMENT: 'Non-payment',
};

function suspensionReasonLabel(reason: string | null | undefined): string {
  if (!reason) return '—';
  if (SUSPENSION_REASON_LABEL[reason]) return SUSPENSION_REASON_LABEL[reason];
  const words = reason.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const CHANNEL_OPTIONS: { value: ReminderChannel; label: string }[] = [
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
];

const CHANNEL_LABEL: Record<ReminderChannel, string> = { sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email' };

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface StatProps {
  label: string;
  value: string;
}

function Stat({ label, value }: StatProps) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

type LimitDraftMode = 'default' | 'unlimited' | 'custom';
interface LimitDraft {
  mode: LimitDraftMode;
  value: string;
}

export function CustomerProfilePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<'suspend' | 'activate' | null>(null);

  const { data: customer, isLoading } = useQuery({
    queryKey: ['admin-customer', tenantId],
    queryFn: () => getCustomer(tenantId!),
    enabled: !!tenantId,
  });

  const { data: subscription } = useQuery({
    queryKey: ['admin-subscription', tenantId],
    queryFn: () => getSubscription(tenantId!),
    enabled: !!tenantId,
  });

  const { data: reminders } = useQuery({
    queryKey: ['admin-trial-reminders', tenantId],
    queryFn: () => listTrialReminders(tenantId!),
    enabled: !!tenantId,
  });

  // ---- Plan dialog (Assign plan / Change plan) ----
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [draftPlan, setDraftPlan] = useState<PlanId>('basic');
  const [actionNote, setActionNote] = useState('');

  // ---- Advanced controls (expire / extend trial by days) ----
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [extendTrialDays, setExtendTrialDays] = useState('14');

  // ---- Activate account dialog ----
  const [activateOpen, setActivateOpen] = useState(false);
  const [activatePlan, setActivatePlan] = useState<PlanId>('basic');
  const [activateEndsAt, setActivateEndsAt] = useState('');

  // ---- Suspend account (subscription) confirm dialog ----
  const [suspendSubOpen, setSuspendSubOpen] = useState(false);

  // ---- Extend subscription (active accounts) dialog ----
  const [extendSubOpen, setExtendSubOpen] = useState(false);
  const [extendEndsAt, setExtendEndsAt] = useState('');

  // ---- Send subscription reminder dialog ----
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderChannels, setReminderChannels] = useState<ReminderChannel[]>([]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin-customer', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
    queryClient.invalidateQueries({ queryKey: ['admin-subscription', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
  }

  const planMutation = useMutation({
    mutationFn: () => updateSubscription(tenantId!, { plan: draftPlan, note: actionNote || undefined }),
    onSuccess: () => {
      toast.success('Plan updated');
      setPlanDialogOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const suspendSubMutation = useMutation({
    mutationFn: () => suspendSubscription(tenantId!, actionNote || undefined),
    onSuccess: () => {
      toast.success('Subscription suspended');
      setSuspendSubOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const activateSubMutation = useMutation({
    mutationFn: () =>
      activateSubscription(tenantId!, {
        plan: activatePlan,
        subscription_ends_at: activateEndsAt ? new Date(activateEndsAt).toISOString() : undefined,
        note: actionNote || undefined,
      }),
    onSuccess: () => {
      toast.success('Subscription activated');
      setActivateOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const extendSubMutation = useMutation({
    mutationFn: () =>
      updateSubscription(tenantId!, {
        subscription_ends_at: extendEndsAt ? new Date(extendEndsAt).toISOString() : undefined,
        note: actionNote || undefined,
      }),
    onSuccess: () => {
      toast.success('Subscription extended');
      setExtendSubOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const expireSubMutation = useMutation({
    mutationFn: () => expireSubscription(tenantId!, actionNote || undefined),
    onSuccess: () => {
      toast.success('Subscription marked expired');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const extendTrialMutation = useMutation({
    mutationFn: () => extendTrial(tenantId!, { days: Number(extendTrialDays) || undefined, note: actionNote || undefined }),
    onSuccess: () => {
      toast.success('Trial extended');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const reminderMutation = useMutation({
    mutationFn: () => sendTrialReminder(tenantId!, reminderChannels),
    onSuccess: (results) => {
      const summary = results
        .map((r) => `${CHANNEL_LABEL[r.channel]}: ${r.status}${r.failure_reason ? ` (${r.failure_reason})` : ''}`)
        .join(' · ');
      const allSent = results.every((r) => r.status === 'sent');
      const allFailed = results.every((r) => r.status === 'failed');
      if (allSent) toast.success(`Reminder sent — ${summary}`);
      else if (allFailed) toast.error(`Reminder failed — ${summary}`);
      else toast.error(`Reminder partially sent — ${summary}`);
      setReminderOpen(false);
      setReminderChannels([]);
      queryClient.invalidateQueries({ queryKey: ['admin-trial-reminders', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['admin-subscription', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function openPlanDialog() {
    setDraftPlan((subscription?.plan as PlanId) ?? 'basic');
    setActionNote('');
    setPlanDialogOpen(true);
  }

  function openActivateDialog() {
    setActivatePlan((subscription?.plan as PlanId) ?? 'basic');
    setActivateEndsAt('');
    setActionNote('');
    setActivateOpen(true);
  }

  function openExtendSubDialog() {
    setExtendEndsAt('');
    setActionNote('');
    setExtendSubOpen(true);
  }

  function openSuspendSubDialog() {
    setActionNote('');
    setSuspendSubOpen(true);
  }

  function openReminderDialog() {
    setReminderChannels([]);
    setReminderOpen(true);
  }

  function toggleReminderChannel(channel: ReminderChannel, checked: boolean) {
    setReminderChannels((prev) => (checked ? [...prev, channel] : prev.filter((c) => c !== channel)));
  }

  const suspendMutation = useMutation({
    mutationFn: () => suspendCustomer(tenantId!),
    onSuccess: () => {
      toast.success('Customer suspended');
      setConfirmAction(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const activateMutation = useMutation({
    mutationFn: () => activateCustomer(tenantId!),
    onSuccess: () => {
      toast.success('Customer activated');
      setConfirmAction(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => resetCustomerPassword(tenantId!),
    onSuccess: () => toast.success('Password reset email sent to the customer'),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  // ---- Limits dialog ----
  const [limitsOpen, setLimitsOpen] = useState(false);
  const { data: limits } = useQuery({
    queryKey: ['admin-tenant-limits', tenantId],
    queryFn: () => getTenantLimits(tenantId!),
    enabled: !!tenantId && limitsOpen,
  });
  const [limitDrafts, setLimitDrafts] = useState<Record<string, LimitDraft>>({});

  useEffect(() => {
    if (!limits) return;
    const drafts: Record<string, LimitDraft> = {};
    for (const item of limits.limits) {
      if (!item.is_overridden) {
        drafts[item.limit_key] = { mode: 'default', value: item.plan_default === null ? '' : String(item.plan_default) };
      } else if (item.effective_value === null) {
        drafts[item.limit_key] = { mode: 'unlimited', value: '' };
      } else {
        drafts[item.limit_key] = { mode: 'custom', value: String(item.effective_value) };
      }
    }
    setLimitDrafts(drafts);
  }, [limits]);

  const limitsMutation = useMutation({
    mutationFn: () => {
      const overrides = Object.entries(limitDrafts).map(([limit_key, draft]) => {
        if (draft.mode === 'default') return { limit_key, reset: true };
        if (draft.mode === 'unlimited') return { limit_key, limit_value: null };
        return { limit_key, limit_value: Number(draft.value) || 0 };
      });
      return updateTenantLimits(tenantId!, overrides);
    },
    onSuccess: () => {
      toast.success('Limits updated');
      setLimitsOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-limits', tenantId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  if (isLoading || !customer) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const status = subscription?.subscription_status;
  const anySubscriptionActionPending =
    suspendSubMutation.isPending ||
    expireSubMutation.isPending ||
    extendTrialMutation.isPending ||
    planMutation.isPending ||
    activateSubMutation.isPending ||
    extendSubMutation.isPending;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/customers')}>
        <ArrowLeft className="mr-1.5 size-4" />
        Back to customers
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{customer.company_name}</h1>
            <Badge variant={customer.status === 'active' ? 'default' : 'destructive'} className="capitalize">
              {customer.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{customer.legal_name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setLimitsOpen(true)}>
            <SlidersHorizontal className="mr-1.5 size-4" />
            Manage limits
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/features/${tenantId}`)}>
            <ToggleLeft className="mr-1.5 size-4" />
            Manage features
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/support')}>
            <LifeBuoy className="mr-1.5 size-4" />
            Support tickets
          </Button>
          <Button variant="outline" size="sm" onClick={() => resetPasswordMutation.mutate()} disabled={resetPasswordMutation.isPending}>
            <KeyRound className="mr-1.5 size-4" />
            Reset password
          </Button>
          {customer.status === 'active' ? (
            <Button variant="destructive" size="sm" onClick={() => setConfirmAction('suspend')}>
              <PauseCircle className="mr-1.5 size-4" />
              Suspend
            </Button>
          ) : (
            <Button size="sm" onClick={() => setConfirmAction('activate')}>
              <PlayCircle className="mr-1.5 size-4" />
              Activate
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <p className="text-sm font-medium">Overview</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Plan" value={planLabel(customer.plan)} />
            <Stat label="Total users" value={String(customer.total_users)} />
            <Stat label="Total invoices" value={String(customer.total_invoices)} />
            <Stat label="Total retail customers" value={String(customer.total_customers)} />
            <Stat label="Revenue this month" value={formatCurrency(customer.monthly_revenue)} />
            <Stat label="Outstanding amount" value={formatCurrency(customer.outstanding_amount)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-sm font-medium">Account</p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Owner</p>
              <p>{customer.owner_name ?? '—'}</p>
              <p className="text-muted-foreground">{customer.owner_email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p>{customer.phone}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Country</p>
              <p>{customer.country}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last login</p>
              <p>{formatDate(customer.last_login)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Customer since</p>
              <p>{formatDate(customer.created_at)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {subscription && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <p className="text-sm font-medium">Subscription</p>
            <Badge variant={SUBSCRIPTION_STATUS_VARIANT[subscription.subscription_status] ?? 'outline'} className="capitalize">
              {subscription.subscription_status.replace('_', ' ')}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <Stat label="Plan" value={planLabel(subscription.plan)} />
              <Stat label="Price" value={`${formatCurrency(subscription.price_inr)}/mo`} />
              {subscription.subscription_status === 'trialing' && (
                <Stat
                  label="Days remaining"
                  value={subscription.days_remaining !== null && subscription.days_remaining !== undefined ? `${subscription.days_remaining}d` : '—'}
                />
              )}
              {subscription.trial_started_at && <Stat label="Trial start" value={formatDate(subscription.trial_started_at)} />}
              {subscription.trial_ends_at && <Stat label="Trial end" value={formatDate(subscription.trial_ends_at)} />}
              {subscription.subscription_started_at && <Stat label="Subscription start" value={formatDate(subscription.subscription_started_at)} />}
              {subscription.subscription_ends_at && <Stat label="Subscription end" value={formatDate(subscription.subscription_ends_at)} />}
              {subscription.suspended_at && <Stat label="Suspended at" value={formatDate(subscription.suspended_at)} />}
              {subscription.suspension_reason && <Stat label="Suspension reason" value={suspensionReasonLabel(subscription.suspension_reason)} />}
              {subscription.reactivated_at && <Stat label="Reactivated at" value={formatDate(subscription.reactivated_at)} />}
              {subscription.reactivated_by && <Stat label="Reactivated by" value={subscription.reactivated_by} />}
            </div>

            <div className="flex flex-wrap gap-2">
              {subscription.subscription_status === 'trialing' && (
                <>
                  <Button size="sm" onClick={openPlanDialog}>
                    <CreditCard className="mr-1.5 size-4" />
                    Assign plan
                  </Button>
                  <Button variant="outline" size="sm" onClick={openReminderDialog}>
                    <Send className="mr-1.5 size-4" />
                    Send subscription reminder
                  </Button>
                </>
              )}
              {(subscription.subscription_status === 'suspended' || subscription.subscription_status === 'expired') && (
                <>
                  <Button variant="outline" size="sm" onClick={openPlanDialog}>
                    <CreditCard className="mr-1.5 size-4" />
                    Assign plan
                  </Button>
                  <Button size="sm" onClick={openActivateDialog}>
                    <PlayCircle className="mr-1.5 size-4" />
                    Activate account
                  </Button>
                  <Button variant="outline" size="sm" onClick={openReminderDialog}>
                    <Send className="mr-1.5 size-4" />
                    Send subscription reminder
                  </Button>
                </>
              )}
              {subscription.subscription_status === 'active' && (
                <>
                  <Button variant="outline" size="sm" onClick={openPlanDialog}>
                    <CreditCard className="mr-1.5 size-4" />
                    Change plan
                  </Button>
                  <Button variant="outline" size="sm" onClick={openExtendSubDialog}>
                    <Clock className="mr-1.5 size-4" />
                    Extend subscription
                  </Button>
                  <Button variant="destructive" size="sm" onClick={openSuspendSubDialog}>
                    <PauseCircle className="mr-1.5 size-4" />
                    Suspend account
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={() => setAdvancedOpen(true)}>
                More options
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {subscription && (
        <Card>
          <CardHeader>
            <p className="text-sm font-medium">Subscription history</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {subscription.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No plan changes recorded yet.</p>
            ) : (
              subscription.history.slice(0, 5).map((event) => (
                <div key={event.id} className="flex items-center justify-between text-sm">
                  <span className="capitalize">
                    {event.event_type.replace('_', ' ')}
                    {event.to_plan && event.event_type !== 'cancelled' && event.event_type !== 'reactivated' ? ` → ${event.to_plan}` : ''}
                    {event.note ? ` — ${event.note}` : ''}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {event.changed_by}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {subscription && (
        <Card>
          <CardHeader>
            <p className="text-sm font-medium">Payment history</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {subscription.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No online payments recorded yet.</p>
            ) : (
              subscription.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between text-sm">
                  <span className="capitalize">
                    {payment.plan} — {formatCurrency(payment.amount_inr)}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      variant="outline"
                      className={
                        payment.status === 'paid'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : payment.status === 'failed'
                            ? 'text-destructive'
                            : ''
                      }
                    >
                      {payment.status}
                    </Badge>
                    {new Date(payment.paid_at ?? payment.created_at).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {reminders && (
        <Card>
          <CardHeader>
            <p className="text-sm font-medium">Subscription reminders</p>
          </CardHeader>
          <CardContent>
            {reminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reminders sent yet.</p>
            ) : (
              <Table containerClassName="overflow-x-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Sent by</TableHead>
                    <TableHead>Sent at</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Provider message ID</TableHead>
                    <TableHead>Failure reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reminders.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{CHANNEL_LABEL[r.channel] ?? r.channel}</TableCell>
                      <TableCell>{r.template}</TableCell>
                      <TableCell>{r.sent_by_admin_name}</TableCell>
                      <TableCell>{formatDate(r.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'sent' ? 'outline' : 'destructive'} className="capitalize">
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.provider_message_id ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.failure_reason ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Assign plan / Change plan */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{status === 'active' ? 'Change plan' : 'Assign plan'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={draftPlan} onValueChange={(value) => value && setDraftPlan(value as PlanId)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string) => planLabel(v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {draftPlan === 'custom' && (
              <div className="rounded-md border border-dashed p-3">
                <p className="text-sm text-muted-foreground">
                  Custom plans need individual module configuration for this tenant.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setPlanDialogOpen(false);
                    navigate(`/features/${tenantId}`);
                  }}
                >
                  <ToggleLeft className="mr-1.5 size-4" />
                  Manage custom modules
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="plan-note">Note (optional)</Label>
              <Input id="plan-note" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="Optional reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => planMutation.mutate()} disabled={planMutation.isPending || draftPlan === subscription?.plan}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate account (post-payment reactivation from suspended/expired) */}
      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Activate account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={activatePlan} onValueChange={(value) => value && setActivatePlan(value as PlanId)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string) => planLabel(v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="activate-ends-at">Subscription ends on (optional)</Label>
              <Input id="activate-ends-at" type="date" value={activateEndsAt} onChange={(e) => setActivateEndsAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="activate-note">Note (optional)</Label>
              <Input id="activate-note" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="e.g. payment reference" />
            </div>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to activate <span className="font-medium text-foreground">{customer.company_name}</span> on the{' '}
              <span className="font-medium text-foreground">{planLabel(activatePlan)}</span> plan? They will immediately regain access.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => activateSubMutation.mutate()} disabled={activateSubMutation.isPending}>
              Activate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend account (subscription-level) */}
      <Dialog open={suspendSubOpen} onOpenChange={setSuspendSubOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Suspend this subscription?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{customer.company_name}</span> will immediately lose access to paid features.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="suspend-sub-note">Note (optional)</Label>
            <Input id="suspend-sub-note" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="Optional reason" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendSubOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => suspendSubMutation.mutate()} disabled={suspendSubMutation.isPending}>
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend subscription (active accounts) */}
      <Dialog open={extendSubOpen} onOpenChange={setExtendSubOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Extend subscription</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="extend-ends-at">New subscription end date</Label>
              <Input id="extend-ends-at" type="date" value={extendEndsAt} onChange={(e) => setExtendEndsAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="extend-note">Note (optional)</Label>
              <Input id="extend-note" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="Optional reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendSubOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => extendSubMutation.mutate()} disabled={extendSubMutation.isPending || !extendEndsAt}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send subscription reminder */}
      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Send subscription reminder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Uses a fixed, built-in reminder template. SMS and WhatsApp aren't connected to a live provider yet — sends are logged rather
              than delivered to a real phone.
            </p>
            <div className="space-y-2">
              {CHANNEL_OPTIONS.map((c) => (
                <label key={c.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={reminderChannels.includes(c.value)}
                    onCheckedChange={(checked) => toggleReminderChannel(c.value, checked === true)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => reminderMutation.mutate()} disabled={reminderMutation.isPending || reminderChannels.length === 0}>
              <Send className="mr-1.5 size-4" />
              Send reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advanced controls: mark expired / extend trial by N days */}
      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Advanced subscription controls</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="advanced-note">Note (applies to the action below)</Label>
              <Input id="advanced-note" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="Optional reason" />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                size="sm"
                disabled={anySubscriptionActionPending || status === 'expired' || status === 'cancelled'}
                onClick={() => expireSubMutation.mutate()}
              >
                <Ban className="mr-1.5 size-4" />
                Mark expired
              </Button>
              <div className="flex gap-1">
                <Input
                  type="number"
                  min={1}
                  className="w-16"
                  value={extendTrialDays}
                  onChange={(e) => setExtendTrialDays(e.target.value)}
                  aria-label="Days to extend trial"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={anySubscriptionActionPending}
                  onClick={() => extendTrialMutation.mutate()}
                >
                  <Clock className="mr-1.5 size-4" />
                  Extend trial
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvancedOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={limitsOpen} onOpenChange={setLimitsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage usage limits</DialogTitle>
          </DialogHeader>
          {!limits ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {limits.limits.map((item: TenantLimitItem) => {
                const draft = limitDrafts[item.limit_key] ?? { mode: 'default', value: '' };
                return (
                  <div key={item.limit_key} className="flex items-center gap-3 rounded-md border p-2.5">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{LIMIT_LABELS[item.limit_key] ?? item.limit_key}</p>
                      <p className="text-xs text-muted-foreground">Plan default: {item.plan_default === null ? 'Unlimited' : item.plan_default}</p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      className="w-24"
                      disabled={draft.mode === 'unlimited'}
                      value={draft.value}
                      onChange={(e) =>
                        setLimitDrafts((prev) => ({ ...prev, [item.limit_key]: { mode: 'custom', value: e.target.value } }))
                      }
                    />
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={draft.mode === 'unlimited'}
                        onCheckedChange={(checked) =>
                          setLimitDrafts((prev) => ({
                            ...prev,
                            [item.limit_key]: checked
                              ? { mode: 'unlimited', value: '' }
                              : { mode: 'custom', value: prev[item.limit_key]?.value || '0' },
                          }))
                        }
                      />
                      <span className="text-xs text-muted-foreground">Unlimited</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={draft.mode === 'default'}
                      onClick={() =>
                        setLimitDrafts((prev) => ({
                          ...prev,
                          [item.limit_key]: { mode: 'default', value: item.plan_default === null ? '' : String(item.plan_default) },
                        }))
                      }
                    >
                      Reset
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLimitsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => limitsMutation.mutate()} disabled={limitsMutation.isPending || !limits}>
              Save limits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmAction === 'suspend' ? 'Suspend this customer?' : 'Activate this customer?'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmAction === 'suspend'
              ? `${customer.company_name} will immediately lose access to RevGen BillIQ.`
              : `${customer.company_name} will regain access to RevGen BillIQ.`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            {confirmAction === 'suspend' ? (
              <Button variant="destructive" onClick={() => suspendMutation.mutate()} disabled={suspendMutation.isPending}>
                Suspend
              </Button>
            ) : (
              <Button onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}>
                Activate
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
