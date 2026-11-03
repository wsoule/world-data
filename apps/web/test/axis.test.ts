import { describe, expect, test } from 'bun:test';

import {
  axisBounds,
  axisTickFormat,
  barAxisDomain,
  finiteExtent,
  linearAxisDomain,
} from '../src/lib/axis';

describe('finiteExtent', () => {
  test('skips missing and infinite values', () => {
    expect(finiteExtent([NaN, 3, null, -1, Infinity])).toEqual([-1, 3]);
    expect(finiteExtent([NaN, null])).toBeNull();
  });
});

describe('barAxisDomain', () => {
  test('starts positive bars exactly at zero', () => {
    expect(barAxisDomain(36_000, 83_730)).toEqual([0, 100_000]);
    expect(barAxisDomain(0, 0)).toEqual([0, 1]);
  });

  test('covers bars on both sides of zero', () => {
    expect(barAxisDomain(-3, 5)).toEqual([-4, 6]);
  });
});

describe('axisBounds', () => {
  test('contains both the bar and the padded dot domain', () => {
    const [lo, hi] = axisBounds(1_000, 9_000);
    expect(lo).toBeLessThanOrEqual(barAxisDomain(1_000, 9_000)[0]);
    expect(hi).toBeGreaterThanOrEqual(linearAxisDomain(1_000, 9_000, 0.05)[1]);
  });

  test('gives one tick form even when an axis is niced past 10,000', () => {
    // Values up to 9,000 can still draw a 10,000 tick; the formatter must
    // not switch from "8,000" to "10K" on that axis.
    const f = axisTickFormat(
      { fmt: 'abbreviateNumber', unit: null, kind: 'num' },
      axisBounds(1_000, 9_000)
    );
    expect([2_000, 8_000, 10_000].map(f)).toEqual(['2K', '8K', '10K']);
  });

  test('shortens every tick of a salary axis that crosses $100K', () => {
    const f = axisTickFormat(
      { fmt: 'moneyWithCurrencyDollars', unit: null, kind: 'num' },
      axisBounds(52_100, 131_920)
    );
    expect([40_000, 80_000, 100_000, 140_000].map(f)).toEqual([
      '$40K',
      '$80K',
      '$100K',
      '$140K',
    ]);
  });
});

describe('linearAxisDomain', () => {
  test('never pads a non-negative metric below zero', () => {
    // City population: 50K to 8.3M. Padding used to reach -2M.
    const [lo, hi] = linearAxisDomain(50_000, 8_300_000, 0.05);
    expect(lo).toBeLessThanOrEqual(0);
    // At most a sliver below zero, far smaller than one tick step.
    expect(lo).toBeGreaterThan(-(hi - lo) * 0.03);
    expect(hi).toBeGreaterThanOrEqual(8_300_000);
  });

  test('keeps a clean nice domain when the data sits well above zero', () => {
    expect(linearAxisDomain(34_000, 108_000, 0.05)).toEqual([20_000, 120_000]);
  });

  test('mirrors the rule for all-negative data', () => {
    const [lo, hi] = linearAxisDomain(-500, -20, 0.05);
    expect(lo).toBeLessThanOrEqual(-500);
    expect(hi).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThan((hi - lo) * 0.03);
  });

  test('still pads data that crosses zero', () => {
    const [lo, hi] = linearAxisDomain(-3, 5, 0.05);
    expect(lo).toBeLessThan(-3);
    expect(hi).toBeGreaterThan(5);
  });
});

describe('axisTickFormat', () => {
  const dollars = {
    fmt: 'moneyWithCurrency',
    unit: null,
    kind: 'num',
  } as const;

  test('uses one short form for every tick on a large axis', () => {
    const f = axisTickFormat(dollars, [0, 150_000]);
    expect([0, 50_000, 100_000, 150_000].map(f)).toEqual([
      '$0',
      '$50K',
      '$100K',
      '$150K',
    ]);
    expect(f(-50_000)).toBe('-$50K');
  });

  test('drops ".0" from whole-number ticks on small axes', () => {
    const f = axisTickFormat(
      { fmt: 'floatNumberTenths', unit: null, kind: 'num' },
      [0, 9_000]
    );
    expect(f(5_000)).toBe('5,000');
    expect(f(2.5)).toBe('2.5');
  });

  test('compacts plain counts and leaves scaled units alone', () => {
    const counts = axisTickFormat(
      { fmt: 'numberWithCommas', unit: null, kind: 'num' },
      [0, 10_000_000]
    );
    expect(counts(2_000_000)).toBe('2M');
    expect(counts(500_000)).toBe('500K');
    const thousands = axisTickFormat(
      { fmt: 'abbreviateNumber', unit: 'thousands', kind: 'num' },
      [0, 900_000]
    );
    expect(thousands(500_000)).toBe('500,000');
  });

  test('keeps rank and percent formats', () => {
    const rank = axisTickFormat(
      { fmt: 'ranking', unit: null, kind: 'num' },
      [1, 50]
    );
    expect(rank(10)).toBe('10th');
    const pct = axisTickFormat(
      { fmt: 'percAlt', unit: null, kind: 'num' },
      [0, 40]
    );
    expect(pct(20)).toBe('20%');
  });
});
