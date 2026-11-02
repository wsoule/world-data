// Loads metric catalogs for the search index. A catalog the page already has (TanStack Query cache)
// is used as is; otherwise catalog.worker.ts downloads and parses it off the main thread. Browsers
// without module workers, and any worker failure, fall back to the normal query fetch.

import type { QueryClient } from '@tanstack/react-query';

import type { SearchMetric } from './searchMetric';
import { metricsQuery } from '~/data/api';
import type { EntityType } from '~/data/types';

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

/**
 * The searchable fields of one place type's metric catalog: from the query cache when a page
 * already loaded it, else from the worker, else (no worker, or it failed) from a normal fetch.
 */
export function loadSearchMetrics(
  qc: QueryClient,
  type: EntityType
): Promise<readonly SearchMetric[]> {
  const query = metricsQuery(type);
  const cached = qc.getQueryData(query.queryKey);
  if (cached != null) return Promise.resolve(cached);
  const w = catalogWorker();
  if (w == null) return qc.ensureQueryData(query);
  const url = new URL(
    `${import.meta.env.BASE_URL}data/${type}/metrics.json`,
    window.location.href
  ).href;
  return viaWorker(w, url).catch(() => qc.ensureQueryData(query));
}
