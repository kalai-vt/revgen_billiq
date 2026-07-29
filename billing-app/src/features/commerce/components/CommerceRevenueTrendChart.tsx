import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/shared/ChartCard';
import { CHART_COLORS } from '@/features/analytics/lib/colors';
import type { CommerceTrendPoint } from '@/features/commerce/api';

interface CommerceRevenueTrendChartProps {
  data: CommerceTrendPoint[];
  isLoading: boolean;
}

export function CommerceRevenueTrendChart({ data, isLoading }: CommerceRevenueTrendChartProps) {
  return (
    <ChartCard title="Revenue Trend" isLoading={isLoading} isEmpty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="bucket_label" fontSize={12} interval="preserveStartEnd" />
          <YAxis fontSize={12} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="swiggy_revenue" name="Swiggy" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="zomato_revenue" name="Zomato" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
