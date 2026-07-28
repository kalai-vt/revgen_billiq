import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCheck, RotateCcw, Search, XCircle } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import { EmptyState } from '@shared/components/ui/empty-state';
import { Input } from '@shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Skeleton } from '@shared/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { resetFeatures, scopedBulkUpdate, type FeatureDomain, type TenantFeatureItem } from '@/services/featuresApi';
import { ModuleCard } from './ModuleCard';

interface ModuleDomainTabProps {
  tenantId: string;
  items: TenantFeatureItem[] | undefined;
  isLoading: boolean;
  domain: FeatureDomain;
  onOpenConfig: (item: TenantFeatureItem) => void;
  onOpenSchedule: (item: TenantFeatureItem) => void;
  onOpenHistory: (item: TenantFeatureItem) => void;
}

const CATEGORY_LABEL: Record<string, string> = { core: 'Core Modules', business: 'Business Modules', ai: 'AI Features', premium: 'Premium Features' };

const ALL = '__all__';

export function ModuleDomainTab({ tenantId, items, isLoading, domain, onOpenConfig, onOpenSchedule, onOpenHistory }: ModuleDomainTabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();

  const domainItems = useMemo(() => (items ?? []).filter((i) => i.domain === domain), [items, domain]);
  const domainKeys = useMemo(() => domainItems.filter((i) => !i.always_on).map((i) => i.module_key), [domainItems]);

  const visibleItems = useMemo(() => {
    return domainItems.filter((item) => {
      if (search && !item.label.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (categoryFilter && item.category !== categoryFilter) return false;
      return true;
    });
  }, [domainItems, search, statusFilter, categoryFilter]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin-features', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['admin-feature-tenant-summary', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['admin-feature-customers'] });
    queryClient.invalidateQueries({ queryKey: ['admin-feature-summary'] });
  }

  const bulkMutation = useMutation({
    mutationFn: (status: 'enabled' | 'disabled') => scopedBulkUpdate(tenantId, domainKeys, status, undefined, true),
    onSuccess: (res, status) => {
      toast.success(`${status === 'enabled' ? 'Enabled' : 'Disabled'} ${res.updated.length} of ${domainKeys.length} modules`);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Bulk update failed'),
  });

  const resetMutation = useMutation({
    mutationFn: () => resetFeatures(tenantId, domainKeys),
    onSuccess: () => {
      toast.success('Reset to plan defaults');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not reset'),
  });

  if (isLoading || !items) {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const grouped =
    domain === 'general'
      ? (['core', 'business', 'ai', 'premium'] as const)
          .map((cat) => ({ cat, catItems: visibleItems.filter((i) => i.category === cat) }))
          .filter((g) => g.catItems.length > 0)
      : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full max-w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search modules…"
              className="h-8 pl-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter ?? ALL} onValueChange={(v) => setStatusFilter(v === ALL || v === null ? undefined : v)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue>{(v: string) => (v === ALL ? 'All statuses' : v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="enabled">Enabled</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          {domain === 'general' && (
            <Select value={categoryFilter ?? ALL} onValueChange={(v) => setCategoryFilter(v === ALL || v === null ? undefined : v)}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue>{(v: string) => (v === ALL ? 'All categories' : CATEGORY_LABEL[v])}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(search || statusFilter || categoryFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter(undefined); setCategoryFilter(undefined); }}>
              Reset filters
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={bulkMutation.isPending || domainKeys.length === 0} onClick={() => bulkMutation.mutate('enabled')}>
            <CheckCheck className="size-3.5" /> Enable All
          </Button>
          <Button variant="outline" size="sm" disabled={bulkMutation.isPending || domainKeys.length === 0} onClick={() => bulkMutation.mutate('disabled')}>
            <XCircle className="size-3.5" /> Disable All
          </Button>
          <Button variant="outline" size="sm" disabled={resetMutation.isPending || domainKeys.length === 0} onClick={() => resetMutation.mutate()}>
            <RotateCcw className="size-3.5" /> Reset to Plan
          </Button>
        </div>
      </div>

      {visibleItems.length === 0 ? (
        <EmptyState icon={Search} title="No modules match" description="Try adjusting search or filters." />
      ) : grouped ? (
        <div className="space-y-4">
          {grouped.map(({ cat, catItems }) => (
            <div key={cat} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{CATEGORY_LABEL[cat]}</p>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {catItems.map((item) => (
                  <ModuleCard
                    key={item.module_key}
                    tenantId={tenantId}
                    item={item}
                    allItems={items}
                    onOpenConfig={onOpenConfig}
                    onOpenSchedule={onOpenSchedule}
                    onOpenHistory={onOpenHistory}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visibleItems.map((item) => (
            <ModuleCard
              key={item.module_key}
              tenantId={tenantId}
              item={item}
              allItems={items}
              onOpenConfig={onOpenConfig}
              onOpenSchedule={onOpenSchedule}
              onOpenHistory={onOpenHistory}
            />
          ))}
        </div>
      )}
    </div>
  );
}
