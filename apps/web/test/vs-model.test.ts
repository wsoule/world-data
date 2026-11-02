import { describe, expect, test } from 'bun:test';

import type { Metric } from '../src/data/types';
import type { ProfileData } from '../src/features/places/profileModel';
import {
  bestIndex,
  biggestDifferences,
  categoryLeads,
  scoreboard,
  sharedMetrics,
} from '../src/features/vs/versusModel';

const metric = (
  id: number,
  label: string,
  pol: Metric['pol'],
  cats: string[]
): Metric => ({
  id,
  key: `m${id}`,
  label,
  fmt: null,
  unit: null,
  kind: 'num',
  pol,
  year: null,
  years: [],
  n: 4,
  topics: [`topic-${id}`],
  cats,
  updated: null,
});

const NaN_ = Number.NaN;
const columns: [Metric, number[]][] = [
  [metric(1, 'Income', 1, ['economics']), [90, 50, 70, 10]],
  [metric(2, 'Income', 1, ['economics']), [90, 50, 70, 10]],
  [metric(3, 'Poverty', -1, ['economics']), [10, 20, 5, 30]],
  [metric(4, 'Jobs', 1, ['economics']), [3, 3, 1, 2]],
  [metric(5, 'Crime', -1, ['crime-safety']), [1, 9, 5, 5]],
  [metric(6, 'Area', 0, ['geography']), [5, 1, 2, 3]],
  [metric(7, 'Sparse', 1, ['economics']), [1, NaN_, 2, 3]],
];
const byId = new Map(columns.map(([m, v]) => [m.id, Float64Array.from(v)]));
const data: ProfileData = {
  entities: ['a', 'b', 'c', 'd'].map((n) => ({ id: n, name: n })),
  metrics: columns.map(([m]) => m),
  numeric: (id) => byId.get(id) ?? new Float64Array(4).fill(NaN_),
  hasValues: (id) => byId.has(id),
};

describe('bestIndex', () => {
  test('respects direction and reports ties as null', () => {
    expect(bestIndex([1, 3, 2], 1)).toBe(1);
    expect(bestIndex([1, 3, 2], -1)).toBe(0);
    expect(bestIndex([3, 3, 2], 1)).toBeNull();
    expect(bestIndex([3, 1, 1], -1)).toBeNull();
  });
});

describe('sharedMetrics', () => {
  const shared = sharedMetrics(data, [0, 1]);

  test('keeps metrics both places have, once per distinct fact', () => {
    expect(shared.map((s) => s.metric.id).sort((a, b) => a - b)).toEqual([
      1, 3, 4, 5, 6,
    ]);
  });

  test('records values, winner and percentile spread', () => {
    const poverty = shared.find((s) => s.metric.id === 3);
    expect(poverty?.values).toEqual([10, 20]);
    expect(poverty?.winner).toBe(0);
    expect(poverty?.spread).toBeCloseTo(1 / 3, 12);
    expect(shared.find((s) => s.metric.id === 4)?.winner).toBeNull();
    expect(shared.find((s) => s.metric.id === 6)?.winner).toBeNull();
  });

  test('scoreboard counts wins over directional metrics only', () => {
    expect(scoreboard(shared, 2)).toEqual({ wins: [3, 0], ties: 1, total: 4 });
  });
});

describe('categoryLeads', () => {
  test('averages percentiles per category and names the leader', () => {
    const shared = sharedMetrics(data, [0, 2]);
    const leads = categoryLeads(shared, 2, { minMetrics: 3 });
    expect(leads).toHaveLength(1);
    expect(leads[0].category).toBe('economics');
    expect(leads[0].count).toBe(4);
    expect(leads[0].leader).toBe(0);
    expect(leads[0].means[0]).toBeGreaterThan(leads[0].means[1]);
  });

  test('a dead heat has no leader', () => {
    const shared = sharedMetrics(data, [2, 3]).filter((s) => s.metric.id === 5);
    const [lead] = categoryLeads(shared, 2, { minMetrics: 1 });
    expect(lead.leader).toBeNull();
  });
});

describe('biggestDifferences', () => {
  const shared = sharedMetrics(data, [0, 1]);

  test('orders directional metrics by spread and honours the category filter', () => {
    expect(biggestDifferences(shared).map((s) => s.metric.id)).toEqual([
      5, 1, 3, 4,
    ]);
    expect(
      biggestDifferences(shared, { category: 'crime-safety' }).map(
        (s) => s.metric.id
      )
    ).toEqual([5]);
    expect(biggestDifferences(shared, { limit: 1 })).toHaveLength(1);
  });

  test('drops rankings with too little coverage', () => {
    expect(biggestDifferences(shared, { minN: 5 })).toEqual([]);
  });
});
