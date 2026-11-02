import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from '@tanstack/react-router';
import {
  BarChart3,
  Compass,
  Globe2,
  Moon,
  Scale,
  Search,
  Sun,
  Trophy,
} from 'lucide-react';
import { Suspense } from 'react';

import { PageSpinner } from '~/components/feedback';
import { manifestQuery } from '~/data/api';
import { SearchPalette } from '~/features/search/SearchPalette';
import { openSearch } from '~/features/search/store';
import { setTheme, useTheme } from '~/lib/theme';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    loader: ({ context }) => context.queryClient.ensureQueryData(manifestQuery),
    component: RootLayout,
  }
);

const NAV = [
  { to: '/categories', label: 'Explore', icon: Compass },
  {
    to: '/compare',
    label: 'Compare',
    icon: BarChart3,
    search: { view: 'scatter' },
  },
  {
    to: '/compare',
    label: 'Rankings',
    icon: Trophy,
    search: { view: 'ranking' },
  },
  { to: '/vs', label: 'Head to head', icon: Scale },
] as const;

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

function Header() {
  const theme = useTheme();
  return (
    <header className="border-app bg-surface/85 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="bg-accent-600 grid size-7 place-items-center rounded-lg text-white">
            <Globe2 className="size-4" />
          </span>
          <span className="hidden sm:inline">World Data</span>
        </Link>
        <nav
          className="ml-2 hidden items-center gap-1 md:flex"
          aria-label="Main"
        >
          {NAV.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              search={'search' in n ? n.search : undefined}
              className="text-muted hover:bg-surface-2 hover:text-app inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm"
              activeProps={{ className: 'text-app! bg-surface-2' }}
              activeOptions={{ includeSearch: false }}
            >
              <n.icon className="size-4" aria-hidden />
              {n.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={openSearch}
          className="border-app bg-surface-2 text-muted hover:border-accent-300 ml-auto flex w-full max-w-xs items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Search data, places…</span>
          <kbd className="border-app hidden rounded border px-1.5 font-mono text-[10px] sm:inline">
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          aria-label={
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="text-muted hover:bg-surface-2 hover:text-app rounded-lg p-2"
        >
          {theme === 'dark' ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </button>
      </div>
      <nav
        className="border-app flex gap-1 overflow-x-auto border-t px-2 py-1 md:hidden"
        aria-label="Main mobile"
      >
        {NAV.map((n) => (
          <Link
            key={n.label}
            to={n.to}
            search={'search' in n ? n.search : undefined}
            className="text-muted inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs"
          >
            <n.icon className="size-3.5" aria-hidden />
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function Footer() {
  const data = Route.useLoaderData();
  return (
    <footer className="border-app border-t">
      <div className="text-muted mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs md:px-6">
        <p>
          Data compiled from{' '}
          <a
            className="hover:text-app underline"
            href="https://worldpopulationreview.com"
            target="_blank"
            rel="noreferrer"
          >
            World Population Review
          </a>{' '}
          and the primary sources cited on each topic. Values may lag their
          sources.
        </p>
        <p>Dataset built {new Date(data.generatedAt).toLocaleDateString()}</p>
      </div>
    </footer>
  );
}
