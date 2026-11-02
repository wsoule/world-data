import { Link } from '@tanstack/react-router';
import {
  type Cell,
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  type Header,
  rowSortingFeature,
  sortFn_alphanumeric,
  type SortingState,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Download,
  Pin,
  PinOff,
  Search,
  Table2,
} from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

import { isNeutral, placeNoun } from '../insights/shared';
import {
  averagePercentile,
  type CsvCell,
  standing,
  toCsv,
} from '../insights/tableModel';
import { useBasket } from '../insights/useBasket';
import type { CompareViewProps } from '../state';
import { EmptyState } from '~/components/feedback';
import { Flag } from '~/components/Flag';
import { PolarityIcon } from '~/components/MetricPicker';
import { Button, Card, cx } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import type { EntityType, Metric } from '~/data/types';
import { formatInt, formatValue } from '~/lib/format';

/** One compared place with its values, ranks and percentiles on every basket metric. */
interface TableRow {
  id: string;
  slug: string;
  name: string;
  group: string;
  entityIndex: number;
  values: number[];
  ranks: number[];
  /** Direction-aware percentile 0–1 per metric */
  pcts: number[];
  /** Mean percentile 0–1 over the metrics the place has (NaN when none) */
  avg: number;
  covered: number;
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
});
const helper = createColumnHelper<typeof features, TableRow>();

/** Rows beyond which only the visible window is rendered. */
const VIRTUALIZE_ABOVE = 150;
const ROW_HEIGHT = 41;
const DEFAULT_SORT: SortingState = [{ id: 'avg', desc: true }];

const GROUP_LABEL: Record<EntityType, string> = {
  country: 'Continent',
  state: 'Region',
  city: 'Region',
  county: 'Region',
  'world-city': 'Country',
};

/** Column widths (px) for the fixed table layout; metric columns share METRIC_WIDTH. */
/** Place and group columns are narrower on phones (see the <col> classes). */
const PLACE_WIDTH_MIN = 160;
const GROUP_WIDTH_MIN = 84;
const METRIC_WIDTH = 140;
const AVG_WIDTH = 132;

/**
 * Background tint for a cell from its direction-aware percentile: green towards the best, red
 * towards the worst, transparent in the middle. Metrics with no better/worse direction get a
 * neutral accent ramp (darker = higher) instead. Uses the theme's colour tokens so it follows
 * light and dark mode.
 */
function tint(pct: number, neutral: boolean): CSSProperties | undefined {
  if (Number.isNaN(pct)) return undefined;
  if (neutral)
    return {
      backgroundColor: `color-mix(in oklab, var(--accent) ${Math.round(pct * 20)}%, transparent)`,
    };
  const d = (pct - 0.5) * 2;
  if (Math.abs(d) < 0.08) return undefined;
  const amount = Math.round(Math.abs(d) * 24);
  return {
    backgroundColor: `color-mix(in oklab, var(${d > 0 ? '--good' : '--bad'}) ${amount}%, transparent)`,
  };
}

/**
 * Table view: every basket metric side by side for every compared place, built on TanStack
 * Table v9 (sorting + global filter) with TanStack Virtual for long lists, a direction-aware
 * percentile tint per cell, an average-percentile summary column and CSV export.
 */
export function TableView(props: CompareViewProps) {
  if (props.metrics.length === 0) {
    return (
      <EmptyState
        title="Add metrics to build a table"
        icon={<Table2 className="text-muted size-6" aria-hidden />}
      >
        Every metric you add becomes a column, with each place’s value, rank and
        a colour showing how it compares.
      </EmptyState>
    );
  }
  return <ComparisonTable {...props} />;
}

