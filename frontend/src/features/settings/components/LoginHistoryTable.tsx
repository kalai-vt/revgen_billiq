import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as authApi from '@/features/auth/api';

const PAGE_SIZE = 10;

const EVENT_LABELS: Record<string, string> = {
  login_success: 'Signed in',
  logout: 'Signed out',
  failed_login: 'Failed sign-in attempt',
};

export function LoginHistoryTable() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['login-history', page],
    queryFn: () => authApi.getLoginHistory(page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={2}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={2}>
                  <EmptyState icon={History} title="No login activity yet" />
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((entry, index) => (
              <TableRow key={`${entry.created_at}-${index}`}>
                <TableCell>{EVENT_LABELS[entry.event_type] ?? entry.event_type}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
