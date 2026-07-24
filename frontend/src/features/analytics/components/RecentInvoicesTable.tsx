import { Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { RecentInvoice } from '@/features/analytics/api';
import { invoiceStatusBadgeClassName, invoiceStatusLabel } from '@/features/pos/lib/invoiceStatus';

interface RecentInvoicesTableProps {
  data: RecentInvoice[];
}

export function RecentInvoicesTable({ data }: RecentInvoicesTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Invoices</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <EmptyState icon={Receipt} title="No invoices yet" />
                </TableCell>
              </TableRow>
            )}
            {data.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                <TableCell>{invoice.customer_name ?? '—'}</TableCell>
                <TableCell className="text-right">{invoice.total_amount.toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={invoiceStatusBadgeClassName(invoice.status)}>
                    {invoiceStatusLabel(invoice.status)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
