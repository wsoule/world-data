import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type PrerenderPage, prerenderPages } from '../scripts/prerender-pages';
import type { Manifest, TopicSummary } from '../src/data/types';

const DATA = join(import.meta.dir, '../public/data');
const manifest = JSON.parse(
  readFileSync(join(DATA, 'manifest.json'), 'utf8')
) as Manifest;
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

  test('dates pages by their data, never by the build', () => {
    const built = manifest.generatedAt.slice(0, 10);
    const dates = pages.flatMap((p) =>
      p.sitemap?.lastmod == null ? [] : [p.sitemap.lastmod]
    );
    expect(dates.length).toBeGreaterThan(0);
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d <= built).toBe(true);
    }
    // A topic with its own update date carries it.
    const dated = topics.find(
      (t) => t.updated != null && listed(`/topics/${t.type}/${t.slug}`)
    );
    expect(dated).toBeDefined();
    if (dated != null)
      expect(
        byPath.get(`/topics/${dated.type}/${dated.slug}`)?.sitemap?.lastmod
      ).toBe(dated.updated?.slice(0, 10));
    // The glossary has no data, so no date.
    expect(byPath.get('/glossary')?.sitemap?.lastmod).toBeUndefined();
  });

  test('dates every article by its data, as the article shows', () => {
    const stories = JSON.parse(
      readFileSync(join(DATA, 'stories/index.json'), 'utf8')
    ) as { slug: string; date?: string | null }[];
    expect(stories.length).toBeGreaterThan(0);
    for (const s of stories) {
      expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(byPath.get(`/articles/${s.slug}`)?.sitemap?.lastmod).toBe(
        s.date ?? undefined
      );
    }
    expect(byPath.get('/articles')?.sitemap?.lastmod).toBeDefined();
  });
});
