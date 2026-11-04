// Bureau of Labor Statistics: unemployment rates (Local Area Unemployment Statistics) for states
// and counties, and the mean and median wage of all jobs (Occupational Employment and Wage
// Statistics) for states and metro areas, which US cities take from their metro.
//
// BLS answers 403 to anonymous clients, so downloads send a user agent with the contact address
// in DATA_CONTACT_EMAIL; without it this source is skipped. 2025 annual unemployment averages 11
// months: October 2025 was never collected (federal shutdown).

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { BLS } from '../../src/data/external';
import {
  cachedDownload,
  contactUserAgent,
  exists,
  isHtml,
  isZip,
} from '../lib/download';
import {
  type ExternalMetric,
  type ExternalPage,
  type Observation,
  pageFromObservations,
} from '../lib/external';
import { FIPS_USPS } from '../lib/states';
import { readSheet } from '../lib/xlsx';
import type { CityMetro } from './census-geo';

const STATE_SERIES =
  'https://download.bls.gov/pub/time.series/la/la.data.2.AllStatesU';
const COUNTY_YEARS = [24, 25];
const OEWS = { state: 'oesm25st', metro: 'oesm25ma' } as const;
const OEWS_YEAR = 2025;
const FIRST_STATE_YEAR = 2010;

const UNEMPLOYMENT: ExternalMetric = {
  id: BLS.unemployment,
  key: 'blsUnemployment',
  header: 'Unemployment Rate (%)',
  format: 'percAlt',
  pol: -1,
};
const WAGES: ExternalMetric[] = [
  {
    id: BLS.meanWage,
    key: 'blsMeanWage',
    header: 'Average Annual Wage, All Jobs',
    format: 'moneyWithCurrency',
    pol: 1,
  },
  {
    id: BLS.medianWage,
    key: 'blsMedianWage',
    header: 'Median Annual Wage, All Jobs',
    format: 'moneyWithCurrency',
    pol: 1,
  },
];

const SOURCE_LAUS = {
  url: 'https://www.bls.gov/lau/',
  name: 'Local Area Unemployment Statistics - US Bureau of Labor Statistics',
};
const SOURCE_OEWS = {
  url: 'https://www.bls.gov/oes/',
  name: 'Occupational Employment and Wage Statistics - US Bureau of Labor Statistics',
};

export async function fetchBls(dir: string, refresh: boolean): Promise<void> {
  const ua = contactUserAgent();
  if (ua == null) {
    console.warn(
      'BLS skipped: set DATA_CONTACT_EMAIL (BLS requires a contact address in the user agent)'
    );
    return;
  }
  const headers = { 'User-Agent': ua };
  await cachedDownload(STATE_SERIES, path.join(dir, 'la.data.2.AllStatesU'), {
    refresh,
    headers,
    valid: (b) => !isHtml(b) && b.subarray(0, 9).toString() === 'series_id',
  });
  for (const yy of COUNTY_YEARS)
    await cachedDownload(
      `https://www.bls.gov/lau/laucnty${yy}.xlsx`,
      path.join(dir, `laucnty${yy}.xlsx`),
      { refresh, headers, valid: isZip }
    );
  for (const name of Object.values(OEWS))
    await cachedDownload(
      `https://www.bls.gov/oes/special-requests/${name}.zip`,
      path.join(dir, `${name}.zip`),
      { refresh, headers, valid: isZip }
    );
}

/** Annual state unemployment rates from the LAUS time series (period M13 = annual average). */
async function stateUnemployment(dir: string): Promise<Observation[]> {
  let text: string;
  try {
    text = await readFile(path.join(dir, 'la.data.2.AllStatesU'), 'utf8');
  } catch {
    return [];
  }
  const out: Observation[] = [];
  for (const line of text.split('\n')) {
    const [series = '', year = '', period = '', value = ''] = line
      .split('\t')
      .map((x) => x.trim());
    const m = /^LAUST(\d{2})0000000000003$/.exec(series);
    const code = m == null ? undefined : FIPS_USPS[m[1]];
    const y = Number(year);
    const v = Number(value);
    if (code == null || period !== 'M13' || y < FIRST_STATE_YEAR) continue;
    if (value === '' || !Number.isFinite(v)) continue;
    out.push({
      place: code,
      identity: { code, state: code },
      key: UNEMPLOYMENT.key,
      year: y,
      value: v,
    });
  }
  return out;
}

