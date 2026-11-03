import { scaleSqrt } from 'd3-scale';
import { interpolateRdYlBu, interpolateViridis } from 'd3-scale-chromatic';

import type { Dataset } from '~/data/dataset';
import type { Metric, Polarity } from '~/data/types';
import { GROUP_PALETTE } from '~/lib/theme';

export const OTHER_GROUP = 'Other';
/** Neutral grey for the "Other" bucket, legible on light and dark. */
const OTHER_COLOR = '#94a3b8';

/** How scatter points are coloured, resolved from the URL `c` encoding. */
export type ColorModel =
  | { kind: 'none' }
  | {
      kind: 'group';
      /** Legend heading: the place type's group ("Region") or the category metric's label */
      title: string;
      /** Category names in legend order (may end with "Other") */
      domain: string[];
      range: string[];
      /** Legend key of a place (entity index) */
      keyOf: (entity: number) => string;
    }
  | {
      kind: 'metric';
      metric: Metric;
      values: Float64Array;
      min: number;
      max: number;
      polarity: Polarity;
      interpolate: (t: number) => string;
    };

/**
 * Colour ramp for a metric: red → blue from bad to good when the metric has a
 * better direction, viridis otherwise. Both ends stay distinguishable from the
 * light and dark backgrounds once the dots carry a thin outline.
 */
export function metricInterpolator(polarity: Polarity): (t: number) => string {
  if (polarity === 1) return (t) => interpolateRdYlBu(0.04 + 0.92 * t);
  if (polarity === -1) return (t) => interpolateRdYlBu(0.96 - 0.92 * t);
  return (t) => interpolateViridis(0.08 + 0.84 * t);
}

/** Conventional colours for US party categories, so a party colouring reads at a glance. */
const PARTY_COLORS: Record<string, string> = {
  Republican: '#dc2626',
  Democratic: '#2563eb',
};

/**
 * One colour per category value of a categorical metric (such as a party), most common first;
 * party names keep their conventional colours. Rare values beyond the palette become "Other".
 */
function categoryModel(
  dataset: Dataset,
  metric: Metric,
  present: readonly number[]
): ColorModel {
  const text = dataset.text(metric.id);
  const counts = new Map<string, number>();
  for (const i of present) {
    const v = text[i];
    if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (counts.size === 0) return { kind: 'none' };
  const max = GROUP_PALETTE.length;
  const ordered = [...counts].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  const overflow = ordered.length > max;
  const named = overflow ? ordered.slice(0, max - 1) : ordered;
  const known = new Set(named);
  const domain = overflow ? [...named, OTHER_GROUP] : named;
  return {
    kind: 'group',
    title: metric.label,
    domain,
    range: domain.map((v, i) =>
      v === OTHER_GROUP ? OTHER_COLOR : (PARTY_COLORS[v] ?? GROUP_PALETTE[i])
    ),
    keyOf: (e) => {
      const v = text[e];
      return v != null && known.has(v) ? v : OTHER_GROUP;
    },
  };
}

/**
 * Resolves the colour encoding for the plotted places (`present`). With few
 * groups (continents, census regions) each keeps its dataset-wide colour so
 * it does not change between pairs; with many (world cities by country) the
 * most common plotted groups get colours and the rest collapse into a grey
 * "Other".
 */
export function buildColorModel(
  dataset: Dataset,
  c: 'group' | number | undefined,
  polarityOf: (id: number) => Polarity,
  present: readonly number[],
  /** Legend heading for the group colouring, e.g. "Region" */
  groupTitle = 'Group'
): ColorModel {
  if (c === 'group') {
    const counts = new Map<string, number>();
    for (const i of present) {
      const g = dataset.entities[i].group;
      if (g != null) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    if (counts.size === 0) return { kind: 'none' };
    const max = GROUP_PALETTE.length;
    const stable = dataset.groups.length <= max;
    const ordered = stable
      ? dataset.groups.filter((g) => counts.has(g))
      : [...counts].sort((a, b) => b[1] - a[1]).map(([g]) => g);
    const overflow = ordered.length > max;
    const named = overflow ? ordered.slice(0, max - 1) : ordered;
    const known = new Set(named);
    const domain = overflow ? [...named, OTHER_GROUP] : named;
    const range = domain.map((g, i) =>
      g === OTHER_GROUP
        ? OTHER_COLOR
        : GROUP_PALETTE[stable ? dataset.groups.indexOf(g) : i]
    );
    return {
      kind: 'group',
      title: groupTitle,
      domain,
      range,
      keyOf: (e) => {
        const g = dataset.entities[e].group;
        return g != null && known.has(g) ? g : OTHER_GROUP;
      },
    };
  }
  if (c == null) return { kind: 'none' };
  const metric = dataset.metric(c);
  if (metric == null) return { kind: 'none' };
  if (metric.kind === 'cat') return categoryModel(dataset, metric, present);
  const values = dataset.numeric(c);
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return { kind: 'none' };
  const polarity = polarityOf(c);
  return {
    kind: 'metric',
    metric,
    values,
    min,
    max: max === min ? min + 1 : max,
    polarity,
    interpolate: metricInterpolator(polarity),
  };
}

/** Base dot radius: smaller dots for crowded types (counties, world cities). */
export function baseRadius(n: number): number {
  if (n <= 60) return 6;
  if (n <= 250) return 5;
  if (n <= 1000) return 3.5;
  return 2.5;
}

/**
 * Pixel radius for each value of a size metric using an area-preserving
 * square-root scale. Missing or negative values get the minimum radius.
 */
export function radiusMapper(
  values: ArrayLike<number>,
  n: number
): (v: number) => number {
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v) && v > max) max = v;
  }
  const lo = n > 500 ? 1.5 : 2.5;
  const hi = n > 500 ? 14 : n > 120 ? 22 : 26;
  const s = scaleSqrt()
    .domain([0, max > 0 ? max : 1])
    .range([lo, hi]);
  return (v) => (Number.isFinite(v) && v > 0 ? s(v) : lo);
}
