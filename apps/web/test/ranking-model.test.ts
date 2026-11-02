import { composite, type Normalization } from '@world-data/stats';
import { describe, expect, test } from 'bun:test';

import {
  biggestSurprise,
  computeRanking,
  formatScore,
  leaderInsight,
  metricStats,
  type RankingInput,
  rescore,
  sensitivity,
} from '../src/features/compare/ranking/model';

const input = (
  id: number,
  values: number[],
  direction: 1 | -1 = 1,
  weight = 1
): RankingInput => ({
  id,
  values: Float64Array.from(values),
  direction,
  weight,
});

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('rescore', () => {
  test('matches composite() for every normalisation, weights and missing data', () => {
    const r = rng(11);
    const n = 120;
    const inputs = Array.from({ length: 6 }, (_, k) =>
      input(
        k,
        Array.from({ length: n }, () => (r() < 0.15 ? NaN : r() * 100)),
        k % 2 === 0 ? 1 : -1,
        [1, 2.5, 0, 0.5, 3, 1][k]
      )
    );
    const methods: Normalization[] = ['percentile', 'zscore', 'minmax'];
    for (const method of methods) {
      for (const cov of [0, 0.5, 0.9]) {
        const c = composite(inputs, n, method, cov);
        const s = rescore(
          c.parts,
          inputs.map((i) => i.weight),
          n,
          cov
        );
        for (let e = 0; e < n; e++) {
          if (Number.isNaN(c.score[e])) expect(s[e]).toBeNaN();
          else expect(s[e]).toBeCloseTo(c.score[e], 10);
        }
      }
    }
  });

  test('returns all NaN when every weight is zero', () => {
    const s = rescore([Float64Array.from([1, 2])], [0], 2, 0);
    expect(Number.isNaN(s[0]) && Number.isNaN(s[1])).toBe(true);
  });
});

describe('computeRanking', () => {
  test('orders places, shares ranks on ties and counts exclusions', () => {
    const inputs = [
      input(1, [10, 30, 30, NaN, NaN]),
      input(2, [1, 3, 3, NaN, 2]),
    ];
    // minCoverage 0.75 excludes place 4 (one of two metrics) and place 3 (none).
    const res = computeRanking(inputs, 5, 'percentile', 0.75);
    expect(res.order).toEqual([1, 2, 0]);
    expect(Array.from(res.composite.rank.slice(0, 3))).toEqual([3, 1, 1]);
    expect(res.excluded).toBe(2);
    expect(res.noData).toBe(1);
    expect(res.active).toBe(2);
  });
});

describe('metricStats', () => {
  test('finds the best place given the direction', () => {
    const [higher, lower] = metricStats([
      input(1, [5, 9, NaN, 1]),
      input(2, [5, 9, NaN, 1], -1),
    ]);
    expect(higher.best).toBe(1);
    expect(higher.n).toBe(3);
    expect(higher.pct[1]).toBe(100);
    expect(lower.best).toBe(3);
    expect(Number.isNaN(lower.rank[2])).toBe(true);
  });
});

describe('sensitivity', () => {
  // Place 0 leads only because of metric 3; places 1 and 2 are solid all-rounders.
  const inputs = [
    input(1, [5, 9, 8, 1]),
    input(2, [6, 8, 9, 1]),
    input(3, [100, 1, 2, 0], 1, 3),
  ];
  const base = computeRanking(inputs, 4, 'percentile', 0.5);

  test('reports leader changes and the most influential metric', () => {
    expect(base.order[0]).toBe(0);
    const sens = sensitivity(base, inputs, 0.5);
    // equal weights + one drop per metric
    expect(sens.scenarios.map((s) => s.kind)).toEqual([
      'equal',
      'drop',
      'drop',
      'drop',
    ]);
    const drop3 = sens.scenarios.find((s) => s.metricId === 3);
    expect(drop3?.changed).toBe(true);
    expect(drop3?.leader).not.toBe(0);
    expect(sens.mostInfluential?.metricId).toBe(3);
    const drop1 = sens.scenarios.find((s) => s.metricId === 1);
    expect(drop1?.changed).toBe(false);
  });

  test('skips equal weights when weights already match, and needs two metrics', () => {
    const flat = inputs.map((i) => ({ ...i, weight: 1 }));
    const sens = sensitivity(
      computeRanking(flat, 4, 'percentile', 0.5),
      flat,
      0.5
    );
    expect(sens.scenarios.every((s) => s.kind === 'drop')).toBe(true);
    const one = [inputs[0]];
    expect(
      sensitivity(computeRanking(one, 4, 'percentile', 0.5), one, 0.5).scenarios
    ).toEqual([]);
  });
});

