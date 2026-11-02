import { linearRegression, percentile } from '@world-data/stats';

import { type CorrelationMethod, type PairStats, pick } from './correlation';

/** A basket metric as the findings engine sees it: values aligned to the compared places. */
export interface FindingMetric {
  id: number;
  /** 1 = higher is better, -1 = lower is better */
  direction: 1 | -1;
  values: ArrayLike<number>;
}

export interface FindingsInput {
  metrics: readonly FindingMetric[];
  /** From correlationPairs over the same columns */
  pairs: readonly PairStats[];
  method: CorrelationMethod;
}

/** How often one place lands in the top (or bottom) tenth across the basket. */
export interface PlaceTally {
  /** Position in the compared places (index into the aligned columns) */
  place: number;
  count: number;
  /** Metrics the place has data for */
  covered: number;
  /** Metric ids where the place is in the top/bottom tenth */
  metricIds: number[];
  /** Mean direction-aware percentile (0–1) over covered metrics */
  meanPercentile: number;
}

export type Finding =
  | {
      kind: 'together';
      /** 1: both rise together; -1: one rises as the other falls */
      sign: 1 | -1;
      pair: PairStats;
      r: number;
      n: number;
      p: number;
      score: number;
    }
  | {
      kind: 'unrelated';
      pair: PairStats;
      r: number;
      n: number;
      score: number;
    }
  | {
      kind: 'leaders';
      places: PlaceTally[];
      metricCount: number;
      score: number;
    }
  | {
      kind: 'laggards';
      places: PlaceTally[];
      metricCount: number;
      score: number;
    }
  | {
      kind: 'outlier';
      pair: PairStats;
      place: number;
      /** Standardized residual of the place against the least-squares line of b on a */
      z: number;
      r: number;
      n: number;
      score: number;
    }
  | { kind: 'no-signal'; pairs: number; score: number };

export const STRONG_R = 0.3;
export const UNRELATED_R = 0.15;
export const UNRELATED_MIN_N = 20;
export const OUTLIER_PAIR_R = 0.5;
export const OUTLIER_Z = 2;
export const TOP_SHARE = 0.1;

/**
 * Turn the basket's correlations and per-place percentiles into a ranked list of plain-English
 * observations: the strongest significant relationships, notable non-relationships, places that
 * lead or lag on most metrics, and the biggest exception to each strong relationship. Each
 * finding carries a `score` (0–1, higher = more worth reading first) and the list is sorted by it.
 */
export function buildFindings(input: FindingsInput): Finding[] {
  const out: Finding[] = [];
  const { metrics, pairs, method } = input;

  // Strongest relationships in each direction (significant only).
  const significant = pairs
    .map((pair) => ({ pair, c: pick(pair, method) }))
    .filter(
      ({ c }) => Number.isFinite(c.r) && Math.abs(c.r) >= STRONG_R && c.p < 0.05
    );
  for (const sign of [1, -1] as const) {
    significant
      .filter(({ c }) => Math.sign(c.r) === sign)
      .sort((x, y) => Math.abs(y.c.r) - Math.abs(x.c.r))
      .slice(0, 2)
      .forEach(({ pair, c }) =>
        out.push({
          kind: 'together',
          sign,
          pair,
          r: c.r,
          n: c.n,
          p: c.p,
          score: 0.4 + 0.6 * Math.abs(c.r),
        })
      );
  }
  if (pairs.length > 0 && significant.length === 0) {
    out.push({ kind: 'no-signal', pairs: pairs.length, score: 0.6 });
  }

  // Pairs that look unrelated despite plenty of data.
  pairs
    .map((pair) => ({ pair, c: pick(pair, method) }))
    .filter(
      ({ c }) =>
        Number.isFinite(c.r) &&
        Math.abs(c.r) < UNRELATED_R &&
        c.n >= UNRELATED_MIN_N
    )
    .sort((x, y) => Math.abs(x.c.r) - Math.abs(y.c.r))
    .slice(0, 2)
    .forEach(({ pair, c }) =>
      out.push({
        kind: 'unrelated',
        pair,
        r: c.r,
        n: c.n,
        score: 0.3 + (UNRELATED_R - Math.abs(c.r)),
      })
    );

  // Leaders and laggards across the basket.
  if (metrics.length >= 2) {
    const { top, bottom } = tallyExtremes(metrics);
    const minCount = Math.max(2, Math.ceil(metrics.length / 3));
    const leaders = top.filter((t) => t.count >= minCount).slice(0, 4);
    const laggards = bottom.filter((t) => t.count >= minCount).slice(0, 4);
    if (leaders.length > 0)
      out.push({
        kind: 'leaders',
        places: leaders,
        metricCount: metrics.length,
        score: 0.5 + 0.4 * (leaders[0].count / metrics.length),
      });
    if (laggards.length > 0)
      out.push({
        kind: 'laggards',
        places: laggards,
        metricCount: metrics.length,
        score: 0.45 + 0.4 * (laggards[0].count / metrics.length),
      });
  }

  // The largest exception to each strong (linear) relationship.
  const outliers: Extract<Finding, { kind: 'outlier' }>[] = [];
  for (const pair of pairs) {
    const c = pair.pearson;
    if (
      !Number.isFinite(c.r) ||
      Math.abs(c.r) < OUTLIER_PAIR_R ||
      c.p >= 0.05 ||
      c.n < 10
    )
      continue;
    const exception = largestResidual(
      metrics[pair.i].values,
      metrics[pair.j].values
    );
    if (exception == null || Math.abs(exception.z) < OUTLIER_Z) continue;
    outliers.push({
      kind: 'outlier',
      pair,
      place: exception.place,
      z: exception.z,
      r: c.r,
      n: c.n,
      score: 0.35 + 0.12 * Math.min(4, Math.abs(exception.z)),
    });
  }
  outliers.sort((x, y) => Math.abs(y.z) - Math.abs(x.z));
  // At most three exceptions, each a different place, so one extreme place (often a capital
  // district) cannot crowd out every other observation.
  const reported = new Set<number>();
  for (const o of outliers) {
    if (reported.size >= 3) break;
    if (reported.has(o.place)) continue;
    reported.add(o.place);
    out.push(o);
  }

  return out.sort((x, y) => y.score - x.score);
}

