// Brand and canonical-URL settings shared by the app, route head tags and the
// build-time page list. Change the name here and the domain in site-url.ts.

import { DEFAULT_SITE_URL } from './site-url';

/** Public origin used for canonical URLs, Open Graph tags and the sitemap. */
export const SITE_URL: string = (
  import.meta.env.VITE_SITE_URL ?? DEFAULT_SITE_URL
).replace(/\/+$/, '');

export const SITE = {
  name: 'World Data',
  tagline: 'Compare and rank every statistic about the world’s places',
  description:
    'Explore, overlay and rank thousands of statistics about countries, US states, cities and counties: search any metric, plot two against each other, build combined rankings and see what correlates.',
  locale: 'en_US',
  /** Data provenance shown in footers and structured data. */
  sourceName: 'World Population Review',
  sourceUrl: 'https://worldpopulationreview.com',
} as const;

/** Absolute URL for a site path ("/topics/…" → "https://…/topics/…"). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
