import { competitionRank, percentile } from '@world-data/stats';
import { describe, expect, test } from 'bun:test';

import type { Metric } from '../src/data/types';
import { rankText } from '../src/features/places/percentile';
import {
  basisCoverage,
  categoryScores,
  coverageCut,
  dedupeKey,
  diversifyByTopic,
  isPolar,
  maxNotableTie,
  metricsWithData,
  notableFacts,
  placeStandings,
  type ProfileData,
  qualifyingRows,
  type SimilarityBasis,
  similarityBasis,
  similarPlaces,
  sizeDrivenMetrics,
  standingAt,
  strengthsAndWeaknesses,
  tracksPopulation,
} from '../src/features/places/profileModel';

const metric = (
  id: number,
  label: string,
  pol: Metric['pol'],
  cats: string[] = ['economics'],
  extra: Partial<Metric> = {}
): Metric => ({
  id,
  key: `m${id}`,
  label,
  fmt: null,
  unit: null,
  kind: 'num',
  pol,
  year: null,
  years: [],
  n: 0,
  topics: [`topic-${id}`],
  cats,
  updated: null,
  ...extra,
});

/** Builds a ProfileData over `names` from columns given per metric (NaN = missing). */
function fixture(names: string[], columns: [Metric, number[]][]): ProfileData {
  const byId = new Map<number, Float64Array>();
  const metrics = columns.map(([m, values]) => {
    byId.set(m.id, Float64Array.from(values));
    return { ...m, n: values.filter((v) => !Number.isNaN(v)).length };
  });
  return {
    entities: names.map((name) => ({ id: name.toUpperCase(), name })),
    metrics,
    numeric: (id) =>
      byId.get(id) ?? new Float64Array(names.length).fill(Number.NaN),
    hasValues: (id) => byId.has(id),
  };
}

describe('standingAt', () => {
  test('matches stats competitionRank and percentile at every index, with ties and gaps', () => {
    const col = [5, 3, Number.NaN, 5, 9, 1, 3, 3, Number.NaN, 7];
    for (const dir of [1, -1] as const) {
      const ranks = competitionRank(col, dir);
      const pcts = percentile(col, dir);
      col.forEach((v, i) => {
        const s = standingAt(col, i, dir);
        if (Number.isNaN(v)) {
          expect(s).toBeNull();
          return;
        }
        expect(s?.rank).toBe(ranks[i]);
        expect(s?.pct).toBeCloseTo(pcts[i], 12);
        expect(s?.n).toBe(8);
      });
    }
  });

  test('counts better, tied and worse places', () => {
    const s = standingAt([4, 2, 2, 1], 1, 1);
    expect(s).toMatchObject({ rank: 2, better: 1, tied: 2, worse: 1, n: 4 });
  });

  test('a lone value is the best by definition', () => {
    expect(standingAt([Number.NaN, 3], 1, -1)?.pct).toBe(1);
  });

  test('measures the gap to the nearest rival as a share of the range', () => {
    const col = [10, 7, 1, 0];
    expect(standingAt(col, 0, 1)?.aheadOfNext).toBeCloseTo(0.3, 12);
    expect(standingAt(col, 0, 1)?.behindNext).toBe(0);
    expect(standingAt(col, 3, 1)?.behindNext).toBeCloseTo(0.1, 12);
    expect(standingAt(col, 3, -1)?.aheadOfNext).toBeCloseTo(0.1, 12);
  });
});

describe('isPolar', () => {
  test('calendar years are never better or worse', () => {
    expect(isPolar({ pol: 1, fmt: 'year' })).toBe(false);
    expect(isPolar({ pol: -1, fmt: 'ranking' })).toBe(true);
    expect(isPolar({ pol: 0, fmt: null })).toBe(false);
  });
});

describe('rankText', () => {
  test('reads a tie at the bottom as tied last, not by its top rank', () => {
    expect(rankText({ rank: 32, n: 51, tied: 20 })).toBe('tied last of 51');
    expect(rankText({ rank: 51, n: 51, tied: 1 })).toBe('51st of 51');
    expect(rankText({ rank: 3, n: 51, tied: 2 })).toBe('tied 3rd of 51');
    expect(rankText({ rank: 1, n: 3, tied: 3 })).toBe('tied 1st of 3');
  });
});

