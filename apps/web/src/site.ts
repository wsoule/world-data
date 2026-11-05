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

/**
 * Cloudflare Web Analytics site token from VITE_CF_ANALYTICS_TOKEN at build time, or null when
 * unset (no beacon is loaded and the privacy page says there are no analytics). Cloudflare's
 * tokens are 32 hex characters; anything else is ignored rather than shipped into a script tag.
 */
export const ANALYTICS_TOKEN: string | null = analyticsToken(
  import.meta.env.VITE_CF_ANALYTICS_TOKEN
);

function analyticsToken(raw: string | undefined): string | null {
  const token = raw?.trim() ?? '';
  return /^[0-9a-f]{32}$/i.test(token) ? token : null;
}

/** Absolute URL for a site path ("/topics/…" → "https://…/topics/…"). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
