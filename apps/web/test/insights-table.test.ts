import { describe, expect, test } from 'bun:test';

import {
  averagePercentile,
  csvField,
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
});
