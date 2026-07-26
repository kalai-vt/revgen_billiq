import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModulePage } from '@/components/layout/ModulePage';
import * as paymentsApi from '@/features/payments/api';
import type { AgeingBucketKey } from '@/features/payments/api';
import { ApiError } from '@/lib/api-client';

const BUCKET_LABELS: Record<AgeingBucketKey, string> = {
  current: 'Current',
  '1-30': '1-30 days',
  '31-60': '31-60 days',
  '61-90': '61-90 days',
  '90+': '90+ days',
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function OutstandingDashboardPage() {
  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['outstanding-dashboard'],
    queryFn: () => paymentsApi.getOutstandingDashboard(),
  });

  const { data: ageing, isLoading: ageingLoading } = useQuery({
    queryKey: ['ageing-report'],
    queryFn: () => paymentsApi.getAgeingReport(),
  });

  async function handleExport(kind: 'ageing' | 'outstanding', format: 'excel' | 'pdf' | 'csv') {
    try {
      const blob = kind === 'ageing' ? await paymentsApi.exportAgeingReport(format) : await paymentsApi.exportOutstandingReport(format);
      downloadBlob(blob, `${kind}.${format === 'excel' ? 'xlsx' : format}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not export report');
    }
  }

  const tiles = dashboard
    ? [
        { label: 'Total Outstanding', value: dashboard.total_outstanding.toFixed(2) },
        { label: 'Total Overdue', value: dashboard.total_overdue.toFixed(2), destructive: true },
        { label: "Today's Collections", value: dashboard.today_collections.toFixed(2) },
        { label: 'Due Today', value: String(dashboard.due_today) },
        { label: 'Due This Week', value: String(dashboard.due_this_week) },
        { label: 'Overdue Customers', value: String(dashboard.overdue_customers) },
        { label: 'Customers on Credit', value: String(dashboard.customers_on_credit) },
        { label: 'Avg. Collection Days', value: dashboard.average_collection_days != null ? dashboard.average_collection_days.toFixed(1) : '—' },
      ]
    : [];

  const totalAgeing = dashboard ? Object.values(dashboard.ageing_distribution).reduce((sum, v) => sum + v, 0) : 0;

  return (
    <ModulePage
      header={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Outstanding</h1>
            <p className="text-sm text-muted-foreground">Credit sales, ageing, and collections across all customers.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport('outstanding', 'excel')}>
              <FileSpreadsheet className="size-4" />
              <span className="hidden sm:inline">Outstanding</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('ageing', 'excel')}>
              <Sheet className="size-4" />
              <span className="hidden sm:inline">Ageing (Excel)</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('ageing', 'pdf')}>
              <FileText className="size-4" />
              <span className="hidden sm:inline">Ageing (PDF)</span>
            </Button>
          </div>
        </div>
      }
      bodyClassName="space-y-4 border-0 p-0 overflow-visible"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {dashboardLoading &&
            Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          {tiles.map((tile) => (
            <Card key={tile.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{tile.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-semibold tracking-tight ${tile.destructive ? 'text-destructive' : ''}`}>{tile.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {dashboard && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ageing distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {totalAgeing === 0 ? (
                <p className="text-sm text-muted-foreground">No outstanding invoices.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    {(Object.keys(BUCKET_LABELS) as AgeingBucketKey[]).map((bucket, i) => {
                      const value = dashboard.ageing_distribution[bucket];
                      const pct = totalAgeing > 0 ? (value / totalAgeing) * 100 : 0;
                      const colors = ['bg-emerald-500', 'bg-amber-400', 'bg-orange-500', 'bg-red-500', 'bg-red-700'];
                      return pct > 0 ? <div key={bucket} className={colors[i]} style={{ width: `${pct}%` }} /> : null;
                    })}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {(Object.keys(BUCKET_LABELS) as AgeingBucketKey[]).map((bucket) => (
                      <span key={bucket}>
                        {BUCKET_LABELS[bucket]}: <span className="font-medium text-foreground">{dashboard.ageing_distribution[bucket].toFixed(2)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="invoices">
          <TabsList className="w-fit">
            <TabsTrigger value="invoices">By Invoice</TabsTrigger>
            <TabsTrigger value="customers">By Customer</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices">
            <div className="rounded-md border">
              <Table containerClassName="overflow-x-visible overflow-y-visible">
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead className="hidden sm:table-cell">Customer</TableHead>
                    <TableHead className="hidden sm:table-cell">Due Date</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Days Overdue</TableHead>
                    <TableHead>Bucket</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ageingLoading &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={6}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}
                  {!ageingLoading && ageing?.invoices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <EmptyState title="No outstanding invoices" description="Every credit and partial sale has been settled." />
                      </TableCell>
                    </TableRow>
                  )}
                  {ageing?.invoices.map((inv) => (
                    <TableRow key={inv.invoice_id}>
                      <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                      <TableCell className="hidden truncate sm:table-cell">{inv.customer_name ?? '—'}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{inv.due_date ?? '—'}</TableCell>
                      <TableCell className="text-right font-medium">{inv.outstanding_amount.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{inv.days_overdue > 0 ? inv.days_overdue : '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={inv.bucket === 'current' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}>
                          {BUCKET_LABELS[inv.bucket]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="customers">
            <div className="rounded-md border">
              <Table containerClassName="overflow-x-visible overflow-y-visible">
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">1-30</TableHead>
                    <TableHead className="text-right">31-60</TableHead>
                    <TableHead className="text-right">61-90</TableHead>
                    <TableHead className="text-right">90+</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ageingLoading &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={7}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}
                  {!ageingLoading && ageing?.by_customer.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <EmptyState title="No outstanding balances" description="No customer currently owes a balance." />
                      </TableCell>
                    </TableRow>
                  )}
                  {ageing?.by_customer.map((c) => (
                    <TableRow key={c.customer_id}>
                      <TableCell className="font-medium">{c.customer_name}</TableCell>
                      <TableCell className="text-right">{c.current > 0 ? c.current.toFixed(2) : '—'}</TableCell>
                      <TableCell className="text-right">{c.bucket_1_30 > 0 ? c.bucket_1_30.toFixed(2) : '—'}</TableCell>
                      <TableCell className="text-right">{c.bucket_31_60 > 0 ? c.bucket_31_60.toFixed(2) : '—'}</TableCell>
                      <TableCell className="text-right">{c.bucket_61_90 > 0 ? c.bucket_61_90.toFixed(2) : '—'}</TableCell>
                      <TableCell className="text-right text-destructive">{c.bucket_90_plus > 0 ? c.bucket_90_plus.toFixed(2) : '—'}</TableCell>
                      <TableCell className="text-right font-semibold">{c.total_outstanding.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ModulePage>
  );
}
