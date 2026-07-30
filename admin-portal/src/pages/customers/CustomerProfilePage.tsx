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
  SlidersHorizontal,
  ToggleLeft,
} from 'lucide-react';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent, CardHeader } from '@shared/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@shared/components/ui/dialog';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Switch } from '@shared/components/ui/switch';
import {
  activateCustomer,
  getCustomer,
  resetCustomerPassword,
  suspendCustomer,
} from '@/services/customersApi';
import {
  expireSubscription,
  extendTrial,
  getSubscription,
  getTenantLimits,
  resumeSubscription,
  suspendSubscription,
  updateSubscription,
  updateTenantLimits,
  type TenantLimitItem,
} from '@/services/subscriptionsApi';
import { ApiError } from '@/lib/api-client';

const PLAN_OPTIONS = ['basic', 'explore', 'advance'];

const LIMIT_LABELS: Record<string, string> = {
  max_users: 'Team members',
  max_products: 'Products',
  max_customers: 'Customers',
  max_monthly_invoices: 'Monthly invoices',
  max_branches: 'Branches',
  max_warehouses: 'Warehouses',
  max_storage_mb: 'Storage (MB)',
};

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

  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [draftPlan, setDraftPlan] = useState('basic');
  const [actionNote, setActionNote] = useState('');
  const [extendTrialDays, setExtendTrialDays] = useState('14');

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
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const suspendSubMutation = useMutation({
    mutationFn: () => suspendSubscription(tenantId!, actionNote || undefined),
    onSuccess: () => {
      toast.success('Subscription suspended');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const resumeSubMutation = useMutation({
    mutationFn: () => resumeSubscription(tenantId!, actionNote || undefined),
    onSuccess: () => {
      toast.success('Subscription resumed');
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

  function openSubscriptionDialog() {
    setDraftPlan(subscription?.plan ?? 'basic');
    setActionNote('');
    setSubscriptionOpen(true);
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
    suspendSubMutation.isPending || resumeSubMutation.isPending || expireSubMutation.isPending || extendTrialMutation.isPending || planMutation.isPending;

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
          <Button variant="outline" size="sm" onClick={openSubscriptionDialog}>
            <CreditCard className="mr-1.5 size-4" />
            Manage subscription
          </Button>
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
            <Stat label="Plan" value={customer.plan} />
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

      <Dialog open={subscriptionOpen} onOpenChange={setSubscriptionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage subscription</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <div className="flex gap-2">
                <Select value={draftPlan} onValueChange={(value) => value && setDraftPlan(value)}>
                  <SelectTrigger className="w-full capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => planMutation.mutate()} disabled={planMutation.isPending || draftPlan === subscription?.plan}>
                  Save
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {status ?? '—'}
                </Badge>
                {subscription?.trial_ends_at && status === 'trialing' && (
                  <span className="text-xs text-muted-foreground">Trial ends {formatDate(subscription.trial_ends_at)}</span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subscription-note">Note (applies to the next action below)</Label>
              <Input id="subscription-note" value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="Optional reason" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={anySubscriptionActionPending || status === 'suspended'}
                onClick={() => suspendSubMutation.mutate()}
              >
                <PauseCircle className="mr-1.5 size-4" />
                Suspend
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={anySubscriptionActionPending || status === 'active'}
                onClick={() => resumeSubMutation.mutate()}
              >
                <PlayCircle className="mr-1.5 size-4" />
                Resume
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={anySubscriptionActionPending || status === 'expired' || status === 'cancelled'}
                onClick={() => expireSubMutation.mutate()}
              >
                <Ban className="mr-1.5 size-4" />
                Expire
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
            <Button variant="outline" onClick={() => setSubscriptionOpen(false)}>
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
