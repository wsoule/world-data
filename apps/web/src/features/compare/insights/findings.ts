import {
  competitionRank,
  linearRegression,
  percentile,
  strength,
} from '@world-data/stats';

import type { SentencePart } from '../scatter/analysis';
import {
  type CorrelationMethod,
  formatP,
  formatR,
  type PairStats,
  pick,
} from './correlation';
import { isRankColumn } from '~/data/rankOrder';
import type { Metric } from '~/data/types';

/**
 * A basket metric as the findings engine sees it: values aligned to the compared places. The
 * Correlations view passes the standing columns (`standingColumns`), so a best-first rank arrives
 * negated with direction 1 and "higher" means "better placed" for every rank.
 */
export interface FindingMetric {
  id: number;
  /** 1 = higher is better, -1 = lower is better */
  direction: 1 | -1;
  /**
   * The metric has no better or worse side (population, area…) and the user has not picked one.
   * Neutral metrics still feed correlations and outliers, but never leaders or laggards.
   */
  neutral?: boolean;
  values: ArrayLike<number>;
}

export interface FindingsInput {
  metrics: readonly FindingMetric[];
  /** From correlationPairs over the same columns as `metrics[k].values` */
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
      /** 1: both rise (or rank better) together; -1: one rises as the other falls */
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
      /**
       * Standardized residual of the place against the least-squares line of b on a. Positive is
       * above the line: a higher value, or a better rank for a standing rank column.
       */
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

  // Leaders and laggards across the metrics that have a better side: being large or small on a
  // neutral metric is neither good nor bad.
  const directional = metrics.filter((m) => m.neutral !== true);
  if (directional.length >= 2) {
    const k = directional.length;
    const { top, bottom } = tallyExtremes(directional);
    const minCount = Math.max(2, Math.ceil(k / 3));
    const leaders = top.filter((t) => t.count >= minCount).slice(0, 4);
    const laggards = bottom.filter((t) => t.count >= minCount).slice(0, 4);
    if (leaders.length > 0)
      out.push({
        kind: 'leaders',
        places: leaders,
        metricCount: k,
        score: 0.5 + 0.4 * (leaders[0].count / k),
      });
    if (laggards.length > 0)
      out.push({
        kind: 'laggards',
        places: laggards,
        metricCount: k,
        score: 0.45 + 0.4 * (laggards[0].count / k),
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
 * Places that make the top (or bottom) tenth of one metric: floor(TOP_SHARE × places with data),
 * at least one. With 51 states that is 5, so the 6th best is never counted as "top 10%".
 */
export function tenthSize(count: number): number {
  return Math.max(1, Math.floor(TOP_SHARE * count + 1e-9));
}

/**
 * For every place, count the metrics on which it is in the best (top) or worst (bottom) tenth.
 * The cut is by direction-aware competition rank, so "lower is better" metrics count correctly
 * and the tenth is strict: rank ≤ tenthSize(n) from the best end, or from the worst end for the
 * bottom. Both lists are sorted by count, then by mean percentile (best first for top, worst
 * first for bottom).
 */
export function tallyExtremes(metrics: readonly FindingMetric[]): {
  top: PlaceTally[];
  bottom: PlaceTally[];
} {
  const places = metrics[0]?.values.length ?? 0;
  const pcts = metrics.map((m) => percentile(m.values, m.direction));
  const bestFirst = metrics.map((m) => competitionRank(m.values, m.direction));
  const worstFirst = metrics.map((m) =>
    competitionRank(m.values, m.direction === 1 ? -1 : 1)
  );
  const cut = bestFirst.map((ranks) => {
    let n = 0;
    for (let i = 0; i < ranks.length; i++) if (!Number.isNaN(ranks[i])) n++;
    return tenthSize(n);
  });
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
      if (bestFirst[k][p] <= cut[k]) topIds.push(metrics[k].id);
      else if (worstFirst[k][p] <= cut[k]) bottomIds.push(metrics[k].id);
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

/** "higher" / "lower" for a measured value, "better" / "worse" for a rank read by standing. */
function movementWord(metric: Pick<Metric, 'fmt'>, up: boolean): string {
  if (isRankColumn(metric)) return up ? 'better' : 'worse';
  return up ? 'higher' : 'lower';
}

/** "a better Best Education Rank" / "higher Median Household Income", as sentence parts. */
function movementParts(
  metric: Pick<Metric, 'fmt' | 'label'>,
  up: boolean
): SentencePart[] {
  const word = movementWord(metric, up);
  return [
    { text: isRankColumn(metric) ? `a ${word} ` : `${word} ` },
    { text: metric.label, strong: true },
  ];
}

/**
 * The sentence for a 'together' finding, read in standing space: it leads with the first
 * metric's high end (a better rank, or higher values) and gives the second metric's end from the
 * same sign that labels the finding positive or negative, so the sentence, the label and the
 * icon cannot disagree. "States with a better Best Education Rank tend to have higher Life
 * Expectancy" is a positive finding.
 */
export function togetherSentence(
  finding: Pick<Extract<Finding, { kind: 'together' }>, 'sign'>,
  a: Pick<Metric, 'fmt' | 'label'>,
  b: Pick<Metric, 'fmt' | 'label'>,
  nounMany: string
): SentencePart[] {
  const many = nounMany.charAt(0).toUpperCase() + nounMany.slice(1);
  return [
    { text: `${many} with ` },
    ...movementParts(a, true),
    { text: ' tend to have ' },
    ...movementParts(b, finding.sign > 0),
    { text: '.' },
  ];
}

/**
 * The numbers line under a 'together' finding: "Strong positive correlation · r = 0.63 · n = 50 ·
 * p < 0.001". `rankFlipped` adds that a best-first rank in the pair was read by standing, since
 * the overlay it links to plots the raw rank numbers.
 */
export function togetherDetail(
  finding: Pick<
    Extract<Finding, { kind: 'together' }>,
    'sign' | 'r' | 'n' | 'p'
  >,
  symbol: string,
  rankFlipped: boolean
): string {
  const s = strength(finding.r);
  const parts = [
    `${s.charAt(0).toUpperCase()}${s.slice(1)} ${finding.sign > 0 ? 'positive' : 'negative'} correlation`,
    `${symbol} = ${formatR(finding.r)}`,
    `n = ${finding.n}`,
    formatP(finding.p),
  ];
  if (rankFlipped) parts.push('a better rank counts as higher');
  return parts.join(' · ');
}

/**
 * Where an outlier sits against the trend, in words: "well above" / "well below" the line for a
 * measured value, "far better" / "far worse" than the line predicts for a rank (whose standing
 * column puts a better rank above the line).
 */
export function outlierPosition(
  b: Pick<Metric, 'fmt'>,
  z: number
): { rank: boolean; words: string } {
  if (isRankColumn(b))
    return { rank: true, words: z > 0 ? 'far better' : 'far worse' };
  return { rank: false, words: z > 0 ? 'well above' : 'well below' };
}
