import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TrendPoint } from '@/features/analytics/api';

vi.mock('@/components/shared/ChartCard', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ChartCard: (props: any) => <div>{props.children}</div>,
}));

vi.mock('@/lib/echarts/BaseEChart', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BaseEChart: (props: any) => <div data-testid="base-echart" data-option={JSON.stringify(props.option)} />,
}));

const { SalesOrdersComboChart } = await import('./SalesOrdersComboChart');

const sampleData: TrendPoint[] = [
  { bucket_start: '2026-08-01', bucket_label: 'Aug 1', revenue: 235400, order_count: 12 },
  { bucket_start: '2026-08-02', bucket_label: 'Aug 2', revenue: 300000, order_count: 18 },
];

describe('SalesOrdersComboChart', () => {
  it('renders revenue as a bar series on the left axis and orders as a line on the right axis', () => {
    render(<SalesOrdersComboChart data={sampleData} isLoading={false} onExport={vi.fn()} />);
    const option = JSON.parse(screen.getByTestId('base-echart').getAttribute('data-option') ?? '{}');

    expect(option.series[0].type).toBe('bar');
    expect(option.series[0].name).toBe('Revenue');
    expect(option.series[0].yAxisIndex).toBe(0);
    expect(option.series[0].data).toEqual([235400, 300000]);

    expect(option.series[1].type).toBe('line');
    expect(option.series[1].name).toBe('Orders');
    expect(option.series[1].yAxisIndex).toBe(1);
    expect(option.series[1].data).toEqual([12, 18]);
  });

  it('keeps the two y-axes independently scaled with whole-number order ticks', () => {
    render(<SalesOrdersComboChart data={sampleData} isLoading={false} onExport={vi.fn()} />);
    const option = JSON.parse(screen.getByTestId('base-echart').getAttribute('data-option') ?? '{}');
    expect(option.yAxis).toHaveLength(2);
    expect(option.yAxis[1].minInterval).toBe(1);
  });
});
