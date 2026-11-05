import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, ChevronRight, Search } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';

import { HomeMaps } from './HomeMaps';
import { PresetCards } from './PresetCards';
import { TYPE_ICONS } from '~/components/TypeTabs';
import { Badge, cx } from '~/components/ui';
import type { StorySummary } from '~/content/storyTypes';
import { homeMapsQuery, manifestQuery, storiesIndexQuery } from '~/data/api';
import { strengthWord } from '~/features/articles/prose';
import { StoryThumb } from '~/features/articles/StoryChart';
import { CategoryGlyph } from '~/features/categories/categoryIcons';
import { GOALS } from '~/features/search/goals';
import {
  searchShortcutLabel,
  usePlatformLabel,
} from '~/features/search/platform';
import { TYPE_PLURAL, TYPE_SHORT } from '~/features/search/results';
import {
  openSearch,
  openSearchForGoal,
  openSearchWith,
} from '~/features/search/store';

const HERO_QUERIES = ['median income', 'crime', 'Japan', 'happiest', 'TX'];

export function HomePage() {
  const { data: manifest } = useSuspenseQuery(manifestQuery);
  const { data: stories } = useSuspenseQuery(storiesIndexQuery);
  // "Popular topics" come with the home maps file, so the page skips the index of every topic.
  const { data: homeFile } = useSuspenseQuery(homeMapsQuery);
  const popular = homeFile.popular;
  const featured = stories.filter((s) => s.featured).slice(0, 6);

  const totals = useMemo(
    () =>
      manifest.types.reduce(
        (acc, t) => ({
          places: acc.places + t.entities,
          metrics: acc.metrics + t.numericMetrics,
          topics: acc.topics + t.topics,
        }),
        { places: 0, metrics: 0, topics: 0 }
      ),
    [manifest]
  );

  return (
    <div className="space-y-16 pb-4">
      <Hero places={totals.places} metrics={totals.metrics} />

      <Section
        title="Maps"
        subtitle="Where things are highest and lowest. Open a map for the full ranking."
      >
        <HomeMaps />
      </Section>

      <Section
        title="What goes with what"
        subtitle="Live charts from the data. Open one to highlight places, colour by party or swap a statistic, or read the story behind it."
        action={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              to="/articles"
              className="text-accent-600 dark:text-accent-300 text-sm font-medium hover:underline"
            >
              All data stories
            </Link>
            <Link
              to="/compare"
              search={{ type: 'state', view: 'scatter', m: [] }}
              className="text-accent-600 dark:text-accent-300 text-sm font-medium hover:underline"
            >
              Compare any two statistics
            </Link>
          </div>
        }
      >
        <ul className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((s) => (
            <li key={s.slug}>
              <ConnectionCard story={s} />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Browse places"
        subtitle="Profiles, rankings and every statistic for each place."
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {manifest.types.map((t) => {
            const Icon = TYPE_ICONS[t.id];
            return (
              <Link
                key={t.id}
                to="/places/$type"
                params={{ type: t.id }}
                className="card group hover:border-accent-300 dark:hover:border-accent-700 flex flex-col gap-3 p-4 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="bg-surface-2 text-accent-600 dark:text-accent-300 grid size-9 place-items-center rounded-xl">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <ChevronRight
                    className="text-muted size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </div>
                <div>
                  <div className="font-semibold">{t.label}</div>
                  <div className="tabular text-2xl font-semibold tracking-tight">
                    {t.entities.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="text-muted tabular text-xs">
                  {t.numericMetrics.toLocaleString('en-US')} metrics ·{' '}
                  {t.topics.toLocaleString('en-US')} topics
                </div>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section
        title="Explore by category"
        subtitle={`${manifest.categories.length} themes, from economics to sports.`}
        action={
          <Link
            to="/categories"
            className="text-accent-600 dark:text-accent-300 inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            All categories <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {manifest.categories.map((c) => (
            <Link
              key={c.id}
              to="/categories/$category"
              params={{ category: c.id }}
              className="border-app bg-surface hover:bg-surface-2 group flex items-center gap-3 rounded-xl border p-3 transition-colors"
            >
              <span
                className={cx(
                  'grid size-9 shrink-0 place-items-center rounded-lg',
                  'bg-surface-2 text-muted'
                )}
              >
                <CategoryGlyph id={c.id} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {c.label}
                </span>
                <span className="text-muted tabular block text-xs">
                  {c.topics.toLocaleString('en-US')} topics
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section
        title="Start comparing"
        subtitle="Ready-made comparisons in the workbench: a combined ranking, an overlay, correlations and a map. Swap any statistic once you are there."
      >
        <PresetCards />
      </Section>

      <Section
        title="Popular topics"
        subtitle="The rankings people look up most."
      >
        <ul className="card grid grid-cols-1 overflow-hidden md:grid-cols-2">
          {popular.map((t, i) => (
            <li
              key={`${t.type}:${t.slug}`}
              className={cx(
                'border-app',
                i > 0 && 'border-t',
                i === 1 && 'md:border-t-0',
                i % 2 === 1 && 'md:border-l'
              )}
            >
              <Link
                to="/topics/$type/$slug"
                params={{ type: t.type, slug: t.slug }}
                className="hover:bg-surface-2 group flex items-center gap-3 px-4 py-3 transition-colors"
              >
                <span className="text-muted tabular w-5 shrink-0 text-right text-sm">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {t.title}
                  </span>
                  <span className="text-muted tabular block text-xs">
                    {t.n.toLocaleString('en-US')} {TYPE_PLURAL[t.type]} ·{' '}
                    {t.metrics} {t.metrics === 1 ? 'metric' : 'metrics'}
                  </span>
                </span>
                <Badge>{TYPE_SHORT[t.type]}</Badge>
                <ChevronRight
                  className="text-muted size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Hero({ places, metrics }: { places: number; metrics: number }) {
  const shortcut = usePlatformLabel(searchShortcutLabel, 'Ctrl K');
  return (
    <section className="px-0 pt-8 pb-2 text-center md:pt-14">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          Every ranking about the world, finally comparable
        </h1>
        <p className="text-muted mx-auto mt-4 max-w-2xl text-base text-balance md:text-lg">
          {metrics.toLocaleString('en-US')} statistics on{' '}
          {places.toLocaleString('en-US')} countries, US states, cities and
          counties. Look one up, compare places, or see what goes together.
        </p>

        <button
          type="button"
          onClick={openSearch}
          aria-label="Search places, metrics and topics"
          className="border-app bg-surface hover:border-accent-300 dark:hover:border-accent-700 focus-visible:outline-accent-500 group mx-auto mt-8 flex h-14 w-full max-w-xl items-center gap-3 rounded-2xl border px-4 text-left transition-colors focus-visible:outline-2"
        >
          <Search
            className="text-accent-600 dark:text-accent-300 size-5 shrink-0"
            aria-hidden
          />
          <span className="text-muted min-w-0 flex-1 truncate text-base">
            Search “median income”, “Japan”, “crime”…
          </span>
          <kbd className="border-app bg-surface-2 text-muted hidden rounded-md border px-2 py-0.5 font-mono text-xs sm:inline">
            {shortcut}
          </kbd>
        </button>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-sm">
          <span className="text-muted mr-1">Try</span>
          {HERO_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => openSearchWith(q)}
              className="border-app bg-surface/70 text-muted hover:text-app hover:border-accent-300 rounded-full border px-2.5 py-0.5 text-xs transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-sm">
          <span className="text-muted mr-1">I’m</span>
          {GOALS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => openSearchForGoal(g.id)}
              className="border-accent-200 dark:border-accent-800 bg-accent-50/70 dark:bg-accent-900/20 text-accent-800 dark:text-accent-200 hover:border-accent-400 rounded-full border px-2.5 py-0.5 text-xs transition-colors"
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-muted mt-0.5 text-sm">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const PLACES: Record<StorySummary['type'], string> = {
  state: 'US states',
  county: 'US counties',
  city: 'US cities',
  country: 'countries',
  'world-city': 'world cities',
};

/**
 * A live comparison on the home page: the pair's chart, its question and how strong the link is.
 * The chart and title open the interactive overlay with the same two statistics (and party
 * colouring); a separate link under it opens the written data story about the pair.
 */
function ConnectionCard({ story }: { story: StorySummary }) {
  const w = strengthWord(story.r);
  return (
    <div>
      <Link
        to="/compare"
        search={{
          type: story.type,
          view: 'scatter',
          m: [story.xId, story.yId],
          x: story.xId,
          y: story.yId,
          c: story.colorId ?? undefined,
          log: story.logX ? ['x'] : undefined,
        }}
        className="group block"
      >
        <StoryThumb
          story={story}
          className="border-app bg-surface group-hover:border-accent-300 dark:group-hover:border-accent-700 h-auto w-full rounded-xl border p-2 transition-colors"
        />
        <h3 className="group-hover:text-accent-700 dark:group-hover:text-accent-300 mt-3 text-base leading-snug font-semibold text-balance">
          {story.title}
        </h3>
        <p className="text-muted mt-1 text-sm">
          {w == null
            ? 'No clear link'
            : `${w.charAt(0).toUpperCase()}${w.slice(1)} link`}{' '}
          across {story.n.toLocaleString('en-US')} {PLACES[story.type]}
        </p>
      </Link>
      <Link
        to="/articles/$slug"
        params={{ slug: story.slug }}
        className="text-accent-600 dark:text-accent-300 mt-2 inline-flex items-center gap-1 text-sm font-medium hover:underline"
      >
        Read the story
        <span className="sr-only">: {story.title}</span>
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
