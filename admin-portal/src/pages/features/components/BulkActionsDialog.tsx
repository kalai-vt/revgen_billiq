import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/components/ui/tabs';
import { ApiError } from '@/lib/api-client';
import {
  assignTemplate,
  bulkUpdateFeature,
  getCatalog,
  listTemplates,
  type BulkUpdateResult,
  type FlagStatus,
} from '@/services/featuresApi';

interface BulkActionsDialogProps {
  tenantIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

interface CatalogModule {
  key: string;
  label: string;
  always_on: boolean;
}

export function BulkActionsDialog({ tenantIds, open, onOpenChange, onDone }: BulkActionsDialogProps) {
  const queryClient = useQueryClient();
  const [moduleKey, setModuleKey] = useState('');
  const [status, setStatus] = useState<FlagStatus>('enabled');
  const [templateId, setTemplateId] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<BulkUpdateResult | null>(null);

  const { data: catalog } = useQuery({ queryKey: ['admin-feature-catalog'], queryFn: getCatalog, enabled: open });
  const { data: templates } = useQuery({ queryKey: ['admin-feature-templates'], queryFn: listTemplates, enabled: open });
  const modules = ((catalog?.modules as CatalogModule[]) ?? []).filter((m) => !m.always_on);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['admin-feature-customers'] });
    queryClient.invalidateQueries({ queryKey: ['admin-feature-summary'] });
    queryClient.invalidateQueries({ queryKey: ['admin-features'] });
  }

  const moduleMutation = useMutation({
    mutationFn: () => bulkUpdateFeature(tenantIds, moduleKey, status, reason || undefined),
    onSuccess: (res) => {
      setResult(res);
      toast.success(`Applied to ${res.updated.length} of ${tenantIds.length} customers`);
      invalidateAll();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Bulk update failed'),
  });

  const templateMutation = useMutation({
    mutationFn: () => assignTemplate(templateId, tenantIds, reason || undefined),
    onSuccess: (res) => {
      setResult(res);
      toast.success(`Template applied to ${res.updated.length} of ${tenantIds.length} customers`);
      invalidateAll();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Template assignment failed'),
  });

  function handleClose(next: boolean) {
    if (!next) {
      setResult(null);
      setReason('');
      if (result) onDone();
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk feature management</DialogTitle>
          <DialogDescription>Applies to {tenantIds.length} selected customer{tenantIds.length === 1 ? '' : 's'}.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="module">
          <TabsList>
            <TabsTrigger value="module">Toggle a module</TabsTrigger>
            <TabsTrigger value="template">Apply a template</TabsTrigger>
          </TabsList>

          <TabsContent value="module" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Module</Label>
                <Select value={moduleKey} onValueChange={(v) => setModuleKey(v ?? '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: string) => modules.find((m) => m.key === v)?.label ?? 'Choose module'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {modules.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Action</Label>
                <Select value={status} onValueChange={(v) => setStatus((v as FlagStatus) ?? 'enabled')}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: string) => (v === 'enabled' ? 'Enable' : v === 'suspended' ? 'Suspend' : 'Disable')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enabled">Enable</SelectItem>
                    <SelectItem value="disabled">Disable</SelectItem>
                    <SelectItem value="suspended">Suspend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Plan-wide rollout" />
            </div>
            <Button className="w-full" onClick={() => moduleMutation.mutate()} disabled={!moduleKey || moduleMutation.isPending}>
              {moduleMutation.isPending ? 'Applying…' : `Apply to ${tenantIds.length} customers`}
            </Button>
          </TabsContent>

          <TabsContent value="template" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Template</Label>
              <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string) => templates?.find((t) => t.id === v)?.name ?? 'Choose template'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {templates?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Migrating to Retail Premium" />
            </div>
            <Button className="w-full" onClick={() => templateMutation.mutate()} disabled={!templateId || templateMutation.isPending}>
              {templateMutation.isPending ? 'Applying…' : `Apply to ${tenantIds.length} customers`}
            </Button>
          </TabsContent>
        </Tabs>

        {result && (
          <div className="rounded-lg border p-2.5 text-xs">
            <p className="font-medium">{result.updated.length} updated{result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : ''}</p>
            {result.skipped.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {result.skipped.map((s) => (
                  <li key={s.tenant_id}>{s.tenant_id}: {s.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
