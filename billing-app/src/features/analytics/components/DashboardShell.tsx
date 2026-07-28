import { useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import { DateRangeSelector } from '@/components/shared/DateRangeSelector';
import { ExportDropdown, type ExportFormat } from '@/components/shared/ExportDropdown';
import { IconButton } from '@/components/ui/icon-button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import * as analyticsApi from '@/features/analytics/api';
import type { DashboardWidget } from '@/features/analytics/api';
import { DiscountAnalysisCard } from '@/features/analytics/components/DiscountAnalysisCard';
import { HourlySalesChart } from '@/features/analytics/components/HourlySalesChart';
import { KpiCards } from '@/features/analytics/components/KpiCards';
import { OrdersTrendChart } from '@/features/analytics/components/OrdersTrendChart';
import { PaymentMethodsChart } from '@/features/analytics/components/PaymentMethodsChart';
import { RecentInvoicesTable } from '@/features/analytics/components/RecentInvoicesTable';
import { SalesByEmployeeChart } from '@/features/analytics/components/SalesByEmployeeChart';
import { SalesTrendChart } from '@/features/analytics/components/SalesTrendChart';
import { TaxBreakdownChart } from '@/features/analytics/components/TaxBreakdownChart';
import { TopCategoriesChart } from '@/features/analytics/components/TopCategoriesChart';
import { TopProductsChart } from '@/features/analytics/components/TopProductsChart';
import { TopProductsTable } from '@/features/analytics/components/TopProductsTable';
import { useDashboardData } from '@/features/analytics/hooks/useDashboardData';
import { downloadBlob } from '@/lib/download-blob';
import { resolveDateRangePreset, type DateRangePreset } from '@/lib/date-range';

const EXPORT_EXTENSIONS: Record<ExportFormat, string> = { excel: 'xlsx', pdf: 'pdf', csv: 'csv' };

interface DashboardShellProps {
  title: string;
  description: string;
  defaultPreset: DateRangePreset;
  advanced: boolean;
}

export function DashboardShell({ title, description, defaultPreset, advanced }: DashboardShellProps) {
  const { tenant } = useAuth();
  const timezone = tenant?.timezone ?? 'UTC';
  const [range, setRange] = useState(() => resolveDateRangePreset(defaultPreset, timezone));
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useDashboardData(range, advanced);

  async function exportWidget(widget: DashboardWidget, format: ExportFormat) {
    const blob = await analyticsApi.exportDashboardWidget(widget, format, range.from, range.to, advanced, range.preset);
    downloadBlob(blob, `${widget}_${range.from}_to_${range.to}.${EXPORT_EXTENSIONS[format]}`);
  }

  const lastUpdatedLabel = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {description} <span className="text-muted-foreground/70">Last Updated {lastUpdatedLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <DateRangeSelector value={range} onChange={setRange} timezone={timezone} />
          <IconButton
            tooltip="Refresh"
            variant="outline"
            className="size-8"
            aria-label="Refresh dashboard"
            onClick={() => refetch()}
          >
            <RefreshCw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />
          </IconButton>
          <ExportDropdown
            label="Export Dashboard"
            formats={['excel', 'pdf']}
            onExport={(format) => exportWidget('full_dashboard', format)}
          />
          <IconButton tooltip="Print Dashboard" variant="outline" className="size-8" aria-label="Print dashboard" onClick={() => window.print()}>
            <Printer className="size-4" />
          </IconButton>
        </div>
      </div>

      <KpiCards kpis={data?.kpis} isLoading={isLoading} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SalesTrendChart data={data?.sales_trend ?? []} isLoading={isLoading} onExport={(f) => exportWidget('sales_trend', f)} />
        <OrdersTrendChart data={data?.sales_trend ?? []} isLoading={isLoading} onExport={(f) => exportWidget('sales_trend', f)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PaymentMethodsChart data={data?.payment_methods ?? []} isLoading={isLoading} onExport={(f) => exportWidget('payment_methods', f)} />
        <HourlySalesChart data={data?.hourly_sales ?? []} isLoading={isLoading} onExport={(f) => exportWidget('hourly_sales', f)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TopProductsChart data={data?.top_products ?? []} isLoading={isLoading} onExport={(f) => exportWidget('top_products', f)} />
        <TopCategoriesChart data={data?.top_categories ?? []} isLoading={isLoading} onExport={(f) => exportWidget('top_categories', f)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SalesByEmployeeChart data={data?.sales_by_employee ?? []} isLoading={isLoading} onExport={(f) => exportWidget('sales_by_employee', f)} />
        <TaxBreakdownChart data={data?.tax_breakdown ?? []} isLoading={isLoading} onExport={(f) => exportWidget('tax_breakdown', f)} />
      </div>

      <DiscountAnalysisCard
        data={data?.discount_analysis ?? EMPTY_DISCOUNT_ANALYSIS}
        isLoading={isLoading}
        onExport={(f) => exportWidget('discount_analysis', f)}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentInvoicesTable data={data?.recent_invoices ?? []} isLoading={isLoading} onExport={(f) => exportWidget('recent_invoices', f)} />
        <TopProductsTable data={data?.top_products ?? []} isLoading={isLoading} onExport={(f) => exportWidget('top_products', f)} />
      </div>
    </div>
  );
}

const EMPTY_DISCOUNT_ANALYSIS = {
  total_discount: 0,
  discounted_invoice_count: 0,
  total_invoice_count: 0,
  avg_discount_percent: 0,
};
