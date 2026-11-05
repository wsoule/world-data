import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';

import { CategoryGlyph, categoryTint } from './categoryIcons';
import {
  CategoryMixChart,
  TYPE_LABELS,
  TYPE_NOUNS,
  typeColors,
} from './CategoryMixChart';
import { type CategorySummary, summarizeCategories } from './categoryStats';
import { TYPE_ICONS } from '~/components/TypeTabs';
import { Badge, Card, cx, PageHeader } from '~/components/ui';
import { manifestQuery, topicsIndexQuery } from '~/data/api';
import { ENTITY_TYPES } from '~/data/types';
import { TYPE_SHORT } from '~/features/search/results';
import { useTheme } from '~/lib/theme';

export function CategoriesPage() {
  const { data: manifest } = useSuspenseQuery(manifestQuery);
  const { data: topics } = useSuspenseQuery(topicsIndexQuery);
  const navigate = useNavigate();
  const theme = useTheme();

  const summaries = useMemo(
    () => summarizeCategories(manifest, topics),
    [manifest, topics]
  );
  const colors = typeColors(theme);
  const presentTypes = ENTITY_TYPES.filter((t) =>
    summaries.some((s) => s.byType.some((b) => b.type === t))
  );

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle={`${topics.length.toLocaleString('en-US')} topics in ${summaries.length} categories, covering countries, US states, cities and counties.`}
      />

      <Card
        className="mb-8"
        title="Where the topics are"
        subtitle="Topics per category, split by place type. Click a bar to open the category."
        actions={
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {presentTypes.map((t) => (
              <li
                key={t}
                className="text-muted inline-flex items-center gap-1.5"
              >
                <span
                  className="size-2.5 rounded-sm"
                  style={{ backgroundColor: colors[t] }}
                  aria-hidden
                />
                {TYPE_LABELS[t]}
              </li>
            ))}
          </ul>
        }
      >
        <CategoryMixChart
          summaries={summaries}
          onSelect={(category) =>
            void navigate({
              to: '/categories/$category',
              params: { category },
            })
          }
        />
      </Card>

      <h2 className="mb-3 text-lg font-semibold tracking-tight">
        All categories
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaries.map((s) => (
          <CategoryCard key={s.id} summary={s} colors={colors} />
        ))}
      </div>

      <h2 className="mt-10 mb-1 text-lg font-semibold tracking-tight">
        Browse by place
      </h2>
      <p className="text-muted mb-3 text-sm">
        Every country, state, city and county, with its profile and rankings.
      </p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {manifest.types.map((t) => {
          const Icon = TYPE_ICONS[t.id];
          return (
            <li key={t.id}>
              <Link
                to="/places/$type"
                params={{ type: t.id }}
                className="card group hover:border-accent-300 dark:hover:border-accent-700 flex h-full items-center gap-3 p-3 transition-colors"
              >
                <span className="bg-surface-2 text-accent-600 dark:text-accent-300 grid size-9 shrink-0 place-items-center rounded-xl">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="group-hover:text-accent-700 dark:group-hover:text-accent-300 block truncate font-semibold">
                    {t.label}
                  </span>
                  <span className="text-muted tabular block truncate text-xs">
                    {t.entities.toLocaleString('en-US')} places ·{' '}
                    {t.topics.toLocaleString('en-US')} topics
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CategoryCard({
  summary,
  colors,
}: {
  summary: CategorySummary;
  colors: ReturnType<typeof typeColors>;
}) {
  return (
    <section
      className="card flex flex-col p-4"
      aria-labelledby={`cat-${summary.id}`}
    >
      <Link
        to="/categories/$category"
        params={{ category: summary.id }}
        className="group -m-1 flex items-center gap-3 rounded-xl p-1"
      >
        <span
          className={cx(
            'grid size-10 shrink-0 place-items-center rounded-xl',
            categoryTint(summary.id)
          )}
        >
          <CategoryGlyph id={summary.id} className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            id={`cat-${summary.id}`}
            className="group-hover:text-accent-700 dark:group-hover:text-accent-300 block truncate font-semibold"
          >
            {summary.label}
          </span>
          <span className="text-muted tabular block text-xs">
            {summary.total.toLocaleString('en-US')} topics
          </span>
        </span>
        <ArrowRight
          className="text-muted size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>

      {/* Share of this category's topics by place type */}
      <div
        className="bg-surface-2 mt-4 flex h-1.5 overflow-hidden rounded-full"
        aria-hidden
      >
        {summary.byType.map((t) => (
          <span
            key={t.type}
            style={{
              width: `${(t.count / Math.max(1, summary.total)) * 100}%`,
              backgroundColor: colors[t.type],
            }}
          />
        ))}
      </div>
      <ul className="text-muted tabular mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {summary.byType.map((t) => (
          <li key={t.type}>
            <Link
              to="/categories/$category"
              params={{ category: summary.id }}
              // Opens the hub on this place type through history state: the link stays the
              // bare hub URL, which crawlers may follow.
              state={{ categoryType: t.type }}
              className="hover:text-app"
            >
              {t.count.toLocaleString('en-US')} {TYPE_NOUNS[t.type]}
            </Link>
          </li>
        ))}
      </ul>

      <ul className="border-app mt-4 space-y-1 border-t pt-3">
        {summary.examples.map((t) => (
          <li key={`${t.type}:${t.slug}`}>
            <Link
              to="/topics/$type/$slug"
              params={{ type: t.type, slug: t.slug }}
              className="hover:bg-surface-2 -mx-2 flex items-center gap-2 rounded-lg px-2 py-1 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <Badge className="shrink-0">{TYPE_SHORT[t.type]}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
