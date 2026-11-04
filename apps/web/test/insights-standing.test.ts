import { strength } from '@world-data/stats';
import { describe, expect, test } from 'bun:test';

import { correlationPairs } from '../src/features/compare/insights/correlation';
import {
  buildFindings,
  type Finding,
  largestResidual,
  outlierPosition,
  togetherDetail,
  togetherSentence,
} from '../src/features/compare/insights/findings';
import {
  hasRankColumn,
  standingColumns,
} from '../src/features/compare/insights/standing';
import type { SentencePart } from '../src/features/compare/scatter/analysis';

// 30 synthetic states, better off as the index grows, with some scatter. Income rises; the
// best-first education rank falls (rank 1 = best, so richer states have smaller numbers); the
// worst-first "Worst States" rank rises (rank 1 = worst); violent crime falls.
const n = 30;
const idx = Array.from({ length: n }, (_, i) => i);
/** List positions 1…n of `score`, rank 1 for the highest score or (`lowFirst`) the lowest. */
const ranksOf = (score: (i: number) => number, lowFirst: boolean) => {
  const order = [...idx].sort((a, b) =>
    lowFirst ? score(a) - score(b) : score(b) - score(a)
  );
  const out = new Float64Array(n);
  order.forEach((place, k) => (out[place] = k + 1));
  return out;
};
const income = Float64Array.from(
  idx,
  (i) => 40_000 + i * 2_000 + (((i * 37) % 11) - 5) * 3_000
);
const eduRank = ranksOf((i) => i + (((i * 13) % 7) - 3) * 2.5, false);
const worstRank = ranksOf((i) => i + (((i * 5) % 9) - 4) * 2, true);
const crime = Float64Array.from(idx, (i) => 900 - i * 20 + ((i * 11) % 7) * 45);

const incomeM = {
  id: 1,
  label: 'Median Household Income',
  fmt: 'moneyWithCurrency',
  pol: 1 as const,
};
const eduM = {
  id: 2,
  label: 'Best Education Rank',
  fmt: 'ranking',
  pol: -1 as const,
};
const crimeM = {
  id: 3,
  label: 'Violent Crime Rate',
  fmt: 'number',
  pol: -1 as const,
};
const worstM = {
  id: 4,
  label: 'Worst States Rank',
  fmt: 'ranking',
  pol: 1 as const,
};

// Basket order puts the education rank first, so its findings lead with it.
const basket = [eduM, incomeM, crimeM, worstM];
const raw = [eduRank, income, crime, worstRank];
const directions = basket.map((m) => m.pol);
const standing = standingColumns(basket, raw, directions);
const ids = basket.map((m) => m.id);
const pairs = correlationPairs(standing.columns, ids);
const rawPairs = correlationPairs(raw, ids);
const pairOf = (list: typeof pairs, a: number, b: number) => {
  const p = list.find((x) => x.a === a && x.b === b);
  if (p == null) throw new Error(`no pair ${a}:${b}`);
  return p;
};

const text = (parts: SentencePart[]) => parts.map((p) => p.text).join('');
const together = (fs: Finding[]) =>
  fs.filter(
    (f): f is Extract<Finding, { kind: 'together' }> => f.kind === 'together'
  );

