import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Printer, Ban, Eye, Undo2, Search, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnResizeHandle } from '@/components/ui/column-resize-handle';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import { useResizableColumns } from '@/hooks/useResizableColumns';
import * as posApi from '@/features/pos/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { InvoiceExportButtons } from '@/features/pos/components/InvoiceExportButtons';
import { ReturnDialog } from '@/features/pos/components/ReturnDialog';
import { ViewInvoiceDialog } from '@/features/pos/components/ViewInvoiceDialog';
import { invoiceStatusBadgeClassName, invoiceStatusLabel } from '@/features/pos/lib/invoiceStatus';
import { ApiError } from '@/lib/api-client';

const PAGE_SIZE = 20;

type StatusFilter = 'all' | 'paid' | 'partial' | 'cancelled' | 'refunded';
type SortValue =
  | 'created_at:desc'
  | 'created_at:asc'
  | 'total_amount:desc'
  | 'total_amount:asc'
  | 'invoice_number:asc'
  | 'invoice_number:desc';

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All statuses',
  paid: 'Paid',
  partial: 'Partial',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const SORT_LABELS: Record<SortValue, string> = {
  'created_at:desc': 'Newest first',
  'created_at:asc': 'Oldest first',
  'total_amount:desc': 'Total: high to low',
  'total_amount:asc': 'Total: low to high',
  'invoice_number:asc': 'Invoice #: A to Z',
  'invoice_number:desc': 'Invoice #: Z to A',
};

const INITIAL_WIDTHS = { invoiceNumber: 140, customer: 160, payment: 110, total: 110, status: 110, date: 160 };

