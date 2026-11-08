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
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from 'lucide-react';
import {
  type CSSProperties,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { SharedMetric } from './versusModel';
import { Flag } from '~/components/Flag';
import { PolarityIcon } from '~/components/MetricPicker';
import { Card, cx, Segmented } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import { rankOrder } from '~/data/rankOrder';
import type { Entity } from '~/data/types';
import { placeNoun } from '~/features/places/datasetFacts';
import { useVirtualRows } from '~/features/places/hooks';
import { rankText } from '~/features/places/percentile';
import { MetricLink, metricSubline } from '~/features/places/ProfileSections';
import { formatValue, plural } from '~/lib/format';
import { searchItems } from '~/lib/textSearch';

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
});
const helper = createColumnHelper<typeof features, SharedMetric>();

const ROW_HEIGHT = 54;
const DEFAULT_SORT: SortingState = [{ id: 'gap', desc: true }];
/**
 * Columns left out below the `sm` breakpoint so every place's value fits on a phone without
 * scrolling sideways; the winner's value is already bold in its colour.
 */
const DESKTOP_ONLY: ReadonlySet<string> = new Set(['winner', 'gap']);

/**
 * Every metric the compared places share: each place's value and rank, the winner (none for
 * neutral metrics or ties) and the percentile gap. Sortable and searchable; long lists are
 * virtualized.
 */
export function VersusTable({
  dataset,
  places,
  shared,
  colors,
  categoryLabel,
  category,
  adjusted,
}: {
  dataset: Dataset;
  places: readonly Entity[];
  shared: readonly SharedMetric[];
  colors: readonly string[];
  categoryLabel: (id: string) => string;
  category: string | undefined;
  /** Metric ids whose values are cost-of-living adjusted, marked in their row */
  adjusted: ReadonlySet<number>;
}) {
  const type = dataset.type.id;
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [scope, setScope] = useState<'polar' | 'all'>('polar');
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORT);
  const scrollRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => {
    const kept = shared.filter(
      (s) =>
        (scope === 'all' || s.polar) &&
        (category == null || s.metric.cats.includes(category))
    );
    return searchItems(kept, deferredQuery, (s) => [
      { text: s.metric.label, weight: 3 },
      { text: dataset.metricContext(s.metric.id) ?? '', weight: 2 },
      { text: s.metric.cats.join(' '), weight: 1 },
    ]);
  }, [shared, scope, category, deferredQuery, dataset]);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor((s) => s.metric.label, {
          id: 'metric',
          header: 'Metric',
          sortFn: 'alphanumeric',
          cell: (info) => {
            const s = info.row.original;
            return (
              <div className="min-w-0">
                <span className="flex min-w-0 items-center gap-1 text-sm">
                  <MetricLink dataset={dataset} metric={s.metric} />
                  <PolarityIcon
                    pol={s.polar ? s.metric.pol : 0}
                    className="shrink-0"
                  />
                  {adjusted.has(s.metric.id) ? (
                    <span
                      className="border-accent-300 text-accent-700 dark:text-accent-300 shrink-0 rounded border px-1 text-[10px] leading-4"
                      title="Adjusted: see the Adjust choice above for how"
                    >
                      adjusted
                    </span>
                  ) : null}
                </span>
                <span className="text-muted block truncate text-xs">
                  {metricSubline(dataset, s.metric)}
                </span>
              </div>
            );
          },
        }),
        ...places.map((p, k) =>
          helper.accessor((s) => s.standings[k].pct, {
            id: `p${k}`,
            header: p.name,
            sortDescFirst: true,
            cell: (info) => {
              const s = info.row.original;
              const won = s.winner === k;
              return (
                <div className="text-right">
                  <div
                    className={cx(
                      'tabular truncate text-sm',
                      won && 'font-semibold'
                    )}
                    style={won ? { color: colors[k] } : undefined}
                  >
                    {formatValue(s.metric, s.values[k])}
                  </div>
                  <div className="tabular text-muted truncate text-xs">
                    {rankText(s.standings[k], rankOrder(s.metric))}
                  </div>
                </div>
              );
            },
          })
        ),
        helper.accessor((s) => s.winner ?? (s.polar ? -1 : -2), {
          id: 'winner',
          header: 'Winner',
          cell: (info) => {
            const s = info.row.original;
            if (!s.polar)
              return (
                <span
                  className="text-muted text-xs"
                  title="Neither higher nor lower is better"
                >
                  No winner
                </span>
              );
            if (s.winner == null)
              return <span className="text-muted text-xs">Tie</span>;
            const w = places[s.winner];
            return (
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: colors[s.winner] }}
                  aria-hidden
                />
                <Flag entity={w} type={type} size={16} />
                <span className="truncate">{w.name}</span>
              </span>
            );
          },
        }),
        helper.accessor((s) => s.spread, {
          id: 'gap',
          header: 'Gap',
          sortDescFirst: true,
          cell: (info) => (
            <span
              className="tabular text-muted text-sm"
              title="Difference between the highest and lowest percentile, in points"
            >
              {Math.round(info.getValue() * 100)}
            </span>
          ),
        }),
      ]),
    [dataset, places, colors, type, adjusted]
  );

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (s) => String(s.metric.id),
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
  });
  const rows = table.getRowModel().rows;
  const virtual = useVirtualRows({
    count: rows.length,
    rowHeight: ROW_HEIGHT,
    scrollRef,
    threshold: 60,
    getKey: (i) => rows[i]?.id ?? String(i),
  });
  const colCount = places.length + 3;

  return (
    <Card
      title="Every shared metric"
      subtitle={`${plural(data.length, 'metric')}${scope === 'polar' ? ' with a better end' : ''} that ${places.length === 2 ? 'both places' : `all ${places.length} places`} have${category != null ? ` in ${categoryLabel(category)}` : ''}. Ranks are among all ${placeNoun(dataset)}.`}
      actions={
        <>
          <Segmented
            size="sm"
            ariaLabel="Which metrics to list"
            value={scope}
            onChange={setScope}
            options={[
              {
                value: 'polar',
                label: 'Better / worse',
                title: 'Metrics where higher or lower is better',
              },
              { value: 'all', label: 'All', title: 'Include neutral metrics' },
            ]}
          />
          <SearchBox value={query} onChange={setQuery} />
        </>
      }
    >
      <div className="-m-4">
        <div
          ref={scrollRef}
          className="max-h-[70vh] overflow-auto"
          role="region"
          aria-label="Shared metrics table"
          tabIndex={0}
        >
          <table
            className="w-full min-w-(--vs-min) table-fixed border-separate border-spacing-0 text-sm sm:min-w-(--vs-min-sm)"
            style={
              {
                '--vs-min': `${8.5 + places.length * 6.5}rem`,
                '--vs-min-sm': `${11.5 + places.length * 9 + 14.5}rem`,
              } as CSSProperties
            }
          >
            <colgroup>
              <col className="sm:w-auto" />
              {places.map((p) => (
                <col key={p.id} className="w-[6.5rem] sm:w-[9rem]" />
              ))}
              <col className="w-0 sm:w-[10rem]" />
              <col className="w-0 sm:w-[4.5rem]" />
            </colgroup>
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <HeaderCell
                      key={header.id}
                      header={header}
                      color={
                        header.column.id.startsWith('p')
                          ? colors[Number(header.column.id.slice(1))]
                          : undefined
                      }
                    />
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {virtual.padTop > 0 ? (
                <tr aria-hidden>
                  <td style={{ height: virtual.padTop }} colSpan={colCount} />
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
                          'border-app border-b px-2 py-1.5 sm:px-3',
                          DESKTOP_ONLY.has(cell.column.id) &&
                            'hidden sm:table-cell',
                          cell.column.id === 'metric' &&
                            'bg-surface group-hover/row:bg-surface-2 sticky left-0 z-[1]',
                          cell.column.id === 'gap' && 'text-right'
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
                  <td
                    style={{ height: virtual.padBottom }}
                    colSpan={colCount}
                  />
                </tr>
              ) : null}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="text-muted p-8 text-center text-sm">
              No shared metrics match
              {query.trim() !== '' ? ` “${query.trim()}”` : ''}.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="border-app bg-surface focus-within:border-accent-400 flex w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 sm:w-56">
      <Search className="text-muted size-4 shrink-0" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search metrics…"
        aria-label="Search shared metrics"
        className="placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
    </label>
  );
}

