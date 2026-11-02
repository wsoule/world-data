import { describe, expect, it } from 'vitest'
import { competitionRank, composite, correlationPValue, linearRegression, pearson, percentile, rank, spearman, summarize } from './stats'

describe('summarize', () => {
  it('ignores NaN and computes quartiles', () => {
    const s = summarize([1, 2, NaN, 3, 4, 5])
    expect(s.n).toBe(5)
    expect(s.mean).toBe(3)
    expect(s.median).toBe(3)
    expect(s.q1).toBe(2)
    expect(s.q3).toBe(4)
    expect(s.sd).toBeCloseTo(Math.sqrt(2.5))
  })
})

describe('rank', () => {
  it('ranks descending with averaged ties', () => {
    expect(Array.from(rank([10, 30, 20, 30]))).toEqual([4, 1.5, 3, 1.5])
  })
  it('ranks ascending and keeps NaN', () => {
    const r = Array.from(rank([3, NaN, 1], -1))
    expect(r[0]).toBe(2)
    expect(Number.isNaN(r[1])).toBe(true)
    expect(r[2]).toBe(1)
  })
  it('competition rank shares positions', () => {
    expect(Array.from(competitionRank([5, 9, 9, 1]))).toEqual([3, 1, 1, 4])
  })
  it('percentile maps best to 1 and worst to 0', () => {
    expect(Array.from(percentile([1, 2, 3], 1))).toEqual([0, 0.5, 1])
    expect(Array.from(percentile([1, 2, 3], -1))).toEqual([1, 0.5, 0])
  })
})

describe('correlation', () => {
  it('pearson on perfect linear data is 1', () => {
    const c = pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])
    expect(c.r).toBeCloseTo(1)
    expect(c.n).toBe(5)
  })
  it('uses pairwise complete observations', () => {
    const c = pearson([1, 2, NaN, 4, 5, 6], [1, 2, 3, NaN, 5, 6])
    expect(c.n).toBe(4)
    expect(c.r).toBeCloseTo(1)
  })
  it('spearman captures monotonic non-linear data', () => {
    const x = [1, 2, 3, 4, 5, 6]
    const y = x.map((v) => v ** 3)
    expect(spearman(x, y).r).toBeCloseTo(1)
    expect(pearson(x, y).r).toBeLessThan(1)
  })
  it('p-value matches reference (r=0.5, n=20 → p≈0.0248)', () => {
    expect(correlationPValue(0.5, 20)).toBeCloseTo(0.0248, 3)
  })
  it('p-value matches reference (r=0.3, n=50 → p≈0.0343)', () => {
    expect(correlationPValue(0.3, 50)).toBeCloseTo(0.0343, 3)
  })
})

describe('linearRegression', () => {
  it('fits y = 2x + 1', () => {
    const r = linearRegression([0, 1, 2, 3], [1, 3, 5, 7])
    expect(r.slope).toBeCloseTo(2)
    expect(r.intercept).toBeCloseTo(1)
    expect(r.r2).toBeCloseTo(1)
  })
})

describe('composite', () => {
  it('combines direction-adjusted percentiles with weights', () => {
    // entity 0 best on A (higher better) and best on B (lower better)
    const res = composite(
      [
        { values: [3, 2, 1], direction: 1, weight: 1 },
        { values: [10, 20, 30], direction: -1, weight: 1 },
      ],
      3,
    )
    expect(Array.from(res.score)).toEqual([100, 50, 0])
    expect(Array.from(res.rank)).toEqual([1, 2, 3])
  })
  it('excludes entities below the coverage threshold', () => {
    const res = composite(
      [
        { values: [1, 2, NaN], direction: 1, weight: 1 },
        { values: [1, 2, NaN], direction: 1, weight: 1 },
        { values: [1, 2, 3], direction: 1, weight: 1 },
      ],
      3,
      'percentile',
      0.5,
    )
    expect(Number.isNaN(res.score[2])).toBe(true)
    expect(res.coverage[2]).toBe(1)
  })
  it('weights shift the outcome', () => {
    const inputs = [
      { values: [1, 0], direction: 1 as const, weight: 3 },
      { values: [0, 1], direction: 1 as const, weight: 1 },
    ]
    const res = composite(inputs, 2)
    expect(res.rank[0]).toBe(1)
    expect(res.score[0]).toBe(75)
  })
})
