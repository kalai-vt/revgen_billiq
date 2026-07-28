import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import { Card } from '@shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/components/ui/tabs';
import {
  getFeatureFlags,
  getSummary,
  getTenantFeatureSummary,
  listFeatureCustomers,
  type CustomerFeatureFilters,
  type TenantFeatureItem,
} from '@/services/featuresApi';
import { SummaryCards } from './components/SummaryCards';
import { CustomerListPanel } from './components/CustomerListPanel';
import { CustomerDetailPanel } from './components/CustomerDetailPanel';
import { BulkActionsDialog } from './components/BulkActionsDialog';
import { ManageTemplatesDialog } from './components/ManageTemplatesDialog';
import { FleetAnalyticsTab } from './components/FleetAnalyticsTab';
import { TenantSearchSelect } from './components/TenantSearchSelect';
import { TenantInfoBar } from './components/TenantInfoBar';
import { TenantKpiCards } from './components/TenantKpiCards';
import { ModuleDomainTab } from './components/ModuleDomainTab';
import { ModuleConfigDialog } from './components/ModuleConfigDialog';
import { ScheduleDialog } from './components/ScheduleDialog';
import { HistoryDialog } from './components/HistoryDialog';

function Workspace({ initialTenantId }: { initialTenantId: string | null }) {
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(initialTenantId);
  const [configItem, setConfigItem] = useState<TenantFeatureItem | null>(null);
  const [scheduleItem, setScheduleItem] = useState<TenantFeatureItem | null>(null);
  const [historyItem, setHistoryItem] = useState<TenantFeatureItem | 'all' | null>(null);

  const { data: allCustomers } = useQuery({
    queryKey: ['admin-feature-customers', {}],
    queryFn: () => listFeatureCustomers({}),
  });
  const selectedCustomer = allCustomers?.find((c) => c.tenant_id === selectedTenantId);

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['admin-features', selectedTenantId],
    queryFn: () => getFeatureFlags(selectedTenantId!),
    enabled: !!selectedTenantId,
  });

  const { data: tenantSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['admin-feature-tenant-summary', selectedTenantId],
    queryFn: () => getTenantFeatureSummary(selectedTenantId!),
    enabled: !!selectedTenantId,
  });

  if (!selectedTenantId) {
    return (
      <div className="space-y-4">
        <TenantSearchSelect selectedTenantId={null} selectedTenant={undefined} onSelect={setSelectedTenantId} />
        <Card className="flex items-center justify-center p-12 text-sm text-muted-foreground">
          Select a tenant to manage their feature access.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TenantSearchSelect selectedTenantId={selectedTenantId} selectedTenant={selectedCustomer} onSelect={setSelectedTenantId} />
      <TenantInfoBar customer={selectedCustomer} summary={tenantSummary} isLoading={!selectedCustomer} />
      <TenantKpiCards data={tenantSummary} isLoading={summaryLoading} />

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Modules</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {(['all', 'customers', 'templates', 'analytics'] as const).map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-3">
            <ModuleDomainTab
              tenantId={selectedTenantId}
              items={items}
              isLoading={itemsLoading}
              domain={tab === 'all' ? 'general' : tab}
              onOpenConfig={setConfigItem}
              onOpenSchedule={setScheduleItem}
              onOpenHistory={setHistoryItem}
            />
          </TabsContent>
        ))}
      </Tabs>

      {configItem && <ModuleConfigDialog tenantId={selectedTenantId} item={configItem} open onOpenChange={(o) => !o && setConfigItem(null)} />}
      {scheduleItem && <ScheduleDialog tenantId={selectedTenantId} item={scheduleItem} open onOpenChange={(o) => !o && setScheduleItem(null)} />}
      {historyItem && (
        <HistoryDialog
          tenantId={selectedTenantId}
          moduleKey={historyItem === 'all' ? undefined : historyItem.module_key}
          moduleLabel={historyItem === 'all' ? undefined : historyItem.label}
          open
          onOpenChange={(o) => !o && setHistoryItem(null)}
        />
      )}
    </div>
  );
}

function FleetOverview() {
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [filters, setFilters] = useState<CustomerFeatureFilters>({});
  const [selectedForBulk, setSelectedForBulk] = useState<string[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['admin-feature-summary'],
    queryFn: getSummary,
  });

  const { data: customers, isLoading: customersLoading } = useQuery({
    queryKey: ['admin-feature-customers', filters],
    queryFn: () => listFeatureCustomers(filters),
  });

  const selectedCustomer = customers?.find((c) => c.tenant_id === selectedTenantId);

  function toggleBulk(tenantId: string) {
    setSelectedForBulk((prev) => (prev.includes(tenantId) ? prev.filter((id) => id !== tenantId) : [...prev, tenantId]));
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <SummaryCards data={summary} isLoading={summaryLoading} />

      <Tabs defaultValue="customers" className="flex-1">
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="mt-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Browse every tenant and bulk-apply changes across many at once.</p>
            <div className="flex items-center gap-2">
              <ManageTemplatesDialog />
              {selectedForBulk.length > 0 && (
                <Card className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-sm">
                    {selectedForBulk.length} selected
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedForBulk([])}>
                    Clear
                  </Button>
                  <Button size="sm" onClick={() => setBulkDialogOpen(true)}>
                    <Layers className="size-3.5" /> Bulk actions
                  </Button>
                </Card>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
            <Card className="h-[calc(100vh-380px)] min-h-96 overflow-hidden p-3">
              <CustomerListPanel
                customers={customers}
                isLoading={customersLoading}
                filters={filters}
                onFiltersChange={setFilters}
                selectedTenantId={selectedTenantId}
                onSelect={setSelectedTenantId}
                selectedForBulk={selectedForBulk}
                onToggleBulk={toggleBulk}
              />
            </Card>
            <div className="h-[calc(100vh-380px)] min-h-96 overflow-hidden">
              <CustomerDetailPanel tenantId={selectedTenantId} customer={selectedCustomer} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="mt-3">
          <FleetAnalyticsTab />
        </TabsContent>
      </Tabs>

      <BulkActionsDialog
        tenantIds={selectedForBulk}
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        onDone={() => setSelectedForBulk([])}
      />
    </div>
  );
}

export function FeatureManagementPage() {
  const { tenantId: routeTenantId } = useParams<{ tenantId?: string }>();

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feature Management</h1>
        <p className="text-sm text-muted-foreground">
          Enable, disable and configure product modules per customer — changes apply immediately, no deployment needed.
        </p>
      </div>

      <Tabs defaultValue="workspace" className="flex flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="fleet">Fleet Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="workspace" className="mt-3">
          <Workspace initialTenantId={routeTenantId ?? null} />
        </TabsContent>

        <TabsContent value="fleet" className="mt-3 flex flex-1 flex-col">
          <FleetOverview />
        </TabsContent>
      </Tabs>
    </div>
  );
}