/** Annual county unemployment rates from the laucntYY workbooks. */
async function countyUnemployment(dir: string): Promise<Observation[]> {
  const out: Observation[] = [];
  for (const yy of COUNTY_YEARS) {
    const file = path.join(dir, `laucnty${yy}.xlsx`);
    if (!(await exists(file))) continue;
    for (const row of readSheet(file)) {
      const [, st, co, name, year, , , , rate] = row;
      const fips = `${String(st ?? '').padStart(2, '0')}${String(co ?? '').padStart(3, '0')}`;
      if (!/^\d{5}$/.test(fips) || typeof rate !== 'number') continue;
      out.push({
        place: fips,
        identity: {
          fips,
          county: String(name ?? '').replace(/, [A-Z]{2}$/, ''),
          code: FIPS_USPS[fips.slice(0, 2)],
        },
        key: UNEMPLOYMENT.key,
        year: Number(year),
        value: rate,
      });
    }
  }
  return out;
}

/** All-occupation wage rows of one OEWS workbook: area code → [mean, median] annual wage. */
function oewsAllJobs(
  dir: string,
  name: string
): Map<string, [number | null, number | null]> {
  const out = new Map<string, [number | null, number | null]>();
  const zip = path.join(dir, `${name}.zip`);
  let member: string | undefined;
  try {
    member = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
      .split('\n')
      .find((n) => /^\w[\w-]*\/(state|MSA)_M\d{4}_dl\.xlsx$/.test(n));
  } catch {
    return out;
  }
  if (member == null) return out;
  const xlsx = path.join(dir, `${name}.xlsx`);
  // No shell: the member name comes from a downloaded archive (and was checked to start
  // with a word character, so unzip cannot read it as an option).
  writeFileSync(
    xlsx,
    execFileSync('unzip', ['-p', zip, member], {
      maxBuffer: 512 * 1024 * 1024,
    })
  );
  const rows = readSheet(xlsx);
  const head = (rows[0] ?? []).map((h) =>
    String(h ?? '')
      .trim()
      .toUpperCase()
  );
  const col = (k: string) => head.indexOf(k);
  const [iArea, iOcc, iMean, iMedian] = [
    'AREA',
    'OCC_CODE',
    'A_MEAN',
    'A_MEDIAN',
  ].map(col);
  const wage = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  for (const r of rows.slice(1)) {
    if (r[iOcc] !== '00-0000') continue;
    out.set(String(r[iArea] ?? '').padStart(2, '0'), [
      wage(r[iMean]),
      wage(r[iMedian]),
    ]);
  }
  return out;
}

export async function blsPages(
  dir: string,
  cityMetros: readonly CityMetro[] | null
): Promise<ExternalPage[]> {
  const pages: ExternalPage[] = [];
  const unemploymentPage = (type: 'state' | 'county', obs: Observation[]) =>
    pageFromObservations(
      {
        type,
        slug:
          type === 'state'
            ? 'unemployment-rate-by-state-bls'
            : 'unemployment-rate-by-county-bls',
        title:
          type === 'state'
            ? 'Unemployment Rate by State (BLS)'
            : 'Unemployment Rate by County (BLS)',
        cats: ['economics'],
        sources: [SOURCE_LAUS],
        updated: null,
      },
      [UNEMPLOYMENT],
      obs
    );
  const states = await stateUnemployment(dir);
  if (states.length > 0) pages.push(unemploymentPage('state', states));
  const counties = await countyUnemployment(dir);
  if (counties.length > 0) pages.push(unemploymentPage('county', counties));

  const wagePage = (type: 'state' | 'city', obs: Observation[]) =>
    pageFromObservations(
      {
        type,
        slug:
          type === 'state' ? 'average-wage-by-state' : 'average-wage-by-city',
        title:
          type === 'state'
            ? 'Average Wage by State (BLS)'
            : 'Average Wage by City (Metro Area, BLS)',
        cats: ['economics'],
        sources: [SOURCE_OEWS],
        updated: null,
      },
      WAGES,
      obs
    );
  const wageObs = (
    place: string,
    identity: Record<string, unknown>,
    w: [number | null, number | null]
  ) =>
    WAGES.flatMap((m, i) =>
      w[i] == null
        ? []
        : [
            {
              place,
              identity,
              key: m.key,
              year: OEWS_YEAR,
              value: w[i],
            },
          ]
    );
  const stateWages = oewsAllJobs(dir, OEWS.state);
  const stateObs = [...stateWages].flatMap(([fips, w]) => {
    const code = FIPS_USPS[fips];
    return code == null ? [] : wageObs(code, { code, state: code }, w);
  });
  if (stateObs.length > 0) pages.push(wagePage('state', stateObs));
  const metroWages = oewsAllJobs(dir, OEWS.metro);
  const cityObs = (cityMetros ?? []).flatMap((c) => {
    const w = c.cbsa == null ? undefined : metroWages.get(c.cbsa);
    return w == null
      ? []
      : wageObs(c.id, { slug: c.id, city: c.city, code: c.code }, w);
  });
  if (cityObs.length > 0) pages.push(wagePage('city', cityObs));
  return pages;
}
