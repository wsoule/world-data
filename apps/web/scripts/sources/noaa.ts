// NOAA nClimDiv climate averages for 1991–2020 by county and state: yearly, January and July
// mean temperature, yearly precipitation, and heating and cooling degree days (how much heating
// or air conditioning the climate calls for). Temperature and rain have no better end, so they
// are neutral; fewer degree days mean a milder climate.
//
// Fixed-width text files, keyless. Each row starts with an 11-character id: NOAA state code
// (alphabetical, not FIPS), county FIPS, element and period, then twelve monthly values.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { NOAA_CLIMATE } from '../../src/data/external';
import { cachedDownload, isHtml } from '../lib/download';
import {
  type ExternalMetric,
  type ExternalPage,
  type Observation,
  pageFromObservations,
} from '../lib/external';

const BASE =
  'https://www.ncei.noaa.gov/monitoring-content/data/us/climdiv/monthly/current';
/** Period code of the 1991–2020 normals. */
const PERIOD = '0010';

/** NOAA state code → [state FIPS, USPS code]: alphabetical contiguous states, then HI and AK. */
const STATES: Record<string, [string, string]> = {
  '01': ['01', 'AL'],
  '02': ['04', 'AZ'],
  '03': ['05', 'AR'],
  '04': ['06', 'CA'],
  '05': ['08', 'CO'],
  '06': ['09', 'CT'],
  '07': ['10', 'DE'],
  '08': ['12', 'FL'],
  '09': ['13', 'GA'],
  '10': ['16', 'ID'],
  '11': ['17', 'IL'],
  '12': ['18', 'IN'],
  '13': ['19', 'IA'],
  '14': ['20', 'KS'],
  '15': ['21', 'KY'],
  '16': ['22', 'LA'],
  '17': ['23', 'ME'],
  '18': ['24', 'MD'],
  '19': ['25', 'MA'],
  '20': ['26', 'MI'],
  '21': ['27', 'MN'],
  '22': ['28', 'MS'],
  '23': ['29', 'MO'],
  '24': ['30', 'MT'],
  '25': ['31', 'NE'],
  '26': ['32', 'NV'],
  '27': ['33', 'NH'],
  '28': ['34', 'NJ'],
  '29': ['35', 'NM'],
  '30': ['36', 'NY'],
  '31': ['37', 'NC'],
  '32': ['38', 'ND'],
  '33': ['39', 'OH'],
  '34': ['40', 'OK'],
  '35': ['41', 'OR'],
  '36': ['42', 'PA'],
  '37': ['44', 'RI'],
  '38': ['45', 'SC'],
  '39': ['46', 'SD'],
  '40': ['47', 'TN'],
  '41': ['48', 'TX'],
  '42': ['49', 'UT'],
  '43': ['50', 'VT'],
  '44': ['51', 'VA'],
  '45': ['53', 'WA'],
  '46': ['54', 'WV'],
  '47': ['55', 'WI'],
  '48': ['56', 'WY'],
  '49': ['15', 'HI'],
  '50': ['02', 'AK'],
};

/** nClimDiv element files and how a year's value comes from the twelve months. */
const ELEMENTS = [
  { file: 'tmpc', how: 'temps' },
  { file: 'pcpn', how: 'sum', key: 'noaaPrecip' },
  { file: 'hddc', how: 'sum', key: 'noaaHeatingDays' },
  { file: 'cddc', how: 'sum', key: 'noaaCoolingDays' },
] as const;

const METRICS: ExternalMetric[] = [
  {
    id: NOAA_CLIMATE.annualTemp,
    key: 'noaaAnnualTemp',
    header: 'Average Temperature (°F)',
    format: 'floatNumberTenths',
    pol: 0,
  },
  {
    id: NOAA_CLIMATE.januaryTemp,
    key: 'noaaJanuaryTemp',
    header: 'Average January Temperature (°F)',
    format: 'floatNumberTenths',
    pol: 0,
  },
  {
    id: NOAA_CLIMATE.julyTemp,
    key: 'noaaJulyTemp',
    header: 'Average July Temperature (°F)',
    format: 'floatNumberTenths',
    pol: 0,
  },
  {
    id: NOAA_CLIMATE.annualPrecip,
    key: 'noaaPrecip',
    header: 'Yearly Precipitation (Inches)',
    format: 'floatNumberTenths',
    pol: 0,
  },
  {
    id: NOAA_CLIMATE.heatingDays,
    key: 'noaaHeatingDays',
    header: 'Heating Degree Days per Year',
    format: 'numberWithCommas',
    pol: -1,
  },
  {
    id: NOAA_CLIMATE.coolingDays,
    key: 'noaaCoolingDays',
    header: 'Cooling Degree Days per Year',
    format: 'numberWithCommas',
    pol: -1,
  },
];

