// Adjustments that put money and totals on an even footing, each offered only where it makes
// sense for the statistic:
//
// - 'col' (cost of living): wages and incomes at the US-average price level (see costOfLiving.ts).
// - 'income' (share of income): household costs such as rent, home values, child care or
//   premiums divided by the place's median household income (GDP per person for countries), as
//   "% of income" or, for large amounts like homes, "years of income".
// - 'pc' (per 100K people): totals that mostly track population ("number of burglaries") per
//   100,000 residents.
//
// A page shows only the adjustments that apply to its statistics, and the choice lives in the
// URL as `adj`.

import {
  adjustForPrices,
  isIncomeLike,
  priceLevels,
  type PriceLevelSource,
} from './costOfLiving';
import { ACS, WORLD_BANK } from './external';
import type { EntityType, Metric, TopicFile } from './types';

export type AdjustmentId = 'col' | 'income' | 'pc';
export const ADJUSTMENT_IDS: AdjustmentId[] = ['col', 'income', 'pc'];

export const isAdjustmentId = (v: unknown): v is AdjustmentId =>
  ADJUSTMENT_IDS.includes(v as AdjustmentId);

/** URL value → adjustment, accepting the older `col=true` links. */
export function adjustmentParam(
  raw: Record<string, unknown>
): AdjustmentId | undefined {
  if (isAdjustmentId(raw.adj)) return raw.adj;
  if (raw.col === true || raw.col === 'true') return 'col';
  return undefined;
}

/** What an adjustment needs from a dataset. */
export interface AdjustContext extends PriceLevelSource {
  type: { id: EntityType };
  /** Metrics that mostly track population (datasetFacts().sizeDriven) */
  sizeDriven: ReadonlySet<number>;
}

/** Household costs a share of income makes sense for, by label (or topic slug). */
const HOUSEHOLD_COST =
  /\b(rents?|home values?|home prices?|house prices?|median price|mortgages?|property tax(es)?|child ?care|grocer(y|ies)|tuition|premiums?|insurance|debt|car prices?|utilit(y|ies)|electric(ity)? bills?|internet|monthly cost|annual cost|bills?)\b/i;
/** Money that is not a household cost, or is priced per unit, so dividing by income is meaningless. */
const NOT_HOUSEHOLD_COST =
  /(production|budget|expenditure|revenue|fund|contribution|payouts?|payments?|immigrant|taxpayer|excise|per (gallon|pack|acre|hour|kwh|unit|pound|lb|ounce|square)|\bacre\b|¢|employment|threshold|exemption|national|government|\bgov\b|public|external|\bimf\b|credit|total|long-term|short-term|nonguaranteed|billions?|millions?)/i;

const incomeMetricFor = (type: EntityType): number | null =>
  type === 'country'
    ? WORLD_BANK.gdpPerCapita
    : type === 'world-city'
      ? null
      : ACS.medianHouseholdIncome;

/** Money formats ($, €, …) keep their currency when divided per person. */
const isMoney = (m: Pick<Metric, 'fmt'>) => m.fmt?.startsWith('money') === true;

/** Times per year a cost is paid: rent and monthly bills 12, weekly costs 52, others once. */
function perYear(m: Pick<Metric, 'label' | 'unit' | 'topics'>): number {
  const text = `${m.label} ${m.unit ?? ''}`;
  if (/week/i.test(text)) return 52;
  if (/month|\brents?\b/i.test(text) || /\brent\b/.test(m.topics[0] ?? ''))
    return 12;
  return 1;
}

