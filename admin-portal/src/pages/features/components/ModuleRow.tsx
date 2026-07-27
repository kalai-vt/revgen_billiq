import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, History, Settings2, ShieldAlert, MoreHorizontal, PauseCircle } from 'lucide-react';
import { Badge } from '@shared/components/ui/badge';
import { Switch } from '@shared/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@shared/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@shared/components/ui/tooltip';
import { ApiError } from '@/lib/api-client';
import {
  getFeatureImpact,
  updateFeatureFlag,
  type FeatureImpact,
  type FlagStatus,
  type TenantFeatureItem,
} from '@/services/featuresApi';
import { ConfirmImpactDialog } from './ConfirmImpactDialog';

interface ModuleRowProps {
  tenantId: string;
  item: TenantFeatureItem;
  allItems: TenantFeatureItem[];
  onOpenConfig: (item: TenantFeatureItem) => void;
  onOpenSchedule: (item: TenantFeatureItem) => void;
  onOpenHistory: (item: TenantFeatureItem) => void;
}

function formatDate(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ModuleRow({ tenantId, item, allItems, onOpenConfig, onOpenSchedule, onOpenHistory }: ModuleRowProps) {
  const queryClient = useQueryClient();
  const [pendingImpact, setPendingImpact] = useState<{ target: FlagStatus; impact: FeatureImpact } | null>(null);
  const [checkingImpact, setCheckingImpact] = useState(false);

  const byKey = new Map(allItems.map((i) => [i.module_key, i]));
  const missingRequirement = item.requires.find((key) => byKey.get(key)?.status !== 'enabled');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-features', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['admin-feature-history', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['admin-feature-customers'] });
    queryClient.invalidateQueries({ queryKey: ['admin-feature-summary'] });
  };

  const applyMutation = useMutation({
    mutationFn: (vars: { status: FlagStatus; reason?: string; force?: boolean }) =>
      updateFeatureFlag(tenantId, item.module_key, { status: vars.status, reason: vars.reason, force: vars.force }),
    onSuccess: (_data, vars) => {
      toast.success(`${item.label} ${vars.status} — takes effect immediately, no deployment needed`);
      invalidate();
      setPendingImpact(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update this module'),
  });

  async function handleStatusChange(target: FlagStatus) {
    if (target === 'enabled') {
      applyMutation.mutate({ status: target });
      return;
    }
    setCheckingImpact(true);
    try {
      const impact = await getFeatureImpact(tenantId, item.module_key, target);
      if (impact.blocked) {
        toast.error(impact.block_reason ?? "This change isn't allowed.");
        return;
      }
      if (impact.requires_confirmation) {
        setPendingImpact({ target, impact });
        return;
      }
      applyMutation.mutate({ status: target });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not check impact');
    } finally {
      setCheckingImpact(false);
    }
  }

  const statusBadge =
    item.status === 'enabled' ? (
      <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        Enabled
      </Badge>
    ) : item.status === 'suspended' ? (
      <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
        Suspended
      </Badge>
    ) : (
      <Badge variant="outline" className="text-muted-foreground">
        Disabled
      </Badge>
    );

  return (
    <div className="flex items-start justify-between gap-3 border-b px-3 py-3 last:border-b-0">
      <div className="flex flex-1 items-start gap-3">
        <Switch
          checked={item.status === 'enabled'}
          disabled={item.always_on || applyMutation.isPending || checkingImpact}
          onCheckedChange={(checked) => handleStatusChange(checked ? 'enabled' : 'disabled')}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{item.label}</span>
            {statusBadge}
            {item.is_custom && (
              <Badge variant="outline" className="text-muted-foreground">
                Custom
              </Badge>
            )}
            {item.access_level === 'read_only' && <Badge variant="outline">Read only</Badge>}
            {item.hidden_from_nav && <Badge variant="outline">Hidden from nav</Badge>}
            {item.version_gated && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="destructive">Needs v{item.min_version}+</Badge>
                </TooltipTrigger>
                <TooltipContent>Tenant's app version is below this module's minimum.</TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{item.description}</p>
          {item.requires.length > 0 && (
            <p className={`flex items-center gap-1 text-xs ${missingRequirement ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
              <ShieldAlert className="size-3" />
              Requires: {item.requires.map((k) => byKey.get(k)?.label ?? k).join(', ')}
            </p>
          )}
          {item.updated_by_admin_name && (
            <p className="text-xs text-muted-foreground">
              Last modified by {item.updated_by_admin_name}
              {item.updated_at && ` on ${formatDate(item.updated_at)}`}
              {item.reason && ` — "${item.reason}"`}
            </p>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger>
          <span className="flex size-7 items-center justify-center rounded-md hover:bg-muted">
            <MoreHorizontal className="size-4" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onOpenConfig(item)}>
            <Settings2 className="size-4" /> Configure
          </DropdownMenuItem>
          {!item.always_on && item.status !== 'suspended' && (
            <DropdownMenuItem onClick={() => handleStatusChange('suspended')}>
              <PauseCircle className="size-4" /> Suspend temporarily
            </DropdownMenuItem>
          )}
          {item.status === 'suspended' && (
            <DropdownMenuItem onClick={() => handleStatusChange('enabled')}>
              <PauseCircle className="size-4" /> Resume
            </DropdownMenuItem>
          )}
          {!item.always_on && (
            <DropdownMenuItem onClick={() => onOpenSchedule(item)}>
              <Clock className="size-4" /> Schedule change
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onOpenHistory(item)}>
            <History className="size-4" /> View history
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {pendingImpact && (
        <ConfirmImpactDialog
          open
          moduleLabel={item.label}
          targetLabel={pendingImpact.target === 'suspended' ? 'Suspend' : 'Disable'}
          impact={pendingImpact.impact}
          dependentLabels={pendingImpact.impact.affected_dependents.map((k) => byKey.get(k)?.label ?? k)}
          pending={applyMutation.isPending}
          onCancel={() => setPendingImpact(null)}
          onConfirm={(reason) => applyMutation.mutate({ status: pendingImpact.target, reason: reason || undefined, force: true })}
        />
      )}
    </div>
  );
}
