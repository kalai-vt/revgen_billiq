import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ExportFormat } from '@/components/shared/ExportDropdown';
import { CHART_PRIMARY } from '@/features/analytics/lib/colors';
import type { TrendPoint } from '@/features/analytics/api';

interface SalesTrendChartProps {
  data: TrendPoint[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function SalesTrendChart({ data, isLoading, onExport }: SalesTrendChartProps) {
  return (
    <ChartCard title="Sales Trend" isLoading={isLoading} isEmpty={data.length === 0} onExport={onExport}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="bucket_label" fontSize={12} />
          <YAxis fontSize={12} />
          <Tooltip formatter={(value) => Number(value).toFixed(2)} />
          <Line type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_PRIMARY} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
