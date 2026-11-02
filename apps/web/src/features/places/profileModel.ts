// Pure logic behind place profiles and head-to-head comparisons: where one place stands on every
// metric, which metrics are its strengths and weak spots, how it scores per category, and which
// places look most like it. Kept free of React so it can be unit tested with plain data.

import { percentile, spearman } from '@world-data/stats';

import type { Metric } from '~/data/types';

/** The parts of a `Dataset` these helpers read (a Dataset satisfies it structurally). */
export interface ProfileData {
  entities: readonly { id: string; name: string }[];
  metrics: readonly Metric[];
  numeric(id: number): Float64Array;
  hasValues(id: number): boolean;
}

/** Where one place stands on one metric among every place with a value. */
export interface Standing {
  value: number;
  /** Competition rank ("1, 2, 2, 4"), 1 = best given the direction */
  rank: number;
  /** Places with a value */
  n: number;
  /** Places strictly better / strictly worse than this one */
  better: number;
  worse: number;
  /** Places with exactly this value, including this one */
  tied: number;
  /** 0–1 where 1 = best (average-rank based, identical to stats `percentile`) */
  pct: number;
  /**
   * Gap to the nearest worse / better value as a share of the full value range (0 when there
   * is none). For a leader, `aheadOfNext` says how decisively it leads; for the last place,
   * `behindNext` says how far it trails.
   */
  aheadOfNext: number;
  behindNext: number;
}

const isFiniteNumber = (v: number) => !Number.isNaN(v) && Number.isFinite(v);

/**
 * Multi-key sort comparison: the first non-zero difference wins. Lets comparators list their
 * tie-breakers in order without chaining numbers through `||`.
 */
export function byKeys(...diffs: number[]): number {
  for (const d of diffs) if (d !== 0) return d;
  return 0;
}

/**
 * Standing of the place at `index` on one column, in a single pass and without sorting.
 * Gives exactly what `competitionRank` and `percentile` from @world-data/stats return at that
 * index, but costs O(n) instead of O(n log n) plus two allocations, which matters when a profile
 * needs one place's standing on thousands of metrics at once.
 */
export function standingAt(
  col: ArrayLike<number>,
  index: number,
  direction: 1 | -1
): Standing | null {
  const v = col[index];
  if (v == null || !isFiniteNumber(v)) return null;
  let n = 0;
  let better = 0;
  let tied = 0;
  let min = v;
  let max = v;
  // Smallest distance (in the "better" direction) to a strictly better / worse value.
  let toBetter = Infinity;
  let toWorse = Infinity;
  for (let i = 0; i < col.length; i++) {
    const x = col[i];
    if (!isFiniteNumber(x)) continue;
    n++;
    if (x < min) min = x;
    if (x > max) max = x;
    const d = (x - v) * direction;
    if (d === 0) tied++;
    else if (d > 0) {
      better++;
      if (d < toBetter) toBetter = d;
    } else if (-d < toWorse) toWorse = -d;
  }
  const range = max - min;
  const avgRank = better + (tied + 1) / 2;
  return {
    value: v,
    rank: better + 1,
    n,
    better,
    worse: n - better - tied,
    tied,
    pct: n > 1 ? 1 - (avgRank - 1) / (n - 1) : 1,
    aheadOfNext: range > 0 && toWorse < Infinity ? toWorse / range : 0,
    behindNext: range > 0 && toBetter < Infinity ? toBetter / range : 0,
  };
}

/**
 * Whether a metric has a better and a worse end. Calendar years (founded, measured, adopted) never
 * do, whatever the polarity heuristic guessed for them.
 */
export function isPolar(m: Pick<Metric, 'pol' | 'fmt'>): boolean {
  return m.pol !== 0 && m.fmt !== 'year';
}

/** Direction used for ranking: lower-is-better metrics rank ascending, everything else descending. */
export function metricDirection(m: Pick<Metric, 'pol'>): 1 | -1 {
  return m.pol === -1 ? -1 : 1;
}

/** Numeric, non-bookkeeping metrics that have values at all. */
export function rankableMetrics(data: ProfileData): Metric[] {
  return data.metrics.filter(
    (m) => m.kind === 'num' && m.meta !== true && data.hasValues(m.id)
  );
}

