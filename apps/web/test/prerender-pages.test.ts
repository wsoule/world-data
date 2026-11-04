import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type PrerenderPage, prerenderPages } from '../scripts/prerender-pages';
import type { TopicSummary } from '../src/data/types';

const DATA = join(import.meta.dir, '../public/data');
const topics = JSON.parse(
  readFileSync(join(DATA, 'topics.json'), 'utf8')
) as TopicSummary[];
const pages = prerenderPages(DATA);
const byPath = new Map<string, PrerenderPage>(pages.map((p) => [p.path, p]));
const listed = (path: string): boolean =>
  byPath.get(path)?.sitemap?.exclude !== true;

describe('prerenderPages', () => {
  test('prerenders every page once, listed in the sitemap or not', () => {
    expect(byPath.size).toBe(pages.length);
    for (const t of topics)
      expect(byPath.has(`/topics/${t.type}/${t.slug}`)).toBe(true);
  });

  test('leaves thin topics and retitled duplicates out of the sitemap', () => {
    expect(listed('/topics/state/median-household-income-by-state')).toBe(true);
    expect(listed('/topics/state/almond-production-by-state')).toBe(false);
    expect(listed('/topics/country/roma-population-by-country')).toBe(true);
    expect(listed('/topics/country/gypsy-population-by-country')).toBe(false);
    // Opposite ends of one table both stay.
    expect(listed('/topics/state/coldest-states')).toBe(true);
    expect(listed('/topics/state/hottest-states')).toBe(true);
  });

  test('keeps the browser-only shells out of the sitemap', () => {
    for (const path of ['/compare', '/vs', '/search'])
      expect(listed(path)).toBe(false);
  });
});
