import { TableCard } from '@/components/shared/TableCard';
import type { ExportFormat } from '@/components/shared/ExportDropdown';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { RecentInvoice } from '@/features/analytics/api';
import { invoiceStatusBadgeClassName, invoiceStatusLabel } from '@/features/pos/lib/invoiceStatus';

interface RecentInvoicesTableProps {
  data: RecentInvoice[];
  isLoading: boolean;
  onExport: (format: ExportFormat) => void;
}

export function RecentInvoicesTable({ data, isLoading, onExport }: RecentInvoicesTableProps) {
  return (
    <TableCard title="Recent Invoices" isLoading={isLoading} isEmpty={data.length === 0} emptyLabel="No invoices yet" onExport={onExport}>
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
    </TableCard>
  );
}
