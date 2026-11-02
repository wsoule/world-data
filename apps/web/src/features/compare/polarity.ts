import type { CompareSearch } from './state';
import type { Metric, Polarity } from '~/data/types';

/**
 * Metric polarity after the user's direction override: 1 / -1 when there is a
 * better side, 0 when the metric is neutral and nobody has picked a side.
 * (`effectiveDirection` collapses neutral to 1, which is right for maths but
 * wrong for wording and colour schemes.)
 */
export function polarityFor(
  search: CompareSearch,
  m: Metric | undefined
): Polarity {
  if (m == null) return 0;
  return search.d?.[String(m.id)] ?? m.pol;
}

/** Rank-style metric (1st, 2nd, …) where #1 is the top. */
export function isRankMetric(m: Metric): boolean {
  return m.fmt === 'ranking';
}

/** "US States" → "US states", "World Cities" → "world cities". */
export function typeNoun(label: string): string {
  return label
    .split(' ')
    .map((w) => (w === 'US' ? w : w.toLowerCase()))
    .join(' ');
}
