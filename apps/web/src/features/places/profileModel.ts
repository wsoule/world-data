// Pure logic behind place profiles and head-to-head comparisons: where one place stands on every
// metric, which metrics are its strengths and weak spots, how it scores per category, and which
// places look most like it. Kept free of React so it can be unit tested with plain data.

import { pearson, percentile, spearman } from '@world-data/stats';

import { isRankColumn, rankOrder } from '~/data/rankOrder';
import type { EntityType, Metric } from '~/data/types';
import { SITE } from '~/site';

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
  return standingFrom(
    v,
    n,
    better,
    tied,
    range > 0 && toWorse < Infinity ? toWorse / range : 0,
    range > 0 && toBetter < Infinity ? toBetter / range : 0
  );
}

/**
 * A full `Standing` from the counts it is made of: the value, places with a value, places
 * strictly better and places tied (this one included), and the two gaps. Place profiles store
 * only these (features/places/pageData.ts) and rebuild the rest here, exactly as `standingAt`
 * computes it.
 */
export function standingFrom(
  value: number,
  n: number,
  better: number,
  tied: number,
  aheadOfNext: number,
  behindNext: number
): Standing {
  const avgRank = better + (tied + 1) / 2;
  return {
    value,
    rank: better + 1,
    n,
    better,
    worse: n - better - tied,
    tied,
    pct: n > 1 ? 1 - (avgRank - 1) / (n - 1) : 1,
    aheadOfNext,
    behindNext,
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

/** Share of all places from which a ranking counts as covering the whole type. */
export const FULL_COVERAGE_SHARE = 0.5;

/**
 * Share of a partial ranking's places that must be among the type's most populous for the
 * ranking to count as a sample picked by size (see `selectedListMetrics`).
 */
export const SIZE_SAMPLE_SHARE = 0.8;

/**
 * Share of a column's places that are among the type's `n` most populous, where `n` is how many
 * places the column covers. Entities are ordered by population (largest first), so that is the
 * share of covered indexes below `n`: about 1 for a list of the largest places, about n / total
 * for places picked without regard to size.
 */
export function largestPlacesShare(col: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < col.length; i++) if (isFiniteNumber(col[i])) n++;
  if (n === 0) return 0;
  let top = 0;
  for (let i = 0; i < n; i++) if (isFiniteNumber(col[i])) top++;
  return top / n;
}

/**
 * Directional metrics whose places the source picked by the metric itself, which therefore never
 * support calling a place best or worst. A ranking covering at least half of all places speaks for
 * the type; a partial one only does when it is a sample picked by size (at least 80% of its places
 * are the type's largest, like the 184 biggest cities ranked on violent crime), so its best and
 * worst places are the best and worst of the biggest places. Any other partial ranking is a top-N
 * list that shows one end of its metric: "the 1,000 most violent counties" reaches deep into small
 * counties, and the county with the lowest assault rate on it is the 1,000th most violent, not the
 * safest. Strengths, weak spots and notable facts leave these out.
 */
export function selectedListMetrics(
  data: ProfileData,
  metrics: readonly Metric[]
): Set<number> {
  const total = data.entities.length;
  const out = new Set<number>();
  for (const m of metrics) {
    if (!isPolar(m) || m.base === true) continue;
    const col = data.numeric(m.id);
    let n = 0;
    for (let i = 0; i < col.length; i++) if (isFiniteNumber(col[i])) n++;
    if (n === 0 || n >= total * FULL_COVERAGE_SHARE) continue;
    if (largestPlacesShare(col) < SIZE_SAMPLE_SHARE) out.add(m.id);
  }
  return out;
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

/** How closely one metric follows population, as measured by `populationLink`. */
interface PopulationLink {
  /** Spearman ρ between the metric and population */
  r: number;
  /** Spearman ρ between the metric per resident (value ÷ population) and population */
  perCapita: number;
  /** Places with both values */
  n: number;
}

/** Population links per dataset and metric; datasets are immutable, so these never go stale. */
const populationLinks = new WeakMap<ProfileData, Map<string, PopulationLink>>();

/**
 * Rank correlation of a metric with population, both as given and divided by population.
 * Cached per dataset object, because profiles, head-to-heads and every prerendered summary of
 * a place type ask about the same metrics.
 */
function populationLink(
  data: ProfileData,
  id: number,
  populationId: number
): PopulationLink {
  let cache = populationLinks.get(data);
  if (cache == null) {
    cache = new Map();
    populationLinks.set(data, cache);
  }
  const key = `${populationId}:${id}`;
  const hit = cache.get(key);
  if (hit != null) return hit;
  const population = data.numeric(populationId);
  const col = data.numeric(id);
  const perResident = new Float64Array(col.length).fill(Number.NaN);
  for (let i = 0; i < col.length; i++)
    if (population[i] > 0 && isFiniteNumber(col[i]))
      perResident[i] = col[i] / population[i];
  const c = spearman(col, population);
  const link = {
    r: c.r,
    perCapita: spearman(perResident, population).r,
    n: c.n,
  };
  cache.set(key, link);
  return link;
}

export interface PopulationTrackingOptions {
  /** |ρ| with population at or above which any metric counts as tracking it */
  threshold?: number;
  /**
   * Lower ρ at or above which a metric still counts when its per-resident version follows
   * population much less (see `perCapitaRatio`): the signature of a raw count.
   */
  countThreshold?: number;
  /** A count's per-resident |ρ| must be at most this share of its raw ρ */
  perCapitaRatio?: number;
  populationId?: number;
}

/**
 * Whether a metric mostly reflects how many people live in a place. Either it follows
 * population closely (|ρ| ≥ 0.75), or it rises with population (ρ ≥ 0.5) and dividing it by
 * population takes most of that link away. The second test catches raw counts such as
 * murders, whose ρ is modest because small places vary a lot, while leaving out rates and
 * averages: dividing a rate by population ties it to population more, not less.
 */
export function tracksPopulation(
  data: ProfileData,
  id: number,
  {
    threshold = 0.75,
    countThreshold = 0.5,
    perCapitaRatio = 0.8,
    populationId = -1,
  }: PopulationTrackingOptions = {}
): boolean {
  if (id === populationId || !data.hasValues(populationId)) return false;
  const link = populationLink(data, id, populationId);
  if (link.n < 8 || Number.isNaN(link.r)) return false;
  if (Math.abs(link.r) >= threshold) return true;
  return (
    link.r >= countThreshold &&
    Math.abs(link.perCapita) <= perCapitaRatio * link.r
  );
}

/**
 * Directional metrics whose values mostly track how many people live in a place: raw totals
 * such as "# of burglaries", "murders" or "# of electoral votes" (see `tracksPopulation`).
 * Calling the biggest place "best" or "worst" at these says little, so profiles and
 * head-to-heads can leave them out.
 */
export function sizeDrivenMetrics(
  data: ProfileData,
  metrics: readonly Metric[],
  options: PopulationTrackingOptions = {}
): Set<number> {
  const out = new Set<number>();
  for (const m of metrics) {
    if (!isPolar(m) || m.base === true) continue;
    if (tracksPopulation(data, m.id, options)) out.add(m.id);
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

/**
 * Plain-language headline for a first / last-place fact. A rank column names the place's
 * position on the list: "#1 in" when it holds rank 1 (the best place on a best-first list, the
 * worst on a worst-first one; the fact's Best / Worst badge says which), "Last in" otherwise.
 * Values say highest or lowest.
 */
export function factHeadline(f: NotableFact): string {
  const m = f.row.metric;
  const order = rankOrder(m);
  if (order != null) {
    const holdsRankOne = (f.end === 'first') === (order === 'best-first');
    return holdsRankOne ? `#1 in ${m.label}` : `Last in ${m.label}`;
  }
  const high = (f.end === 'first') === (f.row.direction === 1);
  return `${high ? 'Highest' : 'Lowest'} ${m.label}`;
}

/** How far a fact's place is from its nearest rival, as a share of the value range. */
const factMargin = (f: NotableFact) =>
  f.end === 'first' ? f.row.standing.aheadOfNext : f.row.standing.behindNext;

/** Largest share of a ranking that may share a place's value for it to count as notable. */
const MAX_FACT_TIE_SHARE = 0.1;

/**
 * Most places that may share a value for being first or last on it to be a notable fact:
 * one in ten (at least one). Being "last" on the $7.25 federal minimum wage alongside 20 other
 * states, or "lowest" on a value 43 states share, says nothing about the place.
 */
export function maxNotableTie(n: number): number {
  return Math.max(1, Math.floor(n * MAX_FACT_TIE_SHARE));
}

/**
 * Metrics where the place is at the very top or bottom of a ranking with enough coverage,
 * skipping `exclude`d metric ids and values shared by many places (see `maxNotableTie`).
 * Directional metrics come first, then broader rankings, then the widest margins over the
 * nearest rival, one per topic before any topic repeats.
 */
export function notableFacts(
  rows: readonly PlaceMetric[],
  cut: CoverageCut,
  exclude: ReadonlySet<number> = new Set()
): NotableFact[] {
  const facts: NotableFact[] = [];
  for (const row of rows) {
    const s = row.standing;
    if (
      s.n < cut.minN ||
      s.n <= s.tied ||
      s.tied > maxNotableTie(s.n) ||
      exclude.has(row.metric.id)
    )
      continue;
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
  /** Primary category of each metric, aligned to `metricIds` */
  categories: string[];
}

/** Coverage shares tried, highest first, until enough basis candidates qualify. */
const BASIS_COVERAGE_LADDER = [1, 0.9, 0.75, 0.5, 0.25, 0.1, 0.05] as const;

/**
 * Synthetic columns that measure size rather than character: population and area. Density
 * and growth stay in the basis even though density follows population.
 */
const SIZE_COLUMNS: ReadonlySet<number> = new Set([-1, -5]);

/** Rank columns ("Overall Rank") restate a value column on another scale. */
const RANK_LABEL = /\brank(ing)?\b/i;

/** Most basis metrics taken from one topic page. */
const MAX_BASIS_PER_TOPIC = 2;

/** Two basis columns this alike (|Pearson r| of their percentiles) measure the same thing. */
const REDUNDANT_R = 0.95;

/**
 * How many distinct values a column has, and their share of its values: a yes/no or
 * "4 seasons" column has few, so most places tie on it and it says little about any of them.
 */
function distinctValues(col: ArrayLike<number>): {
  count: number;
  share: number;
} {
  const seen = new Set<number>();
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    const v = col[i];
    if (!isFiniteNumber(v)) continue;
    n++;
    seen.add(v);
  }
  return { count: seen.size, share: n > 0 ? seen.size / n : 0 };
}

/** Fewest distinct values a basis column needs: ten, or a tenth of its values if fewer. */
const minDistinct = (n: number) => Math.min(10, Math.ceil(n * 0.1));

/** Whether every value is a whole number from 1500 to 2100: a calendar year column. */
function looksLikeYears(col: ArrayLike<number>): boolean {
  let any = false;
  for (let i = 0; i < col.length; i++) {
    const v = col[i];
    if (!isFiniteNumber(v)) continue;
    if (!Number.isInteger(v) || v < 1500 || v > 2100) return false;
    any = true;
  }
  return any;
}

/** Whether `col` repeats (or mirrors) one of the `chosen` percentile columns. */
function isRedundant(
  col: Float64Array,
  chosen: readonly Float64Array[]
): boolean {
  for (const other of chosen) {
    const c = pearson(col, other);
    if (c.n >= 5 && Math.abs(c.r) >= REDUNDANT_R) return true;
  }
  return false;
}

/**
 * Up to `limit` metrics that describe what a place is like, as percentile columns, for
 * measuring how alike two places are. Candidates are numeric measures with the widest
 * coverage available (the highest rung of `BASIS_COVERAGE_LADDER` that still offers `limit`
 * directional ones), leaving out population and area, metrics that track population (raw counts, see
 * `tracksPopulation`), rank columns, calendar years and columns with only a handful of
 * distinct values (see `distinctValues`). Density and growth go first, then
 * directional metrics, then neutral ones only where directional metrics run out (sparse place
 * types). Within each group, broader coverage wins, then columns with more distinct values (a
 * column most places tie on says little), and the pick rotates through categories, one topic
 * at a time, taking at most two per topic, so no single subject or source page fills the
 * basis. A metric that repeats an earlier label or tracks an earlier column almost exactly is
 * skipped. Direction does not
 * matter for distances, so every column ranks higher values higher.
 */
export function similarityBasis(
  data: ProfileData,
  {
    limit = 60,
    populationId = -1,
  }: { limit?: number; populationId?: number } = {}
): SimilarityBasis {
  const total = data.entities.length;
  const minN = Math.max(3, Math.ceil(total * 0.05));
  const candidates = rankableMetrics(data).filter(
    (m) =>
      m.n >= minN &&
      m.fmt !== 'year' &&
      !isRankColumn(m) &&
      !RANK_LABEL.test(m.label) &&
      !SIZE_COLUMNS.has(m.id) &&
      (m.base === true ||
        (!tracksPopulation(data, m.id, { populationId }) &&
          !looksLikeYears(data.numeric(m.id))))
  );
  let floor = minN;
  for (const share of BASIS_COVERAGE_LADDER) {
    const f = Math.max(minN, Math.ceil(share * total));
    let count = 0;
    for (const m of candidates) if (isPolar(m) && m.n >= f) count++;
    if (count >= limit) {
      floor = f;
      break;
    }
  }
  // Coverage in steps of 5% of all places, so near-equal coverage defers to the next key.
  const coverageStep = (m: Metric) => Math.floor((m.n / total) * 20);
  const pool = candidates
    .filter((m) => m.n >= floor || m.base === true)
    .map((m) => ({ m, distinct: distinctValues(data.numeric(m.id)) }))
    .filter((c) => c.m.base === true || c.distinct.count >= minDistinct(c.m.n))
    .sort((a, b) =>
      byKeys(
        coverageStep(b.m) - coverageStep(a.m),
        b.distinct.share - a.distinct.share,
        a.m.label.localeCompare(b.m.label)
      )
    )
    .map((c) => c.m);
  const primaryCategory = (m: Metric) => m.cats[0] ?? 'other';
  const rotate = (ms: Metric[]) =>
    diversifyByTopic(
      diversifyByTopic(ms, (m) => m.topics[0] ?? `#${m.id}`),
      primaryCategory
    );
  const order = [
    ...pool.filter((m) => m.base === true),
    ...rotate(pool.filter((m) => m.base !== true && isPolar(m))),
    ...rotate(pool.filter((m) => m.base !== true && !isPolar(m))),
  ];

  const seen = new Set<string>();
  const perTopic = new Map<string, number>();
  const metricIds: number[] = [];
  const columns: Float64Array[] = [];
  const categories: string[] = [];
  for (const m of order) {
    if (metricIds.length >= limit) break;
    const key = m.label.trim().toLowerCase();
    const topic = m.topics[0] ?? `#${m.id}`;
    const fromTopic = perTopic.get(topic) ?? 0;
    if (seen.has(key) || fromTopic >= MAX_BASIS_PER_TOPIC) continue;
    seen.add(key);
    const col = percentile(data.numeric(m.id), 1);
    if (isRedundant(col, columns)) continue;
    perTopic.set(topic, fromTopic + 1);
    metricIds.push(m.id);
    columns.push(col);
    categories.push(primaryCategory(m));
  }
  return { metricIds, columns, categories };
}

/** Basis metrics the place at `index` has a value for. */
export function basisCoverage(basis: SimilarityBasis, index: number): number {
  let count = 0;
  for (const col of basis.columns) if (isFiniteNumber(col[index])) count++;
  return count;
}

/** Fewest basis metrics a place, and each match, needs before similarity means anything. */
export const MIN_SIMILARITY_METRICS = 10;

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
 * Returns nothing when the place has fewer than `minMetrics` basis metrics; candidates must
 * share at least `minShared` of them, and never fewer than `minMetrics`.
 */
export function similarPlaces(
  basis: SimilarityBasis,
  index: number,
  entityCount: number,
  {
    limit = 5,
    minShared = 0.7,
    minMetrics = MIN_SIMILARITY_METRICS,
  }: { limit?: number; minShared?: number; minMetrics?: number } = {}
): SimilarPlace[] {
  const own: number[] = [];
  basis.columns.forEach((col, k) => {
    if (isFiniteNumber(col[index])) own.push(k);
  });
  if (own.length < minMetrics) return [];
  const need = Math.max(minMetrics, Math.ceil(own.length * minShared));
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

/**
 * Per-place count of rankable metrics with a value, population and the other base metrics
 * included: the same count as the profile's "Every metric" list and its quick answers.
 */
export function metricsWithData(data: ProfileData): Int32Array {
  const counts = new Int32Array(data.entities.length);
  for (const m of rankableMetrics(data)) {
    const col = data.numeric(m.id);
    for (let i = 0; i < col.length; i++) if (!Number.isNaN(col[i])) counts[i]++;
  }
  return counts;
}

/**
 * The agency that publishes an external statistic (ids from 900,000; src/data/external.ts lists
 * them, scripts/sources downloads them), in the short form a sentence cites it by, or null for a
 * statistic compiled by World Population Review. Countries' price level comes from the World
 * Bank's PPP price level ratio, not from BEA (see `RPP` in external.ts).
 */
export function agencyOf(id: number, type: EntityType): string | null {
  if (id < 900_000 || id >= 1_000_000) return null;
  const block = Math.floor((id - 900_000) / 100);
  if (block === 0) return type === 'country' ? 'World Bank' : 'BEA';
  return (
    [
      null,
      'World Bank',
      'CDC PLACES',
      'EPA',
      'NOAA',
      'BLS',
      'Census ACS',
      'FBI',
      'county election returns',
    ][block] ?? null
  );
}

/** Census ACS figures are 5-year estimates ending in the metric's year. */
const ACS_SPAN = 4;

/**
 * Who published a statistic and for when, as a profile cites it: "World Bank 2024", "Census ACS
 * 2020–2024" (a 5-year estimate), "NOAA 1991–2020" (climate normals). A statistic compiled by
 * World Population Review reads "World Population Review 2025", and null without a year, since
 * its own date is unknown. Only metadata the data build records is used: the metric's id and its
 * default year.
 */
export function sourceNote(
  metric: Pick<Metric, 'id' | 'year'>,
  type: EntityType
): string | null {
  const agency = agencyOf(metric.id, type);
  if (agency === 'NOAA') return 'NOAA 1991–2020';
  if (agency == null)
    return metric.year == null || metric.id < 0
      ? null
      : `${SITE.sourceName} ${metric.year}`;
  if (metric.year == null) return agency;
  return agency === 'Census ACS'
    ? `${agency} ${metric.year - ACS_SPAN}–${metric.year}`
    : `${agency} ${metric.year}`;
}

/** One dated, sourced figure of a place: "life expectancy 84.0 years (World Bank 2024)". */
export interface PlaceFact {
  id: number;
  /** Lower-case name for a sentence ("median household income") */
  label: string;
  /** The value as printed, with its unit ("84.0 years", "$64,580", "4.2%") */
  value: string;
  /** `sourceNote` of the metric */
  source: string;
}

/**
 * The agency statistics a place's summary opens with, per place type, in reading order: the
 * figures an answer engine is asked for (income, life expectancy, unemployment), each from a
 * primary source with a known year. World cities have none.
 */
export const LEAD_FACTS: Readonly<
  Record<EntityType, readonly { id: number; label: string; unit?: string }[]>
> = {
  country: [
    { id: 900_111, label: 'life expectancy', unit: ' years' },
    { id: 900_102, label: 'GDP per person (PPP)' },
    { id: 900_105, label: 'unemployment' },
  ],
  state: [
    { id: 900_603, label: 'median household income' },
    { id: 900_501, label: 'unemployment' },
    { id: 900_606, label: 'poverty rate' },
  ],
  county: [
    { id: 900_603, label: 'median household income' },
    { id: 900_606, label: 'poverty rate' },
    { id: 900_501, label: 'unemployment' },
  ],
  city: [
    { id: 900_603, label: 'median household income' },
    { id: 900_602, label: 'median home value' },
    { id: 900_606, label: 'poverty rate' },
  ],
  'world-city': [],
};

/**
 * A place's `LEAD_FACTS` that it has a value for, formatted with `format` (formatValue in the
 * app), each with its source and year.
 */
export function placeFacts(
  data: Pick<ProfileData, 'numeric'> & {
    metric(id: number): Metric | undefined;
  },
  type: EntityType,
  index: number,
  format: (metric: Metric, v: number) => string
): PlaceFact[] {
  const out: PlaceFact[] = [];
  for (const { id, label, unit } of LEAD_FACTS[type]) {
    const metric = data.metric(id);
    const v = metric == null ? Number.NaN : data.numeric(id)[index];
    const source = metric == null ? null : sourceNote(metric, type);
    if (metric == null || !Number.isFinite(v) || source == null) continue;
    out.push({ id, label, value: `${format(metric, v)}${unit ?? ''}`, source });
  }
  return out;
}

/** Share of the places ranked from the top within which a place "ranks best" (and the bottom). */
export const TOP_SHARE = 0.25;

/** True when a standing is in the best quarter of the places ranked ("ranks best for …"). */
export function inTopQuarter(s: Pick<Standing, 'rank' | 'n'>): boolean {
  return s.rank <= Math.max(1, Math.ceil(s.n * TOP_SHARE));
}

/**
 * True when a standing is in the worst quarter of the places ranked ("ranks lowest for …"): its
 * competition rank, the best a tie shares, so a large tie reaching the bottom from mid-table
 * does not count.
 */
export function inBottomQuarter(s: Pick<Standing, 'rank' | 'n'>): boolean {
  return s.rank > s.n - Math.max(1, Math.ceil(s.n * TOP_SHARE));
}
