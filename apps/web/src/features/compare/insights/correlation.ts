import { type Correlation, pearson, spearman } from '@world-data/stats';

export type CorrelationMethod = 'pearson' | 'spearman';

/** Copy the values at `rows` (entity indexes) out of a full column into a dense array. */
export function pickRows(
  values: ArrayLike<number>,
  rows: readonly number[]
): Float64Array {
  const out = new Float64Array(rows.length);
  for (let k = 0; k < rows.length; k++) out[k] = values[rows[k]];
  return out;
}

/** Both correlation coefficients for one unordered pair of basket metrics. */
export interface PairStats {
  /** Positions of the two metrics in the basket (i < j) */
  i: number;
  j: number;
  /** Metric ids */
  a: number;
  b: number;
  pearson: Correlation;
  spearman: Correlation;
}

/**
 * Pearson and Spearman correlations for every pair of columns (pairwise-complete), in basket
 * order: (0,1), (0,2), … (1,2), …. Columns must be aligned to the same places.
 */
export function correlationPairs(
  columns: readonly ArrayLike<number>[],
  ids: readonly number[]
): PairStats[] {
  const out: PairStats[] = [];
  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      out.push({
        i,
        j,
        a: ids[i],
        b: ids[j],
        pearson: pearson(columns[i], columns[j]),
        spearman: spearman(columns[i], columns[j]),
      });
    }
  }
  return out;
}

export function pick(pair: PairStats, method: CorrelationMethod): Correlation {
  return method === 'pearson' ? pair.pearson : pair.spearman;
}

/** "0.72", "−0.45" (true minus sign), "n/a" when undefined. */
export function formatR(r: number, digits = 2): string {
  if (!Number.isFinite(r)) return 'n/a';
  const s = Math.abs(r).toFixed(digits);
  return r < 0 && Number(s) !== 0 ? `−${s}` : s;
}

/** Readable p-value: "p < 0.001", "p = 0.012", "p = 0.34". */
export function formatP(p: number): string {
  if (!Number.isFinite(p)) return 'p n/a';
  if (p < 0.001) return 'p < 0.001';
  if (p < 0.1) return `p = ${p.toFixed(3)}`;
  return `p = ${p.toFixed(2)}`;
}
