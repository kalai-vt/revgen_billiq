import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Eye, Printer, Receipt, Search, Undo2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import { ExportDropdown, type ExportFormat } from '@/components/shared/ExportDropdown';
import * as authApi from '@/features/auth/api';
import * as posApi from '@/features/pos/api';
import { REFUND_METHOD_LABELS, REFUND_METHODS } from '@/features/pos/api';
import type { RefundMethod } from '@/features/pos/api';
import { ReturnDetailsDialog } from '@/features/pos/components/ReturnDetailsDialog';
import { ReturnsKpiCards } from '@/features/pos/components/ReturnsKpiCards';
import { returnStatusBadgeClassName, returnStatusLabel } from '@/features/pos/lib/returnStatus';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/lib/api-client';
import { downloadBlob } from '@/lib/download-blob';

const PAGE_SIZE = 20;

const EXPORT_FILENAMES: Record<ExportFormat, string> = {
  excel: 'returns.xlsx',
  pdf: 'returns.pdf',
  csv: 'returns.csv',
};

type StatusFilter = 'all' | 'fully_refunded' | 'partially_refunded' | 'cancelled';
type RefundMethodFilter = 'all' | RefundMethod;
type SortValue = 'created_at:desc' | 'created_at:asc' | 'refund_amount:desc' | 'refund_amount:asc' | 'return_number:asc' | 'return_number:desc';

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All statuses',
  fully_refunded: 'Fully Refunded',
  partially_refunded: 'Partially Refunded',
  cancelled: 'Cancelled',
};

const SORT_LABELS: Record<SortValue, string> = {
  'created_at:desc': 'Newest first',
  'created_at:asc': 'Oldest first',
  'refund_amount:desc': 'Refund: high to low',
  'refund_amount:asc': 'Refund: low to high',
  'return_number:asc': 'Return #: A to Z',
  'return_number:desc': 'Return #: Z to A',
};

