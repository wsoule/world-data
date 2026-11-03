// Census Bureau American Community Survey 5-year estimates (2020–2024) for states, counties and
// US cities: median rent and home value, median household income, commute time, broadband,
// poverty and college degrees.
//
// The Census data API now needs a key, so this reads the keyless table-based Summary File: one
// pipe-delimited file per table holding every geography. Rows are kept for plain states
// (GEO_ID 0400000US…), counties (0500000US…) and places (1600000US…, joined to our cities by the
// place code census-geo.ts records). Negative sentinel codes (-666666666 …) mean no estimate.
// Census caps medians: rent at $3,501 and home value at $2,000,001 stand for "that or more",
// which the metric names say since a handful of expensive cities sit at the cap.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ACS } from '../../src/data/external';
import { cachedDownload, isHtml } from '../lib/download';
import {
  type ExternalMetric,
  type ExternalPage,
  pageFromObservations,
} from '../lib/external';
import { FIPS_USPS } from '../lib/states';
import type { CityMetro } from './census-geo';

const YEAR = 2024;
const BASE = `https://www2.census.gov/programs-surveys/acs/summary_file/${YEAR}/table-based-SF/data/5YRData`;
const TABLES = [
  'B25064',
  'B25077',
  'B19013',
  'B08013',
  'B08303',
  'B28002',
  'B17001',
  'B15003',
];

const METRICS: ExternalMetric[] = [
  {
    id: ACS.medianRent,
    key: 'acsMedianRent',
    header: 'Median Rent (Monthly; $3,501 Means $3,500 or More)',
    format: 'moneyWithCurrency',
    pol: -1,
  },
  {
    id: ACS.medianHomeValue,
    key: 'acsMedianHomeValue',
    header: 'Median Home Value ($2,000,001 Means $2M or More)',
    format: 'moneyWithCurrency',
    pol: -1,
  },
  {
    id: ACS.medianHouseholdIncome,
    key: 'acsMedianIncome',
    header: 'Median Household Income',
    format: 'moneyWithCurrency',
    pol: 1,
  },
  {
    id: ACS.commuteMinutes,
    key: 'acsCommute',
    header: 'Average Commute (Minutes)',
    format: 'floatNumberTenths',
    pol: -1,
  },
  {
    id: ACS.broadbandShare,
    key: 'acsBroadband',
    header: 'Homes with Broadband Internet (%)',
    format: 'percAlt',
    pol: 1,
  },
  {
    id: ACS.povertyRate,
    key: 'acsPoverty',
    header: 'Poverty Rate (%)',
    format: 'percAlt',
    pol: -1,
  },
  {
    id: ACS.bachelorsShare,
    key: 'acsBachelors',
    header: 'Adults 25+ with a Bachelor’s Degree or Higher (%)',
    format: 'percAlt',
    pol: 1,
  },
];

const file = (dir: string, table: string) =>
  path.join(dir, `acsdt5y${YEAR}-${table.toLowerCase()}.dat`);

export async function fetchAcs(dir: string, refresh: boolean): Promise<void> {
  for (const t of TABLES)
    await cachedDownload(
      `${BASE}/acsdt5y${YEAR}-${t.toLowerCase()}.dat`,
      file(dir, t),
      {
        refresh,
        valid: (b) => !isHtml(b) && b.subarray(0, 6).toString() === 'GEO_ID',
      }
    );
}

type Level = 'state' | 'county' | 'place';
/** Plain-geography GEO_ID prefixes; component rows (0400089US…, 04000C0US…) are skipped. */
const PREFIX: Record<Level, string> = {
  state: '0400000US',
  county: '0500000US',
  place: '1600000US',
};

/** Estimates of one table: level → geography code → variable (e.g. "E001") → value. */
type TableValues = Map<Level, Map<string, Map<string, number>>>;

async function readTable(
  dir: string,
  table: string
): Promise<TableValues | null> {
  let text: string;
  try {
    text = await readFile(file(dir, table), 'utf8');
  } catch {
    return null;
  }
  const lines = text.split('\n');
  const head = (lines[0] ?? '').trim().split('|');
  const out: TableValues = new Map();
  for (const line of lines.slice(1)) {
    const f = line.trim().split('|');
    const geo = f[0] ?? '';
    const level = (Object.keys(PREFIX) as Level[]).find((l) =>
      geo.startsWith(PREFIX[l])
    );
    if (level == null) continue;
    const code = geo.slice(PREFIX[level].length);
    const vars = new Map<string, number>();
    head.forEach((h, i) => {
      const m = /_(E\d{3})$/.exec(h);
      const v = Number(f[i]);
      // Estimates only; sentinels such as -666666666 mean "no estimate".
      if (m != null && f[i] !== '' && Number.isFinite(v) && v > -100_000_000)
        vars.set(m[1], v);
    });
    const byCode = out.get(level) ?? new Map();
    out.set(level, byCode);
    byCode.set(code, vars);
  }
  return out;
}

