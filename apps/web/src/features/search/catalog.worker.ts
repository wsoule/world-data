// Web Worker that downloads one metrics.json catalog, parses it and posts back only the fields
// search reads. Decoding and parsing a 1.3 MB catalog takes 20–60 ms of main-thread time; doing it
// here leaves the page a few milliseconds of structured-clone work instead.
// Messages: in { id, url }; out { id, metrics } or { id, error }.

import type { CatalogReply, CatalogRequest } from './catalogWorkerApi';
import { toSearchMetric } from './searchMetric';
import type { Metric } from '~/data/types';

/** The worker global, typed for what this file uses (the app's TS config only has DOM types). */
const scope = globalThis as unknown as {
  onmessage: ((e: MessageEvent<CatalogRequest>) => void) | null;
  postMessage: (message: CatalogReply) => void;
};

scope.onmessage = (e) => {
  const { id, url } = e.data;
  fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
      const metrics = (await res.json()) as Metric[];
      scope.postMessage({ id, metrics: metrics.map(toSearchMetric) });
    })
    .catch((err: unknown) => {
      scope.postMessage({
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
};
