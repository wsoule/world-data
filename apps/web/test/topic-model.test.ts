import { describe, expect, test } from 'bun:test';

import type { Metric, TopicFile } from '../src/data/types';
import {
  biggestChanges,
  comparedYears,
  directionOf,
  displayTables,
  focusableMetrics,
  hasUndated,
  isSkewed,
  LATEST,
  logTicks,
  median,
  numericColumn,
  rankColumn,
  rankEntries,
  rankWindow,
  rawColumn,
  resolveYear,
  seriesYears,
  splitList,
  tableYear,
  trendPicks,
  trendPoints,
  valueCounts,
  yearParam,
} from '../src/features/topic/model';

const topic: TopicFile = {
  slug: 't',
  type: 'state',
  title: 'Test topic',
  cats: [],
  updated: null,
  url: 'https://example.com',
  sources: [],
  related: [],
  tables: [
    { name: 'Main', metrics: [1, 2] },
    { name: 'Extra', metrics: [3, 99] },
  ],
  metrics: [1, 2, 3, 4],
  entities: [0, 1, 2, 3],
  series: {
    '1': {
      '2022': [
        [0, 1, 2],
        [10, 20, 30],
      ],
      '2023': [
        [0, 1, 2, 3],
        [12, 18, 33, 5],
      ],
      '2024': [
        [1, 3],
        [25, 6],
      ],
    },
    '2': {
      _: [
        [0, 2],
        ['Yes', 'No'],
      ],
    },
    '3': {
      '2023': [
        [0, 1],
        [1, 2],
      ],
    },
    '4': {
      _: [
        [0, 1, 2],
        ['A | B', 'B', 'C | B | A'],
      ],
    },
    // Dated years plus an undated "current" column that covers more places.
    '5': {
      '2022': [[0], [1]],
      '2023': [
        [0, 1],
        [2, 3],
      ],
      _: [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
      ],
    },
  },
};

const metric = (
  id: number,
  kind: Metric['kind'],
  extra: Partial<Metric> = {}
): Metric => ({
  id,
  key: `m${id}`,
  label: `Metric ${id}`,
  fmt: null,
  unit: null,
  kind,
  pol: 1,
  year: null,
  years: [],
  n: 4,
  topics: ['t'],
  cats: [],
  updated: null,
  ...extra,
});

describe('years', () => {
  test('lists years oldest first and ignores the undated key', () => {
    expect(seriesYears(topic, 1)).toEqual([2022, 2023, 2024]);
    expect(seriesYears(topic, 2)).toEqual([]);
    expect(seriesYears(topic, 404)).toEqual([]);
  });

  test('prefers the requested year, then the default, then the latest', () => {
    expect(resolveYear([2022, 2023, 2024], 2022, 2023)).toBe(2022);
    expect(resolveYear([2022, 2023, 2024], 1999, 2023)).toBe(2023);
    expect(resolveYear([2022, 2023, 2024], undefined, null)).toBe(2024);
    expect(resolveYear([], 2022, 2023)).toBeNull();
  });

  test('defaults to the undated series when the metric has no default year', () => {
    const years = seriesYears(topic, 5);
    expect(years).toEqual([2022, 2023]);
    expect(hasUndated(topic, 5)).toBe(true);
    expect(hasUndated(topic, 1)).toBe(false);
    // Undated default: the "_" column, not the latest (sparser) year.
    expect(resolveYear(years, undefined, null, true)).toBeNull();
    // A dated year still wins when asked for, or when it is the default.
    expect(resolveYear(years, 2022, null, true)).toBe(2022);
    expect(resolveYear(years, undefined, 2023, true)).toBe(2023);
    // "Latest" picks the undated column even when the default is dated.
    expect(resolveYear(years, LATEST, 2023, true)).toBeNull();
    // ...and is ignored without one.
    expect(resolveYear([2022, 2023, 2024], LATEST, null)).toBe(2024);
    expect(numericColumn(topic, 5, null, 4)).toEqual(
      new Float64Array([4, 5, 6, 7])
    );
  });

  test('writes only non-default years to the URL', () => {
    expect(yearParam(null, null)).toBeUndefined();
    expect(yearParam(2022, null)).toBe(2022);
    expect(yearParam(null, 2023)).toBe(LATEST);
    expect(yearParam(2023, 2023)).toBeUndefined();
  });

  test('tables follow the selected year only where a metric has it', () => {
    expect(tableYear(topic, metric(3, 'num'), 2023)).toBe(2023);
    expect(tableYear(topic, metric(3, 'num'), 2024)).toBe(2023);
    expect(tableYear(topic, metric(1, 'num', { year: 2023 }), null)).toBe(2023);
    expect(tableYear(topic, metric(1, 'num'), undefined)).toBe(2024);
  });

  test('tables follow an undated page year where a metric has one', () => {
    expect(tableYear(topic, metric(5, 'num', { year: 2023 }), null)).toBeNull();
    // Without a page year each column shows its own default.
    expect(tableYear(topic, metric(5, 'num', { year: 2023 }), undefined)).toBe(
      2023
    );
    expect(tableYear(topic, metric(5, 'num'), undefined)).toBeNull();
    expect(tableYear(topic, metric(5, 'num'), 2022)).toBe(2022);
  });
});

