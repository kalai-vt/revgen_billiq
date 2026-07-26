import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent } from '@shared/components/ui/card';
import { Checkbox } from '@shared/components/ui/checkbox';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Badge } from '@shared/components/ui/badge';
import { getCustomer } from '@/services/customersApi';
import { getFeatureFlags, updateFeatureFlag } from '@/services/featuresApi';
import { ApiError } from '@/lib/api-client';

export function FeatureManagementPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: customer } = useQuery({
    queryKey: ['admin-customer', tenantId],
    queryFn: () => getCustomer(tenantId!),
    enabled: !!tenantId,
  });

  const { data: flags, isLoading } = useQuery({
    queryKey: ['admin-features', tenantId],
    queryFn: () => getFeatureFlags(tenantId!),
    enabled: !!tenantId,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ moduleKey, enabled }: { moduleKey: string; enabled: boolean }) =>
      updateFeatureFlag(tenantId!, moduleKey, enabled),
    onSuccess: () => {
      toast.success('Feature updated — takes effect immediately, no deployment needed');
      queryClient.invalidateQueries({ queryKey: ['admin-features', tenantId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(`/customers/${tenantId}`)}>
        <ArrowLeft className="mr-1.5 size-4" />
        Back to {customer?.company_name ?? 'customer'}
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feature Management</h1>
        <p className="text-sm text-muted-foreground">
          Toggle modules for {customer?.company_name ?? 'this customer'}. Changes apply immediately.
        </p>
      </div>

      {isLoading || !flags ? (
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {flags.map((flag) => (
              <div key={flag.module_key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={flag.enabled}
                    disabled={!flag.available}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ moduleKey: flag.module_key, enabled: checked === true })
                    }
                  />
                  <span className="text-sm font-medium">{flag.label}</span>
                  {!flag.available && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Coming soon
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
