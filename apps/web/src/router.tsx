import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';

import { NotFound, PageSpinner } from './components/feedback';
import { RouteError } from './components/RouteError';
import { shouldRetry } from './data/api';
import { routeTree } from './routeTree.gen';

/**
 * Router factory used by TanStack Start on the server (once per request or
 * prerendered page) and in the browser. Each router gets its own QueryClient
 * so server renders never share cache state.
 */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Dataset files are static, so they never go stale; a failed download is
      // retried up to three times with backoff (1s, 2s, 4s) before the route
      // shows its error view.
      queries: {
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
      },
    },
  });

  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    // A navigation keeps the current page on screen until the next page's loaders finish
    // (NavigationProgress in the root layout shows the wait), instead of swapping in the
    // loading view after a second: that view let the footer up into the viewport, and
    // dropping it again when the page arrived was a large layout shift on slow phones. The
    // loading view remains the fallback while a page's own data streams in, and the static
    // shell of the browser-rendered routes.
    defaultPendingMs: Number.POSITIVE_INFINITY,
    defaultPendingComponent: PageSpinner,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: NotFound,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
