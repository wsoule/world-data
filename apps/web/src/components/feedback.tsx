import { Link } from '@tanstack/react-router';
import { Loader2, Search } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';

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

export function PageSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
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
