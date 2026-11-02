import { useSyncExternalStore } from 'react';

// Global open/close state for the ⌘K search palette.
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openSearch() {
  open = true;
  emit();
}
export function closeSearch() {
  open = false;
  emit();
}
export function toggleSearch() {
  open = !open;
  emit();
}
export function useSearchOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open
  );
}
