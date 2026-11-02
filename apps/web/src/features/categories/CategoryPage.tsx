import {
  type QueryObserverResult,
  useQueries,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { getRouteApi, Link, useHydrated } from '@tanstack/react-router';
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  type SortingState,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ChartScatter,
  ChevronRight,
  Grid3x3,
  Search,
  Trophy,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { CategoryGlyph, categoryTint } from './categoryIcons';
import { TYPE_LABELS, TYPE_NOUNS } from './CategoryMixChart';
import {
  dominantType,
  latestUpdate,
  overlayPartner,
  summarizeCategories,
  topCategoryMetrics,
  topicInfoMap,
} from './categoryStats';
import { Spinner } from '~/components/feedback';
import { PolarityIcon } from '~/components/MetricPicker';
import { Badge, cx, Segmented, Select } from '~/components/ui';
import { manifestQuery, metricsQuery, topicsIndexQuery } from '~/data/api';
import type { EntityType, Metric, TopicSummary } from '~/data/types';
import { TYPE_PLURAL, TYPE_SHORT } from '~/features/search/results';
import { normalizeText } from '~/features/search/searchIndex';
import { useTitle } from '~/lib/useTitle';

const route = getRouteApi('/categories/$category');

/** Rows shown before "Show all". */
const ROW_LIMIT = 60;

interface TopicRow {
  id: string;
  slug: string;
  type: EntityType;
  title: string;
  n: number;
  metricCount: number;
  updated: string | undefined;
  /** Labels of the topic's other categories */
  alsoIn: string[];
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});
const helper = createColumnHelper<typeof features, TopicRow>();

const monthYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-02-01" → "Feb 2026"; anything unparseable is shown as-is. */
function formatUpdated(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : monthYear.format(d);
}

const columns = helper.columns([
  helper.accessor('title', {
    header: 'Topic',
    sortFn: 'alphanumeric',
    cell: ({ row }) => {
      const t = row.original;
      return (
        <div className="min-w-0">
          <Link
            to="/topics/$type/$slug"
            params={{ type: t.type, slug: t.slug }}
            className="hover:text-accent-700 dark:hover:text-accent-300 font-medium"
          >
            {t.title}
          </Link>
          {t.alsoIn.length > 0 ? (
            <div className="text-muted text-xs">
              Also in {t.alsoIn.join(', ')}
            </div>
          ) : null}
        </div>
      );
    },
  }),
  helper.accessor('type', {
    header: 'Type',
    sortFn: 'alphanumeric',
    cell: ({ row }) => <Badge>{TYPE_SHORT[row.original.type]}</Badge>,
  }),
  helper.accessor('n', {
    header: 'Places',
    sortFn: 'basic',
    sortDescFirst: true,
    cell: ({ row }) => row.original.n.toLocaleString('en-US'),
  }),
  helper.accessor('metricCount', {
    header: 'Metrics',
    sortFn: 'basic',
    sortDescFirst: true,
    cell: ({ row }) => row.original.metricCount.toLocaleString('en-US'),
  }),
  helper.accessor('updated', {
    header: 'Updated',
    sortFn: 'alphanumeric',
    sortDescFirst: true,
    sortUndefined: 'last',
    cell: ({ row }) =>
      row.original.updated != null ? (
        formatUpdated(row.original.updated)
      ) : (
        <span className="text-muted">—</span>
      ),
  }),
]);

/** Column alignment and responsive visibility, by column id. */
const COLUMN_CLASS: Record<string, string> = {
  title: 'text-left w-full',
  type: 'text-left hidden sm:table-cell',
  n: 'text-right tabular',
  metricCount: 'text-right tabular',
  updated: 'text-right tabular hidden md:table-cell whitespace-nowrap',
};

/** A column's classes; the Type column is dropped once the page is filtered to one type. */
function columnClass(id: string, typeFixed: boolean): string {
  return id === 'type' && typeFixed ? 'hidden' : (COLUMN_CLASS[id] ?? '');
}

type QuickSort = 'places' | 'metrics' | 'az';
const QUICK_SORTS: Record<QuickSort, SortingState> = {
  places: [
    { id: 'n', desc: true },
    { id: 'metricCount', desc: true },
  ],
  metrics: [
    { id: 'metricCount', desc: true },
    { id: 'n', desc: true },
  ],
  az: [{ id: 'title', desc: false }],
};

/** Stable `combine` for useQueries: just the loaded metric catalogs, in query order. */
function metricData(results: QueryObserverResult<Metric[]>[]) {
  return results.map((r) => r.data);
}