describe('columns', () => {
  test('aligns a year of values to entities with NaN for missing', () => {
    expect(Array.from(numericColumn(topic, 1, 2024, 5))).toEqual([
      NaN,
      25,
      NaN,
      6,
      NaN,
    ]);
  });

  test('falls back to the undated series and keeps text', () => {
    expect(rawColumn(topic, 2, 2023, 4)).toEqual(['Yes', null, 'No', null]);
    expect(Array.from(numericColumn(topic, 2, null, 3))).toEqual([
      NaN,
      NaN,
      NaN,
    ]);
  });
});

describe('tables', () => {
  test('drops unknown ids and gathers unlisted metrics into "More data"', () => {
    const known = (id: number) => id !== 99;
    expect(displayTables(topic, known)).toEqual([
      { name: 'Main', metrics: [1, 2] },
      { name: 'Extra', metrics: [3] },
      { name: 'More data', metrics: [4] },
    ]);
  });

  test('uses one "All data" table when the source has none', () => {
    expect(displayTables({ ...topic, tables: [] }, () => true)).toEqual([
      { name: 'All data', metrics: [1, 2, 3, 4] },
    ]);
  });

  test('focus choices are numeric, non-meta metrics in table order', () => {
    const metrics = new Map([
      [1, metric(1, 'num')],
      [2, metric(2, 'cat')],
      [3, metric(3, 'num', { meta: true })],
      [4, metric(4, 'num')],
    ]);
    const tables = displayTables(topic, (id) => metrics.has(id));
    expect(
      focusableMetrics(tables, (id) => metrics.get(id)).map((m) => m.id)
    ).toEqual([1, 4]);
  });
});

describe('ranking', () => {
  const values = [5, NaN, 9, 5, 1];

  test('uses competition ranks in the metric direction', () => {
    expect(rankEntries(values, 1)).toEqual([
      { index: 2, value: 9, rank: 1 },
      { index: 0, value: 5, rank: 2 },
      { index: 3, value: 5, rank: 2 },
      { index: 4, value: 1, rank: 4 },
    ]);
    expect(Array.from(rankColumn(values, -1))).toEqual([2, NaN, 4, 2, 1]);
    expect(directionOf({ pol: -1 })).toBe(-1);
    expect(directionOf({ pol: 0 })).toBe(1);
  });

  test('windows long rankings into a head and a tail', () => {
    const entries = rankEntries(
      Array.from({ length: 30 }, (_, i) => i),
      1
    );
    const w = rankWindow(entries);
    expect(w.gap).toBe(true);
    expect(w.head).toHaveLength(15);
    expect(w.tail.map((e) => e.rank)).toEqual([26, 27, 28, 29, 30]);
    expect(rankWindow(entries.slice(0, 20)).gap).toBe(false);
  });
});

