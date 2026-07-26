import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CreditCard, KeyRound, LifeBuoy, PauseCircle, PlayCircle, ToggleLeft } from 'lucide-react';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent, CardHeader } from '@shared/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@shared/components/ui/dialog';
import { Label } from '@shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Skeleton } from '@shared/components/ui/skeleton';
import {
  activateCustomer,
  getCustomer,
  resetCustomerPassword,
  suspendCustomer,
} from '@/services/customersApi';
import { getSubscription, updateSubscription } from '@/services/subscriptionsApi';
import { ApiError } from '@/lib/api-client';

const PLAN_OPTIONS = ['basic', 'explore', 'advance'];
const STATUS_OPTIONS = ['trialing', 'active', 'past_due', 'cancelled'];

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
  const [draftStatus, setDraftStatus] = useState('active');

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin-customer', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
    queryClient.invalidateQueries({ queryKey: ['admin-subscription', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
  }

  const subscriptionMutation = useMutation({
    mutationFn: () => updateSubscription(tenantId!, { plan: draftPlan, subscription_status: draftStatus }),
    onSuccess: () => {
      toast.success('Subscription updated');
      setSubscriptionOpen(false);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function openSubscriptionDialog() {
    setDraftPlan(subscription?.plan ?? 'basic');
    setDraftStatus(subscription?.subscription_status ?? 'active');
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

  if (isLoading || !customer) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

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
          <Button variant="outline" size="sm" onClick={() => navigate(`/customers/${tenantId}/features`)}>
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

      <Dialog open={subscriptionOpen} onOpenChange={setSubscriptionOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Manage subscription</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Plan</Label>
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
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={draftStatus} onValueChange={(value) => value && setDraftStatus(value)}>
                <SelectTrigger className="w-full capitalize">
                  <SelectValue>{(value: string) => value?.replace('_', ' ')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubscriptionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => subscriptionMutation.mutate()} disabled={subscriptionMutation.isPending}>
              Save changes
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
