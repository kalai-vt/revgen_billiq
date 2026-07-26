import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as authApi from '@/features/auth/api';
import { ApiError } from '@/lib/api-client';

const EMPTY_FORM = { first_name: '', last_name: '', email: '', password: '', role: 'staff' as 'manager' | 'staff' };

export function TeamMemberFormDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: authApi.TeamMemberPayload) => authApi.createTeamMember(payload),
    onSuccess: () => {
      toast.success('Team member added');
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setForm(EMPTY_FORM);
      setOpen(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    mutation.mutate(form);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">Add team member</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tm-first-name">First name</Label>
              <Input
                id="tm-first-name"
                required
                value={form.first_name}
                onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tm-last-name">Last name</Label>
              <Input
                id="tm-last-name"
                required
                value={form.last_name}
                onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tm-email">Email</Label>
            <Input
              id="tm-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tm-password">Temporary password</Label>
            <Input
              id="tm-password"
              type="password"
              required
              minLength={10}
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(value) => setForm((prev) => ({ ...prev, role: value as 'manager' | 'staff' }))}>
              <SelectTrigger>
                <SelectValue>{(value: string | null) => (value === 'manager' ? 'Manager' : 'Staff')}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Adding…' : 'Add member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
