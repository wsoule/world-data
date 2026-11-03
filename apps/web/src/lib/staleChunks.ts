// After a deploy, the hashed chunks an already-open tab was built with no
// longer exist on the server. TanStack Router reloads the page once when a
// lazy route component fails to load this way (lazyRouteComponent); this
// module does the same for the app's other dynamic imports, the map shapes,
// which would otherwise leave "Could not load map geometry" until a manual
// reload. A global vite:preloadError listener is deliberately not used: it
// also fires for hover-intent preloads, so merely hovering a link after a
// deploy would reload the current page.

const STALE_CHUNK =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;
const RELOADED_KEY_PREFIX = 'rankodex:chunk-reload:';

/** Whether an error is a missing-chunk failure from an outdated build. */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return STALE_CHUNK.test(message);
}

/**
 * Reloads the page to pick up the current build, once per failing module
 * (the error message names the chunk URL; remembered in sessionStorage, as
 * TanStack Router does). Returns false without reloading when that module
 * already caused a reload, or when storage is unavailable, so a chunk that
 * is genuinely broken cannot cause a reload loop.
 */
export function reloadOnceForStaleChunk(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const key = `${RELOADED_KEY_PREFIX}${message}`;
  try {
    if (sessionStorage.getItem(key) != null) return false;
    sessionStorage.setItem(key, '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * Runs a dynamic import. If its chunk is gone because the site was
 * redeployed, the page reloads once instead of failing, and the returned
 * promise never settles (the page is being replaced). Any other error, or a
 * second failure of the same chunk, is thrown as usual.
 */
export async function importFresh<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (isStaleChunkError(error) && reloadOnceForStaleChunk(error)) {
      return new Promise<T>(() => undefined);
    }
    throw error;
  }
}
