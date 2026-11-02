import {
  competitionRank,
  composite,
  type Normalization,
} from '@world-data/stats';

/**
 * `search.f` value that focuses the map on the combined score. Real metric ids
 * are positive (source metrics) or negative (synthetic base metrics), so 0 is
 * free to act as the sentinel.
 */
export const COMBINED_FOCUS = 0;

/** Normalisation methods in the order the map offers them. */
export const NORMALIZATIONS: readonly Normalization[] = [
  'percentile',
  'minmax',
  'zscore',
];

export const NORMALIZATION_LABELS: Record<Normalization, string> = {
  percentile: 'Percentile (0–100)',
  minmax: 'Min–max (0–100)',
  zscore: 'Standard score (z)',
};

/** Copy of a column with NaN outside the filtered places. */
export function maskColumn(
  col: Float64Array,
  entityIdx: readonly number[]
): Float64Array {
  const out = new Float64Array(col.length).fill(NaN);
  for (const i of entityIdx) out[i] = col[i];
  return out;
}

export interface CombinedInput {
  values: Float64Array;
  direction: 1 | -1;
  weight: number;
}

/**
 * Combined score for the filtered places: each metric is normalised so higher
 * is better, then averaged with its weight. Places covering less than `cov`
 * of the total weight get NaN (left uncoloured on the map).
 */
export function combinedScore(
  inputs: readonly CombinedInput[],
  length: number,
  norm: Normalization,
  cov: number
): { score: Float64Array; coverage: Uint16Array } {
  const res = composite([...inputs], length, norm, cov);
  return { score: res.score, coverage: res.coverage };
}

export interface RankedRow {
  idx: number;
  value: number;
  rank: number;
}

/**
 * Best and worst `k` places for a column. `direction` 1 ranks high values
 * first; ties share a rank ("1, 2, 2, 4").
 */
export function topAndBottom(
  values: Float64Array,
  direction: 1 | -1,
  k = 10
): { top: RankedRow[]; bottom: RankedRow[]; count: number } {
  const ranks = competitionRank(values, direction);
  const rows: RankedRow[] = [];
  for (let i = 0; i < values.length; i++)
    if (Number.isFinite(values[i]))
      rows.push({ idx: i, value: values[i], rank: ranks[i] });
  rows.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.idx - b.idx));
  const top = rows.slice(0, k);
  // Bottom list starts with the very worst; skip anything already in `top`.
  const bottom = rows.slice(Math.max(k, rows.length - k)).reverse();
  return { top, bottom, count: rows.length };
}
