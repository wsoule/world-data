import { barX, defineChart, stack } from '@tanstack/charts';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { tooltip } from '@tanstack/charts/tooltip';
import { useMemo } from 'react';

import type { CategorySummary } from './categoryStats';
import { ENTITY_TYPES, type EntityType } from '~/data/types';
import { type Theme, useTheme } from '~/lib/theme';

export const TYPE_LABELS: Record<EntityType, string> = {
  country: 'Countries',
  state: 'US states',
  city: 'US cities',
  'world-city': 'World cities',
  county: 'US counties',
};

/** Plural nouns for running text ("192 about countries · 186 about US states"). */
export const TYPE_NOUNS: Record<EntityType, string> = {
  country: 'countries',
  state: 'US states',
  city: 'US cities',
  'world-city': 'world cities',
  county: 'US counties',
};

/** One colour per place type, tuned separately for light and dark backgrounds. */
export function typeColors(theme: Theme): Record<EntityType, string> {
  return theme === 'dark'
    ? {
        country: '#818cf8',
        state: '#22d3ee',
        city: '#fbbf24',
        'world-city': '#4ade80',
        county: '#f472b6',
      }
    : {
        country: '#4f46e5',
        state: '#0891b2',
        city: '#d97706',
        'world-city': '#16a34a',
        county: '#db2777',
      };
}

interface MixRow {
  category: string;
  label: string;
  type: EntityType;
  count: number;
  total: number;
  byType: CategorySummary['byType'];
}

/**
 * Horizontal stacked bars: how many topics each category has, split by place type, largest
 * category first. Clicking a bar opens that category.
 */
export function CategoryMixChart({
  summaries,
  onSelect,
}: {
  summaries: readonly CategorySummary[];
  onSelect: (category: string) => void;
}) {
  const theme = useTheme();
  const definition = useMemo(() => {
    const fills = typeColors(theme);
    const sorted = [...summaries].sort((a, b) => b.total - a.total);
    const rows: MixRow[] = sorted.flatMap((s) =>
      s.byType.map((t) => ({
        category: s.id,
        label: s.label,
        type: t.type,
        count: t.count,
        total: s.total,
        byType: s.byType,
      }))
    );
    return defineChart({
      marks: [
        barX(rows, {
          y: 'label',
          x: 'count',
          z: 'type',
          fill: (d) => fills[d.type],
          layout: stack({ order: ENTITY_TYPES }),
          radius: { end: 3, stack: 'outer' },
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
          axis: { label: 'Topics', ticks: { count: 5 } },
        },
      },
      margin: { right: 12 },
      tooltip: {
        use: tooltip,
        content: (points) => {
          const d = points[0]?.datum;
          if (d == null) return { rows: [] };
          return {
            title: `${d.label} · ${d.total.toLocaleString('en-US')} topics`,
            rows: d.byType.map((t) => ({
              label: TYPE_LABELS[t.type],
              value: t.count.toLocaleString('en-US'),
              color: fills[t.type],
            })),
          };
        },
      },
    });
  }, [summaries, theme]);

  return (
    <Chart
      definition={definition}
      height={Math.max(240, summaries.length * 21 + 56)}
      ariaLabel="Topics per category, split by place type"
      onSelect={(p) => {
        if (p != null) onSelect(p.datum.category);
      }}
    />
  );
}
