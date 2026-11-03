import type { Normalization } from '@world-data/stats';

import { type BundleId, isBundleId } from './ranking/bundles';
import type { Dataset } from '~/data/dataset';
import { type EntityType, isEntityType, type Metric } from '~/data/types';

export const COMPARE_VIEWS = [
  'scatter',
  'ranking',
  'matrix',
  'parallel',
  'table',
  'map',
] as const;
export type CompareView = (typeof COMPARE_VIEWS)[number];

/**
 * URL state of the compare workbench (/compare). Everything that defines a comparison lives here so
 * any view can be shared as a link.
 */
export interface CompareSearch {
  type: EntityType;
  /** Metric basket, in order */
  m: number[];
  view: CompareView;
  /** Scatter encodings: x, y, radius metric ids */
  x?: number;
  y?: number;
  r?: number;
  /** Scatter colour: 'group' (continent / region) or a metric id */
  c?: 'group' | number;
  /** Log scale toggles for scatter axes */
  log?: ('x' | 'y')[];
  /** Composite weights by metric id (default 1) */
  w?: Record<string, number>;
  /** Direction overrides by metric id: 1 = higher is better, -1 = lower is better */
  d?: Record<string, 1 | -1>;
  /** Highlighted entity ids */
  hl?: string[];
  /** Restrict to these entity groups (continents / census regions) */
  g?: string[];
  /** Composite normalization method */
  norm?: Normalization;
  /** Composite minimum coverage (0–1 of total weight) */
  cov?: number;
  /** Map / ranking focus metric */
  f?: number;
  /**
   * Overlay axis flips by metric id: true draws a lower-is-better metric so
   * the best value sits right / up. Unset means the default (ranks flipped).
   */
  fl?: Record<string, boolean>;
  /**
   * Table sort: a column id ("avg", "place", "group" or "m<metric id>"), with a leading "-" for
   * descending. Unset means the default, average percentile descending.
   */
  ts?: string;
  /**
   * A ranking bundle to load into an empty basket, for links that cannot know metric ids (the
   * search palette's goal ideas). The page swaps it for the bundle's metrics on arrival.
   */
  bundle?: BundleId;
}

/**
 * How a URL change lands in the browser history. Discrete choices (a view tab, adding or removing
 * a metric, a highlight, an axis) push an entry so Back undoes them; continuous inputs (sliders,
 * typing) and automatic URL normalisation replace the current entry so Back is not flooded.
 */
export interface UpdateOptions {
  replace?: boolean;
}

const NORMS: Normalization[] = ['percentile', 'zscore', 'minmax'];

const numArray = (v: unknown): number[] =>
  Array.isArray(v)
    ? v.map(Number).filter((n) => Number.isFinite(n))
    : typeof v === 'number'
      ? [v]
      : typeof v === 'string'
        ? v
            .split(',')
            .map(Number)
            .filter((n) => Number.isFinite(n))
        : [];
const strArray = (v: unknown): string[] | undefined =>
  Array.isArray(v)
    ? v.map(String)
    : typeof v === 'string' && v !== ''
      ? v.split(',')
      : undefined;
const optNum = (v: unknown): number | undefined =>
  v === undefined || v === null || v === ''
    ? undefined
    : Number.isFinite(Number(v))
      ? Number(v)
      : undefined;
