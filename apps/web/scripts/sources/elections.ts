// US presidential election results by county, 2016–2024, and by state (the county returns
// summed): Republican and Democratic shares of all votes, the margin between them, and the
// winner as a category ("Republican" / "Democratic"), which the overlay can colour dots by.
// Every metric is neutral: the site does not call either party's result better.
//
// Source: Tony McGovern's county-level results compiled from news-agency returns (public CSVs
// on GitHub). The MIT Election Lab's official file needs a download form, so it is not used.
// Alaska reports by state house district, so its rows only count toward the state total.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ELECTIONS } from '../../src/data/external';
import { csvRecords, num } from '../lib/csv';
import { cachedDownload, isHtml } from '../lib/download';
import {
  type ExternalMetric,
  type ExternalPage,
  type Observation,
  pageFromObservations,
} from '../lib/external';
import { FIPS_USPS } from '../lib/states';

const BASE =
  'https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master';
const YEARS = [2016, 2020, 2024];

const METRICS: ExternalMetric[] = [
  {
    id: ELECTIONS.republicanShare,
    key: 'presRepublican',
    header: 'Republican Vote Share (President, %)',
    format: 'percAlt',
    pol: 0,
  },
  {
    id: ELECTIONS.democraticShare,
    key: 'presDemocratic',
    header: 'Democratic Vote Share (President, %)',
    format: 'percAlt',
    pol: 0,
  },
  {
    id: ELECTIONS.margin,
    key: 'presMargin',
    header: 'Presidential Margin (Republican minus Democratic, Points)',
    format: 'floatNumberTenths',
    pol: 0,
  },
  {
    id: ELECTIONS.winner,
    key: 'presWinner',
    header: 'Presidential Election Winner',
    format: '',
    pol: 0,
  },
];

const file = (dir: string, y: number) =>
  path.join(dir, `${y}_US_County_Level_Presidential_Results.csv`);

export async function fetchElections(
  dir: string,
  refresh: boolean
): Promise<void> {
  for (const y of YEARS)
    await cachedDownload(
      `${BASE}/${y}_US_County_Level_Presidential_Results.csv`,
      file(dir, y),
      {
        refresh,
        valid: (b) =>
          !isHtml(b) && b.subarray(0, 300).toString().includes('votes_gop'),
      }
    );
}

interface Votes {
  gop: number;
  dem: number;
  total: number;
}

/** County FIPS → votes for one year; the 2016 file names its columns differently. */
async function countyVotes(
  dir: string,
  y: number
): Promise<Map<string, Votes>> {
  const out = new Map<string, Votes>();
  let text: string;
  try {
    text = await readFile(file(dir, y), 'utf8');
  } catch {
    return out;
  }
  for (const r of csvRecords(text)) {
    const fips = (r.county_fips ?? r.combined_fips ?? '')
      .replace(/\.0$/, '')
      .padStart(5, '0');
    const gop = num(r.votes_gop);
    const dem = num(r.votes_dem);
    const total = num(r.total_votes);
    if (
      !/^\d{5}$/.test(fips) ||
      gop == null ||
      dem == null ||
      total == null ||
      total <= 0
    )
      continue;
    out.set(fips, { gop, dem, total });
  }
  return out;
}

/** The four metrics for one place and year. */
function observe(
  place: string,
  identity: Record<string, unknown>,
  year: number,
  v: Votes
): Observation[] {
  const rep = (v.gop / v.total) * 100;
  const dem = (v.dem / v.total) * 100;
  return [
    { place, identity, year, key: 'presRepublican', value: rep },
    { place, identity, year, key: 'presDemocratic', value: dem },
    { place, identity, year, key: 'presMargin', value: rep - dem },
    {
      place,
      identity,
      year,
      key: 'presWinner',
      value: v.gop > v.dem ? 'Republican' : 'Democratic',
    },
  ];
}

export async function electionPages(dir: string): Promise<ExternalPage[]> {
  const counties: Observation[] = [];
  const states: Observation[] = [];
  for (const y of YEARS) {
    const byCounty = await countyVotes(dir, y);
    const byState = new Map<string, Votes>();
    for (const [fips, v] of byCounty) {
      const code = FIPS_USPS[fips.slice(0, 2)];
      if (code == null) continue;
      counties.push(...observe(fips, { fips, county: fips, code }, y, v));
      const s = byState.get(code) ?? { gop: 0, dem: 0, total: 0 };
      s.gop += v.gop;
      s.dem += v.dem;
      s.total += v.total;
      byState.set(code, s);
    }
    for (const [code, v] of byState)
      states.push(...observe(code, { code, state: code }, y, v));
  }
  const source = {
    url: 'https://github.com/tonmcg/US_County_Level_Election_Results_08-24',
    name: 'US County Level Presidential Election Results, 2008–2024 (compiled from news-agency returns)',
  };
  const page = (type: 'state' | 'county', obs: Observation[]) =>
    pageFromObservations(
      {
        type,
        slug:
          type === 'state'
            ? 'presidential-election-results-by-state'
            : 'presidential-election-results-by-county',
        title:
          type === 'state'
            ? 'Presidential Election Results by State, 2016–2024'
            : 'Presidential Election Results by County, 2016–2024',
        cats: ['politics-government'],
        sources: [source],
        updated: null,
      },
      METRICS,
      obs
    );
  const pages: ExternalPage[] = [];
  if (states.length > 0) pages.push(page('state', states));
  if (counties.length > 0) pages.push(page('county', counties));
  return pages;
}
