import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import {
  categoryDocs,
  categoryLabelMap,
  metricDocs,
  placeDocs,
  SearchIndex,
  topicDocs,
  topicTitleMap,
} from './searchIndex';
import {
  entitiesQuery,
  manifestQuery,
  metricsQuery,
  topicsIndexQuery,
} from '~/data/api';
import { ENTITY_TYPES } from '~/data/types';
import { featuredMetricIds, featuredTopicKeys } from '~/features/home/presets';

export interface SearchIndexState {
  index: SearchIndex;
  /** Changes whenever documents are added; use it as a memo dependency for results */
  version: number;
  loaded: number;
  total: number;
  /** True until every source has been indexed */
  loading: boolean;
  error: string | null;
}

// One shared index for the palette and the /search page, built once per session.
const index = new SearchIndex();
// categories + topics + places and metrics for every type
const TOTAL_SOURCES = 2 + ENTITY_TYPES.length * 2;
let started = false;
let loaded = 0;
let error: string | null = null;
let snapshot: SearchIndexState = makeSnapshot();
const listeners = new Set<() => void>();

function makeSnapshot(): SearchIndexState {
  return {
    index,
    version: index.version,
    loaded,
    total: TOTAL_SOURCES,
    loading: loaded < TOTAL_SOURCES && error == null,
    error,
  };
}

function publish() {
  snapshot = makeSnapshot();
  listeners.forEach((l) => l());
}

/**
 * Fetches every file search needs through TanStack Query (so pages reuse the cache) and adds each
 * source to the index as soon as its files arrive: categories and topics first, then places, then
 * the large metric catalogs. Safe to call repeatedly; it runs once unless a fetch failed.
 */
function startIndexing(qc: QueryClient) {
  if (started) return;
  started = true;
  error = null;
  const fail = (e: unknown) => {
    error = e instanceof Error ? e.message : String(e);
    started = false;
    publish();
  };
  const addSource = (
    source: string,
    build: () => Parameters<SearchIndex['add']>[1]
  ) => {
    if (!index.has(source)) {
      index.add(source, build());
      loaded++;
    }
    publish();
  };
  const manifestP = qc.ensureQueryData(manifestQuery);
  const topicsP = qc.ensureQueryData(topicsIndexQuery);
  manifestP
    .then((m) => addSource('categories', () => categoryDocs(m)))
    .catch(fail);
  Promise.all([manifestP, topicsP])
    .then(([m, t]) =>
      addSource('topics', () =>
        topicDocs(t, m, { featured: featuredTopicKeys() })
      )
    )
    .catch(fail);
  for (const type of ENTITY_TYPES) {
    Promise.all([manifestP, qc.ensureQueryData(entitiesQuery(type))])
      .then(([m, entities]) => {
        const info = m.types.find((t) => t.id === type);
        addSource(`places:${type}`, () =>
          info != null ? placeDocs(info, entities) : []
        );
      })
      .catch(fail);
    Promise.all([manifestP, topicsP, qc.ensureQueryData(metricsQuery(type))])
      .then(([m, topics, metrics]) => {
        const info = m.types.find((t) => t.id === type);
        addSource(`metrics:${type}`, () =>
          info != null
            ? metricDocs(
                info,
                metrics,
                topicTitleMap(topics),
                categoryLabelMap(m),
                { featured: featuredMetricIds(type) }
              )
            : []
        );
      })
      .catch(fail);
  }
}

/**
 * The shared search index. Pass `enabled: false` to subscribe without starting the downloads
 * (the palette starts them on first open, not on page load).
 */
export function useSearchIndex(enabled = true): SearchIndexState {
  const qc = useQueryClient();
  useEffect(() => {
    if (enabled) startIndexing(qc);
  }, [enabled, qc]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot
  );
}
