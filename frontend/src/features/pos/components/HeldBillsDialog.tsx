import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardList, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import * as posApi from '@/features/pos/api';
import type { HeldBill } from '@/features/pos/api';
import { ApiError } from '@/lib/api-client';

interface HeldBillsDialogProps {
  open: boolean;
  onClose: () => void;
  onResume: (heldBill: HeldBill) => void;
}

export function HeldBillsDialog({ open, onClose, onResume }: HeldBillsDialogProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['held-bills'],
    queryFn: () => posApi.listHeldBills(),
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => posApi.deleteHeldBill(id),
    onSuccess: () => {
      toast.success('Held bill deleted');
      queryClient.invalidateQueries({ queryKey: ['held-bills'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Held bills</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-2 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}
        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <EmptyState icon={ClipboardList} title="No held bills" description="Bills you hold during checkout will show up here." />
        )}

        <div className="max-h-96 space-y-2 overflow-y-auto">
          {data?.items.map((heldBill) => {
            const itemCount = heldBill.lines.reduce((sum, line) => sum + line.quantity, 0);
            return (
              <div
                key={heldBill.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {heldBill.notes || heldBill.customer_name || 'Held bill'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {itemCount} item{itemCount === 1 ? '' : 's'} · {heldBill.created_by_name} ·{' '}
                    {new Date(heldBill.created_at).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" onClick={() => onResume(heldBill)}>
                    Resume
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive"
                    aria-label={`Delete held bill for ${heldBill.notes || heldBill.customer_name || 'this bill'}`}
                    onClick={() => deleteMutation.mutate(heldBill.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