describe('standingColumns', () => {
  test('negates best-first ranks only and makes them higher-is-better', () => {
    expect(standing.flipped).toEqual([true, false, false, false]);
    expect(standing.directions).toEqual([1, 1, -1, 1]);
    expect([...standing.columns[0]]).toEqual([...eduRank].map((v) => -v));
    // Worst-first ranks and measured values are passed through untouched.
    expect(standing.columns[1]).toBe(income);
    expect(standing.columns[2]).toBe(crime);
    expect(standing.columns[3]).toBe(worstRank);
  });

  test('honours a direction the reader picked in the compare basket', () => {
    // "Higher is better" on a best-first rank reads it like a worst-first list: no flip.
    expect(standingColumns([eduM], [eduRank], [1]).flipped).toEqual([false]);
    // "Lower is better" on a worst-first rank makes rank 1 the best: flipped.
    const w = standingColumns([worstM], [worstRank], [-1]);
    expect(w.flipped).toEqual([true]);
    expect(w.directions).toEqual([1]);
  });

  test('keeps missing values missing', () => {
    const col = Float64Array.from([3, NaN, 1]);
    const s = standingColumns([eduM], [col], [-1]);
    expect(Number.isNaN(s.columns[0][1])).toBe(true);
    expect(s.columns[0][0]).toBe(-3);
  });

  test('hasRankColumn spots a rank column in either order', () => {
    expect(hasRankColumn(basket)).toBe(true);
    expect(hasRankColumn([incomeM, crimeM])).toBe(false);
    expect(hasRankColumn([worstM])).toBe(true);
  });
});

describe('correlation matrix read by standing', () => {
  test('a better best-first rank with higher income reads positive', () => {
    const p = pairOf(pairs, eduM.id, incomeM.id);
    const before = pairOf(rawPairs, eduM.id, incomeM.id);
    expect(before.pearson.r).toBeLessThan(-0.5);
    expect(p.pearson.r).toBeGreaterThan(0.5);
    expect(p.spearman.r).toBeGreaterThan(0.5);
    expect(p.pearson.r).toBeCloseTo(-before.pearson.r, 12);
    expect(p.spearman.r).toBeCloseTo(-before.spearman.r, 12);
    expect(p.pearson.p).toBeCloseTo(before.pearson.p, 12);
    expect(p.pearson.n).toBe(before.pearson.n);
  });

  test('a worst-first rank and a normal pair are unchanged', () => {
    for (const [a, b] of [
      [incomeM.id, crimeM.id],
      [incomeM.id, worstM.id],
      [crimeM.id, worstM.id],
    ]) {
      const p = pairOf(pairs, a, b);
      const before = pairOf(rawPairs, a, b);
      expect(p.pearson.r).toBe(before.pearson.r);
      expect(p.spearman.r).toBe(before.spearman.r);
    }
    expect(pairOf(pairs, incomeM.id, worstM.id).pearson.r).toBeGreaterThan(0.5);
    expect(pairOf(pairs, incomeM.id, crimeM.id).pearson.r).toBeLessThan(-0.5);
  });

  test('two best-first ranks keep their raw sign', () => {
    const other = Float64Array.from(eduRank, (v, i) => (i === 9 ? v + 3 : v));
    const two = standingColumns([eduM, eduM], [eduRank, other], [-1, -1]);
    const [p] = correlationPairs(two.columns, [1, 2]);
    const [before] = correlationPairs([eduRank, other], [1, 2]);
    expect(p.pearson.r).toBeCloseTo(before.pearson.r, 12);
    expect(p.pearson.r).toBeGreaterThan(0.9);
  });
});

