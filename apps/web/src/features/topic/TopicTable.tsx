import { getRouteApi, Link, useHydrated } from '@tanstack/react-router';
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  functionalUpdate,
  type Header,
  rowSortingFeature,
  sortFn_alphanumeric,
  type SortingState,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from 'lucide-react';
import {
  type KeyboardEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  directionOf,
  formatSort,
  numericColumn,
  parseSort,
  placeNoun,
  rankColumn,
  rawColumn,
  seriesYears,
  splitList,
  tableYear,
} from './model';
import { Flag } from '~/components/Flag';
import { PolarityIcon } from '~/components/MetricPicker';
import { cx } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import type {
  Metric,
  TopicTable as SourceTable,
  TopicFile,
} from '~/data/types';
import { formatInt, formatValue } from '~/lib/format';
import { chartColors, useTheme } from '~/lib/theme';
import type { TopicSearch } from '~/routes/topics.$type.$slug';

const route = getRouteApi('/topics/$type/$slug');

/** One place in a topic table, with the raw value of every metric in that table. */
interface TopicRow {
  index: number;
  id: string;
  slug: string;
  name: string;
  values: (number | string | null)[];
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
});
const helper = createColumnHelper<typeof features, TopicRow>();

/** Rows beyond which only the visible window is rendered (after hydration). */
const VIRTUALIZE_ABOVE = 150;
/**
 * Rows in the server-rendered (prerendered) HTML and the hydrating render, so crawlers and
 * no-JS readers get real rows with place links. Longer tables are cut to the top rows.
 */
const STATIC_ROWS = 300;
/** Typing pause before the table filter is written to the URL. */
const FILTER_DEBOUNCE_MS = 250;
const ROW_HEIGHT = 40;
const RANK_WIDTH = 52;
const NUM_WIDTH = 136;
const TEXT_WIDTH = 220;
const LONG_TEXT_WIDTH = 320;

/** A metric column as rendered: the metric, the year shown and the values aligned to entities. */
interface MetricColumn {
  metric: Metric;
  year: number | null;
  raw: (number | string | null)[];
  /** Competition rank per entity (numeric metrics only) */
  ranks: Float64Array | null;
  coverage: number;
  /** Long free text gets a wider, wrapping column */
  long: boolean;
  /** Shows the undated series while the metric also has dated ones */
  latest: boolean;
}

/** URL params of the data table (see TopicSearch). */
type TableSearch = Pick<TopicSearch, 'tab' | 'tq' | 'tsort'>;

/**
 * Every topic table as a sortable, filterable data table, one tab per source table. The tab that
 * holds the focus metric opens first. The open tab, filter and sort live in the URL (replaced,
 * not pushed) so coming Back from a place page, a reload or a shared link restores them; like
 * every search param they apply after hydration, since prerendered HTML has none.
 */
