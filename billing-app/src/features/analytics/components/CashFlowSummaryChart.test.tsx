import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CashFlowSummary } from '@/features/analytics/api';

vi.mock('@/components/shared/ChartCard', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ChartCard: (props: any) => (
    <div>
      <span data-testid="empty">{String(props.isEmpty)}</span>
      {props.children}
    </div>
  ),
}));

vi.mock('@/lib/echarts/BaseEChart', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BaseEChart: (props: any) => <div data-testid="base-echart" data-option={JSON.stringify(props.option)} />,
}));

const { CashFlowSummaryChart } = await import('./CashFlowSummaryChart');

const sampleData: CashFlowSummary = {
  total_cash_in: 12345.6,
  by_method: [{ method: 'cash', amount: 12345.6, count: 4 }],
  daily: [
    { bucket_start: '2026-08-01', bucket_label: 'Aug 1', amount: 6000 },
    { bucket_start: '2026-08-02', bucket_label: 'Aug 2', amount: 6345.6 },
  ],
};

describe('CashFlowSummaryChart', () => {
  it('shows the full Indian-currency-formatted total above the chart', () => {
    render(<CashFlowSummaryChart data={sampleData} isLoading={false} onExport={vi.fn()} />);
    expect(screen.getByText('₹12,345.60')).toBeInTheDocument();
  });

  it('keeps the chart inside a min-h-0 flex-1 wrapper so it can shrink within the KPI+chart column', () => {
    render(<CashFlowSummaryChart data={sampleData} isLoading={false} onExport={vi.fn()} />);
    const chart = screen.getByTestId('base-echart');
    expect(chart.parentElement).toHaveClass('min-h-0', 'flex-1');
  });

  it('is empty when there are no daily buckets, even if total_cash_in is nonzero', () => {
    render(<CashFlowSummaryChart data={{ ...sampleData, daily: [] }} isLoading={false} onExport={vi.fn()} />);
    expect(screen.getByTestId('empty')).toHaveTextContent('true');
  });

  it('builds the bar option from the daily buckets', () => {
    render(<CashFlowSummaryChart data={sampleData} isLoading={false} onExport={vi.fn()} />);
    const option = JSON.parse(screen.getByTestId('base-echart').getAttribute('data-option') ?? '{}');
    expect(option.xAxis.data).toEqual(['Aug 1', 'Aug 2']);
    expect(option.series[0].data).toEqual([6000, 6345.6]);
  });
});
