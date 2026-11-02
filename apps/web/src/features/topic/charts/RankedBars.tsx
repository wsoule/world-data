import { barX, defineChart, text } from '@tanstack/charts';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { tooltip } from '@tanstack/charts/tooltip';
import { useMemo } from 'react';

import { placeNoun, type RankedEntry } from '../model';
import type { Dataset } from '~/data/dataset';
import { chartColors, useTheme } from '~/lib/theme';

/** Band label used for the break between the top and bottom of a long ranking. */
const GAP = '···';

interface BarDatum {
  key: string;
  index: number;
  display: string;
  name: string;
  rank: number;
  value: number;
  /** Bar length: the value, or an inverted rank so rank 1 is the longest bar */
  length: number;
  selected: boolean;
}

/**
 * Horizontal ranking with the places' true competition ranks in the labels (so the bottom of a
 * "top 15 + bottom 5" window reads 46–50, not 16–20) and a visual break between the two parts.
 * For rank-valued metrics (`invert`), bars are inverted so the best rank draws the longest bar
 * and the axis is hidden; labels still show the rank.
 */
export function RankedBars({
  dataset,
  head,
  tail,
  total,
  label,
  format,
  tickFormat,
  invert = false,
  selected,
  onSelect,
  rowHeight = 22,
}: {
  dataset: Dataset;
  head: readonly RankedEntry[];
  tail: readonly RankedEntry[];
  /** Number of ranked places (for the tooltip and the inverted bar length) */
  total: number;
  label: string;
  format: (v: number) => string;
  /** Short axis tick labels (no unit) */
  tickFormat: (v: number) => string;
  invert?: boolean;
  selected: number | null;
  onSelect: (entityIndex: number) => void;
  rowHeight?: number;
}) {
  const theme = useTheme();
  const colors = chartColors(theme);
  const gap = tail.length > 0;

  const definition = useMemo(() => {
    const maxRankValue = Math.max(
      0,
      ...head.map((e) => e.value),
      ...tail.map((e) => e.value)
    );
    // Rank-valued metrics already print the rank as the value, so the label is just the name
    // (made unique with the id if two places share a name, since labels are band keys).
    const names = new Map<string, number>();
    for (const e of [...head, ...tail]) {
      const name = dataset.entities[e.index].name;
      names.set(name, (names.get(name) ?? 0) + 1);
    }
    const toDatum = (e: RankedEntry): BarDatum => {
      const entity = dataset.entities[e.index];
      const name = entity.name;
      const plain =
        (names.get(name) ?? 0) > 1 ? `${name} (${entity.id})` : name;
      return {
        key: entity.id,
        index: e.index,
        display: invert ? plain : `${e.rank}. ${plain}`,
        name,
        rank: e.rank,
        value: e.value,
        length: invert ? maxRankValue + 1 - e.value : e.value,
        selected: e.index === selected,
      };
    };
    const data = [...head.map(toDatum), ...tail.map(toDatum)];
    const domain = [
      ...head.map((e) => toDatum(e).display),
      ...(gap ? [GAP] : []),
      ...tail.map((e) => toDatum(e).display),
    ];
    const hasNegative = data.some((d) => d.length < 0);
    return defineChart({
      marks: [
        barX(data, {
          y: 'display',
          x: 'length',
          key: 'key',
          fill: (d) => (d.selected ? colors.highlight : colors.accent),
          radius: { end: 3 },
        }),
        text(data, {
          y: 'display',
          x: 'length',
          key: 'key',
          text: (d) => format(d.value),
          anchor: hasNegative ? 'middle' : 'start',
          dx: hasNegative ? 0 : 4,
          fontSize: 11,
          fill: (d) => (d.selected ? colors.text : colors.muted),
        }),
      ],
      scales: {
        y: {
          scale: scaleBand<string>().domain(domain).padding(0.22),
          axis: { ticks: { size: 0 } },
        },
        x: {
          scale: scaleLinear,
          nice: !invert,
          grid: !invert,
          axis: invert
            ? false
            : {
                label,
                ticks: { count: 4, format: tickFormat },
              },
        },
      },
      margin: { right: 68 },
      tooltip: {
        use: tooltip,
        content: (points) => {
          const d = points[0]?.datum;
          return d != null
            ? {
                title: d.name,
                rows: [
                  { label, value: format(d.value) },
                  { label: 'Rank', value: `${d.rank} of ${total}` },
                ],
              }
            : { rows: [] };
        },
      },
    });
  }, [
    head,
    tail,
    gap,
    dataset,
    invert,
    selected,
    colors,
    format,
    tickFormat,
    label,
    total,
  ]);

  const rows = head.length + tail.length + (gap ? 1 : 0);
  return (
    <Chart
      definition={definition}
      height={Math.max(120, rows * rowHeight + (invert ? 16 : 56))}
      ariaLabel={`${label}: ranking of ${total} ${placeNoun(dataset.type.id, total)}`}
      onSelect={(p) => {
        if (p != null) onSelect(p.datum.index);
      }}
    />
  );
}
