import { ChartCard } from '@/components/shared/ChartCard';
import type { ExportFormat } from '@/components/shared/ExportDropdown';
import type { CustomerRetention } from '@/features/analytics/api';

interface CustomerRetentionCardProps {
  data: CustomerRetention;
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function CustomerRetentionCard({ data, isLoading, onExport }: CustomerRetentionCardProps) {
  const stats = [
    { label: 'New Customers', value: data.new_customers.toLocaleString() },
    { label: 'Returning Customers', value: data.returning_customers.toLocaleString() },
    { label: 'Retention Rate', value: `${data.retention_rate_percent.toFixed(1)}%` },
  ];

  return (
    <ChartCard
      title="Customer Retention"
      isLoading={isLoading}
      isEmpty={data.new_customers === 0 && data.returning_customers === 0}
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
