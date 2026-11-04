import {
  type Correlation,
  linearRegression,
  pearson,
  percentile,
  type Regression,
  spearman,
  strength,
  summarize,
} from '@world-data/stats';

/** One place that has both an x and a y value. */
export interface ScatterPoint {
  /** Entity index into dataset.entities */
  idx: number;
  /** Raw values */
  x: number;
  y: number;
  /** Values in the plotted space (log10 when that axis is logarithmic) */
  tx: number;
  ty: number;
}

export interface ScatterAnalysis {
  points: ScatterPoint[];
  /** Places that passed the filter but lack x or y */
  missing: number;
  /** Whether each axis may use a log scale (every value > 0) */
  canLogX: boolean;
  canLogY: boolean;
  /** Effective log flags: requested and valid */
  logX: boolean;
  logY: boolean;
  /**
   * Axes whose stored number is negated for the coefficients below (`standing` input): a
   * best-first rank read by standing, so a better rank counts as higher.
   */
  negated: { x: boolean; y: boolean };
  /**
   * True when exactly one axis is negated, so `pearson`, `unloggedPearson` and `spearman` have
   * the opposite sign of the same coefficients on the stored numbers (`stored`). Negating both
   * axes leaves every coefficient as it was.
   */
  signFlipped: boolean;
  /** Pearson r in the plotted space (on log10 values for a log axis), read by standing */
  pearson: Correlation;
  /**
   * Pearson r on the unlogged values, read by standing; differs from `pearson` only when an axis
   * is logarithmic
   */
  unloggedPearson: Correlation;
  /** Spearman ρ, read by standing */
  spearman: Correlation;
  /** Pearson r and Spearman ρ in the plotted space on the stored numbers, before any negation */
  stored: { pearson: Correlation; spearman: Correlation };
  /**
   * Least-squares fit of ty on tx over the stored numbers (what the chart draws); residual arrays
   * align with `points`. R² is the same in either reading.
   */
  regression: Regression;
  /** Fitted raw y for each point (aligned with `points`) */
  predicted: Float64Array;
  medianX: number;
  medianY: number;
}

const finite = (v: number) => Number.isFinite(v);

/**
 * Pairs two metric columns over the filtered places and computes everything
 * the overlay explains: correlations and a regression in the plotted space
 * (so a log axis is fitted as a log relationship), plus medians for quadrants.
 *
 * `standing` names the axes read by standing, like the correlation matrix reads its columns (see
 * `standingColumns`): a best-first rank (rank 1 = best) stores its best place as the smallest
 * number, so its raw r with income comes out negative although better-ranked places are richer.
 * Its coefficients are taken on the negated number, which flips the sign of r and ρ when exactly
 * one axis is negated and leaves p, n and R² alone. Points, medians, the regression and the
 * predicted values stay on the stored numbers, since the chart, the four groups and the
 * over/under-performers are measured on those.
 */
