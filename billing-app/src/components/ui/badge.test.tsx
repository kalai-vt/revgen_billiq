import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders its children as text content', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('defaults to the "default" variant styling', () => {
    render(<Badge>Default</Badge>);
    expect(screen.getByText('Default')).toHaveClass('bg-primary', 'text-primary-foreground');
  });

  it('applies the requested variant classes', () => {
    render(<Badge variant="destructive">Failed</Badge>);
    expect(screen.getByText('Failed')).toHaveClass('bg-destructive/10', 'text-destructive');
  });

  it('merges a caller-supplied className with the variant classes', () => {
    render(<Badge className="custom-badge">Tagged</Badge>);
    const badge = screen.getByText('Tagged');
    expect(badge).toHaveClass('custom-badge');
    expect(badge).toHaveClass('bg-primary');
  });

  it('renders as a <span> by default', () => {
    render(<Badge>Span badge</Badge>);
    expect(screen.getByText('Span badge').tagName).toBe('SPAN');
  });
});
