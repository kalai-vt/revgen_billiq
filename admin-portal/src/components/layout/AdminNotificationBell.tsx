import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@shared/components/ui/popover';
import { getUnreadCount, listNotifications, markNotificationRead } from '@/services/notificationsApi';
import { cn } from '@/lib/utils';

export function AdminNotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: unread } = useQuery({
    queryKey: ['admin-notifications-unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
  });
  const { data: notifications } = useQuery({ queryKey: ['admin-notifications-preview'], queryFn: listNotifications });

  const count = unread?.count ?? 0;

  async function handleOpenNotification(id: string, tenantId: string | null) {
    await markNotificationRead(id);
    queryClient.invalidateQueries({ queryKey: ['admin-notifications-unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['admin-notifications-preview'] });
    if (tenantId) navigate(`/customers/${tenantId}`);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
            <Bell className="size-5" />
            {count > 0 && (
              <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                {count > 9 ? '9+' : count}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate('/notifications')}>
            View all
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {!notifications || notifications.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            notifications.slice(0, 6).map((n) => (
              <button
                key={n.id}
                onClick={() => handleOpenNotification(n.id, n.tenant_id)}
                className={cn(
                  'block w-full border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/70',
                  !n.is_read && 'bg-muted/40',
                )}
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
