// Places each US city in its metropolitan statistical area (CBSA) with the Census Geocoder, so
// city statistics that come per metro (BEA price parities) can be attached to the right cities,
// suburbs included: Irvine, CA is in the Los Angeles–Long Beach–Anaheim metro (31080).
//
// The geocoder is a free public API with no key. Lookups run one at a time with a pause, and the
// answers are cached, so only new cities are looked up on later fetches.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** A city of the dataset with the CBSA code of its metro, or null when it is in none. */
export interface CityMetro {
  /** City entity id, e.g. "california/irvine" */
  id: string;
  /** City name without the state, e.g. "Irvine" */
  city: string;
  /** USPS state code */
  code: string;
  cbsa: string | null;
  /** 7-digit Census place code (state FIPS + place), or null outside an incorporated place */
  place: string | null;
}

const GEOCODER =
  'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';

interface CityEntity {
  id: string;
  name: string;
  flag: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** The metro (CBSA code) and Census place at a point; null for either the point is outside. */
async function geographiesAt(
  lat: number,
  lng: number
): Promise<{ cbsa: string | null; place: string | null }> {
  const url = `${GEOCODER}?${new URLSearchParams({
    x: String(lng),
    y: String(lat),
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    layers: 'Metropolitan Statistical Areas,Incorporated Places',
    format: 'json',
  })}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        result?: {
          geographies?: Record<string, { CBSA?: string; GEOID?: string }[]>;
        };
      };
      const g = body.result?.geographies ?? {};
      return {
        cbsa: g['Metropolitan Statistical Areas']?.[0]?.CBSA ?? null,
        place: g['Incorporated Places']?.[0]?.GEOID ?? null,
      };
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

/** Reads the cached city → metro table, or null when it has not been fetched. */
export async function readCityMetros(
  file: string
): Promise<CityMetro[] | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as CityMetro[];
  } catch {
    return null;
  }
}

/**
 * Looks up the metro of every city in `entitiesFile` (the published city/entities.json) that is
 * not yet in `outFile` (all of them when `refresh`), saving progress as it goes.
 */
export async function fetchCityMetros(
  entitiesFile: string,
  outFile: string,
  refresh: boolean
): Promise<void> {
  let entities: CityEntity[];
  try {
    entities = JSON.parse(await readFile(entitiesFile, 'utf8')) as CityEntity[];
  } catch {
    console.warn(
      `no ${entitiesFile} yet; build the data once, then fetch again`
    );
    return;
  }
  await mkdir(path.dirname(outFile), { recursive: true });
  const known = new Map(
    (refresh ? [] : ((await readCityMetros(outFile)) ?? [])).map((c) => [
      c.id,
      c,
    ])
  );
  const save = async () => {
    await writeFile(`${outFile}.tmp`, JSON.stringify([...known.values()]));
    await rename(`${outFile}.tmp`, outFile);
  };
  let looked = 0;
  for (const e of entities) {
    // Entries cached before places were recorded (no `place` field) are looked up again.
    const cached = known.get(e.id);
    if (cached != null && cached.place !== undefined) continue;
    if (e.lat == null || e.lng == null || e.flag == null) continue;
    known.set(e.id, {
      id: e.id,
      city: e.name.replace(/, [A-Z]{2}$/, ''),
      code: e.flag.toUpperCase(),
      ...(await geographiesAt(e.lat, e.lng)),
    });
    looked++;
    if (looked % 50 === 0) {
      await save();
      console.log(`geocoded ${looked} cities`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  await save();
  if (looked > 0) console.log(`geocoded ${looked} cities into metros`);
}
