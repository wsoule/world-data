import { interpolateLab } from 'd3-interpolate';
import { scaleLinear } from 'd3-scale';

import type { Theme } from '~/lib/theme';

/**
 * Percentile colours (0 = worst, 50 = middling, 100 = best). Tints are chosen so one text colour
 * per theme stays readable on every cell: dark text on light tints, light text on deep tints.
 */
export function percentileStops(theme: Theme) {
  return theme === 'dark'
    ? { bad: '#991b1b', mid: '#1e293b', good: '#047857', text: '#e5e9f5' }
    : { bad: '#f87171', mid: '#f1f5f9', good: '#34d399', text: '#0f172a' };
}

/** d3 colour scale for percentiles, shared by the heat grid (chart colour scale) and HTML chips. */
export function percentileScale(theme: Theme) {
  const s = percentileStops(theme);
  return scaleLinear<string>()
    .domain([0, 50, 100])
    .range([s.bad, s.mid, s.good])
    .interpolate(interpolateLab)
    .clamp(true);
}

/** Categorical colours for metrics in the contribution chart (brighter variants on dark). */
export function metricPalette(theme: Theme): {
  series: string[];
  other: string;
} {
  return theme === 'dark'
    ? {
        series: [
          '#818cf8',
          '#22d3ee',
          '#fbbf24',
          '#f472b6',
          '#4ade80',
          '#c084fc',
          '#2dd4bf',
          '#fb923c',
          '#60a5fa',
          '#a3e635',
        ],
        other: '#64748b',
      }
    : {
        series: [
          '#4f46e5',
          '#0891b2',
          '#d97706',
          '#db2777',
          '#16a34a',
          '#9333ea',
          '#0d9488',
          '#ea580c',
          '#2563eb',
          '#65a30d',
        ],
        other: '#94a3b8',
      };
}
