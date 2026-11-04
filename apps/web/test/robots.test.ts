import { describe, expect, test } from 'bun:test';

import { NAMED_CRAWLERS, robotsTxt } from '../scripts/lib/robots';

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
