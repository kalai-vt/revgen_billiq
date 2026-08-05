import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PaymentMethodBreakdown } from '@/features/analytics/api';
import { formatCompactCurrency } from '@/lib/echarts/formatters';

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

const { PaymentMethodsChart } = await import('./PaymentMethodsChart');

const sampleData: PaymentMethodBreakdown[] = [
  { method: 'cash', amount: 600, count: 3 },
  { method: 'card', amount: 400, count: 2 },
];

describe('PaymentMethodsChart', () => {
  it('uppercases each payment method into a pie slice name', () => {
    render(<PaymentMethodsChart data={sampleData} isLoading={false} onExport={vi.fn()} />);
    const option = JSON.parse(screen.getByTestId('base-echart').getAttribute('data-option') ?? '{}');
    expect(option.series[0].data.map((d: { name: string }) => d.name)).toEqual(['CASH', 'CARD']);
  });

  it('shows the compact-formatted total in the doughnut center label', () => {
    render(<PaymentMethodsChart data={sampleData} isLoading={false} onExport={vi.fn()} />);
    const option = JSON.parse(screen.getByTestId('base-echart').getAttribute('data-option') ?? '{}');
    expect(option.graphic[1].style.text).toBe(formatCompactCurrency(1000));
  });

  it('is empty when there is no breakdown data', () => {
    render(<PaymentMethodsChart data={[]} isLoading={false} onExport={vi.fn()} />);
    expect(screen.getByTestId('empty')).toHaveTextContent('true');
  });
});
