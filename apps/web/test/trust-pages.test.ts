import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATIC_PAGE_PATHS, staticPages } from '../scripts/static-pages';
import type { TopicFile, TopicSummary } from '../src/data/types';
import { trustHead } from '../src/features/trust/head';
import { TRUST_PAGES } from '../src/features/trust/pages';
import { STORED_ITEMS, THIRD_PARTY_HOSTS } from '../src/features/trust/privacy';
import {
  DIRECT_SOURCES,
  isDirectSourceTopic,
  topicOrigins,
} from '../src/features/trust/sources';
import { ORGANIZATION_ID, WEBSITE_ID } from '../src/lib/seo';
import { absoluteUrl, SITE } from '../src/site';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const DATA = path.join(WEB, 'public', 'data');
const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(DATA, file), 'utf8')) as T;

/** JSON-LD objects a route head() emits, parsed. */
const jsonLdOf = (head: ReturnType<typeof trustHead>) =>
  head.scripts.map((s) => JSON.parse(s.children) as Record<string, unknown>);

describe('trust pages', () => {
  test('each page has a unique /<id> path and its own route file', () => {
    const paths = TRUST_PAGES.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of TRUST_PAGES) {
      expect(p.path).toBe(`/${p.id}`);
      const route = readFileSync(
        path.join(WEB, 'src', 'routes', `${p.id}.tsx`),
        'utf8'
      );
      expect(route).toContain(`createFileRoute('/${p.id}')`);
      expect(route).toContain(`trustHead('${p.id}')`);
    }
  });

  test('meta descriptions fit a search snippet without being clamped', () => {
    for (const p of TRUST_PAGES) {
      expect(p.description.length).toBeGreaterThanOrEqual(110);
      expect(p.description.length).toBeLessThanOrEqual(158);
    }
  });

  test('the prerender list names every trust page, without a build-date lastmod', () => {
    expect([...STATIC_PAGE_PATHS]).toEqual(TRUST_PAGES.map((p) => p.path));
    const pages = staticPages();
    expect(pages.map((p) => p.path)).toEqual([...STATIC_PAGE_PATHS]);
    for (const p of pages) {
      expect(p.sitemap.priority).toBeGreaterThan(0);
      expect('lastmod' in p.sitemap).toBe(false);
    }
  });

  test('head: title, canonical URL, breadcrumbs and a page node tied to the organization', () => {
    const head = trustHead('about');
    expect(head.meta).toContainEqual({
      title: `About ${SITE.name} — ${SITE.name}`,
    });
    expect(head.links).toEqual([
      { rel: 'canonical', href: absoluteUrl('/about') },
    ]);
    const [crumbs, page] = jsonLdOf(head);
    expect(crumbs['@type']).toBe('BreadcrumbList');
    expect(page).toMatchObject({
      '@type': 'AboutPage',
      url: absoluteUrl('/about'),
      isPartOf: { '@id': WEBSITE_ID },
      publisher: { '@id': ORGANIZATION_ID },
      about: { '@id': ORGANIZATION_ID },
    });
    const contact = jsonLdOf(trustHead('contact'))[1];
    expect(contact['@type']).toBe('ContactPage');
    expect(contact.about).toBeUndefined();
  });
});

describe('direct sources', () => {
  const index = readJson<TopicSummary[]>('topics.json');
  const direct = index.filter(isDirectSourceTopic);
  const key = (t: { type: string; slug: string }) => `${t.type}/${t.slug}`;
  const host = (url: string) => new URL(url).hostname;

  test('every topic built from direct downloads is listed, and only those', () => {
    const listed = new Set(DIRECT_SOURCES.flatMap((s) => s.topics.map(key)));
    expect([...listed].sort()).toEqual(direct.map(key).sort());
  });

  test('each listed topic cites its source, and every cited source is described', () => {
    const described = new Set(DIRECT_SOURCES.map((s) => host(s.url)));
    for (const t of direct) {
      const file = readJson<TopicFile>(`${t.type}/topics/${t.slug}.json`);
      const cited = new Set(file.sources.map((s) => host(s.url)));
      for (const h of cited) expect(described).toContain(h);
      for (const s of DIRECT_SOURCES) {
        if (s.topics.some((r) => key(r) === key(t)))
          expect(cited).toContain(host(s.url));
      }
    }
  });

  test('topicOrigins splits the index into compiled and direct topics', () => {
    const t = (metrics: number[]): TopicSummary => ({
      slug: String(metrics[0]),
      type: 'state',
      title: '',
      cats: [],
      metrics,
      n: 1,
      updated: null,
    });
    expect(
      topicOrigins([
        t([1, 2]),
        t([900_001]),
        t([900_011, 900_012]),
        t([3, 900_001]),
      ])
    ).toEqual({ total: 4, direct: 2, compiled: 2 });
    expect(isDirectSourceTopic(t([]))).toBe(false);
  });
});

describe('privacy page facts', () => {
  const SRC = path.join(WEB, 'src');
  const files = (readdirSync(SRC, { recursive: true }) as string[]).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !f.startsWith(`features${path.sep}trust`)
  );
  const read = (f: string) => readFileSync(path.join(SRC, f), 'utf8');
  const STORAGE_USE =
    /\b(localStorage|sessionStorage)\s*(\.\s*(getItem|setItem|removeItem|clear|key)\b|\[)/;

  test('every file that uses browser storage is described', () => {
    const using = files
      .filter((f) => STORAGE_USE.test(read(f)))
      .map((f) => f.split(path.sep).join('/'));
    const described = new Set(STORED_ITEMS.map((i) => i.file));
    expect(using.length).toBeGreaterThan(0);
    for (const f of using) expect(described).toContain(f);
  });

  test('every described key appears in its file', () => {
    for (const item of STORED_ITEMS) {
      expect(existsSync(path.join(SRC, item.file))).toBe(true);
      const code = read(item.file);
      expect(code).toContain(`'${item.key}'`);
      expect(code).toContain(item.storage);
    }
  });

  test('the site sets no cookies', () => {
    for (const f of files) expect(read(f)).not.toMatch(/document\.cookie\s*=/);
  });

  test('images and scripts load from no outside host but the listed ones', () => {
    // An <img>, <script>, <link>, <iframe> or <source> element whose attributes name an
    // https:// URL before the tag closes; plain <a> links are not loads.
    const LOADS =
      /<(img|script|link|iframe|source|video|audio)\b[^>]*?https:\/\/([a-z0-9.-]+)/g;
    const found = new Map<string, string>();
    for (const f of files.filter((x) => x.endsWith('.tsx'))) {
      for (const m of read(f).matchAll(LOADS))
        found.set(m[2], f.split(path.sep).join('/'));
    }
    expect(Object.fromEntries(found)).toEqual(
      Object.fromEntries(THIRD_PARTY_HOSTS.map((h) => [h.host, h.file]))
    );
  });
});