describe('trend and counts', () => {
  test('medians by year plus a line per place with gaps', () => {
    const pts = trendPoints(
      topic,
      1,
      [2022, 2023, 2024],
      [{ index: 0, name: 'Zero' }],
      4
    );
    expect(
      pts.filter((p) => p.series === 'Median').map((p) => p.value)
    ).toEqual([20, 15, 15.5]);
    expect(pts.filter((p) => p.series === 'Zero').map((p) => p.value)).toEqual([
      10,
      12,
      null,
    ]);
  });

  test('trend places keep their slot whatever is selected', () => {
    const ranked = rankEntries([50, 40, 30, 20, 10, 5], 1);
    const slots = (sel: number | null) =>
      trendPicks(ranked, sel, 3).map((p) => [p.index, p.slot, p.selected]);
    expect(slots(null)).toEqual([
      [0, 0, false],
      [1, 1, false],
      [2, 2, false],
    ]);
    // A top place is highlighted in place; the others keep their slots.
    expect(slots(1)).toEqual([
      [0, 0, false],
      [1, 1, true],
      [2, 2, false],
    ]);
    // A place outside the top is appended, so the top stays complete.
    expect(slots(5)).toEqual([
      [0, 0, false],
      [1, 1, false],
      [2, 2, false],
      [5, -1, true],
    ]);
  });

  test('median ignores missing values', () => {
    expect(median([3, NaN, 1, 2])).toBe(2);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  test('counts pipe-list items once per place', () => {
    expect(splitList('A | B |')).toEqual(['A', 'B']);
    expect(
      valueCounts(rawColumn(topic, 4, null, 4)).map((c) => [c.value, c.count])
    ).toEqual([
      ['B', 3],
      ['A', 2],
      ['C', 1],
    ]);
  });
});

describe('changes between years', () => {
  test('splits gains and losses by the metric direction', () => {
    const from = [10, 20, 30, NaN, 5];
    const to = [15, 18, 30, 7, 1];
    const up = biggestChanges(from, to, 1);
    expect(up.compared).toBe(4);
    expect(up.gains.map((c) => c.index)).toEqual([0]);
    expect(up.losses.map((c) => [c.index, c.delta])).toEqual([
      [4, -4],
      [1, -2],
    ]);
    // For a lower-is-better metric (e.g. a rank) falling values are gains.
    const down = biggestChanges(from, to, -1, 1);
    expect(down.gains.map((c) => c.index)).toEqual([4]);
    expect(down.losses.map((c) => c.index)).toEqual([0]);
  });

  test('compares the previous year into the selected one', () => {
    expect(comparedYears([2022, 2023, 2024], 2024)).toEqual([2023, 2024]);
    expect(comparedYears([2022, 2023, 2024], 2022)).toEqual([2022, 2023]);
    expect(comparedYears([2024], 2024)).toBeNull();
    expect(comparedYears([2022, 2023], null)).toBeNull();
  });
});

describe('log axis', () => {
  test('detects skewed positive distributions only', () => {
    expect(isSkewed({ min: 384, median: 9677, max: 226809 })).toBe(true);
    expect(isSkewed({ min: 48905, median: 55061, max: 105496 })).toBe(false);
    expect(isSkewed({ min: -1, median: 10, max: 1000 })).toBe(false);
  });

  test('picks round ticks inside the range', () => {
    expect(logTicks(300, 230000)).toEqual([1000, 10000, 100000]);
    expect(logTicks(3, 60)).toEqual([5, 10, 20, 50]);
    expect(logTicks(0, 10)).toEqual([]);
  });
});
