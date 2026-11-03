import { defineChart, lineY } from '@tanstack/charts';
import { crosshair } from '@tanstack/charts/crosshair';
import { Chart } from '@tanstack/charts/react';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { tooltip } from '@tanstack/charts/tooltip';
import { useMemo } from 'react';

import type { TrendPoint } from '../model';
import { linearAxisDomain } from '~/lib/axis';
import { chartColors, useTheme } from '~/lib/theme';

export interface TrendSeries {
  name: string;
  color: string;
  /** The median line is drawn dashed and listed first */
  median?: boolean;
  /** The selected place: drawn thicker, on top of the other lines */
  highlight?: boolean;
}

/** About six readable year ticks: every year when few, otherwise a round step. */
export function yearTicks(years: readonly number[]): number[] {
  if (years.length <= 8) return [...years];
  const first = years[0];
  const last = years[years.length - 1];
  const span = last - first;
  const step = [1, 2, 5, 10, 20, 25, 50].find((s) => span / s <= 7) ?? 100;
  const out: number[] = [];
  for (let y = Math.ceil(first / step) * step; y <= last; y += step)
    out.push(y);
  return out;
}

/**
 * Year-by-year lines for the focus metric: a dashed median across all places plus a few named
 * places. Hovering snaps to a year and lists every line's value. For rank-valued metrics the
 * y axis is reversed so rank 1 sits at the top.
 */
export function TrendChart({
  points,
  series,
  years,
  label,
  format,
  tickFormat,
  reversed = false,
  height = 280,
}: {
  points: readonly TrendPoint[];
  series: readonly TrendSeries[];
  years: readonly number[];
  label: string;
  format: (v: number) => string;
  /** Short axis tick labels (no unit) */
  tickFormat: (v: number) => string;
  reversed?: boolean;
  height?: number;
}) {
  const theme = useTheme();
  const colors = chartColors(theme);

  const definition = useMemo(() => {
    const colorOf = new Map(series.map((s) => [s.name, s.color]));
    const medianNames = new Set(
      series.filter((s) => s.median === true).map((s) => s.name)
    );
    const highlightNames = new Set(
      series.filter((s) => s.highlight === true).map((s) => s.name)
    );
    const medianRows = points.filter((p) => medianNames.has(p.series));
    const placeRows = points.filter(
      (p) => !medianNames.has(p.series) && !highlightNames.has(p.series)
    );
    const highlightRows = points.filter((p) => highlightNames.has(p.series));
    const showPoints = years.length <= 12;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points)
      if (p.value != null) {
        lo = Math.min(lo, p.value);
        hi = Math.max(hi, p.value);
      }
    // Ranks run from the worst at the bottom to 1st at the top; values get a padded domain
    // that stays at or above zero for a metric without negative values.
    const yScale =
      lo > hi
        ? scaleLinear().domain([0, 1])
        : reversed
          ? scaleLinear().domain([hi, Math.min(lo, 1)])
          : scaleLinear().domain(linearAxisDomain(lo, hi, 0.04));
    return defineChart({
      marks: [
        crosshair({ x: true, y: false }),
        lineY(medianRows, {
          x: 'year',
          y: 'value',
          z: 'series',
          key: 'year',
          stroke: colors.muted,
          strokeWidth: 2,
          strokeDasharray: '5 4',
          points: showPoints,
        }),
        lineY(placeRows, {
          x: 'year',
          y: 'value',
          z: 'series',
          key: (d) => `${d.series}-${d.year}`,
          stroke: (d) => colorOf.get(d.series) ?? colors.accent,
          strokeWidth: 2.25,
          points: showPoints,
        }),
        lineY(highlightRows, {
          x: 'year',
          y: 'value',
          z: 'series',
          key: (d) => `${d.series}-${d.year}`,
          stroke: (d) => colorOf.get(d.series) ?? colors.highlight,
          strokeWidth: 3.5,
          points: showPoints,
        }),
      ],
      scales: {
        x: {
          scale: scaleLinear,
          axis: {
            ticks: {
              values: yearTicks(years),
              format: (v: number) => String(Math.round(v)),
            },
          },
        },
        y: {
          scale: yScale,
          grid: true,
          axis: {
            label,
            ticks: { count: 5, format: tickFormat },
          },
        },
      },
      focus: 'group-x',
      tooltip: {
        use: tooltip,
        content: (pts) => {
          const first = pts[0]?.datum;
          if (first == null) return { rows: [] };
          const order = new Map(series.map((s, k) => [s.name, k]));
          const rows = [...pts]
            .filter((p) => p.datum.value != null)
            .sort(
              (a, b) =>
                (order.get(a.datum.series) ?? 99) -
                (order.get(b.datum.series) ?? 99)
            )
            .map((p) => ({
              label: p.datum.series,
              value: p.datum.value == null ? '—' : format(p.datum.value),
              color: colorOf.get(p.datum.series),
            }));
          return { title: String(first.year), rows };
        },
      },
    });
  }, [points, series, years, label, format, tickFormat, reversed, colors]);

  return (
    <Chart
      definition={definition}
      height={height}
      ariaLabel={`${label} by year for ${series.map((s) => s.name).join(', ')}`}
    />
  );
}
