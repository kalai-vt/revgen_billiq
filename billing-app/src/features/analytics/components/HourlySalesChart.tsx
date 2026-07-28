import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ExportFormat } from '@/components/shared/ExportDropdown';
import { CHART_PRIMARY } from '@/features/analytics/lib/colors';
import type { HourlyPoint } from '@/features/analytics/api';

interface HourlySalesChartProps {
  data: HourlyPoint[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function HourlySalesChart({ data, isLoading, onExport }: HourlySalesChartProps) {
  const hasSales = data.some((point) => point.order_count > 0);
  const chartData = data.map((point) => ({ ...point, label: `${String(point.hour).padStart(2, '0')}:00` }));

  return (
    <ChartCard
      title="Hourly Sales"
      isLoading={isLoading}
      isEmpty={data.length === 0 || !hasSales}
      emptyLabel="Hourly sales are only shown when a single day is selected."
      onExport={onExport}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" fontSize={11} interval={2} />
          <YAxis fontSize={12} />
          <Tooltip formatter={(value) => Number(value).toFixed(2)} />
          <Bar dataKey="revenue" name="Revenue" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