const record = <T>(
  v: unknown,
  f: (x: unknown) => T | undefined
): Record<string, T> | undefined => {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, T> = {};
  for (const [k, val] of Object.entries(v)) {
    const p = f(val);
    if (p !== undefined) out[k] = p;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

export function validateCompareSearch(
  raw: Record<string, unknown>
): CompareSearch {
  const view = COMPARE_VIEWS.includes(raw.view as CompareView)
    ? (raw.view as CompareView)
    : 'scatter';
  const c = raw.c === 'group' ? 'group' : optNum(raw.c);
  const log = strArray(raw.log)?.filter(
    (a): a is 'x' | 'y' => a === 'x' || a === 'y'
  );
  return {
    type: isEntityType(raw.type) ? raw.type : 'state',
    m: [...new Set(numArray(raw.m))],
    view,
    x: optNum(raw.x),
    y: optNum(raw.y),
    r: optNum(raw.r),
    c,
    log: log != null && log.length > 0 ? log : undefined,
    w: record(raw.w, (x) =>
      Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : undefined
    ),
    d: record(raw.d, (x) =>
      Number(x) === -1 ? -1 : Number(x) === 1 ? 1 : undefined
    ),
    hl: strArray(raw.hl),
    g: strArray(raw.g),
    // 'rank' was an alias of percentile; old links still resolve.
    norm:
      raw.norm === 'rank'
        ? 'percentile'
        : NORMS.includes(raw.norm as Normalization)
          ? (raw.norm as Normalization)
          : undefined,
    cov:
      optNum(raw.cov) !== undefined
        ? Math.min(1, Math.max(0, Number(raw.cov)))
        : undefined,
    f: optNum(raw.f),
    fl: record(raw.fl, (x) => (typeof x === 'boolean' ? x : undefined)),
    ts: typeof raw.ts === 'string' && raw.ts !== '' ? raw.ts : undefined,
    bundle: isBundleId(raw.bundle) ? raw.bundle : undefined,
  };
}

/** Props every compare view receives. */
export interface CompareViewProps {
  dataset: Dataset;
  search: CompareSearch;
  /** Basket metrics resolved against the dataset (unknown ids dropped), in basket order */
  metrics: Metric[];
  /** Entity indexes passing the group filter */
  entityIdx: number[];
  /** Effective direction for a metric: URL override, else metric polarity, else 1 */
  direction: (id: number) => 1 | -1;
  /** Effective weight for a metric (default 1) */
  weight: (id: number) => number;
  /** Patch the URL state (merged). Pushes a history entry unless `options.replace` is set. */
  update: (
    patch:
      | Partial<CompareSearch>
      | ((s: CompareSearch) => Partial<CompareSearch>),
    options?: UpdateOptions
  ) => void;
  addMetric: (id: number) => void;
  removeMetric: (id: number) => void;
}

export function effectiveDirection(
  search: CompareSearch,
  metric: Metric | undefined
): 1 | -1 {
  if (metric == null) return 1;
  const o = search.d?.[String(metric.id)];
  if (o != null) return o;
  return metric.pol === -1 ? -1 : 1;
}

/**
 * Direction overrides after one click on a metric's direction button. Metrics with a natural
 * direction toggle between higher and lower is better, keeping an override only when it differs
 * from the catalog. Neutral metrics (population, area…) cycle through no side → higher is
 * better → lower is better → no side, so a reader can always return to "neither".
 */
export function cycleDirection(
  d: CompareSearch['d'],
  metric: Metric
): CompareSearch['d'] {
  const key = String(metric.id);
  const cur = d?.[key];
  const next = { ...d };
  if (metric.pol === 0) {
    if (cur == null) next[key] = 1;
    else if (cur === 1) next[key] = -1;
    else delete next[key];
  } else {
    const flipped = (cur ?? metric.pol) === 1 ? -1 : 1;
    if (flipped === metric.pol) delete next[key];
    else next[key] = flipped;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function effectiveWeight(search: CompareSearch, id: number): number {
  return search.w?.[String(id)] ?? 1;
}

/** Entity indexes that pass the group filter. */
export function filteredEntities(
  dataset: Dataset,
  search: CompareSearch
): number[] {
  const groups =
    search.g != null && search.g.length > 0 ? new Set(search.g) : null;
  const out: number[] = [];
  dataset.entities.forEach((e, i) => {
    if (groups == null || (e.group != null && groups.has(e.group))) out.push(i);
  });
  return out;
}

/** Preset comparisons shown on the home page and in empty states. */
export interface ComparePreset {
  title: string;
  description: string;
  search: Partial<CompareSearch> & { type: EntityType };
  /** labels used to find metric ids at runtime when ids are unknown */
}
