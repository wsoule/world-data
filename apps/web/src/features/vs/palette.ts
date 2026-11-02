import type { Theme } from '~/lib/theme';

/**
 * One colour per compared place (up to four), distinct from the red/green used for
 * better/worse and readable on both themes: brighter variants in dark mode.
 */
export function placePalette(theme: Theme): readonly string[] {
  return theme === 'dark'
    ? ['#818cf8', '#fbbf24', '#22d3ee', '#f472b6']
    : ['#4f46e5', '#d97706', '#0891b2', '#db2777'];
}

/** Most places a head-to-head compares at once. */
export const MAX_PLACES = 4;
