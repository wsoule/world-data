// Pure logic for head-to-head comparisons of 2–4 places: the metrics they share, who wins each
// one, the overall scoreboard, per-category leaders and the metrics where they differ most.

import type { Metric } from '~/data/types';
import {
  byKeys,
  dedupeKey,
  isPolar,
  metricDirection,
  type ProfileData,
  rankableMetrics,
  type Standing,
  standingAt,
} from '~/features/places/profileModel';

/** One metric every compared place has a value for. */
export interface SharedMetric {
  metric: Metric;
  direction: 1 | -1;
  /** Has a better/worse direction (see `isPolar`); neutral metrics have no winner */
  polar: boolean;
  /** Per compared place, in the order given */
  values: number[];
  /** Standing of each compared place among every place of the type */
  standings: Standing[];
  /** Index (into the compared places) of the best value; null for neutral metrics and ties */
  winner: number | null;
  /** Largest minus smallest percentile among the compared places, 0–1 */
  spread: number;
}

/**
 * Every rankable metric that all `places` (entity indexes) have a value for, one row per
 * distinct fact (a label repeated on several topic pages with identical values counts once),
 * minus any `exclude`d metric ids.
 */
export function sharedMetrics(
  data: ProfileData,
  places: readonly number[],
  exclude: ReadonlySet<number> = new Set()
): SharedMetric[] {
  if (places.length === 0) return [];
  const seen = new Set<string>();
  const out: SharedMetric[] = [];
  const metrics = rankableMetrics(data).sort((a, b) =>
    byKeys(b.n - a.n, a.id - b.id)
  );
  for (const metric of metrics) {
    if (exclude.has(metric.id)) continue;
    const col = data.numeric(metric.id);
    if (places.some((p) => Number.isNaN(col[p]))) continue;
    const values = places.map((p) => col[p]);
    const key = dedupeKey(metric.label, values);
    if (seen.has(key)) continue;
    const direction = metricDirection(metric);
    const standings: Standing[] = [];
    for (const p of places) {
      const s = standingAt(col, p, direction);
      if (s != null) standings.push(s);
    }
    if (standings.length !== places.length) continue;
    seen.add(key);
    const polar = isPolar(metric);
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of standings) {
      lo = Math.min(lo, s.pct);
      hi = Math.max(hi, s.pct);
    }
    out.push({
      metric,
      direction,
      polar,
      values,
      standings,
      winner: polar ? bestIndex(values, direction) : null,
      spread: hi - lo,
    });
  }
  return out;
}

/** Index of the single best value given the direction, or null when the best is tied. */
export function bestIndex(
  values: readonly number[],
  direction: 1 | -1
): number | null {
  let best = 0;
  let tied = false;
  for (let k = 1; k < values.length; k++) {
    const d = (values[k] - values[best]) * direction;
    if (d > 0) {
      best = k;
      tied = false;
    } else if (d === 0) tied = true;
  }
  return tied ? null : best;
}

export interface Scoreboard {
  /** Wins per compared place over directional shared metrics */
  wins: number[];
  ties: number;
  /** Directional shared metrics */
  total: number;
}

export function scoreboard(
  shared: readonly SharedMetric[],
  placeCount: number
): Scoreboard {
  const wins = Array.from({ length: placeCount }, () => 0);
  let ties = 0;
  let total = 0;
  for (const s of shared) {
    if (!s.polar) continue;
    total++;
    if (s.winner == null) ties++;
    else wins[s.winner]++;
  }
  return { wins, ties, total };
}

export interface CategoryLead {
  category: string;
  /** Mean percentile (0–1) per compared place over the category's directional metrics */
  means: number[];
  count: number;
  /** Index of the place with the highest mean; null when the top two are within 0.5 points */
  leader: number | null;
}

/**
 * Average percentile of each compared place per category, over directional shared metrics with
 * at least `minN` places ranked. Categories with fewer than `minMetrics` metrics are dropped.
 * Ordered by how decisively the category is led.
 */
export function categoryLeads(
  shared: readonly SharedMetric[],
  placeCount: number,
  { minN = 0, minMetrics = 3 }: { minN?: number; minMetrics?: number } = {}
): CategoryLead[] {
  const acc = new Map<string, { sums: number[]; count: number }>();
  for (const s of shared) {
    if (!s.polar || s.standings.some((st) => st.n < minN)) continue;
    for (const c of s.metric.cats) {
      const a = acc.get(c) ?? {
        sums: Array.from({ length: placeCount }, () => 0),
        count: 0,
      };
      s.standings.forEach((st, k) => {
        a.sums[k] += st.pct;
      });
      a.count++;
      acc.set(c, a);
    }
  }
  const out: (CategoryLead & { margin: number })[] = [];
  for (const [category, a] of acc) {
    if (a.count < minMetrics) continue;
    const means = a.sums.map((s) => s / a.count);
    const order = means
      .map((m, k) => [m, k] as const)
      .sort((x, y) => y[0] - x[0]);
    const margin = order.length > 1 ? order[0][0] - order[1][0] : 0;
    out.push({
      category,
      means,
      count: a.count,
      leader: margin >= 0.005 ? order[0][1] : null,
      margin,
    });
  }
  return out
    .sort((a, b) =>
      byKeys(b.margin - a.margin, a.category.localeCompare(b.category))
    )
    .map(({ margin: _margin, ...lead }) => lead);
}

/**
 * The `limit` directional metrics on which the compared places' percentiles differ most,
 * restricted to rankings covering at least `minN` places and optionally to one category.
 */
export function biggestDifferences(
  shared: readonly SharedMetric[],
  {
    limit = 25,
    minN = 0,
    category,
  }: {
    limit?: number;
    minN?: number;
    category?: string;
  } = {}
): SharedMetric[] {
  return shared
    .filter(
      (s) =>
        s.polar &&
        s.standings.every((st) => st.n >= minN) &&
        (category == null || s.metric.cats.includes(category))
    )
    .sort((a, b) =>
      byKeys(
        b.spread - a.spread,
        b.standings[0].n - a.standings[0].n,
        a.metric.label.localeCompare(b.metric.label)
      )
    )
    .slice(0, limit);
}
