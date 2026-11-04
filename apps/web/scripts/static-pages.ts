// The site's fixed content pages that do not come from the dataset: About, Methodology,
// Sources and licensing, Contact and corrections, Privacy and Terms. prerender-pages.ts adds
// them to the prerender list, which also feeds the sitemap, so each one becomes a static HTML
// file and an indexable URL.

import { TRUST_PAGES } from '../src/features/trust/pages';

/** One prerendered page with its sitemap entry; the same shape as PrerenderPage. */
export interface StaticPage {
  path: string;
  sitemap: { priority: number; changefreq: 'monthly' };
}

/** Site paths of the trust pages ("/about", "/methodology", …), in footer order. */
export const STATIC_PAGE_PATHS: readonly string[] = TRUST_PAGES.map(
  (p) => p.path
);

/**
 * The trust pages for the prerender list and sitemap. They carry no lastmod: their text changes
 * with the code, not with the dataset, so the build date would misstate when they last changed.
 * About, Methodology and Sources rank above the policy pages.
 */
export function staticPages(): StaticPage[] {
  return TRUST_PAGES.map((p) => ({
    path: p.path,
    sitemap: {
      priority:
        p.id === 'about' || p.id === 'methodology' || p.id === 'sources'
          ? 0.5
          : 0.3,
      changefreq: 'monthly',
    },
  }));
}
