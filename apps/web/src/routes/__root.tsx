import type { QueryClient } from '@tanstack/react-query';
import {
  type AnyRouteMatch,
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useHydrated,
  useMatch,
  useRouterState,
} from '@tanstack/react-router';
import {
  BarChart3,
  Compass,
  MapPinned,
  Moon,
  Scale,
  Search,
  Sun,
  Trophy,
} from 'lucide-react';
import { type ReactNode, Suspense } from 'react';

import { BrandMark } from '~/components/BrandMark';
import {
  NOT_FOUND_DESCRIPTION,
  NOT_FOUND_TITLE,
  PageSpinner,
} from '~/components/feedback';
import { cx } from '~/components/ui';
import { manifestQuery } from '~/data/api';
import type { CompareSearch } from '~/features/compare/state';
import {
  searchShortcutLabel,
  usePlatformLabel,
} from '~/features/search/platform';
import { SearchPalette } from '~/features/search/SearchPalette';
import { openSearch } from '~/features/search/store';
import { setTheme, THEME_BOOT_SCRIPT, useTheme } from '~/lib/theme';
import { absoluteUrl, SITE } from '~/site';
import appCss from '~/styles.css?url';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    loader: ({ context }) => context.queryClient.ensureQueryData(manifestQuery),
    // An unknown path renders the not-found view under this route (the router flags the root
    // match), so the server-rendered page and the static 404.html carry the not-found title.
    head: ({ match }) => ({
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          title:
            match._notFound === true
              ? NOT_FOUND_TITLE
              : `${SITE.name} — ${SITE.tagline}`,
        },
        {
          name: 'description',
          content:
            match._notFound === true ? NOT_FOUND_DESCRIPTION : SITE.description,
        },
        { name: 'theme-color', content: '#4f46e5' },
        { property: 'og:site_name', content: SITE.name },
        { property: 'og:locale', content: SITE.locale },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { property: 'og:image', content: absoluteUrl('/og.png') },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:image', content: absoluteUrl('/og.png') },
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: SITE.name,
            url: absoluteUrl('/'),
            description: SITE.description,
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: `${absoluteUrl('/search')}?q={search_term_string}`,
              },
              'query-input': 'required name=search_term_string',
            },
          }),
        },
      ],
    }),
    shellComponent: RootDocument,
    component: RootLayout,
  }
);

/** The HTML document every page renders into (server and client). */
function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line react/no-danger -- static theme bootstrap */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8">
        <Suspense fallback={<PageSpinner />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <SearchPalette />
    </div>
  );
}

type NavId = 'explore' | 'places' | 'compare' | 'rankings' | 'vs';

/**
 * Link activeOptions for the header and footer. By default a link counts as the current page
 * (aria-current, the "active" class) on every URL below its path, but a place report card is not
 * the "US states" page, and an unknown URL such as /places/state/nowhere or /compare/xyz, which
 * gets the static 404.html, must render the same links as that file. So links to a list page
 * match its path exactly with any search params (EXACT_PATH), and links that carry search params
 * match only that exact URL (EXACT).
 */
const EXACT_PATH = { exact: true, includeSearch: false } as const;
const EXACT = { exact: true } as const;

/**
 * Whether the page shows a not-found view: an unknown path (the router flags the root match) or a
 * loader that threw notFound().
 */
function showsNotFound(matches: readonly AnyRouteMatch[]): boolean {
  return matches.some((m) => m._notFound === true || m.status === 'notFound');
}

/**
 * Which main-nav item the current URL belongs to. /compare counts as Rankings only on the
 * combined-ranking view and as Compare on every other view; the view is a search param, which
 * prerendered HTML does not have, so it is read only once `hydrated`. A not-found view belongs
 * to none, whatever its URL: the static 404.html is rendered once for an unmatched path and
 * served for every unknown URL, so the chrome around it must not depend on the address.
 */
function useActiveNav(hydrated: boolean): NavId | null {
  return useRouterState({
    select: (s): NavId | null => {
      if (showsNotFound(s.matches)) return null;
      const path = s.location.pathname;
      if (path.startsWith('/categories')) return 'explore';
      if (path.startsWith('/places')) return 'places';
      if (path.startsWith('/vs')) return 'vs';
      if (path.startsWith('/compare'))
        return hydrated && s.location.search.view === 'ranking'
          ? 'rankings'
          : 'compare';
      return null;
    },
  });
}