describe('sizeDrivenMetrics', () => {
  test('flags directional totals that track population, not rates', () => {
    const names = 'abcdefghij'.split('');
    const pop = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const data = fixture(names, [
      [metric(-1, 'Population', 0, ['population'], { base: true }), pop],
      [metric(1, '# of Burglaries', -1), pop.map((p) => p * 3 + 1)],
      [metric(2, 'Burglary Rate', -1), [3, 9, 1, 7, 2, 8, 4, 10, 5, 6]],
      [metric(3, 'Total Area', 0), pop],
    ]);
    expect([...sizeDrivenMetrics(data, data.metrics)]).toEqual([1]);
  });

  test('also flags raw counts whose per-resident figure no longer tracks population', () => {
    const names = 'abcdefghij'.split('');
    const pop = [1e6, 5e5, 2e5, 1e5, 5e4, 2e4, 1e4, 5e3, 2e3, 1e3];
    // Murders per resident vary a lot, so the count's ρ with population is only ~0.68.
    const perResident = [2, 100, 1, 30, 50, 3, 80, 4, 400, 10];
    const data = fixture(names, [
      [metric(-1, 'Population', 0, ['population'], { base: true }), pop],
      [metric(1, 'Murders', -1), pop.map((p, i) => p * perResident[i])],
      // An average that rises with population (ρ ~0.58) but is no count.
      [metric(2, 'Avg Salary', 1), [52, 58, 45, 55, 43, 60, 41, 47, 44, 40]],
    ]);
    expect(tracksPopulation(data, 1)).toBe(true);
    expect(tracksPopulation(data, 1, { countThreshold: 0.9 })).toBe(false);
    expect(tracksPopulation(data, 2)).toBe(false);
    expect([...sizeDrivenMetrics(data, data.metrics)]).toEqual([1]);
  });

  test('nothing tracks population when the type has no population column', () => {
    const data = fixture(['a', 'b'], [[metric(1, 'Murders', -1), [1, 2]]]);
    expect(tracksPopulation(data, 1)).toBe(false);
  });
});

describe('coverageCut', () => {
  test('uses half of all places when enough directional metrics qualify', () => {
    const ms = Array.from({ length: 12 }, () => ({
      n: 30,
      pol: 1 as const,
      fmt: null,
    }));
    expect(coverageCut(ms, 50)).toEqual({ minN: 25, share: 0.5 });
  });

  test('falls back to a lower share for sparse place types, ignoring neutral metrics', () => {
    const ms = [
      ...Array.from({ length: 12 }, () => ({
        n: 60,
        pol: -1 as const,
        fmt: null,
      })),
      ...Array.from({ length: 30 }, () => ({
        n: 400,
        pol: 0 as const,
        fmt: null,
      })),
    ];
    expect(coverageCut(ms, 477)).toEqual({ minN: 48, share: 0.1 });
  });
});

