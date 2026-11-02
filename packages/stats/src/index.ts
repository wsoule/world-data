// Statistics used by comparisons. All functions accept Float64Array/number[] where NaN = missing,
// and use pairwise-complete observations.

export type Vec = ArrayLike<number>;

const finite = (v: number) => !Number.isNaN(v) && Number.isFinite(v);

export function count(x: Vec): number {
  let n = 0;
  for (let i = 0; i < x.length; i++) if (finite(x[i])) n++;
  return n;
}

export interface Summary {
  n: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  q1: number;
  q3: number;
  sd: number;
  sum: number;
}

export function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

export function summarize(x: Vec): Summary {
  const v: number[] = [];
  for (let i = 0; i < x.length; i++) if (finite(x[i])) v.push(x[i]);
  v.sort((a, b) => a - b);
  const n = v.length;
  if (n === 0)
    return {
      n: 0,
      min: NaN,
      max: NaN,
      mean: NaN,
      median: NaN,
      q1: NaN,
      q3: NaN,
      sd: NaN,
      sum: 0,
    };
  let sum = 0;
  for (const a of v) sum += a;
  const mean = sum / n;
  let ss = 0;
  for (const a of v) ss += (a - mean) ** 2;
  return {
    n,
    min: v[0],
    max: v[n - 1],
    mean,
    median: quantileSorted(v, 0.5),
    q1: quantileSorted(v, 0.25),
    q3: quantileSorted(v, 0.75),
    sd: n > 1 ? Math.sqrt(ss / (n - 1)) : 0,
    sum,
  };
}

/**
 * Rank values. direction 1 → largest value gets rank 1; -1 → smallest gets rank 1.
 * Ties receive the average rank. Missing values get NaN.
 */
export function rank(x: Vec, direction: 1 | -1 = 1): Float64Array {
  const idx: number[] = [];
  for (let i = 0; i < x.length; i++) if (finite(x[i])) idx.push(i);
  idx.sort((a, b) => (direction === 1 ? x[b] - x[a] : x[a] - x[b]));
  const out = new Float64Array(x.length).fill(NaN);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && x[idx[j + 1]] === x[idx[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k]] = r;
    i = j + 1;
  }
  return out;
}

/** Competition ranking ("1, 2, 2, 4") — what people expect to read in a leaderboard. */
export function competitionRank(x: Vec, direction: 1 | -1 = 1): Float64Array {
  const idx: number[] = [];
  for (let i = 0; i < x.length; i++) if (finite(x[i])) idx.push(i);
  idx.sort((a, b) => (direction === 1 ? x[b] - x[a] : x[a] - x[b]));
  const out = new Float64Array(x.length).fill(NaN);
  for (let k = 0; k < idx.length; k++) {
    out[idx[k]] =
      k > 0 && x[idx[k]] === x[idx[k - 1]] ? out[idx[k - 1]] : k + 1;
  }
  return out;
}

/** Percentile in [0,1] where 1 = best given direction (average rank based). */
export function percentile(x: Vec, direction: 1 | -1 = 1): Float64Array {
  const r = rank(x, direction);
  const n = count(x);
  const out = new Float64Array(x.length).fill(NaN);
  for (let i = 0; i < x.length; i++)
    if (finite(r[i])) out[i] = n > 1 ? 1 - (r[i] - 1) / (n - 1) : 1;
  return out;
}

export function zscore(x: Vec): Float64Array {
  const s = summarize(x);
  const out = new Float64Array(x.length).fill(NaN);
  for (let i = 0; i < x.length; i++)
    if (finite(x[i])) out[i] = s.sd > 0 ? (x[i] - s.mean) / s.sd : 0;
  return out;
}

export function minmax(x: Vec): Float64Array {
  const s = summarize(x);
  const out = new Float64Array(x.length).fill(NaN);
  const span = s.max - s.min;
  for (let i = 0; i < x.length; i++)
    if (finite(x[i])) out[i] = span > 0 ? (x[i] - s.min) / span : 0.5;
  return out;
}

function pairs(x: Vec, y: Vec): [number[], number[]] {
  const a: number[] = [];
  const b: number[] = [];
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (finite(x[i]) && finite(y[i])) {
      a.push(x[i]);
      b.push(y[i]);
    }
  }
  return [a, b];
}

function pearsonArrays(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 3) return NaN;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  if (saa === 0 || sbb === 0) return NaN;
  return Math.max(-1, Math.min(1, sab / Math.sqrt(saa * sbb)));
}

export interface Correlation {
  r: number;
  n: number;
  /** two-sided p-value for H0: r = 0 */
  p: number;
}

export function pearson(x: Vec, y: Vec): Correlation {
  const [a, b] = pairs(x, y);
  const r = pearsonArrays(a, b);
  return { r, n: a.length, p: correlationPValue(r, a.length) };
}

export function spearman(x: Vec, y: Vec): Correlation {
  const [a, b] = pairs(x, y);
  const r = pearsonArrays(Array.from(rank(a, -1)), Array.from(rank(b, -1)));
  return { r, n: a.length, p: correlationPValue(r, a.length) };
}

export interface Regression {
  slope: number;
  intercept: number;
  r2: number;
  n: number;
  /** residual for each input index (NaN when x or y missing) */
  residuals: Float64Array;
  /** standardized residuals (residual / residual sd) */
  standardized: Float64Array;
}

