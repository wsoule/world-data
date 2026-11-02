import { defineChart, dot } from '@tanstack/charts';
import { dodgeY } from '@tanstack/charts/dodge';
import { Chart } from '@tanstack/charts/react';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scaleOrdinal } from '@tanstack/charts/scales/ordinal';
import { tooltip } from '@tanstack/charts/tooltip';
import { competitionRank } from '@world-data/stats';
import { useMemo } from 'react';

import { baseRadius } from './colorModel';
import type { Dataset } from '~/data/dataset';
import type { Metric } from '~/data/types';
import { formatValue, ordinal, tickFormatter } from '~/lib/format';
import { chartColors, useTheme } from '~/lib/theme';

interface StripDatum {
  key: string;
  name: string;
  value: number;
  rank: number;
  tone: 'base' | 'highlight';
}

/**
 * One-dimensional beeswarm of a single metric: every place is a dot along the
 * value axis, stacked to avoid overlap. Shown while the overlay waits for a
 * second metric so the basket is never an empty canvas.
 */
export function DotStrip({
  dataset,
  metric,
  entityIdx,
  direction,
  reverse,
  highlight,
  onToggle,
}: {
  dataset: Dataset;
  metric: Metric;
  entityIdx: readonly number[];
  direction: 1 | -1;
  reverse: boolean;
  highlight: ReadonlySet<string>;
  onToggle: (entityId: string) => void;
}) {
  const theme = useTheme();
  const colors = useMemo(() => chartColors(theme), [theme]);

  const { definition, count } = useMemo(() => {
    const col = dataset.numeric(metric.id);
    const masked = new Float64Array(col.length).fill(NaN);
    for (const i of entityIdx) masked[i] = col[i];
    const ranks = competitionRank(masked, direction);
    const rows: StripDatum[] = [];
    for (const i of entityIdx) {
      if (!Number.isFinite(masked[i])) continue;
      const e = dataset.entities[i];
      rows.push({
        key: e.id,
        name: e.name,
        value: masked[i],
        rank: ranks[i],
        tone: highlight.has(e.id) ? 'highlight' : 'base',
      });
    }
    const r = Math.min(5, baseRadius(rows.length));
    return {
      count: rows.length,
      definition: defineChart({
        marks: [
          dot(rows, {
            x: 'value',
            key: 'key',
            r,
            color: 'tone',
            fillOpacity: rows.length > 500 ? 0.6 : 0.85,
            stroke: colors.border,
            strokeWidth: 0.6,
            layout: dodgeY({ anchor: 'middle', padding: 1, fit: 'compress' }),
          }),
        ],
        scales: {
          x: {
            scale: scaleLinear,
            nice: true,
            reverse,
            grid: { stroke: colors.grid, strokeOpacity: 1 },
            axis: {
              label: metric.label,
              ticks: { format: tickFormatter(metric) },
            },
          },
          y: null,
        },
        color: {
          scale: scaleOrdinal(
            ['base', 'highlight'],
            [colors.point, colors.highlight]
          ),
        },
        tooltip: {
          use: tooltip,
          sticky: false,
          content: (points) => {
            const d = points[0]?.datum;
            if (d == null) return { rows: [] };
            return {
              title: d.name,
              rows: [
                { label: metric.label, value: formatValue(metric, d.value) },
                {
                  label: 'Rank',
                  value: `${ordinal(d.rank)} of ${rows.length}`,
                },
              ],
            };
          },
        },
      }),
    };
  }, [dataset, metric, entityIdx, direction, reverse, highlight, colors]);

  return (
    <Chart
      definition={definition}
      height={count > 400 ? 260 : 190}
      ariaLabel={`${metric.label}: distribution across ${count} ${dataset.type.label.toLowerCase()}`}
      onSelect={(point) => {
        if (point != null) onToggle(point.datum.key);
      }}
    />
  );
}
