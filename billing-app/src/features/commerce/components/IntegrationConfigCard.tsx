import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, RefreshCw, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import * as commerceApi from '@/features/commerce/api';
import type { CommercePlatform, IntegrationMode } from '@/features/commerce/api';
import { ApiError } from '@/lib/api-client';

const PLATFORM_LABELS: Record<CommercePlatform, string> = { swiggy: 'Swiggy', zomato: 'Zomato' };

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  not_connected: { label: 'Not Connected', className: 'bg-muted text-muted-foreground' },
  pending_partner_approval: { label: 'Pending Partner Approval', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  connected: { label: 'Connected', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  error: { label: 'Error', className: 'bg-destructive/10 text-destructive' },
};

interface IntegrationConfigCardProps {
  platform: CommercePlatform;
}

export function IntegrationConfigCard({ platform }: IntegrationConfigCardProps) {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ['commerce-config', platform],
    queryFn: () => commerceApi.getConfig(platform),
  });

  const [storeName, setStoreName] = useState('');
  const [storeId, setStoreId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [mode, setMode] = useState<IntegrationMode>('mock');
  const [autoInvoice, setAutoInvoice] = useState(true);

  useEffect(() => {
    if (config) {
      setStoreName(config.store_name ?? '');
      setStoreId(config.store_id ?? '');
      setMode(config.mode);
      setAutoInvoice(config.auto_create_invoice);
      setApiKey('');
      setApiSecret('');
    }
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: (payload: commerceApi.CommerceIntegrationConfigPayload) => commerceApi.updateConfig(platform, payload),
    onSuccess: () => {
      toast.success(`${PLATFORM_LABELS[platform]} settings updated`);
      queryClient.invalidateQueries({ queryKey: ['commerce-config', platform] });
      setApiKey('');
      setApiSecret('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const regenerateMutation = useMutation({
    mutationFn: () => commerceApi.regenerateWebhookToken(platform),
    onSuccess: () => {
      toast.success('Webhook token regenerated');
      queryClient.invalidateQueries({ queryKey: ['commerce-config', platform] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const mockOrderMutation = useMutation({
    mutationFn: () => commerceApi.triggerMockOrder(platform),
    onSuccess: () => {
      toast.success('Mock order created — check Orders to see it come in.');
      queryClient.invalidateQueries({ queryKey: ['commerce-orders'] });
      queryClient.invalidateQueries({ queryKey: ['commerce-dashboard'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function saveField(patch: commerceApi.CommerceIntegrationConfigPayload) {
    updateMutation.mutate(patch);
  }

  function copyWebhookUrl() {
    if (!config) return;
    const url = `${window.location.origin}${config.webhook_path}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Webhook URL copied'));
  }

  if (isLoading || !config) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  const statusBadge = STATUS_BADGE[config.status];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{PLATFORM_LABELS[platform]} Integration</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={statusBadge.className}>
            {statusBadge.label}
          </Badge>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 rounded border-input"
              checked={config.is_enabled}
              onChange={(e) => saveField({ is_enabled: e.target.checked })}
            />
            Enabled
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Real {PLATFORM_LABELS[platform]} connectivity requires their POS-partner approval program — until that's in
          place, keep this in <span className="font-medium">Mock</span> mode. Mock mode lets you fully exercise order
          sync, auto-billing, and analytics today with generated demo orders; switching to Live later is a config
          change only, once partner credentials are issued.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(v) => { const next = (v as IntegrationMode) ?? 'mock'; setMode(next); saveField({ mode: next }); }}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => (mode === 'mock' ? 'Mock (demo orders)' : 'Live (requires partner API)')}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mock">Mock (demo orders)</SelectItem>
                <SelectItem value="live">Live (requires partner API)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${platform}-store-name`}>Store name</Label>
            <Input
              id={`${platform}-store-name`}
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              onBlur={() => saveField({ store_name: storeName || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${platform}-store-id`}>Store ID</Label>
            <Input
              id={`${platform}-store-id`}
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              onBlur={() => saveField({ store_id: storeId || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${platform}-api-key`}>API key {config.has_api_key && <span className="text-muted-foreground">(configured)</span>}</Label>
            <Input
              id={`${platform}-api-key`}
              type="password"
              placeholder={config.has_api_key ? '••••••••' : 'Not set'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={() => apiKey && saveField({ api_key: apiKey })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${platform}-api-secret`}>
              API secret {config.has_api_secret && <span className="text-muted-foreground">(configured)</span>}
            </Label>
            <Input
              id={`${platform}-api-secret`}
              type="password"
              placeholder={config.has_api_secret ? '••••••••' : 'Not set'}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              onBlur={() => apiSecret && saveField({ api_secret: apiSecret })}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={autoInvoice}
                onChange={(e) => { setAutoInvoice(e.target.checked); saveField({ auto_create_invoice: e.target.checked }); }}
              />
              Auto-create invoice for incoming orders
            </label>
          </div>
        </div>

        <div className="space-y-1.5 rounded-md border p-3">
          <Label className="text-xs text-muted-foreground">Webhook URL</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{config.webhook_path}</code>
            <Button type="button" variant="outline" size="icon" className="size-8 shrink-0" onClick={copyWebhookUrl} title="Copy webhook URL">
              <Copy className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
              title="Regenerate webhook token"
            >
              <RefreshCw className={regenerateMutation.isPending ? 'size-4 animate-spin' : 'size-4'} />
            </Button>
          </div>
        </div>

        {mode === 'mock' && config.is_enabled && (
          <Button type="button" variant="outline" size="sm" onClick={() => mockOrderMutation.mutate()} disabled={mockOrderMutation.isPending}>
            <Send className="size-4" />
            {mockOrderMutation.isPending ? 'Sending…' : 'Send test order'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
