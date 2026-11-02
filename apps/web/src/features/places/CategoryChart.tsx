import { defineChart, dot, link, ruleX, text } from '@tanstack/charts';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { tooltip } from '@tanstack/charts/tooltip';
import { useMemo } from 'react';

import { useElementWidth } from './hooks';
import { pctText, percentileColor, percentileScale } from './percentile';
import type { CategoryScore } from './profileModel';
import { chartColors, useTheme } from '~/lib/theme';

interface CategoryDatum {
  key: string;
  label: string;
  /** Average percentile 0–100 */
  pct: number;
  /** Same on 0–1, for the colour scale */
  share: number;
  count: number;
}

const ROW = 30;
/** Averages sit close to 50, so the colour ramp saturates 25 points either side of it. */
export const AVERAGE_SPREAD = 0.25;

/**
 * Lollipop chart of a place's average percentile per category, measured from the median (50):
 * stems to the right are above-median categories, to the left below. Dots are coloured from
 * red (worst) to green (best). Selecting a row calls `onSelect` with the category id.
 */
export function CategoryChart({
  scores,
  label,
  selected,
  onSelect,
}: {
  scores: readonly CategoryScore[];
  label: (id: string) => string;
  selected: string;
  onSelect: (category: string) => void;
}) {
  const theme = useTheme();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const narrow = width > 0 && width < 520;

  const data = useMemo<CategoryDatum[]>(
    () =>
      scores.map((s) => ({
        key: s.category,
        label: label(s.category),
        pct: s.mean * 100,
        share: s.mean,
        count: s.count,
      })),
    [scores, label]
  );

  const definition = useMemo(() => {
    const colors = chartColors(theme);
    const color = percentileColor(theme, AVERAGE_SPREAD);
    return defineChart({
      marks: [
        ruleX([50], {
          stroke: colors.muted,
          strokeOpacity: 0.6,
          strokeDasharray: '3 3',
        }),
        link(data, {
          x1: () => 50,
          x2: 'pct',
          y1: 'label',
          y2: 'label',
          key: 'key',
          stroke: (d) => color(d.share),
          strokeWidth: (d) => (d.key === selected ? 4 : 2.5),
          lineCap: 'round',
        }),
        dot(data, {
          x: 'pct',
          y: 'label',
          key: 'key',
          color: 'share',
          r: 6,
          stroke: colors.border,
          strokeWidth: 1.5,
        }),
        text(data, {
          x: 'pct',
          y: 'label',
          key: 'key',
          text: (d) => pctText(d.share),
          anchor: (d) => (d.pct >= 50 ? 'start' : 'end'),
          dx: (d) => (d.pct >= 50 ? 11 : -11),
          fontSize: 11,
          fontWeight: 600,
        }),
      ],
      scales: {
        x: {
          scale: scaleLinear().domain([0, 100]),
          grid: { stroke: colors.grid, strokeOpacity: 1 },
          axis: {
            label: 'Average percentile (100 = best)',
            ticks: { values: [0, 25, 50, 75, 100] },
          },
        },
        y: {
          scale: scaleBand<string>()
            .domain(data.map((d) => d.label))
            .padding(0.35),
          axis: {
            ticks: {
              size: 0,
              format: (v: string) =>
                narrow && v.length > 16 ? `${v.slice(0, 15)}…` : v,
            },
            tickLabels: {
              thin: false,
              fontWeight: ({ value }) =>
                data.find((d) => d.label === value)?.key === selected
                  ? 700
                  : undefined,
            },
          },
        },
      },
      color: { scale: percentileScale(theme, AVERAGE_SPREAD) },
      margin: { right: 16 },
      tooltip: {
        use: tooltip,
        content: (points) => {
          const d = points[0]?.datum;
          if (d == null) return { rows: [] };
          return {
            title: d.label,
            rows: [
              { label: 'Average percentile', value: pctText(d.share) },
              { label: 'Metrics', value: String(d.count) },
            ],
          };
        },
      },
    });
  }, [data, theme, selected, narrow]);

  const top = data[0];
  const bottom = data[data.length - 1];
  return (
    <div ref={ref}>
      <Chart
        definition={definition}
        height={data.length * ROW + 64}
        ariaLabel="Average percentile by category"
        ariaDescription={
          top != null && bottom != null
            ? `Strongest category ${top.label} (${pctText(top.share)}), weakest ${bottom.label} (${pctText(bottom.share)}). Select a category to list its metrics.`
            : undefined
        }
        onSelect={(p) => {
          if (p != null) onSelect(p.datum.key);
        }}
      />
    </div>
  );
}
