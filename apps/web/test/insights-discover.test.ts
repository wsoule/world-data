import { pearson } from '@world-data/stats';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Metric, ValuesFile } from '../src/data/types';
import {
  discoverRelated,
  listTitles,
} from '../src/features/compare/insights/discover';

const N = NaN;

describe('discoverRelated', () => {
  const target = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const up = target.map((v) => v * 2 + (v % 3));
  const down = target.map((v) => 100 - v * 3 + (v % 2));
  const flat = target.map((v) => (v % 2 === 0 ? 5 : 6));

  test('splits matches into positive and negative, strongest first', () => {
    const res = discoverRelated(
      target,
      [
        { id: 1, values: up },
        { id: 2, values: down },
        { id: 3, values: flat },
      ],
      { minOverlap: 5 }
    );
    expect(res.positive.map((m) => m.id)).toEqual([1]);
    expect(res.negative[0].id).toBe(2);
    expect(res.scanned).toBe(3);
    expect(res.eligible).toBe(3);
    expect(res.positive[0].n).toBe(12);
    expect(res.positive[0].p).toBeLessThan(0.001);
  });

  test('matches the reference Pearson implementation', () => {
    const noisy = target.map((v, i) => v + ((i * 7) % 5) - 2);
    const res = discoverRelated(target, [{ id: 9, values: noisy }], {
      minOverlap: 5,
    });
    expect(res.positive[0].r).toBeCloseTo(pearson(target, noisy).r, 12);
  });

  test('requires overlap on most of the smaller coverage', () => {
    // 12 target values; candidate has 12 values but only 6 overlap.
    const shifted = [N, N, N, N, N, N, 1, 2, 3, 4, 5, 6];
    const t = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const res = discoverRelated(
      [...t, N, N, N, N, N, N],
      [{ id: 1, values: [...shifted, 7, 8, 9, 10, 11, 12] }],
      { minOverlap: 3 }
    );
    // overlap 6 < ceil(0.6 * min(12, 12)) = 8
    expect(res.eligible).toBe(0);

    const loose = discoverRelated(
      [...t, N, N, N, N, N, N],
      [{ id: 1, values: [...shifted, 7, 8, 9, 10, 11, 12] }],
      { minOverlap: 3, minShare: 0.5 }
    );
    expect(loose.eligible).toBe(1);
  });

  test('a sparse candidate only needs to overlap most of its own data', () => {
    const sparse = target.map((v, i) => (i < 10 ? v * 3 : N));
    const res = discoverRelated(target, [{ id: 4, values: sparse }], {
      minOverlap: 10,
    });
    expect(res.positive[0]?.n).toBe(10);
  });

  test('restricts to rows, skips excluded ids and constant columns', () => {
    const res = discoverRelated(
      target,
      [
        { id: 1, values: up },
        { id: 2, values: target.map(() => 3) },
        { id: 3, values: down },
      ],
      { rows: [0, 1, 2, 3, 4, 5], minOverlap: 4, exclude: new Set([3]) }
    );
    expect(res.scanned).toBe(2);
    expect(res.eligible).toBe(1);
    expect(res.positive[0].n).toBe(6);
    expect(res.targetCoverage).toBe(6);
  });

  test('hide drops near-identical copies and counts them', () => {
    const res = discoverRelated(
      target,
      [
        { id: 1, values: target.map((v) => v * 10) },
        { id: 2, values: up },
      ],
      { minOverlap: 5, hide: (_id, r) => r > 0.999 }
    );
    expect(res.hidden).toBe(1);
    expect(res.positive.map((m) => m.id)).toEqual([2]);
  });

  test('flip reports a best-first rank by standing: a better rank counts as higher', () => {
    // Rank 1 is the best place, and places with a higher target rank better (smaller number).
    const rank = target.map((v, i) => 13 - v + (i === 3 ? 2 : 0));
    const raw = discoverRelated(target, [{ id: 5, values: rank }], {
      minOverlap: 5,
    });
    const read = discoverRelated(target, [{ id: 5, values: rank }], {
      minOverlap: 5,
      flip: (id) => id === 5,
    });
    expect(raw.negative.map((m) => m.id)).toEqual([5]);
    expect(read.positive.map((m) => m.id)).toEqual([5]);
    expect(read.negative).toEqual([]);
    expect(read.positive[0].r).toBeCloseTo(-raw.negative[0].r, 12);
    expect(read.positive[0].p).toBe(raw.negative[0].p);
    expect(read.positive[0].n).toBe(raw.negative[0].n);
  });

  test('flip leaves other candidates as they are', () => {
    const res = discoverRelated(
      target,
      [
        { id: 1, values: up },
        { id: 2, values: down },
      ],
      { minOverlap: 5, flip: (id) => id === 99 }
    );
    expect(res.positive.map((m) => m.id)).toEqual([1]);
    expect(res.negative.map((m) => m.id)).toEqual([2]);
  });

  test('keeps at most `limit` per side', () => {
    const many = Array.from({ length: 30 }, (_, k) => ({
      id: k,
      values: target.map((v, i) => v + ((i * (k + 1)) % 4)),
    }));
    const res = discoverRelated(target, many, { minOverlap: 5, limit: 10 });
    expect(res.positive.length).toBe(10);
    for (let i = 1; i < res.positive.length; i++)
      expect(res.positive[i - 1].r).toBeGreaterThanOrEqual(res.positive[i].r);
  });
});

