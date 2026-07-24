import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_PRIMARY } from '@/features/analytics/lib/colors';
import type { DailySalesPoint } from '@/features/analytics/api';

interface DailySalesChartProps {
  data: DailySalesPoint[];
}

export function DailySalesChart({ data }: DailySalesChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily Sales</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip formatter={(value) => Number(value).toFixed(2)} />
            <Line type="monotone" dataKey="revenue" stroke={CHART_PRIMARY} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
