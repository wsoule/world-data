// Builds and loads the slice of data one topic page reads (see src/data/topicPage.ts). The
// server and the bundle script (scripts/page-data.ts) build it from the whole place type; the
// browser fetches the file that script wrote into dist, so a visit or a client-side navigation
// to a topic page downloads its topic file, the type's entities and a few kilobytes of slice
// instead of the type's full catalog and values. The dev server has no such files, so in
// development the browser builds the slice itself.

import { type QueryClient, queryOptions } from '@tanstack/react-query';

import { headlineOverride } from './headline';
import {
  buildTopicGraph,
  isRankedTopic,
  relatedTopics,
  type TopicGraph,
} from './related/relatedModel';
import { suggestTopics } from './SuggestedTopics';
import { getJson, topicQuery, topicsIndexQuery } from '~/data/api';
import { type Dataset, loadDataset } from '~/data/dataset';
import { noindexTopicsQuery } from '~/data/noindexTopics';
import {
  type TopicPageData,
  topicPageSlice,
  type TopicRef,
} from '~/data/topicPage';
import type { EntityType, TopicFile, TopicSummary } from '~/data/types';
import { canonicalTopicSlug } from '~/seo/indexing';

/** Where the bundle script writes a topic page's slice, relative to /data. */
export const topicPagePath = (type: EntityType, slug: string) =>
  `${type}/pages/topics/${slug}.json`;

/**
 * One topic graph per full dataset (a place type's topics, title words and rings). The dataset
 * object is cached for the session, and during prerendering for the whole build, so the graph is
 * built once per place type rather than once per page.
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
 * The slice of `full` that the page of `topic` reads, with its "Keep exploring" and "Related
 * topics" lists worked out from every topic (`index`). `noindex` holds the keys of the noindex
 * topics (`noindexTopicsQuery`): they are never suggested, and the topics the page names carry
 * the flag.
 */
export function buildTopicPageData(
  topic: TopicFile,
  full: Dataset,
  index: readonly TopicSummary[],
  noindex: ReadonlySet<string>
): TopicPageData {
  const ref = (t: TopicSummary): TopicRef => ({
    slug: t.slug,
    type: t.type,
    title: t.title,
    n: t.n,
    ...(noindex.has(`${t.type}/${t.slug}`) ? { noindex: true as const } : {}),
  });
  const slice = topicPageSlice(topic, full, headlineOverride(topic)?.metric);
  const suggested = suggestTopics(topic, index, noindex);
  const related = relatedTopics(
    topic,
    topicGraph(full, index),
    new Set(suggested.map((t) => `${t.type}/${t.slug}`))
  );
  // Titles the page shows: its statistics' primary topics (labels such as "Score — Best
  // States"), its related pages in the header, and the two lists.
  const byKey = new Map(index.map((t) => [`${t.type}/${t.slug}`, t]));
  const named = new Map<string, TopicRef>();
  const name = (type: EntityType, slug: string | undefined) => {
    const key = `${type}/${slug}`;
    const hit = slug == null ? undefined : byKey.get(key);
    if (hit != null && !named.has(key)) named.set(key, ref(hit));
  };
  for (const m of slice.metrics) name(topic.type, m.topics[0]);
  for (const r of topic.related) name(r.type, r.slug);
  for (const t of [...suggested, ...related]) name(t.type, t.slug);
  return {
    ...slice,
    topics: [...named.values()],
    suggested: suggested.map(ref),
    related: related.map(ref),
  };
}

/** Builds a page's slice from the whole place type (server rendering and development). */
async function buildFromFull(
  qc: QueryClient,
  type: EntityType,
  slug: string
): Promise<TopicPageData> {
  const [full, topic, index, noindex] = await Promise.all([
    loadDataset(qc, type),
    qc.ensureQueryData(topicQuery(type, slug)),
    qc.ensureQueryData(topicsIndexQuery),
    qc.ensureQueryData(noindexTopicsQuery),
  ]);
  return buildTopicPageData(topic, full, index, noindex);
}

/**
 * A topic page's slice: built from the whole type while server rendering (where every file is
 * read from disk once per build) and on the dev server, fetched from the file the bundle script
 * wrote everywhere else.
 */
export const topicPageQuery = (
  qc: QueryClient,
  type: EntityType,
  slug: string
) =>
  queryOptions({
    queryKey: ['topic-page', type, slug],
    queryFn: () =>
      import.meta.env.SSR || import.meta.env.DEV
        ? buildFromFull(qc, type, slug)
        : getJson<TopicPageData>(topicPagePath(type, slug)),
    staleTime: Infinity,
    gcTime: Infinity,
  });
