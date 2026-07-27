import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, X } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/components/ui/dialog';
import { Label } from '@shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Skeleton } from '@shared/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { cancelSchedule, createSchedule, listSchedules, type FlagStatus, type TenantFeatureItem } from '@/services/featuresApi';

interface ScheduleDialogProps {
  tenantId: string;
  item: TenantFeatureItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function defaultDateTime(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const STATUS_LABEL: Record<string, string> = { enabled: 'Enable', disabled: 'Disable', suspended: 'Suspend' };

export function ScheduleDialog({ tenantId, item, open, onOpenChange }: ScheduleDialogProps) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<FlagStatus>('enabled');
  const [when, setWhen] = useState(defaultDateTime());

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['admin-feature-schedules', tenantId],
    queryFn: () => listSchedules(tenantId),
    enabled: open,
  });

  const moduleSchedules = (schedules ?? []).filter((s) => s.module_key === item.module_key && s.status === 'pending');

  const createMutation = useMutation({
    mutationFn: () => createSchedule(tenantId, item.module_key, action, new Date(when).toISOString()),
    onSuccess: () => {
      toast.success(`${STATUS_LABEL[action]} scheduled for ${new Date(when).toLocaleString()}`);
      queryClient.invalidateQueries({ queryKey: ['admin-feature-schedules', tenantId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not create schedule'),
  });

  const cancelMutation = useMutation({
    mutationFn: (scheduleId: string) => cancelSchedule(tenantId, scheduleId),
    onSuccess: () => {
      toast.success('Schedule cancelled');
      queryClient.invalidateQueries({ queryKey: ['admin-feature-schedules', tenantId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not cancel schedule'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule a change — {item.label}</DialogTitle>
          <DialogDescription>The change applies automatically at the scheduled time; no manual action needed.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Action</Label>
              <Select value={action} onValueChange={(v) => setAction((v as FlagStatus) ?? 'enabled')}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string) => STATUS_LABEL[v] ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled">Enable</SelectItem>
                  <SelectItem value="disabled">Disable</SelectItem>
                  <SelectItem value="suspended">Suspend</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-when" className="text-xs">
                Date &amp; time
              </Label>
              <input
                id="schedule-when"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Pending schedules for this module</p>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : moduleSchedules.length === 0 ? (
              <p className="text-xs text-muted-foreground">None yet.</p>
            ) : (
              <div className="space-y-1.5">
                {moduleSchedules.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="size-3.5 text-muted-foreground" />
                      {STATUS_LABEL[s.action] ?? s.action} on {new Date(s.scheduled_for).toLocaleString()}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => cancelMutation.mutate(s.id)}
                      disabled={cancelMutation.isPending}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Scheduling…' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
