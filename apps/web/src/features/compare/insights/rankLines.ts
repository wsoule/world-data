import { competitionRank, percentile } from '@world-data/stats';

/** Ranks and percentiles of every compared place on every basket metric. */
export interface RankModel {
  /** Competition rank per metric per place (1 = best given direction), NaN when missing */
  ranks: Float64Array[];
  /** Direction-aware percentile per metric per place, 0–100 (100 = best), NaN when missing */
  pcts: Float64Array[];
  /** Places with data, per metric */
  counts: number[];
  /**
   * Mean percentile (0–100) over the averaged metrics a place has; NaN below the coverage floor
   * or when no metric is averaged
   */
  average: Float64Array;
  /** Places with an average, best first */
  order: number[];
  /** Metrics that count towards the average (those with a better side) */
  averaged: number;
}

/**
 * Rank every place on each metric (competition ranking, direction-aware) and summarise each place
 * by its mean percentile. Only metrics marked in `include` (default: all) are averaged: a metric
 * with no better side is still ranked and drawn high to low, but being large is not "better".
 * Places covering fewer than `minCoverage` averaged metrics (default: half of them) get no
 * average, so a place with a single great value cannot top the summary.
 */
export function buildRankModel(
  columns: readonly ArrayLike<number>[],
  directions: readonly (1 | -1)[],
  options: { include?: readonly boolean[]; minCoverage?: number } = {}
): RankModel {
  const include = columns.map((_, k) => options.include?.[k] ?? true);
  const averaged = include.filter((x) => x).length;
  const minCoverage = options.minCoverage ?? Math.ceil(averaged / 2);
  const places = columns[0]?.length ?? 0;
  const ranks = columns.map((c, k) => competitionRank(c, directions[k]));
  const pcts = columns.map((c, k) => {
    const p = percentile(c, directions[k]);
    for (let i = 0; i < p.length; i++) p[i] *= 100;
    return p;
  });
  const counts = ranks.map((r) => {
    let n = 0;
    for (let i = 0; i < r.length; i++) if (!Number.isNaN(r[i])) n++;
    return n;
  });
  const average = new Float64Array(places).fill(NaN);
  const order: number[] = [];
  for (let p = 0; p < places; p++) {
    let sum = 0;
    let covered = 0;
    for (let k = 0; k < pcts.length; k++) {
      if (!include[k]) continue;
      const v = pcts[k][p];
      if (Number.isNaN(v)) continue;
      sum += v;
      covered++;
    }
    if (covered > 0 && covered >= minCoverage) {
      average[p] = sum / covered;
      order.push(p);
    }
  }
  order.sort((a, b) => average[b] - average[a]);
  return { ranks, pcts, counts, average, order, averaged };
}

export interface VisiblePlaces {
  /** Drawn bold, coloured and labelled: highlighted places first, then the best by average */
  emphasized: number[];
  /** Drawn as faint context lines (never includes emphasized places) */
  background: number[];
  /** True when context lines were thinned to the best and worst places */
  limited: boolean;
}

/**
 * Decide which places the rank-lines chart draws. Highlighted places and the `top` best by
 * average are emphasized. Every other place is a faint context line, unless there are more than
 * `maxAll` places and `showAll` is off: then only the `edge` best and `edge` worst stay, which
 * keeps the chart readable (and fast) for counties and cities.
 */
export function pickVisible(
  model: RankModel,
  placeCount: number,
  options: {
    highlighted: readonly number[];
    showAll: boolean;
    maxAll?: number;
    edge?: number;
    top?: number;
  }
): VisiblePlaces {
  const maxAll = options.maxAll ?? 60;
  const edge = options.edge ?? 10;
  const top = options.top ?? 5;
  const emphasized = [...new Set(options.highlighted)];
  const wanted = emphasized.length + top;
  for (const p of model.order) {
    if (emphasized.length >= wanted) break;
    if (!emphasized.includes(p)) emphasized.push(p);
  }
  const taken = new Set(emphasized);
  const limited = !options.showAll && placeCount > maxAll;
  const background: number[] = [];
  if (limited) {
    const ends = [
      ...model.order.slice(0, edge),
      ...model.order.slice(Math.max(edge, model.order.length - edge)),
    ];
    for (const p of ends) if (!taken.has(p)) background.push(p);
  } else {
    for (let p = 0; p < placeCount; p++) if (!taken.has(p)) background.push(p);
  }
  return { emphasized, background, limited };
}

/**
 * Nudge label positions apart so none are closer than `gap`, staying within [lo, hi] and as close
 * to their targets as possible. Used for the end-of-line place labels. Returns positions in the
 * same order as `targets`; if the labels cannot fit, they are spread evenly across the range.
 */
export function spreadLabels(
  targets: readonly number[],
  gap: number,
  lo: number,
  hi: number
): number[] {
  const n = targets.length;
  if (n === 0) return [];
  const order = targets
    .map((_, i) => i)
    .sort((a, b) => targets[a] - targets[b]);
  const pos = new Array<number>(n);
  if (gap * (n - 1) > hi - lo) {
    const step = n > 1 ? (hi - lo) / (n - 1) : 0;
    order.forEach((idx, k) => (pos[idx] = lo + k * step));
    return pos;
  }
  let prev = -Infinity;
  for (const idx of order) {
    const p = Math.max(lo, targets[idx], prev + gap);
    pos[idx] = p;
    prev = p;
  }
  let next = Infinity;
  for (let k = n - 1; k >= 0; k--) {
    const idx = order[k];
    const p = Math.min(pos[idx], hi, next - gap);
    pos[idx] = p;
    next = p;
  }
  return pos;
}

/**
 * Tick values for a rank axis running from 1 to `max`: rank 1 plus round multiples (5, 10, 50,
 * 1,000…) chosen so there are about `target` ticks.
 */
export function rankTicks(max: number, target = 6): number[] {
  if (max <= 1) return [1];
  const raw = (max - 1) / Math.max(1, target - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(
    1,
    [1, 2, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? 10 * mag
  );
  const out = [1];
  for (let v = step; v <= max; v += step) if (v > 1) out.push(v);
  return out;
}