export function analyzeScatter(input: {
  entityIdx: readonly number[];
  xs: ArrayLike<number>;
  ys: ArrayLike<number>;
  logX: boolean;
  logY: boolean;
  standing?: { x: boolean; y: boolean };
}): ScatterAnalysis {
  const raw: { idx: number; x: number; y: number }[] = [];
  let missing = 0;
  let allXPositive = true;
  let allYPositive = true;
  for (const idx of input.entityIdx) {
    const x = input.xs[idx];
    const y = input.ys[idx];
    if (!finite(x) || !finite(y)) {
      missing++;
      continue;
    }
    if (x <= 0) allXPositive = false;
    if (y <= 0) allYPositive = false;
    raw.push({ idx, x, y });
  }
  const canLogX = raw.length > 0 && allXPositive;
  const canLogY = raw.length > 0 && allYPositive;
  const logX = input.logX && canLogX;
  const logY = input.logY && canLogY;
  const points: ScatterPoint[] = raw.map((p) => ({
    ...p,
    tx: logX ? Math.log10(p.x) : p.x,
    ty: logY ? Math.log10(p.y) : p.y,
  }));
  const tx = Float64Array.from(points, (p) => p.tx);
  const ty = Float64Array.from(points, (p) => p.ty);
  const regression = linearRegression(tx, ty);
  const r = pearson(tx, ty);
  const rho = spearman(tx, ty);
  const predicted = Float64Array.from(points, (p) => {
    const fit = regression.intercept + regression.slope * p.tx;
    return logY ? 10 ** fit : fit;
  });
  const negated = {
    x: input.standing?.x === true,
    y: input.standing?.y === true,
  };
  // Negating one column negates r and ρ (ranks reverse, ties stay ties); p and n only depend on |r|.
  const signFlipped = negated.x !== negated.y;
  const read = (c: Correlation): Correlation =>
    signFlipped ? { ...c, r: -c.r } : c;
  const unlogged =
    logX || logY
      ? pearson(
          Float64Array.from(points, (p) => p.x),
          Float64Array.from(points, (p) => p.y)
        )
      : r;
  const pearsonRead = read(r);
  return {
    points,
    missing,
    canLogX,
    canLogY,
    logX,
    logY,
    negated,
    signFlipped,
    pearson: pearsonRead,
    unloggedPearson: logX || logY ? read(unlogged) : pearsonRead,
    spearman: read(rho),
    stored: { pearson: r, spearman: rho },
    regression,
    predicted,
    medianX: summarize(points.map((p) => p.x)).median,
    medianY: summarize(points.map((p) => p.y)).median,
  };
}

/** How a metric should be read when describing it in words. */
export interface AxisMeaning {
  label: string;
  /** 1 = higher is better, -1 = lower is better */
  dir: 1 | -1;
  /** True when the metric has no known better direction */
  neutral: boolean;
  /** Rank-style metric (1st, 2nd, …) */
  isRank: boolean;
}

/** Whether a high raw value is the "good" (or, for neutral metrics, the "high") end. */
export function goodIsHigh(a: AxisMeaning): boolean {
  return a.neutral ? !a.isRank : a.dir === 1;
}

/**
 * The two axes as the standing coefficients (`pearson`, `spearman`) read them: a negated
 * best-first rank grows as places get better, so its better direction becomes "higher". The
 * sentence, verdict and sign notes take these meanings so they agree with the sign shown; the
 * four groups and the over/under-performers keep the stored meanings, since their medians and
 * residuals are measured on the stored numbers.
 */
export function standingAxes(
  a: Pick<ScatterAnalysis, 'negated'>,
  x: AxisMeaning,
  y: AxisMeaning
): { x: AxisMeaning; y: AxisMeaning } {
  const read = (m: AxisMeaning, negated: boolean): AxisMeaning =>
    negated ? { ...m, dir: 1, neutral: false } : m;
  return { x: read(x, a.negated.x), y: read(y, a.negated.y) };
}

/** A sentence fragment; `strong` marks metric names for emphasis. */
export interface SentencePart {
  text: string;
  strong?: boolean;
}

/**
 * Plain-English reading of a correlation that respects each metric's better
 * direction, e.g. "States that rank better on Education Rank tend to have
 * higher Median Household Income". Uses the good end of x as the subject so
 * rank-style and lower-is-better metrics read naturally. `c` and the axes must
 * share one reading: the overlay passes its standing r with `standingAxes`.
 * Negating an axis flips both the sign of r and that axis's better side, so
 * the sentence reads the same either way.
 */
