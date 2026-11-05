// Checks on a metric's years: a step between two years that changes every value by the same large
// factor is almost never real data. It is a change of unit (CPI from 0-10 to 0-100, TWh to kWh)
// or a column that holds another measure (a census count in an annual crop series), and a rank
// column whose order turns over between two years counts from the other end in one of them.
// These checks only report; corrections are explicit METRIC_FIXES entries (dropYears,
// scaleYears, swapYears), each checked against the source page.

/** Year key of a stored series: a year, or '_' for the undated column. */
export type YearKey = number | '_';

/** One metric's cells by year, keyed by place id; text cells are ignored. */
export type YearSeries = ReadonlyMap<
  YearKey,
  ReadonlyMap<string, number | string>
>;

/** A step between two consecutive years and the factor that values changed by. */
export interface YearStep {
  from: number;
  to: number;
  /** Median of to/from over places with both values (or of the years' median sizes). */
  ratio: number;
  /** Places compared; 0 when the ratio compares the years' median sizes instead. */
  pairs: number;
}

/** A step beyond this factor (or under its inverse) is reported as a break of scale. */
export const SCALE_BREAK = 5;

/** The dated years of a series, ascending, with their numeric cells. */
function numericYears(series: YearSeries): [number, Map<string, number>][] {
  const out: [number, Map<string, number>][] = [];
  for (const [year, store] of series) {
    if (year === '_') continue;
    const nums = new Map<string, number>();
    for (const [id, v] of store) if (typeof v === 'number') nums.set(id, v);
    if (nums.size > 0) out.push([year, nums]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1
    ? (s[mid] ?? 0)
    : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/**
 * The factor between each pair of consecutive years: the median of to/from over the places
 * that have a non-zero value of the same sign in both (at least five), or else the ratio of
 * the two years' median absolute values (each with at least five places). Pairs with less
 * data are left out.
 */
export function yearSteps(series: YearSeries): YearStep[] {
  const years = numericYears(series);
  const out: YearStep[] = [];
  for (let i = 1; i < years.length; i++) {
    const [from, a] = years[i - 1] ?? [0, new Map<string, number>()];
    const [to, b] = years[i] ?? [0, new Map<string, number>()];
    const ratios: number[] = [];
    for (const [id, x] of a) {
      const y = b.get(id);
      if (y == null || x === 0 || y === 0 || x > 0 !== y > 0) continue;
      ratios.push(y / x);
    }
    if (ratios.length >= 5) {
      out.push({ from, to, ratio: median(ratios), pairs: ratios.length });
      continue;
    }
    if (a.size < 5 || b.size < 5) continue;
    const ma = median([...a.values()].map(Math.abs));
    const mb = median([...b.values()].map(Math.abs));
    if (ma === 0 || mb === 0) continue;
    out.push({ from, to, ratio: mb / ma, pairs: 0 });
  }
  return out;
}

/** True when a step changes values by more than SCALE_BREAK times either way. */
export const isBreak = (step: YearStep): boolean =>
  step.ratio > SCALE_BREAK || step.ratio < 1 / SCALE_BREAK;

/**
 * Years that break scale with both neighbours, in opposite directions: a one-year bounce such
 * as tobacco's 2022 census count (Kentucky 108M lbs in 2021, 990,864 in 2022, 85M in 2023).
 * The default year is never one of these.
 */
export function outlierYears(steps: readonly YearStep[]): Set<number> {
  const out = new Set<number>();
  for (let i = 1; i < steps.length; i++) {
    const before = steps[i - 1];
    const after = steps[i];
    if (before == null || after == null || before.to !== after.from) continue;
    if (
      isBreak(before) &&
      isBreak(after) &&
      before.ratio > 1 !== after.ratio > 1
    )
      out.add(before.to);
  }
  return out;
}

/** Ranks of `xs`, ties sharing their average rank. */
function rankdata(xs: readonly number[]): number[] {
  const order = xs.map((_, i) => i).sort((a, b) => (xs[a] ?? 0) - (xs[b] ?? 0));
  const r = new Array<number>(xs.length).fill(0);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && xs[order[j + 1] ?? 0] === xs[order[i] ?? 0])
      j++;
    for (let k = i; k <= j; k++) r[order[k] ?? 0] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}

/** Spearman's rank correlation of two equally long lists (0 when either is constant). */
export function spearman(a: readonly number[], b: readonly number[]): number {
  const ra = rankdata(a);
  const rb = rankdata(b);
  const n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n;
  const mb = rb.reduce((s, x) => s + x, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const x = (ra[i] ?? 0) - ma;
    const y = (rb[i] ?? 0) - mb;
    cov += x * y;
    va += x * x;
    vb += y * y;
  }
  return va === 0 || vb === 0 ? 0 : cov / Math.sqrt(va * vb);
}

/** Two years of a rank column whose orders disagree, as reported by rankFlips. */
export interface RankFlip {
  from: number;
  to: number;
  rho: number;
  /** Places ranked 1st in one year that sit in the bottom tenth of the other. */
  firstToLast: string[];
}

/** Below this Spearman correlation, two consecutive years of a rank count from opposite ends. */
export const RANK_FLIP = -0.3;

/**
 * Consecutive years of a rank column (at least ten places in both) that look like they count
 * from opposite ends: their orders correlate below RANK_FLIP, or a place ranked 1st in one
 * year is in the bottom tenth of the other (road quality's New Mexico, 1st in 2026 on a
 * worst-first column, 48th in 2023).
 */
export function rankFlips(series: YearSeries): RankFlip[] {
  const years = numericYears(series);
  const out: RankFlip[] = [];
  for (let i = 1; i < years.length; i++) {
    const [from, a] = years[i - 1] ?? [0, new Map<string, number>()];
    const [to, b] = years[i] ?? [0, new Map<string, number>()];
    const common = [...a.keys()].filter((id) => b.has(id));
    if (common.length < 10) continue;
    const rho = spearman(
      common.map((id) => a.get(id) ?? 0),
      common.map((id) => b.get(id) ?? 0)
    );
    const firstToLast: string[] = [];
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      const worst = Math.max(...y.values());
      for (const [id, v] of x)
        if (v === 1 && (y.get(id) ?? 0) >= 0.9 * worst) firstToLast.push(id);
    }
    if (rho < RANK_FLIP || firstToLast.length > 0)
      out.push({ from, to, rho, firstToLast });
  }
  return out;
}
