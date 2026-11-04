// The Correlations view reads every column by standing, so "higher" means "better placed" for a
// rank. A best-first rank (rank 1 = best, `pol` -1) stores its best place as the smallest
// number, so a raw correlation with income or life expectancy comes out negative although
// better-ranked places are richer and healthier. Negating such a column before correlating turns
// "a better rank" into "a higher value" and gives r and ρ the sign a reader expects. Worst-first
// ranks ("Worst States to Live In", rank 1 = worst) already grow as places get better, and
// ordinary metrics are measured values, so both are left as they are.

import { isRankColumn, readsBackwards } from '~/data/rankOrder';
import type { Metric } from '~/data/types';

/** Basket columns as the correlation matrix and findings read them. */
export interface StandingColumns {
  /** One column per basket metric: its raw values, negated where `flipped` is true */
  columns: Float64Array[];
  /** True for the best-first ranks that were negated */
  flipped: boolean[];
  /**
   * Better direction of each standing column (1 = higher is better). A negated best-first rank
   * now has its better places at the high end, so its direction becomes 1.
   */
  directions: (1 | -1)[];
}

/**
 * Read basket columns by standing: negate the best-first ranks so a better rank counts as a
 * higher value. `directions` are the effective directions of the compare basket (catalog
 * polarity or the reader's override), so a rank the reader flipped to "higher is better" is read
 * that way, exactly as the overlay's axes and the rank lines read it.
 */
export function standingColumns(
  metrics: readonly Pick<Metric, 'fmt' | 'pol'>[],
  columns: readonly Float64Array[],
  directions: readonly (1 | -1)[]
): StandingColumns {
  const flipped = metrics.map((m, k) => readsBackwards(m, directions[k]));
  return {
    columns: columns.map((col, k) => (flipped[k] ? col.map((v) => -v) : col)),
    flipped,
    directions: directions.map((d, k) => (flipped[k] ? 1 : d)),
  };
}

/** True when any basket metric is a rank column, so the view should say how ranks are read. */
export function hasRankColumn(
  metrics: readonly Pick<Metric, 'fmt'>[]
): boolean {
  return metrics.some((m) => isRankColumn(m));
}

/** Short note for subtitles and tooltips about how rank columns are correlated. */
export const STANDING_NOTE =
  'ranks read by standing (a better rank counts as higher)';
