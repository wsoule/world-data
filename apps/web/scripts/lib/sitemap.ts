// Post-processing for the sitemap.xml TanStack Start writes at build time.
// Pure functions, so scripts/seo-files.ts stays a thin file writer and the
// rules can be tested.

/** Every <url>…</url> entry with its <loc>. */
const URL_ENTRY = /[ \t]*<url>\s*<loc>([^<]*)<\/loc>[\s\S]*?<\/url>\n?/g;

/**
 * Strips the trailing slash TanStack's sitemap gives index routes
 * ("https://…/categories/"), keeping the site root, so every <loc> is the
 * canonical URL rather than one the server redirects with a 308. TanStack
 * also lists an index route a second time (its own "/categories/" next to
 * the page list's "/categories"), so a <url> whose <loc> was already listed
 * is dropped, keeping the first, which carries the page's metadata.
 */
export function canonicalSitemap(xml: string): string {
  const stripped = xml.replace(
    /<loc>(https?:\/\/[^/<]+\/[^<]*?[^/<])\/<\/loc>/g,
    '<loc>$1</loc>'
  );
  const seen = new Set<string>();
  return stripped.replace(URL_ENTRY, (entry: string, loc: string) => {
    if (seen.has(loc)) return '';
    seen.add(loc);
    return entry;
  });
}

/** The <loc> of every <url> entry, in order. */
export function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(URL_ENTRY)].map((m) => m[1] ?? '');
}

/** Removes every <url> entry whose <loc> fails `keep`. */
export function filterSitemap(
  xml: string,
  keep: (loc: string) => boolean
): string {
  return xml.replace(URL_ENTRY, (entry: string, loc: string) =>
    keep(loc) ? entry : ''
  );
}

/**
 * Sets every entry's <lastmod> to `lastmod(loc)`, right after its <loc>, and
 * removes it where that is null. TanStack writes the build date for a page
 * that gave no date, which would claim every rebuild changed the page.
 */
export function setLastmod(
  xml: string,
  lastmod: (loc: string) => string | null
): string {
  return xml.replace(URL_ENTRY, (entry: string, loc: string) => {
    const date = lastmod(loc);
    const bare = entry.replace(/\n[ \t]*<lastmod>[^<]*<\/lastmod>/, '');
    return date == null
      ? bare
      : bare.replace(
          /(\n([ \t]*)<loc>[^<]*<\/loc>)/,
          `$1\n$2<lastmod>${date}</lastmod>`
        );
  });
}

/** What a page's own HTML tells crawlers about indexing it. */
export interface PageIndexing {
  /** Its robots meta tag says noindex */
  noindex: boolean;
  /** Its canonical link, or null when it has none */
  canonical: string | null;
}

/** Name/value pairs of one tag's double-quoted attributes. */
function attributes(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, name, value] of tag.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) {
    if (name != null && value != null)
      out.set(name.toLowerCase(), value.replaceAll('&amp;', '&'));
  }
  return out;
}

/**
 * Reads the robots meta tag and the canonical link from a prerendered page's
 * <head>, in whatever attribute order the renderer wrote them.
 */
export function pageIndexing(html: string): PageIndexing {
  const end = html.indexOf('</head>');
  const head = end === -1 ? html : html.slice(0, end);
  let noindex = false;
  let canonical: string | null = null;
  for (const [tag] of head.matchAll(/<(?:meta|link)\b[^>]*>/gi)) {
    const a = attributes(tag);
    if (
      a.get('name')?.toLowerCase() === 'robots' &&
      /\bnoindex\b/i.test(a.get('content') ?? '')
    )
      noindex = true;
    if (canonical == null && a.get('rel')?.toLowerCase() === 'canonical')
      canonical = a.get('href') ?? null;
  }
  return { noindex, canonical };
}

/**
 * Whether a sitemap URL belongs in the sitemap given its page's HTML: the page
 * must not say noindex and must name itself as canonical.
 */
export function belongsInSitemap(loc: string, page: PageIndexing): boolean {
  return !page.noindex && page.canonical === loc;
}
