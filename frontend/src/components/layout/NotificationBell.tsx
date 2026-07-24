import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import * as notificationsApi from '@/features/notifications/api';
import type { Notification } from '@/features/notifications/api';
import { cn } from '@/lib/utils';

const ENTITY_ROUTES: Record<string, string> = {
  Product: '/products',
  Invoice: '/invoices',
  InventoryImportHistory: '/inventory/import-history',
};

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.listNotifications(),
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  function handleClick(notification: Notification) {
    if (!notification.is_read) markReadMutation.mutate(notification.id);
    const route = notification.entity_type ? ENTITY_ROUTES[notification.entity_type] : undefined;
    if (route) navigate(route);
  }

  const unreadCount = data?.unread_count ?? 0;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            className="relative flex size-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
          >
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        }
      />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-2.5">
          <p className="text-sm font-medium">Notifications</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {(data?.items.length ?? 0) === 0 && (
            <EmptyState icon={Bell} title="No notifications yet" description="Low stock, cancellations, and import results will show up here." />
          )}
          {data?.items.map((notification) => (
            <button
              key={notification.id}
              onClick={() => handleClick(notification)}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted',
                !notification.is_read && 'bg-muted/50',
              )}
            >
              <span className="flex w-full items-center gap-1.5 font-medium">
                {!notification.is_read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                {notification.title}
              </span>
              <span className="text-xs text-muted-foreground">{notification.message}</span>
              <span className="text-[11px] text-muted-foreground">
                {new Date(notification.created_at).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
