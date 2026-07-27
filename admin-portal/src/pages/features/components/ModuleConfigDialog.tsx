import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import { Input } from '@shared/components/ui/input';
import { NumericInput } from '@shared/components/ui/numeric-input';
import { Switch } from '@shared/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { ApiError } from '@/lib/api-client';
import { updateFeatureFlag, type AccessLevel, type TenantFeatureItem } from '@/services/featuresApi';

interface ModuleConfigDialogProps {
  tenantId: string;
  item: TenantFeatureItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModuleConfigDialog({ tenantId, item, open, onOpenChange }: ModuleConfigDialogProps) {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<Record<string, unknown>>(item.config ?? {});
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(item.access_level);
  const [hiddenFromNav, setHiddenFromNav] = useState(item.hidden_from_nav);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setConfig(item.config ?? {});
      setAccessLevel(item.access_level);
      setHiddenFromNav(item.hidden_from_nav);
      setReason('');
    }
  }, [open, item]);

  const dirty =
    JSON.stringify(config) !== JSON.stringify(item.config ?? {}) ||
    accessLevel !== item.access_level ||
    hiddenFromNav !== item.hidden_from_nav;

  const saveMutation = useMutation({
    mutationFn: () =>
      updateFeatureFlag(tenantId, item.module_key, {
        config,
        access_level: accessLevel,
        hidden_from_nav: hiddenFromNav,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      toast.success(`${item.label} settings saved — live immediately`);
      queryClient.invalidateQueries({ queryKey: ['admin-features', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['admin-feature-history', tenantId] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not save settings'),
  });

  function handleOpenChange(next: boolean) {
    if (!next && dirty && !window.confirm('You have unsaved changes to this module. Discard them?')) {
      return;
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item.label} settings</DialogTitle>
          <DialogDescription>{item.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Access level</Label>
              <Select value={accessLevel} onValueChange={(v) => setAccessLevel((v as AccessLevel) ?? 'full_access')}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string) => (v === 'read_only' ? 'Read only' : 'Full access')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_access">Full access</SelectItem>
                  <SelectItem value="read_only">Read only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Navigation</Label>
              <div className="flex h-8 items-center gap-2">
                <Switch checked={hiddenFromNav} onCheckedChange={(c) => setHiddenFromNav(c === true)} />
                <span className="text-sm text-muted-foreground">Hide from nav</span>
              </div>
            </div>
          </div>

          {item.config_schema.length > 0 && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground">Module configuration</p>
              {item.config_schema.map((field) => (
                <div key={field.key} className="flex items-center justify-between gap-3">
                  <Label htmlFor={`cfg-${field.key}`} className="text-sm font-normal">
                    {field.label}
                  </Label>
                  {field.type === 'boolean' ? (
                    <Switch
                      id={`cfg-${field.key}`}
                      checked={Boolean(config[field.key] ?? field.default)}
                      onCheckedChange={(c) => setConfig((prev) => ({ ...prev, [field.key]: c === true }))}
                    />
                  ) : field.type === 'number' ? (
                    <NumericInput
                      className="w-28"
                      value={(config[field.key] as number) ?? (field.default as number) ?? 0}
                      onChange={(v) => setConfig((prev) => ({ ...prev, [field.key]: v }))}
                      min={0}
                      allowDecimal={false}
                    />
                  ) : (
                    <Input
                      id={`cfg-${field.key}`}
                      className="w-40"
                      value={(config[field.key] as string) ?? (field.default as string) ?? ''}
                      onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reason" className="text-xs">
              Reason (optional, recorded in the audit trail)
            </Label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Requested by customer support" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
