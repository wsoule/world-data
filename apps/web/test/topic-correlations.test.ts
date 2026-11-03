import { describe, expect, test } from 'bun:test';

import {
  type CorrelationCandidate,
  findCorrelations,
  minOverlapFor,
} from '../src/features/topic/correlations';

// Deterministic pseudo-random noise so the expected ordering never flakes.
function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

function column(n: number, f: (i: number) => number): Float64Array {
  return Float64Array.from({ length: n }, (_, i) => f(i));
}

describe('minOverlapFor', () => {
  test('needs at least 10 places and 60% of the focus coverage', () => {
    expect(minOverlapFor(5)).toBe(10);
    expect(minOverlapFor(16)).toBe(10);
    expect(minOverlapFor(51)).toBe(31);
    expect(minOverlapFor(200)).toBe(120);
  });
});

describe('findCorrelations', () => {
  const n = 50;
  const rand = noise(7);
  const focus = column(n, (i) => i);
  const cols = new Map<number, Float64Array>([
    // strong positive, weaker positive, strong negative, unrelated
    [1, column(n, (i) => i + rand() * 10)],
    [2, column(n, (i) => i + rand() * 60)],
    [3, column(n, (i) => -i + rand() * 10)],
    [4, column(n, () => rand())],
    // the same series republished: dropped as a duplicate
    [5, column(n, (i) => i * 2 + 1)],
    // too little overlap (only 8 places)
    [6, column(n, (i) => (i < 8 ? i : NaN))],
  ]);
  const candidates: CorrelationCandidate[] = [...cols.keys()].map((id) => ({
    id,
    n: n,
  }));
  const get = (id: number) => cols.get(id) ?? new Float64Array(n).fill(NaN);

  test('ranks positive and negative relationships separately', () => {
    const res = findCorrelations(focus, candidates, get);
    expect(res.positive.map((h) => h.id).slice(0, 2)).toEqual([1, 2]);
    expect(res.negative[0].id).toBe(3);
    expect(res.positive[0].r).toBeGreaterThan(res.positive[1].r);
    expect(res.negative[0].r).toBeLessThan(-0.9);
    expect(res.coverage).toBe(50);
    expect(res.minOverlap).toBe(30);
  });

  test('drops near-identical series and thin overlaps', () => {
    const res = findCorrelations(focus, candidates, get);
    const ids = [...res.positive, ...res.negative].map((h) => h.id);
    expect(ids).not.toContain(5);
    expect(ids).not.toContain(6);
    expect(res.duplicates).toBe(1);
    expect(res.tested).toBe(5);
  });

  test('skips candidates whose coverage cannot reach the threshold without reading them', () => {
    const read: number[] = [];
    findCorrelations(focus, [{ id: 1, n: 12 }], (id) => {
      read.push(id);
      return get(id);
    });
    expect(read).toEqual([]);
  });

  test('leaves out relationships too weak to mention', () => {
    const res = findCorrelations(focus, candidates, get);
    for (const h of [...res.positive, ...res.negative])
      expect(Math.abs(h.r)).toBeGreaterThanOrEqual(0.1);
  });

  test('keeps only the strongest hit per key', () => {
    const res = findCorrelations(focus, candidates, get, 6, (id) =>
      id === 1 || id === 2 ? 'same label' : String(id)
    );
    const ids = res.positive.map((h) => h.id);
    expect(ids).toContain(1);
    expect(ids).not.toContain(2);
  });

  test('groups flipped candidates (ranks against values) by -r', () => {
    // Candidate 3 falls as the focus rises; read as a rank, it ranks better.
    const res = findCorrelations(
      focus,
      candidates,
      get,
      6,
      undefined,
      (id) => id === 3
    );
    const hit = res.positive.find((h) => h.id === 3);
    // The raw r is kept for display.
    expect(hit?.r).toBeLessThan(-0.9);
    expect(res.negative.map((h) => h.id)).not.toContain(3);
    // Strongest first within the group, by strength in the reading direction.
    const strengths = res.positive.map((h) => Math.abs(h.r));
    expect(strengths).toEqual([...strengths].sort((a, b) => b - a));
    expect(
      res.positive
        .map((h) => h.id)
        .slice(0, 2)
        .sort((a, b) => a - b)
    ).toEqual([1, 3]);
  });

  test('respects the limit', () => {
    const res = findCorrelations(focus, candidates, get, 1);
    expect(res.positive).toHaveLength(1);
    expect(res.negative).toHaveLength(1);
  });

  test('returns nothing when the focus covers fewer than 10 places', () => {
    const sparse = column(n, (i) => (i < 9 ? i : NaN));
    const res = findCorrelations(sparse, candidates, get);
    expect(res.positive).toEqual([]);
    expect(res.negative).toEqual([]);
    expect(res.tested).toBe(0);
  });

  test('handles a country-sized catalog well under 300 ms', () => {
    const places = 235;
    const r = noise(11);
    const f = column(places, (i) => (i % 9 === 0 ? NaN : i + r() * 40));
    const many = new Map<number, Float64Array>();
    for (let id = 0; id < 3000; id++)
      many.set(
        id,
        column(places, (i) =>
          (i + id) % 5 === 0 ? NaN : (id % 2 === 0 ? i : -i) + r() * 200
        )
      );
    const res = findCorrelations(
      f,
      [...many.keys()].map((id) => ({ id, n: places })),
      (id) => many.get(id) ?? new Float64Array(places)
    );
    expect(res.tested).toBe(3000);
    expect(res.positive).toHaveLength(6);
    expect(res.ms).toBeLessThan(300);
  });
});
