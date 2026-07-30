import { Search, Users2 } from 'lucide-react';
import { Badge } from '@shared/components/ui/badge';
import { Checkbox } from '@shared/components/ui/checkbox';
import { EmptyState } from '@shared/components/ui/empty-state';
import { Input } from '@shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Skeleton } from '@shared/components/ui/skeleton';
import type { CustomerFeatureFilters, CustomerFeaturePanelItem } from '@/services/featuresApi';

interface CustomerListPanelProps {
  customers: CustomerFeaturePanelItem[] | undefined;
  isLoading: boolean;
  filters: CustomerFeatureFilters;
  onFiltersChange: (filters: CustomerFeatureFilters) => void;
  selectedTenantId: string | null;
  onSelect: (tenantId: string) => void;
  selectedForBulk: string[];
  onToggleBulk: (tenantId: string) => void;
}

const ALL = '__all__';

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL || v === null ? undefined : v)}>
      <SelectTrigger className="h-7 w-full text-xs">
        <SelectValue>{(v: string) => (v === ALL ? placeholder : options.find((o) => o.value === v)?.label ?? v)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CustomerListPanel({
  customers,
  isLoading,
  filters,
  onFiltersChange,
  selectedTenantId,
  onSelect,
  selectedForBulk,
  onToggleBulk,
}: CustomerListPanelProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search customer…"
          className="h-8 pl-8 text-sm"
          value={filters.search ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
        />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <FilterSelect
          value={filters.plan}
          onChange={(v) => onFiltersChange({ ...filters, plan: v })}
          placeholder="Plan"
          options={[
            { value: 'basic', label: 'Starter' },
            { value: 'explore', label: 'Professional' },
            { value: 'advance', label: 'Enterprise' },
          ]}
        />
        <FilterSelect
          value={filters.status}
          onChange={(v) => onFiltersChange({ ...filters, status: v })}
          placeholder="Status"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
        <FilterSelect
          value={filters.subscription_status}
          onChange={(v) => onFiltersChange({ ...filters, subscription_status: v })}
          placeholder="Subscription"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'trialing', label: 'Trialing' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'expired', label: 'Expired' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
        <FilterSelect
          value={filters.is_trial === undefined ? undefined : String(filters.is_trial)}
          onChange={(v) => onFiltersChange({ ...filters, is_trial: v === undefined ? undefined : v === 'true' })}
          placeholder="Trial / Paid"
          options={[
            { value: 'true', label: 'Trial' },
            { value: 'false', label: 'Paid' },
          ]}
        />
        <Input
          placeholder="Industry"
          className="h-7 text-xs"
          value={filters.industry ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, industry: e.target.value || undefined })}
        />
        <Input
          placeholder="Country"
          className="h-7 text-xs"
          value={filters.country ?? ''}
          onChange={(e) => onFiltersChange({ ...filters, country: e.target.value || undefined })}
        />
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : !customers || customers.length === 0 ? (
          <EmptyState icon={Users2} title="No customers match" description="Try adjusting search or filters." />
        ) : (
          customers.map((customer) => (
            <div
              key={customer.tenant_id}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors ${
                selectedTenantId === customer.tenant_id ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'
              }`}
            >
              <Checkbox
                checked={selectedForBulk.includes(customer.tenant_id)}
                onCheckedChange={() => onToggleBulk(customer.tenant_id)}
                onClick={(e) => e.stopPropagation()}
              />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(customer.tenant_id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{customer.company_name}</span>
                  <Badge variant={customer.status === 'active' ? 'secondary' : 'destructive'} className="shrink-0 capitalize">
                    {customer.status}
                  </Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="capitalize">{customer.plan}</span>
                  <span>·</span>
                  <span>{customer.modules_enabled_count} modules</span>
                  {customer.has_custom_features && (
                    <>
                      <span>·</span>
                      <span>Customized</span>
                    </>
                  )}
                  {customer.is_trial && (
                    <>
                      <span>·</span>
                      <span>Trial</span>
                    </>
                  )}
                </div>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
