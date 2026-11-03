// Post-processing for the sitemap.xml TanStack Start writes at build time.

/**
 * Strips the trailing slash TanStack's sitemap gives index routes
 * ("https://…/categories/"), keeping the site root, so every <loc> is the
 * canonical URL rather than one the server redirects with a 308.
 */
export function canonicalSitemap(xml: string): string {
  return xml.replace(
    /<loc>(https?:\/\/[^/<]+\/[^<]*?[^/<])\/<\/loc>/g,
    '<loc>$1</loc>'
  );
}
