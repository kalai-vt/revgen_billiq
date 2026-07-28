import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ExportFormat } from '@/components/shared/ExportDropdown';
import { CHART_COLORS, CHART_PRIMARY } from '@/features/analytics/lib/colors';
import type { TrendPoint } from '@/features/analytics/api';

interface SalesOrdersComboChartProps {
  data: TrendPoint[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

/** Revenue (bar, left axis) + order count (line, right axis) in one combo chart — the Overview
 * spec explicitly asks for this dual-metric view, a deliberate exception to keeping charts
 * single-axis everywhere else in this app. */
export function SalesOrdersComboChart({ data, isLoading, onExport }: SalesOrdersComboChartProps) {
  return (
    <ChartCard title="Revenue & Orders" isLoading={isLoading} isEmpty={data.length === 0} onExport={onExport}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ left: -10, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="bucket_label" fontSize={12} />
          <YAxis yAxisId="revenue" fontSize={12} />
          <YAxis yAxisId="orders" orientation="right" fontSize={12} allowDecimals={false} />
          <Tooltip formatter={(value, name) => (name === 'Revenue' ? Number(value).toFixed(2) : value)} />
          <Legend />
          <Bar yAxisId="revenue" dataKey="revenue" name="Revenue" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
          <Line yAxisId="orders" type="monotone" dataKey="order_count" name="Orders" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
