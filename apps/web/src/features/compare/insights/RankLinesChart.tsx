import { defineChart, dot, lineY, ruleX } from '@tanstack/charts';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scaleOrdinal } from '@tanstack/charts/scales/ordinal';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip } from '@tanstack/charts/tooltip';
import { Pin, PinOff } from 'lucide-react';
import { useMemo } from 'react';

import { type RankModel, rankTicks, spreadLabels } from './rankLines';
import { placeNoun } from './shared';
import type { BasketColumns } from './useBasket';
import { PolarityIcon } from '~/components/MetricPicker';
import { cx } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import { rankOrder } from '~/data/rankOrder';
import { rankText } from '~/features/places/percentile';
import { formatInt, formatValue, ordinal } from '~/lib/format';
import { chartColors, useTheme } from '~/lib/theme';

/** A place the chart draws; `color` is set for emphasized (bold, labelled) places. */
export interface RankLinePlace {
  /** Position among the compared places (index into the basket columns) */
  position: number;
  id: string;
  name: string;
  color: string | null;
  highlighted: boolean;
  /** Mean percentile 0–100, NaN when not enough coverage */
  average: number;
}

/** One place on one metric. */
interface LineRow {
  key: string;
  placeId: string;
  name: string;
  metric: string;
  k: number;
  /** Plotted value (rank or percentile); null leaves a gap */
  y: number | null;
  rank: number;
  pct: number;
  value: number;
  count: number;
}

/** Locked margins, so the HTML metric headers and end labels can line up with the plot. */
const M = { top: 14, bottom: 14, left: 48, right: 168 };
const HEIGHT = 440;
/** Minimum horizontal space per metric before the chart scrolls sideways. */
const COLUMN_MIN = 108;

/**
 * Parallel-coordinates style chart of ranks: x is the basket (point scale, basket order), y is
 * rank 1…N with 1 at the top (or percentile with 100 at the top), one lineY per place grouped by
 * `z`. Context lines are faint; emphasized places get colour, dots and HTML end labels.
 */
