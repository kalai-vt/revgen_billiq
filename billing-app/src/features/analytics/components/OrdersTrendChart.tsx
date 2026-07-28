import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ExportFormat } from '@/components/shared/ExportDropdown';
import { CHART_PRIMARY } from '@/features/analytics/lib/colors';
import type { TrendPoint } from '@/features/analytics/api';

interface OrdersTrendChartProps {
  data: TrendPoint[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function OrdersTrendChart({ data, isLoading, onExport }: OrdersTrendChartProps) {
  return (
    <ChartCard title="Orders Trend" isLoading={isLoading} isEmpty={data.length === 0} onExport={onExport}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="bucket_label" fontSize={12} />
          <YAxis fontSize={12} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="order_count" name="Orders" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
