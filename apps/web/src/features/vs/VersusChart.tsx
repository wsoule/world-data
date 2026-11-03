import { defineChart, dot, link } from '@tanstack/charts';
import { decorative } from '@tanstack/charts/mark/decorative';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scaleOrdinal } from '@tanstack/charts/scales/ordinal';
import { tooltip } from '@tanstack/charts/tooltip';
import { useMemo } from 'react';

import { placePalette } from './palette';
import type { SharedMetric } from './versusModel';
import type { Dataset } from '~/data/dataset';
import { rankOrder } from '~/data/rankOrder';
import type { Entity } from '~/data/types';
import { useElementWidth } from '~/features/places/hooks';
import { pctText, rankText } from '~/features/places/percentile';
import { formatValue } from '~/lib/format';
import { chartColors, useTheme } from '~/lib/theme';

interface PlacePoint {
  key: string;
  /** Metric id as a string: the band value of its row */
  row: string;
  place: string;
  name: string;
  /** Percentile 0–100 */
  pct: number;
  value: string;
  rank: string;
}

interface RowRange {
  row: string;
  lo: number;
  hi: number;
}

const ROW = 28;

/**
 * Dumbbell chart: one row per metric, a dot per compared place at its percentile among every
 * place of the type (100 = best), joined by a rule from the lowest to the highest. Rows are
 * the metrics where the places differ most.
 */
export function VersusChart({
  dataset,
  places,
  metrics,
}: {
  dataset: Dataset;
  places: readonly Entity[];
  metrics: readonly SharedMetric[];
}) {
  const theme = useTheme();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const maxChars = width > 0 && width < 640 ? 22 : 42;

  const definition = useMemo(() => {
    const colors = chartColors(theme);
    const palette = placePalette(theme);
    const labels = new Map<string, string>();
    const points: PlacePoint[] = [];
    const ranges: RowRange[] = [];
    for (const s of metrics) {
      const row = String(s.metric.id);
      labels.set(row, s.metric.label);
      let lo = 100;
      let hi = 0;
      s.standings.forEach((st, k) => {
        const pct = st.pct * 100;
        lo = Math.min(lo, pct);
        hi = Math.max(hi, pct);
        points.push({
          key: `${row}:${places[k].id}`,
          row,
          place: places[k].id,
          name: places[k].name,
          pct,
          value: formatValue(s.metric, s.values[k]),
          rank: rankText(st, rankOrder(s.metric)),
        });
      });
      ranges.push({ row, lo, hi });
    }
    const truncate = (s: string) =>
      s.length > maxChars ? `${s.slice(0, maxChars - 1).trimEnd()}…` : s;
    return defineChart({
      marks: [
        decorative(
          link(ranges, {
            x1: 'lo',
            x2: 'hi',
            y1: 'row',
            y2: 'row',
            key: 'row',
            stroke: colors.muted,
            strokeOpacity: 0.45,
            strokeWidth: 3,
          })
        ),
        dot(points, {
          x: 'pct',
          y: 'row',
          key: 'key',
          color: 'place',
          r: 6,
          stroke: colors.border,
          strokeWidth: 1.5,
        }),
      ],
      scales: {
        x: {
          scale: scaleLinear().domain([0, 100]),
          grid: { stroke: colors.grid, strokeOpacity: 1 },
          axis: {
            label: 'Percentile among all places (100 = best)',
            ticks: { values: [0, 25, 50, 75, 100] },
          },
        },
        y: {
          scale: scaleBand<string>()
            .domain(metrics.map((s) => String(s.metric.id)))
            .padding(0.3),
          axis: {
            ticks: {
              size: 0,
              format: (v: string) => truncate(labels.get(v) ?? v),
            },
            tickLabels: { thin: false },
          },
        },
      },
      color: {
        scale: scaleOrdinal(
          places.map((p) => p.id),
          places.map((_, k) => palette[k])
        ),
      },
      margin: { right: 16 },
      tooltip: {
        use: tooltip,
        content: (focused) => {
          const d = focused[0]?.datum;
          if (d == null) return { rows: [] };
          const s = metrics.find((m) => String(m.metric.id) === d.row);
          return {
            title: s != null ? dataset.metricFullLabel(s.metric.id) : d.name,
            rows: points
              .filter((p) => p.row === d.row)
              .map((p) => ({
                label: p.name,
                value: `${p.value} · ${p.rank} · ${pctText(p.pct / 100)}`,
              })),
          };
        },
      },
    });
  }, [metrics, places, theme, maxChars, dataset]);

  return (
    <div ref={ref}>
      <Chart
        definition={definition}
        height={metrics.length * ROW + 64}
        ariaLabel={`Percentiles of ${places.map((p) => p.name).join(', ')} on the ${metrics.length} metrics where they differ most`}
        ariaDescription="Each row is a metric; each dot is one place's percentile among all places, where 100 is best. The full table below lists exact values."
      />
    </div>
  );
}
