import { Link } from '@tanstack/react-router';

import { placeNoun } from './model';
import { pairHash } from './related/relatedModel';
import type { TopicRef } from '~/data/topicPage';
import type { TopicFile, TopicSummary } from '~/data/types';
import { formatInt } from '~/lib/format';
import { canonicalTopicSlug, MIN_TOPIC_PLACES } from '~/seo/indexing';

/** Suggestions per page. */
const SHOWN = 8;
/** Of those, at most this many from the page's own place type while others are available… */
const SAME_TYPE = 6;
/** …and at most this many from other place types, so a state topic can lead to its country version. */
const OTHER_TYPES = 2;
/**
 * Suggestion links from indexable pages a topic should have before topics with fewer links go
 * ahead of it. Without this every page suggested the biggest rankings of its categories, and
 * hundreds of indexable topics had no link but their category hub's.
 */
const TARGET_LINKS = 3;

const TYPE_LABEL: Record<TopicSummary['type'], string> = {
  state: 'US states',
  county: 'US counties',
  city: 'US cities',
  country: 'Countries',
  'world-city': 'World cities',
};

const topicKey = (t: { type: string; slug: string }) => `${t.type}/${t.slug}`;

/** "Keep exploring" for every topic, keyed "<type>/<slug>" (see `planSuggestions`). */
export type SuggestionPlan = ReadonlyMap<string, readonly TopicSummary[]>;

/** One candidate suggestion for one page, with what orders it. */
interface Candidate {
  topic: TopicSummary;
  key: string;
  /** Categories it shares with the page */
  overlap: number;
  /** Suggestion links it has from indexable pages planned so far */
  links: number;
  /** A hash of the page and candidate, so equally good candidates differ from page to page */
  tie: number;
}

/**
 * Candidates below TARGET_LINKS first; then more shared categories, fewer links so far, and the
 * pair hash (then the key, so the order is total).
 */
function byNeed(a: Candidate, b: Candidate): number {
  const fullA = a.links >= TARGET_LINKS ? 1 : 0;
  const fullB = b.links >= TARGET_LINKS ? 1 : 0;
  if (fullA !== fullB) return fullA - fullB;
  if (a.overlap !== b.overlap) return b.overlap - a.overlap;
  if (a.links !== b.links) return a.links - b.links;
  if (a.tie !== b.tie) return a.tie - b.tie;
  return a.key < b.key ? -1 : 1;
}

/**
 * Up to eight topics to read next on every topic page: topics sharing a category with it, up to
 * six of its own place type and two of others. Only pages search engines may index are
 * suggested: never a noindex topic (`noindex`, keyed "<type>/<slug>"), an alias that names
 * another topic as canonical, or a list of fewer than MIN_TOPIC_PLACES places.
 *
 * The picks are spread over the whole index rather than always the largest rankings: pages are
 * planned one after another in a fixed pseudo-random order (a hash of each key), and each page
 * prefers the candidates that have the fewest suggestion links from indexable pages so far
 * until they reach TARGET_LINKS, then the ones sharing the most categories. The plan depends
 * only on `index` and `noindex`, so the prerender and the page-data script (which writes what
 * the browser reads) compute the same lists.
 */
export function planSuggestions(
  index: readonly TopicSummary[],
  noindex: ReadonlySet<string>
): SuggestionPlan {
  const linkable = (t: TopicSummary) =>
    t.n >= MIN_TOPIC_PLACES &&
    !noindex.has(topicKey(t)) &&
    canonicalTopicSlug(t.type, t.slug) === t.slug;
  const byCategory = new Map<string, TopicSummary[]>();
  for (const t of index) {
    if (!linkable(t)) continue;
    for (const c of t.cats) {
      const list = byCategory.get(c);
      if (list == null) byCategory.set(c, [t]);
      else list.push(t);
    }
  }
  const links = new Map<string, number>();
  const order = index
    .map((t) => ({ t, key: topicKey(t), h: pairHash(topicKey(t), '') }))
    .sort((a, b) => (a.h !== b.h ? a.h - b.h : a.key < b.key ? -1 : 1));
  const plan = new Map<string, TopicSummary[]>();
  for (const { t: page, key: pageKey } of order) {
    const overlap = new Map<string, Candidate>();
    for (const c of page.cats) {
      for (const t of byCategory.get(c) ?? []) {
        const key = topicKey(t);
        if (key === pageKey) continue;
        const hit = overlap.get(key);
        if (hit != null) hit.overlap++;
        else
          overlap.set(key, {
            topic: t,
            key,
            overlap: 1,
            links: links.get(key) ?? 0,
            tie: pairHash(page.slug, t.slug),
          });
      }
    }
    const ranked = [...overlap.values()].sort(byNeed);
    const picked = new Set<Candidate>();
    let same = 0;
    let other = 0;
    for (const c of ranked) {
      if (picked.size >= SHOWN) break;
      if (c.topic.type === page.type ? same < SAME_TYPE : other < OTHER_TYPES) {
        picked.add(c);
        if (c.topic.type === page.type) same++;
        else other++;
      }
    }
    for (const c of ranked) {
      if (picked.size >= SHOWN) break;
      picked.add(c);
    }
    // Shown with the page's own place type first.
    const list = [...picked].sort(
      (a, b) =>
        Number(a.topic.type !== page.type) - Number(b.topic.type !== page.type)
    );
    if (!noindex.has(pageKey))
      for (const c of list) links.set(c.key, (links.get(c.key) ?? 0) + 1);
    plan.set(
      pageKey,
      list.map((c) => c.topic)
    );
  }
  return plan;
}

/** The last plan worked out, per index and noindex set (both are cached for the session). */
const plans = new WeakMap<
  readonly TopicSummary[],
  { noindex: ReadonlySet<string>; plan: SuggestionPlan }
>();

/** A page's "Keep exploring" topics from `planSuggestions`, planned once per index. */
export function suggestTopics(
  topic: Pick<TopicFile, 'slug' | 'type'>,
  index: readonly TopicSummary[],
  noindex: ReadonlySet<string>
): readonly TopicSummary[] {
  let hit = plans.get(index);
  if (hit == null || hit.noindex !== noindex) {
    hit = { noindex, plan: planSuggestions(index, noindex) };
    plans.set(index, hit);
  }
  return hit.plan.get(topicKey(topic)) ?? [];
}

/**
 * "Keep exploring": suggested statistic pages at the bottom of a topic page. `items` is
 * `suggestTopics` for the page, worked out with the page's data slice (features/topic/pageData.ts)
 * so the page never downloads the index of every topic.
 */
export function SuggestedTopics({
  topic,
  items,
}: {
  topic: Pick<TopicFile, 'type'>;
  items: readonly TopicRef[];
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="suggested-heading" className="mt-12">
      <h2 id="suggested-heading" className="text-lg font-semibold">
        Keep exploring
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((t) => (
          <li key={`${t.type}/${t.slug}`}>
            <Link
              to="/topics/$type/$slug"
              params={{ type: t.type, slug: t.slug }}
              className="border-app bg-surface hover:border-accent-300 dark:hover:border-accent-700 block h-full rounded-xl border p-3 transition-colors"
            >
              <span className="block text-sm leading-snug font-medium text-balance">
                {t.title}
              </span>
              <span className="text-muted mt-1 block text-xs">
                {t.type === topic.type
                  ? `${formatInt(t.n)} ${placeNoun(t.type, t.n)}`
                  : TYPE_LABEL[t.type]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
