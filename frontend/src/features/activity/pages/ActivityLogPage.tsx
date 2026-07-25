import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModulePage } from '@/components/layout/ModulePage';
import { TablePagination } from '@/components/shared/TablePagination';
import * as activityApi from '@/features/activity/api';

const PAGE_SIZE = 20;

type ModuleFilter = 'all' | 'product' | 'inventory' | 'invoice' | 'auth';

const MODULE_LABELS: Record<ModuleFilter, string> = {
  all: 'All modules',
  product: 'Product',
  inventory: 'Inventory',
  invoice: 'Invoice',
  auth: 'Auth',
};

export function ActivityLogPage() {
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [moduleFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['activity-log', page, moduleFilter],
    queryFn: () =>
      activityApi.listActivityLog({
        page,
        page_size: PAGE_SIZE,
        module: moduleFilter === 'all' ? undefined : moduleFilter,
      }),
    placeholderData: keepPreviousData,
  });
  return (
    <ModulePage
      header={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Activity Log</h1>
            <p className="text-sm text-muted-foreground">Every product, inventory, and invoice action across your team.</p>
          </div>
          <Select value={moduleFilter} onValueChange={(value) => setModuleFilter(value as ModuleFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue>{(value: string | null) => MODULE_LABELS[(value as ModuleFilter) ?? 'all']}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MODULE_LABELS) as ModuleFilter[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {MODULE_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
      footer={
        <TablePagination total={data?.total ?? 0} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="entry" itemLabelPlural="entries" />
      }
    >
      <Table containerClassName="overflow-x-visible overflow-y-visible">
        <TableHeader>
          <TableRow>
            <TableHead className="hidden sm:table-cell">Date</TableHead>
            <TableHead className="hidden sm:table-cell">User</TableHead>
            <TableHead className="hidden md:table-cell">Module</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={5}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {!isLoading && data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5}>
                <EmptyState icon={ScrollText} title="No activity yet" description="Product, inventory, and invoice actions across your team will show up here." />
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="hidden text-muted-foreground sm:table-cell">{new Date(entry.created_at).toLocaleString()}</TableCell>
              <TableCell className="hidden sm:table-cell">{entry.user_name}</TableCell>
              <TableCell className="hidden md:table-cell">
                <Badge variant="outline" className="capitalize">
                  {entry.module}
                </Badge>
              </TableCell>
              <TableCell className="capitalize">{entry.action.replace(/_/g, ' ')}</TableCell>
              <TableCell className="max-w-[200px] truncate text-muted-foreground sm:max-w-none sm:overflow-visible sm:whitespace-normal">{entry.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ModulePage>
  );
}
