import { describe, expect, test } from 'bun:test';

import {
  adjustColumn,
  type AdjustContext,
  adjustedMetric,
  adjustmentParam,
  availableAdjustments,
  canAdjust,
  withAdjustment,
} from '../src/data/adjustments';
import { ACS, RPP } from '../src/data/external';
import type { Metric } from '../src/data/types';

const metric = (
  id: number,
  label: string,
  opts: Partial<Metric> = {}
): Metric => ({
  id,
  key: `m${id}`,
  label,
  fmt: 'moneyWithCurrency',
  unit: null,
  kind: 'num',
  pol: -1,
  year: 2024,
  years: [2024],
  n: 2,
  topics: [`topic-${id}`],
  cats: [],
  updated: null,
  ...opts,
});

// Two states: a pricier, higher-income one and a cheaper one.
const metrics = [
  metric(1, 'Median Rent (Monthly, Capped at $3,501)'),
  metric(2, 'Median Home Value (Capped at $2M)'),
  metric(3, 'Regular Gas, Avg Price per Gallon'),
  metric(4, 'Total Burglaries', { fmt: 'numberWithCommas' }),
  metric(5, 'Average Salary', { pol: 1 }),
  metric(6, 'State Expenditures'),
  metric(-1, 'Population', { fmt: 'numberWithCommas', pol: 0 }),
  metric(ACS.medianHouseholdIncome, 'Median Household Income', { pol: 1 }),
  metric(RPP.allItems, 'Price Level', { fmt: 'floatNumberTenths' }),
];
const cols = new Map<number, Float64Array>([
  [1, Float64Array.from([2000, 1000])],
  [2, Float64Array.from([700_000, 250_000])],
  [3, Float64Array.from([4.5, 3])],
  [4, Float64Array.from([80_000, 10_000])],
  [5, Float64Array.from([110_000, 90_000])],
  [6, Float64Array.from([1e11, 1e10])],
  [-1, Float64Array.from([40_000_000, 4_000_000])],
  [ACS.medianHouseholdIncome, Float64Array.from([100_000, 60_000])],
  [RPP.allItems, Float64Array.from([110, 90])],
]);
const data = {
  type: { id: 'state' as const },
  metrics,
  numeric: (id: number) => cols.get(id) ?? new Float64Array(2).fill(NaN),
  hasValues: (id: number) => cols.has(id),
  metric: (id: number) => metrics.find((m) => m.id === id),
};
const ctx: AdjustContext = { ...data, sizeDriven: new Set([4]) };
const byId = (id: number) => metrics.find((m) => m.id === id) as Metric;

describe('which adjustments apply', () => {
  test('share of income: household costs only, never per-unit prices or budgets', () => {
    expect(canAdjust('income', byId(1), ctx)).toBe(true);
    expect(canAdjust('income', byId(2), ctx)).toBe(true);
    expect(canAdjust('income', byId(3), ctx)).toBe(false);
    expect(canAdjust('income', byId(6), ctx)).toBe(false);
    expect(canAdjust('income', byId(5), ctx)).toBe(false);
  });

  test('cost of living for wages, per person for population totals', () => {
    expect(canAdjust('col', byId(5), ctx)).toBe(true);
    expect(canAdjust('col', byId(1), ctx)).toBe(false);
    expect(canAdjust('pc', byId(4), ctx)).toBe(true);
    expect(canAdjust('pc', byId(5), ctx)).toBe(false);
  });

  test('a page offers only what applies to its statistics', () => {
    expect(availableAdjustments([byId(1)], ctx)).toEqual(['income']);
    expect(availableAdjustments([byId(3)], ctx)).toEqual([]);
    expect(availableAdjustments(metrics, ctx)).toEqual(['col', 'income', 'pc']);
  });
});

describe('adjusted values and labels', () => {
  test('rent becomes a yearly share of median income', () => {
    const v = adjustColumn('income', byId(1), cols.get(1) as Float64Array, ctx);
    expect(v[0]).toBeCloseTo(24, 5);
    expect(v[1]).toBeCloseTo(20, 5);
    const m = adjustedMetric('income', byId(1), ctx);
    expect(m.fmt).toBe('percAlt');
    expect(m.label).toContain('as % of Median Income');
  });

  test('home values read as years of income', () => {
    const v = adjustColumn('income', byId(2), cols.get(2) as Float64Array, ctx);
    expect(v[0]).toBeCloseTo(7, 5);
    expect(adjustedMetric('income', byId(2), ctx).label).toContain(
      'Years of Median Income'
    );
  });

  test('counts go per 100K people', () => {
    const v = adjustColumn('pc', byId(4), cols.get(4) as Float64Array, ctx);
    expect(v[0]).toBeCloseTo(200, 5);
    expect(v[1]).toBeCloseTo(250, 5);
  });

  test('the adjusted view relabels metrics and leaves others alone', () => {
    const view = withAdjustment(data, 'income', new Set([4]));
    expect(view.metric(1)?.fmt).toBe('percAlt');
    expect(view.numeric(3)).toBe(cols.get(3) as Float64Array);
    expect(withAdjustment(data, undefined, new Set())).toBe(data);
  });
});

test('older col=true links read as the cost-of-living adjustment', () => {
  expect(adjustmentParam({ col: 'true' })).toBe('col');
  expect(adjustmentParam({ adj: 'income' })).toBe('income');
  expect(adjustmentParam({ adj: 'nope' })).toBeUndefined();
});
