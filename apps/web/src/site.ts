// Brand and canonical-URL settings shared by the app, route head tags and the
// build-time page list. Change the name here and the domain in site-url.ts.

import { resolveSiteUrl } from './site-url';

/** Public origin used for canonical URLs, Open Graph tags and the sitemap. */
export const SITE_URL: string = resolveSiteUrl(import.meta.env.VITE_SITE_URL);

export const SITE = {
  name: 'Rankodex',
  tagline: 'Rank, overlay and compare any country, state, city or county',
  description:
    'Rankodex ranks every country, US state, city and county on over 6,000 statistics. Search any metric, overlay two, build a combined ranking and see what correlates.',
  locale: 'en_US',
  /** Data provenance shown in footers and structured data. */
  sourceName: 'World Population Review',
  sourceUrl: 'https://worldpopulationreview.com',
} as const;

/** Absolute URL for a site path ("/topics/…" → "https://…/topics/…"). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
