import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@shared/components/ui/card';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/components/ui/table';
import { getPaymentsSummary, listPayments } from '@/services/paymentsApi';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface KpiCardProps {
  label: string;
  value: string;
}

function KpiCard({ label, value }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export function PaymentsPage() {
  const { data: summary, isLoading: summaryLoading } = useQuery({ queryKey: ['admin-payments-summary'], queryFn: getPaymentsSummary });
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: () => listPayments({ limit: 100 }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">Cross-tenant payment activity and outstanding balances.</p>
      </div>

      {summaryLoading || !summary ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Collected this month" value={formatCurrency(summary.collected_this_month)} />
          <KpiCard label="Collected all time" value={formatCurrency(summary.collected_all_time)} />
          <KpiCard label="Total outstanding" value={formatCurrency(summary.outstanding_total)} />
          <KpiCard label="Customers with outstanding" value={String(summary.tenants_with_outstanding)} />
        </div>
      )}

      {summary && Object.keys(summary.by_method).length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap gap-6 p-4">
            {Object.entries(summary.by_method).map(([method, amount]) => (
              <div key={method}>
                <p className="text-xs capitalize text-muted-foreground">{method}</p>
                <p className="font-semibold tabular-nums">{formatCurrency(amount)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {paymentsLoading || !payments ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment #</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No payments recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                payments.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.payment_number}</TableCell>
                    <TableCell>{row.company_name}</TableCell>
                    <TableCell>{row.customer_name ?? '—'}</TableCell>
                    <TableCell className="capitalize">{row.payment_method}</TableCell>
                    <TableCell className="tabular-nums">{formatCurrency(row.amount)}</TableCell>
                    <TableCell>{formatDate(row.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
