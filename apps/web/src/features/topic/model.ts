// Pure helpers behind the topic page: reading a topic's year-by-year series into entity-aligned
// columns, choosing the focus metric and year, ranking, trend lines and value counts. No React here
// so the logic stays unit-testable (see apps/web/test/topic-model.test.ts).

import type { EntityType, Metric, TopicFile, TopicTable } from '~/data/types';

/** Series key used by the pipeline for metrics without a year. */
export const UNDATED = '_';

const NOUNS: Record<EntityType, [one: string, many: string]> = {
  country: ['country', 'countries'],
  state: ['state', 'states'],
  city: ['city', 'cities'],
  'world-city': ['city', 'cities'],
  county: ['county', 'counties'],
};

/** Lower-case noun for places of a type in running text ("3 states", "1 county"). */
export function placeNoun(type: EntityType, count = 2): string {
  return NOUNS[type][count === 1 ? 0 : 1];
}

/** 1 when higher values rank first, -1 when lower values rank first. */
export type Direction = 1 | -1;

/** Ranking direction implied by a metric's polarity (neutral metrics rank highest first). */
export function directionOf(metric: Pick<Metric, 'pol'>): Direction {
  return metric.pol === -1 ? -1 : 1;
}

/** Years with data for one metric in a topic, oldest first. The undated key is not a year. */
export function seriesYears(topic: TopicFile, metricId: number): number[] {
  const series = topic.series[String(metricId)];
  if (series == null) return [];
  const years: number[] = [];
  for (const key of Object.keys(series)) {
    if (key === UNDATED) continue;
    const y = Number(key);
    if (Number.isFinite(y)) years.push(y);
  }
  return years.sort((a, b) => a - b);
}

/** True when a topic has an undated series (the source's "current" column) for a metric. */
export function hasUndated(topic: TopicFile, metricId: number): boolean {
  return topic.series[String(metricId)]?.[UNDATED] != null;
}

/** URL value of the year selector's "Latest" choice: the undated series. */
export const LATEST = 'latest';

/** A year asked for in the URL: a year, or LATEST for the undated series. */
export type YearRequest = number | typeof LATEST;

/**
 * The year to show for a metric, or null for its undated series. Order: the requested year when
 * the topic has it (or the undated series when LATEST is requested and exists), else the metric's
 * default year, else the undated series when there is one, else the latest year. The undated
 * series beats the latest year because it is the source's current column, usually covers far
 * more places, and is what the metric's default values and the page summary use.
 */
export function resolveYear(
  years: readonly number[],
  requested: YearRequest | undefined,
  fallback: number | null,
  undated = false
): number | null {
  if (requested === LATEST && undated) return null;
  if (typeof requested === 'number' && years.includes(requested))
    return requested;
  if (fallback != null && years.includes(fallback)) return fallback;
  if (undated || years.length === 0) return null;
  return years[years.length - 1];
}

/**
 * URL value for a year choice (null = the undated series): undefined when it is the metric's
 * default, so default views keep clean URLs.
 */
export function yearParam(
  choice: number | null,
  defaultYear: number | null
): YearRequest | undefined {
  if (choice === defaultYear) return undefined;
  return choice ?? LATEST;
}

/** The `[entityIndexes, values]` pair for a metric at a year (or its undated series). */
function seriesAt(
  topic: TopicFile,
  metricId: number,
  year: number | null
): [number[], (number | string)[]] | null {
  const series = topic.series[String(metricId)];
  if (series == null) return null;
  if (year != null) {
    const hit = series[String(year)];
    if (hit != null) return hit;
  }
  return series[UNDATED] ?? null;
}

/** Numeric values of a metric at a year, aligned to the dataset's entities (NaN = missing). */
export function numericColumn(
  topic: TopicFile,
  metricId: number,
  year: number | null,
  entityCount: number
): Float64Array {
  const col = new Float64Array(entityCount).fill(NaN);
  const pair = seriesAt(topic, metricId, year);
  if (pair == null) return col;
  const [idx, vals] = pair;
  for (let k = 0; k < idx.length; k++) {
    const v = vals[k];
    if (typeof v === 'number' && idx[k] < entityCount) col[idx[k]] = v;
  }
  return col;
}

/** Raw values (numbers or text) of a metric at a year, aligned to entities (null = missing). */
export function rawColumn(
  topic: TopicFile,
  metricId: number,
  year: number | null,
  entityCount: number
): (number | string | null)[] {
  const col = new Array<number | string | null>(entityCount).fill(null);
  const pair = seriesAt(topic, metricId, year);
  if (pair == null) return col;
  const [idx, vals] = pair;
  for (let k = 0; k < idx.length; k++)
    if (idx[k] < entityCount) col[idx[k]] = vals[k];
  return col;
}

/**
 * Year shown for a metric inside a table: the page's selected year when this metric has it (so
 * a table of sibling series moves together), otherwise the metric's own default. `selected` is
 * null when the page shows the undated series (siblings that have one show theirs too) and
 * undefined when the page has no year of its own (an all-categorical topic).
 */