export function ReturnHistoryPage() {
  const { user } = useAuth();
  const canCancel = user?.role === 'owner' || user?.role === 'manager';
  const queryClient = useQueryClient();

  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [refundMethod, setRefundMethod] = useState<RefundMethodFilter>('all');
  const [cashier, setCashier] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<SortValue>('created_at:desc');
  const [page, setPage] = useState(1);
  const [viewReturnId, setViewReturnId] = useState<string | null>(null);
  const [cancelReturnId, setCancelReturnId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    setPage(1);
  }, [status, refundMethod, cashier, dateFrom, dateTo, sort]);

  const [sortBy, sortDir] = sort.split(':') as ['created_at' | 'refund_amount' | 'return_number', 'asc' | 'desc'];

  function handleSort(field: 'created_at' | 'refund_amount' | 'return_number') {
    const nextDir = field === sortBy ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    setSort(`${field}:${nextDir}` as SortValue);
  }

  const { data: dashboard } = useQuery({
    queryKey: ['returns-dashboard'],
    queryFn: () => posApi.getReturnsDashboard(),
  });

  const { data: team } = useQuery({ queryKey: ['team-members'], queryFn: () => authApi.listTeamMembers() });

  const { data, isLoading } = useQuery({
    queryKey: ['returns', page, q, status, refundMethod, cashier, dateFrom, dateTo, sort],
    queryFn: () =>
      posApi.listReturns({
        page,
        page_size: PAGE_SIZE,
        q: q || undefined,
        status: status === 'all' ? undefined : status,
        refund_method: refundMethod === 'all' ? undefined : refundMethod,
        created_by: cashier === 'all' ? undefined : cashier,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      }),
    placeholderData: keepPreviousData,
  });

  const cancelMutation = useMutation({
    mutationFn: () => posApi.cancelReturn(cancelReturnId!, cancelReason),
    onSuccess: () => {
      toast.success('Return cancelled');
      queryClient.invalidateQueries({ queryKey: ['returns'] });
      queryClient.invalidateQueries({ queryKey: ['returns-dashboard'] });
      setCancelReturnId(null);
      setCancelReason('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  async function handleDownloadPdf(id: string, returnNumber: string) {
    try {
      const blob = await posApi.downloadReturnPdf(id);
      downloadBlob(blob, `${returnNumber}.pdf`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not download PDF');
    }
  }

  async function handleExport(format: ExportFormat) {
    try {
      const blob = await posApi.exportReturns(format, {
        q: q || undefined,
        status: status === 'all' ? undefined : status,
        refund_method: refundMethod === 'all' ? undefined : refundMethod,
        created_by: cashier === 'all' ? undefined : cashier,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      downloadBlob(blob, EXPORT_FILENAMES[format]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not export returns');
    }
  }

  return (
    <>
      <ModulePage
        header={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Returns</h1>
              <p className="text-sm text-muted-foreground">Every return and refund processed against an invoice.</p>
            </div>
            <ExportDropdown onExport={handleExport} />
          </div>
        }
        bodyClassName="space-y-4 border-0 p-0 overflow-visible"
      >
        <div className="space-y-4">
          {dashboard && <ReturnsKpiCards dashboard={dashboard} />}

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by return #, invoice #, or customer…"
                className="pl-8"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
              <SelectTrigger className="lg:w-44">
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
            <Select value={refundMethod} onValueChange={(value) => setRefundMethod(value as RefundMethodFilter)}>
              <SelectTrigger className="lg:w-40">
                <SelectValue>
                  {(value: string | null) =>
                    value === 'all' || !value ? 'All methods' : REFUND_METHOD_LABELS[value as RefundMethod]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                {REFUND_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {REFUND_METHOD_LABELS[method]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={cashier} onValueChange={(value) => setCashier(value ?? 'all')}>
              <SelectTrigger className="lg:w-40">
                <SelectValue>
                  {(value: string | null) => {
                    if (value === 'all' || !value) return 'All cashiers';
                    const member = team?.items.find((m) => m.id === value);
                    return member ? `${member.first_name} ${member.last_name}` : 'All cashiers';
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cashiers</SelectItem>
                {team?.items.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.first_name} {member.last_name}
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

          <div className="rounded-md border">
            <Table containerClassName="overflow-x-visible overflow-y-visible">
              <TableHeader>
                <TableRow>
                  <SortableTableHead field="return_number" sortBy={sortBy} sortDir={sortDir} onSort={handleSort}>
                    Return #
                  </SortableTableHead>
                  <TableHead className="hidden sm:table-cell">Invoice #</TableHead>
                  <TableHead className="hidden md:table-cell">Customer</TableHead>
                  <TableHead className="hidden lg:table-cell">Items</TableHead>
                  <SortableTableHead field="refund_amount" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-right">
                    Refund
                  </SortableTableHead>
                  <TableHead className="hidden md:table-cell">Refund Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Processed By</TableHead>
                  <SortableTableHead field="created_at" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell">
                    Date
                  </SortableTableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={10}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoading && data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <EmptyState
                        icon={Undo2}
                        title="No returns have been processed yet."
                        description="Returns always start from an invoice — open an invoice and use its Return action."
                        action={
                          <Button size="sm" nativeButton={false} render={<Link to="/invoices" />}>
                            <Receipt className="size-4" />
                            View Invoices
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
                {data?.items.map((ret) => (
                  <TableRow key={ret.id}>
                    <TableCell className="font-medium">{ret.return_number}</TableCell>
                    <TableCell className="hidden sm:table-cell">{ret.invoice_number}</TableCell>
                    <TableCell className="hidden max-w-[140px] truncate md:table-cell">{ret.customer_name ?? 'Walk-in'}</TableCell>
                    <TableCell className="hidden max-w-[200px] truncate text-muted-foreground lg:table-cell">
                      {ret.items.map((item) => `${item.product_name} ×${item.quantity_returned}`).join(', ')}
                    </TableCell>
                    <TableCell className="text-right font-medium">{ret.refund_amount.toFixed(2)}</TableCell>
                    <TableCell className="hidden uppercase text-muted-foreground md:table-cell">{ret.refund_method}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={returnStatusBadgeClassName(ret.status)}>
                        {returnStatusLabel(ret.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{ret.created_by_name}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{new Date(ret.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <IconButton
                          tooltip="View Return"
                          className="size-8"
                          aria-label={`View return ${ret.return_number}`}
                          onClick={() => setViewReturnId(ret.id)}
                        >
                          <Eye className="size-4" />
                        </IconButton>
                        <IconButton
                          tooltip="Print Return"
                          className="size-8"
                          aria-label={`Print return ${ret.return_number}`}
                          onClick={() => window.open(`/returns/${ret.id}/print`, '_blank', 'noopener,noreferrer')}
                        >
                          <Printer className="size-4" />
                        </IconButton>
                        <IconButton
                          tooltip="Download PDF"
                          className="size-8"
                          aria-label={`Download return ${ret.return_number} as PDF`}
                          onClick={() => handleDownloadPdf(ret.id, ret.return_number)}
                        >
                          <Download className="size-4" />
                        </IconButton>
                        {canCancel && ret.status !== 'cancelled' && (
                          <IconButton
                            tooltip="Cancel Return"
                            className="size-8 text-destructive"
                            aria-label={`Cancel return ${ret.return_number}`}
                            onClick={() => setCancelReturnId(ret.id)}
                          >
                            <X className="size-4" />
                          </IconButton>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="return" />
        </div>
      </ModulePage>

      <ReturnDetailsDialog returnId={viewReturnId} onClose={() => setViewReturnId(null)} />

      <ConfirmationDialog
        open={!!cancelReturnId}
        onOpenChange={(open) => {
          if (!open) {
            setCancelReturnId(null);
            setCancelReason('');
          }
        }}
        title="Cancel this return?"
        description="This reverses the refund's inventory changes and restores the invoice's returnable quantity. This cannot be undone."
        confirmLabel="Cancel Return"
        destructive
        isConfirming={cancelMutation.isPending}
        onConfirm={() => cancelReason.trim() && cancelMutation.mutate()}
      >
        <Input
          placeholder="Reason for cancelling (required)"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
      </ConfirmationDialog>
    </>
  );
}