export function linearRegression(x: Vec, y: Vec): Regression {
  const n = Math.min(x.length, y.length);
  let sx = 0;
  let sy = 0;
  let m = 0;
  for (let i = 0; i < n; i++) {
    if (finite(x[i]) && finite(y[i])) {
      sx += x[i];
      sy += y[i];
      m++;
    }
  }
  const residuals = new Float64Array(n).fill(NaN);
  const standardized = new Float64Array(n).fill(NaN);
  if (m < 3)
    return {
      slope: NaN,
      intercept: NaN,
      r2: NaN,
      n: m,
      residuals,
      standardized,
    };
  const mx = sx / m;
  const my = sy / m;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    if (finite(x[i]) && finite(y[i])) {
      sxy += (x[i] - mx) * (y[i] - my);
      sxx += (x[i] - mx) ** 2;
      syy += (y[i] - my) ** 2;
    }
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    if (finite(x[i]) && finite(y[i])) {
      residuals[i] = y[i] - (intercept + slope * x[i]);
      sse += residuals[i] ** 2;
    }
  }
  const sd = Math.sqrt(sse / Math.max(1, m - 2));
  for (let i = 0; i < n; i++)
    if (finite(residuals[i])) standardized[i] = sd > 0 ? residuals[i] / sd : 0;
  return {
    slope,
    intercept,
    r2: syy === 0 ? NaN : 1 - sse / syy,
    n: m,
    residuals,
    standardized,
  };
}

// --- p-values via the regularized incomplete beta function -------------------

function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5)
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
  );
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value of Student's t with df degrees of freedom. */
export function tTestPValue(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

export function correlationPValue(r: number, n: number): number {
  if (!finite(r) || n < 3) return NaN;
  if (Math.abs(r) >= 1) return 0;
  const df = n - 2;
  const t = (r * Math.sqrt(df)) / Math.sqrt(1 - r * r);
  return tTestPValue(t, df);
}

export function strength(
  r: number
): 'none' | 'weak' | 'moderate' | 'strong' | 'very strong' {
  const a = Math.abs(r);
  if (!finite(a) || a < 0.1) return 'none';
  if (a < 0.3) return 'weak';
  if (a < 0.5) return 'moderate';
  if (a < 0.7) return 'strong';
  return 'very strong';
}

export function describeCorrelation(c: Correlation): string {
  if (!finite(c.r)) return 'Not enough overlapping data';
  const s = strength(c.r);
  if (s === 'none') return 'No meaningful relationship';
  const dir = c.r > 0 ? 'positive' : 'negative';
  const sig =
    c.p < 0.001
      ? 'p < 0.001'
      : c.p < 0.05
        ? `p = ${c.p.toFixed(3)}`
        : `not statistically significant (p = ${c.p.toFixed(2)})`;
  return `${s[0].toUpperCase() + s.slice(1)} ${dir} relationship (${sig})`;
}

// --- Composite scores ----------------------------------------------------------

export type Normalization = 'percentile' | 'zscore' | 'minmax';

export interface CompositeInput {
  values: Vec;
  /** 1 = higher is better, -1 = lower is better */
  direction: 1 | -1;
  weight: number;
}

export interface CompositeResult {
  /** weighted mean of normalized scores, 0–100 scale for percentile/minmax, z for zscore; NaN if excluded */
  score: Float64Array;
  /** 1 = best */
  rank: Float64Array;
  /** number of inputs with data per entity */
  coverage: Uint16Array;
  /** normalized score per input per entity (same scale as score), already direction-adjusted */
  parts: Float64Array[];
  /** weighted contribution of each input to the final score per entity */
  contributions: Float64Array[];
}

/**
 * Combine several metrics into one score. Each metric is normalized (direction-adjusted so that
 * higher = better), then averaged with weights over the metrics an entity has data for.
 * Entities with coverage below `minCoverage` (fraction of total weight) are excluded.
 */
export function composite(
  inputs: CompositeInput[],
  length: number,
  method: Normalization = 'percentile',
  minCoverage = 0.5
): CompositeResult {
  const parts = inputs.map((inp) => {
    const v = inp.values;
    if (method === 'percentile') {
      const p = percentile(v, inp.direction);
      for (let i = 0; i < p.length; i++) p[i] *= 100;
      return p;
    }
    if (method === 'zscore') {
      const z = zscore(v);
      if (inp.direction === -1) for (let i = 0; i < z.length; i++) z[i] = -z[i];
      return z;
    }
    const mm = minmax(v);
    for (let i = 0; i < mm.length; i++)
      mm[i] = 100 * (inp.direction === 1 ? mm[i] : 1 - mm[i]);
    return mm;
  });
  const totalWeight = inputs.reduce((s, i) => s + Math.max(0, i.weight), 0);
  const score = new Float64Array(length).fill(NaN);
  const coverage = new Uint16Array(length);
  const contributions = inputs.map(() => new Float64Array(length).fill(NaN));
  for (let e = 0; e < length; e++) {
    let wsum = 0;
    let acc = 0;
    let cov = 0;
    for (let k = 0; k < inputs.length; k++) {
      const w = Math.max(0, inputs[k].weight);
      const p = parts[k][e];
      if (w > 0 && finite(p)) {
        wsum += w;
        acc += w * p;
        cov++;
      }
    }
    coverage[e] = cov;
    if (totalWeight > 0 && wsum / totalWeight >= minCoverage && wsum > 0) {
      score[e] = acc / wsum;
      for (let k = 0; k < inputs.length; k++) {
        const w = Math.max(0, inputs[k].weight);
        const p = parts[k][e];
        if (w > 0 && finite(p)) contributions[k][e] = (w * p) / wsum;
      }
    }
  }
  return {
    score,
    rank: competitionRank(score, 1),
    coverage,
    parts,
    contributions,
  };
}