/** One metric seen from one place. */
export interface PlaceMetric {
  metric: Metric;
  standing: Standing;
  direction: 1 | -1;
  /** Has a better/worse direction (pol ≠ 0) */
  polar: boolean;
}

/** Every rankable metric the place at `index` has a value for, with its standing. */
export function placeStandings(
  data: ProfileData,
  index: number,
  metrics: readonly Metric[] = rankableMetrics(data)
): PlaceMetric[] {
  const out: PlaceMetric[] = [];
  for (const metric of metrics) {
    const direction = metricDirection(metric);
    const standing = standingAt(data.numeric(metric.id), index, direction);
    if (standing != null)
      out.push({ metric, standing, direction, polar: isPolar(metric) });
  }
  return out;
}

/** Coverage shares tried in order until enough metrics qualify (see `coverageCut`). */
const COVERAGE_LADDER = [0.5, 0.25, 0.1, 0.05] as const;

export interface CoverageCut {
  /** Minimum number of places with data for a metric to count */
  minN: number;
  /** The share of all places that `minN` represents */
  share: number;
}

/**
 * Minimum coverage for a metric to count towards strengths, weak spots, categories and notable
 * facts, so that "1st" means something. Half of all places when that leaves at least
 * `minQualifying` directional metrics (countries, states); otherwise the first lower share that
 * does (US cities and counties, whose rankings each cover only part of the list).
 */
export function coverageCut(
  metrics: readonly Pick<Metric, 'n' | 'pol' | 'fmt'>[],
  entityCount: number,
  minQualifying = 12
): CoverageCut {
  let cut: CoverageCut = { minN: 0, share: 0 };
  for (const share of COVERAGE_LADDER) {
    const minN = Math.max(5, Math.ceil(share * entityCount));
    cut = { minN, share };
    let count = 0;
    for (const m of metrics) if (isPolar(m) && m.n >= minN) count++;
    if (count >= minQualifying) return cut;
  }
  return cut;
}

/**
 * Key that treats two metrics as the same fact when they share a label and value. The source
 * repeats popular measures (say, median income) across many topic pages; without this the
 * strengths list would show the same number five times.
 */
export function dedupeKey(label: string, values: readonly number[]): string {
  return `${label.trim().toLowerCase()}|${values.map((v) => v.toPrecision(10)).join(',')}`;
}

