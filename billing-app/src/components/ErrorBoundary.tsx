import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

declare global {
  interface Window {
    /**
     * Soft hook into Sentry (see src/lib/sentry.ts). Only set once `initSentry()` has run with a
     * DSN configured — kept as an optional global rather than a hard import so this component
     * stays decoupled from the Sentry SDK and works fine when Sentry is dormant/unconfigured.
     */
    __sentryCaptureException?: (error: unknown, captureContext?: unknown) => string;
  }
}

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level render-error catch-all. Without this, a render-time throw anywhere in the tree
 * (including a lazy-loaded route chunk failing to load) produces a blank white screen instead of
 * a recoverable UI. Must be a class component — getDerivedStateFromError/componentDidCatch have
 * no hooks equivalent.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Always visible in dev, regardless of whether Sentry is configured.
    console.error(error, errorInfo);
    try {
      window.__sentryCaptureException?.(error, { extra: errorInfo });
    } catch {
      // A missing or misbehaving Sentry hook should never itself throw.
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const { error } = this.state;
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="justify-items-center gap-3 text-center">
              <AlertTriangle className="size-8 text-destructive" />
              <CardTitle className="text-2xl font-semibold tracking-tight">Something went wrong</CardTitle>
              <CardDescription className="text-sm">
                We've hit an unexpected error. Try reloading the page — if it keeps happening, contact support.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <Button onClick={() => window.location.reload()}>Reload page</Button>
              {import.meta.env.DEV && error && (
                <pre className="w-full overflow-auto rounded-lg bg-muted p-3 text-left text-xs text-muted-foreground">
                  {error.stack ?? error.message}
                </pre>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
