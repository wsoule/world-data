// Builds the list of pages TanStack Start prerenders to static HTML, with
// sitemap metadata. Read by vite.config.ts at build time.
//
// Every topic, category, place-type and place page is included, so every real
// URL is a static file and anything else gets the host's 404 page. Places with
// too little data to stand on their own (MIN_PLACE_METRICS) are still
// prerendered, but kept out of the sitemap and marked noindex.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import type {
  Entity,
  EntityType,
  Manifest,
  Metric,
  TopicSummary,
  ValuesFile,
} from '../src/data/types';

/**
 * Places with fewer numeric metrics than this are left out of the sitemap.
 * Keep in sync with MIN_PLACE_METRICS in src/seo/content.ts, which marks the
 * same pages noindex.
 */
export const MIN_PLACE_METRICS = 10;

interface SitemapOptions {
  priority?: number;
  changefreq?: 'daily' | 'weekly' | 'monthly';
  lastmod?: string;
  exclude?: boolean;
}

export interface PrerenderPage {
  path: string;
  sitemap?: SitemapOptions;
}

const readJson = <T>(dataDir: string, file: string): T =>
  JSON.parse(readFileSync(path.join(dataDir, file), 'utf8')) as T;

/** Number of numeric, non-bookkeeping metrics with a value, per entity index. */
function metricCounts(
  values: ValuesFile,
  metrics: readonly Metric[]
): Uint32Array {
  const rankable = new Set(
    metrics.filter((m) => m.kind === 'num' && m.meta !== true).map((m) => m.id)
  );
  const counts = new Uint32Array(values.entityCount);
  for (const [id, idx] of values.metrics) {
    if (rankable.has(id)) for (const i of idx) counts[i]++;
  }
  return counts;
}

/** All prerendered pages for the dataset in `dataDir` (public/data). */
export function prerenderPages(dataDir: string): PrerenderPage[] {
  const manifest = readJson<Manifest>(dataDir, 'manifest.json');
  const topics = readJson<TopicSummary[]>(dataDir, 'topics.json');
  const built = manifest.generatedAt.slice(0, 10);

  const pages: PrerenderPage[] = [
    {
      path: '/',
      sitemap: { priority: 1, changefreq: 'weekly', lastmod: built },
    },
    {
      path: '/categories',
      sitemap: { priority: 0.8, changefreq: 'weekly', lastmod: built },
    },
    {
      path: '/articles',
      sitemap: { priority: 0.8, changefreq: 'weekly', lastmod: built },
    },
    ...readJson<{ slug: string; kind: string }[]>(
      dataDir,
      'stories/index.json'
    ).map((s) => ({
      path: `/articles/${s.slug}`,
      sitemap: {
        priority: s.kind === 'flagship' ? 0.8 : 0.6,
        changefreq: 'monthly' as const,
        lastmod: built,
      },
    })),
    {
      path: '/glossary',
      sitemap: { priority: 0.5, changefreq: 'monthly', lastmod: built },
    },
    // Browser-only app routes: prerendered as shells, kept out of the sitemap.
    { path: '/compare', sitemap: { exclude: true } },
    { path: '/vs', sitemap: { exclude: true } },
    { path: '/search', sitemap: { exclude: true } },
  ];
  for (const c of manifest.categories) {
    pages.push({
      path: `/categories/${c.id}`,
      sitemap: { priority: 0.7, lastmod: built },
    });
  }
  for (const t of manifest.types) {
    pages.push({
      path: `/places/${t.id}`,
      sitemap: { priority: 0.7, lastmod: built },
    });
  }
  for (const t of topics) {
    pages.push({
      path: `/topics/${t.type}/${t.slug}`,
      sitemap: { priority: 0.6, lastmod: t.updated ?? built },
    });
  }
  for (const t of manifest.types) {
    const type: EntityType = t.id;
    const entities = readJson<Entity[]>(dataDir, `${type}/entities.json`);
    const counts = metricCounts(
      readJson<ValuesFile>(dataDir, `${type}/values.json`),
      readJson<Metric[]>(dataDir, `${type}/metrics.json`)
    );
    entities.forEach((e, i) => {
      pages.push({
        path: `/places/${type}/${e.slug}`,
        sitemap:
          counts[i] < MIN_PLACE_METRICS
            ? { exclude: true }
            : {
                priority: type === 'country' || type === 'state' ? 0.6 : 0.4,
                lastmod: built,
              },
      });
    });
  }
  return pages;
}