export function tableYear(
  topic: TopicFile,
  metric: Pick<Metric, 'id' | 'year'>,
  selected: number | null | undefined
): number | null {
  const years = seriesYears(topic, metric.id);
  const undated = hasUndated(topic, metric.id);
  if (selected === null && undated) return null;
  if (selected != null && years.includes(selected)) return selected;
  return resolveYear(years, undefined, metric.year, undated);
}

/**
 * Tables to render for a topic. Keeps the source tables (dropping unknown metric ids), puts any
 * topic metric that no table lists into a trailing "More data" table, and falls back to a single
 * "All data" table when the source page had no table structure.
 */
export function displayTables(
  topic: TopicFile,
  isKnown: (id: number) => boolean
): TopicTable[] {
  const out: TopicTable[] = [];
  const listed = new Set<number>();
  for (const t of topic.tables) {
    const metrics = t.metrics.filter((id) => isKnown(id) && !listed.has(id));
    for (const id of metrics) listed.add(id);
    if (metrics.length > 0) out.push({ name: t.name, metrics });
  }
  const rest = topic.metrics.filter((id) => isKnown(id) && !listed.has(id));
  if (rest.length > 0)
    out.push({
      name: out.length === 0 ? 'All data' : 'More data',
      metrics: rest,
    });
  return out;
}

/** Numeric, non-bookkeeping metrics of a topic in table order: the choices for the focus metric. */
export function focusableMetrics(
  tables: readonly TopicTable[],
  metricOf: (id: number) => Metric | undefined
): Metric[] {
  const out: Metric[] = [];
  for (const t of tables)
    for (const id of t.metrics) {
      const m = metricOf(id);
      if (m != null && m.kind === 'num' && m.meta !== true) out.push(m);
    }
  return out;
}

/** One place on a ranking. `rank` is a competition rank (ties share the better rank). */
export interface RankedEntry {
  index: number;
  value: number;
  rank: number;
}

/** Places with a value, best first for the given direction, with competition ranks. */
export function rankEntries(
  values: ArrayLike<number>,
  direction: Direction
): RankedEntry[] {
  const idx: number[] = [];
  for (let i = 0; i < values.length; i++)
    if (Number.isFinite(values[i])) idx.push(i);
  idx.sort((a, b) =>
    direction === 1 ? values[b] - values[a] : values[a] - values[b]
  );
  const out: RankedEntry[] = [];
  for (let k = 0; k < idx.length; k++) {
    const value = values[idx[k]];
    const rank = k > 0 && value === out[k - 1].value ? out[k - 1].rank : k + 1;
    out.push({ index: idx[k], value, rank });
  }
  return out;
}

/**
 * Competition ranks aligned to the input (NaN where missing): rank 1 is the best value for the
 * direction. Used for the table's rank column so filtering never renumbers places.
 */
export function rankColumn(
  values: ArrayLike<number>,
  direction: Direction
): Float64Array {
  const out = new Float64Array(values.length).fill(NaN);
  for (const e of rankEntries(values, direction)) out[e.index] = e.rank;
  return out;
}

/**
 * The slice of a ranking to chart: everything when short, otherwise the top `top` and bottom
 * `bottom` places (`gap` tells the chart to draw a break between them).
 */
export function rankWindow(
  entries: readonly RankedEntry[],
  top = 15,
  bottom = 5
): { head: RankedEntry[]; tail: RankedEntry[]; gap: boolean } {
  if (entries.length <= top + bottom)
    return { head: [...entries], tail: [], gap: false };
  return {
    head: entries.slice(0, top),
    tail: entries.slice(entries.length - bottom),
    gap: true,
  };
}

/** Median of the finite values (NaN when none). */
export function median(values: readonly number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  const mid = (v.length - 1) / 2;
  return (v[Math.floor(mid)] + v[Math.ceil(mid)]) / 2;
}

/** One point of a trend line: a series (a place or the median) at a year. */
export interface TrendPoint {
  series: string;
  year: number;
  value: number | null;
}

/**
 * Trend lines for a metric: the median across all places for each year, plus one line per
 * requested place. Years where a place has no value become null so the line shows a gap.
 */
export function trendPoints(
  topic: TopicFile,
  metricId: number,
  years: readonly number[],
  places: readonly { index: number; name: string }[],
  entityCount: number,
  medianLabel = 'Median'
): TrendPoint[] {
  const out: TrendPoint[] = [];
  const perPlace = places.map(() => [] as TrendPoint[]);
  for (const year of years) {
    const col = numericColumn(topic, metricId, year, entityCount);
    const vals: number[] = [];
    for (let i = 0; i < col.length; i++)
      if (!Number.isNaN(col[i])) vals.push(col[i]);
    const m = median(vals);
    out.push({ series: medianLabel, year, value: Number.isNaN(m) ? null : m });
    places.forEach((p, k) => {
      const v = col[p.index];
      perPlace[k].push({
        series: p.name,
        year,
        value: Number.isNaN(v) ? null : v,
      });
    });
  }
  for (const pts of perPlace) out.push(...pts);
  return out;
}

