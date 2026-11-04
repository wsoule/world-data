// Post-build: writes the data each topic and place page reads into dist/client, so the browser
// fetches a few kilobytes per page instead of its place type's whole catalog and values:
//
//   data/<type>/pages/topics/<slug>.json   features/topic/pageData.ts (TopicPageData)
//   data/<type>/pages/places/<slug>.json   features/places/pageData.ts (PlacePageData)
//
// The server builds the same objects from the same functions while prerendering, so a page
// hydrates from exactly what it was rendered from. The files are not in public/data because
// they are derived from it; the dev server builds them in the browser instead. Run from apps/web
// by scripts/seo-files.ts after `vite build`, or alone with `bun scripts/page-data.ts`.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Dataset } from '../src/data/dataset';
import type {
  Entity,
  Manifest,
  Metric,
  TopicFile,
  TopicSummary,
  ValuesFile,
} from '../src/data/types';
import {
  buildPlacePageData,
  placePagePath,
} from '../src/features/places/pageData';
import {
  type EntityLists,
  relatedPlaces,
} from '../src/features/places/relatedPlaces';
import {
  buildTopicPageData,
  topicPagePath,
} from '../src/features/topic/pageData';

/** Counts of the files written. */
export interface PageDataReport {
  topics: number;
  places: number;
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
  // Every type's place list, for the parent and child links of each profile.
  const lists: EntityLists = {};
  for (const info of manifest.types)
    lists[info.id] = await read<Entity[]>(`${info.id}/entities.json`);
  const report: PageDataReport = { topics: 0, places: 0, bytes: 0 };
  const write = async (file: string, data: unknown) => {
    const json = JSON.stringify(data);
    await writeFile(path.join(outDir, file), json);
    report.bytes += json.length;
  };
  for (const info of manifest.types) {
    const type = info.id;
    const [entities, metrics, values] = await Promise.all([
      read<Entity[]>(`${type}/entities.json`),
      read<Metric[]>(`${type}/metrics.json`),
      read<ValuesFile>(`${type}/values.json`),
    ]);
    const full = new Dataset(info, entities, metrics, values, index);
    for (const dir of ['topics', 'places'])
      await mkdir(path.join(outDir, type, 'pages', dir), { recursive: true });
    for (const t of index) {
      if (t.type !== type) continue;
      const topic = await read<TopicFile>(`${type}/topics/${t.slug}.json`);
      await write(
        topicPagePath(type, t.slug),
        buildTopicPageData(topic, full, index)
      );
      report.topics++;
    }
    for (const [i, e] of entities.entries()) {
      await write(
        placePagePath(type, e.slug),
        buildPlacePageData(full, i, relatedPlaces(type, e, lists))
      );
      report.places++;
    }
  }
  console.log(
    `page-data: ${report.topics} topic and ${report.places} place files (${Math.round(report.bytes / 1024)} KB)`
  );
  return report;
}

if (import.meta.main)
  await writePageData(
    path.resolve('public/data'),
    path.resolve('dist/client/data')
  );