describe('findings read by standing', () => {
  type M = (typeof basket)[number];
  /** Build the findings of a basket the way the Correlations view does (standing columns). */
  const findingsOf = (ms: readonly M[]) => {
    const cols = ms.map((m) => raw[basket.indexOf(m)]);
    const st = standingColumns(
      ms,
      cols,
      ms.map((m) => m.pol)
    );
    return buildFindings({
      metrics: ms.map((m, k) => ({
        id: m.id,
        direction: st.directions[k],
        values: st.columns[k],
      })),
      pairs: correlationPairs(
        st.columns,
        ms.map((m) => m.id)
      ),
      method: 'pearson',
    });
  };
  /** The relationship finding of a two-metric basket. */
  const findingFor = (a: M, b: M) => {
    const f = together(findingsOf([a, b]))[0];
    if (f == null) throw new Error(`no finding ${a.id}:${b.id}`);
    return f;
  };
  const found = together(findingsOf(basket));

  test('a better rank with higher income: positive sign, sentence and label agree', () => {
    const f = findingFor(eduM, incomeM);
    expect(f.sign).toBe(1);
    expect(f.r).toBeGreaterThan(0);
    expect(text(togetherSentence(f, eduM, incomeM, 'states'))).toBe(
      'States with a better Best Education Rank tend to have higher Median Household Income.'
    );
    const detail = togetherDetail(f, 'r', true);
    const s = strength(f.r);
    expect(
      detail.startsWith(
        `${s.charAt(0).toUpperCase()}${s.slice(1)} positive correlation · r = 0.`
      )
    ).toBe(true);
    expect(detail).not.toContain('−');
    expect(detail.endsWith(' · a better rank counts as higher')).toBe(true);
  });

  test('a better rank with less crime: negative sign, "lower" in the sentence', () => {
    const f = findingFor(eduM, crimeM);
    expect(f.sign).toBe(-1);
    expect(f.r).toBeLessThan(0);
    expect(text(togetherSentence(f, eduM, crimeM, 'states'))).toBe(
      'States with a better Best Education Rank tend to have lower Violent Crime Rate.'
    );
    expect(togetherDetail(f, 'r', true)).toMatch(
      / negative correlation · r = −0\.\d\d · /
    );
  });

  test('a normal pair reads as before', () => {
    const f = findingFor(incomeM, crimeM);
    const before = pairOf(rawPairs, incomeM.id, crimeM.id);
    expect(f.sign).toBe(-1);
    expect(f.r).toBe(before.pearson.r);
    expect(text(togetherSentence(f, incomeM, crimeM, 'states'))).toBe(
      'States with higher Median Household Income tend to have lower Violent Crime Rate.'
    );
    const detail = togetherDetail(f, 'r', false);
    expect(detail).toContain(' negative correlation · r = −0.');
    expect(detail).not.toContain('rank');
  });

  test('a worst-first rank is worded by standing without a flip', () => {
    const f = findingFor(incomeM, worstM);
    expect(f.sign).toBe(1);
    expect(text(togetherSentence(f, incomeM, worstM, 'states'))).toBe(
      'States with higher Median Household Income tend to have a better Worst States Rank.'
    );
  });

  test('every relationship finding has one sign in its r, label and sentence', () => {
    expect(found.length).toBeGreaterThan(0);
    for (const f of found) {
      const A = basket.find((m) => m.id === f.pair.a);
      const B = basket.find((m) => m.id === f.pair.b);
      if (A == null || B == null) throw new Error('unknown metric');
      expect(Math.sign(f.r)).toBe(f.sign);
      const detail = togetherDetail(f, 'r', false);
      expect(detail).toContain(f.sign > 0 ? ' positive ' : ' negative ');
      expect(detail.startsWith(strength(f.r).charAt(0).toUpperCase())).toBe(
        true
      );
      const sentence = text(togetherSentence(f, A, B, 'states'));
      const up = B.fmt === 'ranking' ? 'a better' : 'higher';
      const down = B.fmt === 'ranking' ? 'a worse' : 'lower';
      expect(sentence).toContain(
        `tend to have ${f.sign > 0 ? up : down} ${B.label}`
      );
    }
  });
});

describe('outliers read by standing', () => {
  // One rich state (place 25, rank 5 by the pattern) ranks 28th on education.
  const odd = Float64Array.from(eduRank, (v, i) => (i === 25 ? 28 : v));
  const s = standingColumns([eduM], [odd], [-1]);

  test('a rank far worse than the trend is below the line', () => {
    const fit = largestResidual(income, s.columns[0]);
    expect(fit?.place).toBe(25);
    expect(fit?.z ?? 0).toBeLessThan(-2);
    expect(outlierPosition(eduM, fit?.z ?? 0)).toEqual({
      rank: true,
      words: 'far worse',
    });
  });

  test('measured values still read above and below the line', () => {
    expect(outlierPosition(incomeM, 2.4).words).toBe('well above');
    expect(outlierPosition(crimeM, -3).words).toBe('well below');
    expect(outlierPosition(worstM, 2.4).words).toBe('far better');
  });
});
