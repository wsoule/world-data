import { Link, useHydrated, useRouterState } from '@tanstack/react-router';
import { Loader2, Search } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

import { openSearch } from '~/features/search/store';
import { SITE } from '~/site';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="text-muted flex items-center gap-2 text-sm" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

/**
 * A page's loading view (the route pending view and the page-level Suspense fallback). It is at
 * least as tall as the viewport, so the footer stays below the fold while a page loads and does
 * not jump down when the page arrives: a short spinner let the footer into view, and its move
 * counted as a layout shift (up to 0.75 on a phone).
 */
export function PageSpinner() {
  return (
    <div className="flex min-h-svh items-start justify-center pt-[30vh]">
      <Spinner />
    </div>
  );
}

/**
 * Loading view of the browser-rendered tools (/compare, /vs), and so their static HTML: the
 * tool's name and what it does as text, then grey blocks where its controls and first panel
 * will be. It is at least as tall as the viewport like PageSpinner, so the footer never moves
 * into view when the tool arrives, and its text paints at once, so the first paint has the
 * page's largest text rather than waiting seconds for the tool.
 */
export function PageSkeleton({
  title,
  description,
  controls = 1,
}: {
  title: string;
  description: string;
  /** Rows of controls between the description and the panel */
  controls?: number;
}) {
  return (
    <div className="min-h-svh">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        <p className="text-muted mt-1 max-w-2xl text-sm">{description}</p>
      </div>
      <div role="status" className="space-y-4">
        <span className="sr-only">Loading…</span>
        {Array.from({ length: controls }, (_, i) => (
          <div
            key={i}
            className="bg-surface-2 h-10 w-full animate-pulse rounded-xl"
            aria-hidden
          />
        ))}
        <div
          className="border-app bg-surface h-[70svh] rounded-2xl border"
          aria-hidden
        />
      </div>
    </div>
  );
}

/**
 * A thin bar along the top of the window while the router loads the next page. The router
 * keeps the current page on screen until the next one has its data (see router.tsx), so this
 * is what shows that a click registered. It sits over the header (fixed, no layout), appears
 * after a short delay so quick navigations do not flash it, and creeps towards the end until
 * the page arrives. Rendered only after hydration, since the server has no navigation state.
 */
export function NavigationProgress() {
  const hydrated = useHydrated();
  const loading = useRouterState({ select: (s) => s.status === 'pending' });
  const ref = useRef<HTMLDivElement>(null);
  const show = hydrated && loading;

  useEffect(() => {
    const el = ref.current;
    if (!show || el == null) return;
    const anim = el.animate(
      [
        { opacity: 0, transform: 'scaleX(0)' },
        { opacity: 1, transform: 'scaleX(0.2)', offset: 0.05 },
        { opacity: 1, transform: 'scaleX(0.9)' },
      ],
      { duration: 10_000, delay: 150, easing: 'ease-out', fill: 'both' }
    );
    return () => anim.cancel();
  }, [show]);

  if (!show) return null;
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label="Loading page"
      className="bg-accent-500 pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 origin-left opacity-0"
    />
  );
}

export function EmptyState({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="border-app flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-10 text-center">
      {icon}
      <p className="font-medium">{title}</p>
      {children != null ? (
        <div className="text-muted max-w-md text-sm">{children}</div>
      ) : null}
    </div>
  );
}

/** Document title of every not-found view ("Page not found — Rankodex"). */
export const NOT_FOUND_TITLE = `Page not found — ${SITE.name}`;

/** Meta description of every not-found view. */
export const NOT_FOUND_DESCRIPTION = 'There is no page at this address.';

/**
 * Route `head()` result for a route whose loader threw notFound(), so the server-rendered page
 * already carries the not-found title and description. NotFound itself adds the robots tag.
 */
export function notFoundHead(): {
  meta: ({ title: string } | { name: string; content: string })[];
} {
  return {
    meta: [
      { title: NOT_FOUND_TITLE },
      { name: 'description', content: NOT_FOUND_DESCRIPTION },
    ],
  };
}

/**
 * Shows NOT_FOUND_TITLE in the tab and history while mounted. Route heads already set it (the
 * root route for unknown paths, notFoundHead() where a loader threw notFound()); this covers a
 * NotFound rendered inside a page component. On unmount the previous title comes back only if
 * nothing else has replaced it, so the next page's own title is never overwritten.
 */
function useNotFoundTitle() {
  useEffect(() => {
    const previous = document.title;
    document.title = NOT_FOUND_TITLE;
    return () => {
      if (document.title === NOT_FOUND_TITLE) document.title = previous;
    };
  }, []);
}

const NOT_FOUND_LINK =
  'border-app hover:bg-surface-2 hover:text-app rounded-lg border px-3 py-1.5 text-sm font-medium';

/**
 * Link activeOptions for the ways on: a link counts as the current page only on its own URL, so
 * at /places/state/nowhere the US states link does not claim aria-current. This also keeps the
 * static 404.html, rendered once for an unmatched path, identical to the first client render at
 * whatever unknown URL the host serves it for.
 */
const EXACT = { exact: true } as const;

/**
 * The 404 view for unknown paths and for routes whose loader threw notFound(). It titles the page
 * "Page not found", keeps it out of search indexes (React places the robots <meta> in <head>) and
 * offers search and the main lists as ways on.
 */
export function NotFound() {
  useNotFoundTitle();
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <meta name="robots" content="noindex, follow" />
      <p className="text-accent-600 dark:text-accent-300 text-sm font-semibold">
        404
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
        Page not found
      </h1>
      <p className="text-muted mt-2 text-sm">
        There is no page at this address. The link may be mistyped, or the page
        may have moved.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={openSearch}
          className="bg-accent-600 hover:bg-accent-700 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
        >
          <Search className="size-4" aria-hidden />
          Search {SITE.name}
        </button>
        <Link to="/" activeOptions={EXACT} className={NOT_FOUND_LINK}>
          Home
        </Link>
        <Link to="/categories" activeOptions={EXACT} className={NOT_FOUND_LINK}>
          All categories
        </Link>
        <Link
          to="/places/$type"
          params={{ type: 'country' }}
          activeOptions={EXACT}
          className={NOT_FOUND_LINK}
        >
          Countries
        </Link>
        <Link
          to="/places/$type"
          params={{ type: 'state' }}
          activeOptions={EXACT}
          className={NOT_FOUND_LINK}
        >
          US states
        </Link>
      </div>
    </div>
  );
}
