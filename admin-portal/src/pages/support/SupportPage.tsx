import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Badge } from '@shared/components/ui/badge';
import { Button } from '@shared/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@shared/components/ui/dialog';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/components/ui/table';
import { listCustomers } from '@/services/customersApi';
import { createTicket, listTickets } from '@/services/supportApi';
import { ApiError } from '@/lib/api-client';

const STATUS_OPTIONS = ['all', 'open', 'pending', 'resolved', 'closed'];
const PRIORITY_VARIANT: Record<string, 'default' | 'destructive' | 'outline' | 'secondary'> = {
  low: 'outline',
  medium: 'secondary',
  high: 'default',
  urgent: 'destructive',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function SupportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('all');
  const [newOpen, setNewOpen] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['admin-tickets', status],
    queryFn: () => listTickets({ status: status === 'all' ? undefined : status }),
  });
  const { data: customers } = useQuery({ queryKey: ['admin-customers-lite'], queryFn: () => listCustomers() });

  const createMutation = useMutation({
    mutationFn: () => createTicket({ tenant_id: tenantId, subject, description, priority }),
    onSuccess: (ticket) => {
      toast.success('Ticket created');
      setNewOpen(false);
      setTenantId('');
      setSubject('');
      setDescription('');
      setPriority('medium');
      queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
      navigate(`/support/${ticket.id}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
          <p className="text-sm text-muted-foreground">Track and resolve customer issues.</p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          New ticket
        </Button>
      </div>

      <Select value={status} onValueChange={(value) => setStatus(value ?? 'all')}>
        <SelectTrigger className="w-full sm:w-48 capitalize">
          <SelectValue>{(value: string) => (value === 'all' ? 'All statuses' : value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s} className="capitalize">
              {s === 'all' ? 'All statuses' : s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading || !tickets ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No tickets found.
                  </TableCell>
                </TableRow>
              ) : (
                tickets.map((ticket) => (
                  <TableRow key={ticket.id} className="cursor-pointer" onClick={() => navigate(`/support/${ticket.id}`)}>
                    <TableCell className="font-medium">{ticket.subject}</TableCell>
                    <TableCell>{ticket.company_name}</TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'outline'} className="capitalize">
                        {ticket.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{ticket.status}</TableCell>
                    <TableCell>{ticket.assigned_admin_name ?? 'Unassigned'}</TableCell>
                    <TableCell>{formatDate(ticket.updated_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New support ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={tenantId} onValueChange={(value) => value && setTenantId(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a customer">
                    {(value: string) => customers?.find((c) => c.tenant_id === value)?.company_name ?? 'Select a customer'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c.tenant_id} value={c.tenant_id}>
                      {c.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(value) => value && setPriority(value)}>
                <SelectTrigger className="w-full capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['low', 'medium', 'high', 'urgent'].map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !tenantId || !subject || !description}
            >
              Create ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
