import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  ChartScatter,
  ChevronRight,
  Search,
  Trophy,
} from 'lucide-react';
import { type ReactNode, useMemo } from 'react';

import { HOME_PRESETS, type HomePreset, POPULAR_TOPICS } from './presets';
import { TYPE_ICONS } from '~/components/TypeTabs';
import { Badge, cx } from '~/components/ui';
import { manifestQuery, topicsIndexQuery } from '~/data/api';
import type { EntityType, TopicSummary } from '~/data/types';
import {
  CategoryGlyph,
  categoryTint,
} from '~/features/categories/categoryIcons';
import {
  searchShortcutLabel,
  usePlatformLabel,
} from '~/features/search/platform';
import { TYPE_PLURAL, TYPE_SHORT } from '~/features/search/results';
import { openSearch, openSearchWith } from '~/features/search/store';

const HERO_QUERIES = ['median income', 'crime', 'Japan', 'happiest', 'TX'];

export function HomePage() {
  const { data: manifest } = useSuspenseQuery(manifestQuery);
  const { data: topics } = useSuspenseQuery(topicsIndexQuery);

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

  const popular = useMemo(() => {
    const byKey = new Map(topics.map((t) => [`${t.type}:${t.slug}`, t]));
    return POPULAR_TOPICS.map((p) => byKey.get(`${p.type}:${p.slug}`)).filter(
      (t): t is TopicSummary => t != null
    );
  }, [topics]);

  return (
    <div className="space-y-16 pb-4">
      <Hero
        places={totals.places}
        metrics={totals.metrics}
        topics={totals.topics}
      />

      <Section
        title="Start comparing"
        subtitle="One click into a live comparison — swap any metric once you are there."
        action={
          <Link
            to="/compare"
            search={{ type: 'state', view: 'scatter', m: [] }}
            className="text-accent-600 dark:text-accent-300 inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            Open the workbench <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {HOME_PRESETS.map((p, i) => (
            <PresetCard key={p.id} preset={p} featured={i === 0} />
          ))}
        </div>
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
                  categoryTint(c.id)
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
                    {t.metrics.length}{' '}
                    {t.metrics.length === 1 ? 'metric' : 'metrics'}
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

function Hero({
  places,
  metrics,
  topics,
}: {
  places: number;
  metrics: number;
  topics: number;
}) {
  const shortcut = usePlatformLabel(searchShortcutLabel, 'Ctrl K');
  return (
    <section className="relative isolate -mx-4 -mt-6 px-4 pt-12 pb-4 text-center md:-mx-6 md:-mt-8 md:px-6 md:pt-20">
      {/* Soft accent glow over a faint dot grid, fading out towards the content below. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(48%_75%_at_50%_0%,rgb(79_70_229/0.13),transparent)] dark:bg-[radial-gradient(48%_75%_at_50%_0%,rgb(129_140_248/0.16),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(46%_85%_at_50%_0%,black,transparent)] [background-size:22px_22px]"
      />
      <div className="mx-auto max-w-3xl">
        <p className="border-app bg-surface/80 text-muted tabular mx-auto inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full border px-3 py-1 text-xs shadow-sm backdrop-blur">
          <span className="bg-accent-500 size-1.5 rounded-full" aria-hidden />
          <span>{metrics.toLocaleString('en-US')} statistics</span>
          <span aria-hidden>·</span>
          <span>{places.toLocaleString('en-US')} places</span>
          <span aria-hidden>·</span>
          <span>{topics.toLocaleString('en-US')} topics</span>
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance md:text-6xl">
          Every ranking about the world,{' '}
          <span className="from-accent-600 bg-gradient-to-r to-cyan-600 bg-clip-text text-transparent dark:from-indigo-300 dark:to-cyan-300">
            finally comparable
          </span>
        </h1>
        <p className="text-muted mx-auto mt-4 max-w-2xl text-base text-balance md:text-lg">
          Find any statistic about countries, US states, cities and counties —
          then overlay two, combine many into your own ranking, and see what
          actually goes together.
        </p>

        <button
          type="button"
          onClick={openSearch}
          aria-label="Search places, metrics and topics"
          className="border-app bg-surface hover:border-accent-300 dark:hover:border-accent-700 focus-visible:outline-accent-500 group mx-auto mt-8 flex h-14 w-full max-w-xl items-center gap-3 rounded-2xl border px-4 text-left shadow-lg shadow-slate-900/5 transition-colors focus-visible:outline-2 dark:shadow-black/30"
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

const TYPE_GROUP_LABEL: Record<EntityType, string> = {
  country: 'Countries',
  state: 'US states',
  city: 'US cities',
  'world-city': 'World cities',
  county: 'US counties',
};

function PresetCard({
  preset,
  featured,
}: {
  preset: HomePreset;
  featured: boolean;
}) {
  const ranking = preset.search.view === 'ranking';
  const Icon = ranking ? Trophy : ChartScatter;
  return (
    <Link
      to="/compare"
      search={preset.search}
      className={cx(
        'card group hover:border-accent-300 dark:hover:border-accent-700 flex flex-col p-5 transition-all hover:shadow-md',
        featured &&
          'from-accent-50 to-surface dark:from-accent-900/30 bg-gradient-to-br lg:col-span-2 dark:to-transparent'
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cx(
            'grid size-9 place-items-center rounded-xl',
            ranking
              ? 'bg-accent-600 text-white'
              : 'bg-accent-50 text-accent-600 dark:bg-accent-900/40 dark:text-accent-300'
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="text-muted text-xs font-medium tracking-wide uppercase">
          {ranking ? 'Combined ranking' : 'Overlay'}
        </span>
        <Badge className="ml-auto">
          {TYPE_GROUP_LABEL[preset.search.type]}
        </Badge>
      </div>
      <h3 className="mt-4 text-base font-semibold">{preset.title}</h3>
      <p className="text-muted mt-1 text-sm">{preset.question}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {preset.metrics.map((m, i) => (
          <span
            key={m}
            className="border-app bg-surface inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
          >
            {ranking ? (
              <span className="text-muted tabular">{i + 1}</span>
            ) : (
              <span className="text-muted font-mono text-[10px]">
                {i === 0 ? 'x' : 'y'}
              </span>
            )}
            {m}
          </span>
        ))}
      </div>
      <div className="text-accent-600 dark:text-accent-300 mt-auto flex items-center gap-1 pt-5 text-sm font-medium">
        {preset.cta}
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
    </Link>
  );
}
