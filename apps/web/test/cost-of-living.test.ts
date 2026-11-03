import { describe, expect, test } from 'bun:test';

import {
  adjustForPrices,
  adjustTopic,
  isIncomeLike,
  withCostAdjustment,
} from '../src/data/costOfLiving';
import { RPP } from '../src/data/external';
import type { Metric } from '../src/data/types';
import { sharedMetrics } from '../src/features/vs/versusModel';

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
  pol: 1,
  year: 2024,
  years: [2024],
  n: 2,
  topics: [`topic-${id}`],
  cats: ['economics'],
  updated: null,
  ...opts,
});

describe('isIncomeLike', () => {
  test('wages, salaries and incomes are adjustable', () => {
    for (const label of [
      'Median Household Income',
      'Annual Mean Wage',
      'Average Teacher Salary',
      'Hourly Minimum Wage',
      'GDP per Capita',
    ])
      expect(isIncomeLike(metric(1, label))).toBe(true);
  });

  test('prices, taxes, living wages and real figures are not', () => {
    for (const label of [
      'Median Home Value',
      'Median Price: Single Family Homes',
      'Highest Income Tax Bracket',
      'Livable Annual Wage w/ 1 Child',
      'Real Personal Income per Person (2017 Dollars)',
      'Avg Median Down Payment for House',
    ])
      expect(isIncomeLike(metric(1, label))).toBe(false);
  });

  test('a bare column label counts when its topic is about pay', () => {
    expect(
      isIncomeLike(metric(1, 'RN', { topics: ['nursing-pay-by-state'] }))
    ).toBe(true);
    expect(
      isIncomeLike(
        metric(1, 'Annual', { topics: ['average-down-payment-by-state'] })
      )
    ).toBe(false);
  });

  test('only numeric money metrics qualify', () => {
    expect(isIncomeLike(metric(1, 'Income Rank', { fmt: 'ranking' }))).toBe(
      false
    );
    expect(isIncomeLike(metric(1, 'Median Income', { kind: 'cat' }))).toBe(
      false
    );
  });
});

describe('adjustForPrices', () => {
  test('converts to dollars at the US-average price level', () => {
    const out = adjustForPrices(
      Float64Array.from([100_000, 100_000, 50]),
      Float64Array.from([96, 110, Number.NaN])
    );
    expect(out[0]).toBeCloseTo(104_166.67, 1);
    expect(out[1]).toBeCloseTo(90_909.09, 1);
    expect(out[2]).toBeNaN();
  });
});

describe('withCostAdjustment', () => {
  // Michigan-like (cheap) and California-like (expensive) places.
  const metrics = [
    metric(1, 'Average Salary'),
    metric(2, 'Median Home Value', { pol: -1 }),
    metric(RPP.allItems, 'Price Level (All Items)', {
      fmt: 'floatNumberTenths',
      pol: -1,
    }),
  ];
  const cols = new Map<number, Float64Array>([
    [1, Float64Array.from([60_000, 66_000])],
    [2, Float64Array.from([200_000, 700_000])],
    [RPP.allItems, Float64Array.from([96, 110])],
  ]);
  const data = {
    entities: [
      { id: 'MI', name: 'Michigan' },
      { id: 'CA', name: 'California' },
    ],
    metrics,
    numeric: (id: number) => cols.get(id) ?? new Float64Array(2).fill(NaN),
    hasValues: (id: number) => cols.has(id),
  };

  test('flips a head-to-head win on a salary that buys less where prices are higher', () => {
    const nominal = sharedMetrics(data, [0, 1]).find((s) => s.metric.id === 1);
    expect(nominal?.winner).toBe(1);
    const real = sharedMetrics(withCostAdjustment(data), [0, 1]).find(
      (s) => s.metric.id === 1
    );
    expect(real?.winner).toBe(0);
    expect(real?.values[0]).toBeCloseTo(62_500, 5);
  });

  test('leaves prices untouched and passes other members through', () => {
    const adjusted = withCostAdjustment(data);
    expect(adjusted.numeric(2)).toBe(data.numeric(2));
    expect(adjusted.entities).toBe(data.entities);
    expect(adjusted.hasValues(1)).toBe(true);
  });

  test('methods built on numeric() see adjusted values too', () => {
    const withValue = {
      ...data,
      value(this: typeof data, id: number, i: number) {
        return this.numeric(id)[i];
      },
    };
    const adjusted = withCostAdjustment(withValue);
    expect(adjusted.value(1, 0)).toBeCloseTo(62_500, 5);
  });

  test('is a no-op for place types without price levels', () => {
    const noPrices = {
      ...data,
      hasValues: (id: number) => id !== RPP.allItems,
    };
    expect(withCostAdjustment(noPrices)).toBe(noPrices);
  });
});

describe('adjustTopic', () => {
  test('adjusts income series in every year and leaves the rest alone', () => {
    const metrics = new Map([
      [1, metric(1, 'Average Salary')],
      [2, metric(2, 'Median Home Value')],
    ]);
    const topic = {
      series: {
        '1': {
          '2023': [
            [0, 1, 2],
            [96, 110, 50],
          ],
          '2024': [[1], [220]],
        },
        '2': { '2024': [[0], [300_000]] },
      },
    } as unknown as Parameters<typeof adjustTopic>[0];
    const out = adjustTopic(
      topic,
      (id) => metrics.get(id),
      Float64Array.from([96, 110, Number.NaN])
    );
    expect(out.series['1']['2023']).toEqual([
      [0, 1],
      [100, 100],
    ]);
    expect(out.series['1']['2024']).toEqual([[1], [200]]);
    expect(out.series['2']).toBe(topic.series['2']);
    expect(topic.series['1']['2023'][1]).toEqual([96, 110, 50]);
  });
});