const LEVELS = ['cy', 'st'] as const;
const local = (dir: string, element: string, level: string) =>
  path.join(dir, `climdiv-norm-${element}${level}.txt`);

export async function fetchNoaa(dir: string, refresh: boolean): Promise<void> {
  let stamp: string;
  try {
    const res = await fetch(`${BASE}/procdate.txt`);
    stamp = (await res.text()).trim();
    if (!/^\d{8}$/.test(stamp)) throw new Error(`bad procdate "${stamp}"`);
  } catch (err) {
    console.warn(`NOAA: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  for (const { file } of ELEMENTS)
    for (const level of LEVELS)
      await cachedDownload(
        `${BASE}/climdiv-norm-${file}${level}-v1.0.0-${stamp}`,
        local(dir, file, level),
        { refresh, valid: (b) => b.length > 1000 && !isHtml(b) }
      );
}

/** 1991–2020 rows of one file: place key (county FIPS or USPS code) → twelve monthly values. */
async function normals(
  dir: string,
  element: string,
  level: (typeof LEVELS)[number]
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  let text: string;
  try {
    text = await readFile(local(dir, element, level), 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n')) {
    const [id = '', ...rest] = line.trim().split(/\s+/);
    if (!id.endsWith(PERIOD)) continue;
    const months = rest.slice(0, 12).map(Number);
    // Missing values are -99.90 (temperature), -9.99 (precipitation) or -9999 (degree days).
    if (
      months.length !== 12 ||
      months.some(
        (v) => !Number.isFinite(v) || v === -99.9 || v === -9.99 || v <= -999
      )
    )
      continue;
    if (level === 'cy' && id.length === 11) {
      const state = STATES[id.slice(0, 2)];
      if (state != null) out.set(`${state[0]}${id.slice(2, 5)}`, months);
    } else if (
      level === 'st' &&
      id.length === 10 &&
      Number(id.slice(0, 3)) <= 50
    ) {
      const state = STATES[id.slice(1, 3)];
      if (state != null) out.set(state[1], months);
    }
  }
  return out;
}

export async function noaaPages(dir: string): Promise<ExternalPage[]> {
  const pages: ExternalPage[] = [];
  for (const level of LEVELS) {
    const observations: Observation[] = [];
    for (const el of ELEMENTS) {
      for (const [place, months] of await normals(dir, el.file, level)) {
        const identity =
          level === 'cy'
            ? { fips: place, county: place, code: null }
            : { state: place, code: place };
        const push = (key: string, value: number) =>
          observations.push({ place, identity, key, year: null, value });
        if (el.how === 'temps') {
          push('noaaAnnualTemp', months.reduce((a, b) => a + b, 0) / 12);
          push('noaaJanuaryTemp', months[0]);
          push('noaaJulyTemp', months[6]);
        } else
          push(
            el.key,
            months.reduce((a, b) => a + b, 0)
          );
      }
    }
    if (observations.length === 0) continue;
    pages.push(
      pageFromObservations(
        {
          type: level === 'cy' ? 'county' : 'state',
          slug: level === 'cy' ? 'climate-by-county' : 'climate-by-state',
          title:
            level === 'cy'
              ? 'Climate by County (1991–2020 Averages)'
              : 'Climate by State (1991–2020 Averages)',
          cats: ['environment'],
          sources: [
            {
              url: 'https://www.ncei.noaa.gov/access/monitoring/climate-at-a-glance/',
              name: 'nClimDiv Climate Division Data - NOAA National Centers for Environmental Information',
            },
          ],
          updated: null,
        },
        METRICS,
        observations
      )
    );
  }
  return pages;
}
