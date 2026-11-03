import { useSyncExternalStore } from 'react';

// Global open/close state for the ⌘K search palette, plus an optional query to start with
// (the home page hero and "try" chips open the palette pre-filled).
import type { GoalId } from './goals';

let open = false;
let seed = '';
/** Goal to preselect when the palette opens from a goal chip (home page); null otherwise. */
let seedGoal: GoalId | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openSearch() {
  seed = '';
  seedGoal = null;
  open = true;
  emit();
}

/** Opens the palette with `query` already typed. */
export function openSearchWith(query: string) {
  seed = query;
  seedGoal = null;
  open = true;
  emit();
}

export function closeSearch() {
  open = false;
  emit();
}
/** Opens the palette with `goal` selected, so its ideas show first. */
export function openSearchForGoal(goal: GoalId) {
  seed = '';
  seedGoal = goal;
  open = true;
  emit();
}

export function toggleSearch() {
  seed = '';
  seedGoal = null;
  open = !open;
  emit();
}

/** The goal the palette was last opened for (null for a plain open). */
export function getSearchSeedGoal(): GoalId | null {
  return seedGoal;
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
