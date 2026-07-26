import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Database, Server, XCircle } from 'lucide-react';
import { Badge } from '@shared/components/ui/badge';
import { Card, CardContent, CardHeader } from '@shared/components/ui/card';
import { Skeleton } from '@shared/components/ui/skeleton';
import { getRecentActivity, getSystemHealth } from '@/services/systemApi';

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface HealthCardProps {
  label: string;
  ok: boolean;
  latencyMs: number | null;
  icon: typeof Database;
}

function HealthCard({ label, ok, latencyMs, icon: Icon }: HealthCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="size-6 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{latencyMs !== null ? `${latencyMs}ms response` : 'No response'}</p>
        </div>
        {ok ? (
          <Badge variant="default">
            <CheckCircle2 className="mr-1 size-3" /> Operational
          </Badge>
        ) : (
          <Badge variant="destructive">
            <XCircle className="mr-1 size-3" /> Down
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

export function SystemMonitoringPage() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['admin-system-health'],
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
  });
  const { data: activity } = useQuery({ queryKey: ['admin-system-activity'], queryFn: getRecentActivity });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System Monitoring</h1>
        <p className="text-sm text-muted-foreground">Live health of the platform's core services.</p>
      </div>

      {isLoading || !health ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <HealthCard label="API" ok={health.api_ok} latencyMs={null} icon={Server} />
          <HealthCard label="Billing database" ok={health.billing_db.ok} latencyMs={health.billing_db.latency_ms} icon={Database} />
          <HealthCard label="Admin database" ok={health.admin_db.ok} latencyMs={health.admin_db.latency_ms} icon={Database} />
        </div>
      )}

      {health && (
        <p className="text-xs text-muted-foreground">
          Backend uptime: {formatUptime(health.uptime_seconds)} · last checked {formatDate(health.checked_at)}
        </p>
      )}

      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Recent activity</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!activity ? (
            <Skeleton className="h-24 w-full" />
          ) : (activity as { id: string; admin_user_name: string; action: string; created_at: string }[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            (activity as { id: string; admin_user_name: string; action: string; created_at: string }[]).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-medium">{entry.admin_user_name}</span> · {entry.action}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
