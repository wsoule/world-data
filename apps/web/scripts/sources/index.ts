// Every source besides the ranking site, in one list: fetch-pages.ts downloads each into its own
// folder under .cache/sources, and build-data.ts turns each into topic pages. A source that has
// not been fetched (or could not be) yields no pages, so the others still build.

import path from 'node:path';

import type { ExternalPage, SourceContext } from '../lib/external';
import { acsPages, fetchAcs } from './acs';
import { beaPages, fetchBea } from './bea';
import { blsPages, fetchBls } from './bls';
import { cdcPages, fetchCdc } from './cdc';
import { fetchCityMetros, readCityMetros } from './census-geo';
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

/** Topic pages from every fetched source. */
export async function sourcePages(
  root: string,
  ctx: SourceContext
): Promise<ExternalPage[]> {
  const metros = await readCityMetros(cityMetrosFile(root));
  const groups = await Promise.all([
    beaPages(path.join(root, 'bea'), metros),
    worldBankPages(path.join(root, 'worldbank')),
    cdcPages(path.join(root, 'cdc')),
    epaPages(path.join(root, 'epa'), ctx),
    noaaPages(path.join(root, 'noaa')),
    blsPages(path.join(root, 'bls'), metros),
    acsPages(path.join(root, 'acs'), metros),
    fbiPages(path.join(root, 'fbi'), ctx),
  ]);
  return groups.flat();
}
