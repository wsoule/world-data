// The robots.txt that scripts/seo-files.ts writes. A pure function, so the
// rules can be tested without a build.

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
 * on one place type, and topic pages link to 68 such variants. Each names the
 * bare hub as canonical, so crawlers get only the bare /categories/<id>. One
 * plain prefix per category (from CATEGORY_LABELS, which the manifest's
 * categories come from) needs no "*" wildcard, so it works for every group.
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
 * paths stay crawlable so crawlers can read their "noindex, follow".
 */
export const DISALLOWED: readonly string[] = [
  '/search',
  '/compare?',
  '/vs?',
  ...CATEGORY_QUERY_PREFIXES,
];

/**
 * Topic pages with a query string ("?m=…" focuses another metric, "?year=…"
 * another year), which name the bare topic URL as canonical. The pattern needs
 * the "*" wildcard, so it only goes to the groups of crawlers documented to
 * support it: Googlebot, which has no group of its own and reads "*", and
 * Bingbot.
 */
export const WILDCARD_DISALLOWED = ['/topics/*?'] as const;

/** User-agent groups that get WILDCARD_DISALLOWED. */
const WILDCARD_GROUPS: ReadonlySet<string> = new Set(['*', 'Bingbot']);

/**
 * robots.txt: every crawler is welcome everywhere except DISALLOWED (and
 * WILDCARD_DISALLOWED where supported), the named crawlers each get the same
 * rules in their own group (a crawler with a group of its own ignores "*"),
 * and the file ends with the sitemap. Disallow lines come before "Allow: /" so
 * a crawler that takes the first matching rule, rather than the longest one
 * as RFC 9309 says, still skips them.
 */
export function robotsTxt(siteUrl: string): string {
  const group = (agent: string): string[] => [
    `User-agent: ${agent}`,
    ...DISALLOWED.map((p) => `Disallow: ${p}`),
    ...(WILDCARD_GROUPS.has(agent)
      ? WILDCARD_DISALLOWED.map((p) => `Disallow: ${p}`)
      : []),
    'Allow: /',
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
