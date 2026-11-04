import { Link } from '@tanstack/react-router';

import { placeNoun } from '../model';
import type { TopicRef } from '~/data/topicPage';
import type { TopicFile } from '~/data/types';
import { formatInt } from '~/lib/format';

/**
 * "Related topics": up to eight other rankings of the same place type that share statistics, a
 * category or a subject with this page (see relatedModel.ts). Pages already suggested under
 * "Keep exploring" are left out so the two lists never repeat a link. `items` is worked out with
 * the page's data slice (features/topic/pageData.ts), from every topic of the type.
 */
export function RelatedTopics({
  topic,
  items,
}: {
  topic: Pick<TopicFile, 'type'>;
  items: readonly TopicRef[];
}) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="related-topics-heading" className="mt-12">
      <h2 id="related-topics-heading" className="text-lg font-semibold">
        Related topics
      </h2>
      <p className="text-muted mt-0.5 text-sm">
        More rankings of {placeNoun(topic.type)} that share statistics, a
        category or a subject with this one.
      </p>
      <ul className="border-app mt-4 grid gap-x-8 border-t sm:grid-cols-2">
        {items.map((t) => (
          <li
            key={t.slug}
            className="border-app flex min-w-0 items-baseline justify-between gap-3 border-b py-2"
          >
            <Link
              to="/topics/$type/$slug"
              params={{ type: t.type, slug: t.slug }}
              className="hover:text-accent-700 dark:hover:text-accent-300 min-w-0 text-sm font-medium hover:underline"
            >
              {t.title}
            </Link>
            <span className="text-muted tabular shrink-0 text-xs">
              {formatInt(t.n)} {placeNoun(t.type, t.n)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
