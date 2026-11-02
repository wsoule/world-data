import { competitionRank, percentile } from '@world-data/stats';
import { describe, expect, test } from 'bun:test';

import type { Metric } from '../src/data/types';
import { rankText } from '../src/features/places/percentile';
import {
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
  similarityBasis,
  similarPlaces,
  sizeDrivenMetrics,
  standingAt,
  strengthsAndWeaknesses,
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
});

describe('similarity', () => {
  const names = ['a', 'b', 'c', 'd'];
  const data = fixture(names, [
    [metric(1, 'One', 1), [1, 2, 10, 11]],
    [metric(2, 'Two', 1), [5, 6, 50, 60]],
    [metric(3, 'Three', -1), [3, 3.5, 30, 40]],
    [metric(4, 'Three', 1), [7, 8, 9, 10]],
    [metric(5, 'Four', 0), [1, Number.NaN, 2, 3]],
  ]);

  test('basis keeps one metric per label, best covered first', () => {
    const basis = similarityBasis(data, 10);
    expect(basis.metricIds).toEqual([1, 2, 3, 5]);
    expect(basis.columns[0][0]).toBe(0);
  });

  test('nearest neighbour is the place with the closest percentiles', () => {
    const basis = similarityBasis(data, 10);
    const near = similarPlaces(basis, 0, names.length, { limit: 2 });
    expect(near.map((s) => s.index)).toEqual([1, 2]);
    expect(near[0].similarity).toBeGreaterThan(near[1].similarity);
    expect(near[0].shared).toBe(3);
  });

  test('candidates sharing too little of the basis are skipped', () => {
    const basis = similarityBasis(data, 10);
    const near = similarPlaces(basis, 0, names.length, { minShared: 1 });
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
