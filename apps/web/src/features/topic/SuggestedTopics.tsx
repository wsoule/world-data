import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { placeNoun } from './model';
import { topicsIndexQuery } from '~/data/api';
import type { TopicFile, TopicSummary } from '~/data/types';
import { formatInt } from '~/lib/format';

const SHOWN = 8;
/** Smallest ranking worth suggesting: tiny top-10 lists make poor next pages. */
const MIN_PLACES = 15;

const TYPE_LABEL: Record<TopicSummary['type'], string> = {
  state: 'US states',
  county: 'US counties',
  city: 'US cities',
  country: 'Countries',
  'world-city': 'World cities',
};

/**
 * Up to eight topics to read next: the source's own related topics, then the topics sharing the
 * most categories (same place type first, bigger rankings first), with up to two from other place
 * types so a state topic can lead to its country version.
 */
export function suggestTopics(
  topic: Pick<TopicFile, 'slug' | 'type' | 'cats' | 'related'>,
  index: readonly TopicSummary[]
): TopicSummary[] {
  const key = (t: { type: string; slug: string }) => `${t.type}/${t.slug}`;
  const byKey = new Map(index.map((t) => [key(t), t]));
  const out: TopicSummary[] = [];
  const seen = new Set([key(topic)]);
  const add = (t: TopicSummary | undefined) => {
    if (t == null || seen.has(key(t)) || t.n < MIN_PLACES) return;
    seen.add(key(t));
    out.push(t);
  };
  for (const r of topic.related) add(byKey.get(key(r)));
  const overlap = (t: TopicSummary) =>
    t.cats.filter((c) => topic.cats.includes(c)).length;
  const candidates = index
    .filter((t) => overlap(t) > 0)
    .sort((a, b) =>
      overlap(a) !== overlap(b) ? overlap(b) - overlap(a) : b.n - a.n
    );
  for (const t of candidates) {
    if (out.length >= SHOWN - 2) break;
    if (t.type === topic.type) add(t);
  }
  let other = 0;
  for (const t of candidates) {
    if (out.length >= SHOWN || other >= 2) break;
    if (t.type !== topic.type && !seen.has(key(t))) {
      add(t);
      other++;
    }
  }
  for (const t of candidates) {
    if (out.length >= SHOWN) break;
    add(t);
  }
  return out.slice(0, SHOWN);
}

/** "Keep exploring": suggested statistic pages at the bottom of a topic page. */
export function SuggestedTopics({
  topic,
}: {
  topic: Pick<TopicFile, 'slug' | 'type' | 'cats' | 'related'>;
}) {
  const { data: index } = useSuspenseQuery(topicsIndexQuery);
  const items = suggestTopics(topic, index);
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
