import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, CheckCheck, Info, OctagonAlert } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent } from '@shared/components/ui/card';
import { Skeleton } from '@shared/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/services/notificationsApi';

const SEVERITY_ICON: Record<string, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  critical: OctagonAlert,
};

const SEVERITY_CLASS: Record<string, string> = {
  info: 'text-blue-500',
  warning: 'text-amber-500',
  critical: 'text-destructive',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-notifications'], queryFn: listNotifications });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
    queryClient.invalidateQueries({ queryKey: ['admin-notifications-unread-count'] });
  };

  const readMutation = useMutation({ mutationFn: markNotificationRead, onSuccess: invalidate });
  const readAllMutation = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: invalidate });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">System-generated signals worth a look.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => readAllMutation.mutate()}>
          <CheckCheck className="mr-1.5 size-4" />
          Mark all as read
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
          <Bell className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">You're all caught up.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((n) => {
            const Icon = SEVERITY_ICON[n.severity] ?? Info;
            return (
              <Card
                key={n.id}
                className={cn('cursor-pointer transition-colors', !n.is_read && 'bg-muted/40')}
                onClick={() => {
                  if (!n.is_read) readMutation.mutate(n.id);
                  if (n.tenant_id) navigate(`/customers/${n.tenant_id}`);
                }}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <Icon className={cn('mt-0.5 size-5 shrink-0', SEVERITY_CLASS[n.severity])} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{n.title}</p>
                      {!n.is_read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                    </div>
                    <p className="text-sm text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(n.created_at)}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