// Scans the real country dataset (the largest catalogue) the way the Correlations view does,
// including materialising every numeric column, and checks it stays interactive.
describe('discoverRelated on real data', () => {
  for (const type of ['country', 'state'] as const) {
    test(`${type}: scans every numeric metric in under 300 ms`, () => {
      const dir = join(import.meta.dir, '..', 'public', 'data', type);
      const metrics = JSON.parse(
        readFileSync(join(dir, 'metrics.json'), 'utf8')
      ) as Metric[];
      const values = JSON.parse(
        readFileSync(join(dir, 'values.json'), 'utf8')
      ) as ValuesFile;
      const raw = new Map(values.metrics.map((m) => [m[0], m] as const));
      const numeric = metrics.filter(
        (m) => m.kind === 'num' && m.meta !== true
      );

      const started = performance.now();
      const column = (id: number) => {
        const col = new Float64Array(values.entityCount).fill(NaN);
        const r = raw.get(id);
        if (r != null)
          for (let k = 0; k < r[1].length; k++) {
            const v = r[2][k];
            if (typeof v === 'number') col[r[1][k]] = v;
          }
        return col;
      };
      const targetId = type === 'country' ? 19182 : 24419;
      const res = discoverRelated(
        column(targetId),
        numeric.map((m) => ({ id: m.id, values: column(m.id) })),
        { exclude: new Set([targetId]) }
      );
      const elapsed = performance.now() - started;

      expect(res.scanned).toBe(numeric.length - 1);
      expect(res.positive.length).toBe(10);
      expect(res.negative.length).toBe(10);
      expect(elapsed).toBeLessThan(300);
    });
  }
});

describe('listTitles', () => {
  const base: Metric = {
    id: 1,
    key: 'm1',
    label: 'Median Household Income',
    fmt: 'moneyWithCurrency',
    unit: null,
    kind: 'num',
    pol: 1,
    year: null,
    years: [],
    n: 50,
    topics: [],
    cats: [],
    updated: null,
  };

  test('reads raw direction for an ordinary metric', () => {
    expect(listTitles(base)).toEqual({
      positive: 'Rises with Median Household Income',
      negative: 'Falls as Median Household Income rises',
    });
  });

  test('says better and worse for a rank, which the scan reads by standing', () => {
    // Positive r means "higher where the rank is better" for a best-first list (flipped) and a
    // worst-first one (already higher where better) alike.
    const bestFirst: Metric = {
      ...base,
      label: 'Best Education Rank',
      fmt: 'ranking',
      pol: -1,
    };
    const worstFirst: Metric = { ...bestFirst, pol: 1 };
    const titles = {
      positive: 'Higher where Best Education Rank is better',
      negative: 'Higher where Best Education Rank is worse',
    };
    expect(listTitles(bestFirst)).toEqual(titles);
    expect(listTitles(worstFirst)).toEqual(titles);
  });
});
