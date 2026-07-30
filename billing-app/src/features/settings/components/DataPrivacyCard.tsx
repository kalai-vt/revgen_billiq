import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import * as settingsApi from '@/features/settings/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/lib/api-client';
import { downloadBlob } from '@/lib/download-blob';

export function DataPrivacyCard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState('');

  const exportMutation = useMutation({
    mutationFn: settingsApi.exportData,
    onSuccess: (blob) => {
      downloadBlob(blob, 'revgen-billiq-data-export.zip');
      toast.success('Your data export has started downloading.');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not export your data'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => settingsApi.deleteAccount(password),
    onSuccess: async () => {
      toast.success('Your account has been deleted.');
      await logout();
      navigate('/login', { replace: true });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not delete your account'),
  });

  return (
    <Card id="data-privacy" className="scroll-mt-4 border-destructive/30">
      <CardHeader>
        <CardTitle>Data &amp; Privacy</CardTitle>
        <CardDescription>Export your account data, or permanently delete your account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Export my data</p>
            <p className="text-xs text-muted-foreground">
              Download a copy of your customers, products, invoices, and team members as CSV files.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
            {exportMutation.isPending ? 'Preparing…' : 'Export data'}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 p-3">
          <div>
            <p className="text-sm font-medium text-destructive">Delete my account</p>
            <p className="text-xs text-muted-foreground">
              This immediately signs everyone in your organization out. Contact support within the grace period if this
              was a mistake.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
            Delete account
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={(open) => { setConfirmOpen(open); if (!open) setPassword(''); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will suspend access for your entire organization immediately. Enter your password to confirm.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="delete-account-password">Password</Label>
            <Input
              id="delete-account-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending || password.length === 0}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
