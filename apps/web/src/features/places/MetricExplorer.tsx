import { Link } from '@tanstack/react-router';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, X } from 'lucide-react';
import { useDeferredValue, useMemo, useRef, useState } from 'react';

import { PercentileBar, rankText } from './percentile';
import { byKeys, type PlaceMetric } from './profileModel';
import { MetricLink } from './ProfileSections';
import { PolarityIcon } from '~/components/MetricPicker';
import { Card, Segmented } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import { rankOrder } from '~/data/rankOrder';
import { formatInt, formatValue } from '~/lib/format';
import { searchItems } from '~/lib/textSearch';
import type { Theme } from '~/lib/theme';

type SortMode = 'best' | 'worst' | 'name';

type ExplorerItem =
  | {
      kind: 'topic';
      key: string;
      slug: string | null;
      title: string;
      count: number;
    }
  | { kind: 'metric'; key: string; row: PlaceMetric };

const TOPIC_HEIGHT = 40;
const METRIC_HEIGHT = 62;
const BASE_TOPIC = '_base';

// Sort key for one row: directional metrics by percentile, neutral metrics after them (they
// have no better end), so "best first" and "worst first" both read top-down.
function rowKey(r: PlaceMetric, sort: SortMode): number {
  if (sort === 'best') return r.polar ? -r.standing.pct : 1;
  return r.polar ? r.standing.pct : 2;
}

function compareRows(a: PlaceMetric, b: PlaceMetric, sort: SortMode): number {
  if (sort === 'name') return a.metric.label.localeCompare(b.metric.label);
  return byKeys(
    rowKey(a, sort) - rowKey(b, sort),
    b.standing.n - a.standing.n,
    a.metric.label.localeCompare(b.metric.label)
  );
}

/**
 * Every metric with a value for this place, searchable and filterable by category, sorted by
 * percentile or name, optionally grouped under their topic. Virtualized: a well-documented
 * country has over 2,000 metrics.
 */