export function relationshipSentence(
  c: Correlation,
  x: AxisMeaning,
  y: AxisMeaning,
  plural: string
): SentencePart[] {
  const s = strength(c.r);
  if (!finite(c.r)) {
    return [{ text: 'There is not enough overlapping data to compare these.' }];
  }
  if (s === 'none') {
    return [
      { text: 'There is no clear link between ' },
      { text: x.label, strong: true },
      { text: ' and ' },
      { text: y.label, strong: true },
      { text: ` across these ${plural.toLowerCase()}.` },
    ];
  }
  const xHigh = goodIsHigh(x);
  const yHigh = c.r > 0 === xHigh;
  const parts: SentencePart[] = [];
  if (x.isRank) {
    parts.push({
      text: `${plural} that rank ${x.neutral ? 'higher' : 'better'} on `,
    });
  } else {
    parts.push({ text: `${plural} with ${xHigh ? 'higher' : 'lower'} ` });
  }
  parts.push({ text: x.label, strong: true });
  const tend = s === 'weak' ? ' only slightly tend to ' : ' tend to ';
  if (y.isRank) {
    const better = yHigh === goodIsHigh(y);
    parts.push({ text: `${tend}rank ${better ? 'better' : 'worse'} on ` });
  } else {
    parts.push({ text: `${tend}have ${yHigh ? 'higher' : 'lower'} ` });
  }
  parts.push({ text: y.label, strong: true });
  parts.push({
    text:
      c.p >= 0.05
        ? `, though with only ${c.n} ${plural.toLowerCase()} this could easily be chance.`
        : '.',
  });
  return parts;
}

/**
 * For two metrics with a known better direction: whether doing well on one
 * goes with doing well on the other (synergy) or worse (trade-off). Only a
 * statistically significant correlation (p < 0.05) earns a verdict; a weak,
 * possibly chance pattern gets none. Like `relationshipSentence`, `c` and the
 * axes must share one reading.
 */
export function verdict(
  c: Correlation,
  x: AxisMeaning,
  y: AxisMeaning
): 'together' | 'trade-off' | null {
  if (
    x.neutral ||
    y.neutral ||
    !finite(c.r) ||
    strength(c.r) === 'none' ||
    !(c.p < 0.05)
  )
    return null;
  const good = c.r * (goodIsHigh(x) ? 1 : -1) * (goodIsHigh(y) ? 1 : -1);
  return good > 0 ? 'together' : 'trade-off';
}

export interface QuadrantCell {
  /** Above the x median */
  xHigh: boolean;
  /** Above the y median */
  yHigh: boolean;
  /** Indexes into analysis.points, best (by both percentiles) first */
  members: number[];
  /** Better (or higher, for neutral metrics) than the median on both */
  best: boolean;
}

/**
 * Splits the points at the x and y medians. Points exactly on a median are
 * left out (`onMedian`). When both metrics have a better side, the cell that
 * is better on both is marked `best`; when neither has one, the cell high on
 * both is. With exactly one neutral metric no cell is "best": being high or
 * low on population is not good or bad. Members of each cell are ordered by
 * the sum of their percentiles on the metrics with a better side (both
 * percentiles when both or neither have one) so the cell "leaders" come first.
 */
export function quadrants(
  a: ScatterAnalysis,
  x: AxisMeaning,
  y: AxisMeaning
): { cells: QuadrantCell[]; onMedian: number } {
  const mixed = x.neutral !== y.neutral;
  const px = percentile(
    a.points.map((p) => p.x),
    goodIsHigh(x) ? 1 : -1
  );
  const py = percentile(
    a.points.map((p) => p.y),
    goodIsHigh(y) ? 1 : -1
  );
  const useX = !mixed || !x.neutral;
  const useY = !mixed || !y.neutral;
  const order = (i: number) => (useX ? px[i] : 0) + (useY ? py[i] : 0);
  const cells: QuadrantCell[] = [];
  for (const yHigh of [true, false])
    for (const xHigh of [false, true])
      cells.push({
        xHigh,
        yHigh,
        members: [],
        best: !mixed && xHigh === goodIsHigh(x) && yHigh === goodIsHigh(y),
      });
  let onMedian = 0;
  a.points.forEach((p, i) => {
    if (p.x === a.medianX || p.y === a.medianY) {
      onMedian++;
      return;
    }
    const xHigh = p.x > a.medianX;
    const yHigh = p.y > a.medianY;
    const cell = cells.find((c) => c.xHigh === xHigh && c.yHigh === yHigh);
    cell?.members.push(i);
  });
  for (const c of cells) c.members.sort((i, j) => order(j) - order(i));
  return { cells, onMedian };
}

