// Which topic pages are noindex (thin: isIndexableTopic in seo/indexing.ts). Deciding that takes
// each topic's file, so the pages that only know the topics index ("Keep exploring" on topic
// pages, the order of category hubs) read this list instead: worked out once per build while
// prerendering, written by scripts/page-data.ts for the browser. Kept apart from topicPage.ts
// so category hubs load only this, not the topic page's data code.

import { queryOptions } from '@tanstack/react-query';

import { getJson } from './api';
import type {
  EntityType,
  Manifest,
  Metric,
  TopicFile,
  TopicSummary,
} from './types';
import { isIndexableTopic, topicCoverage } from '~/seo/indexing';

/** Where the page-data script writes `noindexTopicKeys`, relative to /data. */
export const NOINDEX_TOPICS_PATH = 'pages/noindex-topics.json';

/**
 * Keys ("<type>/<slug>") of the topics whose pages are noindex: no numeric or categorical
 * metric covers MIN_TOPIC_PLACES places (isIndexableTopic). Deciding that takes each topic's
 * file, so pages that only know the topics index (suggestions, category hubs) read this list.
 * Sorted, so the file is stable between builds.
 */
export function noindexTopicKeys(
  topics: Iterable<Pick<TopicFile, 'type' | 'slug' | 'metrics' | 'series'>>,
  metricOf: (
    type: EntityType,
    id: number
  ) => Pick<Metric, 'kind' | 'meta'> | undefined
): string[] {
  const out: string[] = [];
  for (const t of topics)
    if (!isIndexableTopic(topicCoverage(t, (id) => metricOf(t.type, id))))
      out.push(`${t.type}/${t.slug}`);
  return out.sort();
}

/** Reads every topic file and catalog to work out `noindexTopicKeys` (server rendering only). */
async function noindexFromFiles(): Promise<string[]> {
  const [manifest, index] = await Promise.all([
    getJson<Manifest>('manifest.json'),
    getJson<TopicSummary[]>('topics.json'),
  ]);
  const catalogs = new Map<EntityType, Map<number, Metric>>();
  for (const info of manifest.types) {
    const list = await getJson<Metric[]>(`${info.id}/metrics.json`);
    catalogs.set(info.id, new Map(list.map((m) => [m.id, m])));
  }
  const files = await Promise.all(
    index.map((t) => getJson<TopicFile>(`${t.type}/topics/${t.slug}.json`))
  );
  return noindexTopicKeys(files, (type, id) => catalogs.get(type)?.get(id));
}

let serverNoindex: Promise<ReadonlySet<string>> | null = null;

/** Empty in development, where the browser builds page data without the files it would take. */
const NONE: ReadonlySet<string> = new Set();

/**
 * The noindex topics as a set. The prerender works them out from every topic file once per
 * build, and the browser fetches the list the page-data script wrote from the same function,
 * so both suggest and order the same pages. The dev server, whose browser builds page data
 * itself and cannot read every topic file, treats every topic as indexable on both sides.
 */
export const noindexTopicsQuery = queryOptions({
  queryKey: ['noindex-topics'],
  queryFn: async (): Promise<ReadonlySet<string>> => {
    if (import.meta.env.DEV) return NONE;
    if (import.meta.env.SSR) {
      serverNoindex ??= noindexFromFiles().then((keys) => new Set(keys));
      return serverNoindex;
    }
    return new Set(await getJson<string[]>(NOINDEX_TOPICS_PATH));
  },
  staleTime: Infinity,
  gcTime: Infinity,
});