export function MetricExplorer({
  dataset,
  rows,
  category,
  onCategory,
  categoryLabel,
  theme,
  sizeDriven,
}: {
  dataset: Dataset;
  rows: readonly PlaceMetric[];
  category: string;
  onCategory: (category: string) => void;
  categoryLabel: (id: string) => string;
  theme: Theme;
  /** Metrics that mostly track population, marked in the list */
  sizeDriven: ReadonlySet<number>;
}) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<SortMode>('best');
  const [grouped, setGrouped] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows)
      for (const c of r.metric.cats) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, n]) => ({ id, n, label: categoryLabel(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, categoryLabel]);

  const filtered = useMemo(() => {
    const inCategory =
      category === ''
        ? rows
        : rows.filter((r) => r.metric.cats.includes(category));
    return searchItems(inCategory, deferredQuery, (r) => [
      { text: r.metric.label, weight: 3 },
      { text: dataset.metricContext(r.metric.id) ?? '', weight: 2 },
      { text: `${r.metric.key} ${r.metric.cats.join(' ')}`, weight: 1 },
    ]);
  }, [rows, category, deferredQuery, dataset]);

  const { items, topicCount } = useMemo(
    () => buildItems(dataset, filtered, sort, grouped),
    [dataset, filtered, sort, grouped]
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) =>
      items[i]?.kind === 'topic' ? TOPIC_HEIGHT : METRIC_HEIGHT,
    getItemKey: (i) => items[i]?.key ?? i,
    overscan: 10,
  });

  const total = rows.length;
  return (
    <Card
      title="Every metric"
      subtitle={
        filtered.length === total
          ? `${formatInt(total)} metrics with a value for this place${grouped ? `, in ${formatInt(topicCount)} topics` : ''}`
          : `${formatInt(filtered.length)} of ${formatInt(total)} metrics${grouped ? ` in ${formatInt(topicCount)} topics` : ''}`
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="border-app bg-surface focus-within:border-accent-400 flex w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 sm:w-72">
          <Search className="text-muted size-4 shrink-0" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search metrics…"
            aria-label="Search this place's metrics"
            className="placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <select
          value={category}
          onChange={(e) => onCategory(e.target.value)}
          aria-label="Filter by category"
          className="border-app bg-surface rounded-lg border px-2 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({formatInt(c.n)})
            </option>
          ))}
        </select>
        <Segmented
          ariaLabel="Sort metrics"
          size="sm"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'best', label: 'Best first' },
            { value: 'worst', label: 'Worst first' },
            { value: 'name', label: 'A–Z' },
          ]}
        />
        <label className="text-muted inline-flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(e) => setGrouped(e.target.checked)}
            className="accent-accent-600"
          />
          Group by topic
        </label>
        {category !== '' ? (
          <button
            type="button"
            onClick={() => onCategory('')}
            className="border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-900/40 dark:text-accent-100 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
          >
            {categoryLabel(category)}
            <X className="size-3" aria-label="Clear category filter" />
          </button>
        ) : null}
      </div>
      <div className="-mx-4 -mb-4">
        <div
          ref={scrollRef}
          className="border-app max-h-[40rem] overflow-y-auto border-t"
          role="region"
          aria-label="Metrics for this place"
          tabIndex={0}
        >
          {items.length === 0 ? (
            <p className="text-muted p-8 text-center text-sm">
              No metrics match
              {query.trim() !== '' ? ` “${query.trim()}”` : ''}
              {category !== '' ? ` in ${categoryLabel(category)}` : ''}.
            </p>
          ) : (
            <div
              role="list"
              style={{
                height: virtualizer.getTotalSize(),
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((vi) => {
                const item = items[vi.index];
                return (
                  <div
                    key={vi.key}
                    role="listitem"
                    className="absolute top-0 left-0 w-full"
                    style={{
                      transform: `translateY(${vi.start}px)`,
                      height: vi.size,
                    }}
                  >
                    {item.kind === 'topic' ? (
                      <TopicHeader dataset={dataset} item={item} />
                    ) : (
                      <MetricRow
                        dataset={dataset}
                        row={item.row}
                        grouped={grouped}
                        categoryLabel={categoryLabel}
                        theme={theme}
                        tracksPopulation={sizeDriven.has(item.row.metric.id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// Flatten rows into the virtual list: topic headers followed by their metrics when grouped
// (topics ordered by their best, worst or alphabetical metric), else a single sorted list.
function buildItems(
  dataset: Dataset,
  rows: readonly PlaceMetric[],
  sort: SortMode,
  grouped: boolean
): { items: ExplorerItem[]; topicCount: number } {
  const sorted = [...rows].sort((a, b) => compareRows(a, b, sort));
  if (!grouped)
    return {
      items: sorted.map((row) => ({
        kind: 'metric',
        key: `m${row.metric.id}`,
        row,
      })),
      topicCount: 0,
    };
  const byTopic = new Map<string, PlaceMetric[]>();
  for (const r of sorted) {
    const slug = r.metric.topics[0] ?? BASE_TOPIC;
    const list = byTopic.get(slug);
    if (list == null) byTopic.set(slug, [r]);
    else list.push(r);
  }
  const titleOf = (slug: string) =>
    slug === BASE_TOPIC
      ? 'Population and land'
      : (dataset.topicTitleOf(slug) ?? slug);
  // Rows are already sorted, so each topic's first row is its representative.
  const topics = [...byTopic.entries()].sort((a, b) =>
    sort === 'name'
      ? titleOf(a[0]).localeCompare(titleOf(b[0]))
      : compareRows(a[1][0], b[1][0], sort)
  );
  const items: ExplorerItem[] = [];
  for (const [slug, list] of topics) {
    items.push({
      kind: 'topic',
      key: `t${slug}`,
      slug: slug === BASE_TOPIC ? null : slug,
      title: titleOf(slug),
      count: list.length,
    });
    for (const row of list)
      items.push({ kind: 'metric', key: `m${row.metric.id}`, row });
  }
  return { items, topicCount: topics.length };
}

function TopicHeader({
  dataset,
  item,
}: {
  dataset: Dataset;
  item: Extract<ExplorerItem, { kind: 'topic' }>;
}) {
  return (
    <div className="border-app bg-surface-2 flex h-full items-center justify-between gap-3 border-b px-4">
      {item.slug != null ? (
        <Link
          to="/topics/$type/$slug"
          params={{ type: dataset.type.id, slug: item.slug }}
          className="hover:text-accent-600 dark:hover:text-accent-300 truncate text-xs font-semibold tracking-wide uppercase"
        >
          {item.title}
        </Link>
      ) : (
        <span className="truncate text-xs font-semibold tracking-wide uppercase">
          {item.title}
        </span>
      )}
      <span className="text-muted shrink-0 text-xs">
        {item.count === 1 ? '1 metric' : `${formatInt(item.count)} metrics`}
      </span>
    </div>
  );
}

function MetricRow({
  dataset,
  row,
  grouped,
  categoryLabel,
  theme,
  tracksPopulation,
}: {
  dataset: Dataset;
  row: PlaceMetric;
  grouped: boolean;
  categoryLabel: (id: string) => string;
  theme: Theme;
  tracksPopulation: boolean;
}) {
  const m = row.metric;
  const sub = [
    grouped
      ? m.cats.map(categoryLabel).join(', ')
      : (dataset.metricContext(m.id) ?? ''),
    m.year != null ? String(m.year) : '',
  ]
    .filter((p) => p !== '')
    .join(' · ');
  return (
    <div className="border-app flex h-full flex-col justify-center border-b px-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1 text-sm">
          <MetricLink dataset={dataset} metric={m} />
          <PolarityIcon
            pol={row.polar ? m.pol : 0}
            fmt={m.fmt}
            className="shrink-0"
          />
        </span>
        <span className="tabular shrink-0 text-sm font-medium">
          {formatValue(m, row.standing.value)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-3 text-xs">
        <span className="text-muted flex min-w-0 flex-1 items-center gap-1.5">
          {tracksPopulation ? (
            <span
              className="border-app shrink-0 rounded border px-1 text-[10px] leading-4"
              title="Mostly tracks population size (Spearman ρ ≥ 0.75, or a count whose per-resident figure no longer does), so big places rank high or low regardless"
            >
              tracks population
            </span>
          ) : null}
          <span className="truncate">{sub}</span>
        </span>
        <span className="tabular text-muted hidden w-28 shrink-0 text-right whitespace-nowrap sm:block">
          {rankText(row.standing, rankOrder(m))}
        </span>
        <PercentileBar
          pct={row.standing.pct}
          polar={row.polar}
          theme={theme}
          className="w-24 shrink-0 sm:w-36"
        />
      </div>
    </div>
  );
}
