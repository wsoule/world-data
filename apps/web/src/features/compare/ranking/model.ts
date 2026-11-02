import {
  competitionRank,
  composite,
  type CompositeResult,
  type Normalization,
  percentile,
  quantileSorted,
} from '@world-data/stats';

/** One basket metric, with values already restricted to the places being ranked. */
export interface RankingInput {
  id: number;
  /** Compact values (index k = k-th ranked place), NaN = missing */
  values: Float64Array;
  direction: 1 | -1;
  /** 0 excludes the metric from the score */
  weight: number;
}

/** Per-metric figures that do not depend on weights. */
export interface MetricStats {
  id: number;
  /** 0–100 percentile, 100 = best given the direction; NaN when missing */
  pct: Float64Array;
  /** Competition rank, 1 = best; NaN when missing */
  rank: Float64Array;
  /** Places with data */
  n: number;
  /** Compact index of the best place, -1 when no place has data */
  best: number;
}

/** Percentile, rank and leader for each metric (memoise on values + direction). */
export function metricStats(inputs: readonly RankingInput[]): MetricStats[] {
  return inputs.map((inp) => {
    const p = percentile(inp.values, inp.direction);
    const pct = new Float64Array(p.length);
    for (let i = 0; i < p.length; i++) pct[i] = p[i] * 100;
    const rank = competitionRank(inp.values, inp.direction);
    let n = 0;
    let best = -1;
    for (let i = 0; i < rank.length; i++) {
      if (Number.isNaN(rank[i])) continue;
      n++;
      if (best < 0 || rank[i] < rank[best]) best = i;
    }
    return { id: inp.id, pct, rank, n, best };
  });
}

export interface RankingResult {
  composite: CompositeResult;
  /** Compact indexes of scored places, best first (ties keep input order) */
  order: number[];
  /** Places in scope that got no score (coverage below the minimum) */
  excluded: number;
  /** Of those, places with no value for any active metric */
  noData: number;
  /** Metrics with weight > 0 */
  active: number;
}

/** Scored places, best first. Stable for ties so equal scores keep population order. */
function orderOf(rank: Float64Array): number[] {
  const order: number[] = [];
  for (let i = 0; i < rank.length; i++)
    if (!Number.isNaN(rank[i])) order.push(i);
  return order.sort((a, b) => rank[a] - rank[b]);
}

/** Run the composite score and derive the leaderboard order and exclusion counts. */
export function computeRanking(
  inputs: readonly RankingInput[],
  length: number,
  method: Normalization,
  minCoverage: number
): RankingResult {
  const result = composite(
    inputs.map((i) => ({
      values: i.values,
      direction: i.direction,
      weight: i.weight,
    })),
    length,
    method,
    minCoverage
  );
  const order = orderOf(result.rank);
  let noData = 0;
  for (let e = 0; e < length; e++)
    if (Number.isNaN(result.score[e]) && result.coverage[e] === 0) noData++;
  return {
    composite: result,
    order,
    excluded: length - order.length,
    noData,
    active: inputs.filter((i) => i.weight > 0).length,
  };
}

/**
 * Re-aggregate already-normalised parts with new weights. This is exactly the weighted mean that
 * composite() applies after normalising (same coverage rule), so "what if" scenarios that only
 * change weights can skip re-normalising every metric: K scenarios cost O(K·N) each instead of
 * K sorts each. test/ranking-model.test.ts checks it against composite().
 */
export function rescore(
  parts: readonly Float64Array[],
  weights: readonly number[],
  length: number,
  minCoverage: number
): Float64Array {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const score = new Float64Array(length).fill(NaN);
  if (total <= 0) return score;
  for (let e = 0; e < length; e++) {
    let wsum = 0;
    let acc = 0;
    for (let k = 0; k < parts.length; k++) {
      const w = Math.max(0, weights[k]);
      const p = parts[k][e];
      if (w > 0 && Number.isFinite(p)) {
        wsum += w;
        acc += w * p;
      }
    }
    if (wsum > 0 && wsum / total >= minCoverage) score[e] = acc / wsum;
  }
  return score;
}

export interface Scenario {
  /** 'equal' for equal weights, otherwise the dropped metric id */
  kind: 'equal' | 'drop';
  metricId: number | null;
  /** Compact index of the scenario's #1 (first in order), -1 when nobody is scored */
  leader: number;
  /** Places sharing #1 in the scenario */
  leaderTies: number;
  /** Rank of the current leader in this scenario (NaN when it drops out) */
  leaderRank: number;
  /** Mean absolute rank change of the current top places */
  shift: number;
  /** Whether the current leader is no longer (solely or jointly) #1 */
  changed: boolean;
}

