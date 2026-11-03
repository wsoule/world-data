// Cost-of-living adjustment: compares wages and incomes at equal buying power.
//
// $100,000 in a state with a price level (BEA Regional Price Parity) of 96 buys what $115,000
// does where it is 110, so an adjusted value is `value × 100 ÷ price level`: dollars at the
// US-average price level. Only income-like money metrics are adjusted. Prices, rents and taxes
// are left alone, since dividing a price by a price index would double-count.

import { RPP } from './external';
import type { Metric, TopicFile } from './types';

/** Label words that mark money a person earns or receives. */
const INCOME_LABEL =
  /\b(income|incomes|wages?|salary|salaries|earnings?|pay|paycheck|compensation|gdp|benefits?|pension|annual mean|hourly mean|annual median|hourly)\b/i;
/**
 * Label words that make a money metric something other than income: prices and costs, taxes,
 * government money, thresholds such as living wages (already a cost-of-living measure), and
 * figures that are already adjusted ("real").
 */
const NOT_INCOME_LABEL =
  /\b(tax|taxes|price|prices|cost|costs|rent|fee|fees|debt|spending|spent|expenditures?|budget|revenue|funding|loss|losses|damage|fine|bail|tuition|premium|deductible|real|livable|living|threshold|ratio|payouts?|payments?|employment|reimbursement)\b/i;
/** Topic slug words for pages of earnings, used when a column label is just "RN" or "Annual". */
const INCOME_TOPIC = new Set([
  'salary',
  'salaries',
  'wage',
  'wages',
  'income',
  'pay',
  'earnings',
  'paycheck',
]);
const NOT_INCOME_TOPIC = new Set([
  'cost',
  'costs',
  'price',
  'prices',
  'tax',
  'taxes',
  'rent',
  'fee',
  'fees',
  'tuition',
  'spending',
  'debt',
  'livable',
  'living',
  'inequality',
  'payouts',
  'payment',
]);

/** True for numeric money metrics that are earnings or income, which a price level can adjust. */
export function isIncomeLike(
  m: Pick<Metric, 'kind' | 'fmt' | 'label' | 'topics' | 'meta'>
): boolean {
  if (m.kind !== 'num' || m.meta === true) return false;
  if (m.fmt?.startsWith('money') !== true) return false;
  if (NOT_INCOME_LABEL.test(m.label)) return false;
  if (INCOME_LABEL.test(m.label)) return true;
  const words = (m.topics[0] ?? '').split('-');
  return (
    words.some((w) => INCOME_TOPIC.has(w)) &&
    !words.some((w) => NOT_INCOME_TOPIC.has(w))
  );
}

/** What the adjustment needs from a dataset: its metrics and numeric columns. */
export interface PriceLevelSource {
  metrics: readonly Metric[];
  numeric(id: number): Float64Array;
  hasValues(id: number): boolean;
}

/**
 * Each place's overall price level (US average = 100), aligned to the dataset's entities with
 * NaN where it is unknown, and the year it describes. Null for place types without one.
 */
export function priceLevels(
  data: PriceLevelSource
): { levels: Float64Array; year: number | null } | null {
  if (!data.hasValues(RPP.allItems)) return null;
  const meta = data.metrics.find((m) => m.id === RPP.allItems);
  return { levels: data.numeric(RPP.allItems), year: meta?.year ?? null };
}

/** `values` at the US-average price level: value × 100 ÷ price level (NaN where unknown). */
export function adjustForPrices(
  values: Float64Array,
  levels: Float64Array
): Float64Array {
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const p = levels[i];
    out[i] = p > 0 ? (values[i] * 100) / p : Number.NaN;
  }
  return out;
}

/**
 * A view of `data` whose income-like columns are cost-of-living adjusted, so any code that
 * ranks or compares through `numeric()` (head-to-head winners, standings, percentiles) sees
 * buying power instead of nominal dollars. Returns `data` itself when it has no price levels.
 */
export function withCostAdjustment<T extends PriceLevelSource>(data: T): T {
  const p = priceLevels(data);
  if (p == null) return data;
  const income = new Set(
    data.metrics.filter((m) => isIncomeLike(m)).map((m) => m.id)
  );
  const cache = new Map<number, Float64Array>();
  const numeric = (id: number): Float64Array => {
    if (!income.has(id)) return data.numeric(id);
    let col = cache.get(id);
    if (col == null) {
      col = adjustForPrices(data.numeric(id), p.levels);
      cache.set(id, col);
    }
    return col;
  };
  const proxy: T = new Proxy(data, {
    get(target, prop) {
      if (prop === 'numeric') return numeric;
      const v: unknown = Reflect.get(target, prop);
      // Methods run with the proxy as `this`, so ones built on numeric() (Dataset.value) see the
      // adjusted columns too. (Dataset has no #private fields, which a proxy could not reach.)
      return typeof v === 'function'
        ? (...args: unknown[]) =>
            (v as (...a: unknown[]) => unknown).apply(proxy, args)
        : v;
    },
  });
  return proxy;
}

/**
 * A copy of `topic` whose income-like series (every year) are at the US-average price level,
 * using one price level per place (`levels`, aligned to entities). Places without a price level
 * drop out of those series. Other metrics are shared with the original, untouched.
 */
export function adjustTopic(
  topic: TopicFile,
  metric: (id: number) => Metric | undefined,
  levels: Float64Array
): TopicFile {
  const series: TopicFile['series'] = { ...topic.series };
  for (const [id, byYear] of Object.entries(topic.series)) {
    const m = metric(Number(id));
    if (m == null || !isIncomeLike(m)) continue;
    const next: (typeof series)[string] = {};
    for (const [year, [idx, vals]] of Object.entries(byYear)) {
      const keepIdx: number[] = [];
      const keepVals: (number | string)[] = [];
      idx.forEach((e, k) => {
        const v = vals[k];
        const p = levels[e];
        if (typeof v === 'number' && p > 0) {
          keepIdx.push(e);
          keepVals.push((v * 100) / p);
        }
      });
      next[year] = [keepIdx, keepVals];
    }
    series[id] = next;
  }
  return { ...topic, series };
}