/** Whether `id` applies to metric `m` in this dataset. */
export function canAdjust(
  id: AdjustmentId,
  m: Metric,
  ctx: AdjustContext
): boolean {
  if (m.kind !== 'num' || m.meta === true) return false;
  if (id === 'col') return isIncomeLike(m) && priceLevels(ctx) != null;
  if (id === 'pc') return ctx.sizeDriven.has(m.id) && ctx.hasValues(-1);
  const income = incomeMetricFor(ctx.type.id);
  if (income == null || m.id === income || !ctx.hasValues(income)) return false;
  if (m.fmt?.startsWith('money') !== true || isIncomeLike(m)) return false;
  const text = `${m.label} ${m.unit ?? ''}`;
  if (NOT_HOUSEHOLD_COST.test(text)) return false;
  return (
    HOUSEHOLD_COST.test(m.label) ||
    HOUSEHOLD_COST.test((m.topics[0] ?? '').replace(/-/g, ' '))
  );
}

/** The adjustments that apply to at least one of `metrics`, in a fixed order. */
export function availableAdjustments(
  metrics: readonly Metric[],
  ctx: AdjustContext
): AdjustmentId[] {
  return ADJUSTMENT_IDS.filter((id) =>
    metrics.some((m) => canAdjust(id, m, ctx))
  );
}

/** Median of the finite values. */
function median(values: ArrayLike<number>): number {
  const xs: number[] = [];
  for (let i = 0; i < values.length; i++)
    if (Number.isFinite(values[i])) xs.push(values[i]);
  xs.sort((a, b) => a - b);
  return xs.length === 0 ? NaN : xs[Math.floor(xs.length / 2)];
}

/**
 * How a share-of-income result reads: "% of income" for most costs, "years of income" when the
 * cost is typically above 1.5 years (homes, debt). Decided from the dataset's default values so
 * every year and place of a metric reads the same way.
 */
function incomeMode(m: Metric, ctx: AdjustContext): 'percent' | 'years' {
  const income = incomeMetricFor(ctx.type.id);
  if (income == null) return 'percent';
  const v = ctx.numeric(m.id);
  const inc = ctx.numeric(income);
  const ratios = new Float64Array(v.length);
  const k = perYear(m);
  for (let i = 0; i < v.length; i++)
    ratios[i] = inc[i] > 0 ? (v[i] * k) / inc[i] : NaN;
  return median(ratios) >= 1.5 ? 'years' : 'percent';
}

/** Adjusts one column (aligned to entities) of metric `m`; returns it unchanged when `id` does not apply. */
export function adjustColumn(
  id: AdjustmentId,
  m: Metric,
  values: Float64Array,
  ctx: AdjustContext
): Float64Array {
  if (!canAdjust(id, m, ctx)) return values;
  if (id === 'col') {
    const p = priceLevels(ctx);
    return p == null ? values : adjustForPrices(values, p.levels);
  }
  const out = new Float64Array(values.length);
  if (id === 'pc') {
    const pop = ctx.numeric(-1);
    const per = isMoney(m) ? 1 : 100_000;
    for (let i = 0; i < values.length; i++)
      out[i] = pop[i] > 0 ? (values[i] / pop[i]) * per : NaN;
    return out;
  }
  const income = incomeMetricFor(ctx.type.id);
  const inc =
    income == null
      ? new Float64Array(values.length).fill(NaN)
      : ctx.numeric(income);
  const k = perYear(m);
  const scale = incomeMode(m, ctx) === 'years' ? 1 : 100;
  for (let i = 0; i < values.length; i++)
    out[i] = inc[i] > 0 ? ((values[i] * k) / inc[i]) * scale : NaN;
  return out;
}

/** The metric as it reads once adjusted: new label, format and unit. */
export function adjustedMetric(
  id: AdjustmentId,
  m: Metric,
  ctx: AdjustContext
): Metric {
  if (!canAdjust(id, m, ctx)) return m;
  if (id === 'col')
    return { ...m, label: `${m.label} (Cost-of-Living Adjusted)` };
  if (id === 'pc')
    return isMoney(m)
      ? { ...m, label: `${m.label} per Person` }
      : {
          ...m,
          label: `${m.label} per 100K People`,
          fmt: 'floatNumberTenths',
          unit: null,
        };
  const base = ctx.type.id === 'country' ? 'GDP per Person' : 'Median Income';
  return incomeMode(m, ctx) === 'years'
    ? {
        ...m,
        label: `${m.label} in Years of ${base}`,
        fmt: 'floatNumberTenths',
        unit: 'years',
      }
    : { ...m, label: `${m.label} as % of ${base}`, fmt: 'percAlt', unit: null };
}