export interface Sensitivity {
  scenarios: Scenario[];
  /** Scenario that moves the current top places the most */
  mostInfluential: Scenario | null;
  /** Scenarios in which the current leader keeps #1 */
  stableCount: number;
}

/**
 * "How stable is #1?": drop each active metric once (and, when weights differ, use equal weights)
 * and see whether the leader changes and how far the current top `topN` move.
 */
export function sensitivity(
  base: RankingResult,
  inputs: readonly RankingInput[],
  minCoverage: number,
  topN = 10
): Sensitivity {
  const { parts } = base.composite;
  const length = base.composite.score.length;
  const leader = base.order[0] ?? -1;
  const top = base.order.slice(0, topN);
  const baseRank = base.composite.rank;
  const weights = inputs.map((i) => i.weight);
  const activeIdx = inputs.flatMap((inp, k) => (inp.weight > 0 ? [k] : []));

  // Each scenario needs only its leader and the ranks of ~topN places, so it counts
  // "places scoring higher" (competition rank) instead of sorting everyone: O(topN·N).
  const run = (
    kind: Scenario['kind'],
    metricId: number | null,
    w: number[]
  ): Scenario => {
    const score = rescore(parts, w, length, minCoverage);
    let first = -1;
    let ties = 0;
    for (let i = 0; i < length; i++) {
      const s = score[i];
      if (Number.isNaN(s)) continue;
      if (first < 0 || s > score[first]) {
        first = i;
        ties = 1;
      } else if (s === score[first]) ties++;
    }
    const rankOf = (i: number): number => {
      const s = score[i];
      if (Number.isNaN(s)) return NaN;
      let higher = 0;
      for (let j = 0; j < length; j++) if (score[j] > s) higher++;
      return higher + 1;
    };
    let moved = 0;
    let counted = 0;
    for (const i of top) {
      const r = rankOf(i);
      if (Number.isNaN(r)) continue;
      moved += Math.abs(r - baseRank[i]);
      counted++;
    }
    const leaderRank = leader >= 0 ? rankOf(leader) : NaN;
    return {
      kind,
      metricId,
      leader: first,
      leaderTies: ties,
      leaderRank,
      shift: counted > 0 ? moved / counted : 0,
      changed: leaderRank !== 1,
    };
  };

  const scenarios: Scenario[] = [];
  if (leader >= 0 && activeIdx.length >= 2) {
    const activeWeights = activeIdx.map((k) => weights[k]);
    if (activeWeights.some((w) => w !== activeWeights[0])) {
      scenarios.push(
        run(
          'equal',
          null,
          weights.map((w) => (w > 0 ? 1 : 0))
        )
      );
    }
    for (const k of activeIdx) {
      const w = weights.slice();
      w[k] = 0;
      scenarios.push(run('drop', inputs[k].id, w));
    }
  }
  let mostInfluential: Scenario | null = null;
  for (const s of scenarios) {
    if (s.kind !== 'drop') continue;
    if (mostInfluential == null || s.shift > mostInfluential.shift)
      mostInfluential = s;
  }
  return {
    scenarios,
    mostInfluential,
    stableCount: scenarios.filter((s) => !s.changed).length,
  };
}

export interface MetricStanding {
  id: number;
  pct: number;
  rank: number;
  n: number;
}

export interface LeaderInsight {
  leader: number;
  /** First place ranked below the leader's rank, null when only one place is scored */
  runnerUp: number | null;
  /** Score gap to the runner-up (0 when tied) */
  margin: number;
  /** Places sharing #1 */
  ties: number;
  /** Leader's best and worst active metrics by percentile */
  strongest: MetricStanding[];
  weakest: MetricStanding[];
}

/** "Why #1?": the leader's margin and its best / worst metrics. */
export function leaderInsight(
  base: RankingResult,
  stats: readonly MetricStats[],
  inputs: readonly RankingInput[],
  count = 2
): LeaderInsight | null {
  const leader = base.order[0];
  if (leader == null) return null;
  const { score, rank } = base.composite;
  let ties = 0;
  for (const i of base.order) {
    if (rank[i] !== rank[leader]) break;
    ties++;
  }
  const runnerUp = base.order[1] ?? null;
  const standings: MetricStanding[] = [];
  stats.forEach((s, k) => {
    if (inputs[k].weight <= 0 || Number.isNaN(s.pct[leader])) return;
    standings.push({
      id: s.id,
      pct: s.pct[leader],
      rank: s.rank[leader],
      n: s.n,
    });
  });
  // Split the sorted standings so strongest and weakest never overlap (1 + 1 for tiny baskets).
  const sorted = standings.slice().sort((a, b) => b.pct - a.pct);
  const c = Math.min(count, Math.floor(sorted.length / 2));
  const strongest = sorted.slice(0, Math.max(1, c));
  const weakest = c > 0 ? sorted.slice(sorted.length - c).reverse() : [];
  return {
    leader,
    runnerUp,
    margin: runnerUp != null ? score[leader] - score[runnerUp] : 0,
    ties,
    strongest,
    weakest,
  };
}

