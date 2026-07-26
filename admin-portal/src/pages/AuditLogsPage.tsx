import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@shared/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/components/ui/table';
import { listAuditActions, listAuditLogs } from '@/services/auditApi';

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function AuditLogsPage() {
  const [action, setAction] = useState('all');

  const { data: actions } = useQuery({ queryKey: ['admin-audit-actions'], queryFn: listAuditActions });
  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit-logs', action],
    queryFn: () => listAuditLogs({ action: action === 'all' ? undefined : action, limit: 100 }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Every admin action across the platform, in order.</p>
      </div>

      <Select value={action} onValueChange={(value) => setAction(value ?? 'all')}>
        <SelectTrigger className="w-full sm:w-64">
          <SelectValue>{(value: string) => (value === 'all' ? 'All actions' : value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All actions</SelectItem>
          {actions?.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading || !data ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No audit log entries yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(row.created_at)}</TableCell>
                    <TableCell>{row.admin_user_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.action}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.target_type ? `${row.target_type}${row.target_id ? ` · ${row.target_id.slice(0, 8)}…` : ''}` : '—'}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {row.details ? JSON.stringify(row.details) : '—'}
                    </TableCell>
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
