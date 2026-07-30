import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminBrandLogo } from './AdminBrandLogo';

describe('AdminBrandLogo', () => {
  it('renders the product name by default', () => {
    render(<AdminBrandLogo />);
    expect(screen.getByText('RevGenIQ Admin')).toBeInTheDocument();
  });

  it('hides the product name when iconOnly is set', () => {
    render(<AdminBrandLogo iconOnly />);
    expect(screen.queryByText('RevGenIQ Admin')).not.toBeInTheDocument();
  });

  it('applies the requested mark size class', () => {
    const { container } = render(<AdminBrandLogo size="lg" />);
    expect(container.querySelector('.size-12')).not.toBeNull();
  });

  it('defaults to the "md" mark size', () => {
    const { container } = render(<AdminBrandLogo />);
    expect(container.querySelector('.size-9')).not.toBeNull();
  });

  it('forwards a caller-supplied className to the outer wrapper', () => {
    const { container } = render(<AdminBrandLogo className="custom-logo" />);
    expect(container.firstElementChild).toHaveClass('custom-logo');
  });
});
