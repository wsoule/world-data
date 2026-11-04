// Bureau of Economic Analysis state price levels and real incomes.
//
// SARPP: Regional Price Parities, how expensive each state is relative to the US average (100),
// overall and for goods, housing, utilities and other services. The app divides wages and
// incomes by it to compare them at equal buying power ("adjust for cost of living").
// SARPI: real personal income and spending per person, already adjusted by the same parities.
//
// MARPP: the same price parities for metro areas, which US cities take from the metro they are
// in (see census-geo.ts for how a city is placed in its metro).
//
// All are CSVs inside zips from BEA's public bulk download; no API key.

import { execFileSync } from 'node:child_process';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { REAL_INCOME, RPP } from '../../src/data/external';
import type { ExternalColumn, ExternalPage } from '../lib/external';
import type { CityMetro } from './census-geo';

/** BEA bulk zips: SARPP holds the state tables, MARPP the metro-area price parities. */
const ZIPS = ['SARPP', 'MARPP'] as const;
const zipUrl = (name: string) =>
  `https://apps.bea.gov/regional/zip/${name}.zip`;
const TABLES = ['SARPP', 'SARPI'] as const;
type Table = (typeof TABLES)[number];

/** BEA line code → metric for each table. */
const LINES: Record<
  Table,
  Record<string, { id: number; key: string; header: string; format: string }>
> = {
  SARPP: {
    '1': {
      id: RPP.allItems,
      key: 'rppAllItems',
      header: 'Price Level (All Items)',
      format: 'floatNumberTenths',
    },
    '2': {
      id: RPP.goods,
      key: 'rppGoods',
      header: 'Price Level (Goods)',
      format: 'floatNumberTenths',
    },
    '3': {
      id: RPP.housing,
      key: 'rppHousing',
      header: 'Price Level (Housing Rents)',
      format: 'floatNumberTenths',
    },
    '4': {
      id: RPP.utilities,
      key: 'rppUtilities',
      header: 'Price Level (Utilities)',
      format: 'floatNumberTenths',
    },
    '5': {
      id: RPP.otherServices,
      key: 'rppOtherServices',
      header: 'Price Level (Other Services)',
      format: 'floatNumberTenths',
    },
  },
  SARPI: {
    '2': {
      id: REAL_INCOME.perCapitaIncome,
      key: 'realPerCapitaIncome',
      header: 'Real Personal Income per Person (2017 Dollars)',
      format: 'moneyWithCurrency',
    },
    '4': {
      id: REAL_INCOME.perCapitaSpending,
      key: 'realPerCapitaSpending',
      header: 'Real Consumer Spending per Person (2017 Dollars)',
      format: 'moneyWithCurrency',
    },
  },
};

const PAGES: Record<
  Table,
  Pick<ExternalPage, 'slug' | 'title' | 'cats' | 'sources'>
> = {
  SARPP: {
    slug: 'regional-price-parities-by-state',
    title: 'Cost of Living by State (Regional Price Parities)',
    cats: ['economics'],
    sources: [
      {
        url: 'https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area',
        name: 'Regional Price Parities by State and Metro Area - US Bureau of Economic Analysis',
      },
    ],
  },
  SARPI: {
    slug: 'real-personal-income-by-state',
    title: 'Real Personal Income by State',
    cats: ['economics'],
    sources: [
      {
        url: 'https://www.bea.gov/data/income-saving/real-personal-income-states',
        name: 'Real Personal Income for States and Metropolitan Areas - US Bureau of Economic Analysis',
      },
    ],
  },
};

const zipPath = (dir: string, name: string) => path.join(dir, `${name}.zip`);

