import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader } from '@shared/components/ui/card';
import { Skeleton } from '@shared/components/ui/skeleton';
import { getDashboardSummary } from '@/services/dashboardApi';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
}

function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-dashboard-summary'], queryFn: getDashboardSummary });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Executive Dashboard</h1>
        <p className="text-sm text-muted-foreground">Cross-tenant snapshot of RevGen BillIQ, as of right now.</p>
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard label="Total customers" value={String(data.total_tenants)} hint={`${data.today_signups} signed up today`} />
            <KpiCard label="Active customers" value={String(data.active_tenants)} />
            <KpiCard label="Suspended customers" value={String(data.suspended_tenants)} />
            <KpiCard label="Total users" value={String(data.total_users)} />
            <KpiCard label="Total invoices" value={String(data.total_invoices)} />
            <KpiCard label="Total transactions" value={String(data.total_transactions)} />
            <KpiCard label="Revenue this month" value={formatCurrency(data.monthly_revenue)} />
            <KpiCard label="Outstanding payments" value={formatCurrency(data.outstanding_payments)} />
          </div>

          <Card>
            <CardHeader>
              <p className="text-sm font-medium">Revenue trend — last 6 months</p>
            </CardHeader>
            <CardContent className="h-64 pl-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.revenue_trend} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => formatCurrency(v)} width={90} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--primary)" fill="url(#revenueFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Annual revenue to date: <span className="font-medium tabular-nums">{formatCurrency(data.annual_revenue)}</span>
          </p>
        </>
      )}
    </div>
  );
}
