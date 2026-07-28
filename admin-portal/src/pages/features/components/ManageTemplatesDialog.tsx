import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent, CardHeader } from '@shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@shared/components/ui/dialog';
import { EmptyState } from '@shared/components/ui/empty-state';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Checkbox } from '@shared/components/ui/checkbox';
import { ApiError } from '@/lib/api-client';
import { createTemplate, deleteTemplate, getCatalog, listTemplates, type FeatureTemplateModule } from '@/services/featuresApi';

interface CatalogModule {
  key: string;
  label: string;
  category: string;
  always_on: boolean;
}

function CreateTemplateDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: catalog } = useQuery({ queryKey: ['admin-feature-catalog'], queryFn: getCatalog, enabled: open });
  const modules = (catalog?.modules as CatalogModule[]) ?? [];

  const createMutation = useMutation({
    mutationFn: () => {
      const moduleList: FeatureTemplateModule[] = modules
        .filter((m) => !m.always_on)
        .map((m) => ({ module_key: m.key, status: selected.has(m.key) ? 'enabled' : 'disabled', config: null }));
      return createTemplate(name, description || undefined, moduleList);
    },
    onSuccess: () => {
      toast.success('Template created');
      queryClient.invalidateQueries({ queryKey: ['admin-feature-templates'] });
      setOpen(false);
      setName('');
      setDescription('');
      setSelected(new Set());
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not create template'),
  });

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm">
          <Plus className="size-3.5" /> New template
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New feature template</DialogTitle>
          <DialogDescription>Reusable module sets you can one-click assign to any customer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wholesale Plus" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
            {modules
              .filter((m) => !m.always_on)
              .map((m) => (
                <label key={m.key} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60">
                  <Checkbox checked={selected.has(m.key)} onCheckedChange={() => toggle(m.key)} />
                  {m.label}
                </label>
              ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ManageTemplatesDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: templates, isLoading } = useQuery({ queryKey: ['admin-feature-templates'], queryFn: listTemplates, enabled: open });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      toast.success('Template deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-feature-templates'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not delete template'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm">
          <Layers className="size-3.5" /> Manage bundle templates
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bundle templates</DialogTitle>
          <DialogDescription>
            One-click module presets. Apply one to selected customers from the bulk actions dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end">
          <CreateTemplateDialog />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : !templates || templates.length === 0 ? (
          <EmptyState icon={Layers} title="No templates yet" description="Create one to speed up onboarding similar customers." />
        ) : (
          <div className="grid max-h-96 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
            {templates.map((template) => {
              const enabledCount = template.modules.filter((m) => m.status === 'enabled').length;
              return (
                <Card key={template.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 pb-0">
                    <div>
                      <p className="font-medium">{template.name}</p>
                      {template.is_system && (
                        <Badge variant="outline" className="mt-1 text-muted-foreground">
                          System
                        </Badge>
                      )}
                    </div>
                    {!template.is_system && (
                      <Button variant="ghost" size="icon-sm" onClick={() => deleteMutation.mutate(template.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-sm">
                    <p className="text-muted-foreground">{template.description ?? 'No description'}</p>
                    <p className="text-xs text-muted-foreground">{enabledCount} modules enabled</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
