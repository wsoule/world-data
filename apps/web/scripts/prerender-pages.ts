// Builds the list of pages TanStack Start prerenders to static HTML, with
// sitemap metadata. Read by vite.config.ts at build time.
//
// Every topic, category, place-type and place page is included, so every real
// URL is a static file and anything else gets the host's 404 page. Pages that
// are not worth indexing are still prerendered and linked, but kept out of the
// sitemap, using the same rules (src/seo/indexing.ts) the pages use for their
// robots and canonical tags:
//
// - thin topics (isIndexableTopic) and topics that only retitle another topic
//   (TOPIC_ALIASES) are left out here;
// - place profiles decide in their route loader (isIndexablePlace needs the
//   whole Dataset, which this file cannot load), and seo-files.ts drops every
//   sitemap URL whose built page says noindex or names another canonical.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import type {
  Entity,
  EntityType,
  Manifest,
  Metric,
  TopicFile,
  TopicSummary,
} from '../src/data/types';
import {
  canonicalTopicSlug,
  isIndexableTopic,
  topicCoverage,
} from '../src/seo/indexing';

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

/** Sorted ids joined, so two topics with the same metrics or places get the same key. */
const setKey = (ids: readonly number[]): string =>
  [...ids].sort((a, b) => a - b).join(',');

/**
 * Fails the build when a TOPIC_ALIASES entry no longer retitles its primary (a data rebuild
 * changed one of them), since its canonical tag would then hide a different page.
 */
function assertAliases(
  topics: readonly TopicSummary[],
  shape: ReadonlyMap<string, string>
): void {
  const broken: string[] = [];
  for (const t of topics) {
    const primary = canonicalTopicSlug(t.type, t.slug);
    if (primary === t.slug) continue;
    const own = shape.get(`${t.type}/${t.slug}`);
    if (own == null || own !== shape.get(`${t.type}/${primary}`)) {
      broken.push(`${t.type}/${t.slug} -> ${primary}`);
    }
  }
  if (broken.length > 0) {
    throw new Error(
      `TOPIC_ALIASES (src/seo/indexing.ts) names pages that are no longer exact duplicates:\n${broken.join('\n')}`
    );
  }
}

/** All prerendered pages for the dataset in `dataDir` (public/data). */
export function prerenderPages(dataDir: string): PrerenderPage[] {
  const manifest = readJson<Manifest>(dataDir, 'manifest.json');
  const topics = readJson<TopicSummary[]>(dataDir, 'topics.json');
  const built = manifest.generatedAt.slice(0, 10);

  const metrics = new Map<EntityType, Map<number, Metric>>();
  for (const t of manifest.types) {
    const list = readJson<Metric[]>(dataDir, `${t.id}/metrics.json`);
    metrics.set(t.id, new Map(list.map((m) => [m.id, m])));
  }

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
  // Topics: indexable or not, canonical or alias.
  const shape = new Map<string, string>();
  for (const t of topics) {
    const file = readJson<TopicFile>(
      dataDir,
      `${t.type}/topics/${t.slug}.json`
    );
    const known = metrics.get(t.type);
    const indexable = isIndexableTopic(
      topicCoverage(file, (id) => known?.get(id))
    );
    shape.set(
      `${t.type}/${t.slug}`,
      `${setKey(file.metrics)}|${setKey(file.entities)}`
    );
    pages.push({
      path: `/topics/${t.type}/${t.slug}`,
      sitemap:
        !indexable || canonicalTopicSlug(t.type, t.slug) !== t.slug
          ? { exclude: true }
          : { priority: 0.6, lastmod: t.updated ?? built },
    });
  }
  assertAliases(topics, shape);
  for (const t of manifest.types) {
    const type: EntityType = t.id;
    const entities = readJson<Entity[]>(dataDir, `${type}/entities.json`);
    for (const e of entities) {
      pages.push({
        path: `/places/${type}/${e.slug}`,
        sitemap: {
          priority: type === 'country' || type === 'state' ? 0.6 : 0.4,
          lastmod: built,
        },
      });
    }
  }
  return pages;
}
