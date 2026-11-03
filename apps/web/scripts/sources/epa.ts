// EPA AirData annual air quality by county: the median and 90th-percentile Air Quality Index
// and how many days were good or unhealthy. Only counties with air monitors appear (about a
// third of them). The files name counties, not FIPS codes, so rows are joined to our counties by
// state and county name (see countyKey).

import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { EPA_AIR } from '../../src/data/external';
import { csvRecords, num } from '../lib/csv';
import { cachedDownload, exists, isZip } from '../lib/download';
import {
  countyKey,
  type ExternalMetric,
  type ExternalPage,
  type Observation,
  pageFromObservations,
  type SourceContext,
} from '../lib/external';

/** Complete years to publish; files are refreshed each June and December. */
const YEARS = [2023, 2024, 2025];

const METRICS: ExternalMetric[] = [
  {
    id: EPA_AIR.medianAqi,
    key: 'epaMedianAqi',
    header: 'Median Air Quality Index',
    format: 'floatNumber',
    pol: -1,
  },
  {
    id: EPA_AIR.aqi90th,
    key: 'epaAqi90th',
    header: 'Air Quality Index on Bad Days (90th Percentile)',
    format: 'floatNumber',
    pol: -1,
  },
  {
    id: EPA_AIR.goodDaysShare,
    key: 'epaGoodDays',
    header: 'Days with Good Air (%)',
    format: 'percAlt',
    pol: 1,
  },
  {
    id: EPA_AIR.unhealthyDays,
    key: 'epaUnhealthyDays',
    header: 'Days Unhealthy for Sensitive Groups or Worse',
    format: 'numberWithCommas',
    pol: -1,
  },
];

const zipFile = (dir: string, year: number) =>
  path.join(dir, `annual_aqi_by_county_${year}.zip`);

export async function fetchEpa(dir: string, refresh: boolean): Promise<void> {
  for (const year of YEARS)
    await cachedDownload(
      `https://aqs.epa.gov/aqsweb/airdata/annual_aqi_by_county_${year}.zip`,
      zipFile(dir, year),
      { refresh, valid: isZip }
    );
}

export async function epaPages(
  dir: string,
  ctx: SourceContext
): Promise<ExternalPage[]> {
  const byName = new Map(
    ctx
      .known('county')
      .map((c) => [`${(c.sub ?? '').toLowerCase()}|${countyKey(c.name)}`, c])
  );
  const observations: Observation[] = [];
  let unmatched = 0;
  for (const year of YEARS) {
    const zip = zipFile(dir, year);
    if (!(await exists(zip))) continue;
    const csv = execFileSync('unzip', ['-p', zip], { encoding: 'utf8' });
    for (const r of csvRecords(csv)) {
      const place = byName.get(
        `${r.State.toLowerCase()}|${countyKey(r.County)}`
      );
      const days = num(r['Days with AQI']);
      if (days == null || days <= 0) continue;
      if (place == null) {
        unmatched++;
        continue;
      }
      const identity = {
        fips: place.id,
        county: place.name.replace(/, [A-Z]{2}$/, ''),
        code: place.flag?.toUpperCase(),
      };
      const push = (key: string, value: number | null) => {
        if (value != null)
          observations.push({ place: place.id, identity, key, year, value });
      };
      push('epaMedianAqi', num(r['Median AQI']));
      push('epaAqi90th', num(r['90th Percentile AQI']));
      const good = num(r['Good Days']);
      push('epaGoodDays', good == null ? null : (good / days) * 100);
      const bad = [
        'Unhealthy for Sensitive Groups Days',
        'Unhealthy Days',
        'Very Unhealthy Days',
        'Hazardous Days',
      ].map((k) => num(r[k]) ?? 0);
      push(
        'epaUnhealthyDays',
        bad.reduce((a, b) => a + b, 0)
      );
    }
  }
  if (unmatched > 0)
    console.log(
      `EPA: ${unmatched} county-year rows matched no county (territories, Mexico)`
    );
  if (observations.length === 0) return [];
  return [
    pageFromObservations(
      {
        type: 'county',
        slug: 'air-quality-by-county',
        title: 'Air Quality by County (EPA)',
        cats: ['environment', 'health'],
        sources: [
          {
            url: 'https://aqs.epa.gov/aqsweb/airdata/download_files.html',
            name: 'Air Quality Statistics by County - US Environmental Protection Agency',
          },
        ],
        updated: null,
      },
      METRICS,
      observations
    ),
  ];
}
