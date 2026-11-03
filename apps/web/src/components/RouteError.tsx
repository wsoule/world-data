import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { EmptyState } from './feedback';
import { isStaleChunkError } from '~/lib/staleChunks';

/**
 * Route error view. Most errors here are dataset downloads that failed after
 * the query retries (offline, a flaky CDN), so "Try again" has to clear the
 * failed queries and re-run the route, not just re-render the boundary: it
 * resets React Query's error boundary, which lets suspense queries fetch
 * again on remount, and invalidates the router, which re-runs loaders and
 * remounts the route. Coming back online retries automatically.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const queryReset = useQueryErrorResetBoundary();
  const [retrying, setRetrying] = useState(false);

  // Mark the failed queries as resettable as soon as the error shows, so the
  // next mount of the route refetches them instead of re-throwing the error.
  useEffect(() => {
    queryReset.reset();
  }, [queryReset]);

  // A route chunk missing after a deploy. TanStack Router has already
  // reloaded once for it; offer a plain reload rather than a retry that
  // would request the same missing file.
  const staleChunk = isStaleChunkError(error);

  const retry = () => {
    setRetrying(true);
    queryReset.reset();
    reset();
    void router.invalidate().finally(() => setRetrying(false));
  };

  useEffect(() => {
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  });

  const message = error instanceof Error ? error.message : String(error);
  const offline = /failed to (load|fetch)|network/i.test(message);
  return (
    <div className="mx-auto max-w-xl py-16">
      <EmptyState
        title={
          staleChunk
            ? 'Rankodex was just updated'
            : offline
              ? 'The data for this page did not load'
              : 'Something went wrong'
        }
      >
        <p className="mb-4">
          {staleChunk
            ? 'Reload the page to get the latest version.'
            : offline
              ? 'Check your connection and try again. The page retries on its own when you come back online.'
              : 'Reloading usually fixes this.'}
        </p>
        <p className="text-muted mb-4 font-mono text-xs break-all">{message}</p>
        <button
          type="button"
          className="bg-accent-600 rounded-lg px-3 py-1.5 text-sm text-white disabled:opacity-60"
          onClick={staleChunk ? () => window.location.reload() : retry}
          disabled={retrying}
        >
          {staleChunk ? 'Reload page' : retrying ? 'Retrying…' : 'Try again'}
        </button>
      </EmptyState>
    </div>
  );
}
