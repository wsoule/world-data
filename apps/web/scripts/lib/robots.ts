// The robots.txt that scripts/seo-files.ts writes, and the build check that no
// indexable page reaches another one only through a URL robots.txt blocks.
// Pure functions, so the rules can be tested without a build.

import { CATEGORY_LABELS } from './reference';

/** Crawlers named explicitly so their access is unambiguous. */
export const NAMED_CRAWLERS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'GPTBot',
  'Claude-SearchBot',
  'Claude-User',
  'ClaudeBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Bingbot',
  'DuckAssistBot',
  'MistralAI-User',
] as const;

/**
 * Category hubs with a query string: "/categories/law?type=state" opens a hub
 * on one place type. Each names the bare hub as canonical, so crawlers get only
 * the bare /categories/<id>, and the site's own links name the place type in
 * history state instead (see blockedOnlyLinks). One plain prefix per category
 * (from CATEGORY_LABELS, which the manifest's categories come from) needs no
 * "*" wildcard, so it works for every crawler.
 */
export const CATEGORY_QUERY_PREFIXES: readonly string[] = [
  '/categories?',
  ...Object.keys(CATEGORY_LABELS).map((id) => `/categories/${id}?`),
];

/**
 * Paths no crawler gets, as robots.txt prefixes: search results, the
 * query-string states of the client-rendered compare and head-to-head tools,
 * and the category hubs' place-type variants. Every page links to some of
 * those states (tens of thousands of distinct URLs), and all of them name the
 * bare path as canonical (/compare and /vs are the same empty shell). The bare
 * paths stay crawlable so crawlers can read their "noindex, follow": that
 * includes /search itself, which every footer links, so only its query states
 * ("/search?q=…") are blocked.
 */
export const DISALLOWED: readonly string[] = [
  '/search?',
  '/compare?',
  '/vs?',
  ...CATEGORY_QUERY_PREFIXES,
];

/**
 * Topic pages with a query string ("?m=…" focuses another metric, "?year=…"
 * another year), which name the bare topic URL as canonical. The pattern needs
 * the "*" wildcard, which RFC 9309 standardised and Google, Bing and the AI
 * crawlers that document their rules support. A crawler that does not reads
 * it as a literal prefix that no URL starts with, so there it blocks nothing,
 * and every group can carry it.
 */
export const WILDCARD_DISALLOWED = ['/topics/*?'] as const;

/** The rule lines every robots.txt group carries, in file order. */
export function robotsRules(): string[] {
  return [
    ...DISALLOWED.map((p) => `Disallow: ${p}`),
    ...WILDCARD_DISALLOWED.map((p) => `Disallow: ${p}`),
    'Allow: /',
  ];
}

/**
 * robots.txt: every crawler is welcome everywhere except DISALLOWED and
 * WILDCARD_DISALLOWED, the named crawlers each get the same rules in their own
 * group (a crawler with a group of its own ignores "*"), and the file ends
 * with the sitemap. Disallow lines come before "Allow: /" so a crawler that
 * takes the first matching rule, rather than the longest one as RFC 9309
 * says, still skips them.
 */
export function robotsTxt(siteUrl: string): string {
  const group = (agent: string): string[] => [
    `User-agent: ${agent}`,
    ...robotsRules(),
    '',
  ];
  return [
    '# Search engines and AI answer engines are welcome to crawl and cite this site.',
    ...group('*'),
    ...NAMED_CRAWLERS.flatMap(group),
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

/** A robots.txt path pattern as a regular expression ("*" any run, a final "$" the end). */
function patternRegExp(pattern: string): RegExp {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
    .replace(/\\\$$/, '$');
  return new RegExp(`^${source}`);
}

/**
 * Whether robots.txt `rules` (lines such as "Disallow: /vs?") let a crawler fetch `path`
 * (query included), the RFC 9309 way: the longest matching rule wins, Allow on a tie.
 */
export function robotsAllows(rules: readonly string[], path: string): boolean {
  let best: { length: number; allow: boolean } | null = null;
  for (const rule of rules) {
    const m = /^(Allow|Disallow):\s*(.+)$/.exec(rule);
    if (m == null) continue;
    const pattern = m[2] ?? '';
    if (!patternRegExp(pattern).test(path)) continue;
    const allow = m[1] === 'Allow';
    if (
      best == null ||
      pattern.length > best.length ||
      (pattern.length === best.length && allow)
    )
      best = { length: pattern.length, allow };
  }
  return best?.allow ?? true;
}

/** A built page as the crawl check sees it. */
export interface LinkedPage {
  /** Site path: "/" or without a trailing slash ("/categories/law") */
  path: string;
  /** Not marked noindex */
  indexable: boolean;
  /** Every <a href> on the page as written: site-relative, or absolute on `siteUrl` */
  links: readonly string[];
}

/** An indexable page that links another indexable page only through a blocked URL. */
export interface BlockedOnlyLink {
  source: string;
  /** The indexable page the blocked URL is a variant of (its path without the query) */
  target: string;
  /** The blocked URL the source links instead */
  via: string;
}

/**
 * Pairs of indexable pages where the source links the target only through URLs robots.txt
 * blocks (such as "/categories/law?type=state" and never "/categories/law"), so crawlers
 * never follow that link to the target. scripts/seo-files.ts fails the build on any: a link
 * that carries a reader's view choice names it in history state and links the bare URL, as
 * topic focus (`topicFocus`) and category place types (`categoryType`) do. Links to other
 * hosts and to pages that are not indexable are ignored.
 */
export function blockedOnlyLinks(
  pages: readonly LinkedPage[],
  siteUrl: string,
  rules: readonly string[] = robotsRules()
): BlockedOnlyLink[] {
  const indexable = new Set(
    pages.filter((p) => p.indexable).map((p) => p.path)
  );
  const out: BlockedOnlyLink[] = [];
  for (const page of pages) {
    if (!page.indexable) continue;
    const reached = new Set<string>();
    const blocked = new Map<string, string>();
    for (const raw of page.links) {
      const href = raw.startsWith(siteUrl) ? raw.slice(siteUrl.length) : raw;
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      const url = href.split('#')[0] ?? '';
      const bare = url.split('?')[0] ?? '';
      const target = bare.length > 1 ? bare.replace(/\/+$/, '') : bare;
      if (!indexable.has(target)) continue;
      if (robotsAllows(rules, url)) reached.add(target);
      else if (!blocked.has(target)) blocked.set(target, url);
    }
    for (const [target, via] of blocked)
      if (!reached.has(target)) out.push({ source: page.path, target, via });
  }
  return out;
}
