import { describe, expect, test } from 'bun:test';

import { CATEGORY_LABELS } from '../scripts/lib/reference';
import {
  blockedOnlyLinks,
  type LinkedPage,
  NAMED_CRAWLERS,
  robotsAllows,
  robotsRules,
  robotsTxt,
} from '../scripts/lib/robots';

/** The robots.txt groups, as user agent -> its rule lines. */
function groups(txt: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of txt.split('\n')) {
    const agent = /^User-agent: (.+)$/.exec(line)?.[1];
    if (agent != null) {
      current = [];
      out.set(agent, current);
    } else if (line === '') current = null;
    else if (current != null) current.push(line);
  }
  return out;
}

/**
 * Whether `path` is allowed under one group's rules, the RFC 9309 way: the
 * longest matching rule wins, Allow on a tie, "*" matches any run of
 * characters and "$" anchors the end.
 */
function allowed(rules: readonly string[], path: string): boolean {
  let best: { length: number; allow: boolean } | null = null;
  for (const rule of rules) {
    const m = /^(Allow|Disallow): (.*)$/.exec(rule);
    if (m == null) continue;
    const [, kind, pattern = ''] = m;
    const source = pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')
      .replace(/\\\$$/, '$');
    if (!new RegExp(`^${source}`).test(path)) continue;
    const allow = kind === 'Allow';
    if (
      best == null ||
      pattern.length > best.length ||
      (pattern.length === best.length && allow)
    )
      best = { length: pattern.length, allow };
  }
  return best?.allow ?? true;
}

/** Whether `path` is allowed by a crawler that takes the first matching rule. */
function allowedFirstMatch(rules: readonly string[], path: string): boolean {
  for (const rule of rules) {
    const m = /^(Allow|Disallow): (.*)$/.exec(rule);
    if (m != null && !(m[2] ?? '').includes('*') && path.startsWith(m[2] ?? ''))
      return m[1] === 'Allow';
  }
  return true;
}

describe('robotsTxt', () => {
  const txt = robotsTxt('https://rankodex.com');
  const byAgent = groups(txt);

  test('has a group for every crawler and ends with the sitemap', () => {
    expect([...byAgent.keys()]).toEqual(['*', ...NAMED_CRAWLERS]);
    expect(txt.endsWith('\nSitemap: https://rankodex.com/sitemap.xml\n')).toBe(
      true
    );
  });

  test('keeps every crawler out of search and the tools’ query-string states', () => {
    for (const [agent, rules] of byAgent) {
      for (const path of [
        '/search',
        '/search?q=gdp',
        '/compare?type=state&m=1,2',
        '/vs?type=country&e=usa,can',
      ])
        expect(`${agent} ${path} ${allowed(rules, path)}`).toBe(
          `${agent} ${path} false`
        );
      for (const path of [
        '/',
        '/compare',
        '/vs',
        '/topics/state/coldest-states',
        '/places/state/texas',
        '/sitemap.xml',
      ])
        expect(`${agent} ${path} ${allowed(rules, path)}`).toBe(
          `${agent} ${path} true`
        );
    }
  });

  test('keeps every crawler out of the category hubs’ place-type variants', () => {
    const ids = Object.keys(CATEGORY_LABELS);
    expect(ids).toHaveLength(20);
    for (const [agent, rules] of byAgent) {
      for (const id of ids) {
        for (const type of ['country', 'state', 'city', 'county', 'world-city'])
          expect(
            `${agent} ${id} ${allowed(rules, `/categories/${id}?type=${type}`)} ${allowedFirstMatch(rules, `/categories/${id}?type=${type}`)}`
          ).toBe(`${agent} ${id} false false`);
        expect(`${agent} ${id} ${allowed(rules, `/categories/${id}`)}`).toBe(
          `${agent} ${id} true`
        );
      }
      expect(allowed(rules, '/categories?type=state')).toBe(false);
      expect(allowed(rules, '/categories')).toBe(true);
      // A category id that is the start of another never blocks the longer one's bare hub.
      expect(allowed(rules, '/categories/law-enforcement')).toBe(true);
    }
  });

  test('blocks topic query strings only for crawlers with wildcard support', () => {
    const focus = '/topics/state/coldest-states?m=12610';
    expect(allowed(byAgent.get('*') ?? [], focus)).toBe(false);
    expect(allowed(byAgent.get('Bingbot') ?? [], focus)).toBe(false);
    expect(allowed(byAgent.get('GPTBot') ?? [], focus)).toBe(true);
    expect(
      allowed(byAgent.get('*') ?? [], '/topics/state/coldest-states')
    ).toBe(true);
  });

  test('works for crawlers that take the first matching rule', () => {
    for (const rules of byAgent.values()) {
      expect(allowedFirstMatch(rules, '/compare?m=1')).toBe(false);
      expect(allowedFirstMatch(rules, '/vs?e=usa')).toBe(false);
      expect(allowedFirstMatch(rules, '/topics/state/x')).toBe(true);
    }
  });
});

describe('robotsAllows', () => {
  test('agrees with the RFC 9309 reference on the published rules', () => {
    const rules = robotsRules();
    for (const path of [
      '/',
      '/search',
      '/search?q=x',
      '/compare',
      '/compare?type=state',
      '/vs?e=usa',
      '/categories',
      '/categories?type=state',
      '/categories/law',
      '/categories/law?type=state',
      '/topics/state/coldest-states',
      '/topics/state/coldest-states?m=1',
      '/places/state/texas',
    ])
      expect(`${path} ${robotsAllows(rules, path)}`).toBe(
        `${path} ${allowed(rules, path)}`
      );
  });
});

describe('blockedOnlyLinks', () => {
  const site = 'https://rankodex.com';
  const page = (
    path: string,
    links: string[],
    indexable = true
  ): LinkedPage => ({ path, indexable, links });
  const hubs = [page('/categories/law', []), page('/categories', [])];

  test('flags an indexable page that links a hub only through a blocked variant', () => {
    const gaps = blockedOnlyLinks(
      [
        ...hubs,
        page('/topics/state/gun-laws', [
          '/categories/law?type=state',
          'https://rankodex.com/categories?type=state',
        ]),
      ],
      site
    );
    expect(gaps).toEqual([
      {
        source: '/topics/state/gun-laws',
        target: '/categories/law',
        via: '/categories/law?type=state',
      },
      {
        source: '/topics/state/gun-laws',
        target: '/categories',
        via: '/categories?type=state',
      },
    ]);
  });

  test('accepts a blocked variant next to the bare link, and bare links alone', () => {
    expect(
      blockedOnlyLinks(
        [
          ...hubs,
          page('/topics/state/a', [
            '/categories/law?type=state',
            '/categories/law',
          ]),
          page('/topics/state/b', ['https://rankodex.com/categories/law#top']),
        ],
        site
      )
    ).toEqual([]);
  });

  test('ignores noindex sources and targets, other hosts and the tools’ states', () => {
    expect(
      blockedOnlyLinks(
        [
          ...hubs,
          page('/compare', [], false),
          page('/search', [], false),
          page('/404.html', ['/categories/law?type=state'], false),
          page('/topics/state/a', [
            '/compare?type=state&m=1',
            '/search?q=gdp',
            'https://example.com/categories/law?type=state',
          ]),
        ],
        site
      )
    ).toEqual([]);
  });
});