/** Main navigation links; shared by the desktop bar and the mobile tab row. */
function NavLinks({ variant }: { variant: 'desktop' | 'mobile' }) {
  const hydrated = useHydrated();
  const active = useActiveNav(hydrated);
  // Switching between Compare and Rankings keeps the current metric basket. The basket is in the
  // search params, so the first (hydrating) render links the defaults like the prerendered HTML,
  // and a not-found view never takes it from its URL.
  const compare = useMatch({
    from: '/compare',
    shouldThrow: false,
    select: (m) => m.search,
  });
  const base: CompareSearch =
    hydrated &&
    compare != null &&
    (active === 'compare' || active === 'rankings')
      ? compare
      : { type: 'state', view: 'scatter', m: [] };
  const compareSearch: CompareSearch =
    base.view === 'ranking' ? { ...base, view: 'scatter' } : base;
  const rankingSearch: CompareSearch = { ...base, view: 'ranking' };

  const item = (id: NavId, label: string, short: string, icon: ReactNode) => ({
    id,
    label,
    short,
    icon,
  });
  const items = [
    item('explore', 'Explore', 'Explore', <Compass aria-hidden />),
    item('places', 'Places', 'Places', <MapPinned aria-hidden />),
    item('compare', 'Compare', 'Compare', <BarChart3 aria-hidden />),
    item('rankings', 'Rankings', 'Rankings', <Trophy aria-hidden />),
    item('vs', 'Head to head', 'Versus', <Scale aria-hidden />),
  ];

  const className = (id: NavId) =>
    variant === 'desktop'
      ? cx(
          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors [&_svg]:size-4',
          active === id
            ? 'bg-surface-2 text-app'
            : 'text-muted hover:bg-surface-2 hover:text-app'
        )
      : cx(
          'flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium [&_svg]:size-[18px]',
          active === id
            ? 'text-accent-700 dark:text-accent-300 bg-accent-50 dark:bg-accent-900/30'
            : 'text-muted'
        );

  return (
    <>
      {items.map((n) => (
        <NavTarget
          key={n.id}
          id={n.id}
          className={className(n.id)}
          current={active === n.id}
          compareSearch={compareSearch}
          rankingSearch={rankingSearch}
        >
          {n.icon}
          <span>{variant === 'desktop' ? n.label : n.short}</span>
        </NavTarget>
      ))}
    </>
  );
}

/** The typed router link behind one main-nav item. */
function NavTarget({
  id,
  className,
  current,
  compareSearch,
  rankingSearch,
  children,
}: {
  id: NavId;
  className: string;
  current: boolean;
  compareSearch: CompareSearch;
  rankingSearch: CompareSearch;
  children: ReactNode;
}) {
  const common = {
    className,
    'aria-current': current ? ('page' as const) : undefined,
  };
  switch (id) {
    case 'explore':
      return (
        <Link {...common} to="/categories" activeOptions={EXACT_PATH}>
          {children}
        </Link>
      );
    case 'places':
      return (
        <Link
          {...common}
          to="/places/$type"
          params={{ type: 'country' }}
          activeOptions={EXACT_PATH}
        >
          {children}
        </Link>
      );
    case 'compare':
      return (
        <Link
          {...common}
          to="/compare"
          search={compareSearch}
          activeOptions={EXACT}
        >
          {children}
        </Link>
      );
    case 'rankings':
      return (
        <Link
          {...common}
          to="/compare"
          search={rankingSearch}
          activeOptions={EXACT}
        >
          {children}
        </Link>
      );
    case 'vs':
      return (
        <Link
          {...common}
          to="/vs"
          search={{ type: 'state', e: [] }}
          activeOptions={EXACT}
        >
          {children}
        </Link>
      );
  }
}

