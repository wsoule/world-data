// Post-build: writes the data each topic and place page reads into dist/client, so the browser
// fetches a few kilobytes per page instead of its place type's whole catalog and values:
//
//   data/<type>/pages/topics/<slug>.json   features/topic/pageData.ts (TopicPageData)
//   data/<type>/pages/places/<slug>.json   features/places/pageData.ts (StoredPlacePage)
//   data/<type>/pages/catalog.json         features/places/pageData.ts (PlaceCatalog)
//   data/<type>/pages/vs/<pair>.json       features/vs/pairPage.ts (PairPageData)
//   data/pages/noindex-topics.json         data/noindexTopics.ts (noindexTopicKeys)
//
// The server builds the same objects from the same functions while prerendering, so a page
// hydrates from exactly what it was rendered from. The files are not in public/data because
// they are derived from it; the dev server builds them in the browser instead. Run from apps/web
// by scripts/seo-files.ts after `vite build`, or alone with `bun scripts/page-data.ts`.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Dataset } from '../src/data/dataset';
import {
  NOINDEX_TOPICS_PATH,
  noindexTopicKeys,
} from '../src/data/noindexTopics';
import type {
  Entity,
  Manifest,
  Metric,
  TopicFile,
  TopicSummary,
  ValuesFile,
} from '../src/data/types';
import {
  buildPlaceCatalog,
  buildPlacePageData,
  placeCatalogPath,
  placePagePath,
  storedPlacePage,
} from '../src/features/places/pageData';
import {
  type EntityLists,
  relatedPlaces,
} from '../src/features/places/relatedPlaces';
import {
  buildTopicPageData,
  topicPagePath,
} from '../src/features/topic/pageData';
import { buildPairPageData, pairPagePath } from '../src/features/vs/pairData';
import { PAIRS_PATH, type PairsFile, pairSlug } from '../src/features/vs/pairs';

/** Counts of the files written. */
export interface PageDataReport {
  topics: number;
  places: number;
  pairs: number;
  bytes: number;
}

/**
 * Builds every place type's full Dataset from `dataDir` (public/data), writes each topic page's
 * slice under `outDir` (dist/client/data) and logs a one-line summary.
 */
export async function writePageData(
  dataDir: string,
  outDir: string
): Promise<PageDataReport> {
  const read = async <T>(file: string): Promise<T> =>
    JSON.parse(await readFile(path.join(dataDir, file), 'utf8')) as T;
  const manifest = await read<Manifest>('manifest.json');
  const index = await read<TopicSummary[]>('topics.json');
  const pairs = await read<PairsFile>(PAIRS_PATH);
  // Every type's place list, for the parent and child links of each profile.
  const lists: EntityLists = {};
  for (const info of manifest.types)
    lists[info.id] = await read<Entity[]>(`${info.id}/entities.json`);
  const report: PageDataReport = { topics: 0, places: 0, pairs: 0, bytes: 0 };
  const write = async (file: string, data: unknown) => {
    const json = JSON.stringify(data);
    await writeFile(path.join(outDir, file), json);
    report.bytes += json.length;
  };
  // Every topic file, and which pages are noindex: the suggestions on each page and the order
  // of category hubs depend on every topic's, as the prerender worked them out.
  const catalogs = new Map<string, Map<number, Metric>>();
  for (const info of manifest.types)
    catalogs.set(
      info.id,
      new Map(
        (await read<Metric[]>(`${info.id}/metrics.json`)).map((m) => [m.id, m])
      )
    );
  const files = new Map<string, TopicFile>();
  for (const t of index)
    files.set(
      `${t.type}/${t.slug}`,
      await read<TopicFile>(`${t.type}/topics/${t.slug}.json`)
    );
  const noindexKeys = noindexTopicKeys(files.values(), (type, id) =>
    catalogs.get(type)?.get(id)
  );
  const noindex: ReadonlySet<string> = new Set(noindexKeys);
  await mkdir(path.dirname(path.join(outDir, NOINDEX_TOPICS_PATH)), {
    recursive: true,
  });
  await write(NOINDEX_TOPICS_PATH, noindexKeys);
  for (const info of manifest.types) {
    const type = info.id;
    const [entities, metrics, values] = await Promise.all([
      read<Entity[]>(`${type}/entities.json`),
      read<Metric[]>(`${type}/metrics.json`),
      read<ValuesFile>(`${type}/values.json`),
    ]);
    const full = new Dataset(info, entities, metrics, values, index);
    for (const dir of ['topics', 'places', 'vs'])
      await mkdir(path.join(outDir, type, 'pages', dir), { recursive: true });
    for (const t of index) {
      const topic = t.type === type ? files.get(`${type}/${t.slug}`) : null;
      if (topic == null) continue;
      await write(
        topicPagePath(type, t.slug),
        buildTopicPageData(topic, full, index, noindex)
      );
      report.topics++;
    }
    // Each place's own file, and the catalog entries and topic titles all of them share.
    await write(placeCatalogPath(type), buildPlaceCatalog(full));
    for (const [i, e] of entities.entries()) {
      await write(
        placePagePath(type, e.slug),
        storedPlacePage(
          buildPlacePageData(full, i, relatedPlaces(type, e, lists))
        )
      );
      report.places++;
    }
    for (const [a, b] of pairs[type] ?? []) {
      if (!full.entityBySlug.has(a) || !full.entityBySlug.has(b)) continue;
      await write(
        pairPagePath(type, pairSlug(a, b)),
        buildPairPageData(full, manifest, pairs, a, b)
      );
      report.pairs++;
    }
  }
  console.log(
    `page-data: ${report.topics} topic, ${report.places} place and ${report.pairs} matchup files (${Math.round(report.bytes / 1024)} KB)`
  );
  return report;
}

if (import.meta.main)
  await writePageData(
    path.resolve('public/data'),
    path.resolve('dist/client/data')
  );
