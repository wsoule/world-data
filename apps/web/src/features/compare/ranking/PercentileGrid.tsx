import { cell, defineChart, text } from '@tanstack/charts';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { tooltip } from '@tanstack/charts/tooltip';
import { useMemo } from 'react';

import type { CompareViewProps } from '../state';
import { percentileScale, percentileStops } from './colors';
import type { RankingModel } from './useRanking';
import { useWidth } from './useWidth';
import { midSentence } from './words';
import { Card } from '~/components/ui';
import { rankOrder } from '~/data/rankOrder';
import { rankText } from '~/features/places/percentile';
import { formatValue } from '~/lib/format';
import { chartColors, useTheme } from '~/lib/theme';

const TOP = 10;
/** Approximate advance of one 11px label character, for layout estimates. */
const CHAR_PX = 6.2;
/** Longest column label before truncation. */
const MAX_CHARS = 30;

interface GridDatum {
  key: string;
  /** Entity id (row); tick labels map it to "rank. name" */
  place: string;
  /** Unique metric label (column) */
  metric: string;
  /** Percentile 0–100, null when the place has no value */
  pct: number | null;
  value: string;
  rankLabel: string;
}

const truncate = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

interface GridLayout {
  /** Column label rotation in degrees (0 = horizontal) */
  rotate: number;
  /** Print percentiles inside cells */
  labelled: boolean;
  rowHeight: number;
  /** Estimated height of the column-label header */
  header: number;
  right: number;
}

// Choose column-label rotation, cell labels and row height from the measured width: horizontal
// labels when every label fits its column, 35° for medium columns, 65° for narrow ones (40
// metrics, phones). The rotated header's height and right overhang are estimated so the chart
// can be given a height that keeps rows a steady size.
function gridLayout(
  width: number,
  columns: readonly string[],
  rows: readonly string[]
): GridLayout {
  const longestRow = Math.max(0, ...rows.map((r) => r.length));
  const longestCol = Math.min(
    MAX_CHARS,
    Math.max(0, ...columns.map((c) => c.length))
  );
  const n = Math.max(1, columns.length);
  const left = longestRow * CHAR_PX + 14;
  const avail = (width > 0 ? width : 800) - left;
  const col0 = Math.max(1, avail - 8) / n;
  const textPx = longestCol * CHAR_PX;
  if (col0 >= textPx + 10)
    return {
      rotate: 0,
      labelled: col0 >= 24,
      rowHeight: col0 >= 24 ? 34 : 24,
      header: 28,
      right: 8,
    };
  const angle = col0 >= 44 ? 35 : 65;
  const rad = (angle * Math.PI) / 180;
  const right = Math.max(8, Math.ceil(textPx * Math.cos(rad) - col0 / 2 + 8));
  const col = Math.max(1, avail - right) / n;
  return {
    rotate: -angle,
    labelled: col >= 24,
    rowHeight: col >= 24 ? 34 : 24,
    header: Math.ceil(textPx * Math.sin(rad) + 20),
    right,
  };
}

