import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Badge } from '@shared/components/ui/badge';
import { EmptyState } from '@shared/components/ui/empty-state';
import { Input } from '@shared/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@shared/components/ui/popover';
import { Skeleton } from '@shared/components/ui/skeleton';
import { listFeatureCustomers, type CustomerFeaturePanelItem } from '@/services/featuresApi';

interface TenantSearchSelectProps {
  selectedTenantId: string | null;
  selectedTenant: CustomerFeaturePanelItem | undefined;
  onSelect: (tenantId: string) => void;
}

export function TenantSearchSelect({ selectedTenantId, selectedTenant, onSelect }: TenantSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);

  const { data: customers, isFetching } = useQuery({
    queryKey: ['admin-feature-tenant-search', q],
    queryFn: () => listFeatureCustomers({ search: q || undefined }),
    enabled: open,
  });

  function handleSelect(tenantId: string) {
    onSelect(tenantId);
    setOpen(false);
    setInput('');
    setQ('');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        nativeButton
        render={
          <button
            type="button"
            className="flex w-full max-w-md items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted/40 sm:w-96"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              {selectedTenant ? (
                <span className="truncate font-medium">{selectedTenant.company_name}</span>
              ) : selectedTenantId ? (
                <span className="text-muted-foreground">Loading tenant…</span>
              ) : (
                <span className="text-muted-foreground">Select tenant…</span>
              )}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <PopoverContent align="start" initialFocus={false} className="w-96 p-0">
        <div className="border-b p-2">
          <Input
            autoFocus
            placeholder="Search company or email…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {isFetching ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !customers || customers.length === 0 ? (
            <EmptyState icon={Search} title="No tenants found" description="Try a different search." className="py-6" />
          ) : (
            customers.map((tenant) => (
              <button
                key={tenant.tenant_id}
                type="button"
                onClick={() => handleSelect(tenant.tenant_id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{tenant.company_name}</span>
                    {tenant.tenant_id === selectedTenantId && <Check className="size-3.5 shrink-0 text-primary" />}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="capitalize">{tenant.plan}</span>
                    <span>·</span>
                    <span>{tenant.modules_enabled_count} modules</span>
                  </span>
                </span>
                <Badge variant={tenant.status === 'active' ? 'secondary' : 'destructive'} className="shrink-0 capitalize">
                  {tenant.status}
                </Badge>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