export function RankLinesChart({
  basket,
  model,
  places,
  scale,
  dataset,
  onToggle,
}: {
  basket: BasketColumns;
  model: RankModel;
  places: readonly RankLinePlace[];
  scale: 'rank' | 'pct';
  dataset: Dataset;
  onToggle: (id: string) => void;
}) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const keys = useMemo(() => basket.ids.map(String), [basket]);
  const maxRank = Math.max(2, ...model.counts);
  const emphasized = useMemo(
    () => places.filter((p) => p.color != null),
    [places]
  );
  const noun = placeNoun(dataset.type.id);

  const definition = useMemo(() => {
    const rowsFor = (p: RankLinePlace): LineRow[] =>
      basket.metrics.map((m, k) => {
        const rank = model.ranks[k][p.position];
        const pct = model.pcts[k][p.position];
        const v = scale === 'rank' ? rank : pct;
        return {
          key: `${p.id}:${m.id}`,
          placeId: p.id,
          name: p.name,
          metric: String(m.id),
          k,
          y: Number.isNaN(v) ? null : v,
          rank,
          pct,
          value: basket.columns[k][p.position],
          count: model.counts[k],
        };
      });
    const background = places.filter((p) => p.color == null);
    const bgRows = background.flatMap(rowsFor);
    const emRows = emphasized.flatMap(rowsFor);
    const dots = emRows.filter((r) => r.y != null);
    const colorOf = new Map<string, string | null>(
      emphasized.map((p) => [p.id, p.color])
    );
    const bgOpacity =
      background.length > 1000
        ? 0.05
        : background.length > 300
          ? 0.1
          : background.length > 60
            ? 0.18
            : 0.3;
    const yScale =
      scale === 'rank'
        ? {
            scale: scaleLinear().domain([1, maxRank]),
            reverse: true,
            grid: true,
            axis: {
              line: false,
              ticks: {
                values: rankTicks(maxRank),
                size: 0,
                format: (v: number) => formatInt(v),
              },
            },
          }
        : {
            scale: scaleLinear().domain([0, 100]),
            grid: true,
            axis: {
              line: false,
              ticks: { values: [0, 25, 50, 75, 100], size: 0 },
            },
          };

    return defineChart({
      marks: [
        decorative(ruleX(keys, { stroke: colors.grid, strokeWidth: 1 })),
        lineY(bgRows, {
          x: 'metric',
          y: 'y',
          z: 'placeId',
          key: 'key',
          stroke: colors.muted,
          strokeOpacity: bgOpacity,
          strokeWidth: 1.25,
          states: [
            {
              when: { focus: 'series' },
              style: {
                stroke: colors.accent,
                strokeOpacity: 1,
                strokeWidth: 2.5,
              },
            },
          ],
        }),
        lineY(emRows, {
          x: 'metric',
          y: 'y',
          z: 'placeId',
          key: 'key',
          stroke: (d) => colorOf.get(d.placeId) ?? colors.accent,
          strokeWidth: 2.75,
        }),
        dot(dots, {
          x: 'metric',
          y: 'y',
          key: 'key',
          color: 'placeId',
          r: 4,
          stroke: colors.border,
          strokeWidth: 1.5,
        }),
      ],
      scales: {
        x: {
          scale: scalePoint<string>().domain(keys).padding(0),
          axis: false,
        },
        y: yScale,
      },
      color: {
        scale: scaleOrdinal(
          emphasized.map((p) => p.id),
          emphasized.map((p) => p.color ?? colors.accent)
        ),
      },
      margin: M,
      tooltip: {
        use: tooltip,
        sticky: false,
        content: (points) => {
          const d = points[0]?.datum;
          if (d == null) return { rows: [] };
          const metric = basket.metrics[d.k];
          return {
            title: d.name,
            color: colorOf.get(d.placeId) ?? undefined,
            rows: [
              { label: 'Metric', value: metric.label },
              {
                label: 'Rank',
                value: Number.isNaN(d.rank)
                  ? 'No data'
                  : rankText(
                      { rank: d.rank, n: d.count },
                      rankOrder(metric, basket.directions[d.k])
                    ),
              },
              { label: 'Value', value: formatValue(metric, d.value) },
              {
                label: 'Percentile',
                value: Number.isNaN(d.pct) ? '—' : `${Math.round(d.pct)}`,
              },
              { label: '', value: 'Click to toggle highlight' },
            ],
          };
        },
      },
    });
  }, [basket, model, places, emphasized, scale, keys, maxRank, colors]);

  // End-of-line labels for emphasized places, nudged apart in pixel space.
  const labels = useMemo(() => {
    const plotH = HEIGHT - M.top - M.bottom;
    const toPx = (v: number) =>
      scale === 'rank'
        ? M.top + ((v - 1) / (maxRank - 1)) * plotH
        : M.top + ((100 - v) / 100) * plotH;
    const items = emphasized
      .map((p) => {
        const series = scale === 'rank' ? model.ranks : model.pcts;
        for (let k = series.length - 1; k >= 0; k--) {
          const v = series[k][p.position];
          if (!Number.isNaN(v)) return { place: p, value: v, px: toPx(v) };
        }
        return null;
      })
      .filter((x) => x != null);
    const tops = spreadLabels(
      items.map((i) => i.px),
      15,
      M.top,
      HEIGHT - M.bottom
    );
    return items.map((it, i) => ({ ...it, top: tops[i] }));
  }, [emphasized, model, scale, maxRank]);

  const k = basket.metrics.length;
  const minWidth = M.left + M.right + (k - 1) * COLUMN_MIN;
  const xAt = (i: number) =>
    `calc(${M.left}px + (100% - ${M.left + M.right}px) * ${k > 1 ? i / (k - 1) : 0})`;
  const columnWidth = `min(170px, calc((100% - ${M.left + M.right}px) / ${Math.max(1, k - 1)} - 6px))`;
  const best = emphasized.find((p) => !p.highlighted);
  // Rank 1 is the best on metrics with a direction, and simply the highest on neutral ones.
  const anyNeutral = basket.neutral.some((n) => n);
  const axisNote =
    scale === 'rank'
      ? anyNeutral
        ? 'Rank · 1 = best (or highest)'
        : 'Rank · 1 = best'
      : anyNeutral
        ? 'Percentile · 100 = best (or highest)'
        : 'Percentile · 100 = best';

  return (
    <div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="relative" style={{ minWidth }}>
          <div className="relative h-[4.5rem]" aria-hidden>
            <span className="text-muted absolute top-0 left-0 text-xs font-medium">
              {axisNote}
            </span>
            {basket.metrics.map((m, i) => (
              <div
                key={m.id}
                className="absolute bottom-1 flex items-end justify-center gap-0.5 text-center"
                style={{
                  // Centred on the axis, but never past the left edge.
                  left: `max(0px, calc(${xAt(i)} - ${columnWidth} / 2))`,
                  width: columnWidth,
                }}
                title={dataset.metricFullLabel(m.id)}
              >
                <span className="line-clamp-3 text-[11px] leading-tight font-medium">
                  {m.label}
                </span>
                <PolarityIcon
                  pol={basket.neutral[i] ? 0 : basket.directions[i]}
                  className="mb-px shrink-0"
                />
              </div>
            ))}
          </div>
          <div className="relative">
            <Chart
              definition={definition}
              height={HEIGHT}
              ariaLabel={`Rank lines: each ${noun.one}'s ${scale === 'rank' ? 'rank' : 'percentile'} across ${k} metrics`}
              ariaDescription={
                best != null
                  ? `${best.name} has the best average percentile. Use the arrow keys to move between points and Enter to toggle a highlight.`
                  : undefined
              }
              onSelect={(p) => {
                if (p != null) onToggle(p.datum.placeId);
              }}
            />
            <div aria-hidden>
              {labels.map(({ place, top }) => (
                <div
                  key={place.id}
                  className="absolute flex items-center gap-1.5 text-xs leading-none font-semibold"
                  style={{
                    top: top - 7,
                    left: `calc(100% - ${M.right - 12}px)`,
                    width: M.right - 14,
                  }}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: place.color ?? undefined }}
                  />
                  <span className="truncate">{place.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="text-muted mt-1 text-[11px] sm:hidden">
        Scroll sideways to see every metric.
      </p>
      {emphasized.length > 0 ? (
        <ul
          className="mt-3 flex flex-wrap gap-1.5"
          aria-label={`Emphasized ${noun.many}`}
        >
          {emphasized.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={p.highlighted}
                onClick={() => onToggle(p.id)}
                title={p.highlighted ? 'Remove highlight' : 'Pin as highlight'}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                  p.highlighted
                    ? 'border-accent-300 bg-accent-50 dark:border-accent-700 dark:bg-accent-900/40'
                    : 'border-app hover:bg-surface-2'
                )}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: p.color ?? undefined }}
                  aria-hidden
                />
                <span className="font-medium">{p.name}</span>
                {Number.isFinite(p.average) ? (
                  <span className="text-muted tabular">
                    avg {ordinal(Math.round(p.average))} pctl
                  </span>
                ) : null}
                {p.highlighted ? (
                  <PinOff className="text-muted size-3" aria-hidden />
                ) : (
                  <Pin className="text-muted size-3" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
