import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PrintPage } from '@/lib/printing/printPage';

describe('PrintPage', () => {
  it('sizes the @page rule to the full physical roll width for 80mm thermal paper', () => {
    const { container } = render(
      <PrintPage paperSize="80mm">
        <p>receipt</p>
      </PrintPage>,
    );
    expect(container.querySelector('style')!.textContent).toContain('@page { size: 80mm auto; margin: 0; }');
  });

  it('sizes the @page rule to the full physical roll width for 58mm thermal paper', () => {
    const { container } = render(
      <PrintPage paperSize="58mm">
        <p>receipt</p>
      </PrintPage>,
    );
    expect(container.querySelector('style')!.textContent).toContain('@page { size: 58mm auto; margin: 0; }');
  });

  it('renders thermal content at the printable width, not the full roll width — 72mm for an 80mm roll', () => {
    const { container } = render(
      <PrintPage paperSize="80mm">
        <p>receipt</p>
      </PrintPage>,
    );
    const contentDiv = container.querySelector('div')!;
    expect(contentDiv.style.width).toBe('72mm');
    expect(contentDiv.style.maxWidth).toBe('72mm');
  });

  it('renders thermal content at the printable width, not the full roll width — 48mm for a 58mm roll', () => {
    const { container } = render(
      <PrintPage paperSize="58mm">
        <p>receipt</p>
      </PrintPage>,
    );
    const contentDiv = container.querySelector('div')!;
    expect(contentDiv.style.width).toBe('48mm');
    expect(contentDiv.style.maxWidth).toBe('48mm');
  });

  it('uses a named page size and a real margin (not a crushed width) for non-thermal paper', () => {
    const { container } = render(
      <PrintPage paperSize="A4">
        <p>invoice</p>
      </PrintPage>,
    );
    expect(container.querySelector('style')!.textContent).toContain('@page { size: A4; margin: 15mm; }');
    const contentDiv = container.querySelector('div')!;
    expect(contentDiv.style.width).toBe('');
    expect(contentDiv.style.maxWidth).toBe('');
  });

  it('sets print-color-adjust so filled backgrounds (table header, Grand Total band) do not print blank', () => {
    const { container } = render(
      <PrintPage paperSize="80mm">
        <p>receipt</p>
      </PrintPage>,
    );
    const contentDiv = container.querySelector('div')!;
    expect(contentDiv.style.printColorAdjust).toBe('exact');
  });
});
