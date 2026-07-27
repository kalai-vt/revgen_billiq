import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
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
import type { FeatureImpact } from '@/services/featuresApi';

interface ConfirmImpactDialogProps {
  moduleLabel: string;
  targetLabel: string;
  impact: FeatureImpact;
  dependentLabels: string[];
  open: boolean;
  pending: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ConfirmImpactDialog({
  moduleLabel,
  targetLabel,
  impact,
  dependentLabels,
  open,
  pending,
  onConfirm,
  onCancel,
}: ConfirmImpactDialogProps) {
  const [reason, setReason] = useState('');

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" />
            <DialogTitle>
              {targetLabel} {moduleLabel}?
            </DialogTitle>
          </div>
          <DialogDescription>This change applies immediately — no restart or deployment needed.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {dependentLabels.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="font-medium text-amber-900 dark:text-amber-200">Affected features</p>
              <p className="mt-1 text-amber-800 dark:text-amber-300">
                {dependentLabels.join(', ')} depend{dependentLabels.length === 1 ? 's' : ''} on {moduleLabel} and will
                stop working for this customer.
              </p>
            </div>
          )}
          <div className="rounded-lg border p-3">
            <p className="font-medium">Data impact</p>
            <p className="mt-1 text-muted-foreground">{impact.data_impact}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-reason" className="text-xs">
              Reason (optional)
            </Label>
            <Input
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer downgraded plan"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(reason)} disabled={pending}>
            {pending ? 'Applying…' : `Yes, ${targetLabel.toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
