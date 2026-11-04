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
//
// Each <lastmod> is the date of the newest data the page shows (the source's
// update dates), not the build date, so it only moves when the data does. A
// page with no dated data gets none; seo-files.ts removes the build date
// TanStack writes in its place.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import type {
  Entity,
  EntityType,
  Manifest,
  Metric,
  TopicFile,
  TopicSummary,
  ValuesFile,
} from '../src/data/types';
import {
  canonicalTopicSlug,
  isIndexableTopic,
  newestDate,
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

/** The parts of a stories/index.json entry the sitemap reads. */
interface StoryCard {
  slug: string;
  kind: string;
  type: EntityType;
  xId: number;
  yId: number;
  colorId: number | null;
}

const readJson = <T>(dataDir: string, file: string): T =>
  JSON.parse(readFileSync(path.join(dataDir, file), 'utf8')) as T;

/** `lastmod` when there is a date, nothing otherwise (never the build date). */
const withLastmod = (
  options: SitemapOptions,
  lastmod: string | null
): SitemapOptions => (lastmod == null ? options : { ...options, lastmod });

/** Newest update date of the metrics each entity has a value for, per entity index. */
function placeDates(
  values: ValuesFile,
  updated: ReadonlyMap<number, string | null>
): (string | null)[] {
  const out: (string | null)[] = Array.from(
    { length: values.entityCount },
    () => null
  );
  for (const [id, idx] of values.metrics) {
    const date = updated.get(id) ?? null;
    if (date == null) continue;
    for (const i of idx) {
      const cur = out[i];
      if (cur == null || date > cur) out[i] = date;
    }
  }
  return out;
}

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
  const stories = readJson<StoryCard[]>(dataDir, 'stories/index.json');

  const metrics = new Map<EntityType, Map<number, Metric>>();
  for (const t of manifest.types) {
    const list = readJson<Metric[]>(dataDir, `${t.id}/metrics.json`);
    metrics.set(t.id, new Map(list.map((m) => [m.id, m])));
  }
  const metricDate = (type: EntityType, id: number): string | null =>
    metrics.get(type)?.get(id)?.updated ?? null;

  // Topics: indexable or not, canonical or alias, and the date of their data
  // (the page's own update date, else its newest metric's, as on the page).
  const topicDate = new Map<string, string | null>();
  const shape = new Map<string, string>();
  const topicPages: PrerenderPage[] = [];
  for (const t of topics) {
    const file = readJson<TopicFile>(
      dataDir,
      `${t.type}/topics/${t.slug}.json`
    );
    const known = metrics.get(t.type);
    const indexable = isIndexableTopic(
      topicCoverage(file, (id) => known?.get(id))
    );
    const date =
      newestDate([t.updated]) ??
      newestDate(t.metrics.map((id) => metricDate(t.type, id)));
    topicDate.set(`${t.type}/${t.slug}`, date);
    shape.set(
      `${t.type}/${t.slug}`,
      `${setKey(file.metrics)}|${setKey(file.entities)}`
    );
    topicPages.push({
      path: `/topics/${t.type}/${t.slug}`,
      sitemap:
        !indexable || canonicalTopicSlug(t.type, t.slug) !== t.slug
          ? { exclude: true }
          : withLastmod({ priority: 0.6 }, date),
    });
  }
  assertAliases(topics, shape);

  const typeDate = new Map<EntityType, string | null>(
    manifest.types.map((t) => [
      t.id,
      newestDate(
        [...(metrics.get(t.id)?.values() ?? [])].map((m) => m.updated)
      ),
    ])
  );
  const storyDate = new Map(
    stories.map((s) => [
      s.slug,
      newestDate(
        [s.xId, s.yId, s.colorId].map((id) =>
          id == null ? null : metricDate(s.type, id)
        )
      ),
    ])
  );
  const allTopics = newestDate(topicDate.values());

  const pages: PrerenderPage[] = [
    {
      path: '/',
      sitemap: withLastmod(
        { priority: 1, changefreq: 'weekly' },
        newestDate([...typeDate.values(), allTopics])
      ),
    },
    {
      path: '/categories',
      sitemap: withLastmod({ priority: 0.8, changefreq: 'weekly' }, allTopics),
    },
    {
      path: '/articles',
      sitemap: withLastmod(
        { priority: 0.8, changefreq: 'weekly' },
        newestDate(storyDate.values())
      ),
    },
    ...stories.map((s) => ({
      path: `/articles/${s.slug}`,
      sitemap: withLastmod(
        {
          priority: s.kind === 'flagship' ? 0.8 : 0.6,
          changefreq: 'monthly' as const,
        },
        storyDate.get(s.slug) ?? null
      ),
    })),
    // The glossary explains terms, not data, so it has no data date.
    { path: '/glossary', sitemap: { priority: 0.5, changefreq: 'monthly' } },
    // Browser-only app routes: prerendered as shells, kept out of the sitemap.
    { path: '/compare', sitemap: { exclude: true } },
    { path: '/vs', sitemap: { exclude: true } },
    { path: '/search', sitemap: { exclude: true } },
  ];
  for (const c of manifest.categories) {
    pages.push({
      path: `/categories/${c.id}`,
      sitemap: withLastmod(
        { priority: 0.7 },
        newestDate(
          topics
            .filter((t) => t.cats.includes(c.id))
            .map((t) => topicDate.get(`${t.type}/${t.slug}`))
        )
      ),
    });
  }
  for (const t of manifest.types) {
    pages.push({
      path: `/places/${t.id}`,
      sitemap: withLastmod({ priority: 0.7 }, typeDate.get(t.id) ?? null),
    });
  }
  pages.push(...topicPages);
  for (const t of manifest.types) {
    const type: EntityType = t.id;
    const entities = readJson<Entity[]>(dataDir, `${type}/entities.json`);
    const updated = new Map(
      [...(metrics.get(type)?.values() ?? [])].map((m) => [m.id, m.updated])
    );
    const dates = placeDates(
      readJson<ValuesFile>(dataDir, `${type}/values.json`),
      updated
    );
    entities.forEach((e, i) => {
      pages.push({
        path: `/places/${type}/${e.slug}`,
        sitemap: withLastmod(
          { priority: type === 'country' || type === 'state' ? 0.6 : 0.4 },
          dates[i] ?? null
        ),
      });
    });
  }
  return pages;
}
