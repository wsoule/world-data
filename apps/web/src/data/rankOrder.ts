// How a rank column reads. The catalog publishes list positions (1st, 2nd, …) with
// `fmt: 'ranking'`, and the metric's polarity says which end of the list rank 1 is: most rank
// columns put the best place first (pol -1, lower is better), while lists such as "Worst States
// to Live In" or "Most Hated States" put the worst place first (pol 1, higher is better). Every
// view that words, orders or colours a rank column asks this module rather than assuming
// "1 = best" from the format alone.

import type { Metric, Polarity } from './types';

/**
 * 'best-first': rank 1 is the best place, so a higher number is a worse position.
 * 'worst-first': rank 1 is the worst place, so a higher number is a better position.
 */
export type RankOrder = 'best-first' | 'worst-first';

/**
 * How a metric's numbers read as list positions, or null when the metric is not a rank column.
 * Pass `pol` to read it with a direction the user picked (the compare workbench's overrides);
 * it defaults to the catalog polarity. A rank without a better side (pol 0, which the data
 * build does not produce) reads like the usual list, rank 1 first and best.
 */
export function rankOrder(
  metric: Pick<Metric, 'fmt' | 'pol'>,
  pol: Polarity = metric.pol
): RankOrder | null {
  if (metric.fmt !== 'ranking') return null;
  return pol === 1 ? 'worst-first' : 'best-first';
}

/** True for list positions (1st, 2nd, …) in either order. */
export function isRankColumn(metric: Pick<Metric, 'fmt'>): boolean {
  return metric.fmt === 'ranking';
}

/**
 * True when a metric's raw number runs against its standing: a best-first rank, where the
 * smaller number is the better place. Correlations and axes that read "higher" as "better
 * standing" flip these and nothing else (a worst-first rank's larger number is already the
 * better place).
 */
export function readsBackwards(
  metric: Pick<Metric, 'fmt' | 'pol'>,
  pol: Polarity = metric.pol
): boolean {
  return rankOrder(metric, pol) === 'best-first';
}

/** "rank 1 is the best" / "rank 1 is the worst", for subtitles, tooltips and legends. */
export function rankOrderNote(order: RankOrder): string {
  return order === 'best-first' ? 'rank 1 is the best' : 'rank 1 is the worst';
}