describe('insights', () => {
  const inputs = [
    input(1, [9, 5, 1, 4]),
    input(2, [9, 4, 3, 5]),
    input(3, [1, 6, 2, 7]),
    input(4, [8, 7, 6, 1]),
  ];
  const base = computeRanking(inputs, 4, 'percentile', 0.5);
  const stats = metricStats(inputs);

  test('leaderInsight gives margin, strongest and weakest metrics', () => {
    const li = leaderInsight(base, stats, inputs);
    expect(li).not.toBeNull();
    expect(li?.leader).toBe(base.order[0]);
    expect(li?.runnerUp).toBe(base.order[1]);
    expect(li?.margin).toBeGreaterThan(0);
    expect(li?.strongest.length).toBe(2);
    expect(li?.weakest.length).toBe(2);
    const strongIds = new Set(li?.strongest.map((s) => s.id));
    expect(li?.weakest.some((w) => strongIds.has(w.id))).toBe(false);
    expect(li?.strongest[0].pct ?? 0).toBeGreaterThanOrEqual(
      li?.weakest[0].pct ?? 0
    );
  });

  test('biggestSurprise finds the place whose combined rank beats its typical metric rank most', () => {
    // A, B, C each win one metric; E is 2nd everywhere; F 3rd everywhere.
    // Percentile scores: A 33.3, B 41.7, C 50, E 75, F 50 → C ties F for #2 although its median
    // single-metric rank is 4th (it is carried by one extreme metric): delta 2, the largest.
    //               A   B   C   E   F
    const spread = [
      input(1, [10, 1, 2, 9, 3]),
      input(2, [1, 10, 2, 9, 3]),
      input(3, [1, 2, 10, 9, 3]),
    ];
    const res = computeRanking(spread, 5, 'percentile', 0.5);
    const s = biggestSurprise(res, metricStats(spread), spread);
    expect(s).not.toBeNull();
    expect(s?.idx).toBe(2);
    expect(s?.combinedRank).toBe(2);
    expect(s?.medianRank).toBe(4);
    expect(s?.delta).toBe(2);
    // Percentiles 25, 25, 100: the mean sits far above the median, so standouts explain it.
    expect(s?.reason).toBe('standouts');
    expect(s?.skew).toBe(25);
  });

  test('biggestSurprise calls a balanced place consistent, not carried by standouts', () => {
    // E is 3rd of 6 on every metric. A–D each take 1st, 2nd, 5th and 6th once, so their weak
    // spots pull them below E: E is 1st combined with a median rank of 3 and no standout.
    //               A  B  C  D  E  F
    const even = [
      input(1, [6, 5, 2, 1, 4, 3]),
      input(2, [1, 6, 5, 2, 4, 3]),
      input(3, [2, 1, 6, 5, 4, 3]),
      input(4, [5, 2, 1, 6, 4, 3]),
    ];
    const res = computeRanking(even, 6, 'percentile', 0.5);
    const s = biggestSurprise(res, metricStats(even), even);
    expect(s?.idx).toBe(4);
    expect(s?.combinedRank).toBe(1);
    expect(s?.delta).toBe(2);
    expect(s?.reason).toBe('consistent');
  });

  test('biggestSurprise is null when every place ranks as its metrics suggest', () => {
    const same = [input(1, [1, 2, 3]), input(2, [1, 2, 3])];
    const res = computeRanking(same, 3, 'percentile', 0.5);
    expect(biggestSurprise(res, metricStats(same), same)).toBeNull();
  });
});

describe('formatScore', () => {
  test('one decimal for 0–100 scores, signed z-scores', () => {
    expect(formatScore(82.345, 'percentile')).toBe('82.3');
    expect(formatScore(1.234, 'zscore')).toBe('+1.23');
    expect(formatScore(-0.5, 'zscore')).toBe('−0.50');
    expect(formatScore(NaN, 'minmax')).toBe('—');
  });
});
