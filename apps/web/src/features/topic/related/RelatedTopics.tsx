import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';

import { placeNoun } from '../model';
import { suggestTopics } from '../SuggestedTopics';
import {
  buildTopicGraph,
  isRankedTopic,
  relatedTopics,
  type TopicGraph,
} from './relatedModel';
import { topicsIndexQuery } from '~/data/api';
import { type Dataset, useDataset } from '~/data/dataset';
import type { TopicFile, TopicSummary } from '~/data/types';
import { formatInt } from '~/lib/format';
import { canonicalTopicSlug } from '~/seo/indexing';

/**
 * One topic graph per loaded dataset (a place type's topics, title words and rings). The
 * dataset object is cached for the session, and during prerendering for the whole build, so
 * the graph is built once per place type rather than once per page.
 */
const graphs = new WeakMap<Dataset, TopicGraph>();

function topicGraph(
  dataset: Dataset,
  index: readonly TopicSummary[]
): TopicGraph {
  let graph = graphs.get(dataset);
  if (graph == null) {
    // Never link a page that is noindex (thin) or that names another topic as canonical.
    graph = buildTopicGraph(
      index,
      dataset.type.id,
      (t) =>
        canonicalTopicSlug(t.type, t.slug) === t.slug &&
        isRankedTopic(t, (id) => dataset.metric(id))
    );
    graphs.set(dataset, graph);
  }
  return graph;
}

/**
 * "Related topics": up to eight other rankings of the same place type that share statistics, a
 * category or a subject with this page (see relatedModel.ts). Pages already suggested under
 * "Keep exploring" are left out so the two lists never repeat a link.
 */
export function RelatedTopics({
  topic,
}: {
  topic: Pick<TopicFile, 'slug' | 'type' | 'cats' | 'related'>;
}) {
  const { data: index } = useSuspenseQuery(topicsIndexQuery);
  const dataset = useDataset(topic.type);
  const items = useMemo(() => {
    const suggested = new Set(
      suggestTopics(topic, index).map((t) => `${t.type}/${t.slug}`)
    );
    return relatedTopics(topic, topicGraph(dataset, index), suggested);
  }, [topic, index, dataset]);
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
