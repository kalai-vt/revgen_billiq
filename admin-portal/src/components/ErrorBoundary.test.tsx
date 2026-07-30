import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

// Silence the expected console.error noise from React's own error-boundary logging and from
// ErrorBoundary.componentDidCatch itself while the thrower test intentionally throws.
function suppressConsoleError() {
  return vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

function Bomb(): never {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('renders the fallback UI instead of crashing when a child throws', () => {
    const consoleError = suppressConsoleError();

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(screen.queryByText('All good')).not.toBeInTheDocument();

    consoleError.mockRestore();
  });
});
