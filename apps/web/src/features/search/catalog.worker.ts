// Web Worker that downloads one compact search catalog (<type>/search.json, see searchCatalog.ts),
// parses it and posts back the metric fields search reads. Decoding off the main thread leaves the
// page a few milliseconds of structured-clone work instead.
// Messages: in { id, url }; out { id, metrics } or { id, error }.

import type { CatalogReply, CatalogRequest } from './catalogWorkerApi';
import { fromSearchCatalog } from './searchCatalog';
import type { SearchCatalog } from '~/data/types';

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
      const catalog = (await res.json()) as SearchCatalog;
      scope.postMessage({ id, metrics: fromSearchCatalog(catalog) });
    })
    .catch((err: unknown) => {
      scope.postMessage({
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
};
