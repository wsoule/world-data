// FBI Crime in the United States: violent, property, murder, burglary and vehicle theft rates per
// 100,000 people, for states (FBI estimates, Table 5) and US cities (offenses reported by each
// city's police, Table 8, turned into rates with the population the table gives). City figures
// depend on what each agency reported, so they are less complete than the state estimates.
//
// The Crime Data Explorer hands out short-lived signed links: ask for one, then fetch it at once.
// Both files are zipped Excel workbooks.

import { execFileSync } from 'node:child_process';
import { statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { FBI_CRIME } from '../../src/data/external';
import { cachedDownload, exists, isZip } from '../lib/download';
import {
  type ExternalMetric,
  type ExternalPage,
  type Observation,
  pageFromObservations,
  type SourceContext,
} from '../lib/external';
import { type Cell, readSheet } from '../lib/xlsx';

const YEARS = [2024, 2025];
const SIGNER = 'https://cde.ucr.cjis.gov/LATEST/s3/signedurl?key=';
const COLLECTIONS = {
  state: (y: number) => `cius/${y}/cius-estimations-${y}.zip`,
  city: (y: number) => `cius/${y}/offenses-known-to-le-${y}.zip`,
};

const METRICS: (ExternalMetric & { column: RegExp })[] = [
  {
    column: /^violent crime/i,
    id: FBI_CRIME.violent,
    key: 'fbiViolent',
    header: 'Violent Crime Rate (per 100K)',
    format: 'floatNumberTenths',
    pol: -1,
  },
  {
    column: /^property crime/i,
    id: FBI_CRIME.property,
    key: 'fbiProperty',
    header: 'Property Crime Rate (per 100K)',
    format: 'floatNumberTenths',
    pol: -1,
  },
  {
    column: /^murder/i,
    id: FBI_CRIME.murder,
    key: 'fbiMurder',
    header: 'Murder Rate (per 100K)',
    format: 'floatNumberTenths',
    pol: -1,
  },
  {
    column: /^burglary/i,
    id: FBI_CRIME.burglary,
    key: 'fbiBurglary',
    header: 'Burglary Rate (per 100K)',
    format: 'floatNumberTenths',
    pol: -1,
  },
  {
    column: /^motor\s*vehicle/i,
    id: FBI_CRIME.vehicleTheft,
    key: 'fbiVehicleTheft',
    header: 'Motor Vehicle Theft Rate (per 100K)',
    format: 'floatNumberTenths',
    pol: -1,
  },
];

const SOURCE = {
  url: 'https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/downloads',
  name: 'Crime in the United States - FBI Crime Data Explorer',
};

const zipFile = (dir: string, kind: 'state' | 'city', y: number) =>
  path.join(dir, `${kind}-${y}.zip`);

export async function fetchFbi(dir: string, refresh: boolean): Promise<void> {
  for (const y of YEARS)
    for (const kind of ['state', 'city'] as const) {
      const out = zipFile(dir, kind, y);
      if (!refresh && (await exists(out))) continue;
      const key = COLLECTIONS[kind](y);
      let signed: string | undefined;
      try {
        const res = await fetch(SIGNER + encodeURIComponent(key));
        const body = (await res.json()) as Record<string, string>;
        signed = body[key];
      } catch {
        signed = undefined;
      }
      if (signed == null) {
        console.warn(`FBI: no download link for ${key}`);
        continue;
      }
      await cachedDownload(signed, out, { refresh: true, valid: isZip });
    }
}

/** Text of a cell without footnote digits and line breaks ("Population1" → "Population"). */
const label = (c: Cell): string =>
  String(c ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\d+$/, '')
    .trim();

/** The first worksheet of the workbook in `zip` whose member name contains `table`. */
function tableRows(dir: string, zip: string, table: string): Cell[][] {
  const member = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .split('\n')
    // Only plain names like "CIUS_Table_5_….xlsx" (no quotes, no "..", no leading "/").
    .find(
      (n) =>
        n.includes(table) &&
        /^\w[\w.-]*(\/\w[\w.-]*)*\.xlsx$/.test(n) &&
        !n.includes('..')
    );
  if (member == null) return [];
  const xlsx = path.join(dir, `${path.basename(zip, '.zip')}-${table}.xlsx`);
  // No shell: the member name comes from a downloaded archive (and was checked to start
  // with a word character, so unzip cannot read it as an option).
  writeFileSync(
    xlsx,
    execFileSync('unzip', ['-p', zip, member], {
      maxBuffer: 512 * 1024 * 1024,
    })
  );
  // The extracted copy keeps the archive's date, so the topic stays dated by the download
  // (see fetchedOn in sources/index.ts), not by the last build.
  const { atime, mtime } = statSync(zip);
  utimesSync(xlsx, atime, mtime);
  return readSheet(xlsx);
}

/** Index of each metric's column in a header row; null when a column is missing. */
function columnsOf(head: Cell[]): Map<string, number> {
  const out = new Map<string, number>();
  head.forEach((c, i) => {
    const text = label(c);
    for (const m of METRICS)
      if (m.column.test(text) && !out.has(m.key)) out.set(m.key, i);
  });
  return out;
}

const headerIndex = (rows: Cell[][]) =>
  rows.findIndex((r) => r.some((c) => /^violent crime/i.test(label(c))));

/** State rates from Table 5: the "Rate per 100,000 inhabitants" row after each block's total. */
function stateObservations(
  rows: Cell[][],
  year: number,
  states: Map<string, string>
): Observation[] {
  const h = headerIndex(rows);
  if (h < 0) return [];
  const cols = columnsOf(rows[h]);
  const out: Observation[] = [];
  let state: string | null = null;
  let afterTotal = false;
  for (const r of rows.slice(h + 1)) {
    if (label(r[0]) !== '') state = label(r[0]);
    // States end their block in "State Total"; DC, a single city, in "Total".
    if (/^(state )?total$/i.test(label(r[1]))) afterTotal = true;
    else if (afterTotal && /^rate per 100,000/i.test(label(r[2]))) {
      afterTotal = false;
      const code = state == null ? undefined : states.get(state.toLowerCase());
      if (code == null) continue;
      for (const [key, i] of cols) {
        const v = r[i];
        if (typeof v === 'number')
          out.push({
            place: code,
            identity: { code, state: code },
            key,
            year,
            value: v,
          });
      }
    }
  }
  return out;
}

/** City rates from Table 8 counts and population, for cities matched by name and state. */
function cityObservations(
  rows: Cell[][],
  year: number,
  cities: Map<string, { id: string; city: string; code: string }>
): Observation[] {
  const h = headerIndex(rows);
  if (h < 0) return [];
  const head = rows[h];
  const cols = columnsOf(head);
  const iPop = head.findIndex((c) => /^population/i.test(label(c)));
  const out: Observation[] = [];
  let state = '';
  for (const r of rows.slice(h + 1)) {
    if (label(r[0]) !== '') state = label(r[0]).toLowerCase();
    const city = cities.get(`${state}|${label(r[1]).toLowerCase()}`);
    const pop = r[iPop];
    if (city == null || typeof pop !== 'number' || pop <= 0) continue;
    for (const [key, i] of cols) {
      const v = r[i];
      if (typeof v === 'number')
        out.push({
          place: city.id,
          identity: { slug: city.id, city: city.city, code: city.code },
          key,
          year,
          value: (v / pop) * 100_000,
        });
    }
  }
  return out;
}

export async function fbiPages(
  dir: string,
  ctx: SourceContext
): Promise<ExternalPage[]> {
  const states = new Map(
    ctx.known('state').map((s) => [s.name.toLowerCase(), s.id])
  );
  const cities = new Map(
    ctx.known('city').flatMap((c) => {
      const code = c.flag?.toUpperCase();
      if (code == null || c.sub == null) return [];
      const city = c.name.replace(/, [A-Z]{2}$/, '');
      return [
        [
          `${c.sub.toLowerCase()}|${city.toLowerCase()}`,
          { id: c.id, city, code },
        ],
      ];
    })
  );
  const stateObs: Observation[] = [];
  const cityObs: Observation[] = [];
  for (const y of YEARS) {
    const s = zipFile(dir, 'state', y);
    if (await exists(s))
      stateObs.push(
        ...stateObservations(tableRows(dir, s, 'Table_5'), y, states)
      );
    const c = zipFile(dir, 'city', y);
    if (await exists(c))
      cityObs.push(
        ...cityObservations(tableRows(dir, c, 'Table_8'), y, cities)
      );
  }
  const page = (type: 'state' | 'city', obs: Observation[]) =>
    pageFromObservations(
      {
        type,
        slug:
          type === 'state'
            ? 'crime-rates-by-state-fbi'
            : 'crime-rates-by-city-fbi',
        title:
          type === 'state'
            ? 'Crime Rates by State (FBI)'
            : 'Crime Rates by City (FBI)',
        cats: ['crime-safety'],
        sources: [SOURCE],
        updated: null,
      },
      METRICS,
      obs
    );
  const pages: ExternalPage[] = [];
  if (stateObs.length > 0) pages.push(page('state', stateObs));
  if (cityObs.length > 0) pages.push(page('city', cityObs));
  return pages;
}
