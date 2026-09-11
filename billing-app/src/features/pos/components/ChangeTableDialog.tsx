import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ChangeTableDialogProps {
  open: boolean;
  itemCount: number;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onKeepCurrent: () => void;
  onMove: () => void;
}

/** Asked when the cashier switches tables while a tab is open.
 *
 * Either answer is defensible — the guests moved, or the cashier picked the wrong table — and
 * guessing loses somebody's order, so the choice is theirs. Moving keeps the same order, its
 * number and its kitchen tickets, and only reassigns the table.
 */
export function ChangeTableDialog({
  open,
  itemCount,
  isPending,
  onOpenChange,
  onKeepCurrent,
  onMove,
}: ChangeTableDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change table?</DialogTitle>
        </DialogHeader>
        <p className="py-1 text-sm text-muted-foreground">
          The current order has {itemCount} item{itemCount === 1 ? '' : 's'} on it. Move that order to the new table,
          or leave it where it is?
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onKeepCurrent} disabled={isPending}>
            Keep current table
          </Button>
          <Button onClick={onMove} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Move order to new table
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
