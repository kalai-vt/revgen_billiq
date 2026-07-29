import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/shared/ChartCard';
import { CHART_PRIMARY } from '@/features/analytics/lib/colors';
import type { TopVendor } from '@/features/procurement/api';

interface TopVendorsChartProps {
  data: TopVendor[];
  isLoading: boolean;
}

export function TopVendorsChart({ data, isLoading }: TopVendorsChartProps) {
  return (
    <ChartCard title="Top Vendors by Purchase Value" isLoading={isLoading} isEmpty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="vendor_name" fontSize={12} interval={0} angle={-15} textAnchor="end" height={50} />
          <YAxis fontSize={12} />
          <Tooltip />
          <Bar dataKey="total_amount" name="Purchase Value" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
