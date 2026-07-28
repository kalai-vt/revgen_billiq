import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ExportFormat } from '@/components/shared/ExportDropdown';
import { CHART_COLORS } from '@/features/analytics/lib/colors';
import type { PaymentMethodBreakdown } from '@/features/analytics/api';

interface PaymentMethodsChartProps {
  data: PaymentMethodBreakdown[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function PaymentMethodsChart({ data, isLoading, onExport }: PaymentMethodsChartProps) {
  const chartData = data.map((d) => ({ name: d.method.toUpperCase(), value: d.amount }));

  return (
    <ChartCard title="Payment Methods" isLoading={isLoading} isEmpty={chartData.length === 0} onExport={onExport}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={70} isAnimationActive={false}>
            {chartData.map((entry, index) => (
              <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => Number(value).toFixed(2)} />
          <Legend verticalAlign="bottom" height={36} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
