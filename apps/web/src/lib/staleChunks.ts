// After a deploy, the hashed JS/CSS chunks an already-open tab was built with
// no longer exist on the server, so its next client-side navigation fails to
// load a route chunk. Reloading fetches the new build; the guard below makes
// sure a chunk that is genuinely broken cannot cause a reload loop.

const STALE_CHUNK =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css/i;
const LAST_RELOAD_KEY = 'rankodex:stale-chunk-reload';
const MIN_RELOAD_GAP_MS = 10_000;

/** Whether an error is a missing-chunk failure from an outdated build. */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return STALE_CHUNK.test(message);
}

/**
 * Reloads the page to pick up the current build, at most once every ten
 * seconds per tab (tracked in sessionStorage). Returns whether it reloaded;
 * without storage it never reloads, since it could not prevent a loop.
 */
export function reloadForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(LAST_RELOAD_KEY) ?? 0);
    if (Date.now() - last < MIN_RELOAD_GAP_MS) return false;
    sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * Listens for Vite's preload failure event (fired when a lazy route chunk or
 * its CSS is missing) and reloads instead of surfacing the error. Returns the
 * cleanup function, for use in an effect.
 */
export function installStaleChunkReload(): () => void {
  const onPreloadError = (event: Event) => {
    if (reloadForStaleChunk()) event.preventDefault();
  };
  window.addEventListener('vite:preloadError', onPreloadError);
  return () => window.removeEventListener('vite:preloadError', onPreloadError);
}
