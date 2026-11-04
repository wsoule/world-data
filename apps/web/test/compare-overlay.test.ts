import { describe, expect, test } from 'bun:test';

import { correlationPairs } from '../src/features/compare/insights/correlation';
import { standingColumns } from '../src/features/compare/insights/standing';
import { presetSearch } from '../src/features/compare/presets';
import {
  analyzeScatter,
  type AxisMeaning,
  logTicks,
  outlierPoints,
  quadrants,
  rankTicks,
  relationshipSentence,
  residualLeaders,
  standingAxes,
  verdict,
} from '../src/features/compare/scatter/analysis';

const text = (parts: { text: string }[]) => parts.map((p) => p.text).join('');

const income: AxisMeaning = {
  label: 'Median Household Income',
  dir: 1,
  neutral: false,
  isRank: false,
};
const eduRank: AxisMeaning = {
  label: 'Education Rank',
  dir: -1,
  neutral: false,
  isRank: true,
};
const poverty: AxisMeaning = {
  label: 'Poverty Rate',
  dir: -1,
  neutral: false,
  isRank: false,
};
const crime: AxisMeaning = {
  label: 'Violent Crime Rate',
  dir: -1,
  neutral: false,
  isRank: false,
};
const area: AxisMeaning = {
  label: 'Land Area',
  dir: 1,
  neutral: true,
  isRank: false,
};

describe('analyzeScatter', () => {
  test('pairs values over the filtered places and fits a line', () => {
    const xs = [1, 2, 3, 4, NaN, 6];
    const ys = [3, 5, 7, 9, 11, NaN];
    const a = analyzeScatter({
      entityIdx: [0, 1, 2, 3, 4, 5],
      xs,
      ys,
      logX: false,
      logY: false,
    });
    expect(a.points.map((p) => p.idx)).toEqual([0, 1, 2, 3]);
    expect(a.missing).toBe(2);
    expect(a.pearson.r).toBeCloseTo(1, 10);
    expect(a.regression.slope).toBeCloseTo(2, 10);
    expect(Array.from(a.predicted)).toEqual([3, 5, 7, 9]);
    expect(a.medianX).toBe(2.5);
  });

  test('only uses a log axis when every value is positive', () => {
    const a = analyzeScatter({
      entityIdx: [0, 1, 2],
      xs: [10, 100, 1000],
      ys: [0, 1, 2],
      logX: true,
      logY: true,
    });
    expect(a.canLogX).toBe(true);
    expect(a.logX).toBe(true);
    expect(a.canLogY).toBe(false);
    expect(a.logY).toBe(false);
    // y = log10(x) - 1 exactly, so the log fit is perfect.
    expect(a.pearson.r).toBeCloseTo(1, 10);
    expect(a.points.map((p) => p.tx)).toEqual([1, 2, 3]);
  });
});

describe('relationshipSentence', () => {
  const strong = { r: -0.6, n: 50, p: 0.0001 };

  test('reads a rank metric from its best end', () => {
    const s = text(relationshipSentence(strong, eduRank, income, 'States'));
    expect(s).toBe(
      'States that rank better on Education Rank tend to have higher Median Household Income.'
    );
    expect(verdict(strong, eduRank, income)).toBe('together');
  });

  test('uses the low end for lower-is-better metrics', () => {
    const c = { r: 0.45, n: 51, p: 0.001 };
    const s = text(relationshipSentence(c, poverty, crime, 'States'));
    expect(s).toBe(
      'States with lower Poverty Rate tend to have lower Violent Crime Rate.'
    );
    expect(verdict(c, poverty, crime)).toBe('together');
  });

  test('flags trade-offs, weak links, chance and no relationship', () => {
    expect(verdict({ r: 0.5, n: 50, p: 0.001 }, income, crime)).toBe(
      'trade-off'
    );
    const weak = text(
      relationshipSentence({ r: 0.2, n: 20, p: 0.4 }, income, crime, 'States')
    );
    expect(weak).toContain('only slightly tend to have higher');
    expect(weak).toContain('could easily be chance');
    expect(
      text(
        relationshipSentence({ r: 0.05, n: 50, p: 0.7 }, area, income, 'States')
      )
    ).toStartWith('There is no clear link');
    expect(verdict({ r: 0.8, n: 50, p: 0 }, area, income)).toBeNull();
  });

  test('gives no verdict when the correlation could be chance', () => {
    expect(verdict({ r: -0.16, n: 50, p: 0.258 }, eduRank, income)).toBeNull();
    expect(verdict({ r: -0.16, n: 500, p: 0.0003 }, eduRank, income)).toBe(
      'together'
    );
  });

  test('keeps the raw-value r next to a log-scale r', () => {
    const xs = [1, 10, 100, 1000, 10000];
    const ys = [1, 2, 3, 4, 5];
    const base = { entityIdx: [0, 1, 2, 3, 4], xs, ys, logY: false };
    const logged = analyzeScatter({ ...base, logX: true });
    expect(logged.pearson.r).toBeCloseTo(1);
    expect(logged.unloggedPearson.r).toBeLessThan(0.9);
    const plain = analyzeScatter({ ...base, logX: false });
    expect(plain.unloggedPearson).toBe(plain.pearson);
  });
});

