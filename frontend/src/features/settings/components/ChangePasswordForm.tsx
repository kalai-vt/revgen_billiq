import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import * as authApi from '@/features/auth/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/lib/api-client';

export function ChangePasswordForm() {
  const { swapTokens } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: (result) => {
      swapTokens(result.access_token, result.refresh_token);
      toast.success('Password changed. Other sessions have been signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="current-password">Current password</Label>
        <PasswordInput
          id="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">New password</Label>
        <PasswordInput id="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          At least 10 characters, with uppercase, lowercase, a number, and a special character.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-new-password">Confirm new password</Label>
        <PasswordInput
          id="confirm-new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Change password'}
        </Button>
      </div>
    </form>
  );
}
