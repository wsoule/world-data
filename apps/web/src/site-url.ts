// Default public origin, shared by src/site.ts (app) and vite.config.ts
// (sitemap). Override per deployment with the VITE_SITE_URL env variable.
export const DEFAULT_SITE_URL = 'https://rankodex.com';

/**
 * The public origin without a trailing slash: VITE_SITE_URL when it is set
 * and not blank (a Docker build arg or host variable can arrive as an empty
 * string), else DEFAULT_SITE_URL.
 */
export function resolveSiteUrl(raw: string | undefined): string {
  const value = raw == null || raw.trim() === '' ? DEFAULT_SITE_URL : raw;
  return value.trim().replace(/\/+$/, '');
}
