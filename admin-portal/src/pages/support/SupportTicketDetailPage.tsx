import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Send } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent, CardHeader } from '@shared/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Skeleton } from '@shared/components/ui/skeleton';
import { addTicketMessage, getTicket, updateTicket } from '@/services/supportApi';
import { ApiError } from '@/lib/api-client';

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function SupportTicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['admin-ticket', ticketId],
    queryFn: () => getTicket(ticketId!),
    enabled: !!ticketId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-ticket', ticketId] });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateTicket(ticketId!, { status }),
    onSuccess: () => {
      toast.success('Status updated');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: string) => updateTicket(ticketId!, { priority }),
    onSuccess: () => {
      toast.success('Priority updated');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const replyMutation = useMutation({
    mutationFn: () => addTicketMessage(ticketId!, reply),
    onSuccess: () => {
      setReply('');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  if (isLoading || !ticket) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/support')}>
        <ArrowLeft className="mr-1.5 size-4" />
        Back to tickets
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
          <p className="text-sm text-muted-foreground">
            {ticket.company_name} · opened by {ticket.created_by_admin_name} on {formatDateTime(ticket.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={ticket.priority} onValueChange={(value) => value && priorityMutation.mutate(value)}>
            <SelectTrigger size="sm" className="w-32 capitalize">
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
          <Select value={ticket.status} onValueChange={(value) => value && statusMutation.mutate(value)}>
            <SelectTrigger size="sm" className="w-32 capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['open', 'pending', 'resolved', 'closed'].map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Description</p>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{ticket.description}</p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <p className="text-sm font-medium">Activity</p>
        {ticket.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No replies yet.</p>
        ) : (
          ticket.messages.map((message) => (
            <Card key={message.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{message.author_name}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(message.created_at)}</p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{message.message}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <textarea
            className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Write a reply…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <Button size="sm" onClick={() => replyMutation.mutate()} disabled={!reply || replyMutation.isPending}>
            <Send className="mr-1.5 size-4" />
            Reply
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