function ComparisonTable(props: CompareViewProps) {
  const { dataset, search, update } = props;
  const basket = useBasket(props);
  const noun = placeNoun(dataset.type.id);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORT);
  const [filter, setFilter] = useState('');
  const hl = useMemo(() => new Set(search.hl ?? []), [search.hl]);

  const standings = useMemo(
    () => basket.columns.map((c, k) => standing(c, basket.directions[k])),
    [basket]
  );

  const data = useMemo<TableRow[]>(
    () =>
      basket.rows.map((e, p) => {
        const entity = dataset.entities[e];
        const { mean, covered } = averagePercentile(standings, p);
        return {
          id: entity.id,
          slug: entity.slug,
          name: entity.name,
          group: entity.group ?? '',
          entityIndex: e,
          values: basket.columns.map((c) => c[p]),
          ranks: standings.map((s) => s.rank[p]),
          pcts: standings.map((s) => s.pct[p]),
          avg: mean,
          covered,
        };
      }),
    [basket, standings, dataset]
  );

  const toggleHighlight = useCallback(
    (id: string) =>
      update((s) => {
        const cur = s.hl ?? [];
        const next = cur.includes(id)
          ? cur.filter((x) => x !== id)
          : [...cur, id];
        return { hl: next.length > 0 ? next : undefined };
      }),
    [update]
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('name', {
          id: 'place',
          header: dataset.type.singular,
          sortFn: 'alphanumeric',
          cell: (info) => (
            <PlaceCell
              row={info.row.original}
              dataset={dataset}
              highlighted={hl.has(info.row.original.id)}
              onToggle={toggleHighlight}
            />
          ),
        }),
        helper.accessor('group', {
          id: 'group',
          header: GROUP_LABEL[dataset.type.id],
          sortFn: 'alphanumeric',
          cell: (info) => (
            <span className="text-muted truncate">
              {info.getValue() === '' ? '—' : info.getValue()}
            </span>
          ),
        }),
        ...basket.metrics.map((m, k) =>
          helper.accessor(
            (r) => (Number.isNaN(r.values[k]) ? undefined : r.values[k]),
            {
              id: `m${m.id}`,
              header: m.label,
              sortUndefined: 'last',
              sortDescFirst: basket.directions[k] === 1,
              enableGlobalFilter: false,
              cell: (info) => {
                const r = info.row.original;
                const rank = r.ranks[k];
                return (
                  <span className="flex items-baseline justify-end gap-1.5">
                    <span className="tabular truncate">
                      {formatValue(m, r.values[k])}
                    </span>
                    {Number.isNaN(rank) || m.fmt === 'ranking' ? null : (
                      <span className="text-muted tabular w-8 shrink-0 text-right text-[10px]">
                        #{formatInt(rank)}
                      </span>
                    )}
                  </span>
                );
              },
            }
          )
        ),
        helper.accessor((r) => (Number.isNaN(r.avg) ? undefined : r.avg), {
          id: 'avg',
          header: 'Avg. percentile',
          sortUndefined: 'last',
          sortDescFirst: true,
          enableGlobalFilter: false,
          cell: (info) => (
            <AverageCell
              row={info.row.original}
              total={basket.metrics.length}
            />
          ),
        }),
      ]),
    [basket, dataset, hl, toggleHighlight]
  );

  // Drop sorts on columns that left the basket.
  const ids = new Set(columns.map((c) => c.id));
  const activeSorting = sorting.filter((s) => ids.has(s.id));

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (r) => r.id,
    state: {
      sorting: activeSorting.length > 0 ? activeSorting : DEFAULT_SORT,
      globalFilter: filter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: (u) =>
      setFilter((prev) => {
        const next: unknown = typeof u === 'function' ? u(prev) : u;
        return typeof next === 'string' ? next : '';
      }),
    globalFilterFn: 'includesString',
    getColumnCanGlobalFilter: (c) => c.id === 'place' || c.id === 'group',
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;
  const metricIndex = new Map(basket.metrics.map((m, k) => [`m${m.id}`, k]));
  const neutral = basket.metrics.map((m) => isNeutral(search, m));
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = rows.length > VIRTUALIZE_ABOVE;
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
  const visibleRows = virtual ? items.map((it) => rows[it.index]) : rows;

  const coverage = basket.columns.map((c) => {
    let n = 0;
    for (let i = 0; i < c.length; i++) if (!Number.isNaN(c[i])) n++;
    return n;
  });

  const download = () => {
    const header: CsvCell[] = [
      dataset.type.singular,
      'ID',
      GROUP_LABEL[dataset.type.id],
      ...basket.metrics.flatMap((m) => [
        m.label + (m.year != null ? ` (${m.year})` : ''),
        `${m.label} rank`,
      ]),
      'Average percentile',
      'Metrics with data',
    ];
    const body = rows.map((row) => {
      const r = row.original;
      return [
        r.name,
        r.id,
        r.group,
        ...r.values.flatMap((v, k) => [v, r.ranks[k]]),
        Number.isNaN(r.avg) ? null : Math.round(r.avg * 1000) / 10,
        r.covered,
      ];
    });
    const blob = new Blob([toCsv([header, ...body])], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `world-data-${dataset.type.id}-comparison.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const total = basket.rows.length;
  const width =
    PLACE_WIDTH_MIN +
    GROUP_WIDTH_MIN +
    basket.metrics.length * METRIC_WIDTH +
    AVG_WIDTH;

  return (
    <Card
      title={`${formatInt(total)} ${total === 1 ? noun.one : noun.many} × ${basket.metrics.length} ${basket.metrics.length === 1 ? 'metric' : 'metrics'}`}
      subtitle="Cell colour shows how each value compares: green is better and red is worse given each metric’s direction (blue just means higher when a metric has none). # is the rank."
      actions={
        <>
          <label className="border-app bg-surface focus-within:border-accent-400 flex items-center gap-1.5 rounded-lg border px-2 py-1">
            <Search className="text-muted size-3.5" aria-hidden />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Filter ${noun.many}…`}
              aria-label={`Filter ${noun.many} by name or ${GROUP_LABEL[dataset.type.id].toLowerCase()}`}
              className="w-36 bg-transparent text-sm outline-none"
            />
          </label>
          <Button size="sm" onClick={download} disabled={rows.length === 0}>
            <Download className="size-3.5" aria-hidden />
            Download CSV
          </Button>
        </>
      }
    >
      <div className="-m-4">
        <div
          ref={scrollRef}
          className="max-h-[70vh] overflow-auto"
          role="region"
          aria-label="Comparison table"
          tabIndex={0}
        >
          <table
            className="w-full table-fixed border-separate border-spacing-0 text-sm"
            style={{ minWidth: width }}
          >
            <colgroup>
              <col className="w-[160px] sm:w-[220px]" />
              <col className="w-[84px] sm:w-[112px]" />
              {basket.metrics.map((m) => (
                <col key={m.id} style={{ width: METRIC_WIDTH }} />
              ))}
              <col style={{ width: AVG_WIDTH }} />
            </colgroup>
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <HeaderCell
                      key={header.id}
                      header={header}
                      metric={metricFor(header.column.id, basket.metrics)}
                      direction={directionFor(header.column.id, basket)}
                      neutral={
                        neutral[metricIndex.get(header.column.id) ?? -1] ??
                        false
                      }
                      coverage={coverageFor(header.column.id, basket, coverage)}
                      total={total}
                    />
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {padTop > 0 ? (
                <tr aria-hidden>
                  <td style={{ height: padTop }} colSpan={columns.length} />
                </tr>
              ) : null}
              {visibleRows.map((row) => {
                const on = hl.has(row.original.id);
                return (
                  <tr
                    key={row.id}
                    className={cx(
                      'group/row',
                      on && 'bg-accent-50 dark:bg-accent-900/30'
                    )}
                    style={{ height: ROW_HEIGHT }}
                  >
                    {row.getAllCells().map((cell) => (
                      <BodyCell
                        key={cell.id}
                        cell={cell}
                        metricIndex={metricIndex.get(cell.column.id) ?? -1}
                        neutral={
                          neutral[metricIndex.get(cell.column.id) ?? -1] ??
                          false
                        }
                        highlighted={on}
                        render={<table.FlexRender cell={cell} />}
                      />
                    ))}
                  </tr>
                );
              })}
              {padBottom > 0 ? (
                <tr aria-hidden>
                  <td style={{ height: padBottom }} colSpan={columns.length} />
                </tr>
              ) : null}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="text-muted p-6 text-center text-sm">
              No {noun.many} match “{filter}”.
            </p>
          ) : null}
        </div>
        <div className="border-app text-muted flex flex-wrap justify-between gap-2 border-t px-4 py-2 text-xs">
          <span>
            {rows.length === total
              ? `${formatInt(total)} ${noun.many}`
              : `${formatInt(rows.length)} of ${formatInt(total)} ${noun.many}`}
            {hl.size > 0 ? ` · ${hl.size} highlighted` : ''}
          </span>
          <span>Pin a row to highlight it in every view.</span>
        </div>
      </div>
    </Card>
  );
}

