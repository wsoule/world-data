import { describe, expect, test } from 'bun:test';

import {
  correlationPairs,
  formatP,
  formatR,
  pickRows,
} from '../src/features/compare/insights/correlation';
import {
  buildFindings,
  type Finding,
  largestResidual,
  tallyExtremes,
} from '../src/features/compare/insights/findings';

// 30 synthetic places. `income` and `degrees` rise together, `crime` falls as income rises,
// `noise` is unrelated to everything, and place 7 breaks the income/degrees pattern.
const n = 30;
const idx = Array.from({ length: n }, (_, i) => i);
const income = idx.map((i) => 40 + i * 2 + ((i * 7) % 3));
const degrees = idx.map((i) => (i === 7 ? 95 : 20 + i * 1.5 + ((i * 5) % 4)));
const crime = idx.map((i) => 900 - i * 20 + ((i * 11) % 7) * 5);
const noise = idx.map((i) => [3, 9, 1, 7, 5, 8, 2, 6, 4, 10][i % 10] + (i % 3));

const metrics = [
  { id: 1, direction: 1 as const, values: Float64Array.from(income) },
  { id: 2, direction: 1 as const, values: Float64Array.from(degrees) },
  { id: 3, direction: -1 as const, values: Float64Array.from(crime) },
  { id: 4, direction: 1 as const, values: Float64Array.from(noise) },
];
const pairs = correlationPairs(
  metrics.map((m) => m.values),
  metrics.map((m) => m.id)
);

const ofKind = <K extends Finding['kind']>(fs: Finding[], kind: K) =>
  fs.filter((f): f is Extract<Finding, { kind: K }> => f.kind === kind);

describe('correlation helpers', () => {
  test('pairs every metric once in basket order', () => {
    expect(pairs.map((p) => [p.a, p.b])).toEqual([
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
      [3, 4],
    ]);
  });

  test('pickRows copies the selected entities', () => {
    expect([...pickRows([5, 6, 7, 8], [3, 1])]).toEqual([8, 6]);
  });

  test('formats r with a true minus sign and p-values readably', () => {
    expect(formatR(-0.456)).toBe('−0.46');
    expect(formatR(0.004)).toBe('0.00');
    expect(formatR(-0.001)).toBe('0.00');
    expect(formatR(NaN)).toBe('n/a');
    expect(formatP(0.0004)).toBe('p < 0.001');
    expect(formatP(0.0123)).toBe('p = 0.012');
    expect(formatP(0.34)).toBe('p = 0.34');
  });
});

describe('buildFindings', () => {
  const findings = buildFindings({ metrics, pairs, method: 'pearson' });

  test('reports the strongest positive and negative relationships', () => {
    const together = ofKind(findings, 'together');
    const pos = together.filter((f) => f.sign === 1);
    const neg = together.filter((f) => f.sign === -1);
    expect(pos.length).toBeGreaterThan(0);
    expect(neg.length).toBeGreaterThan(0);
    expect([pos[0].pair.a, pos[0].pair.b]).toEqual([1, 2]);
    expect(neg.some((f) => f.pair.a === 1 && f.pair.b === 3)).toBe(true);
    for (const f of together) {
      expect(f.p).toBeLessThan(0.05);
      expect(f.n).toBe(n);
    }
  });

  test('flags unrelated pairs only when there is enough data', () => {
    const unrelated = ofKind(findings, 'unrelated');
    expect(unrelated.length).toBeGreaterThan(0);
    for (const f of unrelated) {
      expect(Math.abs(f.r)).toBeLessThan(0.15);
      expect(f.pair.b === 4 || f.pair.a === 4).toBe(true);
    }
    const few = buildFindings({
      metrics: metrics.map((m) => ({ ...m, values: m.values.slice(0, 12) })),
      pairs: correlationPairs(
        metrics.map((m) => m.values.slice(0, 12)),
        [1, 2, 3, 4]
      ),
      method: 'pearson',
    });
    expect(ofKind(few, 'unrelated')).toEqual([]);
  });

  test('finds the place that breaks a strong pattern', () => {
    const outliers = ofKind(findings, 'outlier');
    const incomeDegrees = outliers.find(
      (f) => f.pair.a === 1 && f.pair.b === 2
    );
    expect(incomeDegrees?.place).toBe(7);
    expect(incomeDegrees?.z ?? 0).toBeGreaterThan(2);
  });

  test('names direction-aware leaders and laggards', () => {
    // High income, degrees and low crime all point to the last places.
    const leaders = ofKind(findings, 'leaders')[0];
    const laggards = ofKind(findings, 'laggards')[0];
    expect(leaders.places[0].place).toBeGreaterThanOrEqual(n - 3);
    expect(leaders.places[0].count).toBeGreaterThanOrEqual(2);
    expect(laggards.places[0].place).toBeLessThanOrEqual(2);
  });

  test('is sorted by score', () => {
    for (let i = 1; i < findings.length; i++)
      expect(findings[i - 1].score).toBeGreaterThanOrEqual(findings[i].score);
  });

  test('says so when nothing is significant', () => {
    const tiny = metrics.map((m) => ({ ...m, values: m.values.slice(0, 4) }));
    const fs = buildFindings({
      metrics: [tiny[0], tiny[3]],
      pairs: correlationPairs([tiny[0].values, tiny[3].values], [1, 4]),
      method: 'spearman',
    });
    expect(ofKind(fs, 'no-signal').length).toBe(1);
    expect(ofKind(fs, 'together')).toEqual([]);
  });
});

describe('tallyExtremes', () => {
  test('lower-is-better metrics count low values as top', () => {
    const { top, bottom } = tallyExtremes([
      { id: 1, direction: -1, values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      { id: 2, direction: 1, values: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] },
    ]);
    expect(top[0]).toMatchObject({ place: 0, count: 2, covered: 2 });
    expect(bottom[0]).toMatchObject({ place: 9, count: 2 });
  });
});

describe('largestResidual', () => {
  test('returns null without enough data', () => {
    expect(largestResidual([1, 2], [3, 4])).toBeNull();
  });
});
