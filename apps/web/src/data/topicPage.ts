// The share of a place type's data that one topic page reads. A topic page shows its own
// statistics, so it needs their catalog entries and default-year values, the few columns the
// adjustments divide by and a handful of topic titles, not the whole type: country values.json
// alone is about 1 MB gzip. The page builds a small Dataset from this slice, the topic file and
// the type's entities, and every chart, table and sentence reads it exactly as it would read the
// full Dataset. Only the correlations card, which scans every statistic, loads the full one.

import { incomeMetricFor } from './adjustments';
import { Dataset } from './dataset';
import { RPP } from './external';
import type {
  Entity,
  EntityType,
  Manifest,
  Metric,
  TopicFile,
  TopicSummary,
  ValuesFile,
} from './types';

/** A topic named on a page: enough to link it and say how many places it ranks. */
export type TopicRef = Pick<TopicSummary, 'slug' | 'type' | 'title' | 'n'>;

/** <type>/pages/topics/<slug>.json: everything a topic page reads beyond its topic file. */
export interface TopicPageData {
  /** Catalog entries of the statistics the page reads (see `topicPageMetricIds`) */
  metrics: Metric[];
  /** Default-year values (values.json rows) that the topic's own series cannot reproduce */
  values: ValuesFile['metrics'];
  /** Metrics whose default-year values are exactly their topic series at that year */
  derived: number[];
  /** Topics the page names: its metrics' primary topics, its related pages and the lists below */
  topics: TopicRef[];
  /** "Keep exploring" (see `suggestTopics`) */
  suggested: TopicRef[];
  /** "Related topics" (see `relatedTopics`) */
  related: TopicRef[];
}

/** Synthetic population metric: per-person adjustments divide by it. */
const POPULATION = -1;

/**
 * Metrics a topic page reads: the topic's own, a headline metric the topic borrows (`borrowed`,
 * see HEADLINES in features/topic/headline.ts) and the columns the adjustments divide by
 * (population, the price level and the income measure of the place type).
 */
export function topicPageMetricIds(
  topic: Pick<TopicFile, 'type' | 'metrics'>,
  borrowed: number | undefined
): number[] {
  const income = incomeMetricFor(topic.type);
  const ids = new Set(topic.metrics);
  for (const id of [borrowed, POPULATION, RPP.allItems, income])
    if (id != null) ids.add(id);
  return [...ids];
}

/**
 * A metric's default-year values as values.json stores them, rebuilt from the topic's series at
 * the metric's default year (`_` when undated): numbers only for numeric metrics, text for the
 * rest. Null when the topic has no such series.
 */
export function seriesRow(
  topic: Pick<TopicFile, 'series'>,
  metric: Pick<Metric, 'id' | 'kind' | 'year'>
): [number[], (number | string)[]] | null {
  const pick =
    topic.series[String(metric.id)]?.[
      metric.year == null ? '_' : String(metric.year)
    ];
  if (pick == null) return null;
  const idx: number[] = [];
  const vals: (number | string)[] = [];
  pick[0].forEach((e, k) => {
    const v = pick[1][k];
    if (metric.kind !== 'num') {
      idx.push(e);
      vals.push(String(v));
    } else if (typeof v === 'number') {
      idx.push(e);
      vals.push(v);
    }
  });
  return idx.length === 0 ? null : [idx, vals];
}

/** Whether two values rows hold the same places and values in the same order. */
export function sameRow(
  a: readonly [readonly number[], readonly (number | string)[]],
  b: readonly [readonly number[], readonly (number | string)[]]
): boolean {
  if (a[0].length !== b[0].length || a[1].length !== b[1].length) return false;
  for (let k = 0; k < a[0].length; k++)
    if (a[0][k] !== b[0][k] || !Object.is(a[1][k], b[1][k])) return false;
  return true;
}

/**
 * The slice of `full` (a whole place type) that the page of `topic` reads, minus the topic
 * lists, which the caller works out from every topic of the type. Values the topic file already
 * carries are not repeated: a metric whose values.json row equals its own series at the default
 * year is listed under `derived` instead.
 */
export function topicPageSlice(
  topic: TopicFile,
  full: Dataset,
  borrowed: number | undefined
): Pick<TopicPageData, 'metrics' | 'values' | 'derived'> {
  const wanted = new Set(topicPageMetricIds(topic, borrowed));
  // Catalog order, as the full dataset lists them.
  const metrics = full.metrics.filter((m) => wanted.has(m.id));
  const values: ValuesFile['metrics'] = [];
  const derived: number[] = [];
  for (const m of metrics) {
    const row = full.row(m.id);
    if (row == null) continue;
    const own = seriesRow(topic, m);
    if (own != null && sameRow(own, row)) derived.push(m.id);
    else values.push([m.id, row[0], row[1]]);
  }
  return { metrics, values, derived };
}

const sliceCache = new WeakMap<TopicPageData, Dataset>();

/**
 * The Dataset a topic page renders from: the type's entities, the slice's metrics and values
 * (derived ones rebuilt from the topic's series) and the slice's topic titles. Cached per slice
 * object, so the loader and the page share one instance and its memoised columns and facts.
 */
export function topicDataset(
  manifest: Manifest,
  type: EntityType,
  entities: Entity[],
  topic: TopicFile,
  page: TopicPageData
): Dataset {
  let ds = sliceCache.get(page);
  if (ds != null) return ds;
  const info = manifest.types.find((t) => t.id === type);
  if (info == null) throw new Error(`Unknown entity type ${type}`);
  const derived = new Set(page.derived);
  const rows: ValuesFile['metrics'] = [];
  for (const m of page.metrics) {
    if (!derived.has(m.id)) continue;
    const row = seriesRow(topic, m);
    if (row != null) rows.push([m.id, row[0], row[1]]);
  }
  ds = new Dataset(
    info,
    entities,
    page.metrics,
    { entityCount: entities.length, metrics: [...page.values, ...rows] },
    page.topics
  );
  sliceCache.set(page, ds);
  return ds;
}
