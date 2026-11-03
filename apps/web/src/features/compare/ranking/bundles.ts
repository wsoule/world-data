import { pearson, spearman } from '@world-data/stats';

import type { Metric } from '~/data/types';

export const BUNDLE_IDS = [
  'quality',
  'economy',
  'health',
  'safety',
  'education',
  'everything',
] as const;
export type BundleId = (typeof BUNDLE_IDS)[number];

export const isBundleId = (v: unknown): v is BundleId =>
  BUNDLE_IDS.includes(v as BundleId);

/** What bundle building needs from a dataset (kept minimal so it can be unit tested). */
export interface BundleSource {
  metrics: readonly Metric[];
  entityCount: number;
  /** Values aligned to entities, NaN = missing */
  numeric: (id: number) => ArrayLike<number>;
}

/** A ready-made metric basket for the combined ranking. */
export interface Bundle {
  id: BundleId;
  label: string;
  description: string;
  metricIds: number[];
  /** Every chosen metric covers at least this fraction of places */
  minCoverage: number;
  /** Metrics that qualified (right category, polarity, coverage) before picking */
  qualifying: number;
}

interface BundleSpec {
  id: BundleId;
  label: string;
  description: string;
  /** Categories a metric must belong to (empty = any category) */
  cats: readonly string[];
  /** Label patterns in priority order: earlier patterns are picked first */
  prefer: readonly RegExp[];
  max: number;
  /** Cap per category so mixed bundles stay balanced */
  perCategory?: number;
  /** Lower cap for categories outside `boostCats` */
  otherCategoryCap?: number;
  /** Fewest metrics a coverage level must yield before we stop relaxing it */
  minMetrics: number;
  /** Categories that get a score bonus (used by "everything" to lead with well-being metrics) */
  boostCats?: readonly string[];
  /** Start from the metrics the other bundles picked */
  seedWithOthers?: boolean;
}

/** Coverage thresholds tried in order; sparse datasets (cities, counties) need the lower ones. */
export const COVERAGE_LEVELS = [0.85, 0.6, 0.35] as const;
/** Metrics closer than this (|Pearson r|) to one already chosen are treated as duplicates. */
export const DUPLICATE_R = 0.95;
/** Metrics that mostly measure size (|Spearman ρ| with population) say little about quality. */
export const SIZE_PROXY_RHO = 0.8;
export const EVERYTHING_CAP = 40;
/** At most this many metrics from one source topic, and per preferred concept (pattern). */
const PER_TOPIC = 2;
const PER_PATTERN = 2;

const CORE_CATS = [
  'health',
  'crime-safety',
  'economics',
  'education',
  'environment',
  'culture',
] as const;

const QUALITY_PREFER: readonly RegExp[] = [
  /happiness|quality of life|well-?being|livability|most livable/i,
  /life expectancy/i,
  /median (household )?income|gdp per capita|per capita income/i,
  /violent crime rate|crime (rate|index)|safest|safety (rank|index|score)|peace index/i,
  /cost of living/i,
  /education (rank|score|index)|most educated|bachelor/i,
  /air quality|pollution|pm ?2\.5/i,
  /unemployment|poverty/i,
  /health(care)? (rank|score|index)|healthiest|obesity/i,
];

