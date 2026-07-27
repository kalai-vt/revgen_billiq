import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { History, RotateCcw } from 'lucide-react';
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from '@shared/components/ui/accordion';
import { Avatar, AvatarFallback } from '@shared/components/ui/avatar';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Card } from '@shared/components/ui/card';
import { EmptyState } from '@shared/components/ui/empty-state';
import { Skeleton } from '@shared/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { getFeatureFlags, resetFeatures, type CustomerFeaturePanelItem, type FeatureCategory, type TenantFeatureItem } from '@/services/featuresApi';
import { ModuleRow } from './ModuleRow';
import { ModuleConfigDialog } from './ModuleConfigDialog';
import { ScheduleDialog } from './ScheduleDialog';
import { HistoryDialog } from './HistoryDialog';

interface CustomerDetailPanelProps {
  tenantId: string | null;
  customer: CustomerFeaturePanelItem | undefined;
}

const CATEGORY_ORDER: { key: FeatureCategory; label: string }[] = [
  { key: 'core', label: 'Core Modules' },
  { key: 'business', label: 'Business Modules' },
  { key: 'ai', label: 'AI Features' },
  { key: 'premium', label: 'Premium Features' },
];

const PLAN_LABEL: Record<string, string> = { basic: 'Starter', explore: 'Professional', advance: 'Enterprise' };

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CustomerDetailPanel({ tenantId, customer }: CustomerDetailPanelProps) {
  const queryClient = useQueryClient();
  const [configItem, setConfigItem] = useState<TenantFeatureItem | null>(null);
  const [scheduleItem, setScheduleItem] = useState<TenantFeatureItem | null>(null);
  const [historyItem, setHistoryItem] = useState<TenantFeatureItem | 'all' | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ['admin-features', tenantId],
    queryFn: () => getFeatureFlags(tenantId!),
    enabled: !!tenantId,
  });

  const resetMutation = useMutation({
    mutationFn: () => resetFeatures(tenantId!),
    onSuccess: () => {
      toast.success('Reset to plan defaults');
      queryClient.invalidateQueries({ queryKey: ['admin-features', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['admin-feature-customers'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not reset'),
  });

  if (!tenantId) {
    return (
      <Card className="flex h-full items-center justify-center p-8">
        <EmptyState title="Select a customer" description="Pick a customer on the left to manage their feature access." />
      </Card>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <Card className="p-4">
        {!customer ? (
          <Skeleton className="h-16 w-full" />
        ) : (
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
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Plan</p>
                <p className="font-medium">{PLAN_LABEL[customer.plan] ?? customer.plan}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Version</p>
                <p className="font-medium">{customer.app_version}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Modules enabled</p>
                <p className="font-medium">{customer.modules_enabled_count}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last login</p>
                <p className="font-medium">{formatDate(customer.last_login)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium">{formatDate(customer.created_at)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{customer.is_trial ? 'Trial ends' : 'Renewal'}</p>
                <p className="font-medium">{customer.is_trial ? formatDate(customer.trial_ends_at) : '—'}</p>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Changes take effect immediately — no restart or deployment needed.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setHistoryItem('all')}>
            <History className="size-3.5" /> History
          </Button>
          <Button variant="outline" size="sm" onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
            <RotateCcw className="size-3.5" /> Reset to plan defaults
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {isLoading || !items ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : (
          <Accordion defaultValue={CATEGORY_ORDER.map((c) => c.key)} multiple>
            {CATEGORY_ORDER.map((cat) => {
              const catItems = items.filter((i) => i.category === cat.key);
              const enabledCount = catItems.filter((i) => i.status === 'enabled').length;
              return (
                <AccordionItem key={cat.key} value={cat.key} className="mb-2 rounded-lg border">
                  <AccordionTrigger className="px-3 py-2.5 text-sm font-medium">
                    <span className="flex items-center gap-2">
                      {cat.label}
                      <Badge variant="outline" className="text-muted-foreground">
                        {enabledCount}/{catItems.length}
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionPanel>
                    {catItems.map((item) => (
                      <ModuleRow
                        key={item.module_key}
                        tenantId={tenantId}
                        item={item}
                        allItems={items}
                        onOpenConfig={setConfigItem}
                        onOpenSchedule={setScheduleItem}
                        onOpenHistory={setHistoryItem}
                      />
                    ))}
                  </AccordionPanel>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>

      {configItem && <ModuleConfigDialog tenantId={tenantId} item={configItem} open onOpenChange={(o) => !o && setConfigItem(null)} />}
      {scheduleItem && <ScheduleDialog tenantId={tenantId} item={scheduleItem} open onOpenChange={(o) => !o && setScheduleItem(null)} />}
      {historyItem && (
        <HistoryDialog
          tenantId={tenantId}
          moduleKey={historyItem === 'all' ? undefined : historyItem.module_key}
          moduleLabel={historyItem === 'all' ? undefined : historyItem.label}
          open
          onOpenChange={(o) => !o && setHistoryItem(null)}
        />
      )}
    </div>
  );
}
