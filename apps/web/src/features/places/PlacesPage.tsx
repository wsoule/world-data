import {
  getRouteApi,
  Link,
  useHydrated,
  useNavigate,
} from '@tanstack/react-router';
import {
  createColumnHelper,
  createSortedRowModel,
  type Header,
  rowSortingFeature,
  sortFn_alphanumeric,
  type SortingState,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, X } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { growthMetricId, metricCountsFor, placeNoun } from './datasetFacts';
import { useVirtualRows } from './hooks';
import { formatPlaceSort, parsePlaceSort, type PlacesSearch } from './search';
import { Choropleth } from '~/charts/Choropleth';
import { Flag } from '~/components/Flag';
import { TypeTabs } from '~/components/TypeTabs';
import { Card, cx, PageHeader } from '~/components/ui';
import { type Dataset, useDataset } from '~/data/dataset';
import { type EntityType, isEntityType } from '~/data/types';
import { formatInt, formatValue, plural } from '~/lib/format';
import { searchItems } from '~/lib/textSearch';

const route = getRouteApi('/places/$type/');

/** What the `group` field means for each place type. */
export const GROUP_LABEL: Record<EntityType, string> = {
  country: 'Continent',
  state: 'Region',
  city: 'Region',
  county: 'Region',
  'world-city': 'Country',
};

/** One place in the list, with the synthetic base metrics it is sorted by. */
interface PlaceRow {
  index: number;
  id: string;
  slug: string;
  name: string;
  flag: string | null;
  sub: string;
  group: string;
  pop: number | undefined;
  density: number | undefined;
  growth: number | undefined;
  metrics: number;
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
});
const helper = createColumnHelper<typeof features, PlaceRow>();

const ROW_HEIGHT = 48;
/**
 * Rows rendered before hydration, when the list cannot be virtualized yet. They put real
 * rows and links in the prerendered HTML; longer lists show the most populous ones.
 */
const STATIC_ROWS = 400;
/** Typing settles for this long before the text filter is written to the URL. */
const QUERY_URL_DELAY = 300;
/** Group chips shown before "Show all" for types with many groups (world cities by country). */
const CHIP_LIMIT = 12;

const valueOrUndefined = (v: number) => (Number.isNaN(v) ? undefined : v);

export function PlacesPage() {
  const params = route.useParams();
  const type: EntityType = isEntityType(params.type) ? params.type : 'country';
  const dataset = useDataset(type);
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Places"
        title={`All ${dataset.type.label}`}
        subtitle={`${formatInt(dataset.entities.length)} places with up to ${formatInt(dataset.type.numericMetrics)} metrics each. Open any place for its report card.`}
        actions={
          <TypeTabs
            value={type}
            compact
            onChange={(t) =>
              void navigate({ to: '/places/$type', params: { type: t } })
            }
          />
        }
      />
      <Overview dataset={dataset} />
      <PlacesTable key={type} dataset={dataset} />
    </div>
  );
}

