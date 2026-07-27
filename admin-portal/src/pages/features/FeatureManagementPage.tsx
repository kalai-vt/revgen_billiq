import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import { Card } from '@shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/components/ui/tabs';
import { getSummary, listFeatureCustomers, type CustomerFeatureFilters } from '@/services/featuresApi';
import { SummaryCards } from './components/SummaryCards';
import { CustomerListPanel } from './components/CustomerListPanel';
import { CustomerDetailPanel } from './components/CustomerDetailPanel';
import { BulkActionsDialog } from './components/BulkActionsDialog';
import { TemplatesTab } from './components/TemplatesTab';
import { AnalyticsTab } from './components/AnalyticsTab';

export function FeatureManagementPage() {
  const { tenantId: routeTenantId } = useParams<{ tenantId?: string }>();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(routeTenantId ?? null);
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
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feature Management</h1>
        <p className="text-sm text-muted-foreground">
          Enable, disable and configure product modules per customer — changes apply immediately, no deployment needed.
        </p>
      </div>

      <SummaryCards data={summary} isLoading={summaryLoading} />

      <Tabs defaultValue="customers" className="flex-1">
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="mt-3">
          {selectedForBulk.length > 0 && (
            <Card className="mb-3 flex items-center justify-between px-4 py-2.5">
              <span className="text-sm">
                {selectedForBulk.length} customer{selectedForBulk.length === 1 ? '' : 's'} selected
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedForBulk([])}>
                  Clear
                </Button>
                <Button size="sm" onClick={() => setBulkDialogOpen(true)}>
                  <Layers className="size-3.5" /> Bulk actions
                </Button>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
            <Card className="h-[calc(100vh-320px)] min-h-96 overflow-hidden p-3">
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
            <div className="h-[calc(100vh-320px)] min-h-96 overflow-hidden">
              <CustomerDetailPanel tenantId={selectedTenantId} customer={selectedCustomer} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="mt-3">
          <TemplatesTab />
        </TabsContent>

        <TabsContent value="analytics" className="mt-3">
          <AnalyticsTab />
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
