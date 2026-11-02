import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import { loadSearchMetrics } from './catalogWorkerApi';
import {
  categoryDocs,
  categoryLabelMap,
  metricDocBuilder,
  placeDocBuilder,
  type SearchDoc,
  SearchIndex,
  topicDocBuilder,
  topicTitleMap,
} from './searchIndex';
import { entitiesQuery, manifestQuery, topicsIndexQuery } from '~/data/api';
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
// Sources are indexed one at a time, in the order their files arrive.
let queue: Promise<void> = Promise.resolve();

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
 * Gives the browser a chance to handle input and paint between indexing slices:
 * `scheduler.yield()` where supported (it resumes ahead of other queued tasks), a zero-delay
 * timeout elsewhere.
 */
function pause(): Promise<void> {
  const scheduler = (
    globalThis as { scheduler?: { yield?: () => Promise<void> } }
  ).scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fail(e: unknown) {
  error = e instanceof Error ? e.message : String(e);
  started = false;
  publish();
}

/**
 * Queues one source for indexing. Each source is built and indexed in short slices
 * (SearchIndex.addInSlices) after the previous one finishes, so even the 4,000-metric catalogs
 * never block typing in the palette for more than a few milliseconds at a time.
 */
function enqueue<T>(
  source: string,
  items: readonly T[],
  toDoc: (item: T) => SearchDoc | null
) {
  queue = queue
    .then(async () => {
      if (await index.addInSlices(source, items, toDoc, pause)) loaded++;
      publish();
    })
    .catch(fail);
}

/**
 * Fetches every file search needs and queues each source for indexing as soon as its files
 * arrive: categories and topics first, then places, then the large metric catalogs. Small files
 * go through TanStack Query (so pages reuse the cache); the metric catalogs are parsed in a worker
 * unless a page already loaded them (loadSearchMetrics). Safe to call repeatedly; it runs once
 * unless a fetch failed.
 */
function startIndexing(qc: QueryClient) {
  if (started) return;
  started = true;
  error = null;
  const manifestP = qc.ensureQueryData(manifestQuery);
  const topicsP = qc.ensureQueryData(topicsIndexQuery);
  const titlesP = topicsP.then(topicTitleMap);
  manifestP
    .then((m) => enqueue('categories', categoryDocs(m), (d) => d))
    .catch(fail);
  Promise.all([manifestP, topicsP])
    .then(([m, t]) =>
      enqueue(
        'topics',
        t,
        topicDocBuilder(m, { featured: featuredTopicKeys() })
      )
    )
    .catch(fail);
  for (const type of ENTITY_TYPES) {
    Promise.all([manifestP, qc.ensureQueryData(entitiesQuery(type))])
      .then(([m, entities]) => {
        const info = m.types.find((t) => t.id === type);
        // A type missing from the manifest still counts as indexed, so loading can finish.
        if (info == null) enqueue(`places:${type}`, [], () => null);
        else enqueue(`places:${type}`, entities, placeDocBuilder(info));
      })
      .catch(fail);
    Promise.all([manifestP, titlesP, loadSearchMetrics(qc, type)])
      .then(([m, titles, metrics]) => {
        const info = m.types.find((t) => t.id === type);
        if (info == null) {
          enqueue(`metrics:${type}`, [], () => null);
          return;
        }
        enqueue(
          `metrics:${type}`,
          metrics,
          metricDocBuilder(info, titles, categoryLabelMap(m), {
            featured: featuredMetricIds(type),
          })
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
    if (!enabled) return;
    // A separate task, so the palette paints before the downloads are set up.
    const timer = window.setTimeout(() => startIndexing(qc), 0);
    return () => window.clearTimeout(timer);
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
