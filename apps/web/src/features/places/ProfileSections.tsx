import { Link } from '@tanstack/react-router';
import { ArrowDownRight, ArrowUpRight, Scale } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { placeNoun } from './datasetFacts';
import { pctText, PercentileBar, rankText } from './percentile';
import type { NotableFact, PlaceMetric, SimilarPlace } from './profileModel';
import { type PlaceGroup, shortPlaceName } from './relatedPlaces';
import { EmptyState } from '~/components/feedback';
import { Flag } from '~/components/Flag';
import { PolarityIcon } from '~/components/MetricPicker';
import { Badge, Card, cx } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import type { Entity, Metric } from '~/data/types';
import { formatInt, formatValue, plural } from '~/lib/format';
import type { Theme } from '~/lib/theme';

/**
 * Metric label (or `children`) linking to the metric's primary topic page with the metric
 * focused; plain text for synthetic metrics, which have no topic.
 */
export function MetricLink({
  dataset,
  metric,
  className,
  children,
}: {
  dataset: Dataset;
  metric: Metric;
  className?: string;
  children?: ReactNode;
}) {
  const topic = metric.topics[0];
  const full = dataset.metricFullLabel(metric.id);
  if (topic == null)
    return (
      <span className={cx('truncate', className)} title={full}>
        {children ?? metric.label}
      </span>
    );
  return (
    <Link
      to="/topics/$type/$slug"
      params={{ type: dataset.type.id, slug: topic }}
      search={{ m: metric.id }}
      title={full}
      className={cx(
        'hover:text-accent-600 dark:hover:text-accent-300 truncate hover:underline',
        className
      )}
    >
      {children ?? metric.label}
    </Link>
  );
}

/** Topic title and year shown under a metric label. */
export function metricSubline(dataset: Dataset, m: Metric): string {
  const parts = [dataset.metricContext(m.id) ?? m.cats.join(', ')];
  if (m.year != null) parts.push(String(m.year));
  return parts.filter((p) => p !== '').join(' · ');
}