function metricFor(columnId: string, metrics: readonly Metric[]) {
  return columnId.startsWith('m')
    ? metrics.find((m) => `m${m.id}` === columnId)
    : undefined;
}

function directionFor(
  columnId: string,
  basket: { metrics: Metric[]; directions: (1 | -1)[] }
): 1 | -1 | null {
  const k = basket.metrics.findIndex((m) => `m${m.id}` === columnId);
  return k < 0 ? null : basket.directions[k];
}

function coverageFor(
  columnId: string,
  basket: { metrics: Metric[] },
  coverage: readonly number[]
): number | null {
  const k = basket.metrics.findIndex((m) => `m${m.id}` === columnId);
  return k < 0 ? null : coverage[k];
}

function HeaderCell({
  header,
  metric,
  direction,
  neutral,
  coverage,
  total,
}: {
  header: Header<typeof features, TableRow, unknown>;
  metric: Metric | undefined;
  direction: 1 | -1 | null;
  neutral: boolean;
  coverage: number | null;
  total: number;
}) {
  const sorted = header.column.getIsSorted();
  const sticky = header.column.id === 'place';
  const numeric = header.column.id !== 'place' && header.column.id !== 'group';
  const label =
    metric?.label ??
    (typeof header.column.columnDef.header === 'string'
      ? header.column.columnDef.header
      : header.column.id);
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
        'border-app bg-surface-2 sticky top-0 z-20 border-b px-2 py-2 align-bottom text-xs font-semibold',
        sticky && 'left-0 z-30 border-r',
        numeric ? 'text-right' : 'text-left'
      )}
    >
      <button
        type="button"
        onClick={() => header.column.toggleSorting()}
        title={
          metric != null
            ? `${metric.label}${metric.year != null ? ` (${metric.year})` : ''} — ${neutral ? 'no better or worse direction' : direction === 1 ? 'higher is better' : 'lower is better'}. Click to sort.`
            : `Sort by ${label}`
        }
        className={cx(
          'hover:text-app group inline-flex w-full items-end gap-1',
          numeric ? 'justify-end text-right' : 'justify-start text-left',
          sorted === false ? 'text-muted' : 'text-app'
        )}
      >
        <span className="min-w-0">
          <span className="line-clamp-3 leading-tight">{label}</span>
          {coverage != null ? (
            <span className="text-muted tabular mt-0.5 flex items-center justify-end gap-1 text-[10px] font-normal">
              {direction != null && !neutral ? (
                <PolarityIcon pol={direction} />
              ) : null}
              {formatInt(coverage)}/{formatInt(total)}
            </span>
          ) : null}
        </span>
        {sorted === 'asc' ? (
          <ArrowUp className="size-3.5 shrink-0" aria-hidden />
        ) : sorted === 'desc' ? (
          <ArrowDown className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <ChevronsUpDown
            className="size-3.5 shrink-0 opacity-0 group-hover:opacity-60"
            aria-hidden
          />
        )}
      </button>
    </th>
  );
}