function HeaderCell({
  header,
  color,
}: {
  header: Header<typeof features, SharedMetric, unknown>;
  color: string | undefined;
}) {
  const sorted = header.column.getIsSorted();
  const id = header.column.id;
  const left = id === 'metric' || id === 'winner';
  const label =
    typeof header.column.columnDef.header === 'string'
      ? header.column.columnDef.header
      : id;
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
        'border-app bg-surface-2 text-muted sticky top-0 z-[2] border-b px-2 py-2 text-xs font-medium sm:px-3',
        DESKTOP_ONLY.has(id) && 'hidden sm:table-cell',
        id === 'metric' && 'left-0 z-[3]',
        left ? 'text-left' : 'text-right'
      )}
    >
      <button
        type="button"
        onClick={header.column.getToggleSortingHandler()}
        className={cx(
          'hover:text-app inline-flex max-w-full items-center gap-1',
          !left && 'flex-row-reverse',
          sorted !== false && 'text-app'
        )}
        title={
          id.startsWith('p')
            ? `Sort by ${label}'s percentile`
            : `Sort by ${label.toLowerCase()}`
        }
      >
        {color != null ? (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        ) : null}
        <span className="truncate">{label}</span>
        {sorted === 'asc' ? (
          <ArrowUp className="size-3 shrink-0" aria-hidden />
        ) : sorted === 'desc' ? (
          <ArrowDown className="size-3 shrink-0" aria-hidden />
        ) : (
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" aria-hidden />
        )}
      </button>
    </th>
  );
}
