import { pearson } from '@world-data/stats';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isRankColumn,
  rankOrder,
  rankOrderNote,
  readsBackwards,
} from '../src/data/rankOrder';
import type { Metric } from '../src/data/types';
import { rankText } from '../src/features/places/percentile';
import {
  factHeadline,
  type NotableFact,
  standingAt,
} from '../src/features/places/profileModel';
import { findCorrelations } from '../src/features/topic/correlations';
import {
  listDirection,
  moverTitles,
  rankEntries,
  rankingOrderLabel,
} from '../src/features/topic/model';

const bestFirst = { fmt: 'ranking', pol: -1 } as const;
const worstFirst = { fmt: 'ranking', pol: 1 } as const;
const value = { fmt: 'numberWithCommas', pol: 1 } as const;

describe('rankOrder', () => {
  test('reads rank columns by polarity and leaves values alone', () => {
    expect(rankOrder(bestFirst)).toBe('best-first');
    expect(rankOrder(worstFirst)).toBe('worst-first');
    expect(rankOrder({ fmt: 'ranking', pol: 0 })).toBe('best-first');
    expect(rankOrder(value)).toBeNull();
    expect(rankOrder({ fmt: null, pol: -1 })).toBeNull();
  });

  test('follows a direction the reader picked', () => {
    expect(rankOrder(worstFirst, -1)).toBe('best-first');
    expect(rankOrder(bestFirst, 1)).toBe('worst-first');
  });

  test('only a best-first rank reads backwards', () => {
    expect(readsBackwards(bestFirst)).toBe(true);
    expect(readsBackwards(worstFirst)).toBe(false);
    expect(readsBackwards({ fmt: null, pol: -1 })).toBe(false);
    expect(isRankColumn(worstFirst)).toBe(true);
    expect(isRankColumn(value)).toBe(false);
  });

  test('names the end rank 1 is', () => {
    expect(rankOrderNote('best-first')).toBe('rank 1 is the best');
    expect(rankOrderNote('worst-first')).toBe('rank 1 is the worst');
  });

  test('marks the worst-first lists of the dataset', () => {
    const states = JSON.parse(
      readFileSync(
        join(import.meta.dir, '../public/data/state/metrics.json'),
        'utf8'
      )
    ) as Metric[];
    const byId = new Map(states.map((m) => [m.id, m]));
    // Worst States to Live In: Louisiana is 1st, Utah 50th.
    for (const id of [23998, 24006])
      expect(rankOrder(byId.get(id) ?? value)).toBe('worst-first');
    // Best States for Education: rank 1 is the best.
    expect(rankOrder(byId.get(20594) ?? value)).toBe('best-first');
  });
});

describe('rankText', () => {
  test('counts from the best place by default', () => {
    expect(rankText({ rank: 1, n: 50, tied: 1 })).toBe('1st of 50');
    expect(rankText({ rank: 50, n: 50 })).toBe('50th of 50');
    expect(rankText({ rank: 1, n: 50 }, 'best-first')).toBe('1st of 50');
  });

  test('names best or worst outright on a worst-first list', () => {
    // Louisiana holds rank 1 on a worst-first list: the worst of 50.
    expect(rankText({ rank: 50, n: 50, tied: 1 }, 'worst-first')).toBe(
      'worst of 50'
    );
    expect(rankText({ rank: 49, n: 50 }, 'worst-first')).toBe(
      '2nd worst of 50'
    );
    expect(rankText({ rank: 1, n: 50 }, 'worst-first')).toBe('best of 50');
    expect(rankText({ rank: 3, n: 50 }, 'worst-first')).toBe('3rd best of 50');
    expect(rankText({ rank: 25, n: 50 }, 'worst-first')).toBe(
      '25th best of 50'
    );
    expect(rankText({ rank: 26, n: 50 }, 'worst-first')).toBe(
      '25th worst of 50'
    );
    expect(rankText({ rank: 49, n: 50, tied: 2 }, 'worst-first')).toBe(
      'tied worst of 50'
    );
  });
});