/** One place drawn on the trend chart. `slot` is its position in the top places, -1 when it is only there because it is selected. */
export interface TrendPick {
  index: number;
  slot: number;
  selected: boolean;
}

/**
 * Places for the trend chart: the top `limit` of the ranking in rank order, then the selected
 * place when it is not among them. Each top place keeps its slot (and so its colour) whatever is
 * selected, so highlighting a place never recolours the other lines.
 */
export function trendPicks(
  ranked: readonly RankedEntry[],
  selected: number | null,
  limit: number
): TrendPick[] {
  const out: TrendPick[] = [];
  for (let k = 0; k < ranked.length && k < limit; k++) {
    const index = ranked[k].index;
    out.push({ index, slot: k, selected: index === selected });
  }
  if (selected != null && !out.some((p) => p.selected))
    out.push({ index: selected, slot: -1, selected: true });
  return out;
}

/** Split a source pipe list ("A | B | C") into trimmed items. */
export function splitList(value: string): string[] {
  return value
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** How many places share one categorical value, with the places themselves. */
export interface ValueCount {
  value: string;
  count: number;
  indexes: number[];
}

/**
 * Value counts of a categorical column, most common first (ties alphabetical). Pipe lists count
 * once per item, so "Spanish | English" adds a place to both values.
 */
export function valueCounts(
  values: readonly (string | number | null)[]
): ValueCount[] {
  const map = new Map<string, number[]>();
  values.forEach((v, i) => {
    if (v == null) return;
    const items = typeof v === 'number' ? [String(v)] : splitList(v);
    for (const item of new Set(items)) {
      const list = map.get(item);
      if (list == null) map.set(item, [i]);
      else list.push(i);
    }
  });
  return [...map.entries()]
    .map(([value, indexes]) => ({ value, count: indexes.length, indexes }))
    .sort((a, b) =>
      b.count !== a.count ? b.count - a.count : a.value.localeCompare(b.value)
    );
}

/** True when a categorical metric is worth charting: a few distinct values, some shared. */
export function isChartableCategory(counts: readonly ValueCount[]): boolean {
  return counts.length >= 1 && counts.length <= 24 && counts[0].count >= 2;
}

/** One place's change on a metric between two years. `gain` > 0 means it moved the good way. */
export interface Change {
  index: number;
  from: number;
  to: number;
  delta: number;
  gain: number;
}

/**
 * Biggest movers between two aligned columns: places with a value in both years, split into the
 * `limit` largest gains and the `limit` largest losses in the metric's direction (for a neutral
 * metric, increases and decreases). Unchanged places are left out of both lists.
 */
export function biggestChanges(
  from: ArrayLike<number>,
  to: ArrayLike<number>,
  direction: Direction,
  limit = 5
): { gains: Change[]; losses: Change[]; compared: number } {
  const all: Change[] = [];
  const n = Math.min(from.length, to.length);
  for (let i = 0; i < n; i++) {
    const a = from[i];
    const b = to[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const delta = b - a;
    all.push({ index: i, from: a, to: b, delta, gain: delta * direction });
  }
  const gains = all
    .filter((c) => c.gain > 0)
    .sort((x, y) => y.gain - x.gain)
    .slice(0, limit);
  const losses = all
    .filter((c) => c.gain < 0)
    .sort((x, y) => x.gain - y.gain)
    .slice(0, limit);
  return { gains, losses, compared: all.length };
}

/** The two years a "biggest changes" view compares: the previous year into the selected one. */
export function comparedYears(
  years: readonly number[],
  year: number | null
): [from: number, to: number] | null {
  if (years.length < 2 || year == null) return null;
  const k = years.indexOf(year);
  if (k < 0) return null;
  return k === 0 ? [years[0], years[1]] : [years[k - 1], year];
}

/** True when positive values are skewed enough that a log axis reads better than a linear one. */
export function isSkewed(stats: {
  min: number;
  median: number;
  max: number;
}): boolean {
  if (!(stats.min > 0) || !(stats.median > 0)) return false;
  return stats.max / stats.median >= 8 || stats.median / stats.min >= 8;
}

/** Round tick values (1, 2, 5 × 10ⁿ, or only powers of ten when crowded) inside [min, max]. */
export function logTicks(min: number, max: number): number[] {
  if (!(min > 0) || !(max >= min)) return [];
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  const pick = (steps: readonly number[]) => {
    const out: number[] = [];
    for (let k = lo; k <= hi; k++)
      for (const m of steps) {
        const v = m * 10 ** k;
        if (v >= min && v <= max) out.push(v);
      }
    return out;
  };
  const dense = pick([1, 2, 5]);
  return dense.length <= 7 ? dense : pick([1]);
}
