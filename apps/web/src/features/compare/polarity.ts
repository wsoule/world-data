import type { CompareSearch } from './state';
import { rankOrder } from '~/data/rankOrder';
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

/**
 * Wording for a metric's direction button: its current side and what one click does (see
 * `cycleDirection`). Neutral metrics are never described as better or worse. A rank column
 * also says which end rank 1 is ("Rank 1 is the worst: higher is better"), so a worst-first
 * list's "higher is better" does not read as a mistake.
 */
export function directionHint(
  search: CompareSearch,
  m: Metric
): { side: Polarity; label: string; action: string } {
  const side = polarityFor(search, m);
  if (side === 0)
    return {
      side,
      label: 'No better or worse side',
      action: 'click to treat higher as better',
    };
  const order = rankOrder(m, side);
  const plain = side === 1 ? 'higher is better' : 'lower is better';
  const label =
    order != null
      ? `Rank 1 is the ${order === 'best-first' ? 'best' : 'worst'}: ${plain}`
      : side === 1
        ? 'Higher is better'
        : 'Lower is better';
  if (m.pol === 0 && side === -1)
    return { side, label, action: 'click to set no side' };
  return { side, label, action: 'click to flip' };
}

/** "US States" → "US states", "World Cities" → "world cities". */
export function typeNoun(label: string): string {
  return label
    .split(' ')
    .map((w) => (w === 'US' ? w : w.toLowerCase()))
    .join(' ');
}
