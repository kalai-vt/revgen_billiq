import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/shared/ChartCard';
import { CHART_PRIMARY } from '@/features/analytics/lib/colors';
import type { PurchaseTrendPoint } from '@/features/procurement/api';

interface PurchaseTrendChartProps {
  data: PurchaseTrendPoint[];
  isLoading: boolean;
}

export function PurchaseTrendChart({ data, isLoading }: PurchaseTrendChartProps) {
  return (
    <ChartCard title="Purchase Trend" isLoading={isLoading} isEmpty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="bucket_label" fontSize={12} interval="preserveStartEnd" />
          <YAxis fontSize={12} />
          <Tooltip />
          <Line type="monotone" dataKey="purchase_value" name="Purchase Value" stroke={CHART_PRIMARY} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
