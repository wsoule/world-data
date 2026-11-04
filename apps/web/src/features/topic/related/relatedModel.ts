// Picks the "Related topics" links at the end of a topic page: other pages about the same place
// type that share statistics, categories or title words with this one. Every page with a real
// ranking is also linked from its two neighbours in its category's "ring" (the category's ranked
// topics in subject order), so no such page depends on its category hub for its only link.
// Pure functions, covered by test/related-topics.test.ts.

import type { EntityType, Metric, TopicSummary } from '~/data/types';

/** Links shown in the block. */
export const RELATED_SHOWN = 8;

/** Places a topic needs (and its best numeric statistic must cover) to count as a real ranking. */
export const MIN_RANKED_PLACES = 10;

/** One topic of the place type, prepared for scoring. */
interface Node {
  topic: TopicSummary;
  key: string;
  /** Distinct title words, lowercased and singularised */
  words: Set<string>;
  /** Sorted metric ids joined, to spot exact duplicates */
  metricKey: string;
  ranked: boolean;
}

/** Everything about one place type's topics that does not depend on the page being shown. */
export interface TopicGraph {
  type: EntityType;
  nodes: Map<string, Node>;
  /** Rarity weight of each title word: log(topics / topics using the word) */
  idf: Map<string, number>;
  /** Ranked topics' keys per primary category, in subject order */
  rings: Map<string, string[]>;
}

const topicKey = (t: { type: string; slug: string }) => `${t.type}/${t.slug}`;

/** "Gun Laws by State" → ["gun", "law", "by", "state"]: lowercase words, plural "s" dropped. */
export function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !/^\d+$/.test(w))
    .map((w) =>
      w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w
    );
}

/**
 * Whether a topic is a real ranking: at least ten places and a numeric statistic (not a
 * bookkeeping column) with at least ten values. Table-only and tiny lists are left out of the
 * links, since they are thin pages.
 */
export function isRankedTopic(
  t: Pick<TopicSummary, 'n' | 'metrics'>,
  metricOf: (id: number) => Pick<Metric, 'kind' | 'meta' | 'n'> | undefined
): boolean {
  if (t.n < MIN_RANKED_PLACES) return false;
  return t.metrics.some((id) => {
    const m = metricOf(id);
    return (
      m != null &&
      m.kind === 'num' &&
      m.meta !== true &&
      m.n >= MIN_RANKED_PLACES
    );
  });
}

/** Rarity a title word needs to count as a subject word: used by under 3% of the topics. */
const SUBJECT_IDF = Math.log(1 / 0.03);

/**
 * Words that say what a topic is about, in title order: those used by fewer than 3% of the
 * type's topics ("gun", "abortion"), not the template words ("best", "states", "by").
 */
function subjectKey(node: Node, idf: Map<string, number>): string {
  const words = [...node.words].filter((w) => (idf.get(w) ?? 0) >= SUBJECT_IDF);
  return `${words.join(' ')}\u0000${node.topic.slug}`;
}

/** Prepares one place type's topics: title word weights, duplicates and category rings. */
export function buildTopicGraph(
  index: readonly TopicSummary[],
  type: EntityType,
  isRanked: (t: TopicSummary) => boolean
): TopicGraph {
  const nodes = new Map<string, Node>();
  const df = new Map<string, number>();
  for (const topic of index) {
    if (topic.type !== type) continue;
    const words = new Set(titleWords(topic.title));
    for (const w of words) df.set(w, (df.get(w) ?? 0) + 1);
    nodes.set(topicKey(topic), {
      topic,
      key: topicKey(topic),
      words,
      metricKey: [...topic.metrics].sort((a, b) => a - b).join(','),
      ranked: isRanked(topic),
    });
  }
  const total = nodes.size;
  const idf = new Map<string, number>();
  for (const [w, n] of df) idf.set(w, Math.log(total / n));

  const groups = new Map<string, { key: string; order: string }[]>();
  for (const node of nodes.values()) {
    const cat = node.topic.cats[0];
    if (!node.ranked || cat == null) continue;
    const list = groups.get(cat) ?? [];
    list.push({ key: node.key, order: subjectKey(node, idf) });
    groups.set(cat, list);
  }
  const rings = new Map<string, string[]>();
  for (const [cat, list] of groups)
    rings.set(
      cat,
      list
        .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
        .map((x) => x.key)
    );
  return { type, nodes, idf, rings };
}