/** Keep the first row per `dedupeKey`. */
function uniqueRows(rows: readonly PlaceMetric[]): PlaceMetric[] {
  const seen = new Set<string>();
  const out: PlaceMetric[] = [];
  for (const r of rows) {
    const key = dedupeKey(r.metric.label, [r.standing.value]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Directional metrics whose values mostly track how many people live in a place: raw totals
 * such as "# of burglaries" or "# of electoral votes", where |Spearman ρ| with population is at
 * least `threshold`. Calling the biggest place "best" or "worst" at these says little, so
 * profiles and head-to-heads can leave them out.
 */
export function sizeDrivenMetrics(
  data: ProfileData,
  metrics: readonly Metric[],
  { threshold = 0.75, populationId = -1 } = {}
): Set<number> {
  const out = new Set<number>();
  if (!data.hasValues(populationId)) return out;
  const population = data.numeric(populationId);
  for (const m of metrics) {
    if (!isPolar(m) || m.id === populationId || m.base === true) continue;
    const c = spearman(data.numeric(m.id), population);
    if (c.n >= 8 && Math.abs(c.r) >= threshold) out.add(m.id);
  }
  return out;
}

/**
 * Directional metrics with enough coverage, one row per distinct fact, minus any `exclude`d
 * metric ids (see `sizeDrivenMetrics`).
 */
export function qualifyingRows(
  rows: readonly PlaceMetric[],
  cut: CoverageCut,
  exclude: ReadonlySet<number> = new Set()
): PlaceMetric[] {
  return uniqueRows(
    [...rows]
      .filter(
        (r) => r.polar && r.standing.n >= cut.minN && !exclude.has(r.metric.id)
      )
      // Broadest rankings first so duplicates keep the most informative copy.
      .sort((a, b) => b.standing.n - a.standing.n)
  );
}

/**
 * Reorder so the first item of every topic comes before the second item of any topic, and so
 * on, keeping the original order within each round. Stops a short list from being filled by one
 * topic page that reports the same measure several ways (hourly and annual pay, say).
 */
export function diversifyByTopic<T>(
  items: readonly T[],
  topicOf: (item: T) => string
): T[] {
  const seen = new Map<string, number>();
  const round = items.map((item) => {
    const t = topicOf(item);
    const r = seen.get(t) ?? 0;
    seen.set(t, r + 1);
    return r;
  });
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => byKeys(round[a.i] - round[b.i], a.i - b.i))
    .map((x) => x.item);
}

const topicOf = (r: PlaceMetric) => r.metric.topics[0] ?? `#${r.metric.id}`;

export interface StrengthsAndWeaknesses {
  best: PlaceMetric[];
  worst: PlaceMetric[];
}

const bestFirst = (a: PlaceMetric, b: PlaceMetric) =>
  byKeys(
    b.standing.pct - a.standing.pct,
    b.standing.n - a.standing.n,
    b.standing.aheadOfNext - a.standing.aheadOfNext,
    a.metric.label.localeCompare(b.metric.label)
  );

const worstFirst = (a: PlaceMetric, b: PlaceMetric) =>
  byKeys(
    a.standing.pct - b.standing.pct,
    b.standing.n - a.standing.n,
    b.standing.behindNext - a.standing.behindNext,
    a.metric.label.localeCompare(b.metric.label)
  );

/**
 * Top `limit` strengths and weak spots by direction-aware percentile. Ties (common when a place
 * is 1st of 51 on dozens of metrics) go to the larger ranking, then to the more decisive margin
 * over the neighbouring value. Each list takes one metric per topic before any topic gets a
 * second (see `diversifyByTopic`). The two lists never share a metric: with few qualifying
 * metrics each gets half.
 */
export function strengthsAndWeaknesses(
  qualifying: readonly PlaceMetric[],
  limit = 10
): StrengthsAndWeaknesses {
  const sorted = [...qualifying].sort(bestFirst);
  const half = Math.ceil(sorted.length / 2);
  const pick = (
    rows: PlaceMetric[],
    cmp: (a: PlaceMetric, b: PlaceMetric) => number
  ) => diversifyByTopic(rows.sort(cmp), topicOf).slice(0, limit).sort(cmp);
  return {
    best: pick(sorted.slice(0, half), bestFirst),
    worst: pick(sorted.slice(half), worstFirst),
  };
}

export interface CategoryScore {
  category: string;
  /** Mean direction-aware percentile 0–1 */
  mean: number;
  count: number;
}

/**
 * Average percentile per category over qualifying metrics (a metric counts towards each of its
 * categories). Categories with fewer than `minMetrics` metrics are dropped. Best first.
 */
export function categoryScores(
  qualifying: readonly PlaceMetric[],
  minMetrics = 3
): CategoryScore[] {
  const acc = new Map<string, { sum: number; count: number }>();
  for (const r of qualifying) {
    for (const c of r.metric.cats) {
      const a = acc.get(c) ?? { sum: 0, count: 0 };
      a.sum += r.standing.pct;
      a.count++;
      acc.set(c, a);
    }
  }
  const out: CategoryScore[] = [];
  for (const [category, a] of acc)
    if (a.count >= minMetrics)
      out.push({ category, mean: a.sum / a.count, count: a.count });
  return out.sort((a, b) =>
    byKeys(b.mean - a.mean, a.category.localeCompare(b.category))
  );
}

export interface NotableFact {
  row: PlaceMetric;
  /** Top of the ranking (best, or highest for neutral metrics) or bottom */
  end: 'first' | 'last';
}

/** How far a fact's place is from its nearest rival, as a share of the value range. */
const factMargin = (f: NotableFact) =>
  f.end === 'first' ? f.row.standing.aheadOfNext : f.row.standing.behindNext;

/**
 * Metrics where the place is at the very top or bottom of a ranking with enough coverage,
 * skipping `exclude`d metric ids. Directional metrics come first, then broader rankings, then
 * the widest margins over the nearest rival, one per topic before any topic repeats.
 */
export function notableFacts(
  rows: readonly PlaceMetric[],
  cut: CoverageCut,
  exclude: ReadonlySet<number> = new Set()
): NotableFact[] {
  const facts: NotableFact[] = [];
  for (const row of rows) {
    const s = row.standing;
    if (s.n < cut.minN || s.n <= s.tied || exclude.has(row.metric.id)) continue;
    if (s.better === 0) facts.push({ row, end: 'first' });
    else if (s.worse === 0) facts.push({ row, end: 'last' });
  }
  facts.sort((a, b) =>
    byKeys(
      Number(b.row.polar) - Number(a.row.polar),
      b.row.standing.n - a.row.standing.n,
      factMargin(b) - factMargin(a),
      a.row.metric.label.localeCompare(b.row.metric.label)
    )
  );
  const seen = new Set<string>();
  const unique = facts.filter((f) => {
    const key = dedupeKey(f.row.metric.label, [f.row.standing.value]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return diversifyByTopic(unique, (f) => topicOf(f.row));
}

/** Percentile columns used to measure how alike two places are. */
export interface SimilarityBasis {
  metricIds: number[];
  /** One percentile column (0–1, NaN = missing) per metric, aligned to entities */
  columns: Float64Array[];
}

/**
 * The `limit` best-covered numeric metrics (one per label, so a measure repeated on several
 * topic pages is not counted twice) as percentile columns. Direction does not matter for
 * distances, so every column ranks higher values higher.
 */
export function similarityBasis(
  data: ProfileData,
  limit = 60
): SimilarityBasis {
  const minN = Math.max(3, Math.ceil(data.entities.length * 0.05));
  const seen = new Set<string>();
  const metricIds: number[] = [];
  const columns: Float64Array[] = [];
  const candidates = rankableMetrics(data)
    .filter((m) => m.n >= minN)
    .sort((a, b) => byKeys(b.n - a.n, a.id - b.id));
  for (const m of candidates) {
    if (metricIds.length >= limit) break;
    const key = m.label.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    metricIds.push(m.id);
    columns.push(percentile(data.numeric(m.id), 1));
  }
  return { metricIds, columns };
}

export interface SimilarPlace {
  index: number;
  /** 1 − root-mean-square percentile difference, 0–1 */
  similarity: number;
  /** Basis metrics both places have */
  shared: number;
}

/**
 * Nearest neighbours of the place at `index`: Euclidean distance over shared basis percentiles,
 * normalised to a root mean square so places compared on fewer metrics are not favoured.
 * Candidates must share at least `minShared` of the target's basis metrics.
 */
export function similarPlaces(
  basis: SimilarityBasis,
  index: number,
  entityCount: number,
  { limit = 5, minShared = 0.7 }: { limit?: number; minShared?: number } = {}
): SimilarPlace[] {
  const own: number[] = [];
  basis.columns.forEach((col, k) => {
    if (isFiniteNumber(col[index])) own.push(k);
  });
  if (own.length < 3) return [];
  const need = Math.max(3, Math.ceil(own.length * minShared));
  const out: SimilarPlace[] = [];
  for (let e = 0; e < entityCount; e++) {
    if (e === index) continue;
    let shared = 0;
    let sum = 0;
    for (const k of own) {
      const col = basis.columns[k];
      const other = col[e];
      if (!isFiniteNumber(other)) continue;
      const d = col[index] - other;
      sum += d * d;
      shared++;
    }
    if (shared < need) continue;
    out.push({ index: e, similarity: 1 - Math.sqrt(sum / shared), shared });
  }
  return out
    .sort((a, b) => byKeys(b.similarity - a.similarity, a.index - b.index))
    .slice(0, limit);
}

/** Per-place count of rankable, non-synthetic metrics with a value. */
export function metricsWithData(data: ProfileData): Int32Array {
  const counts = new Int32Array(data.entities.length);
  for (const m of rankableMetrics(data)) {
    if (m.base === true) continue;
    const col = data.numeric(m.id);
    for (let i = 0; i < col.length; i++) if (!Number.isNaN(col[i])) counts[i]++;
  }
  return counts;
}
