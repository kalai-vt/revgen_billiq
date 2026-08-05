import { ChartCard } from '@/components/shared/ChartCard';
import type { ExportFormat } from '@/components/shared/ExportDropdown';
import type { DiscountAnalysis } from '@/features/analytics/api';

interface DiscountAnalysisCardProps {
  data: DiscountAnalysis;
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function DiscountAnalysisCard({ data, isLoading, onExport }: DiscountAnalysisCardProps) {
  const stats = [
    { label: 'Total Discount', value: `₹${data.total_discount.toFixed(2)}` },
    { label: 'Discounted Invoices', value: `${data.discounted_invoice_count} / ${data.total_invoice_count}` },
    { label: 'Average Discount', value: `${data.avg_discount_percent.toFixed(1)}%` },
  ];

  return (
    <ChartCard
      title="Discount Analysis"
      isLoading={isLoading}
      isEmpty={data.total_invoice_count === 0}
      onExport={(format) => {
        if (format === 'excel' || format === 'pdf' || format === 'csv') onExport(format);
      }}
      exportFormats={['excel', 'pdf', 'csv']}
      height="h-auto"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-lg font-semibold tracking-tight">{stat.value}</p>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
