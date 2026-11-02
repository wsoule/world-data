import { useSyncExternalStore } from 'react';

/** True on macOS and iOS, where the command key is the shortcut modifier. */
function isApple(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.userAgent)
  );
}

/** Label of the modifier key: "⌘" on Apple devices, "Ctrl" elsewhere. */
export function modKeyLabel(): string {
  return isApple() ? '⌘' : 'Ctrl';
}

/** Label of the open-search shortcut: "⌘K" or "Ctrl K". */
export function searchShortcutLabel(): string {
  return isApple() ? '⌘K' : 'Ctrl K';
}

const noSubscribe = () => () => {};

/**
 * Platform-specific label as a hook: the server and hydration render the
 * non-Apple label, then Apple devices switch to ⌘ after hydration, so the
 * server HTML and the first client render always match.
 */
export function usePlatformLabel(
  label: () => string,
  serverLabel: string
): string {
  return useSyncExternalStore(noSubscribe, label, () => serverLabel);
}
