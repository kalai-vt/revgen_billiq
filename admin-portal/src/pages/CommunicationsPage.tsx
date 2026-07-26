import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Button } from '@shared/components/ui/button';
import { Card, CardContent, CardHeader } from '@shared/components/ui/card';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select';
import { Skeleton } from '@shared/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/components/ui/table';
import { listCommunications, sendBroadcast } from '@/services/communicationsApi';
import { ApiError } from '@/lib/api-client';

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'All customers' },
  { value: 'plan', label: 'By plan' },
];

const PLAN_OPTIONS = ['basic', 'explore', 'advance'];

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function CommunicationsPage() {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [audienceType, setAudienceType] = useState<'all' | 'plan'>('all');
  const [plan, setPlan] = useState('basic');

  const { data: history, isLoading } = useQuery({ queryKey: ['admin-communications'], queryFn: listCommunications });

  const mutation = useMutation({
    mutationFn: () => sendBroadcast({ subject, message, audience_type: audienceType, plan: audienceType === 'plan' ? plan : undefined }),
    onSuccess: (result) => {
      toast.success(`Sent to ${result.recipient_count} customer${result.recipient_count === 1 ? '' : 's'}`);
      setSubject('');
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['admin-communications'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Communications</h1>
        <p className="text-sm text-muted-foreground">Send announcements to customer owners.</p>
      </div>

      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Compose announcement</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select value={audienceType} onValueChange={(value) => value && setAudienceType(value as 'all' | 'plan')}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(value: string) => AUDIENCE_OPTIONS.find((opt) => opt.value === value)?.label ?? value}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {audienceType === 'plan' && (
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={plan} onValueChange={(value) => value && setPlan(value)}>
                  <SelectTrigger className="w-full capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <textarea
              className="min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={4000}
            />
          </div>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !subject || !message}>
            <Send className="mr-1.5 size-4" />
            Send announcement
          </Button>
        </CardContent>
      </Card>

      <div>
        <p className="mb-2 text-sm font-medium">History</p>
        {isLoading || !history ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Sent by</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      No announcements sent yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.subject}</TableCell>
                      <TableCell className="capitalize">{row.audience_type}</TableCell>
                      <TableCell className="tabular-nums">{row.recipient_count}</TableCell>
                      <TableCell>{row.admin_user_name}</TableCell>
                      <TableCell>{formatDate(row.created_at)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
