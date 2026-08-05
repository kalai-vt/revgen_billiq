import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TopCategory } from '@/features/analytics/api';

// ChartCard and BaseEChart are exercised by their own tests (ChartCard is pre-existing and
// untouched by this migration; BaseEChart.test.tsx covers the ECharts wrapper). Stubbing both
// here isolates what's actually new in this file: the option this chart builds from its props,
// and its handleExport wiring for the two new client-side formats.
vi.mock('@/components/shared/ChartCard', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ChartCard: (props: any) => (
    <div>
      <span data-testid="title">{props.title}</span>
      <span data-testid="loading">{String(props.isLoading)}</span>
      <span data-testid="empty">{String(props.isEmpty)}</span>
      <span data-testid="formats">{(props.exportFormats ?? []).join(',')}</span>
      <button data-testid="export-excel" onClick={() => props.onExport('excel')} />
      <button data-testid="export-png" onClick={() => props.onExport('image_png')} />
      <button data-testid="export-csv" onClick={() => props.onExport('data_csv')} />
      {props.children}
    </div>
  ),
}));

vi.mock('@/lib/echarts/BaseEChart', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BaseEChart: (props: any) => <div data-testid="base-echart" data-option={JSON.stringify(props.option)} />,
}));

vi.mock('@/lib/download-blob', () => ({ downloadBlob: vi.fn() }));

const { downloadBlob } = await import('@/lib/download-blob');
const { TopCategoriesChart } = await import('./TopCategoriesChart');

const sampleData: TopCategory[] = [
  { category_id: '1', name: 'Beverages', qty_sold: 10, revenue: 1000 },
  { category_id: '2', name: 'Snacks', qty_sold: 20, revenue: 2000 },
];

describe('TopCategoriesChart', () => {
  it('passes loading state through to ChartCard', () => {
    render(<TopCategoriesChart data={[]} isLoading onExport={vi.fn()} />);
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });

  it('marks empty when there is no data', () => {
    render(<TopCategoriesChart data={[]} isLoading={false} onExport={vi.fn()} />);
    expect(screen.getByTestId('empty')).toHaveTextContent('true');
  });

  it('builds a bar option with one category per row', () => {
    render(<TopCategoriesChart data={sampleData} isLoading={false} onExport={vi.fn()} />);
    const option = JSON.parse(screen.getByTestId('base-echart').getAttribute('data-option') ?? '{}');
    expect(option.xAxis.data).toEqual(['Beverages', 'Snacks']);
    expect(option.series[0].data).toEqual([1000, 2000]);
  });

  it('offers all five export formats, server and client alike', () => {
    render(<TopCategoriesChart data={sampleData} isLoading={false} onExport={vi.fn()} />);
    expect(screen.getByTestId('formats')).toHaveTextContent('excel,pdf,csv,image_png,data_csv');
  });

  it('delegates excel/pdf/csv to the existing server export callback', async () => {
    const onExport = vi.fn();
    render(<TopCategoriesChart data={sampleData} isLoading={false} onExport={onExport} />);
    await userEvent.click(screen.getByTestId('export-excel'));
    expect(onExport).toHaveBeenCalledWith('excel');
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('handles data_csv entirely client-side, without calling the server export callback', async () => {
    const onExport = vi.fn();
    render(<TopCategoriesChart data={sampleData} isLoading={false} onExport={onExport} />);
    await userEvent.click(screen.getByTestId('export-csv'));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'top-categories.csv');
    expect(onExport).not.toHaveBeenCalled();
  });

  it('handles image_png client-side without calling the server export callback', async () => {
    const onExport = vi.fn();
    render(<TopCategoriesChart data={sampleData} isLoading={false} onExport={onExport} />);
    await userEvent.click(screen.getByTestId('export-png'));
    expect(onExport).not.toHaveBeenCalled();
  });
});