/**
 * For every place, count the metrics on which it is in the best (top) or worst (bottom) tenth,
 * using direction-aware percentiles so "lower is better" metrics count correctly. Both lists are
 * sorted by count, then by mean percentile (best first for top, worst first for bottom).
 */
export function tallyExtremes(metrics: readonly FindingMetric[]): {
  top: PlaceTally[];
  bottom: PlaceTally[];
} {
  const places = metrics[0]?.values.length ?? 0;
  const pcts = metrics.map((m) => percentile(m.values, m.direction));
  const top: PlaceTally[] = [];
  const bottom: PlaceTally[] = [];
  for (let p = 0; p < places; p++) {
    const topIds: number[] = [];
    const bottomIds: number[] = [];
    let covered = 0;
    let sum = 0;
    for (let k = 0; k < metrics.length; k++) {
      const v = pcts[k][p];
      if (Number.isNaN(v)) continue;
      covered++;
      sum += v;
      if (v >= 1 - TOP_SHARE) topIds.push(metrics[k].id);
      if (v <= TOP_SHARE) bottomIds.push(metrics[k].id);
    }
    if (covered === 0) continue;
    const meanPercentile = sum / covered;
    if (topIds.length > 0)
      top.push({
        place: p,
        count: topIds.length,
        covered,
        metricIds: topIds,
        meanPercentile,
      });
    if (bottomIds.length > 0)
      bottom.push({
        place: p,
        count: bottomIds.length,
        covered,
        metricIds: bottomIds,
        meanPercentile,
      });
  }
  top.sort((a, b) =>
    b.count !== a.count
      ? b.count - a.count
      : b.meanPercentile - a.meanPercentile
  );
  bottom.sort((a, b) =>
    b.count !== a.count
      ? b.count - a.count
      : a.meanPercentile - b.meanPercentile
  );
  return { top, bottom };
}

/** Place furthest from the least-squares line of y on x, as a standardized residual. */
export function largestResidual(
  x: ArrayLike<number>,
  y: ArrayLike<number>
): { place: number; z: number } | null {
  const fit = linearRegression(x, y);
  let best = -1;
  let bestAbs = 0;
  for (let i = 0; i < fit.standardized.length; i++) {
    const z = fit.standardized[i];
    if (Number.isNaN(z)) continue;
    if (Math.abs(z) > bestAbs) {
      bestAbs = Math.abs(z);
      best = i;
    }
  }
  return best < 0 ? null : { place: best, z: fit.standardized[best] };
}