function BodyCell({
  cell,
  metricIndex,
  neutral,
  highlighted,
  render,
}: {
  cell: Cell<typeof features, TableRow, unknown>;
  /** Basket position of the cell's metric, -1 for place/group/average */
  metricIndex: number;
  /** The metric has no better/worse direction */
  neutral: boolean;
  highlighted: boolean;
  render: ReactNode;
}) {
  const id = cell.column.id;
  const k = metricIndex;
  const sticky = id === 'place';
  return (
    <td
      className={cx(
        'border-app overflow-hidden border-b px-2 whitespace-nowrap',
        sticky &&
          cx(
            'sticky left-0 z-10 border-r',
            highlighted
              ? 'bg-accent-50 dark:bg-[color-mix(in_oklab,var(--color-accent-900)_30%,var(--surface))]'
              : 'bg-surface group-hover/row:bg-surface-2'
          ),
        !sticky && 'group-hover/row:bg-surface-2/60',
        id !== 'place' && id !== 'group' && 'text-right'
      )}
      style={k >= 0 ? tint(cell.row.original.pcts[k], neutral) : undefined}
    >
      {render}
    </td>
  );
}

function PlaceCell({
  row,
  dataset,
  highlighted,
  onToggle,
}: {
  row: TableRow;
  dataset: Dataset;
  highlighted: boolean;
  onToggle: (id: string) => void;
}) {
  const entity = dataset.entities[row.entityIndex];
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Flag entity={entity} type={dataset.type.id} size={18} />
      <Link
        to="/places/$type/$slug"
        params={{ type: dataset.type.id, slug: row.slug }}
        className="min-w-0 truncate font-medium hover:underline"
        title={row.name}
      >
        {row.name}
      </Link>
      <button
        type="button"
        onClick={() => onToggle(row.id)}
        aria-pressed={highlighted}
        aria-label={
          highlighted
            ? `Remove highlight from ${row.name}`
            : `Highlight ${row.name}`
        }
        className={cx(
          'hover:bg-surface-2 ml-auto size-6 shrink-0 place-items-center rounded focus-visible:opacity-100',
          highlighted
            ? 'text-accent-600 dark:text-accent-300 grid'
            : 'text-muted hidden opacity-0 group-hover/row:opacity-100 sm:grid'
        )}
      >
        {highlighted ? (
          <PinOff className="size-3.5" />
        ) : (
          <Pin className="size-3.5" />
        )}
      </button>
    </span>
  );
}

function AverageCell({ row, total }: { row: TableRow; total: number }) {
  if (Number.isNaN(row.avg)) return <span className="text-muted">—</span>;
  const pct = Math.round(row.avg * 100);
  return (
    <span className="flex items-center justify-end gap-2">
      {row.covered < total ? (
        <span
          className="text-muted tabular text-[10px]"
          title={`Has data for ${row.covered} of ${total} metrics`}
        >
          {row.covered}/{total}
        </span>
      ) : null}
      <span className="bg-surface-2 h-1.5 w-10 overflow-hidden rounded-full">
        <span
          className="bg-accent-500 block h-full rounded-full"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular w-7 text-right font-semibold">{pct}</span>
    </span>
  );
}