/** "Best at" / "Worst at" list: label, value, rank and a percentile bar per metric. */
export function StrengthList({
  dataset,
  rows,
  tone,
  theme,
}: {
  dataset: Dataset;
  rows: readonly PlaceMetric[];
  tone: 'good' | 'bad';
  theme: Theme;
}) {
  const Icon = tone === 'good' ? ArrowUpRight : ArrowDownRight;
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-1.5">
          <Icon
            className={cx('size-4', tone === 'good' ? 'text-good' : 'text-bad')}
            aria-hidden
          />
          {tone === 'good' ? 'Best at' : 'Worst at'}
        </span>
      }
      subtitle={
        tone === 'good'
          ? 'Highest percentiles, given whether higher or lower is better'
          : 'Lowest percentiles, given whether higher or lower is better'
      }
    >
      {rows.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">
          Not enough widely ranked metrics for this place.
        </p>
      ) : (
        <ol className="-my-1 divide-y divide-[var(--border)]">
          {rows.map((r) => (
            <li key={r.metric.id} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
                  <MetricLink dataset={dataset} metric={r.metric} />
                  <PolarityIcon pol={r.metric.pol} className="shrink-0" />
                </span>
                <span className="tabular shrink-0 text-sm font-semibold">
                  {formatValue(r.metric, r.standing.value)}
                </span>
              </div>
              <div className="text-muted mt-0.5 truncate text-xs">
                {metricSubline(dataset, r.metric)}
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <PercentileBar
                  pct={r.standing.pct}
                  polar
                  theme={theme}
                  className="flex-1"
                />
                <span className="tabular text-muted w-28 shrink-0 text-right text-xs whitespace-nowrap">
                  {rankText(r.standing)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** Plain-language headline for a #1 / last-place fact. */
export function factHeadline(f: NotableFact): string {
  const m = f.row.metric;
  if (m.fmt === 'ranking')
    return f.end === 'first' ? `#1 in ${m.label}` : `Last in ${m.label}`;
  const high = (f.end === 'first') === (f.row.direction === 1);
  return `${high ? 'Highest' : 'Lowest'} ${m.label}`;
}

const FACTS_COLLAPSED = 8;

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Metrics where the place tops or trails the ranking, best-covered and most decisive first. */
export function NotableFacts({
  dataset,
  facts,
}: {
  dataset: Dataset;
  facts: readonly NotableFact[];
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? facts : facts.slice(0, FACTS_COLLAPSED);
  const noun = placeNoun(dataset);
  return (
    <Card
      title="Notable facts"
      subtitle={`Where it ranks first or last among ${noun}`}
    >
      {facts.length === 0 ? (
        <p className="text-muted py-4 text-center text-sm">
          Never first or last on a widely ranked metric.
        </p>
      ) : (
        <>
          <ul
            className={cx(
              '-my-1 divide-y divide-[var(--border)]',
              expanded && 'max-h-[28rem] overflow-y-auto pr-1'
            )}
          >
            {shown.map((f) => {
              const tone = !f.row.polar
                ? 'neutral'
                : f.end === 'first'
                  ? 'good'
                  : 'bad';
              return (
                <li
                  key={f.row.metric.id}
                  className="flex items-start gap-2.5 py-2"
                >
                  <Badge
                    tone={tone}
                    className="mt-0.5 w-12 justify-center"
                    title={
                      f.row.polar
                        ? undefined
                        : 'Neither higher nor lower is better'
                    }
                  >
                    {tone === 'good'
                      ? 'Best'
                      : tone === 'bad'
                        ? 'Worst'
                        : 'Fact'}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <MetricLink
                        dataset={dataset}
                        metric={f.row.metric}
                        className="font-medium"
                      >
                        {factHeadline(f)}
                      </MetricLink>
                      <span className="tabular text-muted shrink-0 text-xs">
                        {formatValue(f.row.metric, f.row.standing.value)}
                      </span>
                    </div>
                    <div className="text-muted truncate text-xs">
                      {`${upperFirst(rankText(f.row.standing))} ${noun} · `}
                      {metricSubline(dataset, f.row.metric)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {facts.length > FACTS_COLLAPSED ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="text-accent-600 dark:text-accent-300 mt-3 text-xs font-medium hover:underline"
            >
              {expanded ? 'Show fewer' : `Show all ${facts.length}`}
            </button>
          ) : null}
        </>
      )}
    </Card>
  );
}

/**
 * Nearest neighbours by percentile profile, with a shortcut to a head-to-head. The basis is
 * the place's share of `similarityBasis`: widely reported rates, scores and averages from
 * several categories, without population, area or raw totals.
 */
export function SimilarPlaces({
  dataset,
  entity,
  similar,
  basisMetrics,
  basisCategories,
}: {
  dataset: Dataset;
  entity: Entity;
  similar: readonly SimilarPlace[];
  /** Basis metrics this place has a value for */
  basisMetrics: number;
  /** Categories those metrics come from */
  basisCategories: number;
}) {
  const type = dataset.type.id;
  return (
    <Card
      title="Similar places"
      subtitle={`Closest percentiles on ${plural(basisMetrics, 'widely reported measure')} from ${plural(basisCategories, 'category', 'categories')}, leaving out size and totals`}
    >
      {similar.length === 0 ? (
        <EmptyState title="No close matches">
          Too few shared metrics to compare this place with others.
        </EmptyState>
      ) : (
        <ol className="-my-1 space-y-1">
          {similar.map((s) => {
            const e = dataset.entities[s.index];
            return (
              <li key={e.id} className="flex items-center gap-2.5 py-1.5">
                <Flag entity={e} type={type} size={20} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link
                      to="/places/$type/$slug"
                      params={{ type, slug: e.slug }}
                      className="hover:text-accent-600 dark:hover:text-accent-300 truncate text-sm font-medium"
                    >
                      {e.name}
                    </Link>
                    <span
                      className="tabular text-muted shrink-0 text-xs"
                      title={`Compared on ${plural(s.shared, 'shared measure')}`}
                    >
                      {pctText(s.similarity)}% similar
                    </span>
                  </div>
                  <div className="bg-surface-2 mt-1 h-1 overflow-hidden rounded-full">
                    <div
                      className="bg-accent-500 h-full rounded-full"
                      style={{ width: `${s.similarity * 100}%` }}
                    />
                  </div>
                  {s.shared < basisMetrics ? (
                    <div className="tabular text-muted mt-0.5 text-[11px]">
                      Compared on {formatInt(s.shared)} of{' '}
                      {formatInt(basisMetrics)}
                    </div>
                  ) : null}
                </div>
                <Link
                  to="/vs"
                  search={{ type, e: [entity.id, e.id] }}
                  className="text-muted hover:bg-surface-2 hover:text-app rounded-md p-1.5"
                  aria-label={`Compare ${entity.name} with ${e.name}`}
                  title="Head to head"
                >
                  <Scale className="size-4" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/** Links shown before "Show all"; the rest are in the HTML but hidden until expanded. */
const RELATED_COLLAPSED = 20;

/**
 * "Cities in California" style card: every place inside the profiled one, largest first,
 * each linking to its report card. All links render (so the prerendered page links every
 * one), but long lists show only the first few until expanded.
 */
export function RelatedPlaceList({ group }: { group: PlaceGroup }) {
  const [expanded, setExpanded] = useState(false);
  const count = group.places.length;
  const collapsible = count > RELATED_COLLAPSED;
  const [one, many] =
    group.type === 'county' ? ['county', 'counties'] : ['city', 'cities'];
  return (
    <Card
      title={group.title}
      subtitle={`${plural(count, one, many)} with a report card, largest first`}
    >
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3 lg:grid-cols-5">
        {group.places.map((p, k) => (
          <li
            key={p.slug}
            className={cx(
              'min-w-0',
              collapsible && !expanded && k >= RELATED_COLLAPSED && 'hidden'
            )}
          >
            <Link
              to="/places/$type/$slug"
              params={{ type: group.type, slug: p.slug }}
              className="hover:text-accent-600 dark:hover:text-accent-300 block truncate hover:underline"
              title={p.name}
            >
              {shortPlaceName(p.name)}
            </Link>
          </li>
        ))}
      </ul>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="text-accent-600 dark:text-accent-300 mt-3 text-xs font-medium hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${formatInt(count)}`}
        </button>
      ) : null}
    </Card>
  );
}

/** Small "#1 of 235" style tile for the profile header. */
export function HeaderStat({
  label,
  value,
  rank,
}: {
  label: string;
  value: string;
  rank?: string;
}) {
  return (
    <div className="border-app bg-surface min-w-0 rounded-xl border px-3 py-2">
      <div className="text-muted truncate text-xs">{label}</div>
      <div className="tabular truncate text-base font-semibold">{value}</div>
      {rank != null ? (
        <div className="text-muted truncate text-[11px]">{rank}</div>
      ) : null}
    </div>
  );
}
