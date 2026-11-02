import { barX, defineChart, text } from '@tanstack/charts';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { tooltip } from '@tanstack/charts/tooltip';
import { useMemo } from 'react';

import { placeNoun, type ValueCount } from '../model';
import type { Dataset } from '~/data/dataset';
import { formatInt } from '~/lib/format';
import { chartColors, useTheme } from '~/lib/theme';

interface CountDatum {
  value: string;
  count: number;
  color: string;
  examples: string;
}

/** Longest category label kept on the axis before it is shortened with an ellipsis. */
const MAX_LABEL = 28;

/**
 * How many places share each value of a categorical metric, most common first. The value is on
 * the axis, so bars share one colour; the tooltip names a few of the places.
 */
export function ValueCountsChart({
  dataset,
  counts,
  label,
}: {
  dataset: Dataset;
  counts: readonly ValueCount[];
  label: string;
}) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const noun = placeNoun(dataset.type.id);

  const definition = useMemo(() => {
    const data: CountDatum[] = counts.map((c) => {
      const names = c.indexes.slice(0, 4).map((i) => dataset.entities[i].name);
      return {
        value:
          c.value.length > MAX_LABEL
            ? `${c.value.slice(0, MAX_LABEL - 1)}…`
            : c.value,
        count: c.count,
        color: colors.accent,
        examples: names.join(', ') + (c.count > names.length ? '…' : ''),
      };
    });
    return defineChart({
      marks: [
        barX(data, {
          y: 'value',
          x: 'count',
          key: 'value',
          fill: (d) => d.color,
          radius: { end: 3 },
        }),
        text(data, {
          y: 'value',
          x: 'count',
          key: 'value',
          text: (d) => formatInt(d.count),
          anchor: 'start',
          dx: 4,
          fontSize: 11,
          fill: colors.muted,
        }),
      ],
      scales: {
        y: {
          scale: () => scaleBand<string>().padding(0.25),
          axis: { ticks: { size: 0 } },
        },
        x: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: {
            label: `Number of ${noun}`,
            ticks: { count: 4, format: (v: number) => formatInt(v) },
          },
        },
      },
      margin: { right: 36 },
      tooltip: {
        use: tooltip,
        content: (points) => {
          const d = points[0]?.datum;
          return d != null
            ? {
                title: d.value,
                rows: [
                  { label: noun, value: formatInt(d.count) },
                  { label: 'Includes', value: d.examples },
                ],
              }
            : { rows: [] };
        },
      },
    });
  }, [counts, dataset, colors, noun]);

  return (
    <Chart
      definition={definition}
      height={Math.max(110, counts.length * 28 + 56)}
      ariaLabel={`${label}: number of ${noun} per value`}
    />
  );
}
