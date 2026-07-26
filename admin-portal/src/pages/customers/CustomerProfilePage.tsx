import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, KeyRound, PauseCircle, PlayCircle, ToggleLeft } from 'lucide-react';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent, CardHeader } from '@shared/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@shared/components/ui/dialog';
import { Skeleton } from '@shared/components/ui/skeleton';
import {
  activateCustomer,
  getCustomer,
  resetCustomerPassword,
  suspendCustomer,
} from '@/services/customersApi';
import { ApiError } from '@/lib/api-client';

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

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin-customer', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
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
          <Button variant="outline" size="sm" onClick={() => navigate(`/customers/${tenantId}/features`)}>
            <ToggleLeft className="mr-1.5 size-4" />
            Manage features
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
