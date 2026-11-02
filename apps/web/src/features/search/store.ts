import { useSyncExternalStore } from 'react';

// Global open/close state for the ⌘K search palette, plus an optional query to start with
// (the home page hero and "try" chips open the palette pre-filled).
let open = false;
let seed = '';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openSearch() {
  seed = '';
  open = true;
  emit();
}

/** Opens the palette with `query` already typed. */
export function openSearchWith(query: string) {
  seed = query;
  open = true;
  emit();
}

export function closeSearch() {
  open = false;
  emit();
}
export function toggleSearch() {
  seed = '';
  open = !open;
  emit();
}

/** The query the palette was last opened with ('' for a plain open). */
export function getSearchSeed(): string {
  return seed;
}

export function useSearchOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => false
  );
}