/** The context adjustments read, from a dataset and its population-tracking metrics. */
export function adjustContext(
  data: PriceLevelSource & { type: { id: EntityType } },
  sizeDriven: ReadonlySet<number>
): AdjustContext {
  return {
    type: data.type,
    metrics: data.metrics,
    numeric: (id) => data.numeric(id),
    hasValues: (id) => data.hasValues(id),
    sizeDriven,
  };
}

/**
 * A view of `data` with adjustment `id` applied: `numeric()` returns adjusted columns and
 * `metric()`/`metrics` the relabelled metrics, so every chart, ranking and sentence built on the
 * dataset follows. Returns `data` itself when nothing applies.
 */
export function withAdjustment<
  T extends PriceLevelSource & {
    type: { id: EntityType };
    metric(id: number): Metric | undefined;
  },
>(data: T, id: AdjustmentId | undefined, sizeDriven: ReadonlySet<number>): T {
  const ctx = adjustContext(data, sizeDriven);
  if (id == null || !data.metrics.some((m) => canAdjust(id, m, ctx)))
    return data;
  const cols = new Map<number, Float64Array>();
  const metas = new Map<number, Metric>();
  const meta = (m: Metric) => {
    let a = metas.get(m.id);
    if (a == null) {
      a = adjustedMetric(id, m, ctx);
      metas.set(m.id, a);
    }
    return a;
  };
  const numeric = (mid: number): Float64Array => {
    const m = data.metric(mid);
    if (m == null || !canAdjust(id, m, ctx)) return data.numeric(mid);
    let c = cols.get(mid);
    if (c == null) {
      c = adjustColumn(id, m, data.numeric(mid), ctx);
      cols.set(mid, c);
    }
    return c;
  };
  const metrics = data.metrics.map(meta);
  const proxy: T = new Proxy(data, {
    get(target, prop) {
      if (prop === 'numeric') return numeric;
      if (prop === 'metrics') return metrics;
      if (prop === 'metric')
        return (mid: number) => {
          const m = target.metric(mid);
          return m == null ? m : meta(m);
        };
      const v: unknown = Reflect.get(target, prop);
      // Methods run with the proxy as `this`, so ones built on numeric() see adjusted values.
      return typeof v === 'function'
        ? (...args: unknown[]) =>
            (v as (...a: unknown[]) => unknown).apply(proxy, args)
        : v;
    },
  });
  return proxy;
}

/**
 * A copy of `topic` with adjustment `id` applied to every year of each metric it applies to.
 * Denominators (price levels, income, population) are the dataset's default year.
 */
export function adjustTopicFile(
  topic: TopicFile,
  id: AdjustmentId | undefined,
  metric: (mid: number) => Metric | undefined,
  ctx: AdjustContext,
  entityCount: number
): TopicFile {
  if (id == null) return topic;
  const series: TopicFile['series'] = { ...topic.series };
  for (const [mid, byYear] of Object.entries(topic.series)) {
    const m = metric(Number(mid));
    if (m == null || !canAdjust(id, m, ctx)) continue;
    const next: (typeof series)[string] = {};
    for (const [year, [idx, vals]] of Object.entries(byYear)) {
      const col = new Float64Array(entityCount).fill(NaN);
      idx.forEach((e, k) => {
        const v = vals[k];
        if (typeof v === 'number' && e < entityCount) col[e] = v;
      });
      const adj = adjustColumn(id, m, col, ctx);
      const keepIdx: number[] = [];
      const keepVals: number[] = [];
      idx.forEach((e) => {
        const v = adj[e];
        if (Number.isFinite(v)) {
          keepIdx.push(e);
          keepVals.push(v);
        }
      });
      next[year] = [keepIdx, keepVals];
    }
    series[mid] = next;
  }
  return { ...topic, series };
}
