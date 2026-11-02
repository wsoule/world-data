// Pure helpers behind /categories and /categories/$category: per-type topic counts, example
// topics, the best-covered metrics of a category, and topic "last updated" dates. Covered by
// test/categories-stats.test.ts.

import {
  ENTITY_TYPES,
  type EntityType,
  type Manifest,
  type Metric,
  type TopicSummary,
} from '~/data/types';

export interface CategorySummary {
  id: string;
  label: string;
  /** Topics in this category across all types */
  total: number;
  /** Topics per place type, in ENTITY_TYPES order, only types that have any */
  byType: { type: EntityType; count: number }[];
  /** A few well-covered topics, spread across place types */
  examples: TopicSummary[];
}

/** How useful a topic is as an example: broad coverage and several metrics. */
function topicWeight(
  t: TopicSummary,
  entities: ReadonlyMap<EntityType, number>
) {
  const total = Math.max(1, entities.get(t.type) ?? t.n);
  return (
    Math.min(1, t.n / total) * Math.log2(2 + Math.min(t.metrics.length, 12))
  );
}

/**
 * Picks `count` example topics, best first, but takes each place type's best topic before a
 * second topic of the same type so examples show the category's range.
 */
export function pickExamples(
  topics: readonly TopicSummary[],
  entities: ReadonlyMap<EntityType, number>,
  count = 3
): TopicSummary[] {
  const weight = new Map(topics.map((t) => [t, topicWeight(t, entities)]));
  const w = (t: TopicSummary) => weight.get(t) ?? 0;
  const ranked = [...topics].sort((a, b) =>
    w(a) !== w(b) ? w(b) - w(a) : a.title.localeCompare(b.title)
  );
  const out: TopicSummary[] = [];
  const usedTypes = new Set<EntityType>();
  for (const t of ranked) {
    if (out.length >= count) break;
    if (!usedTypes.has(t.type)) {
      out.push(t);
      usedTypes.add(t.type);
    }
  }
  for (const t of ranked) {
    if (out.length >= count) break;
    if (!out.includes(t)) out.push(t);
  }
  return out.sort((a, b) => w(b) - w(a));
}

/** One summary per manifest category, in manifest order. */
export function summarizeCategories(
  manifest: Manifest,
  topics: readonly TopicSummary[]
): CategorySummary[] {
  const entities = new Map(manifest.types.map((t) => [t.id, t.entities]));
  const byCategory = new Map<string, TopicSummary[]>();
  for (const t of topics)
    for (const c of t.cats) {
      const list = byCategory.get(c);
      if (list == null) byCategory.set(c, [t]);
      else list.push(t);
    }
  return manifest.categories.map((c) => {
    const list = byCategory.get(c.id) ?? [];
    const counts = new Map<EntityType, number>();
    for (const t of list) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
    return {
      id: c.id,
      label: c.label,
      total: list.length,
      byType: ENTITY_TYPES.filter((t) => (counts.get(t) ?? 0) > 0).map(
        (type) => ({ type, count: counts.get(type) ?? 0 })
      ),
      examples: pickExamples(list, entities),
    };
  });
}

/** The place type with the most topics in a summary (ties go to ENTITY_TYPES order). */
export function dominantType(
  summary: Pick<CategorySummary, 'byType'>
): EntityType {
  let best: { type: EntityType; count: number } | null = null;
  for (const t of summary.byType)
    if (best == null || t.count > best.count) best = t;
  return best?.type ?? 'country';
}

/** Bookkeeping columns that slip through without a `meta` flag ("Most Recent Update Year"). */
const BOOKKEEPING = /\b(year|updated?|notes?)\b/i;

/**
 * The category's most comparable metrics for one place type: numeric, covering at least 60% of
 * places, from a source topic that itself belongs to the category, one per label and one per
 * topic (so six obesity breakdowns do not crowd out the rest). Ranked by coverage, columns shared
 * by several topics, a known better/worse direction, a topic's headline (first) column, and topics
 * filed first under this category.
 *
 * `topicInfo` maps "type:slug" to that topic's categories and metric ids (see topicInfoMap).
 */
export function topCategoryMetrics(
  metrics: readonly Metric[],
  type: EntityType,
  category: string,
  entityCount: number,
  topicInfo: ReadonlyMap<string, Pick<TopicSummary, 'cats' | 'metrics'>>,
  limit = 8
): Metric[] {
  const minN = Math.max(3, Math.ceil(entityCount * 0.6));
  const byLabel = new Map<string, { m: Metric; s: number }>();
  for (const m of metrics) {
    if (m.kind !== 'num' || m.meta === true || m.base === true) continue;
    if (!m.cats.includes(category) || m.n < minN) continue;
    if (BOOKKEEPING.test(m.label)) continue;
    const primary = m.topics[0];
    const topic =
      primary != null ? topicInfo.get(`${type}:${primary}`) : undefined;
    if (topic == null || !topic.cats.includes(category)) continue;
    const s =
      m.n / Math.max(1, entityCount) +
      0.15 * Math.min(3, m.topics.length) +
      (m.pol !== 0 ? 0.2 : 0) +
      (topic.metrics[0] === m.id ? 0.2 : 0) +
      (topic.cats[0] === category ? 0.25 : 0);
    const key = m.label.trim().toLowerCase();
    const prev = byLabel.get(key);
    if (prev == null || s > prev.s) byLabel.set(key, { m, s });
  }
  const ranked = [...byLabel.values()].sort((a, b) =>
    a.s !== b.s ? b.s - a.s : a.m.label.localeCompare(b.m.label)
  );
  const out: Metric[] = [];
  const usedTopics = new Set<string>();
  for (const { m } of ranked) {
    if (out.length >= limit) break;
    const topic = m.topics[0] ?? `#${m.id}`;
    if (usedTopics.has(topic)) continue;
    usedTopics.add(topic);
    out.push(m);
  }
  return out;
}

/** "type:slug" → topic, the lookup topCategoryMetrics needs. */
export function topicInfoMap(
  topics: readonly TopicSummary[]
): Map<string, TopicSummary> {
  return new Map(topics.map((t) => [`${t.type}:${t.slug}`, t]));
}

/**
 * Well-known partner metric to overlay a category metric against, per place type. Labels are
 * written for the middle of a sentence ("overlay against GDP per capita").
 */
const OVERLAY_PARTNER: Partial<
  Record<EntityType, { id: number; label: string }>
> = {
  state: { id: 24419, label: 'median household income' },
  country: { id: 19182, label: 'GDP per capita' },
};

/**
 * The metric to plot against `metricId` in a quick overlay: income for states, GDP per capita for
 * countries, population otherwise (or when the metric is the partner itself).
 */
export function overlayPartner(
  type: EntityType,
  metricId: number
): { id: number; label: string } {
  const p = OVERLAY_PARTNER[type];
  return p != null && p.id !== metricId ? p : { id: -1, label: 'population' };
}

/** Most recent `updated` date among a topic's metrics, when the topic itself has none. */
export function latestUpdate(
  topic: Pick<TopicSummary, 'updated' | 'metrics'>,
  metricById: ReadonlyMap<number, Pick<Metric, 'updated'>> | null
): string | null {
  if (topic.updated != null) return topic.updated;
  if (metricById == null) return null;
  let latest: string | null = null;
  for (const id of topic.metrics) {
    const u = metricById.get(id)?.updated ?? null;
    if (u != null && (latest == null || u > latest)) latest = u;
  }
  return latest;
}