const SPECS: readonly BundleSpec[] = [
  {
    id: 'quality',
    label: 'Quality of life',
    description: 'Happiness, health, income, safety, education and environment',
    cats: CORE_CATS,
    prefer: QUALITY_PREFER,
    max: 8,
    perCategory: 2,
    minMetrics: 3,
  },
  {
    id: 'economy',
    label: 'Economy',
    description: 'Output, income, jobs, poverty and cost of living',
    cats: ['economics'],
    prefer: [
      /gdp per capita/i,
      /median (household )?income|per capita income|household income/i,
      /unemployment/i,
      /poverty/i,
      /econom(y|ic) (rank|score|index|freedom|outlook)|best economies/i,
      /cost of living/i,
      /wage|salary|earnings/i,
      /gini|inequality/i,
      /gdp|growth/i,
    ],
    max: 8,
    minMetrics: 4,
  },
  {
    id: 'health',
    label: 'Health',
    description: 'Life expectancy, health outcomes and access to care',
    cats: ['health'],
    prefer: [
      /life expectancy/i,
      /health(care| care)? (rank|score|index|ranking)|healthiest|overall health/i,
      /obesity/i,
      /infant mortality|mortality/i,
      /uninsured|insurance|access/i,
      /smok/i,
      /diabetes|heart disease|cancer/i,
      /physical(ly)? (in)?activ|exercise/i,
      /mental health|depression|suicide/i,
    ],
    max: 8,
    minMetrics: 4,
  },
  {
    id: 'safety',
    label: 'Safety',
    description: 'Crime rates, violence and everyday safety',
    cats: ['crime-safety'],
    prefer: [
      /violent crime rate/i,
      /safe(st|ty)\b.*\b(rank|score|index)|peace index|safety index/i,
      /property crime rate|crime rate|crime index/i,
      /murder rate|homicide rate|homicide/i,
      /gun death rate|firearm/i,
      /incarceration rate/i,
      /traffic|road (deaths|fatalit|safety)|car accident/i,
      /terror/i,
    ],
    max: 8,
    minMetrics: 4,
  },
  {
    id: 'education',
    label: 'Education',
    description: 'Attainment, school quality and test scores',
    cats: ['education'],
    prefer: [
      /education (rank|score|index)|best education|overall education|most educated/i,
      /bachelor|college degree|graduate|attainment|years of schooling/i,
      /graduation rate|high school/i,
      /literacy/i,
      /\bsat\b|\bact\b|naep|pisa|test score|math/i,
      /public school|school (rank|quality)|quality of education|k-12/i,
      /student|teacher/i,
    ],
    max: 8,
    minMetrics: 4,
  },
  {
    id: 'everything',
    label: 'Rank on everything',
    description:
      'Every well-covered metric with a clear better direction, across all categories',
    cats: [],
    prefer: QUALITY_PREFER,
    max: EVERYTHING_CAP,
    perCategory: 8,
    otherCategoryCap: 2,
    minMetrics: 5,
    boostCats: CORE_CATS,
    seedWithOthers: true,
  },
];

/** Labels that read like a measure (rate, score, share…) rather than a raw amount. */
const MEASURE_LIKE =
  /\b(rank|ranking|score|index|rate|per capita|per 100k|per 1,?000|percent|share|ratio|average|median|expectancy)\b|%/i;
