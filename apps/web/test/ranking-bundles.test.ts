import { describe, expect, test } from 'bun:test';

import type { Metric } from '../src/data/types';
import {
  buildBundles,
  bundlesFor,
  type BundleSource,
  EVERYTHING_CAP,
  isRankable,
} from '../src/features/compare/ranking/bundles';

const N = 60;

// Deterministic pseudo-random numbers so the fixtures are stable.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function metric(
  id: number,
  label: string,
  cats: string[],
  extra: Partial<Metric> = {}
): Metric {
  return {
    id,
    key: `m${id}`,
    label,
    fmt: null,
    unit: null,
    kind: 'num',
    pol: 1,
    year: 2024,
    years: [2024],
    n: N,
    topics: [`topic-${id}`],
    cats,
    updated: null,
    ...extra,
  };
}

/** A small catalog with good metrics and every kind of metric bundles must skip. */
function fixture(): { source: BundleSource; columns: Map<number, number[]> } {
  const r = rng(7);
  const columns = new Map<number, number[]>();
  const metrics: Metric[] = [];
  const add = (m: Metric, values: number[]) => {
    metrics.push(m);
    columns.set(m.id, values);
  };
  const noise = () => Array.from({ length: N }, () => r());
  const population = Array.from({ length: N }, (_, i) => 1e6 * (N - i));

  add(
    metric(-1, 'Population', ['population'], { pol: 0, base: true }),
    population
  );
  const gdp = noise();
  add(metric(1, 'GDP per Capita', ['economics']), gdp);
  add(metric(2, 'Median Household Income', ['economics']), noise());
  // Near-duplicate of GDP per capita (|r| ≈ 1) under a different label.
  add(
    metric(3, 'Output per Person', ['economics']),
    gdp.map((v) => v * 2 + 0.001)
  );
  add(metric(4, 'Unemployment Rate', ['economics'], { pol: -1 }), noise());
  add(metric(5, 'Total GDP', ['economics']), noise());
  add(metric(6, 'Neutral Thing', ['economics'], { pol: 0 }), noise());
  add(metric(7, 'Data Year', ['economics'], { meta: true }), noise());
  add(metric(8, 'Sparse Income', ['economics'], { n: N / 2 }), noise());
  // Tracks population almost exactly: a size proxy, not a quality measure.
  add(
    metric(9, 'Retail Sales Volume', ['economics']),
    population.map((p, i) => p * (1 + 0.01 * (i % 3)))
  );
  add(metric(10, 'Poverty Rate', ['economics'], { pol: -1 }), noise());
  add(metric(11, 'Livable Wage', ['economics']), noise());
  add(metric(12, 'Cost of Living Index', ['economics'], { pol: -1 }), noise());

  for (let k = 0; k < 6; k++)
    add(
      metric(100 + k, `Health Measure ${k} Rate`, ['health'], {
        pol: k % 2 === 0 ? 1 : -1,
      }),
      noise()
    );
  add(metric(110, 'Life Expectancy', ['health']), noise());
  for (let k = 0; k < 5; k++)
    add(
      metric(200 + k, `Crime Measure ${k} Rate`, ['crime-safety'], { pol: -1 }),
      noise()
    );
  add(
    metric(210, 'Violent Crime Rate', ['crime-safety'], { pol: -1 }),
    noise()
  );
  add(metric(300, 'Education Rank', ['education'], { pol: -1 }), noise());
  // Only one education metric, so the Education bundle must be dropped (< 2 metrics).
  for (let k = 0; k < 4; k++)
    add(metric(400 + k, `Sports Score ${k}`, ['sports']), noise());

  const numeric = (id: number) =>
    Float64Array.from(columns.get(id) ?? new Array<number>(N).fill(NaN));
  return { source: { metrics, entityCount: N, numeric }, columns };
}

