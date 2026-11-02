import { useCallback, useSyncExternalStore } from 'react';

/**
 * Tracks a CSS media query, e.g. to give charts a shorter height on phones.
 * Server renders and hydration report false; the client then re-renders with
 * the real value.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}