/** Raw counts ("Total Crimes", "Number of …", "Gun Deaths") rank big places first, so skip them. */
const COUNT_LIKE =
  /^(#|number of|no\. of|count\b)|\bcount$|^total\b(?!.*\b(score|index|rate|rank|ranking|per)\b)|^([\w-]+ )?(homicides|murders|deaths|injuries|rapes|robberies|burglaries|thefts|crimes|prisoners|inmates|cases|arrests|fatalities|accidents|shootings)$/i;
/**
 * Costs whose catalog polarity is often guessed wrong ("Livable Wage" marked higher-is-better) and
 * bilateral US trade figures that say nothing about the place itself.
 */
const AMBIGUOUS =
  /\b(spent on|spending on|fees?|prices?|cost per)\b|livable wage|living wage|^u\.?s\.? (total )?(trade|imports|exports|duty)/i;
/** Labels that mean nothing without their topic ("Rank", "Overall Score"). */
const GENERIC = /^(overall |total )?(rank|ranking|score|index)$/i;
/** Subgroup variants ("Obesity Rate 18-39", "Female Suicide Rate") rank below the headline figure. */
const SUBGROUP =
  /\b(male|female|men|women|boys|girls|black|white|hispanic|asian|native|ages?|under age|children|youth|teens?|seniors?|rural|urban)\b|\d+\s*[-–+]\s*\d*| - /i;

interface Candidate {
  metric: Metric;
  /** First of the metric's categories that the bundle accepts */
  cat: string;
  /** Index of the first matching preferred pattern, -1 when none match */
  pattern: number;
  /** In one of the bundle's boosted categories */
  boosted: boolean;
  score: number;
}

// Rank a candidate: preferred label patterns dominate, then boosted categories, "measure-like"
// labels, recent years and coverage. Catalog order is the final tie-breaker (stable sort).
function candidateScore(
  m: Metric,
  pattern: number,
  boosted: boolean,
  entityCount: number
): number {
  let s = 0;
  if (pattern >= 0) s += 100 - pattern * 6;
  if (boosted) s += 20;
  if (MEASURE_LIKE.test(m.label)) s += 8;
  if (GENERIC.test(m.label.trim())) s -= 30;
  if (SUBGROUP.test(m.label)) s -= 15;
  if (m.year != null) s += Math.max(0, Math.min(10, m.year - 2014));
  s += entityCount > 0 ? (10 * m.n) / entityCount : 0;
  return s;
}

/**
 * Numeric, non-meta, non-synthetic metrics with a known better direction, excluding raw counts and
 * costs whose direction is ambiguous.
 */
export function isRankable(m: Metric): boolean {
  const label = m.label.trim();
  return (
    m.kind === 'num' &&
    m.meta !== true &&
    m.base !== true &&
    m.pol !== 0 &&
    !COUNT_LIKE.test(label) &&
    !AMBIGUOUS.test(label)
  );
}

const normLabel = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ');

/**
 * Shared state for one buildBundles() call: memoised size-proxy checks so that picking several
 * bundles from the same catalog does not repeat work.
 */
class PickContext {
  private readonly proxy = new Map<number, boolean>();
  private readonly population: ArrayLike<number> | null;

  constructor(readonly source: BundleSource) {
    const hasPop = source.metrics.some((m) => m.id === -1);
    this.population = hasPop ? source.numeric(-1) : null;
  }

  /** True when a metric mostly tracks population size (|Spearman ρ| > SIZE_PROXY_RHO). */
  isSizeProxy(id: number): boolean {
    const cached = this.proxy.get(id);
    if (cached != null) return cached;
    let out = false;
    if (this.population != null) {
      const rho = spearman(this.source.numeric(id), this.population).r;
      out = Number.isFinite(rho) && Math.abs(rho) > SIZE_PROXY_RHO;
    }
    this.proxy.set(id, out);
    return out;
  }
}

/** Running selection for one bundle, with the counters its caps need. */
class Selection {
  readonly chosen: Metric[] = [];
  private readonly cols: ArrayLike<number>[] = [];
  private readonly labels = new Set<string>();
  private readonly perCat = new Map<string, number>();
  private readonly perTopic = new Map<string, number>();
  private readonly perPattern = new Map<number, number>();
  private readonly rejected = new Set<number>();

  constructor(
    private readonly ctx: PickContext,
    private readonly spec: BundleSpec
  ) {}

  /** Category cap for a candidate (boosted categories may hold more than the rest). */
  private capFor(c: Candidate): number | undefined {
    if (this.spec.otherCategoryCap != null && !c.boosted)
      return this.spec.otherCategoryCap;
    return this.spec.perCategory;
  }

  // Add a candidate unless it breaks a cap or duplicates a metric already chosen. Permanent
  // failures (size proxy, repeated label, |r| > DUPLICATE_R) are remembered; cap failures are
  // not, so the uncapped second pass can still take the metric.
  tryAdd(c: Candidate, capped: boolean): void {
    const m = c.metric;
    if (this.rejected.has(m.id) || this.chosen.includes(m)) return;
    const topic = m.topics[0] ?? '';
    const catCap = this.capFor(c);
    if (
      capped &&
      ((catCap != null && (this.perCat.get(c.cat) ?? 0) >= catCap) ||
        (this.perTopic.get(topic) ?? 0) >= PER_TOPIC ||
        (c.pattern >= 0 &&
          (this.perPattern.get(c.pattern) ?? 0) >= PER_PATTERN))
    )
      return;
    const label = normLabel(m.label);
    if (this.labels.has(label) || this.ctx.isSizeProxy(m.id)) {
      this.rejected.add(m.id);
      return;
    }
    const col = this.ctx.source.numeric(m.id);
    for (const other of this.cols) {
      if (Math.abs(pearson(col, other).r) > DUPLICATE_R) {
        this.rejected.add(m.id);
        return;
      }
    }
    this.chosen.push(m);
    this.cols.push(col);
    this.labels.add(label);
    this.perCat.set(c.cat, (this.perCat.get(c.cat) ?? 0) + 1);
    this.perTopic.set(topic, (this.perTopic.get(topic) ?? 0) + 1);
    if (c.pattern >= 0)
      this.perPattern.set(c.pattern, (this.perPattern.get(c.pattern) ?? 0) + 1);
  }
}

// Greedy pick in score order (seeds first), honouring the caps; when the caps leave the bundle
// short, a second pass fills it without them.
function pick(
  seeds: readonly Candidate[],
  cands: readonly Candidate[],
  spec: BundleSpec,
  ctx: PickContext
): number[] {
  const sel = new Selection(ctx, spec);
  for (const c of seeds) {
    if (sel.chosen.length >= spec.max) break;
    sel.tryAdd(c, false);
  }
  for (const capped of [true, false]) {
    for (const c of cands) {
      if (sel.chosen.length >= spec.max) break;
      sel.tryAdd(c, capped);
    }
  }
  return sel.chosen.map((m) => m.id);
}

function candidatesFor(
  spec: BundleSpec,
  source: BundleSource,
  minN: number
): Candidate[] {
  const accept = spec.cats.length > 0 ? new Set(spec.cats) : null;
  const boost = new Set(spec.boostCats ?? []);
  const cands: Candidate[] = [];
  for (const m of source.metrics) {
    if (m.n < minN || !isRankable(m)) continue;
    const cat =
      accept == null ? (m.cats[0] ?? '') : m.cats.find((c) => accept.has(c));
    if (cat == null) continue;
    const pattern = spec.prefer.findIndex((r) => r.test(m.label));
    const boosted = m.cats.some((c) => boost.has(c));
    cands.push({
      metric: m,
      cat,
      pattern,
      boosted,
      score: candidateScore(m, pattern, boosted, source.entityCount),
    });
  }
  return cands.sort((a, b) => b.score - a.score);
}

/**
 * Build the preset baskets ("Quality of life", "Economy", …, "Rank on everything") from whatever
 * metrics this dataset has. Each bundle takes rankable metrics from its categories that cover at
 * least 85% of places (relaxing to 60% / 35% for sparse place types), skipping size proxies and
 * near-duplicates (|r| > 0.95), capped at 8 (40 for "everything"). Bundles that end up with fewer
 * than two metrics are left out.
 */
export function buildBundles(source: BundleSource): Bundle[] {
  const ctx = new PickContext(source);
  const out: Bundle[] = [];
  for (const spec of SPECS) {
    // First coverage level that yields enough metrics; otherwise the level that yields the most
    // (ties keep the stricter level).
    let best: Bundle | null = null;
    for (const level of COVERAGE_LEVELS) {
      const minN = Math.ceil(level * source.entityCount);
      const cands = candidatesFor(spec, source, minN);
      const seeds =
        spec.seedWithOthers === true ? seedCandidates(out, cands) : [];
      const metricIds = pick(seeds, cands, spec, ctx);
      if (best == null || metricIds.length > best.metricIds.length) {
        best = {
          id: spec.id,
          label: spec.label,
          description: spec.description,
          metricIds,
          minCoverage: level,
          qualifying: cands.length,
        };
      }
      if (metricIds.length >= spec.minMetrics) break;
    }
    if (best != null && best.metricIds.length >= 2) out.push(best);
  }
  return out;
}

// Candidates for metrics already chosen by earlier bundles, interleaved bundle by bundle
// (1st of each, then 2nd of each…) so a capped "everything" still spans every theme.
function seedCandidates(
  bundles: readonly Bundle[],
  cands: readonly Candidate[]
): Candidate[] {
  const byId = new Map(cands.map((c) => [c.metric.id, c]));
  const out: Candidate[] = [];
  const longest = Math.max(0, ...bundles.map((b) => b.metricIds.length));
  for (let i = 0; i < longest; i++) {
    for (const b of bundles) {
      const c = byId.get(b.metricIds[i]);
      if (c != null) out.push(c);
    }
  }
  return out;
}

const bundleCache = new WeakMap<object, Bundle[]>();

/** buildBundles() memoised per dataset object (the catalog never changes during a session). */
export function bundlesFor(key: object, source: () => BundleSource): Bundle[] {
  let b = bundleCache.get(key);
  if (b == null) {
    b = buildBundles(source());
    bundleCache.set(key, b);
  }
  return b;
}