export function InvoicesListPage() {
  const { user } = useAuth();
  const canVoid = user?.role === 'owner' || user?.role === 'manager';
  const canReturn = user?.role === 'owner' || user?.role === 'manager';

  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [qInput, setQInput] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<SortValue>('created_at:desc');
  const [page, setPage] = useState(1);
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);
  const [returnInvoiceId, setReturnInvoiceId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { widths, startResize } = useResizableColumns(INITIAL_WIDTHS);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    setPage(1);
  }, [status, dateFrom, dateTo, sort]);

  const [sortBy, sortDir] = sort.split(':') as ['created_at' | 'total_amount' | 'invoice_number', 'asc' | 'desc'];

  function handleSort(field: 'created_at' | 'total_amount' | 'invoice_number') {
    const nextDir = field === sortBy ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    setSort(`${field}:${nextDir}` as SortValue);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, q, status, dateFrom, dateTo, sort],
    queryFn: () =>
      posApi.listInvoices({
        page,
        page_size: PAGE_SIZE,
        q: q || undefined,
        status: status === 'all' ? undefined : status,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      }),
    placeholderData: keepPreviousData,
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => posApi.voidInvoice(id),
    onSuccess: () => {
      toast.success('Invoice voided');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  async function handleDownloadPdf(id: string, invoiceNumber: string) {
    try {
      const blob = await posApi.downloadInvoicePdf(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoiceNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not download PDF');
    }
  }

  return (
    <>
    <ModulePage
      header={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
            <p className="text-sm text-muted-foreground">Browse and manage past sales.</p>
          </div>
          <InvoiceExportButtons
            q={q || undefined}
            dateFrom={dateFrom || undefined}
            dateTo={dateTo || undefined}
            status={status === 'all' ? undefined : status}
            sortBy={sortBy}
            sortDir={sortDir}
          />
        </div>
      }
      filters={
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by invoice #, customer, mobile, product, or PID/SKU…"
              className="pl-8"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
            <SelectTrigger className="lg:w-40">
              <SelectValue>{(value: string | null) => STATUS_LABELS[(value as StatusFilter) ?? 'all']}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {STATUS_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" className="lg:w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" className="lg:w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <Select value={sort} onValueChange={(value) => setSort(value as SortValue)}>
            <SelectTrigger className="lg:w-48">
              <SelectValue>{(value: string | null) => SORT_LABELS[(value as SortValue) ?? 'created_at:desc']}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortValue[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
      footer={
        <TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="invoice" />
      }
    >
      <Table containerClassName="overflow-x-visible overflow-y-visible" className="sm:table-fixed">
        <colgroup>
          <col style={{ width: widths.invoiceNumber }} />
          <col className="hidden sm:table-column" style={{ width: widths.customer }} />
          <col className="hidden sm:table-column" style={{ width: widths.payment }} />
          <col style={{ width: widths.total }} />
          <col style={{ width: widths.status }} />
          <col className="hidden sm:table-column" style={{ width: widths.date }} />
          <col style={{ width: 128 }} />
        </colgroup>
        <TableHeader>
          <TableRow>
            <SortableTableHead field="invoice_number" sortBy={sortBy} sortDir={sortDir} onSort={handleSort}>
              Invoice #
              <ColumnResizeHandle onPointerDown={startResize('invoiceNumber')} />
            </SortableTableHead>
            <TableHead className="relative hidden sm:table-cell">
              Customer
              <ColumnResizeHandle onPointerDown={startResize('customer')} />
            </TableHead>
            <TableHead className="relative hidden sm:table-cell">
              Payment
              <ColumnResizeHandle onPointerDown={startResize('payment')} />
            </TableHead>
            <SortableTableHead field="total_amount" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-right">
              Total
              <ColumnResizeHandle onPointerDown={startResize('total')} />
            </SortableTableHead>
            <TableHead className="relative">
              Status
              <ColumnResizeHandle onPointerDown={startResize('status')} />
            </TableHead>
            <SortableTableHead field="created_at" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell">
              Date
              <ColumnResizeHandle onPointerDown={startResize('date')} />
            </SortableTableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={7}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {!isLoading && data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>
                <EmptyState icon={Receipt} title="No invoices found" description="Create a sale in POS or adjust your filters." />
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell className="truncate font-medium">{invoice.invoice_number}</TableCell>
              <TableCell className="hidden truncate sm:table-cell">{invoice.customer_name ?? '—'}</TableCell>
              <TableCell className="hidden truncate uppercase sm:table-cell">{invoice.payment_method}</TableCell>
              <TableCell className="text-right">{invoice.total_amount.toFixed(2)}</TableCell>
              <TableCell className="truncate">
                <Badge variant="outline" className={invoiceStatusBadgeClassName(invoice.status)}>
                  {invoiceStatusLabel(invoice.status)}
                </Badge>
              </TableCell>
              <TableCell className="hidden truncate text-muted-foreground sm:table-cell">{new Date(invoice.created_at).toLocaleString()}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`View invoice ${invoice.invoice_number}`}
                    onClick={() => setViewInvoiceId(invoice.id)}
                  >
                    <Eye className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Print invoice ${invoice.invoice_number}`}
                    onClick={() => window.open(`/invoices/${invoice.id}/print`, '_blank', 'noopener,noreferrer')}
                  >
                    <Printer className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Download invoice ${invoice.invoice_number} as PDF`}
                    onClick={() => handleDownloadPdf(invoice.id, invoice.invoice_number)}
                  >
                    <Download className="size-4" />
                  </Button>
                  {canReturn && (invoice.status === 'paid' || invoice.status === 'partial') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Return items for invoice ${invoice.invoice_number}`}
                      onClick={() => setReturnInvoiceId(invoice.id)}
                    >
                      <Undo2 className="size-4" />
                    </Button>
                  )}
                  {canVoid && invoice.status !== 'cancelled' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      aria-label={`Void invoice ${invoice.invoice_number}`}
                      onClick={() => voidMutation.mutate(invoice.id)}
                    >
                      <Ban className="size-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ModulePage>
    <ViewInvoiceDialog invoiceId={viewInvoiceId} onClose={() => setViewInvoiceId(null)} />
    <ReturnDialog
      invoiceId={returnInvoiceId}
      onClose={() => setReturnInvoiceId(null)}
      onSuccess={() => queryClient.invalidateQueries({ queryKey: ['invoices'] })}
    />
    </>
  );
}
