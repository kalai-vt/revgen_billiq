import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/shared/ChartCard';
import type { ExportFormat } from '@/components/shared/ExportDropdown';
import { CHART_PRIMARY } from '@/features/analytics/lib/colors';
import type { CashFlowSummary } from '@/features/analytics/api';

interface CashFlowSummaryChartProps {
  data: CashFlowSummary;
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function CashFlowSummaryChart({ data, isLoading, onExport }: CashFlowSummaryChartProps) {
  return (
    <ChartCard title="Cash Flow Summary" isLoading={isLoading} isEmpty={data.daily.length === 0} onExport={onExport}>
      <div className="flex h-full flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <p className="text-xs text-muted-foreground">Total Cash In</p>
          <p className="text-lg font-semibold tracking-tight">₹{data.total_cash_in.toFixed(2)}</p>
        </div>
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.daily} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="bucket_label" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(value) => Number(value).toFixed(2)} />
              <Bar dataKey="amount" name="Cash In" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
}