describe('profile sections', () => {
  const names = ['a', 'b', 'c', 'd', 'e'];
  const income = metric(1, 'Income', 1);
  const incomeCopy = metric(2, 'Income', 1, ['economics'], {
    topics: ['other'],
  });
  const crime = metric(3, 'Crime', -1, ['crime-safety']);
  const tax = metric(4, 'Tax', -1);
  const jobs = metric(5, 'Jobs', 1);
  const area = metric(6, 'Area', 0, ['geography']);
  const sparse = metric(7, 'Sparse', 1);
  const data = fixture(names, [
    [income, [90, 50, 70, 10, 30]],
    [incomeCopy, [90, 50, 70, 10, 30]],
    [crime, [1, 5, 4, 3, 2]],
    [tax, [9, 1, 2, 3, 4]],
    [jobs, [5, 4, 3, 2, 1]],
    [area, [100, 1, 2, 3, 4]],
    [sparse, [1, Number.NaN, Number.NaN, Number.NaN, 2]],
  ]);
  const cut = { minN: 3, share: 0.5 };
  const rows = placeStandings(data, 0);

  test('placeStandings covers every metric with a value, direction-aware', () => {
    expect(rows.map((r) => r.metric.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const crimeRow = rows.find((r) => r.metric.id === 3);
    expect(crimeRow?.standing.rank).toBe(1);
    expect(crimeRow?.standing.pct).toBe(1);
  });

  test('qualifying rows drop neutral, sparse and duplicate facts', () => {
    const q = qualifyingRows(rows, cut);
    expect(q.map((r) => r.metric.label).sort()).toEqual([
      'Crime',
      'Income',
      'Jobs',
      'Tax',
    ]);
  });

  test('strengths and weak spots split without overlap', () => {
    const { best, worst } = strengthsAndWeaknesses(
      qualifyingRows(rows, cut),
      10
    );
    expect(best.map((r) => r.metric.label)).toEqual(['Crime', 'Income']);
    expect(worst.map((r) => r.metric.label)).toEqual(['Tax', 'Jobs']);
    expect(worst[0].standing.pct).toBe(0);
  });

  test('strength lists respect the limit', () => {
    const { best, worst } = strengthsAndWeaknesses(
      qualifyingRows(rows, cut),
      1
    );
    expect(best).toHaveLength(1);
    expect(worst.map((r) => r.metric.label)).toEqual(['Tax']);
  });

  test('category scores average percentiles and need enough metrics', () => {
    const q = qualifyingRows(rows, cut);
    expect(categoryScores(q, 3)).toEqual([
      { category: 'economics', mean: (1 + 0 + 1) / 3, count: 3 },
    ]);
    expect(categoryScores(q, 1).map((c) => c.category)).toEqual([
      'crime-safety',
      'economics',
    ]);
  });

  test('qualifying rows skip excluded metrics', () => {
    const q = qualifyingRows(rows, cut, new Set([1, 2]));
    expect(q.map((r) => r.metric.label).sort()).toEqual([
      'Crime',
      'Jobs',
      'Tax',
    ]);
  });

  test('notable facts list firsts and lasts, directional and decisive first', () => {
    const facts = notableFacts(rows, cut);
    expect(facts.map((f) => [f.row.metric.label, f.end])).toEqual([
      ['Tax', 'last'],
      ['Crime', 'first'],
      ['Income', 'first'],
      ['Jobs', 'first'],
      ['Area', 'first'],
    ]);
    expect(
      notableFacts(rows, cut, new Set([4])).map((f) => f.row.metric.label)
    ).not.toContain('Tax');
  });

  test('notable facts skip values that many places share', () => {
    const names20 = Array.from({ length: 20 }, (_, i) => `p${i}`);
    // Place 0 ties for last with two others (3 of 20 > 10%), and for first with one other.
    const wage = metric(1, 'Minimum Wage', 1);
    const rent = metric(2, 'Rent', -1);
    const tied = fixture(names20, [
      [wage, names20.map((_, i) => (i < 3 ? 7.25 : 8 + i))],
      [rent, names20.map((_, i) => (i < 2 ? 500 : 600 + i))],
    ]);
    const facts = notableFacts(placeStandings(tied, 0), cut);
    expect(facts.map((f) => [f.row.metric.label, f.end])).toEqual([
      ['Rent', 'first'],
    ]);
    expect(maxNotableTie(20)).toBe(2);
    expect(maxNotableTie(5)).toBe(1);
  });

  test('metricsWithData counts rankable values per place', () => {
    expect(Array.from(metricsWithData(data))).toEqual([7, 6, 6, 6, 7]);
  });

  test('metricsWithData counts base metrics too, like the profile list', () => {
    const withBase = fixture(names, [
      [
        metric(-1, 'Population', 0, ['population'], { base: true }),
        [5, 4, 3, 2, 1],
      ],
      [income, [90, Number.NaN, 70, 10, 30]],
    ]);
    expect(Array.from(metricsWithData(withBase))).toEqual([2, 1, 2, 2, 2]);
  });
});

describe('similarity basis', () => {
  // 30 places with reproducible pseudo-random values.
  const n = 30;
  const names = Array.from({ length: n }, (_, i) => `p${i}`);
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const randomColumn = () => names.map(() => Math.round(rand() * 1e6) / 100);
  const pop = names.map((_, i) => Math.round(1e6 / (i + 1)));
  const crime = randomColumn();
  const pay = (id: number, label: string) =>
    metric(id, label, 1, ['health'], { topics: ['pay'] });
  const data = fixture(names, [
    [metric(-1, 'Population', 0, ['population'], { base: true }), pop],
    [metric(-5, 'Area', 0, ['geography'], { base: true }), randomColumn()],
    [metric(-2, 'Density', 0, ['population'], { base: true }), randomColumn()],
    [metric(1, 'Income', 1), randomColumn()],
    [metric(2, 'Income', 1, ['economics'], { topics: ['t2'] }), randomColumn()],
    [
      metric(3, 'Overall Rank', -1, ['economics'], { fmt: 'ranking' }),
      randomColumn(),
    ],
    [
      metric(4, 'Seasons', 1, ['geography']),
      names.map((_, i) => (i % 5 === 0 ? 2 : 4)),
    ],
    [
      metric(5, 'Murders', -1, ['crime-safety']),
      pop.map((p) => p * (1 + rand())),
    ],
    [metric(6, 'Crime Rate', -1, ['crime-safety']), crime],
    [
      metric(7, 'Crimes per 1k', -1, ['crime-safety']),
      crime.map((v) => v * 10),
    ],
    [metric(8, 'Founded', 1, ['history']), names.map((_, i) => 1800 + i * 5)],
    [pay(9, 'Pay A'), randomColumn()],
    [pay(10, 'Pay B'), randomColumn()],
    [pay(11, 'Pay C'), randomColumn()],
    [metric(12, '% Catholic', 0, ['culture']), randomColumn()],
    [
      metric(13, 'Sparse', 1, ['education']),
      names.map((_, i) => (i % 2 === 0 ? rand() * 100 : Number.NaN)),
    ],
  ]);
  const basis = similarityBasis(data);

  test('density first, then directional metrics by category, neutral ones last', () => {
    // Left out: population and area (size), the repeated "Income" label, the rank column,
    // "Seasons" (two distinct values), murders (tracks population), "Crimes per 1k" (the
    // crime rate again), "Founded" (calendar years) and "Pay C" (a third metric from one
    // topic). Directional metrics rotate through categories; the sparse one goes last in
    // its round because broader coverage comes first.
    expect(basis.metricIds).toEqual([-2, 6, 1, 9, 13, 10, 12]);
    expect(basis.categories).toEqual([
      'population',
      'crime-safety',
      'economics',
      'health',
      'education',
      'health',
      'culture',
    ]);
    expect(basis.columns[1]).toEqual(percentile(crime, 1));
  });

  test('uses only the best-covered rung when it has enough directional metrics', () => {
    expect(similarityBasis(data, { limit: 3 }).metricIds).toEqual([-2, 6, 1]);
  });

  test('basisCoverage counts the basis metrics a place has', () => {
    expect(basisCoverage(basis, 0)).toBe(7);
    expect(basisCoverage(basis, 1)).toBe(6);
  });

  test('places with too few basis metrics get no matches', () => {
    expect(similarPlaces(basis, 0, n)).toEqual([]);
    expect(similarPlaces(basis, 0, n, { minMetrics: 3 })).toHaveLength(5);
  });
});

describe('similarPlaces', () => {
  const col = (values: number[]) => percentile(values, 1);
  const basis: SimilarityBasis = {
    metricIds: [1, 2, 3, 4],
    columns: [
      col([1, 2, 10, 11]),
      col([5, 6, 50, 60]),
      col([3, 3.5, 30, 40]),
      col([1, Number.NaN, 2, 3]),
    ],
    categories: ['a', 'b', 'c', 'd'],
  };

  test('nearest neighbour is the place with the closest percentiles', () => {
    const near = similarPlaces(basis, 0, 4, { limit: 2, minMetrics: 3 });
    expect(near.map((s) => s.index)).toEqual([1, 2]);
    expect(near[0].similarity).toBeGreaterThan(near[1].similarity);
    expect(near[0].shared).toBe(3);
  });

  test('candidates sharing too little of the basis are skipped', () => {
    const near = similarPlaces(basis, 0, 4, { minShared: 1, minMetrics: 3 });
    expect(near.map((s) => s.index)).toEqual([2, 3]);
  });
});

describe('diversifyByTopic', () => {
  test('takes one item per topic per round, keeping order within rounds', () => {
    const items = ['a1', 'a2', 'b1', 'a3', 'c1', 'b2'];
    expect(diversifyByTopic(items, (s) => s[0])).toEqual([
      'a1',
      'b1',
      'c1',
      'a2',
      'b2',
      'a3',
    ]);
  });

  test('strength lists prefer a second topic over a repeat of the first', () => {
    const names = ['a', 'b', 'c', 'd'];
    const pay = (id: number, label: string) =>
      metric(id, label, 1, ['economics'], { topics: ['pay'] });
    const data = fixture(names, [
      [pay(1, 'Hourly pay'), [40, 30, 20, 10]],
      [pay(2, 'Annual pay'), [80, 60, 40, 20]],
      [metric(3, 'Jobs', 1), [9, 10, 1, 2]],
      [metric(4, 'Tax', -1), [4, 1, 2, 3]],
      [metric(5, 'Rent', -1), [1, 2, 3, 4]],
      [metric(6, 'Crime', -1), [4, 3, 2, 1]],
    ]);
    const q = qualifyingRows(placeStandings(data, 0), { minN: 3, share: 0.5 });
    const { best } = strengthsAndWeaknesses(q, 2);
    expect(best.map((r) => r.metric.label)).toEqual(['Annual pay', 'Rent']);
  });
});

describe('dedupeKey', () => {
  test('ignores label case and whitespace but not values', () => {
    expect(dedupeKey(' Income ', [1.5])).toBe(dedupeKey('income', [1.5]));
    expect(dedupeKey('Income', [1.5])).not.toBe(dedupeKey('Income', [1.6]));
  });
});
