import { barX, defineChart, text } from '@tanstack/charts';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { tooltip } from '@tanstack/charts/tooltip';
import { useMemo } from 'react';

import { chartColors, useTheme } from '~/lib/theme';

export interface RankBarRow {
  /** unique key, e.g. entity id */
  key: string;
  label: string;
  value: number;
  /** optional fill override */
  color?: string;
  highlight?: boolean;
}

/**
 * Horizontal ranked bars (already sorted by the caller). Height grows with the number of rows.
 */
export function RankBars({
  rows,
  format,
  label,
  rowHeight = 22,
  onSelect,
  className,
  showValues = true,
}: {
  rows: readonly RankBarRow[];
  format: (v: number) => string;
  label: string;
  rowHeight?: number;
  onSelect?: (key: string) => void;
  className?: string;
  showValues?: boolean;
}) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const definition = useMemo(() => {
    const data = rows.map((r, i) => ({
      ...r,
      display: `${i + 1}. ${r.label}`,
    }));
    const hasNegative = data.some((d) => d.value < 0);
    return defineChart({
      marks: [
        barX(data, {
          y: 'display',
          x: 'value',
          fill: (d) =>
            d.color ??
            (d.highlight === true ? colors.highlight : colors.accent),
          radius: { end: 3 },
        }),
        ...(showValues
          ? [
              text(data, {
                y: 'display',
                x: 'value',
                text: (d) => format(d.value),
                anchor: hasNegative ? 'middle' : 'start',
                dx: hasNegative ? 0 : 4,
                fontSize: 11,
                fill: colors.muted,
              }),
            ]
          : []),
      ],
      scales: {
        y: {
          scale: () => scaleBand<string>().padding(0.2),
          axis: { ticks: { size: 0 } },
        },
        x: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: {
            label,
            ticks: { count: 4, format: (v: number) => format(v) },
          },
        },
      },
      margin: { right: showValues ? 64 : 12 },
      tooltip: {
        use: tooltip,
        content: (points) => {
          const d = points[0]?.datum;
          return d != null
            ? { title: d.label, rows: [{ label, value: format(d.value) }] }
            : { rows: [] };
        },
      },
    });
  }, [rows, format, label, colors, showValues]);

  return (
    <Chart
      className={className}
      definition={definition}
      height={Math.max(120, rows.length * rowHeight + 56)}
      ariaLabel={`${label}, ranked`}
      onSelect={(p) => {
        if (p != null && onSelect != null) onSelect(p.datum.key);
      }}
    />
  );
}
