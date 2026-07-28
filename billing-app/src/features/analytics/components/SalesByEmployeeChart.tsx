import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ExportFormat } from '@/components/shared/ExportDropdown';
import { CHART_PRIMARY } from '@/features/analytics/lib/colors';
import type { EmployeeSales } from '@/features/analytics/api';

interface SalesByEmployeeChartProps {
  data: EmployeeSales[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function SalesByEmployeeChart({ data, isLoading, onExport }: SalesByEmployeeChartProps) {
  return (
    <ChartCard title="Sales by Employee" isLoading={isLoading} isEmpty={data.length === 0} onExport={onExport}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" fontSize={12} interval={0} angle={-15} textAnchor="end" height={50} />
          <YAxis fontSize={12} />
          <Tooltip />
          <Bar dataKey="revenue" name="Revenue" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