export async function acsPages(
  dir: string,
  cityMetros: readonly CityMetro[] | null
): Promise<ExternalPage[]> {
  const tables = new Map<string, TableValues>();
  for (const t of TABLES) {
    const v = await readTable(dir, t);
    if (v != null) tables.set(t, v);
  }
  if (tables.size === 0) return [];
  const get = (level: Level, code: string, table: string, v: string) =>
    tables.get(table)?.get(level)?.get(code)?.get(v) ?? null;
  const ratio = (a: number | null, b: number | null, scale = 100) =>
    a == null || b == null || b <= 0 ? null : (a / b) * scale;

  /** The seven metrics for one geography. */
  function values(level: Level, code: string): [string, number | null][] {
    const g = (t: string, v: string) => get(level, code, t, v);
    const bachelors = ['E022', 'E023', 'E024', 'E025'].map((v) =>
      g('B15003', v)
    );
    return [
      ['acsMedianRent', g('B25064', 'E001')],
      ['acsMedianHomeValue', g('B25077', 'E001')],
      ['acsMedianIncome', g('B19013', 'E001')],
      // Aggregate minutes ÷ workers who commute (not working from home).
      ['acsCommute', ratio(g('B08013', 'E001'), g('B08303', 'E001'), 1)],
      ['acsBroadband', ratio(g('B28002', 'E004'), g('B28002', 'E001'))],
      ['acsPoverty', ratio(g('B17001', 'E002'), g('B17001', 'E001'))],
      [
        'acsBachelors',
        bachelors.some((v) => v == null)
          ? null
          : ratio(
              bachelors.reduce((a, b) => (a ?? 0) + (b ?? 0), 0),
              g('B15003', 'E001')
            ),
      ],
    ];
  }

  const observe = (
    level: Level,
    code: string,
    place: string,
    identity: Record<string, unknown>
  ) =>
    values(level, code).flatMap(([key, value]) =>
      value == null ? [] : [{ place, identity, key, year: YEAR, value }]
    );
  const codesOf = (level: Level) => [
    ...(tables.get('B19013')?.get(level)?.keys() ?? []),
  ];

  const source = {
    url: 'https://www.census.gov/programs-surveys/acs',
    name: 'American Community Survey 5-Year Estimates, 2020–2024 - US Census Bureau',
  };
  const meta = (
    type: 'state' | 'county' | 'city',
    slug: string,
    title: string
  ) => ({
    type,
    slug,
    title,
    cats: ['economics'],
    sources: [source],
    updated: null,
  });

  const pages: ExternalPage[] = [];
  const states = codesOf('state').flatMap((fips) => {
    const code = FIPS_USPS[fips];
    return code == null
      ? []
      : observe('state', fips, code, { fips, code, state: code });
  });
  if (states.length > 0)
    pages.push(
      pageFromObservations(
        meta(
          'state',
          'housing-and-living-by-state',
          'Housing, Income and Commutes by State (Census)'
        ),
        METRICS,
        states
      )
    );
  const counties = codesOf('county').flatMap((fips) =>
    observe('county', fips, fips, { fips, county: fips })
  );
  if (counties.length > 0)
    pages.push(
      pageFromObservations(
        meta(
          'county',
          'housing-and-living-by-county',
          'Housing, Income and Commutes by County (Census)'
        ),
        METRICS,
        counties
      )
    );
  const cities = (cityMetros ?? []).flatMap((c) =>
    c.place == null
      ? []
      : observe('place', c.place, c.id, {
          slug: c.id,
          city: c.city,
          code: c.code,
        })
  );
  if (cities.length > 0)
    pages.push(
      pageFromObservations(
        meta(
          'city',
          'housing-and-living-by-city',
          'Housing, Income and Commutes by City (Census)'
        ),
        METRICS,
        cities
      )
    );
  return pages;
}
