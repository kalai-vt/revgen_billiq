import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_PRIMARY } from '@/features/analytics/lib/colors';
import type { ComparisonMetric } from '@/features/analytics/api';
import { cn } from '@/lib/utils';

interface ComparisonMetricCardProps {
  metric: ComparisonMetric;
  format: 'currency' | 'number';
}

function formatValue(value: number, format: 'currency' | 'number'): string {
  return format === 'currency'
    ? `₹${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : value.toLocaleString();
}

export function ComparisonMetricCard({ metric, format }: ComparisonMetricCardProps) {
  const max = Math.max(metric.current_value, metric.previous_value, 1);
  const currentWidth = Math.max((metric.current_value / max) * 100, metric.current_value > 0 ? 2 : 0);
  const previousWidth = Math.max((metric.previous_value / max) * 100, metric.previous_value > 0 ? 2 : 0);

  const isUp = metric.direction === 'up';
  const isDown = metric.direction === 'down';
  const colorClass = isUp ? 'text-emerald-600 dark:text-emerald-500' : isDown ? 'text-destructive' : 'text-muted-foreground';
  const Icon = isUp ? ArrowUp : isDown ? ArrowDown : ArrowRight;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{metric.label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Current</span>
            <span className="font-medium">{formatValue(metric.current_value, format)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${currentWidth}%`, backgroundColor: CHART_PRIMARY }} />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Previous</span>
            <span className="font-medium">{formatValue(metric.previous_value, format)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${previousWidth}%` }} />
          </div>
        </div>
        <div className={cn('flex items-center gap-1 text-sm font-semibold', colorClass)}>
          <Icon className="size-4" />
          {metric.growth_percent !== null ? `${metric.growth_percent >= 0 ? '+' : ''}${metric.growth_percent.toFixed(1)}%` : '—'}
          <span className="font-normal text-muted-foreground">
            ({metric.absolute_difference >= 0 ? '+' : ''}
            {formatValue(metric.absolute_difference, format)})
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
