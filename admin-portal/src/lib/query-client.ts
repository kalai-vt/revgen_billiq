import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';

function reportToSentry(error: unknown): void {
  try {
    window.__sentryCaptureException?.(error);
  } catch {
    // A missing or misbehaving Sentry hook should never itself throw.
  }
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && /fetch|network/i.test(error.message);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
  // Query errors are reported for visibility, but not toasted globally — most pages already
  // render their own inline "failed to load" state from `isError`, and a blanket toast on top of
  // that would double up the error for the user. Mutations (below) are the opposite case: a
  // user-initiated action with no persistent error UI of its own, so a toast is the right default.
  queryCache: new QueryCache({
    onError: (error) => reportToSentry(error),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      reportToSentry(error);
      // A mutation that already defines its own onError (the vast majority, for a bespoke
      // message) handles its own toast — this only fires for the ones that don't, which used to
      // mean the failure was silently swallowed. That's the actual bug this closes: not
      // deduplicating existing handlers, but guaranteeing every mutation shows *something* on
      // failure even if a future one forgets to.
      if (mutation.options.onError) return;
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else if (isNetworkError(error)) {
        toast.error('Network error — check your connection and try again.');
      } else {
        toast.error('Something went wrong. Please try again.');
      }
    },
  }),
});
