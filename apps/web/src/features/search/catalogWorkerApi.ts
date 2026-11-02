// Loads metric catalogs for the search index. A full catalog the page already has (TanStack Query
// cache) is used as is; otherwise catalog.worker.ts downloads and decodes the compact search
// catalog (<type>/search.json) off the main thread. Browsers without module workers, and any
// worker failure, fall back to fetching the same compact file on the main thread.

import { type QueryClient, queryOptions } from '@tanstack/react-query';

import { fromSearchCatalog } from './searchCatalog';
import type { SearchMetric } from './searchMetric';
import { metricsQuery } from '~/data/api';
import type { EntityType, SearchCatalog } from '~/data/types';

export interface CatalogRequest {
  id: number;
  url: string;
}

export type CatalogReply =
  | { id: number; metrics: SearchMetric[] }
  | { id: number; error: string };

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<
  number,
  { resolve: (m: SearchMetric[]) => void; reject: (e: Error) => void }
>();

/** The shared catalog worker, started on first use; null where workers are unavailable. */
function catalogWorker(): Worker | null {
  if (worker != null) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./catalog.worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    return null;
  }
  worker.onmessage = (e: MessageEvent<CatalogReply>) => {
    const reply = e.data;
    const pending = waiting.get(reply.id);
    if (pending == null) return;
    waiting.delete(reply.id);
    if ('error' in reply) pending.reject(new Error(reply.error));
    else pending.resolve(reply.metrics);
    if (waiting.size === 0) stopWorker();
  };
  worker.onerror = () => {
    for (const p of waiting.values()) p.reject(new Error('Worker failed'));
    waiting.clear();
    stopWorker();
  };
  return worker;
}

/** Ends the worker once nothing is waiting on it; the next request starts a fresh one. */
function stopWorker() {
  worker?.terminate();
  worker = null;
}

/** Asks the worker for one catalog. */
function viaWorker(w: Worker, url: string): Promise<SearchMetric[]> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ id, url } satisfies CatalogRequest);
  });
}

/** Absolute URL of one place type's compact search catalog. */
function searchCatalogUrl(type: EntityType): string {
  return new URL(
    `${import.meta.env.BASE_URL}data/${type}/search.json`,
    window.location.href
  ).href;
}

/** The compact search catalog fetched and decoded on the main thread (the no-worker fallback). */
const searchCatalogQuery = (type: EntityType) =>
  queryOptions({
    queryKey: ['search-catalog', type],
    queryFn: async (): Promise<SearchMetric[]> => {
      const url = searchCatalogUrl(type);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
      return fromSearchCatalog((await res.json()) as SearchCatalog);
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

/**
 * The searchable fields of one place type's metric catalog: from the query cache when a page
 * already loaded the full catalog, else the compact search catalog from the worker, else (no
 * worker, or it failed) from a main-thread fetch of the same file.
 */
export function loadSearchMetrics(
  qc: QueryClient,
  type: EntityType
): Promise<readonly SearchMetric[]> {
  const cached = qc.getQueryData(metricsQuery(type).queryKey);
  if (cached != null) return Promise.resolve(cached);
  const fallback = () => qc.ensureQueryData(searchCatalogQuery(type));
  const w = catalogWorker();
  if (w == null) return fallback();
  return viaWorker(w, searchCatalogUrl(type)).catch(fallback);
}