export function TopicTables({
  dataset,
  topic,
  tables,
  focusId,
  year,
  selected,
  onSelect,
}: {
  dataset: Dataset;
  topic: TopicFile;
  tables: readonly SourceTable[];
  focusId: number | null;
  /** Year the page shows (null = the undated series); omit to show each column's default */
  year?: number | null;
  selected: number | null;
  onSelect: (entityIndex: number) => void;
}) {
  const hydrated = useHydrated();
  const urlSearch = route.useSearch();
  const search: TableSearch = hydrated ? urlSearch : {};
  const navigate = route.useNavigate();
  const setSearch = useCallback(
    (patch: TableSearch) =>
      void navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: true,
        resetScroll: false,
      }),
    [navigate]
  );
  const onFilter = useCallback(
    (tq: string) => setSearch({ tq: tq === '' ? undefined : tq }),
    [setSearch]
  );
  const onSort = useCallback(
    (tsort: string | undefined) => setSearch({ tsort }),
    [setSearch]
  );

  const focusTable = Math.max(
    0,
    tables.findIndex((t) => focusId != null && t.metrics.includes(focusId))
  );
  const picked =
    search.tab != null &&
    Number.isInteger(search.tab) &&
    search.tab >= 0 &&
    search.tab < tables.length
      ? search.tab
      : null;
  const active = Math.min(picked ?? focusTable, tables.length - 1);
  const table = tables[active];
  if (table == null) return null;
  return (
    <section className="card overflow-hidden" aria-labelledby="topic-data">
      <header className="border-app flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 id="topic-data" className="text-sm font-semibold">
            Data
          </h2>
          <p className="text-muted mt-0.5 text-xs">
            {focusId != null
              ? 'Click a column to sort, a row to highlight that place on the charts.'
              : 'Click a column to sort.'}
          </p>
        </div>
      </header>
      {tables.length > 1 ? (
        <div
          role="tablist"
          aria-label="Topic tables"
          className="border-app bg-surface-2/60 flex gap-1 overflow-x-auto border-b px-3 py-2"
        >
          {tables.map((t, k) => (
            <button
              key={t.name}
              type="button"
              role="tab"
              id={`topic-tab-${k}`}
              aria-selected={k === active}
              aria-controls="topic-tabpanel"
              onClick={() =>
                setSearch({
                  tab: k === focusTable ? undefined : k,
                  tsort: undefined,
                })
              }
              className={cx(
                'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                k === active
                  ? 'bg-surface text-app shadow-sm'
                  : 'text-muted hover:text-app'
              )}
            >
              {t.name}
              <span className="text-muted ml-1.5 text-xs font-normal">
                {t.metrics.length}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <div
        id="topic-tabpanel"
        role={tables.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={tables.length > 1 ? `topic-tab-${active}` : undefined}
      >
        <DataTable
          key={`${table.name}-${active}`}
          dataset={dataset}
          topic={topic}
          table={table}
          focusId={focusId}
          year={year}
          filterParam={search.tq ?? ''}
          sortParam={search.tsort}
          onFilter={onFilter}
          onSort={onSort}
          selected={selected}
          onSelect={onSelect}
        />
      </div>
    </section>
  );
}

/**
 * The filter box's text, kept locally so typing never waits for the router, and written to
 * the URL once typing pauses. URL changes this box did not make (Back/Forward, a shared link
 * applied after hydration) replace the text.
 */
function useUrlFilter(
  param: string,
  write: (value: string) => void
): [string, (value: string) => void] {
  const [draft, setDraft] = useState(param);
  // The value last written to (or read from) the URL.
  const synced = useRef(param);
  useEffect(() => {
    if (draft === synced.current) return;
    const timer = setTimeout(() => {
      synced.current = draft;
      write(draft);
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, write]);
  useEffect(() => {
    if (param === synced.current) return;
    synced.current = param;
    setDraft(param);
  }, [param]);
  return [draft, setDraft];
}

function DataTable({
  dataset,
  topic,
  table: source,
  focusId,
  year,
  filterParam,
  sortParam,
  onFilter,
  onSort,
  selected,
  onSelect,
}: {
  dataset: Dataset;
  topic: TopicFile;
  table: SourceTable;
  focusId: number | null;
  year: number | null | undefined;
  /** Filter text from the URL */
  filterParam: string;
  /** Sort from the URL ("-m123"); ignored when it names no column of this table */
  sortParam: string | undefined;
  onFilter: (value: string) => void;
  /** Writes a sort to the URL, undefined for the default order */
  onSort: (value: string | undefined) => void;
  selected: number | null;
  onSelect: (entityIndex: number) => void;
}) {
  const hydrated = useHydrated();
  const entityCount = dataset.entities.length;
  const noun = placeNoun(dataset.type.id);
  const colors = chartColors(useTheme());
  // Opaque tint so the sticky columns of the selected row stay solid while scrolling.
  const selectedBg = `color-mix(in srgb, ${colors.highlight} 14%, var(--surface))`;

  const cols = useMemo<MetricColumn[]>(() => {
    const out: MetricColumn[] = [];
    for (const id of source.metrics) {
      const metric = dataset.metric(id);
      if (metric == null) continue;
      const y = tableYear(topic, metric, year);
      const raw = rawColumn(topic, id, y, entityCount);
      let coverage = 0;
      let longest = 0;
      for (const v of raw) {
        if (v == null) continue;
        coverage++;
        if (typeof v === 'string') longest = Math.max(longest, v.length);
      }
      out.push({
        metric,
        year: y,
        raw,
        ranks:
          metric.kind === 'num'
            ? rankColumn(
                numericColumn(topic, id, y, entityCount),
                directionOf(metric)
              )
            : null,
        coverage,
        long: longest > 60,
        latest: y == null && seriesYears(topic, id).length > 0,
      });
    }
    return out;
  }, [source, dataset, topic, year, entityCount]);

  const data = useMemo<TopicRow[]>(() => {
    const out: TopicRow[] = [];
    for (const i of topic.entities) {
      const e = dataset.entities[i];
      if (e == null) continue;
      const values = cols.map((c) => c.raw[i]);
      if (values.every((v) => v == null)) continue;
      out.push({ index: i, id: e.id, slug: e.slug, name: e.name, values });
    }
    return out;
  }, [topic, dataset, cols]);

  // Default order: the focus metric (or the first numeric one) best-first by its polarity.
  const defaultSorting = useMemo<SortingState>(() => {
    const lead =
      cols.find((c) => c.metric.id === focusId) ??
      cols.find((c) => c.ranks != null);
    return lead != null
      ? [{ id: `m${lead.metric.id}`, desc: directionOf(lead.metric) === 1 }]
      : [{ id: 'place', desc: false }];
  }, [cols, focusId]);
  const columnIds = useMemo(
    () => new Set(['place', ...cols.map((c) => `m${c.metric.id}`)]),
    [cols]
  );
  const urlSort = parseSort(sortParam, columnIds);
  const sorting: SortingState = urlSort != null ? [urlSort] : defaultSorting;
  const [draft, setDraft] = useUrlFilter(filterParam, onFilter);
  const filter = useDeferredValue(draft);

  // The rank column follows the sorted numeric metric, else the default lead metric.
  const sortedK = cols.findIndex((c) => `m${c.metric.id}` === sorting[0]?.id);
  const leadK = cols.findIndex(
    (c) => `m${c.metric.id}` === defaultSorting[0]?.id
  );
  const rankK = sortedK >= 0 && cols[sortedK].ranks != null ? sortedK : leadK;
  const rankCol = rankK >= 0 ? cols[rankK] : null;

  // Tables of only text/categorical columns have no rank to show.
  const hasRank = rankCol != null;
  const columns = useMemo(
    () =>
      helper.columns([
        ...(hasRank
          ? [
              helper.display({
                id: 'rank',
                header: '#',
                enableSorting: false,
                cell: (info) => {
                  const r = rankCol.ranks?.[info.row.original.index];
                  return r == null || Number.isNaN(r) ? (
                    <span className="text-muted">—</span>
                  ) : (
                    formatInt(r)
                  );
                },
              }),
            ]
          : []),
        helper.accessor('name', {
          id: 'place',
          header: dataset.type.singular,
          sortFn: 'alphanumeric',
          filterFn: 'includesString',
          cell: (info) => {
            const r = info.row.original;
            return (
              <span className="flex min-w-0 items-center gap-2">
                <Flag
                  entity={dataset.entities[r.index]}
                  type={dataset.type.id}
                  size={18}
                />
                <Link
                  to="/places/$type/$slug"
                  params={{ type: dataset.type.id, slug: r.slug }}
                  className="truncate font-medium hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {r.name}
                </Link>
              </span>
            );
          },
        }),
        ...cols.map((c, k) =>
          helper.accessor(
            (r) => {
              const v = r.values[k];
              return v == null || (typeof v === 'number' && Number.isNaN(v))
                ? undefined
                : v;
            },
            {
              id: `m${c.metric.id}`,
              header: c.metric.label,
              sortUndefined: 'last',
              sortDescFirst: c.ranks != null && directionOf(c.metric) === 1,
              ...(c.ranks == null ? { sortFn: 'alphanumeric' as const } : {}),
              cell: (info) => (
                <ValueCell
                  metric={c.metric}
                  value={info.row.original.values[k]}
                  long={c.long}
                />
              ),
            }
          )
        ),
      ]),
    [cols, dataset, rankCol, hasRank]
  );

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (r) => r.id,
    state: {
      sorting,
      columnFilters: filter === '' ? [] : [{ id: 'place', value: filter }],
    },
    onSortingChange: (u) => {
      const next = functionalUpdate(u, sorting)[0];
      const base = defaultSorting[0];
      onSort(
        next == null || (next.id === base.id && next.desc === base.desc)
          ? undefined
          : formatSort(next)
      );
    },
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  // Server and hydrating renders print real rows (the top STATIC_ROWS); the
  // virtual window needs measured sizes, so it takes over after hydration.
  const virtual = hydrated && rows.length > VIRTUALIZE_ABOVE;
  const clipped = !hydrated && rows.length > STATIC_ROWS;
  const virtualizer = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (i) => rows[i]?.id ?? i,
    overscan: 12,
  });
  const items = virtual ? virtualizer.getVirtualItems() : [];
  const padTop = items.length > 0 ? items[0].start : 0;
  const padBottom =
    items.length > 0
      ? virtualizer.getTotalSize() - items[items.length - 1].end
      : 0;
  const visibleRows = virtual
    ? items.map((it) => rows[it.index])
    : clipped
      ? rows.slice(0, STATIC_ROWS)
      : rows;

  const widthOf = (c: MetricColumn) =>
    c.ranks != null ? NUM_WIDTH : c.long ? LONG_TEXT_WIDTH : TEXT_WIDTH;
  const rankWidth = hasRank ? RANK_WIDTH : 0;
  const minWidth = rankWidth + 160 + cols.reduce((s, c) => s + widthOf(c), 0);
  const colById = new Map(cols.map((c) => [`m${c.metric.id}`, c]));

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(index);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <label className="border-app bg-surface focus-within:border-accent-400 flex w-full max-w-xs items-center gap-1.5 rounded-lg border px-2 py-1.5 sm:w-auto">
          <Search className="text-muted size-3.5 shrink-0" aria-hidden />
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Filter ${noun}…`}
            aria-label={`Filter ${noun} by name`}
            className="w-full min-w-0 bg-transparent text-sm outline-none sm:w-44"
          />
        </label>
        <span className="text-muted text-xs">
          {rows.length === data.length
            ? `${formatInt(data.length)} ${placeNoun(dataset.type.id, data.length)}`
            : `${formatInt(rows.length)} of ${formatInt(data.length)} ${noun}`}
          {rankCol != null ? ` · # = rank by ${rankCol.metric.label}` : ''}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="border-app max-h-[70vh] overflow-auto border-t"
        role="region"
        aria-label={`${source.name} table`}
        tabIndex={0}
      >
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-sm"
          style={{ minWidth }}
        >
          <colgroup>
            {hasRank ? <col style={{ width: RANK_WIDTH }} /> : null}
            <col className="w-[160px] sm:w-[230px]" />
            {cols.map((c) => (
              <col key={c.metric.id} style={{ width: widthOf(c) }} />
            ))}
            {/* Filler: absorbs spare width so the data columns stay packed on the left */}
            <col />
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <HeaderCell
                    key={header.id}
                    header={header}
                    column={colById.get(header.column.id)}
                    focused={header.column.id === `m${focusId}`}
                    total={data.length}
                    left={rankWidth}
                  />
                ))}
                <th
                  aria-hidden
                  className="border-app bg-surface-2 sticky top-0 z-20 border-b"
                />
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 ? (
              <tr aria-hidden>
                <td style={{ height: padTop }} colSpan={columns.length + 1} />
              </tr>
            ) : null}
            {visibleRows.map((row, k) => {
              const on = row.original.index === selected;
              return (
                <tr
                  key={row.id}
                  ref={virtual ? virtualizer.measureElement : undefined}
                  data-index={virtual ? items[k].index : k}
                  tabIndex={0}
                  aria-selected={on}
                  onClick={() => onSelect(row.original.index)}
                  onKeyDown={(e) => onRowKey(e, row.original.index)}
                  className="group/row focus-visible:outline-accent-500 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2"
                  style={{ height: ROW_HEIGHT }}
                >
                  {row.getAllCells().map((cell) => {
                    const id = cell.column.id;
                    const isMetric = id.startsWith('m');
                    const c = colById.get(id);
                    // Text columns wrap to two lines instead of truncating.
                    const wrap = isMetric && c != null && c.ranks == null;
                    return (
                      <td
                        key={cell.id}
                        className={cx(
                          'border-app overflow-hidden border-b px-2',
                          wrap
                            ? 'py-1.5 whitespace-normal'
                            : 'whitespace-nowrap',
                          id === 'rank' &&
                            'text-muted tabular sticky left-0 z-10 text-right text-xs',
                          id === 'place' && 'sticky z-10 border-r',
                          (id === 'rank' || id === 'place') &&
                            !on &&
                            'bg-surface group-hover/row:bg-surface-2',
                          isMetric && 'group-hover/row:bg-surface-2/70',
                          isMetric && c?.ranks != null && 'tabular text-right',
                          id === `m${focusId}` &&
                            !on &&
                            'bg-accent-50/50 dark:bg-accent-900/15'
                        )}
                        style={{
                          ...(id === 'place' ? { left: rankWidth } : null),
                          ...(on ? { background: selectedBg } : null),
                        }}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    );
                  })}
                  <td
                    aria-hidden
                    className="border-app border-b"
                    style={on ? { background: selectedBg } : undefined}
                  />
                </tr>
              );
            })}
            {padBottom > 0 ? (
              <tr aria-hidden>
                <td
                  style={{ height: padBottom }}
                  colSpan={columns.length + 1}
                />
              </tr>
            ) : null}
          </tbody>
        </table>
        {clipped ? (
          <p className="text-muted p-3 text-center text-xs">
            Showing the first {formatInt(STATIC_ROWS)} of{' '}
            {formatInt(rows.length)} {noun}
            {rankCol != null ? `, ranked by ${rankCol.metric.label}` : ''}.
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-muted p-6 text-center text-sm">
            {data.length === 0
              ? 'This table has no values.'
              : `No ${noun} match “${filter}”.`}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function HeaderCell({
  header,
  column,
  focused,
  total,
  left,
}: {
  header: Header<typeof features, TopicRow, unknown>;
  column: MetricColumn | undefined;
  focused: boolean;
  total: number;
  /** Sticky offset of the place column (the rank column's width) */
  left: number;
}) {
  const id = header.column.id;
  const sorted = header.column.getIsSorted();
  const canSort = header.column.getCanSort();
  const numeric = id === 'rank' || column?.ranks != null;
  const label =
    column?.metric.label ??
    (typeof header.column.columnDef.header === 'string'
      ? header.column.columnDef.header
      : id);
  const content = (
    <>
      <span className="min-w-0">
        <span className="line-clamp-2 leading-tight">{label}</span>
        {column != null ? (
          <span
            className={cx(
              'text-muted tabular mt-0.5 flex items-center gap-1 text-[10px] font-normal',
              numeric ? 'justify-end' : 'justify-start'
            )}
          >
            {column.ranks != null ? (
              <PolarityIcon pol={column.metric.pol} />
            ) : null}
            {column.year != null ? (
              <span>{column.year}</span>
            ) : column.latest ? (
              <span>Latest</span>
            ) : null}
            <span>
              {column.coverage < total
                ? `${formatInt(column.coverage)}/${formatInt(total)}`
                : ''}
            </span>
          </span>
        ) : null}
      </span>
      {canSort ? (
        sorted === 'asc' ? (
          <ArrowUp className="size-3.5 shrink-0" aria-hidden />
        ) : sorted === 'desc' ? (
          <ArrowDown className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <ChevronsUpDown
            className="size-3.5 shrink-0 opacity-0 group-hover:opacity-60"
            aria-hidden
          />
        )
      ) : null}
    </>
  );
  return (
    <th
      scope="col"
      aria-sort={
        sorted === 'asc'
          ? 'ascending'
          : sorted === 'desc'
            ? 'descending'
            : undefined
      }
      className={cx(
        'border-app bg-surface-2 sticky top-0 z-20 border-b px-2 py-2 align-bottom text-xs font-semibold',
        id === 'rank' && 'left-0 z-30',
        id === 'place' && 'z-30 border-r',
        numeric ? 'text-right' : 'text-left',
        focused && 'shadow-[inset_0_-2px_0_var(--accent)]'
      )}
      style={id === 'place' ? { left } : undefined}
    >
      {canSort ? (
        <button
          type="button"
          onClick={header.column.getToggleSortingHandler()}
          title={
            column != null
              ? `${column.metric.label}${column.year != null ? ` (${column.year})` : ''}. Click to sort.`
              : `Sort by ${label}`
          }
          className={cx(
            'hover:text-app group inline-flex w-full items-end gap-1',
            numeric ? 'justify-end text-right' : 'justify-start text-left',
            sorted === false ? 'text-muted' : 'text-app'
          )}
        >
          {content}
        </button>
      ) : (
        <span className="text-muted" title="Rank on the sorted metric">
          {content}
        </span>
      )}
    </th>
  );
}

/** Most pipe-list items shown inline before collapsing the rest into "+N". */
const LIST_PREVIEW = 2;

/** One value: formatted numbers, compact pipe lists, clamped long text, "—" when missing. */
function ValueCell({
  metric,
  value,
  long,
}: {
  metric: Metric;
  value: number | string | null;
  /** Free-text column: allow three lines before clamping */
  long: boolean;
}) {
  if (value == null || (typeof value === 'number' && Number.isNaN(value)))
    return <span className="text-muted">—</span>;
  if (typeof value === 'number') return <>{formatValue(metric, value)}</>;
  const items = splitList(value);
  if (items.length > LIST_PREVIEW) {
    return (
      <span
        className="flex min-w-0 items-center gap-1"
        title={items.join(', ')}
      >
        <span className="truncate">
          {items.slice(0, LIST_PREVIEW).join(', ')}
        </span>
        <span className="bg-surface-2 text-muted shrink-0 rounded px-1 text-[10px]">
          +{items.length - LIST_PREVIEW}
        </span>
      </span>
    );
  }
  const text = formatValue(metric, value);
  return (
    <span
      className={long ? 'line-clamp-3' : 'line-clamp-2'}
      title={text.length > 30 ? text : undefined}
    >
      {text}
    </span>
  );
}