interface Scored {
  node: Node;
  score: number;
  /** Tie-breaker: a hash of the page and candidate slugs */
  tie: number;
}

/** Closest first; equal scores by the pair hash, then slug, so the order is stable. */
function byScore(a: Scored, b: Scored): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.tie !== b.tie) return a.tie - b.tie;
  return a.node.topic.slug < b.node.topic.slug ? -1 : 1;
}

/** FNV-1a hash of "a|b": a stable pseudo-random number for a pair of slugs. */
export function pairHash(a: string, b: string): number {
  let h = 0x811c9dc5;
  const s = `${a}|${b}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** How closely a candidate relates to the page: shared statistics, categories and title words. */
function relatedness(
  page: Node,
  other: Node,
  idf: Map<string, number>
): number {
  const pageMetrics = new Set(page.topic.metrics);
  const sharedMetrics = other.topic.metrics.filter((id) =>
    pageMetrics.has(id)
  ).length;
  const sharedCats = other.topic.cats.filter((c) =>
    page.topic.cats.includes(c)
  ).length;
  // Only words used by under about a third of the topics count ("gun", "income", not "by").
  let words = 0;
  for (const w of other.words) {
    const weight = idf.get(w) ?? 0;
    if (weight >= 1 && page.words.has(w)) words += weight;
  }
  return (
    (sharedMetrics > 0 ? 8 : 0) +
    (sharedCats > 0 ? 4 : 0) +
    (other.topic.cats[0] === page.topic.cats[0] ? 1 : 0) +
    Math.min(words, 12) / 3
  );
}

/**
 * Up to eight related topics of the same place type, closest first: topics sharing statistics,
 * then the same category, then shared title words. Never the page itself, a page with exactly
 * the same statistics (a duplicate list such as "coldest" and "hottest"), a thin page, or a page
 * in `exclude` (already linked elsewhere on the page). The page's two ring neighbours are always
 * included when they qualify, which guarantees every ranked topic two links from its category.
 */
export function relatedTopics(
  page: Pick<TopicSummary, 'type' | 'slug'>,
  graph: TopicGraph,
  exclude: ReadonlySet<string> = new Set(),
  shown = RELATED_SHOWN
): TopicSummary[] {
  const self = graph.nodes.get(topicKey(page));
  if (self == null) return [];
  const eligible = (n: Node | undefined): n is Node =>
    n != null &&
    n.key !== self.key &&
    n.ranked &&
    n.metricKey !== self.metricKey &&
    !exclude.has(n.key);

  // Equally close candidates (often just "same category") are ordered by a hash of the two
  // slugs, so different pages link different ones instead of all linking the first A–Z.
  const scored: Scored[] = [];
  for (const node of graph.nodes.values())
    if (eligible(node))
      scored.push({
        node,
        score: relatedness(self, node, graph.idf),
        tie: pairHash(self.topic.slug, node.topic.slug),
      });
  scored.sort(byScore);

  const picked = new Map<string, Scored>();
  const ring = self.ranked
    ? graph.rings.get(self.topic.cats[0] ?? '')
    : undefined;
  if (ring != null && ring.length > 1) {
    const at = ring.indexOf(self.key);
    for (const step of [-1, 1]) {
      const key = ring[(at + step + ring.length) % ring.length];
      const hit = scored.find((s) => s.node.key === key);
      if (hit != null) picked.set(key, hit);
    }
  }
  for (const s of scored) {
    if (picked.size >= shown) break;
    picked.set(s.node.key, s);
  }
  return [...picked.values()].sort(byScore).map((s) => s.node.topic);
}