describe('topic page order', () => {
  // Worst-first ranks: Louisiana (index 0) is 1st, Utah (index 2) is 50th.
  const ranks = [1, 25, 50];

  test('lists a rank column from rank 1, values best first', () => {
    expect(listDirection(worstFirst)).toBe(-1);
    expect(listDirection(bestFirst)).toBe(-1);
    expect(listDirection({ fmt: null, pol: 1 })).toBe(1);
    expect(listDirection({ fmt: null, pol: -1 })).toBe(-1);
    const ranked = rankEntries(ranks, listDirection(worstFirst));
    expect(ranked.map((e) => e.index)).toEqual([0, 1, 2]);
    // The # column matches the column's own numbers.
    expect(ranked.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  test('labels the order by what comes first', () => {
    expect(rankingOrderLabel(worstFirst, false)).toBe('Worst first');
    expect(rankingOrderLabel(worstFirst, true)).toBe('Best first');
    expect(rankingOrderLabel(bestFirst, false)).toBe('Best first');
    expect(rankingOrderLabel(bestFirst, true)).toBe('Worst first');
    expect(rankingOrderLabel({ fmt: null, pol: -1 }, false)).toBe('Best first');
    expect(rankingOrderLabel({ fmt: null, pol: 0 }, false)).toBe(
      'Highest first'
    );
  });

  test('only a best-first rank climbs and falls', () => {
    expect(moverTitles(bestFirst)).toEqual({
      gains: 'Climbed',
      losses: 'Fell',
    });
    expect(moverTitles(worstFirst)).toEqual({
      gains: 'Improved most',
      losses: 'Declined most',
    });
    expect(moverTitles({ fmt: null, pol: 0 }).gains).toBe('Largest increases');
  });
});

describe('factHeadline', () => {
  const metric = (pol: 1 | -1): Metric => ({
    id: 1,
    key: 'k',
    label: 'Healthcare Rank',
    fmt: 'ranking',
    unit: null,
    kind: 'num',
    pol,
    year: 2025,
    years: [2025],
    n: 3,
    topics: [],
    cats: [],
    updated: null,
  });
  const fact = (pol: 1 | -1, index: number): NotableFact => {
    const direction = pol === -1 ? -1 : 1;
    const standing = standingAt([1, 2, 3], index, direction);
    if (standing == null) throw new Error('no standing');
    return {
      row: { metric: metric(pol), standing, direction, polar: true },
      end: standing.better === 0 ? 'first' : 'last',
    };
  };

  test('names rank 1 as #1 on either list', () => {
    // Best-first: rank 1 is the best place.
    expect(factHeadline(fact(-1, 0))).toBe('#1 in Healthcare Rank');
    expect(factHeadline(fact(-1, 2))).toBe('Last in Healthcare Rank');
    // Worst-first: rank 1 is the worst place, last is the best.
    const worst = fact(1, 0);
    expect(worst.end).toBe('last');
    expect(factHeadline(worst)).toBe('#1 in Healthcare Rank');
    const best = fact(1, 2);
    expect(best.end).toBe('first');
    expect(factHeadline(best)).toBe('Last in Healthcare Rank');
  });
});

describe('correlations read ranks by standing', () => {
  // Twelve places, best to worst: a worst-first rank shrinks towards 1 as places get worse, a
  // best-first rank of a similar list grows, poverty grows and income falls.
  const worstFirstRank = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const bestFirstRank = [1, 3, 2, 4, 6, 5, 7, 9, 8, 10, 12, 11];
  const poverty = [10, 13, 12, 18, 20, 25, 22, 27, 30, 29, 35, 33];
  const income = [90, 85, 70, 72, 50, 40, 45, 38, 36, 30, 31, 28];
  const cols = new Map<number, number[]>([
    [1, bestFirstRank],
    [2, poverty],
    [3, income],
  ]);
  const flip =
    (backwards: (id: number) => boolean, focusBackwards: boolean) =>
    (id: number) =>
      backwards(id) !== focusBackwards;

  test('a worst-first focus goes together with the best-first list it mirrors', () => {
    const res = findCorrelations(
      worstFirstRank,
      [...cols.keys()].map((id) => ({ id, n: 12 })),
      (id) => cols.get(id) ?? [],
      6,
      undefined,
      flip((id) => id === 1, false)
    );
    // Ranking better on the worst list goes with ranking better on the best list and with
    // higher income, and against poverty.
    expect(res.positive.map((h) => h.id).sort((a, b) => a - b)).toEqual([1, 3]);
    expect(res.negative.map((h) => h.id)).toEqual([2]);
    // The best-first list is reported with its standing r, positive like its group; the
    // measured values next to the worst-first focus keep their raw r.
    const best = res.positive.find((h) => h.id === 1);
    expect(best?.flipped).toBe(true);
    expect(best?.r).toBeGreaterThan(0.9);
    expect(best?.r).toBeCloseTo(-pearson(worstFirstRank, bestFirstRank).r, 12);
    const incomeHit = res.positive.find((h) => h.id === 3);
    expect(incomeHit?.flipped).toBe(false);
    expect(incomeHit?.r).toBe(pearson(worstFirstRank, income).r);
  });

  test('a value focus reports a best-first rank by standing and a worst-first rank as is', () => {
    const ranks = new Map<number, number[]>([
      [1, bestFirstRank],
      [4, worstFirstRank],
    ]);
    const res = findCorrelations(
      income,
      [...ranks.keys()].map((id) => ({ id, n: 12 })),
      (id) => ranks.get(id) ?? [],
      6,
      undefined,
      flip((id) => id === 1, false)
    );
    // Richer places rank better on both lists: both land under "Higher together" with r > 0.
    const best = res.positive.find((h) => h.id === 1);
    const worst = res.positive.find((h) => h.id === 4);
    expect(best?.flipped).toBe(true);
    expect(best?.r).toBeCloseTo(-pearson(income, bestFirstRank).r, 12);
    expect(best?.r).toBeGreaterThan(0);
    expect(worst?.flipped).toBe(false);
    expect(worst?.r).toBe(pearson(income, worstFirstRank).r);
    expect(worst?.r).toBeGreaterThan(0);
    expect(res.negative).toEqual([]);
  });

  test('a best-first focus reports values by standing', () => {
    const res = findCorrelations(
      bestFirstRank,
      [2, 3].map((id) => ({ id, n: 12 })),
      (id) => cols.get(id) ?? [],
      6,
      undefined,
      flip(() => false, true)
    );
    // Ranking better on the focus list goes with higher income (r > 0) and less poverty (r < 0).
    expect(res.positive.map((h) => h.id)).toEqual([3]);
    expect(res.negative.map((h) => h.id)).toEqual([2]);
    expect(res.positive[0].r).toBeGreaterThan(0);
    expect(res.negative[0].r).toBeLessThan(0);
    expect(res.positive[0].flipped).toBe(true);
  });
});
