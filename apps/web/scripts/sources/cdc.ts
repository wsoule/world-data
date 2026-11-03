// CDC PLACES: model-based estimates of adult health by county (obesity, diabetes, smoking, no
// health insurance, mental distress and more), age-adjusted so places with older or younger
// populations compare fairly.
//
// Two releases are read: 2025 (mostly 2023 survey data, but without Kentucky and Pennsylvania)
// and 2024 (2022 data for every county). Each value keeps its own survey year, and the newer
// release wins where both give the same year. Keyless Socrata queries, cached as JSON.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { CDC_PLACES } from '../../src/data/external';
import { cachedDownload } from '../lib/download';
import {
  type ExternalMetric,
  type ExternalPage,
  type Observation,
  pageFromObservations,
} from '../lib/external';

/** Release datasets, oldest first so newer values overwrite. */
const RELEASES = [
  { id: 'fu4u-a9bh', label: '2024' },
  { id: 'swc5-untb', label: '2025' },
];

const MEASURES: (ExternalMetric & { measure: string })[] = [
  {
    measure: 'OBESITY',
    id: CDC_PLACES.obesity,
    key: 'cdcObesity',
    header: 'Adults with Obesity (%)',
    format: 'percAlt',
    pol: -1,
  },
  {
    measure: 'DIABETES',
    id: CDC_PLACES.diabetes,
    key: 'cdcDiabetes',
    header: 'Adults with Diabetes (%)',
    format: 'percAlt',
    pol: -1,
  },
  {
    measure: 'CSMOKING',
    id: CDC_PLACES.smoking,
    key: 'cdcSmoking',
    header: 'Adults Who Smoke (%)',
    format: 'percAlt',
    pol: -1,
  },
  {
    measure: 'ACCESS2',
    id: CDC_PLACES.uninsured,
    key: 'cdcUninsured',
    header: 'Adults 18–64 Without Health Insurance (%)',
    format: 'percAlt',
    pol: -1,
  },
  {
    measure: 'MHLTH',
    id: CDC_PLACES.mentalDistress,
    key: 'cdcMentalDistress',
    header: 'Adults with Frequent Mental Distress (%)',
    format: 'percAlt',
    pol: -1,
  },
  {
    measure: 'LPA',
    id: CDC_PLACES.inactivity,
    key: 'cdcInactivity',
    header: 'Adults with No Leisure-Time Exercise (%)',
    format: 'percAlt',
    pol: -1,
  },
  {
    measure: 'GHLTH',
    id: CDC_PLACES.poorHealth,
    key: 'cdcPoorHealth',
    header: 'Adults in Fair or Poor Health (%)',
    format: 'percAlt',
    pol: -1,
  },
  {
    measure: 'DEPRESSION',
    id: CDC_PLACES.depression,
    key: 'cdcDepression',
    header: 'Adults with Depression (%)',
    format: 'percAlt',
    pol: -1,
  },
  {
    measure: 'BINGE',
    id: CDC_PLACES.bingeDrinking,
    key: 'cdcBingeDrinking',
    header: 'Adults Who Binge Drink (%)',
    format: 'percAlt',
    pol: -1,
  },
  {
    measure: 'SLEEP',
    id: CDC_PLACES.shortSleep,
    key: 'cdcShortSleep',
    header: 'Adults Sleeping Under 7 Hours (%)',
    format: 'percAlt',
    pol: -1,
  },
  {
    measure: 'CHECKUP',
    id: CDC_PLACES.checkup,
    key: 'cdcCheckup',
    header: 'Adults with a Yearly Checkup (%)',
    format: 'percAlt',
    pol: 1,
  },
];

const file = (dir: string, release: string) =>
  path.join(dir, `places-county-${release}.json`);

function queryUrl(dataset: string): string {
  const list = MEASURES.map((m) => `'${m.measure}'`).join(',');
  const q = new URLSearchParams({
    $select: 'year,stateabbr,locationname,locationid,measureid,data_value',
    $where: `datavaluetypeid='AgeAdjPrv' AND measureid in(${list})`,
    $limit: '100000',
  });
  return `https://data.cdc.gov/resource/${dataset}.json?${q}`;
}

export async function fetchCdc(dir: string, refresh: boolean): Promise<void> {
  for (const r of RELEASES)
    await cachedDownload(queryUrl(r.id), file(dir, r.label), {
      refresh,
      valid: (b) => b.subarray(0, 1).toString() === '[',
    });
}

interface Row {
  year?: string;
  stateabbr?: string;
  locationname?: string;
  locationid?: string;
  measureid?: string;
  data_value?: string;
}

export async function cdcPages(dir: string): Promise<ExternalPage[]> {
  const observations: Observation[] = [];
  const keyOf = new Map(MEASURES.map((m) => [m.measure, m.key]));
  for (const r of RELEASES) {
    let rows: Row[];
    try {
      rows = JSON.parse(await readFile(file(dir, r.label), 'utf8')) as Row[];
    } catch {
      continue;
    }
    for (const row of rows) {
      const fips = row.locationid ?? '';
      const key = keyOf.get(row.measureid ?? '');
      const value = Number(row.data_value);
      const year = Number(row.year);
      if (!/^\d{5}$/.test(fips) || key == null || row.data_value == null)
        continue;
      if (!Number.isFinite(value) || !Number.isFinite(year)) continue;
      observations.push({
        place: fips,
        identity: { fips, county: row.locationname, code: row.stateabbr },
        key,
        year,
        value,
      });
    }
  }
  if (observations.length === 0) return [];
  return [
    pageFromObservations(
      {
        type: 'county',
        slug: 'health-of-adults-by-county',
        title: 'Health of Adults by County (CDC PLACES)',
        cats: ['health'],
        sources: [
          {
            url: 'https://www.cdc.gov/places/',
            name: 'PLACES: Local Data for Better Health - Centers for Disease Control and Prevention',
          },
        ],
        updated: null,
      },
      MEASURES,
      observations
    ),
  ];
}
