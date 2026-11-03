import { correlationPValue } from '@world-data/stats';

import { isRankColumn } from '~/data/rankOrder';
import type { Metric } from '~/data/types';

/** One column to compare against the target: values aligned to the dataset's entities, NaN = missing. */
export interface DiscoverCandidate {
  id: number;
  values: ArrayLike<number>;
}

export interface RelatedMetric {
  id: number;
  /** Pearson correlation with the target over the overlapping places */
  r: number;
  /** Places with a value for both metrics */
  n: number;
  /** Two-sided p-value for r = 0 */
  p: number;
}

export interface DiscoverOptions {
  /** Entity indexes to include (e.g. the group filter); all entities when omitted */
  rows?: ArrayLike<number> | null;
  /** How many positive and how many negative matches to keep (default 10) */
  limit?: number;
  /** Absolute minimum overlap (default 10) */
  minOverlap?: number;
  /** Overlap must cover this share of the smaller of the two coverages (default 0.6) */
  minShare?: number;
  /** Candidate ids to skip outright (the target itself, for instance) */
  exclude?: ReadonlySet<number>;
  /**
   * Return true to drop an eligible candidate after its correlation is known; used to hide
   * near-identical copies of the target (same measure republished on another topic page).
   */
  hide?: (id: number, r: number) => boolean;
}

export interface DiscoverResult {
  positive: RelatedMetric[];
  negative: RelatedMetric[];
  /** Candidates looked at (after `exclude`) */
  scanned: number;
  /** Candidates with enough overlap and variance to correlate */
  eligible: number;
  /** Eligible candidates removed by `hide` */
  hidden: number;
  /** Places with a target value inside `rows` */
  targetCoverage: number;
}

const isFiniteNumber = (v: number) =>
  v === v && v !== Infinity && v !== -Infinity;

/**
 * Correlate one target column with many candidate columns and keep the strongest positive and
 * negative matches. Built for scanning every numeric metric of a dataset (thousands of columns)
 * on each interaction, so it works on typed arrays with two tight passes per candidate and no
 * per-candidate allocation: pass one finds the overlapping places and their means, pass two sums
 * centred products (numerically stable even for large magnitudes such as population).
 *
 * A candidate is eligible when it overlaps the target on at least
 * max(minOverlap, minShare × min(target coverage, candidate coverage)) places, so a correlation
 * always rests on most of the data either metric has rather than a small convenient subset.
 */
export function discoverRelated(
  target: ArrayLike<number>,
  candidates: Iterable<DiscoverCandidate>,
  options: DiscoverOptions = {}
): DiscoverResult {
  const limit = options.limit ?? 10;
  const minOverlap = options.minOverlap ?? 10;
  const minShare = options.minShare ?? 0.6;
  const rows = options.rows ?? null;
  const rowCount = rows == null ? target.length : rows.length;

  // Target mask and coverage over the included rows, computed once.
  const hasTarget = new Uint8Array(target.length);
  let targetCoverage = 0;
  for (let k = 0; k < rowCount; k++) {
    const e = rows == null ? k : rows[k];
    if (isFiniteNumber(target[e])) {
      hasTarget[e] = 1;
      targetCoverage++;
    }
  }

  const overlap = new Int32Array(targetCoverage);
  const found: RelatedMetric[] = [];
  let scanned = 0;
  let eligible = 0;
  let hidden = 0;

  for (const cand of candidates) {
    if (options.exclude?.has(cand.id) === true) continue;
    scanned++;
    if (targetCoverage < minOverlap) continue;
    const y = cand.values;

    let coverage = 0;
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < rowCount; k++) {
      const e = rows == null ? k : rows[k];
      const v = y[e];
      if (!isFiniteNumber(v)) continue;
      coverage++;
      if (hasTarget[e] === 1) {
        overlap[n++] = e;
        sx += target[e];
        sy += v;
      }
    }
    const needed = Math.max(
      minOverlap,
      Math.ceil(minShare * Math.min(targetCoverage, coverage))
    );
    if (n < needed || n < 3) continue;

    const mx = sx / n;
    const my = sy / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let k = 0; k < n; k++) {
      const e = overlap[k];
      const dx = target[e] - mx;
      const dy = y[e] - my;
      sxy += dx * dy;
      sxx += dx * dx;
      syy += dy * dy;
    }
    if (sxx === 0 || syy === 0) continue;
    const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
    if (!isFiniteNumber(r)) continue;
    eligible++;
    if (options.hide?.(cand.id, r) === true) {
      hidden++;
      continue;
    }
    found.push({ id: cand.id, r, n, p: correlationPValue(r, n) });
  }

  const positive = found
    .filter((m) => m.r > 0)
    .sort((a, b) => (b.r !== a.r ? b.r - a.r : b.n - a.n))
    .slice(0, limit);
  const negative = found
    .filter((m) => m.r < 0)
    .sort((a, b) => (a.r !== b.r ? a.r - b.r : b.n - a.n))
    .slice(0, limit);
  return { positive, negative, scanned, eligible, hidden, targetCoverage };
}

/**
 * Headings for the two lists. Pearson r works on raw numbers, so "rises with Best Education
 * Rank" would mean "rises as the rank number grows", i.e. as education gets worse. For a
 * rank-style target the headings say which end is better instead.
 */
export function listTitles(
  target: Metric,
  dir: 1 | -1
): { positive: string; negative: string } {
  if (!isRankColumn(target))
    return {
      positive: `Rises with ${target.label}`,
      negative: `Falls as ${target.label} rises`,
    };
  const up = dir === -1 ? 'worse' : 'better';
  const down = dir === -1 ? 'better' : 'worse';
  return {
    positive: `Higher where ${target.label} is ${up}`,
    negative: `Higher where ${target.label} is ${down}`,
  };
}
