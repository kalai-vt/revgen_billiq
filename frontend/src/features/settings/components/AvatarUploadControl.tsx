import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import * as authApi from '@/features/auth/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ApiError } from '@/lib/api-client';

export function AvatarUploadControl() {
  const { user, setUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => authApi.uploadAvatar(file),
    onSuccess: (updated) => {
      setUser(updated);
      toast.success('Avatar updated');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    mutation.mutate(file);
  }

  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`.toUpperCase();

  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg">
        {user?.avatar_url && <AvatarImage src={user.avatar_url} alt="Avatar" />}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="space-y-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {mutation.isPending ? 'Uploading…' : 'Change photo'}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!error && <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP. Max 2MB.</p>}
      </div>
    </div>
  );
}
