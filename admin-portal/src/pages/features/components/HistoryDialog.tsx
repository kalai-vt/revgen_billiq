import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@shared/components/ui/dialog';
import { EmptyState } from '@shared/components/ui/empty-state';
import { Skeleton } from '@shared/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { getFeatureHistory, rollbackFeature } from '@/services/featuresApi';

interface HistoryDialogProps {
  tenantId: string;
  moduleKey?: string;
  moduleLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const ACTION_LABEL: Record<string, string> = {
  enabled: 'Enabled',
  disabled: 'Disabled',
  suspended: 'Suspended',
  config_updated: 'Settings changed',
  hidden_from_nav: 'Hidden from navigation',
  shown_in_nav: 'Shown in navigation',
  access_level_changed: 'Access level changed',
  reset_to_default: 'Reset to plan default',
  rollback: 'Rolled back',
};

export function HistoryDialog({ tenantId, moduleKey, moduleLabel, open, onOpenChange }: HistoryDialogProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-feature-history', tenantId, moduleKey],
    queryFn: () => getFeatureHistory(tenantId, moduleKey),
    enabled: open,
  });

  const rollbackMutation = useMutation({
    mutationFn: (historyId: string) => rollbackFeature(tenantId, historyId),
    onSuccess: () => {
      toast.success('Rolled back to the previous configuration');
      queryClient.invalidateQueries({ queryKey: ['admin-features', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['admin-feature-history', tenantId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not roll back'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{moduleLabel ? `History — ${moduleLabel}` : 'Feature change history'}</DialogTitle>
          <DialogDescription>Every enable, disable, and configuration change, newest first.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
          ) : !data || data.length === 0 ? (
            <EmptyState title="No history yet" description="Changes to this module will show up here." />
          ) : (
            data.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-2 rounded-lg border p-2.5 text-sm">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">{ACTION_LABEL[entry.action] ?? entry.action}</Badge>
                    {!moduleKey && <span className="text-xs font-medium">{entry.module_key}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {entry.changed_by_admin_name} · {formatDate(entry.created_at)}
                  </p>
                  {entry.reason && <p className="text-xs italic text-muted-foreground">"{entry.reason}"</p>}
                </div>
                {entry.previous_state && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => rollbackMutation.mutate(entry.id)}
                    disabled={rollbackMutation.isPending}
                  >
                    <RotateCcw className="size-3.5" /> Rollback
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