describe('isRankable', () => {
  test('keeps polar numeric measures and skips meta, neutral, base and counts', () => {
    const m = (label: string, extra: Partial<Metric> = {}) =>
      isRankable(metric(1, label, ['economics'], extra));
    expect(m('GDP per Capita')).toBe(true);
    expect(m('Total Happiness Score')).toBe(true);
    expect(m('Total GDP')).toBe(false);
    expect(m('Number of Schools')).toBe(false);
    expect(m('Gun Deaths')).toBe(false);
    expect(m('Data Year', { meta: true })).toBe(false);
    expect(m('Population', { base: true, pol: 1 })).toBe(false);
    expect(m('Neutral', { pol: 0 })).toBe(false);
    expect(m('Names', { kind: 'text' })).toBe(false);
    expect(m('Livable Wage w/ 2 Children')).toBe(false);
  });
});

describe('buildBundles', () => {
  const { source } = fixture();
  const bundles = buildBundles(source);
  const byId = new Map(bundles.map((b) => [b.id, b]));

  test('builds economy from good economics metrics only', () => {
    const economy = byId.get('economy');
    expect(economy).toBeDefined();
    const ids = economy?.metricIds ?? [];
    expect(ids.slice(0, 2)).toEqual([1, 2]);
    expect(ids).toContain(4);
    expect(ids).toContain(10);
    expect(ids).toContain(12);
    // duplicate, count, neutral, meta, sparse, size proxy, ambiguous cost
    for (const skipped of [3, 5, 6, 7, 8, 9, 11])
      expect(ids).not.toContain(skipped);
    expect(economy?.minCoverage).toBe(0.85);
  });

  test('caps focused bundles at 8 metrics', () => {
    for (const b of bundles) {
      if (b.id === 'everything') continue;
      expect(b.metricIds.length).toBeLessThanOrEqual(8);
    }
  });

  test('keeps quality of life balanced across categories', () => {
    const quality = byId.get('quality');
    expect(quality).toBeDefined();
    const cats = new Map<string, number>();
    for (const id of quality?.metricIds ?? []) {
      const m = source.metrics.find((x) => x.id === id);
      const cat = m?.cats[0] ?? '';
      cats.set(cat, (cats.get(cat) ?? 0) + 1);
    }
    expect(cats.size).toBeGreaterThanOrEqual(4);
    expect(quality?.metricIds).toContain(110);
    expect(quality?.metricIds).toContain(210);
  });

  test('drops bundles with fewer than two metrics', () => {
    expect(byId.has('education')).toBe(false);
  });

  test('"everything" spans categories, reports its qualifying count and respects the cap', () => {
    const all = byId.get('everything');
    expect(all).toBeDefined();
    const ids = all?.metricIds ?? [];
    expect(ids.length).toBeLessThanOrEqual(EVERYTHING_CAP);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(300);
    expect(ids.some((id) => id >= 400)).toBe(true);
    expect(ids).not.toContain(3);
    expect(ids).not.toContain(9);
    // Rankable metrics with full coverage, before de-duplication:
    // economics 7, health 7, crime 6, education 1, sports 4.
    expect(all?.qualifying).toBe(25);
  });

  test('relaxes coverage for sparse place types', () => {
    const sparse: BundleSource = {
      ...source,
      metrics: source.metrics.map((m) =>
        m.cats.includes('crime-safety') ? { ...m, n: Math.round(N * 0.5) } : m
      ),
    };
    const safety = buildBundles(sparse).find((b) => b.id === 'safety');
    expect(safety?.minCoverage).toBe(0.35);
    expect(safety?.metricIds.length).toBeGreaterThanOrEqual(4);
  });
});

describe('bundlesFor', () => {
  test('memoises per key', () => {
    const { source } = fixture();
    const key = {};
    let calls = 0;
    const get = () => {
      calls++;
      return source;
    };
    const a = bundlesFor(key, get);
    const b = bundlesFor(key, get);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });
});
