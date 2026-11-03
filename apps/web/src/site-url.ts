// Default public origin, shared by src/site.ts (app) and vite.config.ts
// (sitemap). Override per deployment with the VITE_SITE_URL env variable.
export const DEFAULT_SITE_URL = 'https://rankodex.com';

/**
 * The public origin ("https://host", no path or trailing slash) from
 * VITE_SITE_URL, or DEFAULT_SITE_URL when it is unset or blank (a Docker
 * build arg or host variable can arrive as an empty string). A bare host
 * ("rankodex.com") gets https://; anything that is still not a URL throws, so
 * a typo fails the build instead of shipping broken canonical URLs.
 */
export function resolveSiteUrl(raw: string | undefined): string {
  const value =
    raw == null || raw.trim() === '' ? DEFAULT_SITE_URL : raw.trim();
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`VITE_SITE_URL is not a URL: "${value}"`);
  }
  if (url.hostname === '')
    throw new Error(`VITE_SITE_URL has no host: "${value}"`);
  return url.origin;
}