describe('overlay read by standing', () => {
  // 30 places, better off as the index grows: income rises, the best-first education rank falls
  // (rank 1 = best), violent crime falls, all with some scatter.
  const n = 30;
  const idx = Array.from({ length: n }, (_, i) => i);
  const score = (i: number) => i + (((i * 13) % 7) - 3) * 2.5;
  const eduRanks = new Float64Array(n);
  [...idx]
    .sort((a, b) => score(b) - score(a))
    .forEach((place, k) => (eduRanks[place] = k + 1));
  const incomes = Float64Array.from(
    idx,
    (i) => 40_000 + i * 2_000 + (((i * 37) % 11) - 5) * 3_000
  );
  const crimes = Float64Array.from(
    idx,
    (i) => 900 - i * 20 + ((i * 11) % 7) * 45
  );
  const base = { entityIdx: idx, logX: false, logY: false };
  const stored = analyzeScatter({ ...base, xs: eduRanks, ys: incomes });
  const read = analyzeScatter({
    ...base,
    xs: eduRanks,
    ys: incomes,
    standing: { x: true, y: false },
  });

  test('a best-first rank against income: positive r and ρ, same p, n and R²', () => {
    expect(stored.pearson.r).toBeLessThan(-0.5);
    expect(read.signFlipped).toBe(true);
    expect(read.negated).toEqual({ x: true, y: false });
    expect(read.pearson.r).toBeGreaterThan(0.5);
    expect(read.spearman.r).toBeGreaterThan(0.5);
    expect(read.pearson.r).toBe(-stored.pearson.r);
    expect(read.spearman.r).toBe(-stored.spearman.r);
    expect(read.unloggedPearson.r).toBe(read.pearson.r);
    expect(read.pearson.p).toBe(stored.pearson.p);
    expect(read.pearson.n).toBe(stored.pearson.n);
    expect(read.regression.r2).toBe(stored.regression.r2);
    // The coefficients on the rank numbers as listed stay available for the footnote.
    expect(read.stored.pearson).toEqual(stored.pearson);
    expect(read.stored.spearman).toEqual(stored.spearman);
  });

  test('matches the correlation matrix for the same pair', () => {
    const st = standingColumns(
      [
        { fmt: 'ranking', pol: -1 },
        { fmt: 'moneyWithCurrency', pol: 1 },
      ],
      [eduRanks, incomes],
      [-1, 1]
    );
    const [pair] = correlationPairs(st.columns, [1, 2]);
    expect(read.pearson.r).toBeCloseTo(pair.pearson.r, 12);
    expect(read.spearman.r).toBeCloseTo(pair.spearman.r, 12);
    // The same pair with the rank on y, as a click on the matrix's rank row opens it.
    const swapped = analyzeScatter({
      ...base,
      xs: incomes,
      ys: eduRanks,
      standing: { x: false, y: true },
    });
    expect(swapped.pearson.r).toBeCloseTo(pair.pearson.r, 12);
  });

  test('a normal pair keeps its raw r', () => {
    const plain = analyzeScatter({
      ...base,
      xs: incomes,
      ys: crimes,
      standing: { x: false, y: false },
    });
    expect(plain.signFlipped).toBe(false);
    expect(plain.pearson.r).toBeLessThan(-0.5);
    expect(plain.pearson).toBe(plain.stored.pearson);
    expect(plain.spearman).toBe(plain.stored.spearman);
    // Leaving `standing` out reads every axis by its stored number.
    expect(
      analyzeScatter({ ...base, xs: incomes, ys: crimes }).pearson
    ).toEqual(plain.pearson);
  });

  test('two best-first ranks keep their sign', () => {
    const other = Float64Array.from(eduRanks, (v, i) => (i === 9 ? v + 3 : v));
    const both = analyzeScatter({
      ...base,
      xs: eduRanks,
      ys: other,
      standing: { x: true, y: true },
    });
    expect(both.signFlipped).toBe(false);
    expect(both.pearson.r).toBeGreaterThan(0.9);
  });

  test('a log axis flips the unlogged r with the plotted one', () => {
    const logged = analyzeScatter({
      ...base,
      xs: eduRanks,
      ys: incomes,
      logX: true,
      standing: { x: true, y: false },
    });
    expect(logged.logX).toBe(true);
    expect(logged.pearson.r).toBeGreaterThan(0);
    expect(logged.unloggedPearson.r).toBe(read.pearson.r);
    expect(logged.stored.pearson.r).toBe(-logged.pearson.r);
  });

  test('words and verdict read the same, and agree with the standing sign', () => {
    const axes = standingAxes(read, eduRank, income);
    expect(axes.x).toEqual({ ...eduRank, dir: 1 });
    expect(axes.y).toBe(income);
    const sentence = text(
      relationshipSentence(read.pearson, axes.x, axes.y, 'States')
    );
    expect(sentence).toBe(
      text(relationshipSentence(stored.pearson, eduRank, income, 'States'))
    );
    expect(sentence).toStartWith(
      'States that rank better on Education Rank tend to have higher Median Household Income'
    );
    expect(verdict(read.pearson, axes.x, axes.y)).toBe('together');
    // Without a negated axis the meanings are passed through.
    expect(standingAxes(stored, eduRank, income).x).toBe(eduRank);
  });

  test('four groups and over/under-performers stay on the stored numbers', () => {
    expect(read.points).toEqual(stored.points);
    expect(read.medianX).toBe(stored.medianX);
    expect(read.regression.slope).toBe(stored.regression.slope);
    expect([...read.predicted]).toEqual([...stored.predicted]);
    expect(quadrants(read, eduRank, income)).toEqual(
      quadrants(stored, eduRank, income)
    );
    expect(residualLeaders(read, income)).toEqual(
      residualLeaders(stored, income)
    );
    // The best-on-both cell is the low-rank-number, high-income one.
    const best = quadrants(read, eduRank, income).cells.find((c) => c.best);
    expect(best?.xHigh).toBe(false);
    expect(best?.yHigh).toBe(true);
  });
});

