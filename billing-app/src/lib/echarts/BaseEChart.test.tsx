import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BaseEChartHandle } from './BaseEChart';

// Real echarts-for-react needs a canvas, which jsdom doesn't provide. Stand in with a plain
// div that records the props it was given, so tests can assert BaseEChart's own wiring
// (theme selection, option merging) without touching real canvas rendering. Being a plain
// function component (not forwardRef), the mock can't back the imperative handle's
// getInstance() — BaseEChart's `chartRef.current?.getEchartsInstance()` optional-chains to
// undefined here, same as real usage before the chart has mounted.
vi.mock('echarts-for-react/lib/core', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => <div data-testid="echart-mock" data-theme={props.theme} data-option={JSON.stringify(props.option)} />,
}));

const { BaseEChart } = await import('./BaseEChart');

describe('BaseEChart', () => {
  it('resolves to the light theme outside any next-themes provider', () => {
    render(<BaseEChart option={{ series: [] }} />);
    expect(screen.getByTestId('echart-mock')).toHaveAttribute('data-theme', 'billiq-light');
  });

  it('merges the base animation defaults into the passed option', () => {
    render(<BaseEChart option={{ series: [{ type: 'bar', data: [1, 2] }] }} />);
    const rendered = JSON.parse(screen.getByTestId('echart-mock').getAttribute('data-option') ?? '{}');
    expect(rendered.animationDuration).toBe(400);
    expect(rendered.series).toEqual([{ type: 'bar', data: [1, 2] }]);
  });

  it('lets the caller override an animation default', () => {
    render(<BaseEChart option={{ series: [], animationDuration: 900 }} />);
    const rendered = JSON.parse(screen.getByTestId('echart-mock').getAttribute('data-option') ?? '{}');
    expect(rendered.animationDuration).toBe(900);
  });

  it('exposes an imperative handle with getInstance and resetZoom', () => {
    const ref = createRef<BaseEChartHandle>();
    render(<BaseEChart ref={ref} option={{ series: [] }} />);
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.getInstance).toBe('function');
    expect(typeof ref.current?.resetZoom).toBe('function');
  });
});