/** Downloads BEA's bulk zips into `dir` (each skipped when already there unless `refresh`). */
export async function fetchBea(dir: string, refresh: boolean): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const name of ZIPS) {
    const f = zipPath(dir, name);
    if (!refresh) {
      try {
        await access(f);
        continue;
      } catch {
        // not cached yet
      }
    }
    const res = await fetch(zipUrl(name));
    if (!res.ok) throw new Error(`BEA ${name}: HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    // An error page instead of the archive must not land in the cache.
    if (body.subarray(0, 2).toString('latin1') !== 'PK')
      throw new Error(`BEA: ${zipUrl(name)} did not return a zip`);
    await writeFile(`${f}.tmp`, body);
    await rename(`${f}.tmp`, f);
    console.log(`cached BEA ${name}.zip`);
  }
}

/** Splits one CSV line, honouring double-quoted fields. */
function csvFields(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** One geography of a BEA table: its name and, per line code, a value per year. */
interface GeoSeries {
  name: string;
  lines: Map<string, Map<number, number>>;
}

/**
 * Reads the CSV whose name starts with `csvPrefix` (e.g. "SARPP_STATE_") from a BEA zip with the
 * system unzip, keyed by GeoFIPS (state FIPS + "000", or a metro's CBSA code).
 */
function readTable(zip: string, csvPrefix: string): Map<string, GeoSeries> {
  const name = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .split('\n')
    .find((n) => n.startsWith(csvPrefix) && n.endsWith('.csv'));
  if (name == null) throw new Error(`${zip}: no ${csvPrefix}*.csv inside`);
  const lines = execFileSync('unzip', ['-p', zip, name], {
    encoding: 'latin1',
    maxBuffer: 64 * 1024 * 1024,
  }).split(/\r?\n/);
  const head = csvFields(lines[0] ?? '');
  const years = head
    .map((h, i) => ({ year: Number(h), i }))
    .filter((y) => /^\d{4}$/.test(String(y.year)));
  const [iFips, iName, iLine] = ['GeoFIPS', 'GeoName', 'LineCode'].map((c) =>
    head.indexOf(c)
  );
  const out = new Map<string, GeoSeries>();
  for (const line of lines.slice(1)) {
    const f = csvFields(line);
    const fips = f[iFips] ?? '';
    const code = f[iLine] ?? '';
    if (!/^\d{5}$/.test(fips) || code === '') continue;
    const geo = out.get(fips) ?? {
      name: (f[iName] ?? '').replace(/\s*\*$/, ''),
      lines: new Map(),
    };
    out.set(fips, geo);
    const byYear = new Map<number, number>();
    for (const { year, i } of years) {
      const raw = f[i] ?? '';
      const v = Number(raw);
      if (raw !== '' && raw !== '(NA)' && Number.isFinite(v))
        byYear.set(year, v);
    }
    geo.lines.set(code, byYear);
  }
  return out;
}

/** Rows (identity fields plus one field per metric-year) and columns for one table's places. */
function buildRows(
  table: Table,
  places: { identity: Record<string, unknown>; geo: GeoSeries }[]
): Pick<ExternalPage, 'rows' | 'columns' | 'tables'> {
  const columns = new Map<string, ExternalColumn>();
  const rows = places.map(({ identity, geo }) => {
    const row: Record<string, unknown> = { ...identity };
    for (const [code, def] of Object.entries(LINES[table])) {
      for (const [year, v] of geo.lines.get(code) ?? []) {
        const field = `${def.key}_${year}`;
        row[field] = v;
        columns.set(field, {
          id: def.id,
          field,
          dbField: def.key,
          year,
          header: def.header,
          format: def.format,
          unit: null,
        });
      }
    }
    return row;
  });
  const keys = Object.values(LINES[table]).map((d) => d.key);
  return {
    rows,
    columns: [...columns.values()],
    tables: [{ name: '', columns: keys }],
  };
}

const CITY_PAGE: Pick<ExternalPage, 'slug' | 'title' | 'cats' | 'sources'> = {
  slug: 'cost-of-living-by-city',
  title: 'Cost of Living by City (Metro Price Parities)',
  cats: ['economics'],
  sources: [
    {
      url: 'https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area',
      name: 'Regional Price Parities by State and Metro Area - US Bureau of Economic Analysis',
    },
    {
      url: 'https://geocoding.geo.census.gov/',
      name: 'Census Geocoder (metro area of each city) - US Census Bureau',
    },
  ],
};

/**
 * BEA topics as external pages: price levels and real income for states, and each US city's
 * metro price levels (`cityMetros` from census-geo.ts; cities outside a metro get none). Empty
 * when the zips have not been fetched.
 */
export async function beaPages(
  dir: string,
  cityMetros: readonly CityMetro[] | null
): Promise<ExternalPage[]> {
  const pages: ExternalPage[] = [];
  const state = zipPath(dir, 'SARPP');
  try {
    await access(state);
  } catch {
    console.warn(`BEA zips not cached in ${dir}; run web:data-fetch`);
    return pages;
  }
  for (const table of TABLES) {
    const geos = readTable(state, `${table}_STATE_`);
    // State rows only: 2-digit FIPS followed by 000, not the US total (00000).
    const places = [...geos]
      .filter(([fips]) => /^\d{2}000$/.test(fips) && fips !== '00000')
      .map(([fips, geo]) => ({
        identity: { state: geo.name, fips: fips.slice(0, 2) },
        geo,
      }));
    pages.push({
      ...PAGES[table],
      type: 'state',
      // The CSVs carry no release date; the years themselves say how current the data is.
      updated: null,
      ...buildRows(table, places),
    });
  }

  const metro = zipPath(dir, 'MARPP');
  let haveMetro = true;
  try {
    await access(metro);
  } catch {
    haveMetro = false;
  }
  if (haveMetro && cityMetros != null) {
    const geos = readTable(metro, 'MARPP_MSA_');
    const places = cityMetros.flatMap((c) => {
      const geo = c.cbsa == null ? undefined : geos.get(c.cbsa);
      return geo == null
        ? []
        : [{ identity: { slug: c.id, city: c.city, code: c.code }, geo }];
    });
    pages.push({
      ...CITY_PAGE,
      type: 'city',
      updated: null,
      ...buildRows('SARPP', places),
    });
  }
  return pages;
}