/** Heat grid of the top places' percentile on every active metric (green = best, red = worst). */
export function PercentileGrid({
  props,
  model,
}: {
  props: CompareViewProps;
  model: RankingModel;
}) {
  const { dataset, search, update } = props;
  const theme = useTheme();
  const hlKey = (search.hl ?? []).join(',');
  const [boxRef, width] = useWidth<HTMLDivElement>();

  const built = useMemo(() => {
    const { base, inputs, stats, labels, entityIdx, metrics } = model;
    const top = base.order.slice(0, TOP);
    const active = inputs.flatMap((inp, k) => (inp.weight > 0 ? [k] : []));
    const columns = active.map(
      (k) => labels.get(inputs[k].id) ?? `#${inputs[k].id}`
    );
    const tickLabel = new Map<string, string>();
    const cells: GridDatum[] = [];
    for (const i of top) {
      const entity = dataset.entities[entityIdx[i]];
      tickLabel.set(entity.id, `${base.composite.rank[i]}. ${entity.name}`);
      active.forEach((k, c) => {
        const p = stats[k].pct[i];
        const has = !Number.isNaN(p);
        cells.push({
          key: `${entity.id}:${inputs[k].id}`,
          place: entity.id,
          metric: columns[c],
          pct: has ? p : null,
          value: formatValue(metrics[k], inputs[k].values[i]),
          rankLabel: has
            ? rankText(
                { rank: stats[k].rank[i], n: stats[k].n },
                rankOrder(metrics[k], inputs[k].direction)
              )
            : 'No data',
        });
      });
    }
    return { cells, columns, tickLabel };
  }, [model, dataset]);

  const layout = gridLayout(width, built.columns, [
    ...built.tickLabel.values(),
  ]);
  const { rotate, labelled, right } = layout;

  const definition = useMemo(() => {
    const { cells, columns, tickLabel } = built;
    const colors = chartColors(theme);
    const stops = percentileStops(theme);
    const hl = new Set(hlKey === '' ? [] : hlKey.split(','));
    const withData = cells.filter((d) => d.pct != null);
    const missing = cells.filter((d) => d.pct == null);
    return defineChart({
      marks: [
        cell(withData, {
          x: 'metric',
          y: 'place',
          color: (d) => d.pct,
          key: 'key',
          inset: 1.5,
          radius: 4,
        }),
        decorative(
          cell(missing, {
            x: 'metric',
            y: 'place',
            key: 'key',
            fill: colors.missing,
            inset: 1.5,
            radius: 4,
          })
        ),
        ...(labelled
          ? [
              decorative(
                text(cells, {
                  x: 'metric',
                  y: 'place',
                  text: (d) => (d.pct != null ? Math.round(d.pct) : '–'),
                  anchor: 'middle',
                  fontSize: 11,
                  fontWeight: 600,
                  fill: stops.text,
                })
              ),
            ]
          : []),
      ],
      scales: {
        x: {
          scale: scaleBand<string>().domain(columns).padding(0.02),
          side: 'top',
          axis: {
            ticks: {
              size: 0,
              format: (v: string) => truncate(v, MAX_CHARS),
            },
            tickLabels:
              rotate !== 0
                ? { rotate, anchor: 'start', dx: -4, thin: false }
                : { thin: false },
          },
        },
        y: {
          scale: scaleBand<string>()
            .domain([...tickLabel.keys()])
            .padding(0.02),
          axis: {
            ticks: { size: 0, format: (v: string) => tickLabel.get(v) ?? v },
            tickLabels: {
              fontWeight: ({ value }) => (hl.has(value) ? 700 : undefined),
            },
          },
        },
      },
      color: { scale: percentileScale(theme) },
      margin: { right },
      tooltip: {
        use: tooltip,
        content: (points) => {
          const d = points[0]?.datum;
          if (d == null) return { rows: [] };
          return {
            title: tickLabel.get(d.place) ?? d.place,
            rows: [
              { label: d.metric, value: d.value },
              { label: 'Rank', value: d.rankLabel },
              {
                label: 'Percentile',
                value: d.pct != null ? String(Math.round(d.pct)) : '—',
              },
            ],
          };
        },
      },
    });
  }, [built, theme, hlKey, rotate, labelled, right]);

  const rows = built.tickLabel.size;
  if (rows === 0 || built.columns.length === 0) return null;
  const stops = percentileStops(theme);
  const scale = percentileScale(theme);
  return (
    <Card
      title={`Strengths and weak spots · top ${rows}`}
      subtitle="Percentile on each metric among the ranked places (100 = best). Click a row to highlight it."
    >
      <div ref={boxRef}>
        <Chart
          definition={definition}
          height={rows * layout.rowHeight + layout.header + 8}
          ariaLabel={`Heat grid of percentiles for the top ${rows} ${midSentence(dataset.type.label)} across ${built.columns.length} metrics`}
          onSelect={(p) => {
            if (p == null) return;
            const id = p.datum.place;
            update((s) => {
              const cur = s.hl ?? [];
              const next = cur.includes(id)
                ? cur.filter((x) => x !== id)
                : [...cur, id];
              return { hl: next.length > 0 ? next : undefined };
            });
          }}
        />
      </div>
      <div
        className="text-muted mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        aria-hidden
      >
        <span className="inline-flex items-center gap-2">
          Worst
          <span
            className="inline-block h-2.5 w-28 rounded-full"
            style={{
              background: `linear-gradient(to right, ${[0, 25, 50, 75, 100].map((v) => scale(v)).join(', ')})`,
            }}
          />
          Best
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-sm"
            style={{
              background: chartColors(theme).missing,
              color: stops.text,
            }}
          />
          No data
        </span>
      </div>
    </Card>
  );
}