/** Population map (countries, states) next to a few headline records for the type. */
function Overview({ dataset }: { dataset: Dataset }) {
  const navigate = useNavigate();
  const type = dataset.type.id;
  const hasMap = type === 'country' || type === 'state';
  const population = dataset.numeric(-1);
  const popMetric = dataset.metric(-1);
  const records = useMemo(() => buildRecords(dataset), [dataset]);

  const glance = (
    <Card title="At a glance" subtitle={`${dataset.type.label} by the numbers`}>
      <dl
        className={cx(
          'grid grid-cols-1 gap-x-8 gap-y-3.5',
          !hasMap && 'md:grid-cols-2 xl:grid-cols-3'
        )}
      >
        {records.map((r) => (
          <div key={r.label} className="flex min-w-0 items-center gap-3">
            <dt className="text-muted w-28 shrink-0 text-xs">{r.label}</dt>
            <dd className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm">
              {r.place != null ? (
                <Link
                  to="/places/$type/$slug"
                  params={{ type, slug: r.place.slug }}
                  className="hover:text-accent-600 dark:hover:text-accent-300 flex min-w-0 items-center gap-1.5 font-medium"
                >
                  <Flag entity={r.place} type={type} size={16} />
                  <span className="truncate">{r.place.name}</span>
                </Link>
              ) : (
                <span />
              )}
              <span className="tabular text-muted shrink-0 text-xs">
                {r.value}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );

  if (!hasMap) return glance;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card title="Population" subtitle="Click a place to open its report card">
        <Choropleth
          dataset={dataset}
          values={population}
          format={(v) => formatValue(popMetric, v, { compact: true })}
          label="Population"
          height={300}
          onSelect={(i) =>
            void navigate({
              to: '/places/$type/$slug',
              params: { type, slug: dataset.entities[i].slug },
            })
          }
        />
      </Card>
      {glance}
    </div>
  );
}

interface RecordRow {
  label: string;
  place: Dataset['entities'][number] | null;
  value: string;
}

// Headline records for the overview card: total population, largest and smallest, densest,
// fastest growing and shrinking, biggest by area and best documented place. Rows whose metric
// is missing for the type are left out.
function buildRecords(dataset: Dataset): RecordRow[] {
  const out: RecordRow[] = [];
  const pop = dataset.numeric(-1);
  let total = 0;
  for (const v of pop) if (!Number.isNaN(v)) total += v;
  const popMetric = dataset.metric(-1);
  out.push({
    label: 'Total population',
    place: null,
    value: formatValue(popMetric, total, { compact: true }),
  });
  // Index of the largest (direction 1) or smallest (-1) value, or -1 when the column is empty.
  const extreme = (col: ArrayLike<number>, direction: 1 | -1) => {
    let idx = -1;
    for (let i = 0; i < col.length; i++)
      if (
        !Number.isNaN(col[i]) &&
        (idx < 0 || (col[i] - col[idx]) * direction > 0)
      )
        idx = i;
    return idx;
  };
  const add = (
    label: string,
    col: ArrayLike<number>,
    fmt: (v: number) => string,
    direction: 1 | -1 = 1
  ) => {
    const i = extreme(col, direction);
    if (i >= 0)
      out.push({ label, place: dataset.entities[i], value: fmt(col[i]) });
  };
  const popFmt = (v: number) => formatValue(popMetric, v, { compact: true });
  add('Most populous', pop, popFmt);
  add('Least populous', pop, popFmt, -1);
  if (dataset.hasValues(-2)) {
    const m = dataset.metric(-2);
    add('Most densely populated', dataset.numeric(-2), (v) =>
      formatValue(m, v, { compact: true })
    );
  }
  const growth = growthMetricId(dataset);
  if (growth != null) {
    const m = dataset.metric(growth);
    const col = dataset.numeric(growth);
    add('Fastest growing', col, (v) => formatValue(m, v));
    const i = extreme(col, -1);
    if (i >= 0 && col[i] < 0)
      add('Shrinking fastest', col, (v) => formatValue(m, v), -1);
  }
  if (dataset.hasValues(-5)) {
    const m = dataset.metric(-5);
    add('Largest by area', dataset.numeric(-5), (v) =>
      formatValue(m, v, { compact: true })
    );
  }
  const counts = metricCountsFor(dataset);
  add('Most data', counts, (v) => plural(v, 'metric'));
  return out;
}

/**
 * Searchable, sortable, virtualized table of every place of the type. The filter, group chips
 * and sort live in the URL (replacing the history entry), so they survive Back from a place.
 * The server and the hydrating render use the defaults and render the first `STATIC_ROWS`
 * rows in full; URL state and virtualization apply once hydrated.
 */
function PlacesTable({ dataset }: { dataset: Dataset }) {
  const type = dataset.type.id;
  const hydrated = useHydrated();
  const urlSearch = route.useSearch();
  const search: PlacesSearch = hydrated ? urlSearch : {};
  const navigate = route.useNavigate();
  const setSearch = useCallback(
    (patch: Partial<PlacesSearch>) =>
      void navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: true,
        resetScroll: false,
      }),
    [navigate]
  );

  // What the user is typing; null until they type, so the box shows the URL's query.
  const [draft, setDraft] = useState<string | null>(null);
  const query = draft ?? search.q ?? '';
  const deferredQuery = useDeferredValue(query);
  const queryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(queryTimer.current), []);
  const changeQuery = (value: string) => {
    setDraft(value);
    clearTimeout(queryTimer.current);
    queryTimer.current = setTimeout(
      () => setSearch({ q: value.trim() === '' ? undefined : value }),
      QUERY_URL_DELAY
    );
  };

  const groups = useMemo<ReadonlySet<string>>(
    () => new Set(search.g ?? []),
    [search.g]
  );
  const setGroups = (next: ReadonlySet<string>) =>
    setSearch({ g: next.size > 0 ? [...next] : undefined });
  const sorting = useMemo<SortingState>(() => {
    const s = parsePlaceSort(search.sort);
    return [{ id: s.id, desc: s.desc }];
  }, [search.sort]);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const allRows = useMemo<PlaceRow[]>(() => {
    const pop = dataset.numeric(-1);
    const density = dataset.numeric(-2);
    const growthId = growthMetricId(dataset);
    const growth = growthId != null ? dataset.numeric(growthId) : null;
    const counts = metricCountsFor(dataset);
    return dataset.entities.map((e, i) => ({
      index: i,
      id: e.id,
      slug: e.slug,
      name: e.name,
      flag: e.flag,
      sub: e.sub ?? '',
      group: e.group ?? '',
      pop: valueOrUndefined(pop[i]),
      density: valueOrUndefined(density[i]),
      growth: growth != null ? valueOrUndefined(growth[i]) : undefined,
      metrics: counts[i],
    }));
  }, [dataset]);

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allRows)
      if (r.group !== '') counts.set(r.group, (counts.get(r.group) ?? 0) + 1);
    return dataset.groups.map((g) => [g, counts.get(g) ?? 0] as const);
  }, [allRows, dataset]);

  const data = useMemo(() => {
    const inGroups =
      groups.size > 0 ? allRows.filter((r) => groups.has(r.group)) : allRows;
    return searchItems(inGroups, deferredQuery, (r) => [
      { text: r.name, weight: 3 },
      { text: `${r.id} ${r.sub}`, weight: 2 },
      { text: r.group, weight: 1 },
    ]);
  }, [allRows, groups, deferredQuery]);

  const maxMetrics = useMemo(
    () => allRows.reduce((m, r) => Math.max(m, r.metrics), 1),
    [allRows]
  );

  const columns = useMemo(() => {
    const popMetric = dataset.metric(-1);
    const densityMetric = dataset.metric(-2);
    const growthId = growthMetricId(dataset);
    const growthMetric =
      growthId != null ? dataset.metric(growthId) : undefined;
    const num = (
      v: number | undefined,
      m: typeof popMetric,
      compact = false
    ) =>
      v == null ? (
        <span className="text-muted">—</span>
      ) : (
        <span className="tabular">{formatValue(m, v, { compact })}</span>
      );
    return helper.columns([
      helper.accessor('name', {
        id: 'name',
        header: dataset.type.singular,
        sortFn: 'alphanumeric',
        cell: (info) => {
          const r = info.row.original;
          return (
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="tabular text-muted w-8 shrink-0 text-right text-xs">
                {r.index + 1}
              </span>
              <Flag entity={r} type={type} size={22} />
              <span className="min-w-0">
                <Link
                  to="/places/$type/$slug"
                  params={{ type, slug: r.slug }}
                  className="hover:text-accent-600 dark:hover:text-accent-300 block truncate font-medium"
                >
                  {r.name}
                </Link>
                {r.sub !== '' && r.sub !== r.group ? (
                  <span className="text-muted block truncate text-xs">
                    {r.sub}
                  </span>
                ) : null}
              </span>
            </span>
          );
        },
      }),
      helper.accessor('group', {
        id: 'group',
        header: GROUP_LABEL[type],
        sortFn: 'alphanumeric',
        cell: (info) => (
          <span className="text-muted truncate">
            {info.getValue() === '' ? '—' : info.getValue()}
          </span>
        ),
      }),
      helper.accessor('pop', {
        id: 'pop',
        header: 'Population',
        sortUndefined: 'last',
        sortDescFirst: true,
        cell: (info) => num(info.getValue(), popMetric),
      }),
      helper.accessor('density', {
        id: 'density',
        header: 'Density',
        sortUndefined: 'last',
        sortDescFirst: true,
        cell: (info) => num(info.getValue(), densityMetric, true),
      }),
      helper.accessor('growth', {
        id: 'growth',
        header: 'Growth',
        sortUndefined: 'last',
        sortDescFirst: true,
        cell: (info) => {
          const v = info.getValue();
          if (v == null) return <span className="text-muted">—</span>;
          return (
            <span
              className={cx(
                'tabular',
                v > 0 ? 'text-good' : v < 0 ? 'text-bad' : 'text-muted'
              )}
            >
              {v > 0 ? '+' : ''}
              {formatValue(growthMetric, v)}
            </span>
          );
        },
      }),
      helper.accessor('metrics', {
        id: 'metrics',
        header: 'Metrics',
        sortDescFirst: true,
        cell: (info) => (
          <span className="flex items-center justify-end gap-2">
            <span className="bg-surface-2 hidden h-1.5 w-12 overflow-hidden rounded-full sm:block">
              <span
                className="bg-accent-400 block h-full rounded-full"
                style={{ width: `${(info.getValue() / maxMetrics) * 100}%` }}
              />
            </span>
            <span className="tabular w-12 text-right">
              {formatInt(info.getValue())}
            </span>
          </span>
        ),
      }),
    ]);
  }, [dataset, type, maxMetrics]);

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (r) => r.id,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const first = next.at(0);
      if (first != null)
        setSearch({
          sort: formatPlaceSort(
            parsePlaceSort(`${first.desc ? '-' : ''}${first.id}`)
          ),
        });
    },
    enableSortingRemoval: false,
  });
  const rows = table.getRowModel().rows;
  const virtual = useVirtualRows({
    count: rows.length,
    rowHeight: ROW_HEIGHT,
    scrollRef,
    getKey: (i) => rows[i]?.id ?? String(i),
    active: hydrated,
    staticLimit: STATIC_ROWS,
  });

  const toggleGroup = (g: string) => {
    const next = new Set(groups);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    setGroups(next);
  };
  const visibleChips = showAllGroups
    ? groupCounts
    : groupCounts.slice(0, CHIP_LIMIT);
  const noun = placeNoun(dataset);

  return (
    <Card
      title={
        rows.length === allRows.length
          ? `${formatInt(allRows.length)} ${noun}`
          : `${formatInt(rows.length)} of ${formatInt(allRows.length)} ${noun}`
      }
      subtitle="Sort by any column. The number before each name is its population rank."
      actions={
        <label className="border-app bg-surface focus-within:border-accent-400 flex w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 sm:w-64">
          <Search className="text-muted size-4 shrink-0" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            placeholder={`Search ${noun}…`}
            aria-label={`Search ${noun}`}
            className="placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
      }
    >
      {groupCounts.length > 1 ? (
        <div
          className="-mt-1 mb-3 flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={`Filter by ${GROUP_LABEL[type].toLowerCase()}`}
        >
          <Chip active={groups.size === 0} onClick={() => setGroups(new Set())}>
            All
          </Chip>
          {visibleChips.map(([g, n]) => (
            <Chip key={g} active={groups.has(g)} onClick={() => toggleGroup(g)}>
              {g}
              <span className="tabular opacity-60">{n}</span>
            </Chip>
          ))}
          {groupCounts.length > CHIP_LIMIT ? (
            <button
              type="button"
              className="text-muted hover:text-app px-1.5 text-xs underline-offset-2 hover:underline"
              onClick={() => setShowAllGroups((s) => !s)}
            >
              {showAllGroups
                ? 'Show fewer'
                : `Show all ${formatInt(groupCounts.length)}`}
            </button>
          ) : null}
          {groups.size > 0 ? (
            <button
              type="button"
              className="text-muted hover:text-app inline-flex items-center gap-1 px-1.5 text-xs"
              onClick={() => setGroups(new Set())}
            >
              <X className="size-3" aria-hidden /> Clear
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="-mx-4 -mb-4">
        <div
          ref={scrollRef}
          className={cx(
            'border-app overflow-auto border-t',
            virtual.scrollable && 'max-h-[70vh]'
          )}
          role="region"
          aria-label={`${dataset.type.label} table`}
          tabIndex={0}
        >
          <table className="w-full min-w-[44rem] table-fixed border-separate border-spacing-0 text-sm">
            <colgroup>
              <col className="w-[13rem] sm:w-auto" />
              <col className="w-[8.5rem]" />
              <col className="w-[8rem]" />
              <col className="w-[7rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[7.5rem] sm:w-[9rem]" />
            </colgroup>
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <HeaderCell key={header.id} header={header} />
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {virtual.padTop > 0 ? (
                <tr aria-hidden>
                  <td style={{ height: virtual.padTop }} colSpan={6} />
                </tr>
              ) : null}
              {virtual.indexes.map((i) => {
                const row = rows[i];
                return (
                  <tr
                    key={row.id}
                    className="group/row hover:bg-surface-2/60"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {row.getAllCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cx(
                          'border-app border-b px-3 py-1.5',
                          cell.column.id === 'name'
                            ? 'bg-surface group-hover/row:bg-surface-2 sticky left-0 z-[1] pl-2'
                            : cell.column.id === 'group'
                              ? ''
                              : 'text-right'
                        )}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                );
              })}
              {virtual.padBottom > 0 ? (
                <tr aria-hidden>
                  <td style={{ height: virtual.padBottom }} colSpan={6} />
                </tr>
              ) : null}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="text-muted p-8 text-center text-sm">
              No {noun} match “{query}”
              {groups.size > 0 ? ' in the selected groups' : ''}.
            </p>
          ) : null}
        </div>
        {!virtual.enabled && rows.length > virtual.indexes.length ? (
          <p className="border-app text-muted border-t px-4 py-2.5 text-xs">
            Showing the {formatInt(virtual.indexes.length)} most populous of{' '}
            {formatInt(rows.length)} {noun}. Search or sort to find the rest.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
        active
          ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-900/40 dark:text-accent-100'
          : 'border-app text-muted hover:text-app hover:bg-surface-2'
      )}
    >
      {children}
    </button>
  );
}

function HeaderCell({
  header,
}: {
  header: Header<typeof features, PlaceRow, unknown>;
}) {
  const sorted = header.column.getIsSorted();
  const left = header.column.id === 'name' || header.column.id === 'group';
  const label =
    typeof header.column.columnDef.header === 'string'
      ? header.column.columnDef.header
      : header.column.id;
  return (
    <th
      scope="col"
      aria-sort={
        sorted === 'asc'
          ? 'ascending'
          : sorted === 'desc'
            ? 'descending'
            : 'none'
      }
      className={cx(
        'border-app bg-surface-2 text-muted sticky top-0 z-[2] border-b px-3 py-2 text-xs font-medium',
        header.column.id === 'name' && 'left-0 z-[3] pl-2',
        left ? 'text-left' : 'text-right'
      )}
    >
      <button
        type="button"
        onClick={header.column.getToggleSortingHandler()}
        className={cx(
          'hover:text-app inline-flex items-center gap-1',
          !left && 'flex-row-reverse',
          sorted !== false && 'text-app'
        )}
        title={`Sort by ${label.toLowerCase()}`}
      >
        <span className={header.column.id === 'name' ? 'pl-10' : ''}>
          {label}
        </span>
        {sorted === 'asc' ? (
          <ArrowUp className="size-3" aria-hidden />
        ) : sorted === 'desc' ? (
          <ArrowDown className="size-3" aria-hidden />
        ) : (
          <ChevronsUpDown className="size-3 opacity-50" aria-hidden />
        )}
      </button>
    </th>
  );
}
