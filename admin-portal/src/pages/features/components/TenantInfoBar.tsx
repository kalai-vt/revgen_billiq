import { Avatar, AvatarFallback } from '@shared/components/ui/avatar';
import { Badge } from '@shared/components/ui/badge';
import { Card } from '@shared/components/ui/card';
import { Skeleton } from '@shared/components/ui/skeleton';
import type { CustomerFeaturePanelItem, TenantFeatureSummary } from '@/services/featuresApi';

interface TenantInfoBarProps {
  customer: CustomerFeaturePanelItem | undefined;
  summary: TenantFeatureSummary | undefined;
  isLoading: boolean;
}

const PLAN_LABEL: Record<string, string> = { basic: 'Starter', explore: 'Professional', advance: 'Enterprise' };

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export function TenantInfoBar({ customer, summary, isLoading }: TenantInfoBarProps) {
  if (isLoading || !customer) {
    return (
      <Card className="p-4">
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarFallback>{customer.company_name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold">{customer.company_name}</p>
              <Badge variant={customer.status === 'active' ? 'secondary' : 'destructive'} className="capitalize">
                {customer.status}
              </Badge>
              {customer.is_trial && <Badge variant="outline">Trial</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">Tenant ID: {customer.tenant_id}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
          <Field label="Plan" value={PLAN_LABEL[customer.plan] ?? customer.plan} />
          <Field label="Version" value={customer.app_version} />
          <Field label="Industry" value={customer.industry ?? '—'} />
          <Field label="Country" value={customer.country} />
          <Field label="Created" value={formatDate(customer.created_at)} />
          <Field label="Last Login" value={formatDate(customer.last_login)} />
          <Field
            label="Modules"
            value={summary ? `${summary.enabled_count} / ${summary.total_modules}` : customer.modules_enabled_count}
          />
          <Field label={customer.is_trial ? 'Trial Ends' : 'Renewal'} value={customer.is_trial ? formatDate(customer.trial_ends_at) : '—'} />
        </div>
      </div>
    </Card>
  );
}
