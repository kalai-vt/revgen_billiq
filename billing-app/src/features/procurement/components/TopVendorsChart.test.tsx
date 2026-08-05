import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TopVendor } from '@/features/procurement/api';

vi.mock('@/components/shared/ChartCard', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ChartCard: (props: any) => (
    <div>
      <span data-testid="formats">{(props.exportFormats ?? []).join(',')}</span>
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
const { TopVendorsChart } = await import('./TopVendorsChart');

const sampleData: TopVendor[] = [
  { vendor_id: 'v1', vendor_name: 'Acme Supplies', total_amount: 50000, purchase_count: 4 },
  { vendor_id: 'v2', vendor_name: 'Global Traders', total_amount: 30000, purchase_count: 2 },
];

describe('TopVendorsChart', () => {
  it('offers only the new client-side export formats — this chart has no server export', () => {
    render(<TopVendorsChart data={sampleData} isLoading={false} />);
    expect(screen.getByTestId('formats')).toHaveTextContent('image_png,data_csv');
  });

  it('exports its data client-side as CSV, with vendor name and purchase value columns', async () => {
    render(<TopVendorsChart data={sampleData} isLoading={false} />);
    await userEvent.click(screen.getByTestId('export-csv'));
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'top-vendors.csv');
  });

  it('builds a bar option from vendor name and purchase value', () => {
    render(<TopVendorsChart data={sampleData} isLoading={false} />);
    const option = JSON.parse(screen.getByTestId('base-echart').getAttribute('data-option') ?? '{}');
    expect(option.xAxis.data).toEqual(['Acme Supplies', 'Global Traders']);
    expect(option.series[0].data).toEqual([50000, 30000]);
  });
});
