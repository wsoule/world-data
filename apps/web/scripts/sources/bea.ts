// Bureau of Economic Analysis state price levels and real incomes.
//
// SARPP: Regional Price Parities, how expensive each state is relative to the US average (100),
// overall and for goods, housing, utilities and other services. The app divides wages and
// incomes by it to compare them at equal buying power ("adjust for cost of living").
// SARPI: real personal income and spending per person, already adjusted by the same parities.
//
// Both tables are CSVs inside one zip (SARPP.zip) from BEA's public bulk download; no API key.

import { execFileSync } from 'node:child_process';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { REAL_INCOME, RPP } from '../../src/data/external';
import type { ExternalColumn, ExternalPage } from '../lib/external';

const ZIP_URL = 'https://apps.bea.gov/regional/zip/SARPP.zip';
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
        url: 'https://www.bea.gov/data/income-saving/real-personal-income-states-and-metro-areas',
        name: 'Real Personal Income for States and Metropolitan Areas - US Bureau of Economic Analysis',
      },
    ],
  },
};

const zipPath = (dir: string) => path.join(dir, 'SARPP.zip');

/** Downloads BEA's bulk zip into `dir` (skipped when already there unless `refresh`). */
export async function fetchBea(dir: string, refresh: boolean): Promise<void> {
  await mkdir(dir, { recursive: true });
  const f = zipPath(dir);
  if (!refresh) {
    try {
      await access(f);
      return;
    } catch {
      // not cached yet
    }
  }
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`BEA: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  // An error page instead of the archive must not land in the cache.
  if (body.subarray(0, 2).toString('latin1') !== 'PK')
    throw new Error(`BEA: ${ZIP_URL} did not return a zip`);
  await writeFile(`${f}.tmp`, body);
  await rename(`${f}.tmp`, f);
  console.log('cached BEA SARPP.zip');
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

/** The state CSV inside a BEA zip, read with the system unzip. */
function readStateCsv(zip: string, table: Table): string {
  const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .split('\n')
    .filter((n) => n.startsWith(`${table}_STATE_`) && n.endsWith('.csv'));
  const name = names[0];
  if (name == null) throw new Error(`${zip}: no ${table}_STATE_*.csv inside`);
  return execFileSync('unzip', ['-p', zip, name], { encoding: 'latin1' });
}

/** BEA topics as external pages; empty when the zips have not been fetched. */
export async function beaPages(dir: string): Promise<ExternalPage[]> {
  const pages: ExternalPage[] = [];
  const zip = zipPath(dir);
  try {
    await access(zip);
  } catch {
    console.warn(`BEA SARPP.zip not cached in ${dir}; run web:data-fetch`);
    return pages;
  }
  for (const table of TABLES) {
    const lines = readStateCsv(zip, table).split(/\r?\n/);
    const head = csvFields(lines[0] ?? '');
    const years = head
      .map((h, i) => ({ year: Number(h), i }))
      .filter((y) => /^\d{4}$/.test(String(y.year)));
    const col = (name: string) => head.indexOf(name);
    const [iFips, iName, iLine] = [
      col('GeoFIPS'),
      col('GeoName'),
      col('LineCode'),
    ];

    const rows = new Map<string, Record<string, unknown>>();
    const columns = new Map<string, ExternalColumn>();
    for (const line of lines.slice(1)) {
      const f = csvFields(line);
      const def = LINES[table][f[iLine] ?? ''];
      const fips = f[iFips] ?? '';
      // State rows only: 2-digit FIPS followed by 000, not the US total (00000).
      if (def == null || !/^\d{2}000$/.test(fips) || fips === '00000') continue;
      const row = rows.get(fips) ?? {
        state: (f[iName] ?? '').replace(/\s*\*$/, ''),
        fips: fips.slice(0, 2),
      };
      rows.set(fips, row);
      for (const { year, i } of years) {
        const v = Number(f[i]);
        if (!Number.isFinite(v) || f[i] === '' || f[i] === '(NA)') continue;
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
    const keys = Object.values(LINES[table]).map((d) => d.key);
    pages.push({
      ...PAGES[table],
      type: 'state',
      // The CSVs carry no release date; the years themselves say how current the data is.
      updated: null,
      rows: [...rows.values()],
      columns: [...columns.values()],
      tables: [{ name: '', columns: keys }],
    });
  }
  return pages;
}
