import { describe, expect, test } from 'bun:test';

import {
  combinedScore,
  maskColumn,
  topAndBottom,
} from '../src/features/compare/map/combined';

describe('topAndBottom', () => {
  test('ranks with ties and lists the worst first in the bottom list', () => {
    const v = Float64Array.from([5, NaN, 9, 9, 1, 3]);
    const { top, bottom, count } = topAndBottom(v, 1, 2);
    expect(count).toBe(5);
    expect(top.map((r) => [r.idx, r.rank])).toEqual([
      [2, 1],
      [3, 1],
    ]);
    expect(bottom.map((r) => r.idx)).toEqual([4, 5]);
    const low = topAndBottom(v, -1, 1);
    expect(low.top[0].idx).toBe(4);
  });
});

describe('combinedScore', () => {
  test('scores only the filtered places, higher is better', () => {
    const income = maskColumn(Float64Array.from([10, 20, 30, 40]), [0, 1, 2]);
    const crime = maskColumn(Float64Array.from([3, 2, 1, 9]), [0, 1, 2]);
    const { score } = combinedScore(
      [
        { values: income, direction: 1, weight: 1 },
        { values: crime, direction: -1, weight: 1 },
      ],
      4,
      'percentile',
      0.5
    );
    expect(Array.from(score.slice(0, 3))).toEqual([0, 50, 100]);
    expect(Number.isNaN(score[3])).toBe(true);
  });
});
