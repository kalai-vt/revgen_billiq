import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangeSelector } from '@/components/shared/DateRangeSelector';
import { ExportDropdown, type ExportFormat } from '@/components/shared/ExportDropdown';
import { IconButton } from '@/components/ui/icon-button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as commerceApi from '@/features/commerce/api';
import { CommerceKpiCards } from '@/features/commerce/components/CommerceKpiCards';
import { CommerceRevenueTrendChart } from '@/features/commerce/components/CommerceRevenueTrendChart';
import { downloadBlob } from '@/lib/download-blob';
import { ApiError } from '@/lib/api-client';
import { resolveDateRangePreset, OVERVIEW_PRESETS } from '@/lib/date-range';

const EXPORT_EXTENSIONS: Record<ExportFormat, string> = { excel: 'xlsx', pdf: 'pdf', csv: 'csv' };

export function CommerceDashboardPage() {
  const { tenant } = useAuth();
  const timezone = tenant?.timezone ?? 'UTC';
  const [range, setRange] = useState(() => resolveDateRangePreset('this_month', timezone));
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['commerce-dashboard', range.from, range.to],
    queryFn: () => commerceApi.getCommerceDashboard(range.from, range.to),
  });

  async function handleExport(format: ExportFormat) {
    try {
      const blob = await commerceApi.exportCommerceDashboard('full_dashboard', format, range.from, range.to);
      downloadBlob(blob, `commerce_analytics_${range.from}_to_${range.to}.${EXPORT_EXTENSIONS[format]}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not export analytics');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Commerce Dashboard</h1>
          <p className="text-sm text-muted-foreground">Consolidated online-order performance across Swiggy and Zomato.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeSelector value={range} onChange={setRange} timezone={timezone} presets={OVERVIEW_PRESETS} />
          <IconButton tooltip="Refresh" variant="outline" className="size-8" aria-label="Refresh dashboard" onClick={() => refetch()}>
            <RefreshCw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />
          </IconButton>
          <ExportDropdown label="Export" formats={['excel', 'pdf']} onExport={handleExport} />
        </div>
      </div>

      {(data?.kpis.unmapped_sku_count ?? 0) > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          {data?.kpis.unmapped_sku_count} item(s) need product mapping before their orders can auto-bill — see Product Mapping.
        </div>
      )}

      <CommerceKpiCards kpis={data?.kpis} isLoading={isLoading} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CommerceRevenueTrendChart data={data?.revenue_trend ?? []} isLoading={isLoading} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Channel Comparison</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Avg Order</TableHead>
                  <TableHead className="text-right">Cancelled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.channel_comparison.map((c) => (
                  <TableRow key={c.platform}>
                    <TableCell className="capitalize">
                      <Badge variant="outline" className="capitalize">
                        {c.platform}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{c.revenue.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{c.orders}</TableCell>
                    <TableCell className="text-right">{c.average_order_value.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{c.cancelled_orders}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Best Selling Products</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty Sold</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.top_products ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                    No online orders in this period.
                  </TableCell>
                </TableRow>
              )}
              {data?.top_products.map((p, i) => (
                <TableRow key={i}>
                  <TableCell>{p.product_name}</TableCell>
                  <TableCell className="text-right">{p.quantity_sold}</TableCell>
                  <TableCell className="text-right">{p.revenue.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
