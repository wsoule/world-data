import { describe, expect, test } from 'bun:test';

import {
  averagePercentile,
  coverageFloor,
  csvField,
  csvMetricHeaders,
  csvValue,
  formatTableSort,
  parseTableSort,
  standing,
  toCsv,
} from '../src/features/compare/insights/tableModel';

const N = NaN;

describe('csv', () => {
  test('quotes commas, quotes and newlines', () => {
    expect(csvField('Washington, D.C.')).toBe('"Washington, D.C."');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('a\nb')).toBe('"a\nb"');
  });

  test('neutralises formula-looking text but not negative numbers', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvField(-3.5)).toBe('-3.5');
  });

  test('writes missing values as empty fields', () => {
    expect(
      toCsv([
        ['Place', 'Value'],
        ['Utah', null],
        ['Ohio', NaN],
      ])
    ).toBe('Place,Value\r\nUtah,\r\nOhio,\r\n');
  });
});

describe('standing', () => {
  test('ranks and percentiles honour direction', () => {
    const s = standing([3, 1, 2, N], -1);
    expect([...s.rank]).toEqual([3, 1, 2, N]);
    expect(s.pct[1]).toBe(1);
    expect(s.count).toBe(3);
  });

  test('averages only the metrics a place has', () => {
    const a = standing([1, 2, 3], 1);
    const b = standing([N, 2, 3], 1);
    expect(averagePercentile([a, b], 0)).toEqual({ mean: 0, covered: 1 });
    expect(averagePercentile([a, b], 2)).toEqual({ mean: 1, covered: 2 });
  });

  test('gives no average below the coverage floor', () => {
    // Place 0 has one great value out of three; it must not top the table.
    const s = [
      standing([N, 1, 2], 1),
      standing([N, 1, 2], 1),
      standing([9, 1, 2], 1),
    ];
    const floor = coverageFloor(3, 0.5);
    expect(floor).toBe(2);
    const lone = averagePercentile(s, 0, floor);
    expect(Number.isNaN(lone.mean)).toBe(true);
    expect(lone.covered).toBe(1);
    expect(averagePercentile(s, 2, floor).mean).toBeCloseTo(5 / 6);
    expect(coverageFloor(4, 0)).toBe(1);
    expect(coverageFloor(4, 1)).toBe(4);
  });
});

describe('csv headers and values', () => {
  const m = (
    id: number,
    fullLabel: string,
    fmt: string | null,
    unit: string | null = null,
    year: number | null = null,
    pol: 1 | -1 | 0 = -1
  ) => ({ id, fullLabel, fmt, unit, year, pol });

  test('carry unit and year once and never repeat a unit in the label', () => {
    expect(
      csvMetricHeaders([
        m(1, 'Land Area (mi²)', 'numberWithCommas', 'mi²'),
        m(2, 'Population Growth Rate', 'perc'),
        m(
          3,
          'Median Household Income — Poorest States',
          'moneyWithCurrency',
          null,
          2023
        ),
        m(4, 'Violent Crime Rate', null, 'per 100k', 2024),
        m(5, 'Best Education Rank', 'ranking'),
      ])
    ).toEqual([
      'Land Area (mi²)',
      'Population Growth Rate (%)',
      'Median Household Income — Poorest States (USD, 2023)',
      'Violent Crime Rate (per 100k, 2024)',
      'Best Education Rank (1 = best)',
    ]);
  });

  test('say which end rank 1 is for best-first and worst-first ranks', () => {
    expect(
      csvMetricHeaders([
        m(24419, 'Best Education Rank', 'ranking', null, 2025, -1),
        m(24006, 'Healthcare Rank', 'ranking', null, 2025, 1),
      ])
    ).toEqual([
      'Best Education Rank (1 = best, 2025)',
      'Healthcare Rank (1 = worst, 2025)',
    ]);
  });

  test('are unique even when two metrics share a label', () => {
    const h = csvMetricHeaders([
      m(6647, 'Electoral Votes', null),
      m(22520, 'Electoral Votes', 'numberWithCommas'),
    ]);
    expect(new Set(h).size).toBe(2);
    expect(h[1]).toBe('Electoral Votes [id 22520]');
  });

  test('write fractions as the percentages the page shows', () => {
    expect(csvValue('perc', 0.08038)).toBe(8.038);
    expect(csvValue('percAlt', 8.1)).toBe(8.1);
    expect(csvValue(null, 562580000)).toBe(562580000);
    expect(csvValue('perc', NaN)).toBeNull();
  });
});

describe('table sort in the URL', () => {
  test('round-trips and leaves out the default', () => {
    expect(parseTableSort(undefined)).toEqual({ id: 'avg', desc: true });
    expect(parseTableSort('-m24419')).toEqual({ id: 'm24419', desc: true });
    expect(parseTableSort('place')).toEqual({ id: 'place', desc: false });
    expect(formatTableSort({ id: 'avg', desc: true })).toBeUndefined();
    expect(formatTableSort({ id: 'm-3', desc: true })).toBe('-m-3');
    expect(parseTableSort('-m-3')).toEqual({ id: 'm-3', desc: true });
  });
});
