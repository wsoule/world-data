// "What correlates with this?": Pearson correlation of one focus column against every candidate
// metric of the dataset, keeping the strongest positive and negative relationships. Pure so it can
// be unit-tested and benchmarked (apps/web/test/topic-correlations.test.ts).

import { pearson } from '@world-data/stats';

import type { Metric } from '~/data/types';

/** A metric that may correlate with the focus column. `n` is its coverage (an upper bound). */
export interface CorrelationCandidate {
  id: number;
  n: number;
}

export interface CorrelationHit {
  id: number;
  r: number;
  /** Places with both values */
  n: number;
  /** Two-sided p-value for r = 0 */
  p: number;
}

export interface CorrelationResult {
  /** Hits that move with the focus (r > 0, or r < 0 for a flipped candidate), strongest first */
  positive: CorrelationHit[];
  /** Hits that move against the focus, strongest first */
  negative: CorrelationHit[];
  /** Places with a focus value */
  coverage: number;
  /** Overlap a candidate needs to be tested */
  minOverlap: number;
  /** Candidates that met the overlap threshold and were correlated */
  tested: number;
  /** Candidates dropped as near-identical copies of the focus series (|r| ≥ DUPLICATE_R) */
  duplicates: number;
  /** Wall-clock milliseconds spent */
  ms: number;
}

/**
 * True when a metric's number is a rank position (1 = top), so a higher number reads as a worse
 * place: rank-format metrics, plus lower-is-better columns labelled as a rank that the catalog
 * stores as plain numbers ("GII Institutions Rank", the Well-Being Index "Rank"). A change in
 * rank or a percentile rank is not a position.
 */
export function readsAsRank(
  metric: Pick<Metric, 'fmt' | 'pol' | 'label'>
): boolean {
  if (metric.fmt === 'ranking') return true;
  return (
    metric.pol === -1 &&
    /\brank(ing)?\b/i.test(metric.label) &&
    !/\b(change|percentile)\b/i.test(metric.label)
  );
}

/** Above this |r| two series are treated as the same measure republished, not a finding. */
export const DUPLICATE_R = 0.995;

/** Below this |r| there is no relationship worth listing. */
export const MIN_R = 0.1;

/** Overlap needed before a correlation is shown: at least 10 places and 60% of the focus coverage. */
export function minOverlapFor(coverage: number): number {
  return Math.max(10, Math.ceil(coverage * 0.6));
}

/**
 * Correlate `focus` (aligned to entities, NaN = missing) with each candidate's column.
 *
 * The focus column is compacted to the places that have a value once, so each candidate costs a
 * single pass over those places; candidates whose coverage cannot reach the overlap threshold are
 * skipped without reading their column. Returns the top `limit` positive and negative hits with
 * |r| of at least MIN_R. With `keyOf`, only the strongest hit per key is kept: the catalog
 * repeats some series under several ids (the same column published on two pages).
 *
 * `flip` names candidates whose raw number runs against the reading direction, such as a rank
 * (1 = best) correlated with a measured value: their hits are grouped by -r, so "positive"
 * reads as "better rank with a higher focus". Each hit keeps its raw r.
 */
export function findCorrelations(
  focus: ArrayLike<number>,
  candidates: readonly CorrelationCandidate[],
  column: (id: number) => ArrayLike<number>,
  limit = 6,
  keyOf?: (id: number) => string,
  flip?: (id: number) => boolean
): CorrelationResult {
  const start = performance.now();
  const at: number[] = [];
  for (let i = 0; i < focus.length; i++)
    if (Number.isFinite(focus[i])) at.push(i);
  const coverage = at.length;
  const minOverlap = minOverlapFor(coverage);
  const empty: CorrelationResult = {
    positive: [],
    negative: [],
    coverage,
    minOverlap,
    tested: 0,
    duplicates: 0,
    ms: 0,
  };
  if (coverage < minOverlap) return { ...empty, ms: performance.now() - start };

  const fx = new Float64Array(coverage);
  for (let k = 0; k < coverage; k++) fx[k] = focus[at[k]];
  const y = new Float64Array(coverage);
  const hits: CorrelationHit[] = [];
  let tested = 0;
  let duplicates = 0;
  for (const c of candidates) {
    if (c.n < minOverlap) continue;
    const col = column(c.id);
    let overlap = 0;
    for (let k = 0; k < coverage; k++) {
      const v = col[at[k]];
      y[k] = v;
      if (Number.isFinite(v)) overlap++;
    }
    if (overlap < minOverlap) continue;
    tested++;
    const res = pearson(fx, y);
    if (!Number.isFinite(res.r) || Math.abs(res.r) < MIN_R) continue;
    if (Math.abs(res.r) >= DUPLICATE_R) {
      duplicates++;
      continue;
    }
    hits.push({ id: c.id, r: res.r, n: res.n, p: res.p });
  }

  // Keep the strongest `limit` hits, skipping repeats of a key already listed.
  const top = (sorted: CorrelationHit[]) => {
    const seen = new Set<string>();
    const out: CorrelationHit[] = [];
    for (const h of sorted) {
      if (out.length >= limit) break;
      if (keyOf != null) {
        const key = keyOf(h.id);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(h);
    }
    return out;
  };
  // Direction used for grouping: the raw r, negated for flipped candidates.
  const signed = (h: CorrelationHit) => (flip?.(h.id) === true ? -h.r : h.r);
  const positive = top(
    hits.filter((h) => signed(h) > 0).sort((a, b) => signed(b) - signed(a))
  );
  const negative = top(
    hits.filter((h) => signed(h) < 0).sort((a, b) => signed(a) - signed(b))
  );
  return {
    positive,
    negative,
    coverage,
    minOverlap,
    tested,
    duplicates,
    ms: performance.now() - start,
  };
}