describe('quadrants and residuals', () => {
  // y = x except one place far above the line and one far below.
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  const ys = [1, 2, 9, 4, 5, 6, 0, 8];
  const a = analyzeScatter({
    entityIdx: xs.map((_, i) => i),
    xs,
    ys,
    logX: false,
    logY: false,
  });

  test('splits at the medians and marks the best-on-both cell', () => {
    const { cells, onMedian } = quadrants(a, income, income);
    expect(onMedian).toBe(0);
    const total = cells.reduce((n, c) => n + c.members.length, 0);
    expect(total).toBe(8);
    const best = cells.filter((c) => c.best);
    expect(best).toHaveLength(1);
    expect(best[0].xHigh && best[0].yHigh).toBe(true);
  });

  test('never calls a cell best when exactly one metric is neutral', () => {
    const { cells } = quadrants(a, area, income);
    expect(cells.filter((c) => c.best)).toEqual([]);
    // Members are ordered by the directional metric (y) alone: place 2 (y = 9) leads its cell.
    const highY = cells.find((c) => !c.xHigh && c.yHigh);
    expect(a.points[highY?.members[0] ?? -1].idx).toBe(2);
  });

  test('marks the high-on-both cell when both metrics are neutral', () => {
    const best = quadrants(a, area, area).cells.filter((c) => c.best);
    expect(best).toHaveLength(1);
    expect(best[0].xHigh && best[0].yHigh).toBe(true);
  });

  test('over-performers follow the direction of the y metric', () => {
    const up = residualLeaders(a, income, 1);
    expect(a.points[up.better[0].point].idx).toBe(2);
    expect(a.points[up.worse[0].point].idx).toBe(6);
    const down = residualLeaders(a, crime, 1);
    expect(a.points[down.better[0].point].idx).toBe(6);
    expect(
      outlierPoints(a, 2)
        .map((i) => a.points[i].idx)
        .sort((p, q) => p - q)
    ).toEqual([2, 6]);
  });
});

describe('axis ticks', () => {
  test('log ticks use 1–3 steps over a few decades', () => {
    expect(logTicks(200, 200_000)).toEqual([
      300, 1000, 3000, 10_000, 30_000, 100_000,
    ]);
    expect(logTicks(15, 60)).toEqual([20, 50]);
    expect(logTicks(-1, 10)).toEqual([]);
  });

  test('rank ticks start at 1st and never go below it', () => {
    expect(rankTicks(52)).toEqual([1, 10, 20, 30, 40, 50]);
    expect(rankTicks(9)).toEqual([1, 3, 5, 7, 9]);
    expect(rankTicks(0)).toEqual([1]);
  });
});

describe('presetSearch', () => {
  test('opens the overlay with both axes and adds the size metric', () => {
    expect(
      presetSearch('country', {
        title: 'GDP vs happiness',
        description: '',
        x: 19182,
        y: 14450,
        r: -1,
        c: 'group',
        log: ['x'],
      })
    ).toEqual({
      type: 'country',
      view: 'scatter',
      m: [19182, 14450, -1],
      x: 19182,
      y: 14450,
      r: -1,
      c: 'group',
      log: ['x'],
    });
  });
});