/**
 * Why a surprise happens. `standouts`: a few very strong metrics pull its average above its
 * typical metric (mean well above median). `weak-spots`: a few very weak metrics pull it below.
 * `consistent`: no metric carries it; it ranks above its typical metric because places ahead of
 * it metric by metric have weak spots. `uneven-rivals`: the mirror, places behind it metric by
 * metric have standout metrics that lift them past it.
 */
export type SurpriseReason =
  | 'standouts'
  | 'weak-spots'
  | 'consistent'
  | 'uneven-rivals';

export interface Surprise {
  idx: number;
  combinedRank: number;
  /** Median of the place's single-metric ranks (active metrics with data) */
  medianRank: number;
  /** medianRank − combinedRank: positive = does better combined than metric by metric */
  delta: number;
  /**
   * Weighted mean minus median of the place's normalised metric scores (the parts the combined
   * score averages): clearly positive when standouts lift it, clearly negative when weak spots
   * drag it, near zero for a balanced profile.
   */
  skew: number;
  reason: SurpriseReason;
}

/**
 * How far mean and median of a place's normalised scores must differ before a few metrics are
 * said to carry (or drag) it: 5 points on the 0–100 scales, 0.2 standard deviations for z-scores.
 */
export function skewThreshold(method: Normalization): number {
  return method === 'zscore' ? 0.2 : 5;
}

/** Weighted mean minus median of one place's normalised scores on the active metrics. */
function partsSkew(
  parts: readonly Float64Array[],
  inputs: readonly RankingInput[],
  idx: number
): number {
  const vals: number[] = [];
  let wsum = 0;
  let acc = 0;
  for (let k = 0; k < parts.length; k++) {
    const w = inputs[k].weight;
    const v = parts[k][idx];
    if (w <= 0 || !Number.isFinite(v)) continue;
    vals.push(v);
    wsum += w;
    acc += w * v;
  }
  if (vals.length === 0 || wsum <= 0) return 0;
  vals.sort((a, b) => a - b);
  return acc / wsum - quantileSorted(vals, 0.5);
}

/**
 * "Biggest surprise": the scored place whose combined rank differs most from its median
 * single-metric rank. Ties prefer the better combined rank. The reason says whether a few extreme
 * metrics explain the gap or the place is simply more (or less) balanced than its rivals.
 */
export function biggestSurprise(
  base: RankingResult,
  stats: readonly MetricStats[],
  inputs: readonly RankingInput[],
  method: Normalization = 'percentile'
): Surprise | null {
  const active = stats.filter((_, k) => inputs[k].weight > 0);
  if (active.length < 2) return null;
  let best: Omit<Surprise, 'skew' | 'reason'> | null = null;
  const ranks: number[] = [];
  for (const idx of base.order) {
    ranks.length = 0;
    for (const s of active)
      if (!Number.isNaN(s.rank[idx])) ranks.push(s.rank[idx]);
    if (ranks.length < 2) continue;
    ranks.sort((a, b) => a - b);
    const medianRank = quantileSorted(ranks, 0.5);
    const combinedRank = base.composite.rank[idx];
    const delta = medianRank - combinedRank;
    if (best == null || Math.abs(delta) > Math.abs(best.delta))
      best = { idx, combinedRank, medianRank, delta };
  }
  if (best == null || Math.abs(best.delta) < 1) return null;
  const skew = partsSkew(base.composite.parts, inputs, best.idx);
  const t = skewThreshold(method);
  const reason: SurpriseReason =
    best.delta > 0
      ? skew > t
        ? 'standouts'
        : 'consistent'
      : skew < -t
        ? 'weak-spots'
        : 'uneven-rivals';
  return { ...best, skew, reason };
}

/** Score formatting: 0–100 scales get one decimal, z-scores a signed two-decimal value. */
export function formatScore(v: number, method: Normalization): string {
  if (!Number.isFinite(v)) return '—';
  if (method === 'zscore')
    return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
  return v.toFixed(1);
}
