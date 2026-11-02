import { describe, expect, test } from 'bun:test';

import {
  buildRankModel,
  pickVisible,
  rankTicks,
  spreadLabels,
} from '../src/features/compare/insights/rankLines';

const N = NaN;

describe('buildRankModel', () => {
  const model = buildRankModel(
    [
      [10, 30, 20, N],
      [5, 1, 3, 2],
    ],
    [1, -1]
  );

  test('ranks each metric in its own direction', () => {
    expect([...model.ranks[0]]).toEqual([3, 1, 2, N]);
    expect([...model.ranks[1]]).toEqual([4, 1, 3, 2]);
    expect(model.counts).toEqual([3, 4]);
  });

  test('orders places by mean percentile, best first', () => {
    expect(model.order[0]).toBe(1);
    expect(model.average[1]).toBe(100);
    expect(model.order.at(-1)).toBe(0);
  });

  test('leaves metrics with no better side out of the average', () => {
    // Column 0 is like population (neutral), column 1 like income.
    const m = buildRankModel(
      [
        [100, 1, 50],
        [1, 3, 2],
      ],
      [1, 1],
      { include: [false, true] }
    );
    expect(m.averaged).toBe(1);
    // Ranked and drawn on both, but ordered by income alone.
    expect([...m.ranks[0]]).toEqual([1, 3, 2]);
    expect(m.order).toEqual([1, 2, 0]);
    expect(m.average[0]).toBe(0);
  });

  test('has no order when no metric has a better side', () => {
    const m = buildRankModel([[3, 1, 2]], [1], { include: [false] });
    expect(m.averaged).toBe(0);
    expect(m.order).toEqual([]);
    expect(Number.isNaN(m.average[0])).toBe(true);
  });

  test('skips places below the coverage floor', () => {
    const strict = buildRankModel(
      [
        [1, 2, N],
        [1, 2, N],
        [1, 2, 3],
      ],
      [1, 1, 1]
    );
    expect(Number.isNaN(strict.average[2])).toBe(true);
    expect(strict.order).not.toContain(2);
  });
});

describe('pickVisible', () => {
  const values = Array.from({ length: 100 }, (_, i) => i);
  const model = buildRankModel([values, values], [1, 1]);

  test('emphasizes highlighted places first, then the best five', () => {
    const v = pickVisible(model, 100, { highlighted: [3], showAll: false });
    expect(v.emphasized).toEqual([3, 99, 98, 97, 96, 95]);
  });

  test('thins context lines to the best and worst ten above 60 places', () => {
    const v = pickVisible(model, 100, { highlighted: [], showAll: false });
    expect(v.limited).toBe(true);
    expect(v.background.length).toBe(15);
    expect(v.background).toContain(0);
    expect(v.background).not.toContain(50);
  });

  test('draws everything when asked or when small', () => {
    expect(
      pickVisible(model, 100, { highlighted: [], showAll: true }).background
        .length
    ).toBe(95);
    const small = buildRankModel([[1, 2, 3]], [1]);
    expect(pickVisible(small, 3, { highlighted: [], showAll: false })).toEqual({
      emphasized: [2, 1, 0],
      background: [],
      limited: false,
    });
  });
});

describe('spreadLabels', () => {
  test('keeps labels that already fit where they are', () => {
    expect(spreadLabels([10, 50, 90], 12, 0, 100)).toEqual([10, 50, 90]);
  });

  test('pushes colliding labels apart within bounds', () => {
    const out = spreadLabels([50, 51, 52], 10, 0, 100);
    const sorted = [...out].sort((a, b) => a - b);
    expect(sorted[1] - sorted[0]).toBeGreaterThanOrEqual(10);
    expect(sorted[2] - sorted[1]).toBeGreaterThanOrEqual(10);
    expect(out[0]).toBeLessThan(out[2]);
  });

  test('respects the upper bound', () => {
    const out = spreadLabels([98, 99, 100], 10, 0, 100);
    expect(Math.max(...out)).toBeLessThanOrEqual(100);
    expect(Math.min(...out)).toBeCloseTo(80);
  });

  test('spreads evenly when they cannot fit', () => {
    expect(spreadLabels([5, 5, 5], 100, 0, 10)).toEqual([0, 5, 10]);
  });
});

describe('rankTicks', () => {
  test('starts at 1 and uses round steps', () => {
    expect(rankTicks(51)).toEqual([1, 10, 20, 30, 40, 50]);
    expect(rankTicks(235)).toEqual([1, 50, 100, 150, 200]);
    expect(rankTicks(3094)).toEqual([1, 1000, 2000, 3000]);
    expect(rankTicks(4)).toEqual([1, 2, 3, 4]);
    expect(rankTicks(1)).toEqual([1]);
  });
});