function Header() {
  const theme = useTheme();
  const shortcut = usePlatformLabel(searchShortcutLabel, 'Ctrl K');
  return (
    <header className="border-app bg-surface/85 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 md:gap-3 md:px-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
          aria-label={`${SITE.name} home`}
        >
          <BrandMark className="size-7 shadow-sm" />
          <span className="hidden sm:inline">{SITE.name}</span>
        </Link>
        <nav
          className="ml-2 hidden items-center gap-0.5 md:flex"
          aria-label="Main"
        >
          <NavLinks variant="desktop" />
        </nav>
        <button
          type="button"
          onClick={openSearch}
          aria-label="Search places, metrics and topics"
          aria-keyshortcuts="Meta+K Control+K /"
          className="border-app bg-surface-2 text-muted hover:border-accent-300 hover:text-app ml-auto flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors md:max-w-xs"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="flex-1 truncate text-left">
            Search places, metrics…
          </span>
          <kbd className="border-app bg-surface hidden rounded border px-1.5 font-mono text-[10px] sm:inline">
            {shortcut}
          </kbd>
        </button>
        <button
          type="button"
          aria-label={
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="text-muted hover:bg-surface-2 hover:text-app shrink-0 rounded-lg p-2"
        >
          {theme === 'dark' ? (
            <Sun className="size-4" aria-hidden />
          ) : (
            <Moon className="size-4" aria-hidden />
          )}
        </button>
      </div>
      <nav
        className="border-app grid grid-cols-5 gap-1 border-t px-2 py-1 md:hidden"
        aria-label="Main mobile"
      >
        <NavLinks variant="mobile" />
      </nav>
    </header>
  );
}

function Footer() {
  const data = Route.useLoaderData();
  const totals = data.types.reduce(
    (acc, t) => ({
      places: acc.places + t.entities,
      metrics: acc.metrics + t.numericMetrics,
    }),
    { places: 0, metrics: 0 }
  );
  return (
    <footer className="border-app mt-8 border-t">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-sm md:grid-cols-[1.4fr_1fr_1fr] md:px-6">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <BrandMark className="size-5" />
            {SITE.name}
          </div>
          <p className="text-muted mt-2 max-w-sm text-xs leading-relaxed">
            {totals.metrics.toLocaleString('en-US')} statistics about{' '}
            {totals.places.toLocaleString('en-US')} places, compiled from{' '}
            <a
              className="hover:text-app underline underline-offset-2"
              href="https://worldpopulationreview.com"
              target="_blank"
              rel="noreferrer"
            >
              World Population Review
            </a>{' '}
            and the primary sources cited on each topic. Values may lag their
            sources.
          </p>
        </div>
        <FooterColumn title="Explore">
          <Link
            to="/categories"
            activeOptions={EXACT_PATH}
            className="hover:text-app"
          >
            All categories
          </Link>
          <Link
            to="/places/$type"
            params={{ type: 'country' }}
            activeOptions={EXACT_PATH}
            className="hover:text-app"
          >
            Countries
          </Link>
          <Link
            to="/places/$type"
            params={{ type: 'state' }}
            activeOptions={EXACT_PATH}
            className="hover:text-app"
          >
            US states
          </Link>
          <Link
            to="/search"
            activeOptions={EXACT_PATH}
            className="hover:text-app"
          >
            Search
          </Link>
          <Link
            to="/articles"
            activeOptions={EXACT_PATH}
            className="hover:text-app"
          >
            Data stories
          </Link>
          <Link
            to="/glossary"
            activeOptions={EXACT_PATH}
            className="hover:text-app"
          >
            Glossary
          </Link>
        </FooterColumn>
        <FooterColumn title="Compare">
          <Link
            to="/compare"
            search={{ type: 'state', view: 'scatter', m: [] }}
            activeOptions={EXACT}
            className="hover:text-app"
          >
            Overlay two metrics
          </Link>
          <Link
            to="/compare"
            search={{ type: 'state', view: 'ranking', m: [] }}
            activeOptions={EXACT}
            className="hover:text-app"
          >
            Combined rankings
          </Link>
          <Link
            to="/vs"
            search={{ type: 'state', e: [] }}
            activeOptions={EXACT}
            className="hover:text-app"
          >
            Head to head
          </Link>
          <span className="text-muted/80 text-xs">
            Dataset built{' '}
            {new Date(data.generatedAt).toLocaleDateString('en-US', {
              timeZone: 'UTC',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </FooterColumn>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h2 className="text-muted mb-2 text-xs font-semibold">{title}</h2>
      <div className="text-muted flex flex-col items-start gap-1.5">
        {children}
      </div>
    </div>
  );
}