export function CategoryPage() {
  const { category } = route.useParams();
  // Prerendered without ?type, so apply it only after hydration.
  const hydrated = useHydrated();
  const urlSearch = route.useSearch();
  const type = hydrated ? urlSearch.type : undefined;
  const navigate = route.useNavigate();
  const { data: manifest } = useSuspenseQuery(manifestQuery);
  const { data: topics } = useSuspenseQuery(topicsIndexQuery);
  const [text, setText] = useState('');
  const [sorting, setSorting] = useState<SortingState>(QUICK_SORTS.places);
  const [showAll, setShowAll] = useState(false);

  const info = manifest.categories.find((c) => c.id === category);
  const labels = useMemo(
    () => new Map(manifest.categories.map((c) => [c.id, c.label])),
    [manifest]
  );
  const summary = useMemo(
    () => summarizeCategories(manifest, topics).find((s) => s.id === category),
    [manifest, topics, category]
  );
  const inCategory = useMemo(
    () => topics.filter((t) => t.cats.includes(category)),
    [topics, category]
  );
  useTitle(info?.label ?? 'Category');

  // Metric catalogs give each topic its newest "updated" date (topics rarely carry one).
  const loadTypes = useMemo<EntityType[]>(
    () => (type != null ? [type] : (summary?.byType.map((b) => b.type) ?? [])),
    [type, summary]
  );
  const catalogs = useQueries({
    queries: loadTypes.map((t) => metricsQuery(t)),
    combine: metricData,
  });
  const metricById = useMemo(() => {
    const out = new Map<EntityType, Map<number, Metric>>();
    loadTypes.forEach((t, i) => {
      const list = catalogs[i];
      if (list != null) out.set(t, new Map(list.map((m) => [m.id, m])));
    });
    return out;
  }, [loadTypes, catalogs]);

  const rows = useMemo<TopicRow[]>(() => {
    const q = normalizeText(text);
    return inCategory
      .filter(
        (t) =>
          (type == null || t.type === type) &&
          (q === '' || normalizeText(t.title).includes(q))
      )
      .map((t) => ({
        id: `${t.type}:${t.slug}`,
        slug: t.slug,
        type: t.type,
        title: t.title,
        n: t.n,
        metricCount: t.metrics.length,
        updated: latestUpdate(t, metricById.get(t.type) ?? null) ?? undefined,
        alsoIn: t.cats
          .filter((c) => c !== category)
          .map((c) => labels.get(c) ?? c),
      }));
  }, [inCategory, type, text, metricById, category, labels]);

  const table = useTable({
    features,
    columns,
    data: rows,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (r) => r.id,
  });

  if (info == null || summary == null) return null;

  const sorted = table.getRowModel().rows;
  const visible = showAll ? sorted : sorted.slice(0, ROW_LIMIT);
  const quickSort: QuickSort =
    sorting[0]?.id === 'title'
      ? 'az'
      : sorting[0]?.id === 'metricCount'
        ? 'metrics'
        : 'places';
  const setType = (t: EntityType | undefined) => {
    setShowAll(false);
    void navigate({
      search: { type: t },
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <div>
      <nav
        aria-label="Breadcrumb"
        className="text-muted mb-3 flex items-center gap-1 text-sm"
      >
        <Link to="/categories" className="hover:text-app">
          Categories
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="text-app" aria-current="page">
          {info.label}
        </span>
      </nav>

      <header className="mb-6 flex items-center gap-3 sm:gap-4">
        <span
          className={cx(
            'grid size-12 shrink-0 sm:size-14 place-items-center rounded-2xl',
            categoryTint(category)
          )}
        >
          <CategoryGlyph id={category} className="size-6 sm:size-7" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {info.label}
          </h1>
          <p className="text-muted tabular mt-1 text-sm">
            {summary.total.toLocaleString('en-US')} topics ·{' '}
            {summary.byType
              .map(
                (b) =>
                  `${b.count.toLocaleString('en-US')} about ${TYPE_NOUNS[b.type]}`
              )
              .join(' · ')}
          </p>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Place type"
        className="border-app mb-5 flex gap-1 overflow-x-auto border-b"
      >
        <TypeTab
          label="All types"
          count={summary.total}
          selected={type == null}
          onClick={() => setType(undefined)}
        />
        {summary.byType.map((b) => (
          <TypeTab
            key={b.type}
            label={TYPE_LABELS[b.type]}
            count={b.count}
            selected={type === b.type}
            onClick={() => setType(b.type)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card min-w-0 overflow-hidden" aria-label="Topics">
          <div className="border-app flex flex-wrap items-center gap-3 border-b px-4 py-3">
            <label className="border-app bg-surface-2 focus-within:border-accent-400 flex min-w-0 basis-full items-center gap-2 rounded-lg border px-2.5 py-1.5 sm:max-w-xs sm:flex-1 sm:basis-auto">
              <Search className="text-muted size-4 shrink-0" aria-hidden />
              <input
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setShowAll(false);
                }}
                placeholder="Filter topics…"
                aria-label="Filter topics by title"
                className="placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              {text !== '' ? (
                <button
                  type="button"
                  onClick={() => setText('')}
                  className="text-muted hover:text-app"
                  aria-label="Clear filter"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </label>
            <Segmented<QuickSort>
              ariaLabel="Sort topics"
              size="sm"
              value={quickSort}
              onChange={(v) => setSorting(QUICK_SORTS[v])}
              options={[
                { value: 'places', label: 'Most places' },
                { value: 'metrics', label: 'Most metrics' },
                { value: 'az', label: 'A–Z' },
              ]}
            />
            <span className="text-muted tabular ml-auto text-xs">
              {rows.length.toLocaleString('en-US')} shown
            </span>
          </div>

          {rows.length === 0 ? (
            <p className="text-muted p-8 text-center text-sm">
              No topics match “{text}”.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2/60 text-muted text-xs">
                  {table.getHeaderGroups().map((group) => (
                    <tr key={group.id}>
                      {group.headers.map((header) => {
                        const sortedDir = header.column.getIsSorted();
                        return (
                          <th
                            key={header.id}
                            scope="col"
                            aria-sort={
                              sortedDir === 'asc'
                                ? 'ascending'
                                : sortedDir === 'desc'
                                  ? 'descending'
                                  : 'none'
                            }
                            className={cx(
                              'px-3 py-2 font-medium sm:px-4',
                              columnClass(header.column.id, type != null)
                            )}
                          >
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className={cx(
                                'hover:text-app inline-flex items-center gap-1',
                                sortedDir !== false && 'text-app'
                              )}
                            >
                              <table.FlexRender header={header} />
                              {sortedDir === 'asc' ? (
                                <ArrowUp className="size-3" aria-hidden />
                              ) : sortedDir === 'desc' ? (
                                <ArrowDown className="size-3" aria-hidden />
                              ) : null}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.id}
                      className="border-app hover:bg-surface-2/50 border-t"
                    >
                      {row.getAllCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cx(
                            'px-3 py-2.5 align-middle sm:px-4',
                            columnClass(cell.column.id, type != null)
                          )}
                        >
                          <table.FlexRender cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!showAll && sorted.length > ROW_LIMIT ? (
            <div className="border-app border-t p-3 text-center">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="border-app hover:bg-surface-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
              >
                Show all {sorted.length.toLocaleString('en-US')} topics
              </button>
            </div>
          ) : null}
        </section>

        <TopMetrics
          category={category}
          categoryLabel={info.label}
          fixedType={type}
          defaultType={dominantType(summary)}
          types={summary.byType.map((b) => b.type)}
          topics={topics}
        />
      </div>
    </div>
  );
}

function TypeTab({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cx(
        '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
        selected
          ? 'border-accent-600 text-app dark:border-accent-400'
          : 'text-muted hover:text-app border-transparent'
      )}
    >
      {label}
      <span className="tabular bg-surface-2 text-muted rounded-full px-1.5 text-xs">
        {count.toLocaleString('en-US')}
      </span>
    </button>
  );
}

/**
 * The category's best-covered metrics for one place type, each with one-click links into an
 * overlay (against income / GDP per capita) or a ranking, plus "compare them all" shortcuts.
 */
function TopMetrics({
  category,
  categoryLabel,
  fixedType,
  defaultType,
  types,
  topics,
}: {
  category: string;
  categoryLabel: string;
  fixedType: EntityType | undefined;
  defaultType: EntityType;
  types: EntityType[];
  topics: readonly TopicSummary[];
}) {
  const [chosen, setChosen] = useState<EntityType>(defaultType);
  const type = fixedType ?? (types.includes(chosen) ? chosen : defaultType);
  const { data: manifest } = useSuspenseQuery(manifestQuery);
  const { data: metrics, isPending, isError } = useQuery(metricsQuery(type));
  const entityCount = manifest.types.find((t) => t.id === type)?.entities ?? 0;
  const topicInfo = useMemo(() => topicInfoMap(topics), [topics]);
  const top = useMemo(
    () =>
      metrics != null
        ? topCategoryMetrics(metrics, type, category, entityCount, topicInfo)
        : [],
    [metrics, type, category, entityCount, topicInfo]
  );
  const basket = top.slice(0, 6).map((m) => m.id);

  return (
    <aside className="card lg:sticky lg:top-20" aria-labelledby="top-metrics">
      <header className="border-app border-b px-4 py-3">
        <h2 id="top-metrics" className="text-sm font-semibold">
          Top metrics in {categoryLabel}
        </h2>
        <p className="text-muted mt-0.5 text-xs">
          Best-covered statistics for {TYPE_PLURAL[type]}. Overlay one against{' '}
          {overlayPartner(type, 0).label} or rank by it.
        </p>
        {fixedType == null && types.length > 1 ? (
          <div className="mt-3">
            <Select<EntityType>
              ariaLabel="Place type for top metrics"
              value={type}
              onChange={setChosen}
              options={types.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
              className="w-full"
            />
          </div>
        ) : null}
      </header>
      {isPending ? (
        <div className="p-4">
          <Spinner label="Loading metrics…" />
        </div>
      ) : isError ? (
        <p className="text-bad p-4 text-sm">Could not load metrics.</p>
      ) : top.length === 0 ? (
        <p className="text-muted p-4 text-sm">
          No metric in this category covers most {TYPE_PLURAL[type]}.
        </p>
      ) : (
        <>
          <ol className="divide-y divide-[var(--border)]">
            {top.map((m, i) => (
              <MetricRow
                key={m.id}
                rank={i + 1}
                metric={m}
                type={type}
                entityCount={entityCount}
                context={
                  m.topics[0] != null
                    ? (topicInfo.get(`${type}:${m.topics[0]}`)?.title ?? null)
                    : null
                }
              />
            ))}
          </ol>
          {basket.length >= 2 ? (
            <div className="border-app grid grid-cols-2 gap-2 border-t p-3">
              <Link
                to="/compare"
                search={{ type, view: 'matrix', m: basket }}
                className="border-app hover:bg-surface-2 inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium"
                title={`See which of the top ${basket.length} metrics move together`}
              >
                <Grid3x3 className="size-3.5" aria-hidden />
                Correlate top {basket.length}
              </Link>
              <Link
                to="/compare"
                search={{ type, view: 'ranking', m: basket }}
                className="bg-accent-600 hover:bg-accent-700 inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-white"
                title={`Combine the top ${basket.length} metrics into one ranking`}
              >
                <Trophy className="size-3.5" aria-hidden />
                Rank by top {basket.length}
              </Link>
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}

function MetricRow({
  rank,
  metric,
  type,
  entityCount,
  context,
}: {
  rank: number;
  metric: Metric;
  type: EntityType;
  entityCount: number;
  context: string | null;
}) {
  const partner = overlayPartner(type, metric.id);
  const topic = metric.topics[0];
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className="text-muted tabular w-4 shrink-0 pt-0.5 text-right text-xs">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {topic != null ? (
            <Link
              to="/topics/$type/$slug"
              params={{ type, slug: topic }}
              search={{ m: metric.id }}
              className="hover:text-accent-700 dark:hover:text-accent-300 truncate text-sm font-medium"
              title={metric.label}
            >
              {metric.label}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium">{metric.label}</span>
          )}
          <PolarityIcon pol={metric.pol} />
        </div>
        <div className="text-muted tabular truncate text-xs">
          {context != null ? `${context} · ` : ''}
          {metric.n}/{entityCount}
          {metric.year != null ? ` · ${metric.year}` : ''}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <Link
            to="/compare"
            search={{
              type,
              view: 'scatter',
              m: [partner.id, metric.id],
              x: partner.id,
              y: metric.id,
            }}
            className="border-app text-muted hover:text-app hover:border-accent-300 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
            title={`Overlay ${metric.label} against ${partner.label}`}
          >
            <ChartScatter className="size-3" aria-hidden />
            Compare
          </Link>
          <Link
            to="/compare"
            search={{ type, view: 'ranking', m: [metric.id] }}
            className="border-app text-muted hover:text-app hover:border-accent-300 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
            title={`Rank every ${TYPE_SHORT[type].toLowerCase()} by ${metric.label}`}
          >
            <Trophy className="size-3" aria-hidden />
            Rank
          </Link>
        </div>
      </div>
    </li>
  );
}