export interface ResidualLeader {
  /** Index into analysis.points */
  point: number;
  /** Raw y the trend line predicts for this point's x */
  predicted: number;
  /** Residual in standard deviations (plotted space) */
  standardized: number;
}

/**
 * Places furthest above and below the trend line. "Above" means better than
 * the trend predicts given the y metric's direction (for a lower-is-better y,
 * sitting below the line is the over-performance).
 */
export function residualLeaders(
  a: ScatterAnalysis,
  y: AxisMeaning,
  k = 5
): { better: ResidualLeader[]; worse: ResidualLeader[] } {
  const sign = goodIsHigh(y) ? 1 : -1;
  const rows: ResidualLeader[] = [];
  a.points.forEach((_, i) => {
    const z = a.regression.standardized[i];
    if (finite(z))
      rows.push({ point: i, predicted: a.predicted[i], standardized: z });
  });
  const better = rows
    .filter((r) => r.standardized * sign > 0)
    .sort((p, q) => q.standardized * sign - p.standardized * sign)
    .slice(0, k);
  const worse = rows
    .filter((r) => r.standardized * sign < 0)
    .sort((p, q) => p.standardized * sign - q.standardized * sign)
    .slice(0, k);
  return { better, worse };
}

/** Indexes (into analysis.points) of the k largest absolute standardized residuals. */
export function outlierPoints(a: ScatterAnalysis, k = 3): number[] {
  const idx: number[] = [];
  a.points.forEach((_, i) => {
    if (finite(a.regression.standardized[i])) idx.push(i);
  });
  return idx
    .sort(
      (i, j) =>
        Math.abs(a.regression.standardized[j]) -
        Math.abs(a.regression.standardized[i])
    )
    .slice(0, k);
}

/**
 * Readable tick values for a log axis: powers of ten, plus 2× and 5× steps
 * when the data spans few decades. d3's own log ticks list every 1–9 multiple,
 * which crowds both labels and grid lines.
 */
export function logTicks(min: number, max: number): number[] {
  if (!(min > 0) || !(max > 0) || max < min) return [];
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  const decades = hi - lo;
  const steps = decades <= 1 ? [1, 2, 5] : decades <= 4 ? [1, 3] : [1];
  const out: number[] = [];
  for (let e = lo; e <= hi; e++)
    for (const s of steps) {
      const v = s * 10 ** e;
      if (v >= min * 0.999 && v <= max * 1.001) out.push(v);
    }
  // Too few ticks inside the data range: fall back to the decade bounds.
  if (out.length < 2) return [10 ** lo, 10 ** hi].filter((v) => v > 0);
  return out;
}

/**
 * Tick values for a rank axis (1st, 2nd, …): always 1st, then round steps.
 * A plain linear axis would label 0th or negative ranks once padded.
 */
export function rankTicks(max: number): number[] {
  if (!(max >= 1)) return [1];
  const raw = (max - 1) / 6;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const step = steps.find((s) => s >= raw) ?? 10 ** Math.ceil(Math.log10(raw));
  const out = [1];
  for (let v = step < 5 ? 1 + step : step; v <= max; v += step) out.push(v);
  return out;
}

/** p-value text: "< 0.001" or three decimals. */
export function formatP(p: number): string {
  if (!finite(p)) return '—';
  return p < 0.001 ? '< 0.001' : p.toFixed(3);
}

/** Signed correlation text using a true minus sign. */
export function formatR(r: number): string {
  if (!finite(r)) return '—';
  return `${r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}`;
}
