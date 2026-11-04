// Every source besides the ranking site, in one list: fetch-pages.ts downloads each into its own
// folder under .cache/sources, and build-data.ts turns each into topic pages. A source that has
// not been fetched (or could not be) yields no pages, so the others still build.

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import type { ExternalPage, SourceContext } from '../lib/external';
import { acsPages, fetchAcs } from './acs';
import { beaPages, fetchBea } from './bea';
import { blsPages, fetchBls } from './bls';
import { cdcPages, fetchCdc } from './cdc';
import { fetchCityMetros, readCityMetros } from './census-geo';
import { electionPages, fetchElections } from './elections';
import { epaPages, fetchEpa } from './epa';
import { fbiPages, fetchFbi } from './fbi';
import { fetchNoaa, noaaPages } from './noaa';
import { fetchWorldBank, worldBankPages } from './worldbank';

const cityMetrosFile = (root: string) =>
  path.join(root, 'census', 'city-metros.json');

/**
 * Downloads every source into `root`. `cityEntities` is the published city/entities.json, whose
 * coordinates place each city in its metro and Census place first.
 */
export async function fetchSources(
  root: string,
  cityEntities: string,
  refresh: boolean
): Promise<void> {
  await fetchCityMetros(cityEntities, cityMetrosFile(root), refresh);
  const steps: [string, () => Promise<void>][] = [
    ['bea', () => fetchBea(path.join(root, 'bea'), refresh)],
    ['worldbank', () => fetchWorldBank(path.join(root, 'worldbank'), refresh)],
    ['cdc', () => fetchCdc(path.join(root, 'cdc'), refresh)],
    ['epa', () => fetchEpa(path.join(root, 'epa'), refresh)],
    ['noaa', () => fetchNoaa(path.join(root, 'noaa'), refresh)],
    ['bls', () => fetchBls(path.join(root, 'bls'), refresh)],
    ['acs', () => fetchAcs(path.join(root, 'acs'), refresh)],
    ['fbi', () => fetchFbi(path.join(root, 'fbi'), refresh)],
    ['elections', () => fetchElections(path.join(root, 'elections'), refresh)],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (err) {
      console.warn(
        `${name}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

/**
 * The UTC day the newest file under `dir` was written: when a source's cached downloads were
 * last fetched (cachedDownload writes each file once, again only on --refresh). Null when the
 * folder is missing or empty.
 */
async function fetchedOn(dir: string): Promise<string | null> {
  let newest = 0;
  try {
    for (const entry of await readdir(dir, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue;
      const { mtimeMs } = await stat(path.join(entry.parentPath, entry.name));
      newest = Math.max(newest, mtimeMs);
    }
  } catch {
    return null;
  }
  return newest === 0 ? null : new Date(newest).toISOString().slice(0, 10);
}

/**
 * Topic pages from every fetched source, each stamped with the day its source's files were
 * downloaded (`fetched`), which becomes the topic's date.
 */
export async function sourcePages(
  root: string,
  ctx: SourceContext
): Promise<ExternalPage[]> {
  const metros = await readCityMetros(cityMetrosFile(root));
  const sources: [string, (dir: string) => Promise<ExternalPage[]>][] = [
    ['bea', (dir) => beaPages(dir, metros)],
    ['worldbank', (dir) => worldBankPages(dir)],
    ['cdc', (dir) => cdcPages(dir)],
    ['epa', (dir) => epaPages(dir, ctx)],
    ['noaa', (dir) => noaaPages(dir)],
    ['bls', (dir) => blsPages(dir, metros)],
    ['acs', (dir) => acsPages(dir, metros)],
    ['fbi', (dir) => fbiPages(dir, ctx)],
    ['elections', (dir) => electionPages(dir)],
  ];
  const groups = await Promise.all(
    sources.map(async ([name, pages]) => {
      const dir = path.join(root, name);
      const [list, fetched] = await Promise.all([pages(dir), fetchedOn(dir)]);
      return list.map((p) => ({ ...p, fetched: p.fetched ?? fetched }));
    })
  );
  return groups.flat();
}
