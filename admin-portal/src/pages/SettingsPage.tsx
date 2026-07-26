import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent, CardHeader } from '@shared/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@shared/components/ui/dialog';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/components/ui/table';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { ApiError } from '@/lib/api-client';
import {
  activateStaff,
  changeOwnPassword,
  deactivateStaff,
  inviteStaff,
  listStaff,
  updateStaffRole,
} from '@/services/staffApi';
import type { AdminRole } from '@/services/authApi';

const ROLES: AdminRole[] = ['super_admin', 'operations', 'support', 'finance', 'sales', 'developer', 'auditor'];

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StaffSection() {
  const { adminUser } = useAdminAuth();
  const isSuperAdmin = adminUser?.role === 'super_admin';
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('support');

  const { data: staff, isLoading } = useQuery({ queryKey: ['admin-staff'], queryFn: listStaff });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-staff'] });

  const inviteMutation = useMutation({
    mutationFn: () => inviteStaff({ first_name: firstName, last_name: lastName, email, role }),
    onSuccess: () => {
      toast.success('Invite sent');
      setInviteOpen(false);
      setFirstName('');
      setLastName('');
      setEmail('');
      setRole('support');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, newRole }: { id: string; newRole: AdminRole }) => updateStaffRole(id, newRole),
    onSuccess: () => {
      toast.success('Role updated');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => (active ? activateStaff(id) : deactivateStaff(id)),
    onSuccess: () => {
      toast.success('Staff account updated');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <p className="text-sm font-medium">Admin staff</p>
          <p className="text-sm text-muted-foreground">RevGenIQ employees with access to this portal.</p>
        </div>
        {isSuperAdmin && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1.5 size-4" />
            Invite staff
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading || !staff ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                {isSuperAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.first_name} {member.last_name}
                  </TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    {isSuperAdmin ? (
                      <Select
                        value={member.role}
                        onValueChange={(value) => value && roleMutation.mutate({ id: member.id, newRole: value as AdminRole })}
                      >
                        <SelectTrigger size="sm" className="w-40 capitalize">
                          <SelectValue>{(value: AdminRole) => value?.replace('_', ' ')}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r} className="capitalize">
                              {r.replace('_', ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="capitalize">{member.role.replace('_', ' ')}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.is_active ? 'default' : 'destructive'} className="capitalize">
                      {member.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(member.last_login)}</TableCell>
                  {isSuperAdmin && (
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={member.id === adminUser?.id}
                        onClick={() => toggleActiveMutation.mutate({ id: member.id, active: !member.is_active })}
                      >
                        {member.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite a staff member</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(value) => value && setRole(value as AdminRole)}>
                <SelectTrigger className="w-full capitalize">
                  <SelectValue>{(value: AdminRole) => value?.replace('_', ' ')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending || !firstName || !lastName || !email}
            >
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => changeOwnPassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Password changed');
      setCurrentPassword('');
      setNewPassword('');
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-sm font-medium">Change your password</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="max-w-sm space-y-3">
          <div className="space-y-1.5">
            <Label>Current password</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={10} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={mutation.isPending}>
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage the Admin Portal's own staff and your account.</p>
      </div>
      <StaffSection />
      <ChangePasswordSection />
    </div>
  );
}
