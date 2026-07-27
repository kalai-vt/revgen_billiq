import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader } from '@shared/components/ui/card';
import { Skeleton } from '@shared/components/ui/skeleton';
import { getAnalytics } from '@/services/featuresApi';

const CATEGORY_COLORS: Record<string, string> = {
  core: 'var(--primary)',
  business: 'oklch(0.7 0.15 200)',
  ai: 'oklch(0.7 0.18 300)',
  premium: 'oklch(0.75 0.15 80)',
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <p className="text-sm font-medium">{title}</p>
      </CardHeader>
      <CardContent className="h-56 pl-0">{children}</CardContent>
    </Card>
  );
}

function RankedBarChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} fontSize={12} width={140} />
        <Tooltip />
        <Bar dataKey="count" fill="var(--primary)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AnalyticsTab() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-feature-analytics'], queryFn: getAnalytics });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard title="Most enabled modules">
        <RankedBarChart data={data.most_enabled.map((m) => ({ label: m.label, count: m.count }))} />
      </ChartCard>
      <ChartCard title="Least enabled modules">
        <RankedBarChart data={data.least_enabled.map((m) => ({ label: m.label, count: m.count }))} />
      </ChartCard>
      <ChartCard title="Feature adoption by category">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.adoption_rate} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} unit="%" width={40} />
            <Tooltip formatter={(v) => `${v}%`} />
            <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
              {data.adoption_rate.map((entry) => (
                <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] ?? 'var(--primary)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Customers by plan">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.customers_by_plan} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="plan" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} width={30} />
            <Tooltip />
            <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Premium feature usage">
        <RankedBarChart data={data.premium_usage.map((m) => ({ label: m.label, count: m.count }))} />
      </ChartCard>
      <ChartCard title="AI feature usage">
        <RankedBarChart data={data.ai_usage.map((m) => ({ label: m.label, count: m.count }))} />
      </ChartCard>
    </div>
  );
}
