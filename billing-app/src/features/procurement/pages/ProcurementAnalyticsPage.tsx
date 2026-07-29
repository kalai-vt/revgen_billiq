import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { DateRangeSelector } from '@/components/shared/DateRangeSelector';
import { ExportDropdown, type ExportFormat } from '@/components/shared/ExportDropdown';
import { IconButton } from '@/components/ui/icon-button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as procurementApi from '@/features/procurement/api';
import { ProcurementAnalyticsKpiCards } from '@/features/procurement/components/ProcurementAnalyticsKpiCards';
import { PurchaseTrendChart } from '@/features/procurement/components/PurchaseTrendChart';
import { useQuery } from '@tanstack/react-query';
import { downloadBlob } from '@/lib/download-blob';
import { ApiError } from '@/lib/api-client';
import { resolveDateRangePreset, OVERVIEW_PRESETS } from '@/lib/date-range';

const EXPORT_EXTENSIONS: Record<ExportFormat, string> = { excel: 'xlsx', pdf: 'pdf', csv: 'csv' };

export function ProcurementAnalyticsPage() {
  const { tenant } = useAuth();
  const timezone = tenant?.timezone ?? 'UTC';
  const [range, setRange] = useState(() => resolveDateRangePreset('this_month', timezone));
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['procurement-analytics', range.from, range.to],
    queryFn: () => procurementApi.getProcurementAnalytics(range.from, range.to),
  });

  async function handleExport(format: ExportFormat) {
    try {
      const blob = await procurementApi.exportProcurementAnalytics('full_analytics', format, range.from, range.to);
      downloadBlob(blob, `procurement_analytics_${range.from}_to_${range.to}.${EXPORT_EXTENSIONS[format]}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not export analytics');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Procurement Analytics</h1>
          <p className="text-sm text-muted-foreground">Purchase trends, vendor and product analysis, and margin.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeSelector value={range} onChange={setRange} timezone={timezone} presets={OVERVIEW_PRESETS} />
          <IconButton tooltip="Refresh" variant="outline" className="size-8" aria-label="Refresh analytics" onClick={() => refetch()}>
            <RefreshCw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />
          </IconButton>
          <ExportDropdown label="Export" formats={['excel', 'pdf']} onExport={handleExport} />
        </div>
      </div>

      <ProcurementAnalyticsKpiCards kpis={data?.kpis} isLoading={isLoading} />

      <PurchaseTrendChart data={data?.purchase_trend ?? []} isLoading={isLoading} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendor Analysis</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.vendor_analysis ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      No purchases in this period.
                    </TableCell>
                  </TableRow>
                )}
                {data?.vendor_analysis.map((v) => (
                  <TableRow key={v.vendor_id}>
                    <TableCell className="max-w-[140px] truncate">{v.vendor_name}</TableCell>
                    <TableCell className="text-right">{v.purchase_value.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{v.purchase_quantity}</TableCell>
                    <TableCell className="text-right">{v.outstanding_amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most Purchased Products</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Avg Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.product_analysis ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      No purchases in this period.
                    </TableCell>
                  </TableRow>
                )}
                {data?.product_analysis.map((p) => (
                  <TableRow key={p.product_id}>
                    <TableCell className="max-w-[140px] truncate">{p.product_name}</TableCell>
                    <TableCell className="text-right">{p.quantity_purchased}</TableCell>
                    <TableCell className="text-right">{p.purchase_value.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{p.avg_cost_price.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
